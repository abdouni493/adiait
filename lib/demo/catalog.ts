"use client";

/**
 * LE CATALOGUE DU CLUB DE DÉMONSTRATION.
 *
 * Tout ce qui ne dépend d'aucun chevalier : l'établissement, les matières, les
 * groupes, les arènes, les catégories, les entraîneurs, les travailleurs, les
 * emplois du temps et leurs tarifs.
 *
 * Les identifiants sont des chaînes lisibles (`tea-3`, `ses-12`, `sub-12`) pour
 * qu'une relation se suive à l'œil nu. Un abonnement porte TOUJOURS le même
 * numéro que son emploi du temps : `sub-7` tarife `ses-7`.
 */

import type {
  CashCategory,
  ClassCategory,
  ExpenseCategory,
  Group,
  Module,
  ReceptionStaff,
  Salle,
  ScheduleSession,
  School,
  SchoolClass,
  Subscription,
  Teacher,
  WorkerJobRole,
} from "@/lib/types";
import { TODAY, shiftDays, stamp, weekday } from "./dates";

// ---------------------------------------------------------------------------
// L'établissement
// ---------------------------------------------------------------------------

export const SCHOOL: School = {
  id: "school",
  name: "ALTECH SCHOOL",
  description: "Club privée — cours de soutien, formations et prédu club",
  phone: "0550 12 34 56",
  email: "contact@altech-school.dz",
  address: "12 Rue des Frères Bouadou, Birkhadem, Alger",
  articleFiscal: "16/2024/0012",
  registreCommerce: "16 B 0987654",
  nif: "000916098765432",
  nis: "000916098765400",
  registrationFee: 2000,
  registrationFeeScope: "all",
  // Coupée dans la démonstration : la facturation automatique des absences
  // hebdomadaires réécrirait les chiffres à chaque connexion du personnel.
  absencePenaltyEnabled: false,
  absencePenaltySince: shiftDays(-120),
  absenceWeekStartDay: 5,
};

// ---------------------------------------------------------------------------
// Matières, groupes, arènes, catégories
// ---------------------------------------------------------------------------

export const CLASS_CATEGORIES: ClassCategory[] = [
  { id: "ccat-1", name: "Petite section" },
  { id: "ccat-2", name: "Moyenne section" },
  { id: "ccat-3", name: "Grande section" },
];

export const MODULES: Module[] = [
  { id: "mod-1", name: "Mathématiques" },
  { id: "mod-2", name: "Physique" },
  { id: "mod-3", name: "Anglais" },
  { id: "mod-4", name: "Français" },
  { id: "mod-5", name: "Sciences Naturelles" },
  { id: "mod-6", name: "Arabe" },
  { id: "mod-7", name: "Histoire-Géographie" },
  { id: "mod-8", name: "Philosophie" },
  { id: "mod-9", name: "Informatique" },
  { id: "mod-10", name: "Éveil & Prédu club" },
];

export const GROUPS: Group[] = [
  { id: "grp-1", name: "Groupe A" },
  { id: "grp-2", name: "Groupe B" },
  { id: "grp-3", name: "Groupe C" },
  { id: "grp-4", name: "Groupe D" },
  { id: "grp-5", name: "Groupe E" },
  { id: "grp-6", name: "Groupe F" },
  { id: "grp-7", name: "Groupe Matin" },
  { id: "grp-8", name: "Groupe Soir" },
];

export const SALLES: Salle[] = [
  { id: "sal-1", name: "Arène 1" },
  { id: "sal-2", name: "Arène 2" },
  { id: "sal-3", name: "Arène 3" },
  { id: "sal-4", name: "Arène 4" },
  { id: "sal-5", name: "Arène 5" },
  { id: "sal-6", name: "Arène 6" },
  { id: "sal-7", name: "Laboratoire" },
  { id: "sal-8", name: "Arène Informatique" },
];

export const CLASSES: SchoolClass[] = [
  { id: "cls-1", type: "cours", name: "3ème AS", description: "Terminale — préparation au baccalauréat", coursLevel: "lycee", year: "3AS" },
  { id: "cls-2", type: "cours", name: "2ème AS", description: "Deuxième année secondaire", coursLevel: "lycee", year: "2AS" },
  { id: "cls-3", type: "cours", name: "1ère AS", description: "Première année secondaire — tronc commun", coursLevel: "lycee", year: "1AS" },
  { id: "cls-4", type: "cours", name: "4ème AM", description: "Quatrième année moyenne — préparation au BEM", coursLevel: "moyen", year: "4AM" },
  { id: "cls-5", type: "cours", name: "3ème AM", description: "Troisième année moyenne", coursLevel: "moyen", year: "3AM" },
  { id: "cls-6", type: "cours", name: "2ème AM", description: "Deuxième année moyenne", coursLevel: "moyen", year: "2AM" },
  { id: "cls-7", type: "cours", name: "1ère AM", description: "Première année moyenne", coursLevel: "moyen", year: "1AM" },
  { id: "cls-8", type: "cours", name: "5ème AP", description: "Cinquième année primaire — examen de fin de cycle", coursLevel: "primaire", year: "5AP" },
  { id: "cls-9", type: "cours", name: "4ème AP", description: "Quatrième année primaire", coursLevel: "primaire", year: "4AP" },
  { id: "cls-10", type: "cours", name: "3ème AP", description: "Troisième année primaire", coursLevel: "primaire", year: "3AP" },
  { id: "cls-11", type: "cours", name: "Maternelle · Grande section", description: "Éveil et préparation à la 1ère année primaire", coursLevel: "maternelle", year: "Grande section", categoryId: "ccat-3" },
  { id: "cls-12", type: "formation", name: "Anglais Général", description: "Formation en anglais — niveau intermédiaire", formationLevel: "B1" },
  { id: "cls-13", type: "formation", name: "Français Perfectionnement", description: "Formation en français — niveau avancé", formationLevel: "B2" },
  { id: "cls-14", type: "formation", name: "Informatique Bureautique", description: "Formation bureautique — niveau débutant", formationLevel: "A1" },
  { id: "cls-15", type: "formation", name: "Anglais Débutant", description: "Formation en anglais — premiers pas", formationLevel: "A2" },
];

/**
 * LES RUBRIQUES DE CAISSE de la démonstration.
 *
 * Elles rangent les dépôts et les retraits manuels, pour que la Caisse et les
 * Rapports puissent en donner le total rubrique par rubrique plutôt qu'une
 * longue liste plate.
 */
export const CASH_CATEGORIES: CashCategory[] = [
  { id: "ccat-equipement", name: "Équipement & armement", color: "#b08328" },
  { id: "ccat-entretien", name: "Entretien des arènes", color: "#35506f" },
  { id: "ccat-tournoi", name: "Tournois & déplacements", color: "#15803d" },
  { id: "ccat-apport", name: "Apports & fonds de roulement", color: "#b45309" },
];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "ecat-1", name: "Loyer" },
  { id: "ecat-2", name: "Électricité & Eau" },
  { id: "ecat-3", name: "Fournitures" },
  { id: "ecat-4", name: "Entretien & Réparations" },
  { id: "ecat-5", name: "Publicité & Communication" },
  { id: "ecat-6", name: "Transport" },
  { id: "ecat-7", name: "Impôts & Taxes" },
];

// ---------------------------------------------------------------------------
// Les entraîneurs — les trois modes de paie sont représentés, plus deux
// intervenants de passage, qui n'ont pas de compte de connexion.
// ---------------------------------------------------------------------------

export const TEACHERS: Teacher[] = [
  { id: "tea-1", firstName: "Karim", lastName: "Bensalah", phone: "0661 22 33 44", email: "karim.bensalah@altech-school.dz", paymentType: "percentage", percentage: 60, startDate: shiftDays(-620), createdAt: stamp(-620, "09:00") },
  { id: "tea-2", firstName: "Amina", lastName: "Haddad", phone: "0770 55 66 77", email: "amina.haddad@altech-school.dz", paymentType: "percentage", percentage: 50, startDate: shiftDays(-540), createdAt: stamp(-540, "09:00") },
  { id: "tea-3", firstName: "Sofiane", lastName: "Meziane", phone: "0555 88 99 00", email: "sofiane.meziane@altech-school.dz", paymentType: "monthly", monthlyAmount: 45000, startDate: shiftDays(-480), createdAt: stamp(-480, "09:00") },
  { id: "tea-4", firstName: "Nadia", lastName: "Cherif", phone: "0699 11 22 33", email: "nadia.cherif@altech-school.dz", paymentType: "percentage", percentage: 55, isPassager: true, startDate: shiftDays(-95), createdAt: stamp(-95, "09:00") },
  { id: "tea-5", firstName: "Rachid", lastName: "Loucif", phone: "0662 44 55 66", email: "rachid.loucif@altech-school.dz", paymentType: "per_group", startDate: shiftDays(-410), createdAt: stamp(-410, "09:00") },
  { id: "tea-6", firstName: "Samira", lastName: "Benali", phone: "0771 33 44 55", email: "samira.benali@altech-school.dz", paymentType: "per_group", startDate: shiftDays(-380), createdAt: stamp(-380, "09:00") },
  { id: "tea-7", firstName: "Hakim", lastName: "Zeroual", phone: "0556 12 13 14", email: "hakim.zeroual@altech-school.dz", paymentType: "monthly", monthlyAmount: 52000, startDate: shiftDays(-350), createdAt: stamp(-350, "09:00") },
  { id: "tea-8", firstName: "Leila", lastName: "Mansouri", phone: "0664 77 88 99", email: "leila.mansouri@altech-school.dz", paymentType: "percentage", percentage: 45, startDate: shiftDays(-300), createdAt: stamp(-300, "09:00") },
  { id: "tea-9", firstName: "Djalil", lastName: "Ait Amrane", phone: "0773 21 22 23", email: "djalil.aitamrane@altech-school.dz", paymentType: "per_group", startDate: shiftDays(-260), createdAt: stamp(-260, "09:00") },
  { id: "tea-10", firstName: "Fadila", lastName: "Ghanem", phone: "0551 66 77 88", email: "fadila.ghanem@altech-school.dz", paymentType: "monthly", monthlyAmount: 38000, startDate: shiftDays(-220), createdAt: stamp(-220, "09:00") },
  { id: "tea-11", firstName: "Nourredine", lastName: "Saidi", phone: "0667 90 91 92", email: "nourredine.saidi@altech-school.dz", paymentType: "percentage", percentage: 50, isPassager: true, startDate: shiftDays(-60), createdAt: stamp(-60, "09:00") },
  { id: "tea-12", firstName: "Hayet", lastName: "Boudjema", phone: "0775 10 11 12", email: "hayet.boudjema@altech-school.dz", paymentType: "percentage", percentage: 55, startDate: shiftDays(-190), createdAt: stamp(-190, "09:00") },
];

// ---------------------------------------------------------------------------
// Les travailleurs — les quatre contrats (carte, journée, demi-journée, heures)
// et des métiers que le club a nommés elle-même.
// ---------------------------------------------------------------------------

export const WORKER_ROLES: WorkerJobRole[] = [
  { id: "reception", name: "Réception", createdAt: stamp(-620, "08:00") },
  { id: "security", name: "Agent de sécurité", createdAt: stamp(-620, "08:00") },
  { id: "menage", name: "Ménage", createdAt: stamp(-620, "08:00") },
  { id: "wrl-4", name: "Chauffeur", createdAt: stamp(-300, "08:00") },
  { id: "wrl-5", name: "Cuisinier", createdAt: stamp(-280, "08:00") },
  { id: "wrl-6", name: "Surveillant", createdAt: stamp(-250, "08:00") },
  { id: "wrl-7", name: "Comptable", createdAt: stamp(-240, "08:00") },
];

/** Les écrans d'un travailleur de réception de plein exercice. */
export const FULL_DESK_PAGES = [
  "dashboard", "classes", "planner", "subscriptions", "students", "attendance",
  "independent", "parents", "announcements", "expenses", "cash", "settings",
];

export const WORKERS: ReceptionStaff[] = [
  {
    id: "rec-1", firstName: "Yasmine", lastName: "Belkacem",
    phone: "0771 44 55 66", email: "yasmine.belkacem@altech-school.dz",
    paymentType: "monthly", startDate: shiftDays(-400), salary: 35000,
    role: "reception", rfid: "WRK-001", hasAccount: true, username: "yasmine",
    navKeys: FULL_DESK_PAGES, createdAt: stamp(-400, "08:00"),
  },
  {
    id: "rec-2", firstName: "Omar", lastName: "Slimani",
    phone: "0660 77 88 99", email: "omar.slimani@altech-school.dz",
    paymentType: "hourly", startDate: shiftDays(-120), salary: 0,
    role: "security", rfid: "WRK-002", hourlyRate: 400, createdAt: stamp(-120, "08:00"),
  },
  {
    id: "rec-3", firstName: "Nabil", lastName: "Haddadi",
    phone: "0559 31 32 33", email: "nabil.haddadi@altech-school.dz",
    paymentType: "daily", startDate: shiftDays(-75), salary: 1800,
    role: "wrl-4", rfid: "WRK-003", createdAt: stamp(-75, "08:00"),
  },
  {
    id: "rec-4", firstName: "Fatiha", lastName: "Merabet",
    phone: "0668 41 42 43", email: "fatiha.merabet@altech-school.dz",
    paymentType: "half_day", startDate: shiftDays(-60), salary: 1200,
    role: "menage", rfid: "WRK-004", createdAt: stamp(-60, "08:00"),
  },
  {
    id: "rec-5", firstName: "Sofia", lastName: "Larbi",
    phone: "0776 51 52 53", email: "sofia.larbi@altech-school.dz",
    paymentType: "monthly", startDate: shiftDays(-330), salary: 42000,
    role: "wrl-7", rfid: "WRK-005", hasAccount: true, username: "sofia",
    navKeys: ["dashboard", "cash", "expenses", "reports", "settings"],
    actionKeys: [
      "dashboard:open_presence", "cash:deposit", "cash:withdraw", "cash:edit",
      "expenses:create", "expenses:edit", "expenses:delete", "settings:security",
    ],
    createdAt: stamp(-330, "08:00"),
  },
  {
    id: "rec-6", firstName: "Toufik", lastName: "Amrouche",
    phone: "0553 61 62 63", email: "toufik.amrouche@altech-school.dz",
    paymentType: "hourly", startDate: shiftDays(-90), salary: 0,
    role: "wrl-6", rfid: "WRK-006", hourlyRate: 350, createdAt: stamp(-90, "08:00"),
  },
  {
    id: "rec-7", firstName: "Karima", lastName: "Belaid",
    phone: "0665 71 72 73", email: "karima.belaid@altech-school.dz",
    paymentType: "daily", startDate: shiftDays(-50), salary: 2000,
    role: "wrl-5", rfid: "WRK-007", createdAt: stamp(-50, "08:00"),
  },
  {
    id: "rec-8", firstName: "Bilal", lastName: "Ghezali",
    phone: "0779 81 82 83", email: "bilal.ghezali@altech-school.dz",
    paymentType: "monthly", startDate: shiftDays(-150), salary: 30000,
    role: "security", rfid: "WRK-008", hasAccount: true, username: "bilal",
    navKeys: ["dashboard", "attendance", "students"],
    actionKeys: ["dashboard:open_presence", "attendance:mark", "students:view", "students:scan"],
    createdAt: stamp(-150, "08:00"),
  },
];

// ---------------------------------------------------------------------------
// Les emplois du temps
//
// Plusieurs tombent AUJOURD'HUI, pour que le tableau de bord, la feuille de
// présence et le scan aient toujours de quoi travailler. On y trouve aussi les
// variantes que l'application sait gérer : horaires et arènes qui changent d'un
// jour à l'autre, emploi à cheval sur deux niveaux, séances libres, et un
// emploi ARCHIVÉ dont l'historique reste lisible.
// ---------------------------------------------------------------------------

export const SESSIONS: ScheduleSession[] = [
  {
    id: "ses-1", classId: "cls-1", moduleId: "mod-1", groupId: "grp-1", salleId: "sal-1",
    teacherId: "tea-1", days: [TODAY, weekday(2), weekday(4)],
    startTime: "08:00", endTime: "10:00",
    // L'arène change le jour du milieu : la 1 est prise par le laboratoire.
    daySalles: { [weekday(2)]: "sal-7" },
  },
  {
    id: "ses-2", classId: "cls-1", moduleId: "mod-1", groupId: "grp-2", salleId: "sal-2",
    teacherId: "tea-1", days: [TODAY, weekday(3)], startTime: "10:00", endTime: "12:00",
  },
  {
    id: "ses-3", classId: "cls-1", moduleId: "mod-2", groupId: "grp-1", salleId: "sal-1",
    teacherId: "tea-2", days: [TODAY, weekday(2)], startTime: "14:00", endTime: "16:00",
  },
  {
    id: "ses-4", classId: "cls-4", moduleId: "mod-4", groupId: "grp-3", salleId: "sal-3",
    teacherId: "tea-3", days: [weekday(1), weekday(3)], startTime: "09:00", endTime: "11:00",
  },
  {
    id: "ses-5", classId: "cls-12", moduleId: "mod-3", groupId: "grp-1", salleId: "sal-2",
    teacherId: "tea-12", days: [TODAY, weekday(3)], startTime: "16:00", endTime: "18:00",
  },
  {
    id: "ses-6", classId: "cls-1", moduleId: "mod-2", groupId: "grp-3", salleId: "sal-3",
    teacherId: "tea-4", days: [TODAY, weekday(1), weekday(2)],
    startTime: "18:00", endTime: "20:00",
    isOpen: true, title: "Séance libre — Révision Physique",
    periodStart: shiftDays(-45), periodEnd: shiftDays(60),
    classIds: ["cls-1", "cls-2"], groupIds: ["grp-1", "grp-2", "grp-3"], salleIds: ["sal-3"],
    openPrice: 800,
  },
  {
    id: "ses-7", classId: "cls-2", moduleId: "mod-5", groupId: "grp-4", salleId: "sal-7",
    teacherId: "tea-5", days: [weekday(1), weekday(4)], startTime: "08:00", endTime: "10:00",
  },
  {
    id: "ses-8", classId: "cls-3", moduleId: "mod-6", groupId: "grp-2", salleId: "sal-5",
    teacherId: "tea-6", days: [TODAY, weekday(2)], startTime: "10:00", endTime: "11:30",
    // Le samedi commence plus tôt : le club ouvre à 8h ce jour-là.
    dayTimes: { [weekday(2)]: { startTime: "08:30", endTime: "10:00" } },
  },
  {
    id: "ses-9", classId: "cls-5", moduleId: "mod-1", groupId: "grp-5", salleId: "sal-1",
    teacherId: "tea-1", days: [weekday(2), weekday(5)], startTime: "14:00", endTime: "16:00",
  },
  {
    id: "ses-10", classId: "cls-8", moduleId: "mod-4", groupId: "grp-6", salleId: "sal-6",
    teacherId: "tea-3", days: [TODAY, weekday(4)], startTime: "13:00", endTime: "14:30",
  },
  {
    id: "ses-11", classId: "cls-1", moduleId: "mod-8", groupId: "grp-1", salleId: "sal-4",
    teacherId: "tea-8", days: [weekday(3)], startTime: "16:00", endTime: "18:00",
  },
  {
    id: "ses-12", classId: "cls-2", moduleId: "mod-7", groupId: "grp-2", salleId: "sal-5",
    teacherId: "tea-7", days: [TODAY, weekday(3)], startTime: "11:00", endTime: "12:30",
    // Un même créneau qui réunit deux niveaux, chacun avec SES groupes.
    classGroups: { "cls-2": ["grp-2", "grp-4"], "cls-1": ["grp-1"] },
  },
  {
    id: "ses-13", classId: "cls-14", moduleId: "mod-9", groupId: "grp-7", salleId: "sal-8",
    teacherId: "tea-9", days: [weekday(1), weekday(4)], startTime: "17:00", endTime: "19:00",
  },
  {
    id: "ses-14", classId: "cls-11", moduleId: "mod-10", groupId: "grp-7", salleId: "sal-6",
    teacherId: "tea-10", days: [TODAY, weekday(1), weekday(2), weekday(3)],
    startTime: "08:30", endTime: "11:30",
  },
  {
    id: "ses-15", classId: "cls-4", moduleId: "mod-3", groupId: "grp-3", salleId: "sal-2",
    teacherId: "tea-12", days: [weekday(2), weekday(5)], startTime: "15:00", endTime: "16:30",
  },
  {
    id: "ses-16", classId: "cls-5", moduleId: "mod-1", groupId: "grp-5", salleId: "sal-4",
    teacherId: "tea-11", days: [weekday(1), weekday(4)], startTime: "18:00", endTime: "20:00",
    isOpen: true, title: "Séance libre — Soutien Mathématiques",
    periodStart: shiftDays(-30), periodEnd: shiftDays(75),
    classIds: ["cls-4", "cls-5"], groupIds: ["grp-3", "grp-5"], salleIds: ["sal-4"],
    openPrice: 700,
  },
  {
    id: "ses-17", classId: "cls-7", moduleId: "mod-5", groupId: "grp-4", salleId: "sal-3",
    teacherId: "tea-5", days: [TODAY, weekday(4)], startTime: "09:00", endTime: "10:30",
    // Archivé la carte dernier : il disparaît de la grille mais son historique
    // (présences, soldes, parts dues) reste lisible partout où il apparaît.
    archivedAt: shiftDays(-25),
  },
  {
    id: "ses-18", classId: "cls-13", moduleId: "mod-4", groupId: "grp-8", salleId: "sal-5",
    teacherId: "tea-3", days: [weekday(2), weekday(5)], startTime: "18:00", endTime: "20:00",
  },
  {
    id: "ses-19", classId: "cls-6", moduleId: "mod-6", groupId: "grp-6", salleId: "sal-3",
    teacherId: "tea-6", days: [TODAY, weekday(5)], startTime: "16:30", endTime: "18:00",
  },
  {
    id: "ses-20", classId: "cls-15", moduleId: "mod-3", groupId: "grp-8", salleId: "sal-2",
    teacherId: "tea-2", days: [weekday(1), weekday(3)], startTime: "18:30", endTime: "20:00",
  },
];

// ---------------------------------------------------------------------------
// Les tarifs
//
// Le prix est TOUJOURS celui d'une séance ; un cours se vend en plus au CARTE
// (un pack de séances à prix fixe, souvent moins cher que les mêmes séances
// achetées à l'unité). `schoolMonthShare` dit ce que le club garde de la carte : le
// reste est la part de l'entraîneur, et c'est elle que sa paie lui règle.
// ---------------------------------------------------------------------------

/** Fabrique un tarif par carte cohérent : prix de la carte, part club, part séance. */
function monthly(
  id: string,
  sessionId: string,
  pricePerSession: number,
  seances: number,
  monthlyPrice: number,
  schoolMonthShare: number,
): Subscription {
  return {
    id,
    sessionId,
    pricePerSession,
    monthlySeances: seances,
    monthlyPrice,
    schoolMonthShare,
    teacherPerSeance: money((monthlyPrice - schoolMonthShare) / seances),
  };
}

/** Arrondi au dinar près — recopié de `lib/utils` pour éviter un import croisé. */
function money(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const SUBSCRIPTIONS: Subscription[] = [
  monthly("sub-1", "ses-1", 600, 8, 4200, 2200),
  monthly("sub-2", "ses-2", 600, 8, 4400, 2400),
  monthly("sub-3", "ses-3", 700, 8, 5000, 2600),
  monthly("sub-4", "ses-4", 500, 8, 3600, 1600),
  {
    id: "sub-5", sessionId: "ses-5", pricePerSession: 900,
    levelPrice: 36000, periodMonths: 6,
  },
  { id: "sub-6", sessionId: "ses-6", pricePerSession: 800 },
  monthly("sub-7", "ses-7", 650, 8, 4800, 2400),
  monthly("sub-8", "ses-8", 450, 8, 3200, 1600),
  monthly("sub-9", "ses-9", 550, 8, 4000, 2000),
  monthly("sub-10", "ses-10", 400, 8, 2800, 1400),
  monthly("sub-11", "ses-11", 750, 4, 2800, 1400),
  monthly("sub-12", "ses-12", 500, 8, 3600, 3600),
  {
    id: "sub-13", sessionId: "ses-13", pricePerSession: 1000,
    levelPrice: 24000, periodMonths: 3,
  },
  monthly("sub-14", "ses-14", 350, 12, 3600, 1800),
  monthly("sub-15", "ses-15", 500, 8, 3600, 1800),
  { id: "sub-16", sessionId: "ses-16", pricePerSession: 700 },
  {
    // Archivé avec son emploi du temps : les soldes qu'il porte restent lisibles.
    ...monthly("sub-17", "ses-17", 450, 8, 3200, 1600),
    archivedAt: shiftDays(-25),
  },
  {
    id: "sub-18", sessionId: "ses-18", pricePerSession: 950,
    levelPrice: 38000, periodMonths: 5,
  },
  monthly("sub-19", "ses-19", 400, 8, 2800, 1200),
  {
    id: "sub-20", sessionId: "ses-20", pricePerSession: 800,
    levelPrice: 28000, periodMonths: 4,
  },
];
