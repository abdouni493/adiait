"use client";

/**
 * TOUT LE RESTE DE LE CLUB DE DÉMONSTRATION : les supports de cours, les
 * annonces, les dépenses, les périodes gratuites, les séances libres vendues à
 * l'unité ou au groupe, les notifications des parents et les stages.
 *
 * Ces collections n'entrent dans aucun calcul de cotisation — elles remplissent
 * les écrans qui, sans elles, s'ouvriraient sur un état vide.
 */

import type {
  AbsencePenalty,
  Announcement,
  Coursework,
  Expense,
  FreePeriod,
  GroupSeance,
  IndependentSession,
  ModuleAbsenceRule,
  Notification,
  Student,
  StudentCredential,
  Subject,
} from "@/lib/types";
import { choose, pick, shiftDays, stamp, stampOn } from "./dates";

// ---------------------------------------------------------------------------
//  Les périodes gratuites et les règles d'absence
// ---------------------------------------------------------------------------

export const FREE_PERIODS: FreePeriod[] = [
  {
    id: "frp-1",
    name: "Semaine portes ouvertes",
    description: "Séances offertes à toutes les catégories pendant la rentrée",
    startDate: shiftDays(-58),
    endDate: shiftDays(-52),
    allClasses: true,
    classIds: [],
    payTeachers: true,
    active: false,
    createdAt: stamp(-62, "09:00"),
  },
  {
    id: "frp-2",
    name: "Rattrapage du BEM",
    description: "Trois séances offertes aux catégories de 4ème AM avant l'examen",
    startDate: shiftDays(-20),
    endDate: shiftDays(-17),
    allClasses: false,
    classIds: ["cls-4"],
    payTeachers: true,
    active: false,
    createdAt: stamp(-24, "09:00"),
  },
  {
    id: "frp-3",
    name: "Journée découverte — Maternelle",
    description: "Journée offerte aux familles de la grande section",
    startDate: shiftDays(2),
    endDate: shiftDays(3),
    allClasses: false,
    classIds: ["cls-11"],
    payTeachers: true,
    active: true,
    createdAt: stamp(-4, "09:00"),
  },
];

export const MODULE_ABSENCE_RULES: ModuleAbsenceRule[] = [
  { moduleId: "mod-1", enabled: true, daysWindow: 7 },
  { moduleId: "mod-2", enabled: true, daysWindow: 7 },
  { moduleId: "mod-3", enabled: false, daysWindow: 7 },
  { moduleId: "mod-4", enabled: true, daysWindow: 14 },
  { moduleId: "mod-10", enabled: false, daysWindow: 7 },
];

// ---------------------------------------------------------------------------
//  Les supports de cours
// ---------------------------------------------------------------------------

export const SUBJECTS: Subject[] = [
  { id: "suj-1", title: "Série d'exercices — Suites numériques", description: "Exercices 1 à 12, à rendre pour la prochaine séance.", sessionId: "ses-1", date: stamp(-4, "18:00") },
  { id: "suj-2", title: "TP — Lois de Newton", description: "Compte-rendu du TP réalisé en arène 1.", sessionId: "ses-3", date: stamp(-3, "17:00") },
  { id: "suj-3", title: "Sujet type BAC — Analyse", description: "Sujet complet avec corrigé détaillé, 4 heures.", sessionId: "ses-2", date: stamp(-9, "19:00") },
  { id: "suj-4", title: "Fiche de vocabulaire — Unit 6", description: "150 mots à mémoriser avant l'évaluation.", sessionId: "ses-5", date: stamp(-6, "18:30") },
  { id: "suj-5", title: "Dictée préparée — Les accords", description: "Texte à travailler à la maison.", sessionId: "ses-4", date: stamp(-8, "12:00") },
  { id: "suj-6", title: "Schéma bilan — La photosynthèse", description: "À compléter et à coller dans le cahier.", sessionId: "ses-7", date: stamp(-5, "11:00") },
  { id: "suj-7", title: "Texte d'étude — La poésie moderne", description: "Lecture analytique, questions 1 à 8.", sessionId: "ses-8", date: stamp(-11, "12:00") },
  { id: "suj-8", title: "Devoir surveillé n°3", description: "Sujet et barème du DS de mathématiques.", sessionId: "ses-9", date: stamp(-2, "16:30") },
  { id: "suj-9", title: "Carte muette — Le Maghreb", description: "À compléter pour la prochaine séance.", sessionId: "ses-12", date: stamp(-7, "13:00") },
  { id: "suj-10", title: "Support Excel — Formules de base", description: "Catégorieur d'exercices, à télécharger et à remplir.", sessionId: "ses-13", date: stamp(-10, "19:30") },
  { id: "suj-11", title: "Dissertation — La conscience", description: "Plan détaillé attendu pour la séance suivante.", sessionId: "ses-11", date: stamp(-13, "18:00") },
  { id: "suj-12", title: "Comptine de la semaine", description: "À réciter avec les parents.", sessionId: "ses-14", date: stamp(-1, "11:30") },
];

// ---------------------------------------------------------------------------
//  Les annonces
// ---------------------------------------------------------------------------

export const ANNOUNCEMENTS: Announcement[] = [
  { id: "ann-1", title: "Reprise des cours", description: "Les cours reprennent normalement cette semaine, aux horaires habituels.", audience: "all", endDate: shiftDays(14), date: stamp(-2, "09:00"), targetGroupIds: [], includeParents: true },
  { id: "ann-2", title: "Réunion parents — 3ème AS", description: "Réunion avec les parents des chevaliers de 3ème AS samedi à 10h en arène 1.", audience: "parents", endDate: shiftDays(7), date: stamp(-1, "16:00"), targetGroupIds: ["grp-1"], includeParents: true },
  { id: "ann-3", title: "Examen blanc du baccalauréat", description: "L'examen blanc se tiendra sur trois jours. Le planning détaillé est affiché à la réception.", audience: "students", endDate: shiftDays(21), date: stamp(-5, "10:00"), targetGroupIds: ["grp-1", "grp-2"], includeParents: true },
  { id: "ann-4", title: "Fermeture exceptionnelle", description: "L'établissement sera fermé vendredi pour travaux de maintenance.", audience: "all", endDate: shiftDays(5), date: stamp(-3, "08:30"), targetGroupIds: [], includeParents: true },
  { id: "ann-5", title: "Note aux entraîneurs — fiches de paie", description: "Les fiches de paie de la carte sont disponibles à la comptabilité à partir de jeudi.", audience: "teachers", endDate: shiftDays(10), date: stamp(-4, "14:00"), targetGroupIds: [] },
  { id: "ann-6", title: "Inscriptions aux stages intensifs", description: "Les inscriptions au stage intensif de mathématiques sont ouvertes à la réception.", audience: "all", endDate: shiftDays(18), date: stamp(-6, "11:00"), targetGroupIds: [], includeParents: true },
  { id: "ann-7", title: "Sortie pédagogique — Maternelle", description: "Sortie au jardin d'essai prévue la carte prochain. Autorisation à signer.", audience: "parents", endDate: shiftDays(25), date: stamp(-7, "09:30"), targetGroupIds: ["grp-7"], includeParents: true },
  { id: "ann-8", title: "Rappel — Cartes RFID", description: "Merci de rappeler à votre enfant d'apporter sa carte à chaque séance.", audience: "parents", endDate: shiftDays(30), date: stamp(-9, "17:00"), targetGroupIds: [], includeParents: true },
];

// ---------------------------------------------------------------------------
//  Les dépenses du club
// ---------------------------------------------------------------------------

const EXPENSE_TEMPLATES: { name: string; categoryId: string; amount: number }[] = [
  { name: "Loyer du local", categoryId: "ecat-1", amount: 60000 },
  { name: "Facture Sonelgaz", categoryId: "ecat-2", amount: 9500 },
  { name: "Facture d'eau (SEAAL)", categoryId: "ecat-2", amount: 3400 },
  { name: "Ramettes de papier A4", categoryId: "ecat-3", amount: 3200 },
  { name: "Cartouches d'encre", categoryId: "ecat-3", amount: 7800 },
  { name: "Réparation photocopieuse", categoryId: "ecat-4", amount: 12000 },
  { name: "Peinture des arènes", categoryId: "ecat-4", amount: 24000 },
  { name: "Impression de flyers", categoryId: "ecat-5", amount: 8500 },
  { name: "Panneau publicitaire", categoryId: "ecat-5", amount: 18000 },
  { name: "Carburant du minibus", categoryId: "ecat-6", amount: 6000 },
  { name: "Entretien du minibus", categoryId: "ecat-6", amount: 15500 },
  { name: "Taxe communale", categoryId: "ecat-7", amount: 22000 },
  { name: "Abonnement Internet", categoryId: "ecat-2", amount: 4500 },
  { name: "Produits d'entretien", categoryId: "ecat-3", amount: 5200 },
  { name: "Extincteurs — contrôle annuel", categoryId: "ecat-4", amount: 9800 },
];

/** Les dépenses des quatre derniers carte, une poignée par carte. */
export function buildExpenses(): Expense[] {
  const out: Expense[] = [];
  let n = 1;
  for (let month = 3; month >= 0; month--) {
    for (const tpl of EXPENSE_TEMPLATES) {
      const seed = `exp:${month}:${tpl.name}`;
      // Toutes les dépenses ne tombent pas tous les cartes : le loyer si, la
      // peinture des arènes non.
      if (month > 0 && pick(seed, 0, 2) === 0) continue;
      const day = shiftDays(-(month * 30 + pick(seed + ":d", 1, 27)));
      out.push({
        id: `exp-${n++}`,
        name: tpl.name,
        categoryId: tpl.categoryId,
        amount: tpl.amount,
        date: stampOn(day, "10:00"),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Les stages
// ---------------------------------------------------------------------------

export const COURSEWORK: Coursework[] = [
  { id: "cwk-1", name: "Stage intensif — Mathématiques 3AS", type: "period", dates: [shiftDays(10), shiftDays(11), shiftDays(12)], pricePerSession: 1200, total: 3600, teacherId: "tea-1" },
  { id: "cwk-2", name: "Atelier de méthodologie — Philosophie", type: "single", dates: [shiftDays(6)], pricePerSession: 900, total: 900, teacherId: "tea-8" },
  { id: "cwk-3", name: "Stage de révision — Physique", type: "period", dates: [shiftDays(16), shiftDays(17)], pricePerSession: 1100, total: 2200, teacherId: "tea-2" },
  { id: "cwk-4", name: "Préparation TOEFL — session intensive", type: "period", dates: [shiftDays(20), shiftDays(21), shiftDays(22), shiftDays(23)], pricePerSession: 1500, total: 6000, teacherId: "tea-12" },
];

// ---------------------------------------------------------------------------
//  Les séances libres vendues à l'unité (les chevaliers de passage)
// ---------------------------------------------------------------------------

const PASSAGER_NAMES = [
  "Walid Tounsi", "Sabrina Merzouk", "Nassim Bouchama", "Lydia Ferradj",
  "Kamel Ait Ouarab", "Nadjib Chelbi", "Feriel Belkhodja", "Mounir Djaballah",
  "Anissa Berkane", "Tarek Ghellab", "Hind Saoudi", "Djamila Kessai",
];

/**
 * Les séances vendues à l'unité, sur les deux créneaux « séance libre ».
 * Le club garde une part du prix, le reste revient à l'entraîneur — et c'est
 * cette part-là que sa fiche de paie lui règle, passager par passager.
 */
export function buildIndependent(students: Student[]): IndependentSession[] {
  const out: IndependentSession[] = [];
  const slots = [
    { sessionId: "ses-6", teacherId: "tea-4", label: "Séance libre — Révision Physique", price: 800, schoolShare: 350, start: "18:00", end: "20:00" },
    { sessionId: "ses-16", teacherId: "tea-11", label: "Séance libre — Soutien Mathématiques", price: 700, schoolShare: 300, start: "18:00", end: "20:00" },
  ];

  let n = 1;
  for (const slot of slots) {
    for (let back = 34; back >= 1; back -= 3) {
      const seed = `${slot.sessionId}:${back}`;
      if (pick(seed, 0, 2) === 0) continue;
      const day = shiftDays(-back);
      // Un passager sur trois est en réalité un chevalier inscrit qui vient en plus.
      const asStudent = pick(`${seed}:who`, 0, 2) === 0 && students.length > 0;
      const student = asStudent ? students[pick(`${seed}:stu`, 0, students.length - 1)] : undefined;

      out.push({
        id: `ind-${n++}`,
        ...(student
          ? { studentId: student.id }
          : { passagerName: choose(`${seed}:name`, PASSAGER_NAMES) }),
        itemLabel: slot.label,
        price: slot.price,
        schoolShare: slot.schoolShare,
        teacherId: slot.teacherId,
        date: day,
        sessionId: slot.sessionId,
        startTime: slot.start,
        endTime: slot.end,
        createdAt: stampOn(day, slot.start),
        // Les séances anciennes ont déjà été réglées à l'entraîneur.
        teacherPaid: back > 18,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Les séances libres vendues à un GROUPE entier
// ---------------------------------------------------------------------------

export function buildGroupSeances(): GroupSeance[] {
  const specs = [
    { teacherId: "tea-1", title: "Révision générale — Analyse", back: 28, students: 14, price: 800, school: 350, start: "14:00", end: "16:00" },
    { teacherId: "tea-2", title: "Séance de préparation au DS de physique", back: 21, students: 11, price: 900, school: 400, start: "16:00", end: "18:00" },
    { teacherId: "tea-12", title: "Atelier conversation anglaise", back: 15, students: 9, price: 700, school: 300, start: "17:00", end: "18:30" },
    { teacherId: "tea-8", title: "Méthodologie de la dissertation", back: 10, students: 16, price: 850, school: 400, start: "15:00", end: "17:00" },
    { teacherId: "tea-5", title: "Travaux pratiques — Sciences naturelles", back: 6, students: 12, price: 950, school: 450, start: "10:00", end: "12:00" },
    { teacherId: "tea-3", title: "Rattrapage de français — 5AP", back: 3, students: 8, price: 600, school: 300, start: "13:00", end: "14:30" },
  ];

  return specs.map((s, i) => {
    const day = shiftDays(-s.back);
    const id = `gsn-${i + 1}`;
    return {
      id,
      teacherId: s.teacherId,
      title: s.title,
      description: "Séance ponctuelle vendue au groupe",
      date: day,
      startTime: s.start,
      endTime: s.end,
      studentsCount: s.students,
      pricePerStudent: s.price,
      schoolPerStudent: s.school,
      cashInId: `csh-${id}-in`,
      cashOutId: `csh-${id}-out`,
      createdAt: stampOn(day, s.start),
    };
  });
}

// ---------------------------------------------------------------------------
//  Les notifications des parents
// ---------------------------------------------------------------------------

export function buildNotifications(parentIds: string[]): Notification[] {
  const templates = [
    { title: "Alerte : reste à payer", description: "Un reste à payer est enregistré sur le compte de votre enfant. Merci de régulariser à la réception.", auto: true },
    { title: "Solde bientôt épuisé", description: "Il reste moins de deux séances sur l'un des modules de votre enfant.", auto: true },
    { title: "Absence signalée", description: "Votre enfant a été porté absent à la séance d'hier.", auto: true },
    { title: "Réunion de parents", description: "Une réunion est programmée samedi prochain. Votre présence est souhaitée.", auto: false },
    { title: "Frais d'inscription", description: "Les frais d'inscription de l'année n'ont pas encore été réglés.", auto: true },
  ];

  const out: Notification[] = [];
  let n = 1;
  parentIds.forEach((parentId, i) => {
    const count = pick(`${parentId}:ntf`, 1, 3);
    for (let k = 0; k < count; k++) {
      const tpl = templates[(i + k) % templates.length];
      const day = -pick(`${parentId}:${k}:d`, 1, 30);
      out.push({
        id: `ntf-${n++}`,
        parentId,
        title: tpl.title,
        description: tpl.description,
        date: stamp(day, "10:10"),
        read: pick(`${parentId}:${k}:r`, 0, 2) === 0,
        auto: tpl.auto,
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
//  Les mots de passe des portails chevaliers
// ---------------------------------------------------------------------------

export function buildCredentials(students: Student[]): StudentCredential[] {
  return students.slice(0, 12).map((s) => ({
    studentId: s.id,
    password: "demo1234",
    updatedAt: stamp(-40, "10:00"),
  }));
}

// ---------------------------------------------------------------------------
//  Les absences facturées automatiquement
// ---------------------------------------------------------------------------

/** Quelques semaines d'absence complète, facturées par la règle hebdomadaire. */
export function buildAbsencePenalties(
  rows: { studentId: string; subscriptionId: string; sessionId: string; moduleId: string; amount: number }[],
): AbsencePenalty[] {
  return rows.map((r, i) => {
    const back = 14 + i * 7;
    return {
      id: `abp-${i + 1}`,
      studentId: r.studentId,
      subscriptionId: r.subscriptionId,
      sessionId: r.sessionId,
      moduleId: r.moduleId,
      periodStart: shiftDays(-back - 6),
      periodEnd: shiftDays(-back),
      amount: r.amount,
      remainingAfter: 0,
      createdAt: stamp(-back, "23:00"),
    };
  });
}
