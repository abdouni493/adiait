/**
 * =============================================================================
 *  LE PLACEMENT D'UN NOUVEAU CHEVALIER — sur quelle carte, à quelle séance
 * =============================================================================
 *
 * À la création, la réception choisit l'emploi du temps (le groupe), puis la
 * CARTE du groupe — la carte en cours ou une carte précédente — et la SÉANCE de
 * cette carte où le chevalier commence.
 *
 *  - CARTE COURANTE + SÉANCE DU JOUR : il commence normalement, comme avant.
 *  - UNE SÉANCE PASSÉE : toutes les séances tenues par le groupe depuis ce
 *    placement jusqu'à son jour d'arrivée sont à lui, mais restent « À
 *    RÉGULARISER ». Elles ne débitent rien, ne posent ni présence ni absence,
 *    et n'entrent dans aucune pénalité d'absence tant que la réception ne les
 *    a pas pointées depuis le tableau de bord ou l'écran Présences.
 *
 * RIEN N'EST STOCKÉ D'AUTRE QUE LE PLACEMENT LUI-MÊME. La liste des séances à
 * régulariser se DÉDUIT : une séance du groupe, dans la fenêtre, sur laquelle
 * le chevalier n'a aucun pointage. Dès qu'on la pointe (présent, absent ou
 * annulée), elle sort de la liste — et le point d'entrée du chevalier recule
 * d'autant (voir `enrollmentStart`), si bien qu'une fois tout réglé il entre
 * exactement à la carte et à la séance choisies.
 */

import type { Database } from "@/lib/store/data";
import type { Student, SubscriptionDates } from "@/lib/types";
import { carteLayout, currentCarte } from "@/lib/cartes";
import { attendanceOn, dayKeyOf } from "@/lib/helpers";

// ---------------------------------------------------------------------------
//  1. Ce que l'écran de création propose
// ---------------------------------------------------------------------------

/** Une séance du groupe que l'on peut choisir comme point de départ. */
export interface PlacementSeance {
  /** 0-based dans sa carte */
  index: number;
  /** YYYY-MM-DD — absent pour la séance à venir de la carte courante */
  date?: string;
  slot: number;
  /** la séance est AVANT le jour d'arrivée : la choisir crée des séances à régulariser */
  past: boolean;
  /** la séance où il entrerait de toute façon (séance du jour / prochaine) */
  normal: boolean;
}

/** Une carte du groupe, telle que l'écran de création la propose. */
export interface PlacementCarte {
  code: string;
  index: number;
  size: number;
  held: number;
  complete: boolean;
  current: boolean;
  startDate?: string;
  endDate?: string;
  seances: PlacementSeance[];
}

/**
 * Les cartes du groupe que la réception peut choisir : la carte courante et
 * toutes celles qui ont déjà tenu des séances, de la plus récente à la plus
 * ancienne. Un emploi sans carte (pas de tarif, séance libre) n'en rend aucune.
 *
 * `arrivalDay` est le jour où il arrive : une séance tenue CE jour-là est la
 * séance du jour (il la rejoint normalement), une séance tenue avant est
 * « passée ».
 */
export function placementCartes(
  db: Database,
  subscriptionId: string,
  arrivalDay: string,
): PlacementCarte[] {
  const sub = db.subscriptions.find((s) => s.id === subscriptionId);
  if (!sub) return [];
  const views = carteLayout(db, sub.sessionId);
  if (views.length === 0) return [];
  const current = currentCarte(db, sub.sessionId);

  const out: PlacementCarte[] = [];
  for (const v of views) {
    const isCurrent = v.carte.id === current?.carte.id;
    if (!isCurrent && v.held === 0) continue;
    const seances: PlacementSeance[] = v.seances.map((s, i) => ({
      index: i,
      date: s.date,
      slot: s.slot,
      past: s.date < arrivalDay,
      normal: false,
    }));
    // La séance du jour (déjà pointée pour le groupe) est celle qu'il rejoint
    // normalement ; sinon c'est la prochaine séance de la carte courante.
    if (isCurrent) {
      const today = seances.find((s) => s.date === arrivalDay);
      if (today) today.normal = true;
      else if (seances.length < v.size) {
        seances.push({ index: seances.length, slot: 0, past: false, normal: true });
      }
    }
    out.push({
      code: v.carte.code,
      index: v.carte.index,
      size: v.size,
      held: v.held,
      complete: v.complete,
      current: isCurrent,
      startDate: v.startDate,
      endDate: v.endDate,
      seances,
    });
  }
  // La carte courante d'abord, puis les précédentes de la plus récente à la plus ancienne.
  return out.sort((a, b) => (a.current === b.current ? b.index - a.index : a.current ? -1 : 1));
}

/** Le placement retenu à l'écran, pour un emploi du temps. */
export interface PlacementChoice {
  carteCode: string;
  seance: number;
  date?: string;
  slot: number;
}

/**
 * Les séances TENUES par le groupe dans la fenêtre d'un placement : depuis la
 * séance choisie (incluse) jusqu'au jour d'arrivée (exclu), dans l'ordre.
 */
export function placementWindow(
  db: Database,
  subscriptionId: string,
  from: { date: string; slot?: number },
  arrivalDay: string,
): PendingSeance[] {
  const sub = db.subscriptions.find((s) => s.id === subscriptionId);
  if (!sub) return [];
  const fromKey = seanceKey(from.date, from.slot ?? 0);
  const out: PendingSeance[] = [];
  for (const v of carteLayout(db, sub.sessionId)) {
    v.seances.forEach((s, i) => {
      if (seanceKey(s.date, s.slot) < fromKey || s.date >= arrivalDay) return;
      out.push({ date: s.date, slot: s.slot, carteCode: v.carte.code, seanceIndex: i });
    });
  }
  return out;
}

/**
 * Ce que la fiche écrit pour ce placement — rien quand il est « normal ».
 *
 * La liste des séances de la fenêtre est COPIÉE sur la fiche : les portails du
 * chevalier et de son parent ne lisent que SES présences (RLS), pas celles du
 * groupe, et doivent pourtant pouvoir dire quelles séances restent à régler.
 */
export function placementDates(
  db: Database,
  subscriptionId: string,
  choice: PlacementChoice | null | undefined,
  arrivalDay: string,
): Partial<SubscriptionDates> {
  if (!choice || !choice.date || choice.date >= arrivalDay) return {};
  return {
    placementCarteCode: choice.carteCode,
    placementSeance: choice.seance,
    placementDate: choice.date,
    placementSlot: choice.slot || undefined,
    placementSeances: placementWindow(
      db,
      subscriptionId,
      { date: choice.date, slot: choice.slot },
      arrivalDay,
    ).map((s) => ({ ...s, slot: s.slot || undefined })),
    // Le jour d'arrivée borne la fenêtre : ce qui est pointé avant est un
    // rattrapage, et recule son point d'entrée (voir `enrollmentStart`).
    subscribedAt: arrivalDay,
  };
}

/** Combien de séances un placement laisserait à régulariser (aperçu à l'écran). */
export function placementBacklogCount(
  db: Database,
  subscriptionId: string,
  choice: PlacementChoice | null | undefined,
  arrivalDay: string,
): number {
  if (!choice?.date || choice.date >= arrivalDay) return 0;
  return placementWindow(db, subscriptionId, { date: choice.date, slot: choice.slot }, arrivalDay)
    .length;
}

// ---------------------------------------------------------------------------
//  2. Les séances à régulariser
// ---------------------------------------------------------------------------

function seanceKey(date: string, slot: number): string {
  return `${date}#${String(slot).padStart(2, "0")}`;
}

function dayOf(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.length > 10 ? dayKeyOf(raw) : raw;
}

/** Une séance du groupe qui appartient au chevalier mais n'est pas encore réglée. */
export interface PendingSeance {
  date: string;
  slot: number;
  /** la carte du groupe qui porte cette séance (« M1 ») */
  carteCode: string;
  /** 0-based dans cette carte */
  seanceIndex: number;
}

/** Le placement d'un chevalier sur un emploi, et ce qu'il reste à régulariser. */
export interface PlacementStatus {
  studentId: string;
  subscriptionId: string;
  sessionId: string;
  carteCode: string;
  seance: number;
  date: string;
  slot: number;
  /** le jour où il a commencé normalement */
  arrivalDay: string;
  /** toutes les séances de la fenêtre (réglées ou non) */
  total: number;
  /** celles qui attendent encore un pointage */
  pending: PendingSeance[];
}

/**
 * Le placement d'UN chevalier sur UN emploi — `undefined` quand il a commencé
 * normalement (aucun placement sur une séance passée).
 */
export function placementStatus(
  db: Database,
  student: Student,
  subscriptionId: string,
): PlacementStatus | undefined {
  const dates = student.subscriptionDates?.[subscriptionId];
  const from = dates?.placementDate;
  const arrival = dayOf(dates?.subscribedAt) ?? dates?.startDate;
  if (!from || !arrival || from >= arrival) return undefined;
  const sub = db.subscriptions.find((s) => s.id === subscriptionId);
  if (!sub) return undefined;

  // La fenêtre copiée à la création fait foi (elle se lit aussi depuis les
  // portails) ; à défaut, elle se recalcule depuis les séances du groupe.
  const window: PendingSeance[] = dates?.placementSeances?.length
    ? dates.placementSeances.map((s) => ({ ...s, slot: s.slot ?? 0 }))
    : placementWindow(db, subscriptionId, { date: from, slot: dates?.placementSlot }, arrival);
  const total = window.length;
  const pending = window.filter(
    (s) => !attendanceOn(db, student.id, sub.sessionId, s.date, s.slot),
  );
  return {
    studentId: student.id,
    subscriptionId,
    sessionId: sub.sessionId,
    carteCode: dates?.placementCarteCode ?? pending[0]?.carteCode ?? "M1",
    seance: dates?.placementSeance ?? 0,
    date: from,
    slot: dates?.placementSlot ?? 0,
    arrivalDay: arrival,
    total,
    pending,
  };
}

/** Tous les placements d'un chevalier (un par emploi placé sur une séance passée). */
export function studentPlacements(db: Database, student: Student): PlacementStatus[] {
  const out: PlacementStatus[] = [];
  for (const subId of student.subscriptionIds) {
    const st = placementStatus(db, student, subId);
    if (st) out.push(st);
  }
  return out;
}

/** Tout ce qui reste à régulariser dans le club — pour les alertes. */
export function pendingPlacements(db: Database, sessionId?: string): PlacementStatus[] {
  const out: PlacementStatus[] = [];
  for (const student of db.students) {
    for (const st of studentPlacements(db, student)) {
      if (sessionId && st.sessionId !== sessionId) continue;
      if (st.pending.length > 0) out.push(st);
    }
  }
  return out;
}
