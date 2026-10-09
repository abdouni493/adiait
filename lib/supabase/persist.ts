"use client";

/**
 * L'ENREGISTREMENT AUTOMATIQUE.
 *
 * Aucun écran n'appelle jamais la base pour écrire. Il modifie le magasin — un
 * paiement encaissé, une présence pointée, un travailleur créé — et ce module,
 * abonné au magasin, s'occupe du reste. C'est ce qui permet aux ~35 actions
 * métier de rester des fonctions pures sur un objet en mémoire, et ce qui
 * garantit qu'AUCUNE ne peut être oubliée en chemin.
 *
 * COMMENT IL SAIT QUOI ENVOYER.
 *
 * Il garde une PHOTO de ce qu'il a envoyé la dernière fois (la « référence »),
 * posée au chargement puis remise à jour après chaque envoi. À chaque
 * modification, il compare l'état courant à cette photo, collection par
 * collection, ligne par ligne :
 *
 *   - une ligne qui n'existait pas, ou qui a changé -> elle part (`upsert`) ;
 *   - une ligne qui a disparu du magasin            -> elle est supprimée ;
 *   - tout le reste                                 -> rien ne part.
 *
 * Un pointage de présence n'envoie donc QUE la présence — pas les vingt mille
 * lignes du club.
 *
 * L'ÉCRITURE EST GROUPÉE (250 ms) : une action qui touche six collections d'un
 * coup — encaisser, débiter le solde, créditer la part de l'entraîneur, écrire
 * la caisse — ne produit qu'UN envoi.
 *
 * L'ORDRE COMPTE : les créations suivent l'ordre des dépendances (`WRITE_ORDER`,
 * un chevalier avant son inscription), les suppressions l'ordre inverse. Sans cela,
 * PostgreSQL refuserait une inscription dont le chevalier n'est pas encore arrivé.
 *
 * QUAND L'ENVOI ÉCHOUE — droits insuffisants, réseau coupé — l'écran garde ce
 * qu'il affiche, l'erreur est signalée une fois, et la référence n'avance PAS :
 * la modification repartira au prochain changement plutôt que d'être perdue en
 * silence.
 */

import { useData, type Database } from "@/lib/store/data";
import { supabase } from "./client";
import { sameRow, toRow, type Row } from "./mapping";
import {
  DELETE_ORDER,
  SCHOOL_ROW_ID,
  SCHOOL_TABLE,
  TABLES,
  WRITE_ORDER,
  type CollectionKey,
} from "./schema";

/** Le délai de regroupement. Assez court pour qu'une fermeture d'onglet
 *  immédiate ne perde rien, assez long pour absorber une rafale de clics. */
const FLUSH_DELAY = 250;

/** Combien de lignes partent dans une même requête. */
const CHUNK = 500;

type Snapshot = {
  school: Row;
  rows: Map<CollectionKey, Map<string, Row>>;
};

let started = false;
let unsubscribe: (() => void) | null = null;
/** Tant qu'on est en pause, les changements ne partent PAS — c'est le cas
 *  pendant qu'on REMPLIT le magasin depuis la base. */
let paused = true;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Database | null = null;
/** Ce qui est réellement en base, à notre connaissance. */
let baseline: Snapshot | null = null;
let flushing = false;
/** Résolue quand tout ce qui était en attente est parti. */
let settled: Promise<void> = Promise.resolve();
let resolveSettled: (() => void) | null = null;

/** Prévient l'application qu'un enregistrement a échoué. Posé par
 *  `SessionProvider`, pour que ce module n'ait pas à connaître les toasts. */
let onError: ((message: string) => void) | null = null;

export function onPersistError(handler: ((message: string) => void) | null): void {
  onError = handler;
}

// ---------------------------------------------------------------------------
//  La photo de référence
// ---------------------------------------------------------------------------

function snapshotOf(db: Database): Snapshot {
  const rows = new Map<CollectionKey, Map<string, Row>>();
  for (const key of WRITE_ORDER) {
    const spec = TABLES[key];
    const list = (db as unknown as Record<string, unknown>)[key];
    const map = new Map<string, Row>();
    if (Array.isArray(list)) {
      for (const item of list as Record<string, unknown>[]) {
        const row = toRow(item, spec);
        const id = row[spec.pk];
        if (id === undefined || id === null) continue;
        map.set(String(id), row);
      }
    }
    rows.set(key, map);
  }
  return { school: toRow(db.school as unknown as Record<string, unknown>, SCHOOL_TABLE), rows };
}

/**
 * DIT CE QUI EST DÉJÀ EN BASE.
 *
 * Appelé juste après la lecture initiale : sans cela, la première modification
 * ferait repartir le club entier comme si elle venait d'être créée.
 */
export function setBaseline(db: Database): void {
  baseline = snapshotOf(db);
}

// ---------------------------------------------------------------------------
//  L'envoi
// ---------------------------------------------------------------------------

/**
 * UN CHAMP EFFACÉ DOIT S'EFFACER EN BASE AUSSI.
 *
 * `toRow` n'envoie jamais un champ `undefined` — c'est ce qui permet à une
 * ligne de n'envoyer que ce qu'elle porte. Mais un `upsert` qui ne nomme pas
 * une colonne ne la TOUCHE PAS : un champ que l'écran venait de vider (la date
 * de début d'une carte recalculée, l'archivage d'un tarif remis en service)
 * restait donc en base avec son ancienne valeur, et revenait au rechargement
 * suivant comme si rien ne s'était passé.
 *
 * Toute colonne présente dans ce qui a été envoyé la fois d'avant, et absente
 * maintenant, part donc à `null`. La référence, elle, garde la forme sans
 * `null` : c'est celle que `snapshotOf` produit, et la comparaison suivante ne
 * doit pas croire la ligne encore modifiée.
 */
export function withClearedColumns(row: Row, before: Row | undefined, pk: string): Row {
  if (!before) return row;
  let out = row;
  for (const column of Object.keys(before)) {
    if (column === pk || column in row) continue;
    if (out === row) out = { ...row };
    out[column] = null;
  }
  return out;
}

/** Le code PostgreSQL d'une colonne NOT NULL qu'on voulait vider. */
const NOT_NULL_VIOLATION = "23502";

async function pushCollection(
  key: CollectionKey,
  next: Map<string, Row>,
  previous: Map<string, Row>,
): Promise<{ upserted: Row[]; failed: string | null }> {
  const spec = TABLES[key];
  const changed: Row[] = [];
  const outgoing: Row[] = [];

  for (const [id, row] of next) {
    const before = previous.get(id);
    if (before && sameRow(before, row)) continue;
    changed.push(row);
    outgoing.push(withClearedColumns(row, before, spec.pk));
  }
  if (!changed.length) return { upserted: [], failed: null };

  for (let i = 0; i < changed.length; i += CHUNK) {
    // `defaultToNull: false` : dans un envoi groupé, une ligne qui ne porte pas
    // une colonne que sa voisine porte reçoit la valeur PAR DÉFAUT de la
    // colonne, et non `null` — qui ferait refuser tout le paquet sur une
    // colonne NOT NULL.
    const send = (rows: Row[]) =>
      supabase().from(spec.table).upsert(rows, { onConflict: spec.pk, defaultToNull: false });
    let { error } = await send(outgoing.slice(i, i + CHUNK));
    if (error && error.code === NOT_NULL_VIOLATION) {
      // Une colonne obligatoire a été vidée : on renvoie sans les effacements,
      // pour que le reste de la ligne (une présence, un solde) parte quand même.
      console.warn(`[supabase] ${spec.table} : une colonne obligatoire ne peut pas être vidée.`);
      ({ error } = await send(changed.slice(i, i + CHUNK)));
    }
    if (error) {
      return { upserted: changed.slice(0, i), failed: `${spec.table} : ${error.message}` };
    }
  }
  return { upserted: changed, failed: null };
}

async function deleteCollection(
  key: CollectionKey,
  next: Map<string, Row>,
  previous: Map<string, Row>,
): Promise<{ removed: string[]; failed: string | null }> {
  const spec = TABLES[key];
  const gone = [...previous.keys()].filter((id) => !next.has(id));
  if (!gone.length) return { removed: [], failed: null };

  for (let i = 0; i < gone.length; i += CHUNK) {
    const slice = gone.slice(i, i + CHUNK);
    const { error } = await supabase().from(spec.table).delete().in(spec.pk, slice);
    if (error) {
      return { removed: gone.slice(0, i), failed: `${spec.table} : ${error.message}` };
    }
  }
  return { removed: gone, failed: null };
}

/**
 * Envoie l'écart entre le magasin et la référence.
 *
 * La référence n'avance QUE sur ce qui est effectivement passé : une collection
 * refusée reste « à envoyer », et repartira.
 */
async function push(db: Database): Promise<void> {
  if (!baseline) {
    // Rien n'a été lu : on ne sait pas ce qui est en base, et tout envoyer
    // écraserait un club entier. On pose la référence et on attend le
    // prochain changement.
    baseline = snapshotOf(db);
    return;
  }

  const next = snapshotOf(db);
  const failures: string[] = [];

  // L'établissement, puis les créations dans l'ordre des dépendances.
  if (!sameRow(baseline.school, next.school)) {
    const sendSchool = (row: Row) =>
      supabase()
        .from(SCHOOL_TABLE.table)
        .upsert({ ...row, id: SCHOOL_ROW_ID }, { onConflict: "id" });
    let { error } = await sendSchool(withClearedColumns(next.school, baseline.school, "id"));
    if (error && error.code === NOT_NULL_VIOLATION) ({ error } = await sendSchool(next.school));
    if (error) failures.push(`${SCHOOL_TABLE.table} : ${error.message}`);
    else baseline.school = next.school;
  }

  for (const key of WRITE_ORDER) {
    const nextRows = next.rows.get(key)!;
    const prevRows = baseline.rows.get(key)!;
    const { upserted, failed } = await pushCollection(key, nextRows, prevRows);
    for (const row of upserted) prevRows.set(String(row[TABLES[key].pk]), row);
    if (failed) failures.push(failed);
  }

  // Les suppressions ensuite, dans l'ordre inverse : on ne retire un chevalier
  // qu'une fois ses inscriptions parties.
  for (const key of DELETE_ORDER) {
    const nextRows = next.rows.get(key)!;
    const prevRows = baseline.rows.get(key)!;
    const { removed, failed } = await deleteCollection(key, nextRows, prevRows);
    for (const id of removed) prevRows.delete(id);
    if (failed) failures.push(failed);
  }

  if (failures.length) {
    const message = failures[0];
    console.error("[supabase] enregistrement refusé :", failures.join(" | "));
    onError?.(message);
  }
}

function schedule(): void {
  if (timer) return;
  // Une attente déjà en cours est CONSERVÉE : la remplacer laisserait le
  // promesse précédente pendante à jamais, et celui qui l'attendait avec elle.
  if (!resolveSettled) {
    settled = new Promise((resolve) => {
      resolveSettled = resolve;
    });
  }
  timer = setTimeout(() => void flush(), FLUSH_DELAY);
}

async function flush(): Promise<void> {
  timer = null;
  if (flushing) {
    // Un envoi est déjà en cours : le suivant partira derrière lui, avec l'état
    // le plus récent. Deux envois concurrents se marcheraient dessus.
    schedule();
    return;
  }
  const db = pending;
  pending = null;
  if (!db) {
    resolveSettled?.();
    resolveSettled = null;
    return;
  }

  flushing = true;
  try {
    await push(db);
  } catch (err) {
    console.error("[supabase] enregistrement", err);
    onError?.(err instanceof Error ? err.message : "Enregistrement impossible.");
  } finally {
    flushing = false;
    resolveSettled?.();
    resolveSettled = null;
    settled = Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
//  Le cycle de vie — appelé par `SessionProvider`
// ---------------------------------------------------------------------------

/** Commence à enregistrer. Appelé une fois quelqu'un connecté. */
export function startSync(): void {
  if (started) return;
  started = true;

  unsubscribe = useData.subscribe((state) => {
    if (paused) return;
    pending = state;
    schedule();
  });
}

export function stopSync(): void {
  unsubscribe?.();
  unsubscribe = null;
  started = false;
  paused = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
  baseline = null;
  resolveSettled?.();
  resolveSettled = null;
  settled = Promise.resolve();
}

/** Suspend l'enregistrement pendant que le magasin est rempli ou vidé. */
export function pauseSync(): void {
  paused = true;
}

/** Reprend l'enregistrement. */
export function resumeSync(): void {
  paused = false;
}

/** Résolue quand tout ce qui était en attente est bien parti. */
export function syncSettled(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    void flush();
  }
  return settled;
}
