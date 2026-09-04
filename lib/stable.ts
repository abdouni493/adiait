"use client";

/**
 * =============================================================================
 *  L'ÉCURIE — ce que les écrans lisent, calculé au même endroit
 * =============================================================================
 *
 *  Trois écrans parlent des chevaux : l'achat et la vente, l'écurie elle-même,
 *  et le rapport de gestion. S'ils calculaient chacun de leur côté « ce que ce
 *  cheval a coûté » ou « ce que son propriétaire doit », ils finiraient par
 *  répondre trois chiffres différents à la même question — et c'est exactement
 *  le genre d'écart qu'on ne découvre qu'au moment d'encaisser.
 *
 *  Ce module ne décide rien et n'écrit rien. Il RÉPOND.
 *
 *  LA RÈGLE QUI GOUVERNE TOUT LE RESTE : à qui appartient le cheval.
 *
 *   • CHEVAL DU CLUB (`ownerKind === "club"`) — ses dépenses sortent de la
 *     CAISSE. Il n'a pas de propriétaire à facturer, donc pas de dette.
 *   • CHEVAL EN PENSION — ses dépenses deviennent une DETTE de son
 *     propriétaire, et la caisse ne bouge pas tant qu'il n'a pas réglé.
 */

import type { Database } from "@/lib/store/data";
import type { Horse, HorseExpense, HorseSale } from "@/lib/types";
import { money, positiveMoney } from "@/lib/utils";

// ---------------------------------------------------------------------------
//  1. Le propriétaire
// ---------------------------------------------------------------------------

/** Le nom du propriétaire, quelle que soit la forme qu'il prend. */
export function horseOwnerName(db: Database, horse: Horse): string {
  if (horse.ownerKind === "club") return "Le club";
  if (horse.ownerKind === "student" && horse.ownerStudentId) {
    const s = db.students.find((x) => x.id === horse.ownerStudentId);
    if (s) return `${s.firstName} ${s.lastName}`;
  }
  if (horse.ownerKind === "parent" && horse.ownerParentId) {
    const p = db.parents.find((x) => x.id === horse.ownerParentId);
    if (p) return `${p.firstName} ${p.lastName}`;
  }
  return horse.ownerName?.trim() || "Propriétaire inconnu";
}

/** Le numéro du propriétaire — celui de sa fiche quand il en a une. */
export function horseOwnerPhone(db: Database, horse: Horse): string {
  if (horse.ownerKind === "student" && horse.ownerStudentId) {
    const s = db.students.find((x) => x.id === horse.ownerStudentId);
    if (s?.phone) return s.phone;
  }
  if (horse.ownerKind === "parent" && horse.ownerParentId) {
    const p = db.parents.find((x) => x.id === horse.ownerParentId);
    if (p?.phone) return p.phone;
  }
  return horse.ownerPhone ?? "";
}

/** Les chevaux d'un chevalier — ceux qu'il possède, pas ceux qu'il monte. */
export function horsesOfStudent(db: Database, studentId: string): Horse[] {
  return db.horses.filter((h) => h.ownerKind === "student" && h.ownerStudentId === studentId);
}

/** Les chevaux d'un parent. */
export function horsesOfParent(db: Database, parentId: string): Horse[] {
  return db.horses.filter((h) => h.ownerKind === "parent" && h.ownerParentId === parentId);
}

// ---------------------------------------------------------------------------
//  2. L'argent d'un cheval
// ---------------------------------------------------------------------------

export interface HorseMoney {
  /** tout ce que le cheval a coûté, propriétaire du club ou non */
  expenses: number;
  /** la part portée au compte du propriétaire (0 pour un cheval du club) */
  charged: number;
  /** ce que le propriétaire a déjà réglé */
  paid: number;
  /** ce qu'il reste à devoir */
  debt: number;
}

export function horseMoney(db: Database, horseId: string): HorseMoney {
  let expenses = 0;
  let charged = 0;
  for (const e of db.horseExpenses) {
    if (e.horseId !== horseId) continue;
    expenses += e.amount;
    if (e.ownerDebt) charged += e.amount;
  }
  const paid = db.horseOwnerPayments
    .filter((p) => p.horseId === horseId)
    .reduce((s, p) => s + p.amount, 0);
  return {
    expenses: money(expenses),
    charged: money(charged),
    paid: money(paid),
    debt: positiveMoney(charged - paid),
  };
}

/** Les dépenses d'un cheval, de la plus récente à la plus ancienne. */
export function horseExpensesOf(db: Database, horseId: string): HorseExpense[] {
  return db.horseExpenses
    .filter((e) => e.horseId === horseId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** La rubrique lisible d'une dépense — le nom recopié d'abord, la fiche ensuite. */
export function expenseCategoryLabel(db: Database, e: HorseExpense): string {
  if (e.categoryName) return e.categoryName;
  const cat = db.horseExpenseCategories.find((c) => c.id === e.categoryId);
  return cat?.name ?? "Sans rubrique";
}

// ---------------------------------------------------------------------------
//  3. Les ventes
// ---------------------------------------------------------------------------

/** La vente d'un cheval, s'il en a une. */
export function saleOfHorse(db: Database, horseId: string): HorseSale | undefined {
  return db.horseSales.find((s) => s.horseId === horseId);
}

/** Les ventes, de la plus récente à la plus ancienne. */
export function salesOf(db: Database): HorseSale[] {
  return [...db.horseSales].sort((a, b) => b.date.localeCompare(a.date));
}

/** Le nom de l'acheteur d'une vente, sa fiche d'abord. */
export function buyerName(db: Database, sale: HorseSale): string {
  if (sale.buyerKind === "student" && sale.buyerStudentId) {
    const s = db.students.find((x) => x.id === sale.buyerStudentId);
    if (s) return `${s.firstName} ${s.lastName}`;
  }
  if (sale.buyerKind === "parent" && sale.buyerParentId) {
    const p = db.parents.find((x) => x.id === sale.buyerParentId);
    if (p) return `${p.firstName} ${p.lastName}`;
  }
  return sale.buyerName;
}

/** Les ventes rattachées à un chevalier — pour sa fiche et son compte. */
export function salesOfStudent(db: Database, studentId: string): HorseSale[] {
  return db.horseSales.filter((s) => s.buyerStudentId === studentId);
}

export function salesOfParent(db: Database, parentId: string): HorseSale[] {
  return db.horseSales.filter((s) => s.buyerParentId === parentId);
}

/** Le total dû par un chevalier sur ses achats de chevaux. */
export function studentHorseSaleDebt(db: Database, studentId: string): number {
  return money(salesOfStudent(db, studentId).reduce((s, x) => s + x.rest, 0));
}

export function parentHorseSaleDebt(db: Database, parentId: string): number {
  return money(salesOfParent(db, parentId).reduce((s, x) => s + x.rest, 0));
}

/** Ce qu'un chevalier doit sur l'entretien de SES chevaux. */
export function studentHorseExpenseDebt(db: Database, studentId: string): number {
  return money(
    horsesOfStudent(db, studentId).reduce((s, h) => s + horseMoney(db, h.id).debt, 0),
  );
}

export function parentHorseExpenseDebt(db: Database, parentId: string): number {
  return money(horsesOfParent(db, parentId).reduce((s, h) => s + horseMoney(db, h.id).debt, 0));
}

/**
 * LA REMISE APPLIQUÉE À UNE VENTE.
 *
 * Le pourcentage se calcule sur le prix de départ ; le montant fixe s'en
 * retranche tel quel. Une remise ne peut jamais rendre le prix négatif : un
 * cheval offert vaut zéro, pas moins.
 */
export function netSalePrice(
  base: number,
  discountType?: "percent" | "amount",
  discountValue?: number,
): number {
  const value = positiveMoney(discountValue ?? 0);
  if (!discountType || value <= 0) return positiveMoney(base);
  const cut = discountType === "percent" ? (base * Math.min(100, value)) / 100 : value;
  return positiveMoney(base - cut);
}

// ---------------------------------------------------------------------------
//  4. Le rapport de gestion
// ---------------------------------------------------------------------------

export type StableScope = "all" | "club" | "boarded";

export interface StableReportRow {
  ownerKey: string;
  ownerName: string;
  ownerPhone: string;
  club: boolean;
  horses: Horse[];
  /** rubrique -> montant sur la période */
  byCategory: Record<string, number>;
  expenses: number;
  paid: number;
  debt: number;
}

export interface StableReport {
  rows: StableReportRow[];
  /** toutes les rubriques rencontrées, dans l'ordre alphabétique */
  categories: string[];
  totals: { expenses: number; paid: number; debt: number };
}

/**
 * LE RAPPORT DE L'ÉCURIE SUR UNE PÉRIODE.
 *
 * Une ligne par PROPRIÉTAIRE — pas par cheval : c'est au propriétaire qu'on
 * présente une note, et quelqu'un qui a trois chevaux en pension veut un seul
 * total. Les colonnes sont les rubriques rencontrées SUR LA PÉRIODE : une
 * rubrique sans dépense ne fabrique pas une colonne vide.
 *
 * ⚠️ LES PAIEMENTS SONT FILTRÉS SUR LA MÊME PÉRIODE que les dépenses. La
 * « dette » d'une ligne est donc le solde DE LA PÉRIODE, et non la dette
 * courante du propriétaire : mélanger les deux ferait apparaître un impayé
 * là où le propriétaire a payé le mois suivant.
 */
export function stableReport(
  db: Database,
  from: string,
  to: string,
  scope: StableScope = "all",
): StableReport {
  const inRange = (date: string) => date >= from && date <= to;

  const horses = db.horses.filter((h) =>
    scope === "all" ? true : scope === "club" ? h.ownerKind === "club" : h.ownerKind !== "club",
  );

  const byOwner = new Map<string, StableReportRow>();
  const categories = new Set<string>();

  for (const horse of horses) {
    const club = horse.ownerKind === "club";
    const key = club
      ? "club"
      : horse.ownerStudentId
        ? `student:${horse.ownerStudentId}`
        : horse.ownerParentId
          ? `parent:${horse.ownerParentId}`
          : `free:${(horse.ownerName ?? "").toLowerCase()}|${horse.ownerPhone ?? ""}`;

    const row =
      byOwner.get(key) ??
      ({
        ownerKey: key,
        ownerName: horseOwnerName(db, horse),
        ownerPhone: horseOwnerPhone(db, horse),
        club,
        horses: [],
        byCategory: {},
        expenses: 0,
        paid: 0,
        debt: 0,
      } satisfies StableReportRow);

    row.horses.push(horse);

    for (const e of db.horseExpenses) {
      if (e.horseId !== horse.id || !inRange(e.date)) continue;
      const label = expenseCategoryLabel(db, e);
      categories.add(label);
      row.byCategory[label] = money((row.byCategory[label] ?? 0) + e.amount);
      row.expenses = money(row.expenses + e.amount);
    }
    for (const p of db.horseOwnerPayments) {
      if (p.horseId !== horse.id || !inRange(p.date)) continue;
      row.paid = money(row.paid + p.amount);
    }

    byOwner.set(key, row);
  }

  const rows = [...byOwner.values()].map((r) => ({
    ...r,
    // Un cheval du club ne DOIT rien à personne : sa dépense est déjà sortie de
    // la caisse. Lui inventer une dette ferait un impayé imaginaire.
    debt: r.club ? 0 : positiveMoney(r.expenses - r.paid),
  }));
  rows.sort((a, b) => (a.club === b.club ? a.ownerName.localeCompare(b.ownerName) : a.club ? -1 : 1));

  return {
    rows,
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    totals: {
      expenses: money(rows.reduce((s, r) => s + r.expenses, 0)),
      paid: money(rows.reduce((s, r) => s + r.paid, 0)),
      debt: money(rows.reduce((s, r) => s + r.debt, 0)),
    },
  };
}

// ---------------------------------------------------------------------------
//  5. Les autres dettes
// ---------------------------------------------------------------------------

export interface OtherDebtMoney {
  amount: number;
  paid: number;
  rest: number;
}

export function otherDebtMoney(db: Database, debtId: string): OtherDebtMoney {
  const debt = db.otherDebts.find((d) => d.id === debtId);
  const paid = db.otherDebtPayments
    .filter((p) => p.debtId === debtId)
    .reduce((s, p) => s + p.amount, 0);
  const amount = debt?.amount ?? 0;
  return { amount: money(amount), paid: money(paid), rest: positiveMoney(amount - paid) };
}

/** Ce qu'un chevalier doit au titre des « autres dettes ». */
export function studentOtherDebt(db: Database, studentId: string): number {
  return money(
    db.otherDebts
      .filter((d) => d.studentId === studentId)
      .reduce((s, d) => s + otherDebtMoney(db, d.id).rest, 0),
  );
}

export function parentOtherDebt(db: Database, parentId: string): number {
  return money(
    db.otherDebts
      .filter((d) => d.parentId === parentId)
      .reduce((s, d) => s + otherDebtMoney(db, d.id).rest, 0),
  );
}

// ---------------------------------------------------------------------------
//  6. Les libellés
// ---------------------------------------------------------------------------

export const GENDER_LABEL: Record<string, string> = {
  stallion: "Étalon",
  mare: "Jument",
  gelding: "Hongre",
};

export const OWNER_KIND_LABEL: Record<string, string> = {
  club: "Le club",
  student: "Chevalier",
  parent: "Parent",
  external: "Extérieur",
};

/** L'âge d'un cheval : sa date de naissance quand on l'a, l'âge saisi sinon. */
export function horseAgeLabel(horse: Horse): string {
  if (horse.birthDate) {
    const born = new Date(`${horse.birthDate}T12:00:00`);
    const years = Math.floor((Date.now() - born.getTime()) / (365.25 * 86_400_000));
    if (years >= 0) return `${years} an${years > 1 ? "s" : ""}`;
  }
  return horse.age?.trim() || "—";
}
