"use client";

import type { Database } from "@/lib/store/data";

/** Keys of `Database` that hold an array of rows (i.e. everything but `school`). */
export type CollectionKey = Exclude<keyof Database, "school">;

/**
 * TOUTES LES COLLECTIONS DU MAGASIN, dans l'ordre des dépendances : une
 * collection n'apparaît qu'après celles auxquelles elle se réfère.
 *
 * L'ordre n'a plus de contrainte technique depuis que la base a disparu — la
 * démonstration travaille sur un instantané en mémoire — mais il reste celui
 * dans lequel une restauration se relit le plus naturellement.
 *
 * La table de vérité ci-dessous est déclarée en `Record<CollectionKey, true>`
 * exprès : oublier une collection devient une erreur de compilation, et non un
 * écran vide découvert en production.
 */
const PRESENT: Record<CollectionKey, true> = {
  classCategories: true,
  modules: true,
  groups: true,
  salles: true,
  classes: true,
  teachers: true,
  workerRoles: true,
  reception: true,
  parents: true,
  sessions: true,
  subscriptions: true,
  students: true,
  studentCredentials: true,
  enrollments: true,
  payments: true,
  studentCharges: true,
  attendance: true,
  absencePenalties: true,
  teacherPayments: true,
  acomptes: true,
  teacherExpenses: true,
  teacherChildDebts: true,
  absences: true,
  unpaidTeacher: true,
  workerShifts: true,
  workerAcomptes: true,
  workerAbsences: true,
  workerPayments: true,
  freePeriods: true,
  moduleAbsenceRules: true,
  subjects: true,
  announcements: true,
  categories: true,
  expenses: true,
  cash: true,
  notifications: true,
  coursework: true,
  independent: true,
  groupSeances: true,
};

export const COLLECTION_ORDER = Object.keys(PRESENT) as CollectionKey[];
