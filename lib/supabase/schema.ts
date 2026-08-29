"use client";

/**
 * LA CORRESPONDANCE ENTRE LE MAGASIN ET LA BASE.
 *
 * Chaque collection de `Database` (`lib/store/data.ts`) a sa table, sa clé
 * primaire et la liste EXACTE de ses colonnes. Ce fichier est ENGENDRÉ à partir
 * de `supabase/schema.sql` : les deux ne peuvent pas diverger.
 *
 * À QUOI SERT LA LISTE DES COLONNES : une ligne du magasin peut porter un champ
 * calculé qui n'existe pas en base. On n'envoie que ce que la table connaît,
 * plutôt que de laisser PostgreSQL refuser tout l'envoi pour une colonne de
 * trop.
 *
 * L'ORDRE DE CE FICHIER EST L'ORDRE D'ÉCRITURE : une table n'apparaît qu'après
 * celles auxquelles elle se réfère. Les suppressions se font dans l'ordre
 * inverse.
 */

import type { Database } from "@/lib/store/data";

export type CollectionKey = Exclude<keyof Database, "school">;

export interface TableSpec {
  /** le nom de la table dans PostgreSQL */
  table: string;
  /** la colonne qui identifie une ligne (`id`, sauf deux exceptions) */
  pk: string;
  /** tout ce que la table sait stocker — rien d'autre ne part */
  columns: readonly string[];
  /**
   * LES COLONNES OÙ « RIEN » S'ÉCRIT `null`, ET NON `""`.
   *
   * Ce sont les CLÉS ÉTRANGÈRES. Un écran qui n'a pas de module à donner pose
   * une chaîne vide — c'est le comportement naturel d'un champ de formulaire —
   * mais PostgreSQL, lui, cherche alors une ligne dont l'identifiant vaut
   * exactement `""`. Elle n'existe pas, la contrainte est violée, et TOUT
   * l'enregistrement est refusé pour un champ facultatif laissé vide.
   *
   * « Vide » veut dire « aucun », et « aucun » s'écrit `null`. La traduction se
   * fait ici, une fois, plutôt que dans les vingt écrans qui écrivent ces
   * lignes.
   */
  emptyAsNull?: readonly string[];
}

/** L'établissement : une seule ligne, et pas une collection. */
export const SCHOOL_TABLE: TableSpec = {
  table: "schools",
  pk: "id",
  columns: ["id", "name", "description", "phone", "email", "logo", "address", "article_fiscal", "registre_commerce", "nif", "nis", "registration_fee", "registration_fee_scope", "registration_fee_levels", "registration_fee_class_ids", "registration_fee_session_ids", "absence_penalty_enabled", "absence_penalty_since", "absence_week_start_day", "updated_at"],
};

/** La ligne unique de l'établissement. */
export const SCHOOL_ROW_ID = "school";

export const TABLES: Record<CollectionKey, TableSpec> = {
  classCategories: { table: "class_categories", pk: "id", columns: ["id", "name", "created_by", "created_by_name", "created_by_role"] },
  modules: { table: "modules", pk: "id", columns: ["id", "name", "created_by", "created_by_name", "created_by_role"] },
  groups: { table: "groups", pk: "id", columns: ["id", "name", "class_id", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["class_id"] },
  salles: { table: "salles", pk: "id", columns: ["id", "name", "created_by", "created_by_name", "created_by_role"] },
  classes: { table: "classes", pk: "id", columns: ["id", "type", "name", "description", "age_from", "age_to", "cours_level", "year", "category_id", "formation_level", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["category_id"] },
  teachers: { table: "teachers", pk: "id", columns: ["id", "first_name", "last_name", "phone", "email", "payment_type", "monthly_amount", "start_date", "percentage", "is_passager", "created_at", "created_by", "created_by_name", "created_by_role"] },
  workerRoles: { table: "worker_job_roles", pk: "id", columns: ["id", "name", "created_at", "created_by", "created_by_name", "created_by_role"] },
  reception: { table: "reception_staff", pk: "id", columns: ["id", "first_name", "last_name", "phone", "email", "payment_type", "start_date", "salary", "role", "rfid", "hourly_rate", "has_account", "username", "nav_keys", "action_keys", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["role"] },
  parents: { table: "parents", pk: "id", columns: ["id", "first_name", "last_name", "phone", "phone2", "birth_date", "address", "email", "child_ids", "created_by", "created_by_name", "created_by_role"] },
  sessions: { table: "schedule_sessions", pk: "id", columns: ["id", "class_id", "module_id", "group_id", "salle_id", "teacher_id", "days", "start_time", "end_time", "day_times", "day_slots", "day_salles", "class_groups", "is_open", "title", "period_start", "period_end", "class_ids", "group_ids", "salle_ids", "open_price", "archived_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["class_id", "module_id", "group_id", "salle_id", "teacher_id"] },
  subscriptions: { table: "subscriptions", pk: "id", columns: ["id", "session_id", "price_per_session", "level_price", "period_months", "monthly_seances", "monthly_price", "school_month_share", "transport_month_share", "teacher_per_seance", "engagement_fee", "engagement_description", "archived_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["session_id"] },
  students: { table: "students", pk: "id", columns: ["id", "registration_number", "first_name", "last_name", "birth_date", "phone", "phone2", "email", "address", "rfid", "is_free", "student_case", "free_subscription_ids", "teacher_father_id", "case_reduction", "unpaid_teacher_ids", "school_only_subscription_ids", "enrollment_level", "enrollment_year", "parent_id", "subscription_ids", "subscription_dates", "subscription_discounts", "registration_due", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["teacher_father_id", "parent_id"] },
  studentCredentials: { table: "student_credentials", pk: "student_id", columns: ["student_id", "password", "updated_at"] },
  enrollments: { table: "enrollments", pk: "id", columns: ["id", "student_id", "subscription_id", "paid_seances", "consumed_seances", "discount", "start_date", "expiry_date", "plan", "month_seances", "balance", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["student_id", "subscription_id"] },
  payments: { table: "payments", pk: "id", columns: ["id", "student_id", "enrollment_id", "subscription_id", "month_code", "seances_purchased", "unit_price", "gross_total", "plan", "discount_type", "discount_value", "net_total", "amount_paid", "rest", "type", "paid_from", "charge_id", "date", "description", "alert_read", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["student_id", "enrollment_id", "subscription_id", "charge_id"] },
  studentCharges: { table: "student_charges", pk: "id", columns: ["id", "student_id", "name", "amount", "description", "date", "origin", "source_payment_id", "subscription_id", "month_code", "paid_amount", "paid", "payment_id", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["student_id", "subscription_id", "source_payment_id", "payment_id"] },
  attendance: { table: "attendance_records", pk: "id", columns: ["id", "student_id", "session_id", "timestamp", "amount_deducted", "status", "slot", "substitute_group", "free_period_id", "pre_start", "waived_amount", "no_charge", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["student_id", "session_id", "free_period_id"] },
  absencePenalties: { table: "absence_penalties", pk: "id", columns: ["id", "student_id", "subscription_id", "session_id", "module_id", "period_start", "period_end", "amount", "remaining_after", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["student_id", "subscription_id", "session_id", "module_id"] },
  teacherPayments: { table: "teacher_payments", pk: "id", columns: ["id", "teacher_id", "amount", "method", "percentage", "students_count", "sessions_count", "description", "details", "gross", "expenses", "acomptes", "child_charges", "child_debts", "months", "arrears", "cash_id", "board", "paid_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["teacher_id", "cash_id"] },
  acomptes: { table: "teacher_acomptes", pk: "id", columns: ["id", "teacher_id", "amount", "description", "date", "paid", "payment_id", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["teacher_id", "payment_id"] },
  teacherExpenses: { table: "teacher_expenses", pk: "id", columns: ["id", "teacher_id", "name", "amount", "description", "date", "paid", "payment_id", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["teacher_id", "payment_id"] },
  teacherChildDebts: { table: "teacher_child_debts", pk: "id", columns: ["id", "teacher_id", "student_id", "subscription_id", "month_code", "label", "amount", "date", "paid", "payment_id", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["teacher_id", "student_id", "subscription_id", "payment_id"] },
  absences: { table: "teacher_absences", pk: "id", columns: ["id", "teacher_id", "cost", "description", "date", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["teacher_id"] },
  unpaidTeacher: { table: "unpaid_teacher_sessions", pk: "id", columns: ["id", "teacher_id", "session_id", "student_id", "amount", "date", "slot", "paid", "payment_id", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["teacher_id", "session_id", "student_id", "payment_id"] },
  workerPayments: { table: "worker_payments", pk: "id", columns: ["id", "worker_id", "kind", "period_keys", "shift_ids", "gross", "acomptes", "absences", "net", "amount", "date", "description", "cash_id", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["worker_id", "cash_id"] },
  workerShifts: { table: "worker_shifts", pk: "id", columns: ["id", "worker_id", "work_date", "start_at", "end_at", "minutes", "frozen", "paid", "payment_id", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["worker_id", "payment_id"] },
  workerAcomptes: { table: "worker_acomptes", pk: "id", columns: ["id", "worker_id", "amount", "description", "date", "paid", "payment_id", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["worker_id", "payment_id"] },
  workerAbsences: { table: "worker_absences", pk: "id", columns: ["id", "worker_id", "cost", "description", "date", "paid", "payment_id", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["worker_id", "payment_id"] },
  freePeriods: { table: "free_periods", pk: "id", columns: ["id", "name", "description", "start_date", "end_date", "all_classes", "class_ids", "pay_teachers", "active", "created_at", "created_by", "created_by_name", "created_by_role"] },
  moduleAbsenceRules: { table: "module_absence_rules", pk: "module_id", columns: ["module_id", "enabled", "days_window"] },
  announcements: { table: "announcements", pk: "id", columns: ["id", "title", "description", "audience", "end_date", "date", "target_group_ids", "include_parents", "created_by", "created_by_name", "created_by_role"] },
  categories: { table: "expense_categories", pk: "id", columns: ["id", "name", "created_by", "created_by_name", "created_by_role"] },
  expenses: { table: "expenses", pk: "id", columns: ["id", "name", "category_id", "amount", "date", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["category_id"] },
  cashCategories: { table: "cash_categories", pk: "id", columns: ["id", "name", "color", "created_at", "created_by", "created_by_name", "created_by_role"] },
  cash: { table: "cash_transactions", pk: "id", columns: ["id", "type", "amount", "date", "description", "category_id", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["category_id"] },
  notifications: { table: "notifications", pk: "id", columns: ["id", "parent_id", "title", "description", "date", "read", "auto", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["parent_id"] },
  coursework: { table: "coursework", pk: "id", columns: ["id", "name", "type", "dates", "price_per_session", "total", "teacher_id", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["teacher_id"] },
  independent: { table: "independent_sessions", pk: "id", columns: ["id", "student_id", "passager_name", "item_label", "price", "date", "session_id", "start_time", "end_time", "created_at", "teacher_paid", "school_share", "teacher_id", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["student_id", "session_id", "teacher_id"] },
  groupSeances: { table: "group_seances", pk: "id", columns: ["id", "teacher_id", "title", "description", "date", "start_time", "end_time", "students_count", "price_per_student", "school_per_student", "cash_in_id", "cash_out_id", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["teacher_id", "cash_in_id", "cash_out_id"] },
  accountRequests: { table: "account_requests", pk: "id", columns: ["id", "account_id", "kind", "first_name", "last_name", "phone", "phone2", "birth_date", "address", "email", "existing_member", "children_subscribed", "children", "status", "linked_entity_id", "linked_child_ids", "reviewed_at", "reviewed_by", "reviewed_by_name", "created_at", "created_by", "created_by_name", "created_by_role"], emptyAsNull: ["linked_entity_id"] },
};

/** L'ordre d'écriture : les dépendances d'abord. */
export const WRITE_ORDER = Object.keys(TABLES) as CollectionKey[];

/** L'ordre de suppression : l'inverse. */
export const DELETE_ORDER = [...WRITE_ORDER].reverse();
