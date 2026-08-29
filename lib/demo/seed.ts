"use client";

/**
 * LE JEU D'ESSAI DES TESTS — un club entier, construite en mémoire.
 *
 * L'APPLICATION NE S'EN SERT PLUS : elle lit et écrit dans Supabase
 * (`lib/supabase/`). Ce jeu reste parce qu'il est ce sur quoi les tests
 * s'appuient — il couvre les cinq cas de facturation d'un chevalier, les trois
 * modes de paie d'un entraîneur, les quatre contrats d'un travailleur et les
 * cas limites des emplois du temps, ce qu'aucune fixture écrite à la main
 * n'atteindrait.
 *
 * `tests/supabaseMapping.test.ts` s'en sert pour vérifier que CHAQUE champ de
 * CHAQUE ligne a bien une colonne dans `supabase/schema.sql` : c'est le filet
 * qui rattrape un champ ajouté à un type sans sa colonne.
 *
 * CE QU'IL FAUT SAVOIR AVANT D'Y TOUCHER
 *
 *  - `buildDemoDatabase()` rend un objet NEUF à chaque appel ;
 *  - rien n'est recopié à la main. Les présences sont TIRÉES (avec une graine
 *    stable), et tout le reste en DÉCOULE : le prix d'une séance vient de
 *    `studentSeancePrice`, la part de l'entraîneur de la même règle que le
 *    scan (`teacherDueFor`), le solde d'une inscription de ce qui a été versé
 *    moins ce que les séances ont mangé. Un chevalier « cas réduction » ou « club
 *    seule » est donc facturé dans la démonstration exactement comme il le
 *    serait au comptoir ;
 *  - la caisse est écrite EN DERNIER, à partir des mouvements qui viennent
 *    d'être créés, pour que le bilan tombe juste.
 */

import {
  carteShort,
  caseReductionCut,
  cycleSizeOf,
  isFreeSub,
  isSchoolOnlySub,
  monthlyPriceOf,
  studentListPrice,
  studentMonthPrice,
  studentSeancePrice,
} from "@/lib/helpers";
import { money, positiveMoney } from "@/lib/utils";
import type { Database } from "@/lib/store/data";
import type {
  AttendanceRecord,
  AttendanceStatus,
  CashTransaction,
  Enrollment,
  Expense,
  GroupSeance,
  IndependentSession,
  Payment,
  ScheduleSession,
  Student,
  StudentCharge,
  Subscription,
  Teacher,
  TeacherAcompte,
  TeacherChildDebt,
  TeacherPayment,
  UnpaidTeacherSession,
  WorkerAcompte,
  WorkerPayment,
} from "@/lib/types";
import {
  CLASSES,
  CLASS_CATEGORIES,
  CASH_CATEGORIES,
  EXPENSE_CATEGORIES,
  GROUPS,
  MODULES,
  SALLES,
  SCHOOL,
  SESSIONS,
  SUBSCRIPTIONS,
  TEACHERS,
  WORKERS,
  WORKER_ROLES,
} from "./catalog";
import { CASE_STUDENTS, PARENTS, buildCohort } from "./people";
import { buildTeacherPayroll, buildWorkerPayroll } from "./payroll";
import {
  ANNOUNCEMENTS,
  COURSEWORK,
  FREE_PERIODS,
  MODULE_ABSENCE_RULES,
  buildAbsencePenalties,
  buildCredentials,
  buildExpenses,
  buildGroupSeances,
  buildIndependent,
  buildNotifications,
} from "./misc";
import { choose, pastOccurrences, pick, shiftDays, stamp, stampOn } from "./dates";

/** Jusqu'où l'historique des présences remonte. Neuf semaines suffisent à
 *  ouvrir deux ou trois carte d'emploi du temps sans alourdir la démonstration. */
const HISTORY_DAYS = 63;

// ---------------------------------------------------------------------------
//  Les règles de calcul, recopiées du magasin
// ---------------------------------------------------------------------------

/**
 * CE QU'UNE SÉANCE RAPPORTE À L'ENTRAÎNEUR — la règle de `teacherDueFor()`
 * dans `lib/store/data.ts`, à l'identique.
 *
 * Elle est reprise ici plutôt qu'importée parce que le magasin ne l'expose pas :
 * si elle change là-bas, elle doit changer ici, sans quoi la démonstration
 * afficherait des paies que le scan ne produirait pas.
 */
function teacherDueFor(
  teacher: Teacher | undefined,
  session: ScheduleSession,
  sub: Subscription | undefined,
  base: number,
  student: Student,
): number {
  if (isFreeSub(student, sub?.id)) return 0;
  if (isSchoolOnlySub(student, sub?.id, session.teacherId)) return 0;

  const perSeance = sub?.teacherPerSeance ?? 0;
  const gross =
    perSeance > 0
      ? positiveMoney(perSeance)
      : teacher?.paymentType === "percentage"
        ? positiveMoney((base * (teacher.percentage ?? 0)) / 100)
        : 0;

  return positiveMoney(gross - caseReductionCut(student, "teacher", gross));
}

// ---------------------------------------------------------------------------
//  Comment chaque famille paie
// ---------------------------------------------------------------------------

/**
 * LE COMPORTEMENT DE PAIEMENT D'UNE FAMILLE.
 *
 *  - `full`     : elle règle chaque carte en entier, et garde même un peu d'avance ;
 *  - `partial`  : le dernière carte n'a été réglé qu'en partie — il reste une dette ;
 *  - `late`     : elle n'a pas encore payé la carte en cours, son solde est dans le rouge ;
 *  - `advance`  : elle a payé une carte de plus que ce qu'elle a consommé ;
 *  - `salary`   : fils d'entraîneur — la cotisation se retient sur la paie du père ;
 *  - `credited` : fils d'entraîneur crédité d'avance, la somme attend la paie du père ;
 *  - `free`     : rien n'est dû, donc rien n'est versé.
 */
type PayProfile = "full" | "partial" | "late" | "advance" | "salary" | "credited" | "free";

const PROFILE_OVERRIDES: Record<string, PayProfile> = {
  "stu-1": "advance",
  "stu-2": "full",
  "stu-3": "partial",
  "stu-4": "full",
  "stu-5": "free",
  "stu-6": "full",
  "stu-7": "partial",
  "stu-8": "full",
  "stu-9": "salary",
  "stu-10": "credited",
  "stu-11": "full",
  "stu-12": "full",
  "stu-13": "full",
  "stu-14": "full",
  "stu-15": "full",
  "stu-16": "full",
  "stu-17": "late",
  "stu-18": "late",
  "stu-19": "advance",
  "stu-20": "full",
};

function profileOf(student: Student): PayProfile {
  const forced = PROFILE_OVERRIDES[student.id];
  if (forced) return forced;
  // Le reste de l'effectif : une majorité à jour, une minorité en retard —
  // ce qui donne au tableau de bord des alertes de dette qui veulent dire
  // quelque chose sans noyer l'écran.
  const roll = pick(`${student.id}:profile`, 0, 9);
  if (roll <= 4) return "full";
  if (roll <= 6) return "advance";
  if (roll <= 8) return "partial";
  return "late";
}

// ---------------------------------------------------------------------------
//  Les présences, carte par carte
// ---------------------------------------------------------------------------

/** Le statut d'une séance, tiré d'une graine stable. */
function statusFor(seed: string): AttendanceStatus {
  const roll = pick(seed, 0, 99);
  if (roll < 78) return "present";
  if (roll < 86) return "late";
  if (roll < 97) return "absent";
  return "cancelled";
}

interface Ledger {
  enrollments: Enrollment[];
  attendance: AttendanceRecord[];
  payments: Payment[];
  unpaidTeacher: UnpaidTeacherSession[];
  charges: StudentCharge[];
  childDebts: TeacherChildDebt[];
}

/**
 * ÉCRIT TOUTE LA VIE SCOLAIRE D'UN CHEVALIER SUR UN EMPLOI DU TEMPS : son
 * inscription, ses présences, ce qu'il a versé, et ce que ses séances doivent à
 * l'entraîneur.
 *
 * `historyStart` est le jour où son inscription commence — les séances tenues
 * avant lui ne sont jamais les siennes.
 */
function writeInscription(
  led: Ledger,
  student: Student,
  sub: Subscription,
  session: ScheduleSession,
  teacher: Teacher | undefined,
  index: number,
): void {
  const dates = student.subscriptionDates?.[sub.id];
  const startDate = dates?.startDate ?? shiftDays(-HISTORY_DAYS);
  const leftOn = dates?.unsubscribedAt;
  const profile = profileOf(student);
  const free = isFreeSub(student, sub.id);

  const unit = studentSeancePrice(student, sub);
  const size = cycleSizeOf(sub);
  const enrollmentId = `enr-${student.id.replace("stu-", "")}-${sub.id.replace("sub-", "")}`;

  // Les jours où l'emploi du temps est tombé DEPUIS son inscription.
  const from = Math.max(-HISTORY_DAYS, daysBetween(startDate));
  const occurrences = pastOccurrences(session.days, from).filter(
    (d) => d >= startDate && (!leftOn || d <= leftOn),
  );

  // Le point d'entrée : un chevalier arrivé au 2ᵉ carte du groupe commence là, pas
  // sur la première séance de M1.
  const joinOffset =
    (monthIndexOf(dates?.joinMonthCode) * size) + (dates?.joinSlotIndex ?? 0);

  let consumedSeances = 0;
  let consumedMoney = 0;
  const monthsTouched = new Set<number>();

  occurrences.forEach((date, i) => {
    const status = statusFor(`${student.id}:${sub.id}:${date}`);
    const times = session.dayTimes?.[dayNameOf(date)] ?? {
      startTime: session.startTime,
      endTime: session.endTime,
    };
    // Un retard entre un quart d'heure après le début, une présence à l'heure.
    const at = status === "late" ? addMinutes(times.startTime, 25) : addMinutes(times.startTime, 4);

    // Une séance annulée ne coûte rien et ne fait pas avancer la carte.
    const charged = status !== "cancelled";
    const cost = charged && !free ? unit : 0;

    led.attendance.push({
      id: `att-${enrollmentId}-${i}`,
      studentId: student.id,
      sessionId: session.id,
      timestamp: stampOn(date, at),
      amountDeducted: cost,
      status,
      ...(charged ? {} : { noCharge: true }),
    });

    if (!charged) return;

    const slot = joinOffset + consumedSeances;
    monthsTouched.add(Math.floor(slot / size));
    consumedSeances += 1;
    consumedMoney = money(consumedMoney + cost);

    // La part de l'entraîneur : elle naît avec la présence et reste due jusqu'à
    // son règlement. Une part nulle n'est pas une dette — elle n'existe pas.
    const due = teacherDueFor(teacher, session, sub, cost, student);
    if (session.teacherId && due > 0 && status !== "absent") {
      led.unpaidTeacher.push({
        id: `utp-${enrollmentId}-${i}`,
        teacherId: session.teacherId,
        sessionId: session.id,
        studentId: student.id,
        amount: due,
        date: stampOn(date, at),
        paid: false,
      });
    }
  });

  // ---- Ce que la famille a versé ------------------------------------------
  const monthPrice = money(studentMonthPrice(student, sub));
  const monthCount = monthsTouched.size || 1;
  const firstMonth = monthsTouched.size ? Math.min(...monthsTouched) : 0;
  let credited = 0;

  if (!free && monthPrice > 0 && profile !== "free") {
    // Un profil « advance » règle une carte de plus que ce qu'il a consommé, un
    // profil « late » laisse le dernière carte entièrement impayé.
    const paidMonths =
      profile === "advance" ? monthCount + 1 : profile === "late" ? monthCount - 1 : monthCount;

    for (let m = 0; m < Math.max(0, paidMonths); m++) {
      const monthCode = `M${firstMonth + m + 1}`;
      const last = m === Math.max(0, paidMonths) - 1;
      const partial = profile === "partial" && last;
      const netTotal = monthPrice;
      const amountPaid = partial ? money(netTotal * 0.6) : netTotal;
      const when = occurrences[Math.min(m * size, Math.max(0, occurrences.length - 1))]
        ?? shiftDays(-HISTORY_DAYS);

      led.payments.push({
        id: `pay-${enrollmentId}-${m + 1}`,
        studentId: student.id,
        enrollmentId,
        subscriptionId: sub.id,
        monthCode,
        seancesPurchased: size,
        unitPrice: money(studentListPrice(student, sub)),
        grossTotal: money(monthlyPriceOf(sub) || netTotal),
        plan: dates?.plan ?? "seance",
        netTotal,
        amountPaid,
        rest: money(netTotal - amountPaid),
        type: "subscription_payment",
        paidFrom:
          profile === "salary" ? "teacher_salary" : profile === "credited" ? "teacher_debt" : "cash",
        date: stampOn(when, "09:15"),
        description: `${carteShort(monthCode)} — ${sessionTitle(session)}`,
        alertRead: pick(`${enrollmentId}:${m}:alert`, 0, 3) > 0,
      });
      credited = money(credited + amountPaid);

      // Fils d'entraîneur crédité d'avance : la somme est portée sur le père et
      // attend son prochain règlement.
      if (profile === "credited" && student.teacherFatherId) {
        led.childDebts.push({
          id: `tcd-${enrollmentId}-${m + 1}`,
          teacherId: student.teacherFatherId,
          studentId: student.id,
          subscriptionId: sub.id,
          monthCode,
          label: `${student.firstName} ${student.lastName} — ${carteShort(monthCode)} · ${sessionTitle(session)}`,
          amount: netTotal,
          date: when,
          paid: false,
          createdAt: stampOn(when, "09:16"),
        });
      }
    }
  }

  led.enrollments.push({
    id: enrollmentId,
    studentId: student.id,
    subscriptionId: sub.id,
    paidSeances: consumedSeances + Math.max(0, Math.floor((credited - consumedMoney) / (unit || 1))),
    consumedSeances,
    ...(student.subscriptionDiscounts?.[sub.id]
      ? { discount: student.subscriptionDiscounts[sub.id] }
      : {}),
    startDate,
    ...(dates?.expiryDate ? { expiryDate: dates.expiryDate } : {}),
    ...(dates?.plan ? { plan: dates.plan, monthSeances: size } : {}),
    balance: money(credited - consumedMoney),
    createdAt: stampOn(startDate, "09:00"),
  });

  // Une inscription sur huit porte un frais au compte du chevalier : un livre,
  // une tenue, une sortie. C'est une dette qui n'est PAS de la cotisation — elle
  // ne retient donc jamais la paie d'un entraîneur.
  if (index === 0 && pick(`${student.id}:charge`, 0, 7) === 0) {
    const item = choose(`${student.id}:item`, [
      { name: "Livre de mathématiques", amount: 1200 },
      { name: "Tenue de sport", amount: 2500 },
      { name: "Sortie pédagogique", amount: 1500 },
      { name: "Polycopiés du trimestre", amount: 800 },
      { name: "Transport du club (carte)", amount: 3000 },
    ]);
    const day = shiftDays(-pick(`${student.id}:chargeday`, 5, 50));
    const half = pick(`${student.id}:chargepaid`, 0, 2) === 0;
    led.charges.push({
      id: `chg-${student.id}`,
      studentId: student.id,
      name: item.name,
      amount: item.amount,
      description: "Saisi au comptoir",
      date: day,
      origin: "manual",
      paidAmount: half ? money(item.amount / 2) : 0,
      paid: false,
      createdAt: stampOn(day, "11:00"),
    });
    if (half) {
      led.payments.push({
        id: `pay-chg-${student.id}`,
        studentId: student.id,
        chargeId: `chg-${student.id}`,
        seancesPurchased: 0,
        unitPrice: 0,
        grossTotal: money(item.amount / 2),
        netTotal: money(item.amount / 2),
        amountPaid: money(item.amount / 2),
        rest: 0,
        type: "debt_payment",
        paidFrom: "cash",
        date: stampOn(day, "11:05"),
        description: `Acompte sur « ${item.name} »`,
        alertRead: true,
      });
    }
  }
}

// ---------------------------------------------------------------------------
//  Petits utilitaires
// ---------------------------------------------------------------------------

/** Le nombre de jours qui séparent une date d'aujourd'hui (négatif = passé). */
function daysBetween(dateIso: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  const then = new Date(y, m - 1, d, 12, 0, 0);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((then.getTime() - now.getTime()) / 86400000);
}

const JS_DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

function dayNameOf(dateIso: string) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return JS_DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** « M2 » -> 1. Absent -> 0. */
function monthIndexOf(code?: string): number {
  const m = /^M(\d+)$/.exec(code ?? "");
  return m ? Math.max(0, Number(m[1]) - 1) : 0;
}

function sessionTitle(session: ScheduleSession): string {
  if (session.title) return session.title;
  const mod = MODULES.find((m) => m.id === session.moduleId)?.name ?? "Module";
  const grp = GROUPS.find((g) => g.id === session.groupId)?.name ?? "";
  return grp ? `${mod} · ${grp}` : mod;
}

// ---------------------------------------------------------------------------
//  L'ASSEMBLAGE
// ---------------------------------------------------------------------------

/**
 * Construit une base de donnees complete et NEUVE.
 *
 * L'ordre compte : les presences d'abord (elles creent les parts dues aux
 * entraîneurs), la paie ensuite (elle les solde), la caisse en dernier (elle
 * recopie tous les mouvements d'argent qui viennent d'etre ecrits).
 */
export function buildDemoDatabase(): Database {
  const students: Student[] = [
    ...CASE_STUDENTS.map((s, i) => ({
      ...s,
      registrationNumber: String(i + 1).padStart(5, "0"),
    })),
    ...buildCohort(CASE_STUDENTS.length + 1).map((s, i) => ({
      ...s,
      registrationNumber: String(CASE_STUDENTS.length + i + 1).padStart(5, "0"),
    })),
  ];

  const subById = new Map(SUBSCRIPTIONS.map((s) => [s.id, s]));
  const sessionById = new Map(SESSIONS.map((s) => [s.id, s]));
  const teacherById = new Map(TEACHERS.map((t) => [t.id, t]));

  const led: Ledger = {
    enrollments: [],
    attendance: [],
    payments: [],
    unpaidTeacher: [],
    charges: [],
    childDebts: [],
  };

  for (const student of students) {
    // Les emplois du temps qu'il suit, PLUS ceux qu'il a quittes : le bloc de
    // dates est garde a la desinscription, et c'est lui qui garde son historique
    // lisible.
    const historical = Object.keys(student.subscriptionDates ?? {}).filter(
      (id) => !student.subscriptionIds.includes(id),
    );
    [...student.subscriptionIds, ...historical].forEach((subId, index) => {
      const sub = subById.get(subId);
      const session = sub ? sessionById.get(sub.sessionId) : undefined;
      if (!sub || !session) return;
      writeInscription(led, student, sub, session, teacherById.get(session.teacherId), index);
    });
  }

  // ---- La paie des entraîneurs -------------------------------------------
  const teacherPayroll = buildTeacherPayroll({
    teachers: TEACHERS,
    sessions: SESSIONS,
    unpaidTeacher: led.unpaidTeacher,
    childDebts: led.childDebts,
    sessionTitle,
    moduleName: (id) => MODULES.find((m) => m.id === id)?.name ?? "",
    groupName: (id) => GROUPS.find((g) => g.id === id)?.name ?? "",
  });

  // ---- La paie des travailleurs ------------------------------------------
  const workerPayroll = buildWorkerPayroll(WORKERS);

  // ---- Ce qui remplit les autres ecrans -----------------------------------
  const independent = buildIndependent(students.slice(0, 20));
  const groupSeances = buildGroupSeances();
  const expenses = buildExpenses();
  const notifications = buildNotifications(PARENTS.map((p) => p.id));
  const credentials = buildCredentials(students);

  // ---- L'AVANCE DE L'ECOLE : elle a regle la dette d'une eleve de sa propre
  //      caisse pour debloquer la part de son entraîneur. La famille la doit
  //      desormais a l'ecole, et c'est ce frais qui le dit.
  const advanceStudent = students.find((s) => s.id === "stu-18");
  if (advanceStudent) {
    const day = shiftDays(-14);
    led.charges.push({
      id: "chg-advance-1",
      studentId: advanceStudent.id,
      name: "Avance de l'ecole sur scolarite",
      amount: 2200,
      description: "Reglee par la caisse pour debloquer la part de l'entraîneur",
      date: day,
      origin: "school_advance",
      sourcePaymentId: "pay-advance-1",
      subscriptionId: "sub-2",
      monthCode: "M2",
      paidAmount: 0,
      paid: false,
      createdAt: stampOn(day, "15:00"),
    });
    led.payments.push({
      id: "pay-advance-1",
      studentId: advanceStudent.id,
      subscriptionId: "sub-2",
      monthCode: "M2",
      seancesPurchased: 0,
      unitPrice: 0,
      grossTotal: 2200,
      netTotal: 2200,
      amountPaid: 2200,
      rest: 0,
      type: "debt_payment",
      paidFrom: "school_cash",
      date: stampOn(day, "15:00"),
      description: "Dette avancee par l'ecole",
      alertRead: true,
    });

    // L'argent est bien entre sur SON solde : c'est meme tout l'objet de
    // l'avance. Sans cette ligne, la fiche de l'eleve montrerait une dette que
    // la caisse a pourtant deja reglee.
    const covered = led.enrollments.find(
      (e) => e.studentId === advanceStudent.id && e.subscriptionId === "sub-2",
    );
    if (covered) covered.balance = money((covered.balance ?? 0) + 2200);
  }

  const absencePenalties = buildAbsencePenalties(
    students.slice(4, 9).map((s) => {
      const subId = s.subscriptionIds[0] ?? "sub-1";
      const sub = subById.get(subId);
      const session = sub ? sessionById.get(sub.sessionId) : undefined;
      return {
        studentId: s.id,
        subscriptionId: subId,
        sessionId: session?.id ?? "ses-1",
        moduleId: session?.moduleId ?? "mod-1",
        amount: money(studentSeancePrice(s, sub!)),
      };
    }),
  );

  // ---- La caisse, ecrite en dernier ---------------------------------------
  const cash = buildCash({
    payments: led.payments,
    teacherPayments: teacherPayroll.payments,
    teacherAcomptes: teacherPayroll.acomptes,
    workerPayments: workerPayroll.payments,
    workerAcomptes: workerPayroll.acomptes,
    expenses,
    independent,
    groupSeances,
    students,
    teachers: TEACHERS,
  });

  return {
    school: { ...SCHOOL },
    classCategories: CLASS_CATEGORIES.map((c) => ({ ...c })),
    modules: MODULES.map((m) => ({ ...m })),
    groups: GROUPS.map((g) => ({ ...g })),
    salles: SALLES.map((s) => ({ ...s })),
    classes: CLASSES.map((c) => ({ ...c })),
    teachers: TEACHERS.map((t) => ({ ...t })),
    teacherPayments: teacherPayroll.payments,
    reception: WORKERS.map((w) => ({ ...w })),
    workerRoles: WORKER_ROLES.map((r) => ({ ...r })),
    workerShifts: workerPayroll.shifts,
    workerAcomptes: workerPayroll.acomptes,
    workerAbsences: workerPayroll.absences,
    workerPayments: workerPayroll.payments,
    sessions: SESSIONS.map((s) => ({ ...s })),
    subscriptions: SUBSCRIPTIONS.map((s) => ({ ...s })),
    freePeriods: FREE_PERIODS.map((f) => ({ ...f })),
    students,
    studentCredentials: credentials,
    moduleAbsenceRules: MODULE_ABSENCE_RULES.map((r) => ({ ...r })),
    enrollments: led.enrollments,
    payments: led.payments,
    studentCharges: led.charges,
    attendance: led.attendance,
    absencePenalties,
    unpaidTeacher: led.unpaidTeacher,
    acomptes: teacherPayroll.acomptes,
    teacherExpenses: teacherPayroll.expenses,
    teacherChildDebts: led.childDebts,
    absences: teacherPayroll.absences,
    announcements: ANNOUNCEMENTS.map((a) => ({ ...a })),
    categories: EXPENSE_CATEGORIES.map((c) => ({ ...c })),
    cashCategories: CASH_CATEGORIES.map((c) => ({ ...c })),
    expenses,
    cash,
    parents: PARENTS.map((p) => ({ ...p })),
    notifications,
    coursework: COURSEWORK.map((c) => ({ ...c })),
    independent,
    groupSeances,
    // La démonstration ne fabrique aucune demande de compte : elles naissent
    // de la page de connexion, jamais d'un jeu de données.
    accountRequests: [],
    formations: [],
    formationEnrollments: [],
  };
}

// ---------------------------------------------------------------------------
//  LA CAISSE
// ---------------------------------------------------------------------------

interface CashInput {
  payments: Payment[];
  teacherPayments: TeacherPayment[];
  teacherAcomptes: TeacherAcompte[];
  workerPayments: WorkerPayment[];
  workerAcomptes: WorkerAcompte[];
  expenses: Expense[];
  independent: IndependentSession[];
  groupSeances: GroupSeance[];
  students: Student[];
  teachers: Teacher[];
}

/**
 * LA CAISSE EST UN REFLET, PAS UNE SOURCE.
 *
 * Chaque mouvement recopie une operation qui existe deja ailleurs : un
 * versement d'eleve, un reglement d'entraîneur, une avance sur salaire, une
 * depense. Le solde affiche par l'ecran Caisse est donc exactement la somme de
 * ce que l'ecole a encaisse et decaisse — et non un chiffre invente a cote.
 *
 * Ce qui n'est PAS entre en caisse n'y figure pas : une scolarite retenue sur le
 * salaire d'un pere entraîneur ne fait bouger aucun billet.
 */
function buildCash(input: CashInput): CashTransaction[] {
  const out: CashTransaction[] = [];
  const nameOf = (id: string) => {
    const s = input.students.find((x) => x.id === id);
    return s ? `${s.firstName} ${s.lastName}` : "Eleve";
  };

  // Le fonds de caisse du debut d'annee.
  out.push({
    id: "csh-opening",
    type: "deposit",
    amount: 150000,
    date: stamp(-HISTORY_DAYS - 20, "09:00"),
    description: "Fonds de caisse",
  });

  // Les versements des familles. Seul l'argent REELLEMENT remis passe par la
  // caisse : une scolarite prise sur le salaire du pere n'y entre jamais.
  for (const p of input.payments) {
    if (p.amountPaid <= 0) continue;
    if (p.paidFrom === "teacher_salary" || p.paidFrom === "teacher_debt") continue;
    if (p.paidFrom === "school_cash") {
      // L'ecole a avance la somme : l'encaissement est double d'une SORTIE de
      // meme montant, sans quoi le bilan compterait un argent jamais recu.
      out.push({
        id: `csh-${p.id}`,
        type: "student_payment",
        amount: p.amountPaid,
        date: p.date,
        description: `Dette avancee — ${nameOf(p.studentId)}`,
      });
      out.push({
        id: `csh-${p.id}-out`,
        type: "student_debt",
        amount: -p.amountPaid,
        date: p.date,
        description: `Avance de l'ecole — ${nameOf(p.studentId)}`,
      });
      continue;
    }
    out.push({
      id: `csh-${p.id}`,
      type: "student_payment",
      amount: p.amountPaid,
      date: p.date,
      description: `${p.description ?? "Versement"} — ${nameOf(p.studentId)}`,
    });
  }

  // Les reglements des entraîneurs et des travailleurs.
  for (const tp of input.teacherPayments) {
    const t = input.teachers.find((x) => x.id === tp.teacherId);
    out.push({
      id: tp.cashId ?? `csh-${tp.id}`,
      type: "teacher_payment",
      amount: -tp.amount,
      date: tp.paidAt,
      description: `${tp.description}${t ? "" : ""}`,
    });
  }
  for (const wp of input.workerPayments) {
    out.push({
      id: wp.cashId ?? `csh-${wp.id}`,
      type: "teacher_payment",
      amount: -wp.amount,
      date: stampOn(wp.date, "16:00"),
      description: `Reglement travailleur — ${wp.description ?? wp.periodKeys.join(", ")}`,
    });
  }

  // Les avances sur salaire : elles sortent le jour ou elles sont versees.
  for (const a of input.teacherAcomptes) {
    out.push({
      id: `csh-${a.id}`,
      type: "acompte",
      amount: -a.amount,
      date: a.date,
      description: `Acompte entraîneur — ${a.description}`,
    });
  }
  for (const a of input.workerAcomptes) {
    out.push({
      id: `csh-${a.id}`,
      type: "acompte",
      amount: -a.amount,
      date: stampOn(a.date, "12:00"),
      description: `Acompte travailleur — ${a.description}`,
    });
  }

  // Les depenses de l'ecole.
  for (const e of input.expenses) {
    out.push({
      id: `csh-${e.id}`,
      type: "expense",
      amount: -e.amount,
      date: e.date,
      description: e.name,
    });
  }

  // Les seances libres vendues a l'unite.
  for (const ind of input.independent) {
    out.push({
      id: `csh-${ind.id}`,
      type: "student_payment",
      amount: ind.price,
      date: stampOn(ind.date, ind.startTime ?? "18:00"),
      description: `${ind.itemLabel} — ${ind.passagerName ?? nameOf(ind.studentId ?? "")}`,
    });
  }

  // Les seances vendues a un groupe entier : l'argent entre, la part de
  // l'entraîneur sort le meme jour.
  for (const g of input.groupSeances) {
    const teacherShare = money(g.studentsCount * (g.pricePerStudent - g.schoolPerStudent));
    out.push({
      id: g.cashInId ?? `csh-${g.id}-in`,
      type: "student_payment",
      amount: money(g.studentsCount * g.pricePerStudent),
      date: stampOn(g.date, g.startTime),
      description: `${g.title} — ${g.studentsCount} eleves`,
    });
    out.push({
      id: g.cashOutId ?? `csh-${g.id}-out`,
      type: "teacher_payment",
      amount: -teacherShare,
      date: stampOn(g.date, g.endTime),
      description: `Part entraîneur — ${g.title}`,
    });
  }

  // Deux retraits vers le compte bancaire de l'ecole.
  out.push({
    id: "csh-withdraw-1",
    type: "withdraw",
    amount: -80000,
    date: stamp(-35, "16:00"),
    description: "Versement au compte bancaire",
  });
  out.push({
    id: "csh-withdraw-2",
    type: "withdraw",
    amount: -60000,
    date: stamp(-12, "16:00"),
    description: "Versement au compte bancaire",
  });

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
