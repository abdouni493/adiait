"use client";

/**
 * LES FAMILLES DE LE CLUB DE DÉMONSTRATION.
 *
 * Les vingt premières fiches sont écrites à la main : ce sont les CAS, et
 * chacune existe pour montrer une situation de facturation que l'application
 * traite différemment.
 *
 *   normal .............. le chevalier ordinaire, qui paie le tarif affiché
 *   normal + remise ..... une réduction accordée sur UN module
 *   normal + dette ...... un versement partiel, donc un reste à payer
 *   normal + frais ...... un livre, une tenue — une dette qui n'est pas de la cotisation
 *   special ............. gratuité TOTALE
 *   special partiel ..... gratuité sur CERTAINS emplois du temps seulement
 *   teacher_child ....... la cotisation se règle sur le salaire du père entraîneur
 *   teacher_child porté . la cotisation a été créditée d'avance et attend la paie
 *   reduction (%) ....... le club et l'entraîneur renoncent chacun à une part
 *   reduction (montant) . la même chose, en dinars
 *   school_only ......... le club est payée, l'entraîneur ne l'est pas
 *   school_only partiel . la même chose, sur un seul emploi du temps
 *   entrée en cours ..... inscrit au 2ᵉ carte, sur la 3ᵉ séance
 *   désinscrit .......... sorti d'un emploi, dont l'historique reste lisible
 *   avance du club ... le club a réglé sa dette de sa caisse pour débloquer l'entraîneur
 *
 * Le reste de l'effectif est fabriqué par `COHORT`, à partir de listes de noms
 * et d'une affectation déterministe : c'est ce qui donne à la démonstration le
 * VOLUME d'une vraie club (des listes qui se paginent, des feuilles de présence
 * pleines, des statistiques qui veulent dire quelque chose).
 */

import type { Parent, Student } from "@/lib/types";
import { monthlyExpiry } from "@/lib/helpers";
import { choose, pick, shiftDays } from "./dates";

// ---------------------------------------------------------------------------
// Les parents
// ---------------------------------------------------------------------------

export const PARENTS: Parent[] = [
  { id: "par-1", firstName: "Rachid", lastName: "Amrani", phone: "0550 20 20 20", email: "rachid.amrani@parent.altech-school.dz", childIds: ["stu-1", "stu-2"] },
  { id: "par-2", firstName: "Fatima", lastName: "Bouzid", phone: "0550 20 20 21", email: "fatima.bouzid@parent.altech-school.dz", childIds: ["stu-3", "stu-4"] },
  { id: "par-3", firstName: "Djamel", lastName: "Ferhat", phone: "0550 20 20 22", email: "djamel.ferhat@parent.altech-school.dz", childIds: ["stu-5", "stu-7"] },
  { id: "par-4", firstName: "Karim", lastName: "Bensalah", phone: "0661 22 33 44", email: "karim.bensalah@altech-school.dz", childIds: ["stu-9", "stu-10"] },
  { id: "par-5", firstName: "Nabila", lastName: "Haddad", phone: "0550 20 20 24", email: "nabila.haddad@parent.altech-school.dz", childIds: ["stu-11", "stu-12"] },
  { id: "par-6", firstName: "Mustapha", lastName: "Kaci", phone: "0550 20 20 25", email: "mustapha.kaci@parent.altech-school.dz", childIds: ["stu-13", "stu-14"] },
  { id: "par-7", firstName: "Halima", lastName: "Sadi", phone: "0550 20 20 26", email: "halima.sadi@parent.altech-school.dz", childIds: ["stu-15"] },
  { id: "par-8", firstName: "Abdelkader", lastName: "Amara", phone: "0550 20 20 27", email: "abdelkader.amara@parent.altech-school.dz", childIds: ["stu-16"] },
  { id: "par-9", firstName: "Souad", lastName: "Tahar", phone: "0550 20 20 28", email: "souad.tahar@parent.altech-school.dz", childIds: ["stu-17"] },
  { id: "par-10", firstName: "Mohamed", lastName: "Belkacem", phone: "0550 20 20 29", email: "mohamed.belkacem@parent.altech-school.dz", childIds: ["stu-18"] },
  { id: "par-11", firstName: "Zohra", lastName: "Nait Slimane", phone: "0550 20 20 30", email: "zohra.naitslimane@parent.altech-school.dz", childIds: ["stu-19", "stu-20"] },
  { id: "par-12", firstName: "Farid", lastName: "Ould Kablia", phone: "0550 20 20 31", email: "farid.ouldkablia@parent.altech-school.dz", childIds: [] },
];

// ---------------------------------------------------------------------------
// Les vingt cas
// ---------------------------------------------------------------------------

/** Une fiche de chevalier, sans les champs que le générateur remplit tout seul. */
type CaseStudent = Omit<Student, "registrationNumber">;

const rfid = (n: number) => `RFID-${String(1000 + n)}`;
const mail = (first: string, last: string) =>
  `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@eleve.altech-school.dz";

export const CASE_STUDENTS: CaseStudent[] = [
  // 1 — le chevalier ordinaire, bien approvisionné sur ses deux modules.
  {
    id: "stu-1", firstName: "Yacine", lastName: "Amrani", birthDate: "2007-03-14",
    phone: "0550 10 10 10", phone2: "0770 10 10 10", email: mail("yacine", "amrani"),
    rfid: rfid(1), isFree: false, parentId: "par-1",
    enrollmentLevel: "lycee", enrollmentYear: "3AS",
    subscriptionIds: ["sub-1", "sub-3", "sub-11"],
    subscriptionDates: {
      "sub-1": { subscribedAt: shiftDays(-120), startDate: shiftDays(-120) },
      "sub-3": { subscribedAt: shiftDays(-120), startDate: shiftDays(-120) },
      "sub-11": { subscribedAt: shiftDays(-60), startDate: shiftDays(-60) },
    },
    registrationDue: 0,
  },
  // 2 — remise de 5 % accordée sur son module, solde presque épuisé.
  {
    id: "stu-2", firstName: "Lina", lastName: "Amrani", birthDate: "2009-11-02",
    phone: "0550 10 10 11", email: mail("lina", "amrani"),
    rfid: rfid(2), isFree: false, parentId: "par-1",
    enrollmentLevel: "moyen", enrollmentYear: "4AM",
    subscriptionIds: ["sub-4", "sub-15"],
    subscriptionDates: {
      "sub-4": { subscribedAt: shiftDays(-100), startDate: shiftDays(-100) },
      "sub-15": { subscribedAt: shiftDays(-70), startDate: shiftDays(-70) },
    },
    subscriptionDiscounts: { "sub-4": { type: "percent", value: 5 } },
    registrationDue: 0,
  },
  // 3 — versement PARTIEL : il reste une dette, et sa formation expire bientôt.
  {
    id: "stu-3", firstName: "Mehdi", lastName: "Bouzid", birthDate: "2006-06-21",
    phone: "0550 10 10 12", phone2: "0661 10 10 12", email: mail("mehdi", "bouzid"),
    rfid: rfid(3), isFree: false, parentId: "par-2",
    enrollmentLevel: "lycee", enrollmentYear: "3AS",
    subscriptionIds: ["sub-2", "sub-5"],
    subscriptionDates: {
      "sub-2": { subscribedAt: shiftDays(-130), startDate: shiftDays(-130) },
      "sub-5": { subscribedAt: shiftDays(-170), startDate: shiftDays(-170), expiryDate: shiftDays(6) },
    },
    subscriptionDiscounts: { "sub-2": { type: "percent", value: 10 } },
    registrationDue: 0,
  },
  // 4 — abonnement MENSUEL en cours + une formation déjà expirée.
  {
    id: "stu-4", firstName: "Sarah", lastName: "Khelifi", birthDate: "2008-01-30",
    phone: "0550 10 10 13", email: mail("sarah", "khelifi"),
    rfid: rfid(4), isFree: false, parentId: "par-2",
    enrollmentLevel: "lycee", enrollmentYear: "3AS",
    subscriptionIds: ["sub-1", "sub-5"],
    subscriptionDates: {
      "sub-1": {
        subscribedAt: shiftDays(-90), startDate: shiftDays(-6),
        expiryDate: monthlyExpiry(shiftDays(-6)), plan: "month",
      },
      "sub-5": { subscribedAt: shiftDays(-200), startDate: shiftDays(-200), expiryDate: shiftDays(-5) },
    },
    registrationDue: 0,
  },
  // 5 — CAS SPÉCIAL : toute sa cotisation est offerte.
  {
    id: "stu-5", firstName: "Anis", lastName: "Ferhat", birthDate: "2007-09-09",
    phone: "0550 10 10 14", email: mail("anis", "ferhat"),
    rfid: rfid(5), isFree: true, studentCase: "special", parentId: "par-3",
    enrollmentLevel: "lycee", enrollmentYear: "3AS",
    subscriptionIds: ["sub-3", "sub-11"],
    subscriptionDates: {
      "sub-3": { subscribedAt: shiftDays(-110), startDate: shiftDays(-110) },
      "sub-11": { subscribedAt: shiftDays(-110), startDate: shiftDays(-110) },
    },
    registrationDue: 0,
  },
  // 6 — une carte ÉCHU (séances restantes perdues) + un pack de séances libres.
  {
    id: "stu-6", firstName: "Ines", lastName: "Boulahia", birthDate: "2009-04-17",
    phone: "0550 10 10 15", email: mail("ines", "boulahia"),
    rfid: rfid(6), isFree: false,
    enrollmentLevel: "moyen", enrollmentYear: "4AM",
    subscriptionIds: ["sub-4", "sub-6"],
    subscriptionDates: {
      "sub-4": {
        subscribedAt: shiftDays(-80), startDate: shiftDays(-38),
        expiryDate: monthlyExpiry(shiftDays(-38)), plan: "month",
      },
      "sub-6": { subscribedAt: shiftDays(-20), startDate: shiftDays(-20) },
    },
    subscriptionDiscounts: { "sub-4": { type: "amount", value: 100 } },
    registrationDue: 0,
  },
  // 7 — frais d'inscription encore dus, et un pack largement impayé.
  {
    id: "stu-7", firstName: "Rayan", lastName: "Ould Ali", birthDate: "2006-12-05",
    phone: "0550 10 10 16", email: mail("rayan", "ouldali"),
    rfid: rfid(7), isFree: false, parentId: "par-3",
    enrollmentLevel: "lycee", enrollmentYear: "3AS",
    subscriptionIds: ["sub-2"],
    subscriptionDates: {
      "sub-2": { subscribedAt: shiftDays(-16), startDate: shiftDays(-16) },
    },
    registrationDue: 2000,
  },
  // 8 — CAS SPÉCIAL PARTIEL : sa formation est offerte, sa philosophie non.
  {
    id: "stu-8", firstName: "Malak", lastName: "Zerrouki", birthDate: "2008-08-23",
    phone: "0550 10 10 17", email: mail("malak", "zerrouki"),
    rfid: rfid(8), isFree: false, studentCase: "special",
    freeSubscriptionIds: ["sub-5"],
    enrollmentLevel: "lycee", enrollmentYear: "3AS",
    subscriptionIds: ["sub-5", "sub-11"],
    subscriptionDates: {
      "sub-5": { subscribedAt: shiftDays(-60), startDate: shiftDays(-60), expiryDate: shiftDays(120) },
      "sub-11": { subscribedAt: shiftDays(-60), startDate: shiftDays(-60) },
    },
    registrationDue: 0,
  },
  // 9 — FILS D'ENTRAÎNEUR : sa cotisation se retient sur la paie de son père.
  {
    id: "stu-9", firstName: "Bilal", lastName: "Bensalah", birthDate: "2009-02-11",
    phone: "0661 22 33 44", email: mail("bilal", "bensalah"),
    rfid: rfid(9), isFree: false, studentCase: "teacher_child", teacherFatherId: "tea-1",
    parentId: "par-4", enrollmentLevel: "moyen", enrollmentYear: "3AM",
    subscriptionIds: ["sub-9"],
    subscriptionDates: {
      "sub-9": { subscribedAt: shiftDays(-95), startDate: shiftDays(-95) },
    },
    registrationDue: 0,
  },
  // 10 — même cas, mais la cotisation a DÉJÀ été créditée au guichet : elle
  //      attend d'être retenue sur le prochain règlement du père.
  {
    id: "stu-10", firstName: "Nour", lastName: "Bensalah", birthDate: "2011-07-04",
    phone: "0661 22 33 44", email: mail("nour", "bensalah"),
    rfid: rfid(10), isFree: false, studentCase: "teacher_child", teacherFatherId: "tea-1",
    parentId: "par-4", enrollmentLevel: "primaire", enrollmentYear: "5AP",
    subscriptionIds: ["sub-10"],
    subscriptionDates: {
      "sub-10": { subscribedAt: shiftDays(-85), startDate: shiftDays(-85) },
    },
    registrationDue: 0,
  },
  // 11 — CAS RÉDUCTION en POURCENTAGE : le club renonce à 20 % de sa part,
  //      l'entraîneur à 20 % de la sienne.
  {
    id: "stu-11", firstName: "Adel", lastName: "Haddad", birthDate: "2008-05-19",
    phone: "0550 10 10 20", email: mail("adel", "haddad"),
    rfid: rfid(11), isFree: false, studentCase: "reduction",
    caseReduction: { type: "percent", schoolValue: 20, teacherValue: 20 },
    parentId: "par-5", enrollmentLevel: "lycee", enrollmentYear: "2AS",
    subscriptionIds: ["sub-7", "sub-12"],
    subscriptionDates: {
      "sub-7": { subscribedAt: shiftDays(-105), startDate: shiftDays(-105) },
      "sub-12": { subscribedAt: shiftDays(-105), startDate: shiftDays(-105) },
    },
    registrationDue: 0,
  },
  // 12 — CAS RÉDUCTION en MONTANT : 100 DA de moins côté club, 50 côté entraîneur.
  {
    id: "stu-12", firstName: "Meriem", lastName: "Haddad", birthDate: "2010-10-27",
    phone: "0550 10 10 21", email: mail("meriem", "haddad"),
    rfid: rfid(12), isFree: false, studentCase: "reduction",
    caseReduction: { type: "amount", schoolValue: 100, teacherValue: 50 },
    parentId: "par-5", enrollmentLevel: "lycee", enrollmentYear: "1AS",
    subscriptionIds: ["sub-8"],
    subscriptionDates: {
      "sub-8": { subscribedAt: shiftDays(-88), startDate: shiftDays(-88) },
    },
    registrationDue: 0,
  },
  // 13 — CLUB SEULE (fiche ancienne, pilotée par la liste d'entraîneurs) :
  //      la famille ne verse que la part du club.
  {
    id: "stu-13", firstName: "Sami", lastName: "Kaci", birthDate: "2007-01-08",
    phone: "0550 10 10 22", email: mail("sami", "kaci"),
    rfid: rfid(13), isFree: false, studentCase: "school_only",
    unpaidTeacherIds: ["tea-2"],
    parentId: "par-6", enrollmentLevel: "lycee", enrollmentYear: "3AS",
    subscriptionIds: ["sub-3"],
    subscriptionDates: {
      "sub-3": { subscribedAt: shiftDays(-92), startDate: shiftDays(-92) },
    },
    registrationDue: 0,
  },
  // 14 — CLUB SEULE sur UN emploi du temps seulement : ses maths sont
  //      « club seule », son histoire-géo se facture normalement.
  {
    id: "stu-14", firstName: "Rania", lastName: "Kaci", birthDate: "2009-09-30",
    phone: "0550 10 10 23", email: mail("rania", "kaci"),
    rfid: rfid(14), isFree: false, studentCase: "school_only",
    schoolOnlySubscriptionIds: ["sub-9"], unpaidTeacherIds: ["tea-1"],
    parentId: "par-6", enrollmentLevel: "moyen", enrollmentYear: "3AM",
    subscriptionIds: ["sub-9", "sub-19"],
    subscriptionDates: {
      "sub-9": { subscribedAt: shiftDays(-78), startDate: shiftDays(-78) },
      "sub-19": { subscribedAt: shiftDays(-78), startDate: shiftDays(-78) },
    },
    registrationDue: 0,
  },
  // 15 — ENTRÉE EN COURS DE ROUTE : inscrit au 2ᵉ carte du groupe, sur la 3ᵉ
  //      séance. Les séances tenues avant lui restent vides sur sa ligne.
  {
    id: "stu-15", firstName: "Amir", lastName: "Sadi", birthDate: "2007-04-02",
    phone: "0550 10 10 24", email: mail("amir", "sadi"),
    rfid: rfid(15), isFree: false, parentId: "par-7",
    enrollmentLevel: "lycee", enrollmentYear: "3AS",
    subscriptionIds: ["sub-1"],
    subscriptionDates: {
      "sub-1": {
        subscribedAt: shiftDays(-42), startDate: shiftDays(-42),
        joinMonthCode: "M2", joinSlotIndex: 2,
      },
    },
    registrationDue: 0,
  },
  // 16 — DÉSINSCRIT d'un emploi du temps : le bloc est gardé, daté de la
  //      sortie, pour que ses présences et ses paiements restent lisibles.
  {
    id: "stu-16", firstName: "Khadidja", lastName: "Amara", birthDate: "2009-12-12",
    phone: "0550 10 10 25", email: mail("khadidja", "amara"),
    rfid: rfid(16), isFree: false, parentId: "par-8",
    enrollmentLevel: "moyen", enrollmentYear: "4AM",
    subscriptionIds: ["sub-15"],
    subscriptionDates: {
      "sub-15": { subscribedAt: shiftDays(-64), startDate: shiftDays(-64) },
      "sub-4": {
        subscribedAt: shiftDays(-140), startDate: shiftDays(-140),
        unsubscribedAt: shiftDays(-30),
      },
    },
    registrationDue: 0,
  },
  // 17 — DES FRAIS AU COMPTE : un livre et une tenue, réglés en plusieurs fois.
  {
    id: "stu-17", firstName: "Walid", lastName: "Tahar", birthDate: "2011-03-25",
    phone: "0550 10 10 26", email: mail("walid", "tahar"),
    rfid: rfid(17), isFree: false, parentId: "par-9",
    enrollmentLevel: "primaire", enrollmentYear: "5AP",
    subscriptionIds: ["sub-10"],
    subscriptionDates: {
      "sub-10": { subscribedAt: shiftDays(-72), startDate: shiftDays(-72) },
    },
    registrationDue: 0,
  },
  // 18 — LE CLUB A AVANCÉ sa dette de sa propre caisse pour débloquer la part
  //      de l'entraîneur : la famille la doit désormais au club.
  {
    id: "stu-18", firstName: "Sonia", lastName: "Belkacem", birthDate: "2006-08-14",
    phone: "0550 10 10 27", email: mail("sonia", "belkacem"),
    rfid: rfid(18), isFree: false, parentId: "par-10",
    enrollmentLevel: "lycee", enrollmentYear: "3AS",
    subscriptionIds: ["sub-2"],
    subscriptionDates: {
      "sub-2": { subscribedAt: shiftDays(-96), startDate: shiftDays(-96) },
    },
    registrationDue: 0,
  },
  // 19 — deux formations en cours, dont une qui arrive à échéance.
  {
    id: "stu-19", firstName: "Imene", lastName: "Nait Slimane", birthDate: "2005-05-05",
    phone: "0550 10 10 28", email: mail("imene", "naitslimane"),
    rfid: rfid(19), isFree: false, parentId: "par-11",
    enrollmentLevel: "formation", enrollmentYear: "B1",
    subscriptionIds: ["sub-5", "sub-13"],
    subscriptionDates: {
      "sub-5": { subscribedAt: shiftDays(-150), startDate: shiftDays(-150), expiryDate: shiftDays(30) },
      "sub-13": { subscribedAt: shiftDays(-84), startDate: shiftDays(-84), expiryDate: shiftDays(4) },
    },
    registrationDue: 0,
  },
  // 20 — maternelle : le pack de douze séances par carte.
  {
    id: "stu-20", firstName: "Sirine", lastName: "Nait Slimane", birthDate: "2020-06-18",
    phone: "0550 10 10 29", email: mail("sirine", "naitslimane"),
    rfid: rfid(20), isFree: false, parentId: "par-11",
    enrollmentLevel: "maternelle", enrollmentYear: "Grande section",
    subscriptionIds: ["sub-14"],
    subscriptionDates: {
      "sub-14": { subscribedAt: shiftDays(-110), startDate: shiftDays(-110) },
    },
    registrationDue: 0,
  },
];

// ---------------------------------------------------------------------------
// L'effectif — le VOLUME d'une vraie club
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Amine", "Sofia", "Islam", "Nesrine", "Zakaria", "Amel", "Riad", "Chahinez",
  "Younes", "Manel", "Ilyes", "Hiba", "Oussama", "Rym", "Fares", "Assia",
  "Redouane", "Nawel", "Zineddine", "Katia", "Yanis", "Célia", "Massinissa",
  "Dounia", "Aymen", "Sabrina", "Idris", "Loubna", "Hamza", "Wissam",
  "Ryad", "Sanaa", "Nassim", "Yasmina", "Chakib", "Kenza",
];

const LAST_NAMES = [
  "Benmoussa", "Cherifi", "Djelloul", "Hamidi", "Larbaoui", "Meddour",
  "Ouahab", "Rahmani", "Saadi", "Tounsi", "Yahiaoui", "Zerouali",
  "Belhadj", "Guendouz", "Khaldi", "Messaoudi", "Naceri", "Ramdani",
];

/**
 * L'AFFECTATION DE L'EFFECTIF : combien de chevaliers par emploi du temps, et à quel
 * niveau ils appartiennent. C'est ce qui remplit les feuilles de présence et
 * donne du sens aux statistiques.
 */
const COHORT: {
  subs: string[];
  level: string;
  year: string;
  count: number;
  birthYear: number;
}[] = [
  { subs: ["sub-1", "sub-3"], level: "lycee", year: "3AS", count: 7, birthYear: 2007 },
  { subs: ["sub-2"], level: "lycee", year: "3AS", count: 5, birthYear: 2007 },
  { subs: ["sub-11", "sub-12"], level: "lycee", year: "3AS", count: 4, birthYear: 2007 },
  { subs: ["sub-7", "sub-12"], level: "lycee", year: "2AS", count: 6, birthYear: 2008 },
  { subs: ["sub-8"], level: "lycee", year: "1AS", count: 5, birthYear: 2009 },
  { subs: ["sub-4", "sub-15"], level: "moyen", year: "4AM", count: 6, birthYear: 2010 },
  { subs: ["sub-9"], level: "moyen", year: "3AM", count: 5, birthYear: 2011 },
  { subs: ["sub-19"], level: "moyen", year: "2AM", count: 4, birthYear: 2012 },
  { subs: ["sub-10"], level: "primaire", year: "5AP", count: 5, birthYear: 2014 },
  { subs: ["sub-14"], level: "maternelle", year: "Grande section", count: 6, birthYear: 2020 },
  { subs: ["sub-5"], level: "formation", year: "B1", count: 4, birthYear: 2004 },
  { subs: ["sub-13"], level: "formation", year: "A1", count: 4, birthYear: 2003 },
  { subs: ["sub-18"], level: "formation", year: "B2", count: 3, birthYear: 2002 },
  { subs: ["sub-20"], level: "formation", year: "A2", count: 3, birthYear: 2005 },
  { subs: ["sub-17"], level: "moyen", year: "1AM", count: 4, birthYear: 2013 },
];

/** Les formations et les séances libres portent une échéance, pas les cours. */
const EXPIRING_SUBS: Record<string, number> = {
  "sub-5": 6,
  "sub-13": 3,
  "sub-18": 5,
  "sub-20": 4,
};

/**
 * Fabrique le reste de l'effectif. Chaque fiche est TIRÉE de son identifiant :
 * le même chevalier porte toujours le même prénom, la même remise et la même date
 * d'inscription, d'un chargement à l'autre.
 */
export function buildCohort(startIndex: number): Student[] {
  const out: Student[] = [];
  let n = startIndex;

  for (const spec of COHORT) {
    for (let i = 0; i < spec.count; i++) {
      const id = `stu-${n}`;
      const firstName = choose(`${id}:first`, FIRST_NAMES);
      const lastName = choose(`${id}:last`, LAST_NAMES);
      const since = -pick(`${id}:since`, 20, 130);
      const dates: Student["subscriptionDates"] = {};

      for (const sub of spec.subs) {
        const months = EXPIRING_SUBS[sub];
        dates[sub] = {
          subscribedAt: shiftDays(since),
          startDate: shiftDays(since),
          ...(months
            ? { expiryDate: monthlyExpiry(shiftDays(since), months) }
            : {}),
        };
      }

      // Une fiche sur sept porte une remise sur son premier module — assez pour
      // que la colonne « remise » ne soit pas une curiosité, pas assez pour
      // qu'elle devienne la règle.
      const withDiscount = pick(`${id}:disc`, 0, 6) === 0;
      const discounts = withDiscount
        ? {
            [spec.subs[0]]:
              pick(`${id}:disckind`, 0, 1) === 0
                ? { type: "percent" as const, value: choose(`${id}:discv`, [5, 10, 15, 20]) }
                : { type: "amount" as const, value: choose(`${id}:discv`, [50, 100, 150]) },
          }
        : undefined;

      out.push({
        id,
        firstName,
        lastName,
        birthDate: `${spec.birthYear}-${String(pick(`${id}:bm`, 1, 12)).padStart(2, "0")}-${String(pick(`${id}:bd`, 1, 28)).padStart(2, "0")}`,
        phone: `05${pick(`${id}:p1`, 50, 59)} ${pick(`${id}:p2`, 10, 99)} ${pick(`${id}:p3`, 10, 99)} ${pick(`${id}:p4`, 10, 99)}`,
        email: mail(firstName, `${lastName}${n}`),
        rfid: rfid(n),
        isFree: false,
        enrollmentLevel: spec.level,
        enrollmentYear: spec.year,
        subscriptionIds: [...spec.subs],
        subscriptionDates: dates,
        ...(discounts ? { subscriptionDiscounts: discounts } : {}),
        // Un chevalier sur cinq n'a pas encore réglé ses frais d'inscription.
        registrationDue: pick(`${id}:reg`, 0, 4) === 0 ? 2000 : 0,
      });
      n += 1;
    }
  }

  return out;
}
