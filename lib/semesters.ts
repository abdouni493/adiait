/**
 * =============================================================================
 *  LE SEMESTRE ET SES CARTES — la saison du club, lue depuis ce qui a été écrit
 * =============================================================================
 *
 * Ce module ne décide rien et n'écrit rien : il RÉPOND. Les présences, les
 * paiements et les soldes sont déjà en base ; ici on les range dans la forme
 * que les écrans réclament — un semestre, ses catégories, leurs emplois du
 * temps, les cartes de chacun, et les chevaliers de chaque carte.
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
 * ET LA FIN DU SEMESTRE EST UN TRAVAIL FINI, PAS UNE DATE. Tant qu'une carte
 * ouverte n'a pas donné ses séances, le semestre ne ferme pas : sa date de fin
 * est simplement repoussée au jour de la dernière présence.
 */

import type { Database } from "@/lib/store/data";
import type { EmploiCarte, ScheduleSession, Semester, Student } from "@/lib/types";
import {
  cycleSizeOf,
  dayKeyOf,
  isFreeSub,
  sessionClassIds,
  soldFor,
  todayIso,
} from "@/lib/helpers";
import { money, positiveMoney } from "@/lib/utils";

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

// ---------------------------------------------------------------------------
//  3. Le semestre
// ---------------------------------------------------------------------------

/** Les semestres, du plus récent au plus ancien. */
export function semestersOf(db: Database): Semester[] {
  return [...db.semesters].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function semesterById(db: Database, id?: string): Semester | undefined {
  return id ? db.semesters.find((s) => s.id === id) : undefined;
}

/**
 * LE SEMESTRE EN COURS — celui dans lequel on travaille aujourd'hui.
 *
 * C'est le plus récent qui n'est pas encore CLOS : un semestre dont la date de
 * fin est passée mais dont une carte court encore reste le semestre courant,
 * parce que c'est précisément là que le travail restant se fait.
 */
export function activeSemester(db: Database, day = todayIso()): Semester | undefined {
  const open = semestersOf(db).filter((s) => !s.closedAt);
  return (
    open.find((s) => s.startDate <= day && day <= s.endDate) ??
    // Passé la date de fin mais pas encore clos : il vit toujours.
    open.find((s) => s.startDate <= day) ??
    // À venir : le club l'a créé d'avance.
    [...open].reverse().find((s) => s.startDate > day)
  );
}

/** Les emplois du temps d'un semestre (les archivés compris, pour l'historique). */
export function sessionsOfSemester(
  db: Database,
  semesterId: string,
  opts: { includeArchived?: boolean } = {},
): ScheduleSession[] {
  return db.sessions.filter(
    (s) => s.semesterId === semesterId && (opts.includeArchived || !s.archivedAt),
  );
}

export type SemesterState = "upcoming" | "running" | "overdue" | "closed";

export interface SemesterProgress {
  state: SemesterState;
  /** les emplois du temps du semestre */
  sessions: number;
  /** ceux dont toutes les cartes ouvertes sont closes */
  finished: number;
  /** ceux qui ont encore une carte en cours */
  pending: number;
  /** le jour de la dernière séance tenue, tous emplois confondus */
  lastSeanceDate?: string;
  /** la date de fin déborde : la dernière séance tombe après elle */
  overrun: boolean;
  /** ce que la date de fin devrait devenir pour couvrir tout le travail */
  suggestedEndDate?: string;
  /** tout est fini : le semestre peut être déclaré clos */
  completable: boolean;
}

/**
 * OÙ EN EST UN SEMESTRE.
 *
 * `running`  : on est dedans, et il reste du travail ;
 * `overdue`  : sa date de fin est passée mais une carte court encore — il ne
 *              ferme pas, sa date de fin sera repoussée ;
 * `closed`   : toutes les cartes de tous ses emplois sont closes ;
 * `upcoming` : il n'a pas encore commencé.
 */
export function semesterProgress(db: Database, semester: Semester, day = todayIso()): SemesterProgress {
  const sessions = sessionsOfSemester(db, semester.id);
  let finished = 0;
  let pending = 0;
  let last: string | undefined;

  for (const session of sessions) {
    const views = carteLayout(db, session.id);
    for (const v of views) {
      const end = v.endDate ?? v.seances[v.seances.length - 1]?.date;
      if (end && (!last || end > last)) last = end;
    }
    // Un emploi est fini quand sa DERNIÈRE carte est close : plus rien ne
    // court, et le moteur n'en ouvrira pas d'autre passé la date de fin.
    const lastView = views[views.length - 1];
    if (!lastView) {
      // Aucune carte ouverte : rien à attendre de cet emploi.
      finished += 1;
    } else if (lastView.complete) {
      finished += 1;
    } else {
      pending += 1;
    }
  }

  const past = day > semester.endDate;
  const overrun = !!last && last > semester.endDate;
  const completable = sessions.length > 0 && pending === 0 && past;

  const state: SemesterState = semester.closedAt
    ? "closed"
    : day < semester.startDate
      ? "upcoming"
      : past
        ? "overdue"
        : "running";

  return {
    state,
    sessions: sessions.length,
    finished,
    pending,
    lastSeanceDate: last,
    overrun,
    suggestedEndDate: overrun ? last : undefined,
    completable,
  };
}

/**
 * LE POINTAGE EST-IL FERMÉ AUJOURD'HUI ?
 *
 * Il l'est quand le dernier semestre a été CLOS et qu'aucun autre n'a été créé
 * pour prendre la suite. On ne pointe pas une séance dans une saison terminée :
 * elle n'appartiendrait à aucune carte, à aucune paie, à aucun compte.
 *
 * Un club qui n'a jamais créé de semestre n'est jamais bloqué : la nouveauté
 * n'éteint pas une application qui tournait très bien sans elle.
 */
export interface PresenceLock {
  locked: boolean;
  /** le semestre qui vient de se fermer, quand c'est lui qui bloque */
  semester?: Semester;
  reason?: string;
}

export function presenceLock(db: Database, day = todayIso()): PresenceLock {
  if (db.semesters.length === 0) return { locked: false };
  const open = db.semesters.filter((s) => !s.closedAt);
  // Un semestre ouvert qui couvre le jour, ou qui l'a déjà commencé : on
  // travaille dedans.
  if (open.some((s) => s.startDate <= day)) return { locked: false };
  // Rien d'ouvert qui ait commencé : soit tout est clos, soit le suivant n'a
  // pas encore commencé — dans les deux cas il n'y a rien à pointer.
  const lastClosed = [...db.semesters]
    .filter((s) => s.closedAt)
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .pop();
  const upcoming = open.find((s) => s.startDate > day);
  if (upcoming) {
    return {
      locked: true,
      semester: upcoming,
      reason: `Le semestre « ${upcoming.name} » ne commence que le ${upcoming.startDate}.`,
    };
  }
  return {
    locked: true,
    semester: lastClosed,
    reason: lastClosed
      ? `Le semestre « ${lastClosed.name} » est terminé. Créez le semestre suivant pour reprendre le pointage.`
      : "Aucun semestre en cours. Créez-en un pour reprendre le pointage.",
  };
}

// ---------------------------------------------------------------------------
//  4. Les totaux : chevaliers, gains, dettes
// ---------------------------------------------------------------------------

export interface MoneyTotals {
  /** combien de chevaliers distincts */
  students: number;
  /** ce qui est réellement RENTRÉ (cotisations, engagements, frais réglés) */
  gains: number;
  /** ce qui reste DÛ (soldes dans le rouge et frais impayés) */
  debts: number;
}

const EMPTY: MoneyTotals = { students: 0, gains: 0, debts: 0 };

/** Les identifiants de tarif d'un emploi du temps (l'archivé compris). */
export function subIdsOfSession(db: Database, sessionId: string): string[] {
  return db.subscriptions.filter((s) => s.sessionId === sessionId).map((s) => s.id);
}

/** Les chevaliers inscrits sur un emploi du temps, aujourd'hui. */
export function studentsOfSession(db: Database, sessionId: string): Student[] {
  const ids = new Set(subIdsOfSession(db, sessionId));
  return db.students
    .filter((st) => st.subscriptionIds.some((id) => ids.has(id)))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
}

/**
 * CE QU'UN CHEVALIER A VERSÉ ET CE QU'IL DOIT, SUR UN EMPLOI DU TEMPS PRÉCIS.
 *
 * Les gains comptent tout ce qui est ENTRÉ pour ce créneau : la cotisation
 * versée sur ses cartes, et les frais qui le désignent (l'engagement) une fois
 * réglés. Les dettes comptent ce qui MANQUE : son solde quand il est dans le
 * rouge, et ce qui reste dû sur ces mêmes frais.
 *
 * Un versement porté sur le salaire d'un père entraîneur est bien un gain : le
 * club sera payée le jour de la paie, en versant moins.
 */
export function studentSessionMoney(
  db: Database,
  studentId: string,
  sessionId: string,
): { gains: number; debts: number; sold: number } {
  const subIds = new Set(subIdsOfSession(db, sessionId));
  if (subIds.size === 0) return { gains: 0, debts: 0, sold: 0 };

  let gains = 0;
  for (const p of db.payments) {
    if (p.studentId !== studentId) continue;
    if (p.subscriptionId && subIds.has(p.subscriptionId)) {
      gains += p.amountPaid || 0;
      continue;
    }
    if (p.chargeId) {
      const charge = db.studentCharges.find((c) => c.id === p.chargeId);
      if (charge && charge.subscriptionId && subIds.has(charge.subscriptionId)) {
        gains += p.amountPaid || 0;
      }
    }
  }

  let sold = 0;
  let debts = 0;
  for (const id of subIds) {
    const balance = soldFor(db, studentId, id);
    sold += balance;
    debts += Math.max(0, -balance);
  }
  for (const c of db.studentCharges) {
    if (c.studentId !== studentId) continue;
    if (!c.subscriptionId || !subIds.has(c.subscriptionId)) continue;
    debts += positiveMoney(c.amount - (c.paidAmount ?? 0));
  }

  return { gains: money(gains), debts: money(debts), sold: money(sold) };
}

/** Les totaux d'UN emploi du temps : ses chevaliers, ce qui est rentré, ce qui
 *  reste dû. */
export function sessionTotals(db: Database, sessionId: string): MoneyTotals {
  const students = studentsOfSession(db, sessionId);
  let gains = 0;
  let debts = 0;
  // Les gains se lisent sur TOUS ceux qui ont payé, y compris ceux qui ont
  // quitté le groupe depuis : leur argent est entré, il ne s'efface pas.
  const subIds = new Set(subIdsOfSession(db, sessionId));
  const touched = new Set<string>(students.map((s) => s.id));
  for (const p of db.payments) {
    if (p.subscriptionId && subIds.has(p.subscriptionId)) touched.add(p.studentId);
  }
  for (const id of touched) {
    const m = studentSessionMoney(db, id, sessionId);
    gains += m.gains;
    // Seuls ceux qui sont ENCORE là doivent : une dette d'un chevalier parti
    // vit sur sa fiche, pas sur le compte du groupe.
    if (students.some((s) => s.id === id)) debts += m.debts;
  }
  return { students: students.length, gains: money(gains), debts: money(debts) };
}

/** Les totaux d'une carte : ses chevaliers, ce qu'elle a encaissé, ce qu'elle
 *  doit encore. */
export function carteTotals(db: Database, view: CarteView): MoneyTotals {
  const subIds = new Set(subIdsOfSession(db, view.carte.sessionId));
  const students = studentsOfSession(db, view.carte.sessionId);
  let gains = 0;
  let debts = 0;
  for (const p of db.payments) {
    if (!p.subscriptionId || !subIds.has(p.subscriptionId)) continue;
    if ((p.monthCode || "M1") !== view.carte.code) continue;
    gains += p.amountPaid || 0;
  }
  for (const st of students) {
    // Ce que la carte lui a coûté, face à ce qu'il y a versé.
    let consumed = 0;
    for (const s of view.seances) {
      const rec = db.attendance.find(
        (a) =>
          a.studentId === st.id &&
          a.sessionId === view.carte.sessionId &&
          dayKeyOf(a.timestamp) === s.date &&
          (a.slot ?? 0) === s.slot,
      );
      consumed += rec?.amountDeducted || 0;
    }
    let credited = 0;
    for (const p of db.payments) {
      if (p.studentId !== st.id) continue;
      if (!p.subscriptionId || !subIds.has(p.subscriptionId)) continue;
      if ((p.monthCode || "M1") !== view.carte.code) continue;
      credited += p.amountPaid || 0;
    }
    debts += positiveMoney(consumed - credited);
  }
  return { students: students.length, gains: money(gains), debts: money(debts) };
}

/** Les catégories qu'un semestre fait travailler, avec leurs emplois du temps. */
export interface SemesterCategory {
  classId: string;
  name: string;
  sessions: ScheduleSession[];
  totals: MoneyTotals;
}

export function semesterCategories(db: Database, semesterId: string): SemesterCategory[] {
  const sessions = sessionsOfSemester(db, semesterId);
  const byClass = new Map<string, ScheduleSession[]>();
  for (const s of sessions) {
    const ids = sessionClassIds(s);
    // Un emploi sans catégorie se range sous une entrée sans nom plutôt que de
    // disparaître de l'écran.
    for (const cid of ids.length > 0 ? ids : [""]) {
      byClass.set(cid, [...(byClass.get(cid) ?? []), s]);
    }
  }
  return [...byClass.entries()]
    .map(([classId, list]) => {
      const seen = new Set<string>();
      let gains = 0;
      let debts = 0;
      for (const s of list) {
        const t = sessionTotals(db, s.id);
        gains += t.gains;
        debts += t.debts;
        for (const st of studentsOfSession(db, s.id)) seen.add(st.id);
      }
      return {
        classId,
        name: db.classes.find((c) => c.id === classId)?.name ?? "Sans catégorie",
        sessions: list,
        totals: { students: seen.size, gains: money(gains), debts: money(debts) },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Les totaux d'un semestre entier. */
export function semesterTotals(db: Database, semesterId: string): MoneyTotals {
  const sessions = sessionsOfSemester(db, semesterId);
  const seen = new Set<string>();
  let gains = 0;
  let debts = 0;
  for (const s of sessions) {
    const t = sessionTotals(db, s.id);
    gains += t.gains;
    debts += t.debts;
    for (const st of studentsOfSession(db, s.id)) seen.add(st.id);
  }
  return { students: seen.size, gains: money(gains), debts: money(debts) };
}

export { EMPTY as EMPTY_TOTALS };

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
    // On repart du jour d'après à chaque tour : la boucle avance d'un jour.
  }
  return after;
}

/** La taille d'une carte de cet emploi du temps, telle que son tarif la fixe. */
export function carteSizeOf(db: Database, sessionId: string): number {
  const sub = db.subscriptions.find((s) => s.sessionId === sessionId && !s.archivedAt);
  return cycleSizeOf(sub);
}

/** Cet emploi du temps est-il offert à ce chevalier ? (les cartes offertes ne
 *  produisent ni gain ni dette) */
export function offeredTo(student: Student, subscriptionId: string): boolean {
  return isFreeSub(student, subscriptionId);
}
