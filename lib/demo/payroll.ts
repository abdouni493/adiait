"use client";

/**
 * LA PAIE DE LA DÉMONSTRATION — entraîneurs et travailleurs.
 *
 * Les règlements ne sont pas inventés : ils SOLDENT des lignes qui existent
 * déjà. Une part d'entraîneur vient d'une présence réellement écrite, une carte de
 * travailleur vient de son contrat et de sa date d'embauche, et une retenue
 * vient d'un acompte ou d'une dépense qui a sa propre ligne. Ce qui a été réglé
 * est marqué `paid` et porte l'identifiant de son règlement, donc rien n'est
 * jamais retenu deux fois — exactement la règle que l'application applique.
 *
 * Ce qui reste ouvert est délibéré : chaque écran de paie doit avoir quelque
 * chose à régler le jour où la démonstration s'ouvre.
 */

import { money, positiveMoney } from "@/lib/utils";
import type {
  ReceptionStaff,
  ScheduleSession,
  Teacher,
  TeacherAbsence,
  TeacherAcompte,
  TeacherChildDebt,
  TeacherExpense,
  TeacherPayment,
  TeacherPaymentDeduction,
  TeacherPaymentDetail,
  TeacherPaymentMonth,
  UnpaidTeacherSession,
  WorkerAbsence,
  WorkerAcompte,
  WorkerPayment,
  WorkerShift,
} from "@/lib/types";
import { choose, monthKeyOf, pick, shiftDays, stamp, stampOn } from "./dates";

// ---------------------------------------------------------------------------
//  Les entraîneurs
// ---------------------------------------------------------------------------

/** Le jour au-delà duquel les parts ne sont PAS encore réglées : c'est ce qui
 *  laisse à chaque entraîneur un solde à verser quand on ouvre sa fiche. */
const TEACHER_CUTOFF_DAYS = -18;

export interface TeacherPayrollInput {
  teachers: Teacher[];
  sessions: ScheduleSession[];
  unpaidTeacher: UnpaidTeacherSession[];
  childDebts: TeacherChildDebt[];
  sessionTitle: (s: ScheduleSession) => string;
  moduleName: (id: string) => string;
  groupName: (id: string) => string;
}

export interface TeacherPayrollOutput {
  payments: TeacherPayment[];
  acomptes: TeacherAcompte[];
  expenses: TeacherExpense[];
  absences: TeacherAbsence[];
}

/** Les avances sur salaire, les dépenses avancées et les absences retenues. */
function teacherLedgers(teachers: Teacher[]): {
  acomptes: TeacherAcompte[];
  expenses: TeacherExpense[];
  absences: TeacherAbsence[];
} {
  const acomptes: TeacherAcompte[] = [];
  const expenses: TeacherExpense[] = [];
  const absences: TeacherAbsence[] = [];

  teachers.forEach((t, i) => {
    // Deux acomptes : un ancien, qui sera retenu par le règlement, et un récent
    // qui reste ouvert et pèsera sur le prochain.
    const oldDay = shiftDays(-(30 + i * 2));
    const newDay = shiftDays(-(6 + (i % 5)));
    acomptes.push({
      id: `acp-${t.id}-1`,
      teacherId: t.id,
      amount: choose(`${t.id}:acp1`, [3000, 5000, 8000, 10000]),
      description: "Avance sur salaire",
      date: stampOn(oldDay, "12:00"),
      paid: false,
    });
    if (pick(`${t.id}:acp2`, 0, 2) > 0) {
      acomptes.push({
        id: `acp-${t.id}-2`,
        teacherId: t.id,
        amount: choose(`${t.id}:acp2v`, [2000, 4000, 6000]),
        description: "Avance demandée au comptoir",
        date: stampOn(newDay, "10:30"),
        paid: false,
      });
    }

    // Une dépense que le club a avancée pour lui.
    if (pick(`${t.id}:exp`, 0, 2) > 0) {
      const item = choose(`${t.id}:expitem`, [
        { name: "Photocopies de séries d'exercices", amount: 1800, hint: "3 séries · 40 chevaliers" },
        { name: "Transport (examen blanc)", amount: 1200, hint: "Déplacement du samedi" },
        { name: "Matériel de laboratoire", amount: 3400, hint: "Réactifs et verrerie" },
        { name: "Manuels de référence", amount: 2600, hint: "Commande librairie" },
      ]);
      const day = shiftDays(-(22 + (i % 9)));
      expenses.push({
        id: `tex-${t.id}-1`,
        teacherId: t.id,
        name: item.name,
        amount: item.amount,
        description: item.hint,
        date: day,
        paid: false,
        createdAt: stampOn(day, "10:30"),
      });
    }

    // Une séance non assurée, retenue sur sa paie.
    if (pick(`${t.id}:abs`, 0, 3) === 0) {
      const day = shiftDays(-(12 + (i % 7)));
      absences.push({
        id: `tab-${t.id}-1`,
        teacherId: t.id,
        cost: choose(`${t.id}:absv`, [1000, 1200, 1500]),
        description: "Séance non assurée",
        date: stampOn(day, "14:00"),
      });
    }
  });

  return { acomptes, expenses, absences };
}

/**
 * Règle ce qui est ANCIEN et laisse ouvert ce qui est récent.
 *
 * Les lignes passées en argument sont modifiées sur place (`paid`, `paymentId`) :
 * c'est ce que fait l'application quand un règlement est enregistré, et c'est ce
 * qui empêche une part d'être versée deux fois.
 */
export function buildTeacherPayroll(input: TeacherPayrollInput): TeacherPayrollOutput {
  const { acomptes, expenses, absences } = teacherLedgers(input.teachers);
  const payments: TeacherPayment[] = [];
  const cutoff = stamp(TEACHER_CUTOFF_DAYS, "23:59");
  const cutoffDay = shiftDays(TEACHER_CUTOFF_DAYS);
  const sessionById = new Map(input.sessions.map((s) => [s.id, s]));

  for (const teacher of input.teachers) {
    if (teacher.paymentType === "monthly") {
      buildMonthlySettlements(teacher, payments, acomptes);
      continue;
    }

    const rows = input.unpaidTeacher.filter(
      (u) => u.teacherId === teacher.id && !u.paid && u.date <= cutoff,
    );
    if (!rows.length) continue;

    const paymentId = `tpy-${teacher.id}`;
    const gross = money(rows.reduce((s, r) => s + r.amount, 0));

    // Ce qui se retient : les acomptes, les dépenses et les cotisations
    // d'enfants ANTÉRIEURS au règlement. Le reste attend le suivant.
    const takenAcomptes = acomptes.filter(
      (a) => a.teacherId === teacher.id && !a.paid && a.date <= cutoff,
    );
    const takenExpenses = expenses.filter(
      (e) => e.teacherId === teacher.id && !e.paid && e.date <= cutoffDay,
    );
    const takenChildDebts = input.childDebts.filter(
      (d) => d.teacherId === teacher.id && !d.paid && d.date <= cutoffDay,
    );

    const deductionTotal = money(
      takenAcomptes.reduce((s, a) => s + a.amount, 0) +
        takenExpenses.reduce((s, e) => s + e.amount, 0) +
        takenChildDebts.reduce((s, d) => s + d.amount, 0),
    );

    const details = buildDetails(rows, sessionById, teacher, input);
    const months = buildMonths(rows, sessionById, input);

    payments.push({
      id: paymentId,
      teacherId: teacher.id,
      amount: positiveMoney(gross - deductionTotal),
      method: teacher.paymentType === "per_group" ? "group" : "percent",
      ...(teacher.paymentType === "percentage" ? { percentage: teacher.percentage } : {}),
      studentsCount: new Set(rows.map((r) => r.studentId)).size,
      sessionsCount: details.length,
      description: `Règlement des séances — ${teacher.firstName} ${teacher.lastName}`,
      details,
      gross,
      expenses: takenExpenses.map(toDeduction("expense")),
      acomptes: takenAcomptes.map(toDeduction("acompte")),
      childDebts: takenChildDebts.map((d) => ({
        id: d.id,
        kind: "acompte" as const,
        label: d.label,
        amount: d.amount,
        date: d.date,
      })),
      months,
      cashId: `csh-${paymentId}`,
      paidAt: stamp(TEACHER_CUTOFF_DAYS + 1, "17:00"),
    });

    for (const r of rows) {
      r.paid = true;
      r.paymentId = paymentId;
    }
    for (const a of takenAcomptes) {
      a.paid = true;
      a.paymentId = paymentId;
    }
    for (const e of takenExpenses) {
      e.paid = true;
      e.paymentId = paymentId;
    }
    for (const d of takenChildDebts) {
      d.paid = true;
      d.paymentId = paymentId;
    }
  }

  return { payments, acomptes, expenses, absences };
}

function toDeduction(kind: "expense" | "acompte") {
  return (row: { id: string; name?: string; description?: string; amount: number; date: string }): TeacherPaymentDeduction => ({
    id: row.id,
    kind,
    label: row.name ?? row.description ?? (kind === "acompte" ? "Acompte" : "Dépense"),
    description: row.description,
    amount: row.amount,
    date: row.date,
  });
}

/** Le détail figé du règlement : une ligne par jour et par créneau réglé. */
function buildDetails(
  rows: UnpaidTeacherSession[],
  sessionById: Map<string, ScheduleSession>,
  teacher: Teacher,
  input: TeacherPayrollInput,
): TeacherPaymentDetail[] {
  const buckets = new Map<string, UnpaidTeacherSession[]>();
  for (const r of rows) {
    const key = `${r.date.slice(0, 10)}|${r.sessionId}`;
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }

  const pct = teacher.paymentType === "percentage" ? (teacher.percentage ?? 0) : 0;

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, list]) => {
      const [dateKey, sessionId] = key.split("|");
      const session = sessionById.get(sessionId);
      const share = money(list.reduce((s, r) => s + r.amount, 0));
      return {
        dateKey,
        sessionId,
        title: session ? input.sessionTitle(session) : "Séance",
        moduleName: session ? input.moduleName(session.moduleId) : "",
        groupName: session ? input.groupName(session.groupId) : "",
        startTime: session?.startTime ?? "",
        endTime: session?.endTime ?? "",
        presents: list.length,
        passagers: 0,
        // Ce que les chevaliers ont versé sur cette séance : la part remonte au brut
        // par le pourcentage quand il y en a un, et vaut le brut sinon (la
        // répartition de la carte a déjà fait le partage).
        gross: pct > 0 ? money((share * 100) / pct) : share,
        share,
      };
    });
}

/** Les cartes d'emploi du temps que ce règlement a fermés. */
function buildMonths(
  rows: UnpaidTeacherSession[],
  sessionById: Map<string, ScheduleSession>,
  input: TeacherPayrollInput,
): TeacherPaymentMonth[] {
  const bySession = new Map<string, UnpaidTeacherSession[]>();
  for (const r of rows) {
    const list = bySession.get(r.sessionId);
    if (list) list.push(r);
    else bySession.set(r.sessionId, [r]);
  }

  return [...bySession.entries()].map(([sessionId, list], i) => {
    const session = sessionById.get(sessionId);
    return {
      sessionId,
      title: session ? input.sessionTitle(session) : "Séance",
      groupName: session ? input.groupName(session.groupId) : "",
      monthCode: `M${i + 1}`,
      seances: new Set(list.map((r) => r.date.slice(0, 10))).size,
      presents: list.length,
      students: new Set(list.map((r) => r.studentId)).size,
      gross: money(list.reduce((s, r) => s + r.amount, 0)),
    };
  });
}

/** Un entraîneur au forfait : trois carte réglées, la carte courante encore dû. */
function buildMonthlySettlements(
  teacher: Teacher,
  payments: TeacherPayment[],
  acomptes: TeacherAcompte[],
): void {
  const salary = teacher.monthlyAmount ?? 0;
  if (salary <= 0) return;

  for (let back = 3; back >= 1; back--) {
    const day = shiftDays(-30 * back);
    const paymentId = `tpy-${teacher.id}-m${back}`;
    const taken = acomptes.filter(
      (a) =>
        a.teacherId === teacher.id &&
        !a.paid &&
        a.date.slice(0, 10) >= shiftDays(-30 * (back + 1)) &&
        a.date.slice(0, 10) <= day,
    );
    const deducted = money(taken.reduce((s, a) => s + a.amount, 0));

    payments.push({
      id: paymentId,
      teacherId: teacher.id,
      amount: positiveMoney(salary - deducted),
      method: "fixed",
      studentsCount: 0,
      sessionsCount: 0,
      description: `Salaire par carte — ${monthKeyOf(day)}`,
      details: [],
      gross: salary,
      acomptes: taken.map(toDeduction("acompte")),
      cashId: `csh-${paymentId}`,
      paidAt: stampOn(day, "17:00"),
    });

    for (const a of taken) {
      a.paid = true;
      a.paymentId = paymentId;
    }
  }
}

// ---------------------------------------------------------------------------
//  Les travailleurs
// ---------------------------------------------------------------------------

export interface WorkerPayrollOutput {
  shifts: WorkerShift[];
  acomptes: WorkerAcompte[];
  absences: WorkerAbsence[];
  payments: WorkerPayment[];
}

/** Les journées encore dues, laissées ouvertes exprès pour l'écran de paie. */
const WORKER_OPEN_DAYS = 9;

/**
 * Écrit les pointages, les avances, les absences et les règlements de tous les
 * travailleurs — un jeu par type de contrat.
 */
export function buildWorkerPayroll(workers: ReceptionStaff[]): WorkerPayrollOutput {
  const shifts: WorkerShift[] = [];
  const acomptes: WorkerAcompte[] = [];
  const absences: WorkerAbsence[] = [];
  const payments: WorkerPayment[] = [];

  for (const worker of workers) {
    const hiredAgo = daysAgo(worker.startDate);

    // ---- Les avances et les absences --------------------------------------
    const acompteDay = shiftDays(-Math.min(hiredAgo - 2, 40));
    acomptes.push({
      id: `wac-${worker.id}-1`,
      workerId: worker.id,
      amount: choose(`${worker.id}:wac`, [2000, 3000, 5000]),
      description: "Avance sur salaire",
      date: acompteDay,
      paid: false,
    });
    if (pick(`${worker.id}:wac2`, 0, 1) === 0) {
      acomptes.push({
        id: `wac-${worker.id}-2`,
        workerId: worker.id,
        amount: choose(`${worker.id}:wac2v`, [1500, 2500, 4000]),
        description: "Avance exceptionnelle",
        date: shiftDays(-pick(`${worker.id}:wac2d`, 2, 8)),
        paid: false,
      });
    }
    if (pick(`${worker.id}:wabs`, 0, 2) === 0) {
      absences.push({
        id: `wab-${worker.id}-1`,
        workerId: worker.id,
        cost: choose(`${worker.id}:wabsv`, [800, 1200, 1800]),
        description: "Journée non travaillée",
        date: shiftDays(-pick(`${worker.id}:wabsd`, 3, 20)),
        paid: false,
      });
    }

    // ---- Ce que le contrat produit ----------------------------------------
    if (worker.paymentType === "hourly") {
      buildHourly(worker, hiredAgo, shifts, payments, acomptes, absences);
    } else if (worker.paymentType === "monthly") {
      buildMonthlyWorker(worker, hiredAgo, payments, acomptes, absences);
    } else {
      buildDailyWorker(worker, hiredAgo, payments, acomptes, absences);
    }
  }

  return { shifts, acomptes, absences, payments };
}

function daysAgo(dateIso?: string): number {
  if (!dateIso) return 30;
  const [y, m, d] = dateIso.split("-").map(Number);
  const then = new Date(y, m - 1, d, 12, 0, 0);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.max(1, Math.round((now.getTime() - then.getTime()) / 86400000));
}

/** Le vendredi est le jour de repos : personne n'est pointé ce jour-là. */
function isRestDay(dateIso: string): boolean {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 5;
}

/** Contrat horaire : une journée pointée par jour travaillé. */
function buildHourly(
  worker: ReceptionStaff,
  hiredAgo: number,
  shifts: WorkerShift[],
  payments: WorkerPayment[],
  acomptes: WorkerAcompte[],
  absences: WorkerAbsence[],
): void {
  const span = Math.min(hiredAgo, 45);
  const rate = worker.hourlyRate ?? 0;
  const settled: WorkerShift[] = [];

  for (let back = span; back >= 1; back--) {
    const day = shiftDays(-back);
    if (isRestDay(day)) continue;
    // Une journée sur douze n'a pas été pointée du tout.
    if (pick(`${worker.id}:${day}:off`, 0, 11) === 0) continue;

    const startHour = 8 + pick(`${worker.id}:${day}:h`, 0, 1);
    const start = `${String(startHour).padStart(2, "0")}:${choose(`${worker.id}:${day}:m`, ["00", "10", "15", "30"])}`;
    const minutes = 60 * pick(`${worker.id}:${day}:dur`, 6, 9);
    // Une journée récente sur quinze s'est terminée sans pointage de sortie :
    // les heures restent gelées jusqu'à ce que la réception corrige.
    const frozen = back <= 4 && pick(`${worker.id}:${day}:frz`, 0, 14) === 0;
    const end = frozen ? undefined : addMinutesTo(day, start, minutes);

    const shift: WorkerShift = {
      id: `wsh-${worker.id}-${day}`,
      workerId: worker.id,
      workDate: day,
      startAt: stampOn(day, start),
      ...(end ? { endAt: end } : {}),
      minutes: frozen ? 0 : minutes,
      frozen,
      paid: false,
      createdAt: stampOn(day, start),
    };
    shifts.push(shift);
    if (!frozen && back > WORKER_OPEN_DAYS) settled.push(shift);
  }

  if (!settled.length) return;

  const paymentId = `wpy-${worker.id}`;
  const gross = money(settled.reduce((s, sh) => s + (sh.minutes / 60) * rate, 0));
  settlePeriods(
    worker,
    paymentId,
    settled.map((s) => s.id),
    gross,
    acomptes,
    absences,
    payments,
    `Heures pointées — ${settled.length} journées`,
    settled.map((s) => s.id),
  );
  for (const s of settled) {
    s.paid = true;
    s.paymentId = paymentId;
  }
}

/** Contrat par carte : tous les cartes révolus sont réglés, la carte courante non. */
function buildMonthlyWorker(
  worker: ReceptionStaff,
  hiredAgo: number,
  payments: WorkerPayment[],
  acomptes: WorkerAcompte[],
  absences: WorkerAbsence[],
): void {
  const months: string[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(12, 0, 0, 0);
  const oldest = new Date();
  oldest.setDate(oldest.getDate() - Math.min(hiredAgo, 365));

  // De la carte de l'embauche à la carte PRÉCÉDENT : la carte en cours reste dû.
  const walker = new Date(oldest.getFullYear(), oldest.getMonth(), 1, 12);
  while (walker < cursor) {
    months.push(`${String(walker.getMonth() + 1).padStart(2, "0")}/${walker.getFullYear()}`);
    walker.setMonth(walker.getMonth() + 1);
  }
  if (!months.length) return;

  // Un règlement par carte : c'est ainsi que le club les verse.
  months.forEach((key, i) => {
    const paymentId = `wpy-${worker.id}-${key.replace("/", "-")}`;
    const monthsBack = months.length - i;
    settlePeriods(
      worker,
      paymentId,
      [key],
      money(worker.salary),
      // Seul le règlement le plus ancien absorbe les retenues ouvertes : les
      // avances récentes doivent rester à retenir sur le PROCHAIN versement.
      acomptes,
      absences,
      payments,
      `Salaire ${key}`,
      undefined,
      shiftDays(-30 * monthsBack + 2),
    );
  });
}

/** Contrat journalier ou demi-journée : une ligne par jour travaillé. */
function buildDailyWorker(
  worker: ReceptionStaff,
  hiredAgo: number,
  payments: WorkerPayment[],
  acomptes: WorkerAcompte[],
  absences: WorkerAbsence[],
): void {
  const keys: string[] = [];
  for (let back = Math.min(hiredAgo, 120); back > WORKER_OPEN_DAYS; back--) {
    keys.push(shiftDays(-back));
  }
  if (!keys.length) return;

  // Réglé quinzaine par quinzaine, comme au comptoir.
  for (let start = 0; start < keys.length; start += 15) {
    const slice = keys.slice(start, start + 15);
    const paymentId = `wpy-${worker.id}-${slice[0]}`;
    settlePeriods(
      worker,
      paymentId,
      slice,
      money(slice.length * worker.salary),
      acomptes,
      absences,
      payments,
      `${slice.length} journées — du ${slice[0]} au ${slice[slice.length - 1]}`,
      undefined,
      slice[slice.length - 1],
    );
  }
}

/**
 * Écrit UN règlement et solde ce qu'il retient. Les acomptes et les absences
 * passés en argument sont marqués `paid` : ils ne reviendront pas sur le
 * versement suivant.
 */
function settlePeriods(
  worker: ReceptionStaff,
  paymentId: string,
  periodKeys: string[],
  gross: number,
  acomptes: WorkerAcompte[],
  absences: WorkerAbsence[],
  payments: WorkerPayment[],
  description: string,
  shiftIds?: string[],
  when?: string,
): void {
  const date = when ?? shiftDays(-WORKER_OPEN_DAYS - 1);
  // On ne retient QUE ce qui existait déjà le jour du versement : une avance
  // demandée la semaine dernière ne peut pas avoir été déduite d'un salaire
  // versé la carte d'avant. C'est ce qui laisse des retenues ouvertes sur
  // l'écran de paie, comme au comptoir.
  const takenAcomptes = acomptes.filter(
    (a) => a.workerId === worker.id && !a.paid && a.date <= date,
  );
  const takenAbsences = absences.filter(
    (a) => a.workerId === worker.id && !a.paid && a.date <= date,
  );
  const acompteTotal = money(takenAcomptes.reduce((s, a) => s + a.amount, 0));
  const absenceTotal = money(takenAbsences.reduce((s, a) => s + a.cost, 0));
  const net = positiveMoney(gross - acompteTotal - absenceTotal);

  payments.push({
    id: paymentId,
    workerId: worker.id,
    kind: worker.paymentType,
    periodKeys,
    ...(shiftIds ? { shiftIds } : {}),
    gross,
    acomptes: acompteTotal,
    absences: absenceTotal,
    net,
    amount: net,
    date,
    description,
    cashId: `csh-${paymentId}`,
    createdAt: stampOn(date, "16:00"),
  });

  for (const a of takenAcomptes) {
    a.paid = true;
    a.paymentId = paymentId;
  }
  for (const a of takenAbsences) {
    a.paid = true;
    a.paymentId = paymentId;
  }
}

function addMinutesTo(dateIso: string, hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const end = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return stampOn(dateIso, end);
}
