"use client";

/**
 * L'ENREGISTREMENT AUTOMATIQUE DE LA DÉMONSTRATION.
 *
 * Ce module garde les noms de la réplication qu'il remplace, pour que rien
 * d'autre dans l'application n'ait à savoir que la base a disparu : on s'abonne
 * au magasin, on attend qu'il change, on range l'instantané.
 *
 * Comme avant, un écran n'a donc RIEN à faire pour que son travail survive : la
 * ligne qu'il ajoute, modifie ou supprime est enregistrée toute seule, et aucune
 * des ~35 actions du magasin ne peut être oubliée.
 *
 * L'écriture est GROUPÉE : une action qui réécrit six collections d'un coup ne
 * doit produire qu'un seul enregistrement, sinon une feuille de présence
 * pointée à la volée sérialiserait la base entière à chaque clic.
 */

import { useData, type Database } from "@/lib/store/data";
import { COLLECTION_ORDER } from "./collections";
import { writeSnapshot } from "./db";

/** Le délai de regroupement. Assez court pour qu'un rechargement immédiat
 *  retrouve tout, assez long pour absorber une rafale de modifications. */
const FLUSH_DELAY = 250;

let started = false;
let unsubscribe: (() => void) | null = null;
/** Tant qu'on est en pause, les changements du magasin ne sont PAS enregistrés
 *  — c'est le cas pendant qu'on le REMPLIT depuis l'instantané. */
let paused = true;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Database | null = null;
/** Résolue quand tout ce qui était en attente a été écrit. */
let settled: Promise<void> = Promise.resolve();
let resolveSettled: (() => void) | null = null;

function snapshot(db: Database): Database {
  const copy = { school: db.school } as Database;
  for (const key of COLLECTION_ORDER) {
    (copy as unknown as Record<string, unknown>)[key] = (db as unknown as Record<string, unknown>)[key];
  }
  return copy;
}

function flush(): void {
  timer = null;
  const db = pending;
  pending = null;
  if (db) writeSnapshot(db);
  resolveSettled?.();
  resolveSettled = null;
  settled = Promise.resolve();
}

/**
 * Commence à enregistrer. Appelé une fois l'utilisateur connecté — avant cela,
 * il n'y a rien à conserver.
 */
export function startSync(): void {
  if (started) return;
  started = true;

  unsubscribe = useData.subscribe((state) => {
    if (paused) return;
    pending = snapshot(state);
    if (!timer) {
      settled = new Promise((resolve) => {
        resolveSettled = resolve;
      });
      timer = setTimeout(flush, FLUSH_DELAY);
    }
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
  resolveSettled?.();
  resolveSettled = null;
  settled = Promise.resolve();
}

/** Suspend l'enregistrement pendant que le magasin est rempli ou vidé. */
export function pauseSync(): void {
  paused = true;
}

/** Reprend l'enregistrement. Ce qui vient d'être LU n'est pas réécrit
 *  aussitôt : le prochain vrai changement s'en chargera. */
export function resumeSync(): void {
  paused = false;
}

/** Résolue quand tout ce qui était en attente est bien rangé. */
export function syncSettled(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    flush();
  }
  return settled;
}
