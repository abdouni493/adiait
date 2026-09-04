"use client";

/**
 * =============================================================================
 *  LA SITUATION D'UN CHEVALIER, MISE EN FORME POUR UN MESSAGE
 * =============================================================================
 *
 *  Un rappel de dette qui ne dit QUE le montant oblige la famille à téléphoner
 *  pour comprendre de quoi il s'agit — quel groupe, quelle carte, depuis quand.
 *  Ce module rassemble tout ce que l'application sait déjà et le range dans la
 *  forme que les modèles consomment : semestre, catégorie, groupe, emploi du
 *  temps, jours et horaires, arène, entraîneur, carte en cours et son
 *  avancement, présences, absences, séances annulées, total versé, reste dû.
 *
 *  IL NE CALCULE RIEN DE NEUF. Chaque chiffre vient du même helper que celui
 *  qui l'affiche à l'écran (`lib/semesters.ts`, `lib/helpers.ts`) : le message
 *  et le tableau ne peuvent donc pas se contredire — ce qui serait le pire des
 *  défauts pour un rappel de paiement.
 */

import type { Database } from "@/lib/store/data";
import type { Parent, ScheduleSession, Student } from "@/lib/types";
import {
  dayKeyOf,
  formatDateFr,
  formatDays,
  groupName,
  moduleName as moduleNameOf,
  registrationNumberOf,
  salleName,
  seancePriceOf,
  sessionTimeLabel,
  studentDebt,
  teacherName,
  totalRemainingSeances,
} from "@/lib/helpers";
import { carteLayout, studentSessionMoney, subIdsOfSession } from "@/lib/semesters";
import { soldFor } from "@/lib/helpers";
import type { SituationDetail } from "./templates";
import type { AlertParent, AlertStudent } from "./alert";
import type { WhatsAppTarget } from "@/components/whatsapp/WhatsAppMessageModal";

/** Le chevalier, dans la forme que les modèles attendent. */
export function alertStudentOf(db: Database, student: Student): AlertStudent {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    remainingSeances: totalRemainingSeances(db, student.id),
    debt: studentDebt(db, student.id),
    registrationDue: student.registrationDue,
    registrationNumber: registrationNumberOf(db, student),
    phone: student.phone,
  };
}

/** Le parent rattaché, quand il y en a un. Ses DEUX numéros sont retenus : le
 *  second est celui qu'on compose quand le premier ne répond pas. */
export function alertParentOf(db: Database, student: Student): AlertParent | null {
  const parent: Parent | undefined = student.parentId
    ? db.parents.find((p) => p.id === student.parentId)
    : undefined;
  if (!parent) return null;
  return {
    id: parent.id,
    firstName: parent.firstName,
    lastName: parent.lastName,
    phone: parent.phone,
    phone2: parent.phone2,
  };
}

/** Les présences d'un chevalier sur un emploi du temps, comptées par état. */
function attendanceOf(db: Database, studentId: string, sessionId?: string) {
  let presences = 0;
  let absences = 0;
  let cancelled = 0;
  let firstDay: string | undefined;
  let lastDay: string | undefined;

  for (const a of db.attendance) {
    if (a.studentId !== studentId) continue;
    if (sessionId && a.sessionId !== sessionId) continue;
    const day = dayKeyOf(a.timestamp);
    if (!firstDay || day < firstDay) firstDay = day;
    if (!lastDay || day > lastDay) lastDay = day;
    if (a.status === "absent") absences += 1;
    else if (a.status === "cancelled") cancelled += 1;
    else presences += 1;
  }
  return { presences, absences, cancelled, firstDay, lastDay };
}

/**
 * LE DÉTAIL COMPLET D'UN CHEVALIER SUR UN EMPLOI DU TEMPS.
 *
 * C'est ce que l'écran des semestres fournit : il connaît le semestre, la
 * catégorie et l'emploi du temps ouverts, donc le message peut être précis
 * jusqu'à l'horaire.
 */
export function sessionSituation(
  db: Database,
  student: Student,
  session: ScheduleSession,
  opts: { semesterId?: string; classId?: string } = {},
): SituationDetail {
  const semester = db.semesters.find(
    (s) => s.id === (opts.semesterId ?? session.semesterId),
  );
  const classId = opts.classId ?? session.classId;
  const category = db.classes.find((c) => c.id === classId);

  const cartes = carteLayout(db, session.id);
  const current = cartes.find((c) => !c.complete) ?? cartes[cartes.length - 1];
  const money = studentSessionMoney(db, student.id, session.id);
  const counts = attendanceOf(db, student.id, session.id);

  const subIds = subIdsOfSession(db, session.id);
  const sub = db.subscriptions.find((s) => subIds.includes(s.id) && !s.archivedAt);
  const sold = subIds.reduce((sum, id) => sum + soldFor(db, student.id, id), 0);

  return {
    semesterName: semester?.name,
    semesterStart: semester ? formatDateFr(semester.startDate) : undefined,
    semesterEnd: semester ? formatDateFr(semester.endDate) : undefined,
    categoryName: category?.name,
    groupName: groupName(db, session.groupId),
    emploiTitle: session.title || moduleNameOf(db, session.moduleId) || "Emploi du temps",
    emploiDays: formatDays(session.days),
    emploiTime: sessionTimeLabel(session),
    salleName: salleName(db, session.salleId),
    teacherName: teacherName(db, session.teacherId),
    carteName: current ? `Carte ${current.carte.index}` : undefined,
    carteStart: current?.startDate ? formatDateFr(current.startDate) : undefined,
    carteEnd: current?.endDate ? formatDateFr(current.endDate) : undefined,
    carteHeld: current?.held,
    carteSize: current?.size,
    presences: counts.presences,
    absences: counts.absences,
    cancelled: counts.cancelled,
    paid: money.gains,
    debt: money.debts,
    sold,
    unitPrice: sub ? seancePriceOf(sub) : undefined,
  };
}

/**
 * LE DÉTAIL D'UN CHEVALIER SANS EMPLOI DU TEMPS PARTICULIER.
 *
 * C'est ce que la fiche du chevalier et la fiche du parent fournissent : on ne
 * sait pas de quel créneau on parle, donc on donne la vue d'ensemble — toutes
 * ses présences, tout ce qu'il a versé, tout ce qu'il doit.
 */
export function globalSituation(db: Database, student: Student): SituationDetail {
  const counts = attendanceOf(db, student.id);
  const paid = db.payments
    .filter((p) => p.studentId === student.id)
    .reduce((s, p) => s + (p.amountPaid || 0), 0);

  const sessions = student.subscriptionIds
    .map((id) => db.subscriptions.find((s) => s.id === id))
    .filter(Boolean)
    .map((sub) => db.sessions.find((s) => s.id === sub!.sessionId))
    .filter(Boolean) as ScheduleSession[];

  const semester = db.semesters.find((s) => s.id === sessions[0]?.semesterId);
  const category = db.classes.find((c) => c.id === sessions[0]?.classId);

  return {
    semesterName: semester?.name,
    categoryName: category?.name,
    groupName: sessions.length > 0 ? groupName(db, sessions[0].groupId) : undefined,
    emploiTitle: sessions
      .map((s) => s.title || moduleNameOf(db, s.moduleId))
      .filter(Boolean)
      .join(" · "),
    emploiDays: sessions.length > 0 ? formatDays(sessions[0].days) : undefined,
    emploiTime: sessions.length > 0 ? sessionTimeLabel(sessions[0]) : undefined,
    teacherName: sessions.length > 0 ? teacherName(db, sessions[0].teacherId) : undefined,
    presences: counts.presences,
    absences: counts.absences,
    cancelled: counts.cancelled,
    paid,
    debt: studentDebt(db, student.id),
  };
}

/** La cible d'envoi complète d'un chevalier, sur un emploi du temps ou non. */
export function targetFor(
  db: Database,
  student: Student,
  session?: ScheduleSession,
  opts: { semesterId?: string; classId?: string } = {},
): WhatsAppTarget {
  return {
    student: alertStudentOf(db, student),
    parent: alertParentOf(db, student),
    detail: session
      ? sessionSituation(db, student, session, opts)
      : globalSituation(db, student),
  };
}
