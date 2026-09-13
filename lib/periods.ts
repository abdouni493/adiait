/**
 * =============================================================================
 *  LE RAPPORT D'UNE PÉRIODE — deux dates, et tout ce qui s'est joué entre elles
 * =============================================================================
 *
 * Il n'y a plus de « saison » à créer, à ouvrir et à fermer. Une période n'est
 * pas une chose qu'on déclare : c'est une QUESTION qu'on pose. « Du 15
 * septembre au 15 janvier, qu'est-ce qui est rentré, et qui doit encore ? » On
 * donne deux dates, et l'écran répond — par catégorie, puis par emploi du
 * temps, puis chevalier par chevalier.
 *
 * CE QUI SE COMPTE SUR LA FENÊTRE, ET CE QUI SE COMPTE AUJOURD'HUI. La
 * distinction est la seule chose subtile de ce module, et elle est volontaire :
 *
 *   • LES GAINS sont un FLUX : ce qui est entré en caisse ENTRE LES DEUX DATES.
 *     Un versement du 3 octobre appartient à toute période qui contient le
 *     3 octobre, et à aucune autre.
 *   • LES DETTES sont un ÉTAT : ce qui reste dû AUJOURD'HUI. Une dette n'a pas
 *     de date — elle dure jusqu'à ce qu'on la règle, et la réclamer sur une
 *     fenêtre passée n'aurait aucun sens au comptoir.
 *   • LES CHEVALIERS sont ceux que la période a CONCERNÉS : ceux qui y ont été
 *     pointés ou y ont payé, plus ceux qui sont inscrits aujourd'hui quand la
 *     fenêtre touche le jour présent.
 *
 * Les MODÈLES DE PÉRIODE (« Semestre 1 », « Stage d'été ») ne sont rien d'autre
 * que deux dates qu'on a nommées pour ne pas les retaper. Ils ne créent rien,
 * ne ferment rien, et les effacer n'efface aucune donnée.
 */

import type { Database } from "@/lib/store/data";
import type { PeriodTemplate, ScheduleSession, Student } from "@/lib/types";
import { dayKeyOf, sessionClassIds, soldFor, todayIso } from "@/lib/helpers";
import { money, positiveMoney } from "@/lib/utils";

// ---------------------------------------------------------------------------
//  1. La fenêtre
// ---------------------------------------------------------------------------

/** Les deux dates de la question posée (YYYY-MM-DD, bornes comprises). */
export interface PeriodWindow {
  from: string;
  to: string;
}

/** Une date tombe-t-elle dans la fenêtre ? Les bornes en font partie. */
export function inWindow(window: PeriodWindow | undefined, day?: string): boolean {
  if (!window) return true;
  if (!day) return false;
  const d = day.length > 10 ? dayKeyOf(day) : day;
  return d >= window.from && d <= window.to;
}

/** La fenêtre contient-elle aujourd'hui ? (ce qui rend l'effectif d'aujourd'hui
 *  pertinent) */
export function windowIsCurrent(window?: PeriodWindow, day = todayIso()): boolean {
  return !window || (window.from <= day && day <= window.to);
}

/** « du 15/09/2026 au 15/01/2027 » — ce qu'un en-tête de rapport affiche. */
export function windowLabel(window?: PeriodWindow): string {
  if (!window) return "Toute l'histoire du club";
  return `${window.from} → ${window.to}`;
}

// ---------------------------------------------------------------------------
//  2. Les modèles de période
// ---------------------------------------------------------------------------

/** Les modèles enregistrés, du plus récent début au plus ancien. */
export function periodTemplatesOf(db: Database): PeriodTemplate[] {
  return [...db.periodTemplates].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** La fenêtre que porte un modèle. */
export function windowOfTemplate(template: PeriodTemplate): PeriodWindow {
  return { from: template.startDate, to: template.endDate };
}

// ---------------------------------------------------------------------------
//  3. Les totaux : chevaliers, gains, dettes
// ---------------------------------------------------------------------------

export interface MoneyTotals {
  /** combien de chevaliers distincts la période a concernés */
  students: number;
  /** ce qui est RENTRÉ dans la fenêtre (cotisations, engagements, frais réglés) */
  gains: number;
  /** ce qui reste DÛ aujourd'hui (soldes dans le rouge et frais impayés) */
  debts: number;
}

const EMPTY: MoneyTotals = { students: 0, gains: 0, debts: 0 };
export { EMPTY as EMPTY_TOTALS };

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
 * LES CHEVALIERS QU'UNE PÉRIODE A CONCERNÉS sur un emploi du temps.
 *
 * Ceux qui y ont été pointés ou y ont versé quelque chose PENDANT la fenêtre —
 * y compris ceux qui ont quitté le groupe depuis, parce qu'un rapport de
 * septembre doit parler des gens de septembre. Et quand la fenêtre touche le
 * jour présent, l'effectif d'aujourd'hui s'y ajoute : le rapport en cours parle
 * aussi de ceux qui viennent de s'inscrire et n'ont encore rien fait.
 */
export function studentsOfSessionIn(
  db: Database,
  sessionId: string,
  window?: PeriodWindow,
): Student[] {
  if (!window) return studentsOfSession(db, sessionId);

  const subIds = new Set(subIdsOfSession(db, sessionId));
  const ids = new Set<string>();
  for (const a of db.attendance) {
    if (a.sessionId !== sessionId) continue;
    if (inWindow(window, dayKeyOf(a.timestamp))) ids.add(a.studentId);
  }
  for (const p of db.payments) {
    if (!p.subscriptionId || !subIds.has(p.subscriptionId)) continue;
    if (inWindow(window, p.date)) ids.add(p.studentId);
  }
  if (windowIsCurrent(window)) {
    for (const st of studentsOfSession(db, sessionId)) ids.add(st.id);
  }
  return db.students
    .filter((st) => ids.has(st.id))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
}

/**
 * CE QU'UN CHEVALIER A VERSÉ ET CE QU'IL DOIT, SUR UN EMPLOI DU TEMPS PRÉCIS.
 *
 * Les gains comptent tout ce qui est ENTRÉ pour ce créneau pendant la fenêtre :
 * la cotisation versée sur ses cartes, et les frais qui le désignent
 * (l'engagement) une fois réglés. Les dettes comptent ce qui MANQUE
 * AUJOURD'HUI : son solde quand il est dans le rouge, et ce qui reste dû sur
 * ces mêmes frais — une dette n'a pas de date, elle dure.
 *
 * Un versement porté sur le salaire d'un père entraîneur est bien un gain : le
 * club sera payé le jour de la paie, en versant moins.
 */
export function studentSessionMoney(
  db: Database,
  studentId: string,
  sessionId: string,
  window?: PeriodWindow,
): { gains: number; debts: number; sold: number } {
  const subIds = new Set(subIdsOfSession(db, sessionId));
  if (subIds.size === 0) return { gains: 0, debts: 0, sold: 0 };

  let gains = 0;
  for (const p of db.payments) {
    if (p.studentId !== studentId) continue;
    if (!inWindow(window, p.date)) continue;
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

/** Les totaux d'UN emploi du temps sur une fenêtre. */
export function sessionTotals(
  db: Database,
  sessionId: string,
  window?: PeriodWindow,
): MoneyTotals {
  const concerned = studentsOfSessionIn(db, sessionId, window);
  const enrolled = new Set(studentsOfSession(db, sessionId).map((s) => s.id));
  const subIds = new Set(subIdsOfSession(db, sessionId));

  // Les gains se lisent sur TOUS ceux qui ont payé dans la fenêtre, y compris
  // ceux qui ont quitté le groupe depuis : leur argent est entré, il ne
  // s'efface pas.
  const payers = new Set<string>(concerned.map((s) => s.id));
  for (const p of db.payments) {
    if (!p.subscriptionId || !subIds.has(p.subscriptionId)) continue;
    if (!inWindow(window, p.date)) continue;
    payers.add(p.studentId);
  }

  let gains = 0;
  let debts = 0;
  for (const id of payers) {
    const m = studentSessionMoney(db, id, sessionId, window);
    gains += m.gains;
    // Seuls ceux qui sont ENCORE là doivent : une dette d'un chevalier parti
    // vit sur sa fiche, pas sur le compte du groupe.
    if (enrolled.has(id)) debts += m.debts;
  }
  return { students: concerned.length, gains: money(gains), debts: money(debts) };
}

/** Les totaux d'une carte : ses chevaliers, ce qu'elle a encaissé, ce qu'elle
 *  doit encore. Une carte porte ses propres dates : elle ne se filtre pas. */
export function carteTotals(
  db: Database,
  view: { carte: { sessionId: string; code: string }; seances: { date: string; slot: number }[] },
): MoneyTotals {
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

// ---------------------------------------------------------------------------
//  4. Le rapport : catégories, puis emplois du temps
// ---------------------------------------------------------------------------

/**
 * LES EMPLOIS DU TEMPS QU'UNE PÉRIODE FAIT TRAVAILLER.
 *
 * Tous les créneaux vivants, plus les créneaux ARCHIVÉS qui ont vécu dans la
 * fenêtre : un groupe fermé en novembre appartient au rapport de septembre, et
 * l'en écarter ferait disparaître de l'argent réellement encaissé.
 */
export function sessionsInWindow(db: Database, window?: PeriodWindow): ScheduleSession[] {
  if (!window) return db.sessions.filter((s) => !s.archivedAt && !s.isOpen);
  return db.sessions.filter((s) => {
    if (s.isOpen) return false;
    if (!s.archivedAt) return true;
    // Archivé : il compte tant qu'il l'a été APRÈS le début de la fenêtre.
    return s.archivedAt >= window.from;
  });
}

/** Une catégorie du rapport, avec ses emplois du temps et ses trois chiffres. */
export interface PeriodCategory {
  classId: string;
  name: string;
  sessions: ScheduleSession[];
  totals: MoneyTotals;
}

export function periodCategories(db: Database, window?: PeriodWindow): PeriodCategory[] {
  const sessions = sessionsInWindow(db, window);
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
        const t = sessionTotals(db, s.id, window);
        gains += t.gains;
        debts += t.debts;
        for (const st of studentsOfSessionIn(db, s.id, window)) seen.add(st.id);
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

/** Les totaux de toute la période. */
export function periodTotals(db: Database, window?: PeriodWindow): MoneyTotals {
  const sessions = sessionsInWindow(db, window);
  const seen = new Set<string>();
  let gains = 0;
  let debts = 0;
  for (const s of sessions) {
    const t = sessionTotals(db, s.id, window);
    gains += t.gains;
    debts += t.debts;
    for (const st of studentsOfSessionIn(db, s.id, window)) seen.add(st.id);
  }
  return { students: seen.size, gains: money(gains), debts: money(debts) };
}
