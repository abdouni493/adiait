/**
 * =============================================================================
 *  LES CARTES D'UN EMPLOI DU TEMPS — lues depuis ce qui a été pointé
 * =============================================================================
 *
 * Une carte est un PACK DE SÉANCES que le groupe vit. Elle n'appartient à rien
 * d'autre qu'à son emploi du temps : ni à une saison, ni à un calendrier, ni à
 * une date décidée d'avance. Elle naît quand le groupe commence à s'entraîner,
 * se ferme quand elle a donné ses séances, et la suivante s'ouvre derrière elle.
 * TOUT SEUL — personne n'a à la créer, ni à dire quand elle s'arrête.
 *
 * TROIS IDÉES, ET TOUT EN DÉCOULE.
 *
 *  1. UNE SÉANCE EST UN COUPLE (jour, rang) sur lequel au moins un pointage a
 *     été écrit. Un emploi qui tient le matin et le soir en a deux par journée,
 *     et elles se comptent pour deux.
 *
 *  2. UNE SÉANCE ANNULÉE POUR TOUT LE MONDE N'A PAS EU LIEU. Elle n'avance
 *     aucune carte, ne coûte rien à personne, et se rejoue la semaine suivante :
 *     c'est le DÉCALAGE, et il n'a besoin d'aucun mécanisme — il suffit de ne
 *     pas la compter.
 *
 *  3. LES CARTES SE PARTAGENT LES SÉANCES TENUES, DANS L'ORDRE. La carte 1
 *     prend les `size` premières, la carte 2 les `size` suivantes. Une carte
 *     est close quand elle a les siennes, et c'est ce jour-là — pas la date du
 *     calendrier — qui devient sa date de fin.
 *
 * Ce module ne décide rien et n'écrit rien : il RÉPOND. C'est `syncCartes()`
 * (dans le magasin) qui pose les lignes, en s'appuyant sur ce qu'on lit ici.
 */

import type { Database } from "@/lib/store/data";
import type { EmploiCarte, ScheduleSession } from "@/lib/types";
import { cycleSizeOf, dayKeyOf } from "@/lib/helpers";

// ---------------------------------------------------------------------------
//  1. Les séances d'un emploi du temps, telles qu'elles ont été pointées
// ---------------------------------------------------------------------------

/** Une séance réellement pointée sur un emploi du temps. */
export interface SeanceKey {
  /** YYYY-MM-DD */
  date: string;
  /** son rang dans la journée (0 = la seule, ou la première) */
  slot: number;
  /** combien de pointages y ont été écrits */
  marks: number;
  /**
   * ANNULÉE POUR TOUT LE GROUPE : chaque pointage de la séance dit « annulée ».
   * Elle n'a pas eu lieu — aucune carte n'avance, et le groupe la rejoue la
   * semaine suivante.
   */
  cancelled: boolean;
}

/**
 * Les séances d'UN emploi du temps, de la plus ancienne à la plus récente.
 *
 * Une journée qui tient deux séances en rend deux : elles se pointent, se
 * décomptent et se paient séparément, donc elles avancent la carte pour deux.
 */
export function sessionSeances(db: Database, sessionId: string): SeanceKey[] {
  const buckets = new Map<string, { date: string; slot: number; marks: number; cancelled: number }>();
  for (const a of db.attendance) {
    if (a.sessionId !== sessionId) continue;
    const date = dayKeyOf(a.timestamp);
    const slot = a.slot ?? 0;
    const key = `${date}#${slot}`;
    const row = buckets.get(key) ?? { date, slot, marks: 0, cancelled: 0 };
    row.marks += 1;
    if (a.status === "cancelled") row.cancelled += 1;
    buckets.set(key, row);
  }
  return [...buckets.values()]
    .map((r) => ({
      date: r.date,
      slot: r.slot,
      marks: r.marks,
      // Tous annulés = la séance n'a pas eu lieu. Un seul présent suffit à la
      // faire exister : le groupe s'est entraîné, la carte avance.
      cancelled: r.marks > 0 && r.cancelled === r.marks,
    }))
    .sort((a, b) => (a.date === b.date ? a.slot - b.slot : a.date.localeCompare(b.date)));
}

// ---------------------------------------------------------------------------
//  2. Les cartes d'un emploi du temps
// ---------------------------------------------------------------------------

/** Une carte, telle que les écrans la lisent : la ligne, plus ce que les
 *  présences en ont fait. */
export interface CarteView {
  carte: EmploiCarte;
  /** les séances tenues qui lui appartiennent, dans l'ordre */
  seances: SeanceKey[];
  /** combien elle en a (jamais plus que `size`) */
  held: number;
  size: number;
  /** le jour de sa première séance tenue — absent tant qu'elle n'a pas commencé */
  startDate?: string;
  /** le jour de la séance qui l'a complétée */
  endDate?: string;
  complete: boolean;
  /** la carte a commencé et n'est pas finie */
  running: boolean;
  /** les jours où la séance a été annulée pour tout le groupe, donc décalée */
  postponed: string[];
}

/** Les cartes d'un emploi du temps, dans l'ordre de leur rang. */
export function cartesOf(db: Database, sessionId: string): EmploiCarte[] {
  return db.emploiCartes
    .filter((c) => c.sessionId === sessionId)
    .sort((a, b) => a.index - b.index);
}

/**
 * LE PARTAGE DES SÉANCES ENTRE LES CARTES.
 *
 * On prend les séances TENUES de l'emploi, dans l'ordre, et on les distribue :
 * `size` à la première carte, `size` à la suivante, et ainsi de suite. Les
 * séances annulées pour tout le groupe ne sont pas distribuées — elles sont
 * simplement rattachées à la carte qui courait ce jour-là, pour que le décalage
 * se lise.
 *
 * Une séance pointée AVANT la date prévue de la première carte compte quand
 * même : ce que le comptoir a pointé a eu lieu, et la carte commence là.
 */
export function carteLayout(db: Database, sessionId: string): CarteView[] {
  const cartes = cartesOf(db, sessionId);
  if (cartes.length === 0) return [];

  const all = sessionSeances(db, sessionId);
  const held = all.filter((s) => !s.cancelled);
  const cancelled = all.filter((s) => s.cancelled);

  const views: CarteView[] = [];
  let cursor = 0;
  for (const carte of cartes) {
    const size = Math.max(1, Math.round(carte.size || 1));
    const mine = held.slice(cursor, cursor + size);
    cursor += mine.length;
    const complete = mine.length >= size;
    const startDate = mine[0]?.date;
    const endDate = complete ? mine[mine.length - 1]?.date : undefined;
    // Les annulations qui tombent DANS la fenêtre de la carte : après sa
    // première séance, et avant que la suivante ne prenne le relais.
    const floor = startDate ?? carte.plannedStartDate;
    const ceiling = endDate;
    const postponed = cancelled
      .filter((s) => s.date >= floor && (!ceiling || s.date <= ceiling))
      .map((s) => s.date);

    views.push({
      carte,
      seances: mine,
      held: mine.length,
      size,
      startDate,
      endDate,
      complete,
      running: mine.length > 0 && !complete,
      postponed: [...new Set(postponed)],
    });
  }
  return views;
}

/** La carte que le groupe est en train de vivre : la première non close. */
export function currentCarte(db: Database, sessionId: string): CarteView | undefined {
  const views = carteLayout(db, sessionId);
  return views.find((v) => !v.complete) ?? views[views.length - 1];
}

/** Les codes de carte qui EXISTENT sur cet emploi du temps (« M1 », « M2 »…). */
export function carteCodesOf(db: Database, sessionId: string): string[] {
  return cartesOf(db, sessionId).map((c) => c.code);
}

/** La taille d'une carte de cet emploi du temps, telle que son tarif la fixe. */
export function carteSizeOf(db: Database, sessionId: string): number {
  const sub = db.subscriptions.find((s) => s.sessionId === sessionId && !s.archivedAt);
  return cycleSizeOf(sub);
}

/**
 * LE PROCHAIN JOUR OÙ CET EMPLOI DU TEMPS TIENT SÉANCE, à partir d'une date.
 *
 * Sert à proposer la date de départ de la carte suivante : la carte 2 s'ouvre
 * sur le premier jour de créneau qui suit la dernière séance de la carte 1.
 */
export function nextSessionDay(session: ScheduleSession, after: string): string {
  const JS_DAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const days = new Set(session.days);
  if (days.size === 0) return after;
  const d = new Date(`${after}T12:00:00`);
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() + 1);
    if (days.has(JS_DAYS[d.getDay()])) return d.toLocaleDateString("fr-CA");
  }
  return after;
}

/**
 * CET EMPLOI DU TEMPS DOIT-IL TENIR DES CARTES ?
 *
 * Oui dès qu'il est vivant et TARIFÉ : un créneau sans prix ne vend aucune
 * carte, et lui en ouvrir une afficherait au comptoir un pack que personne ne
 * peut acheter. Un créneau archivé, lui, n'ouvre plus rien — mais ses cartes
 * déjà nées restent lisibles.
 */
export function carriesCartes(db: Database, session: ScheduleSession): boolean {
  if (session.archivedAt) return false;
  // Une séance libre se vend à l'unité, pas à la carte : elle n'en tient pas.
  if (session.isOpen) return false;
  return db.subscriptions.some((s) => s.sessionId === session.id && !s.archivedAt);
}
