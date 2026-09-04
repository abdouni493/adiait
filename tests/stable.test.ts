import { describe, it, expect, beforeEach } from "vitest";
import { useData } from "@/lib/store/data";
import { buildSeed } from "@/tests/fixtures/seed";
import {
  horseMoney,
  horseOwnerName,
  horsesOfStudent,
  netSalePrice,
  otherDebtMoney,
  salesOfStudent,
  stableReport,
  studentHorseSaleDebt,
  studentOtherDebt,
} from "@/lib/stable";

/**
 * =============================================================================
 *  L'ÉCURIE — ce que le propriétaire décide
 * =============================================================================
 *
 *  LA RÈGLE QUI GOUVERNE TOUT LE RESTE :
 *
 *   • CHEVAL DU CLUB   — ses dépenses SORTENT DE LA CAISSE, et il ne doit rien
 *     à personne : lui inventer une dette ferait un impayé imaginaire.
 *   • CHEVAL EN PENSION — ses dépenses deviennent une DETTE de son
 *     propriétaire, et la caisse ne bouge qu'au règlement.
 *
 *  Ces tests mènent le magasin par ses VRAIES actions — `saveHorse`,
 *  `saveHorseExpense`, `payHorseOwner` — parce que c'est la caisse qu'ils
 *  vérifient autant que les compteurs.
 */

const STU = "stu-1";

function reset() {
  const db = buildSeed();
  useData.setState({ ...db, loaded: true });
}

beforeEach(reset);

async function clubHorse(name = "Zéphyr") {
  const res = await useData.getState().saveHorse({
    name,
    origin: "purchase",
    ownerKind: "club",
    purchasePrice: 400_000,
    sellingPrice: 600_000,
    purchaseDate: "2026-09-01",
  });
  return res.id!;
}

async function boardedHorse(name = "Sirocco") {
  const res = await useData.getState().saveHorse({
    name,
    origin: "stable",
    ownerKind: "student",
    ownerStudentId: STU,
  });
  return res.id!;
}

// ---------------------------------------------------------------------------
//  1. L'achat sort de la caisse — UNE FOIS
// ---------------------------------------------------------------------------

describe("l'achat d'un cheval", () => {
  it("sort son prix de la caisse", async () => {
    const id = await clubHorse();
    const row = useData.getState().cash.find((c) => c.id === `csh-horse-${id}`);
    expect(row).toBeDefined();
    expect(row!.amount).toBe(-400_000);
    expect(row!.type).toBe("horse_purchase");
    // Toute écriture automatique appartient à la caisse générale.
    expect(row!.caisse).toBe("general");
  });

  it("L'ARGENT NE SORT QU'UNE FOIS : corriger le prix AJUSTE le mouvement", async () => {
    const id = await clubHorse();
    await useData.getState().saveHorse({ id, name: "Zéphyr", purchasePrice: 350_000 });

    const rows = useData.getState().cash.filter((c) => c.type === "horse_purchase");
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-350_000);
  });

  it("ramener le prix à zéro retire la dépense au lieu de laisser un fantôme", async () => {
    const id = await clubHorse();
    await useData.getState().saveHorse({ id, name: "Zéphyr", purchasePrice: 0 });
    expect(useData.getState().cash.filter((c) => c.type === "horse_purchase")).toHaveLength(0);
  });

  it("un cheval créé à l'écurie ne sort rien de la caisse", async () => {
    await boardedHorse();
    expect(useData.getState().cash.filter((c) => c.type === "horse_purchase")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
//  2. Les dépenses : caisse ou dette, selon le propriétaire
// ---------------------------------------------------------------------------

describe("les dépenses d'un cheval", () => {
  it("cheval DU CLUB : la somme sort de la caisse, et personne ne doit rien", async () => {
    const id = await clubHorse();
    await useData.getState().saveHorseExpense({
      horseId: id,
      amount: 12_000,
      date: "2026-09-10",
      categoryName: "Vétérinaire",
    });

    const money = horseMoney(useData.getState(), id);
    expect(money.expenses).toBe(12_000);
    expect(money.charged).toBe(0);
    // Lui inventer une dette ferait un impayé imaginaire.
    expect(money.debt).toBe(0);

    const cash = useData.getState().cash.filter((c) => c.type === "horse_expense");
    expect(cash).toHaveLength(1);
    expect(cash[0].amount).toBe(-12_000);
  });

  it("cheval EN PENSION : la somme devient une dette, la caisse ne bouge PAS", async () => {
    const id = await boardedHorse();
    await useData.getState().saveHorseExpense({
      horseId: id,
      amount: 9_000,
      date: "2026-09-10",
      categoryName: "Fourrage",
    });

    const money = horseMoney(useData.getState(), id);
    expect(money.expenses).toBe(9_000);
    expect(money.charged).toBe(9_000);
    expect(money.debt).toBe(9_000);
    expect(useData.getState().cash.filter((c) => c.type === "horse_expense")).toHaveLength(0);
  });

  it("le règlement du propriétaire descend la dette ET entre en caisse", async () => {
    const id = await boardedHorse();
    await useData.getState().saveHorseExpense({ horseId: id, amount: 9_000, date: "2026-09-10" });
    await useData.getState().payHorseOwner({ horseId: id, amount: 4_000, date: "2026-09-20" });

    const money = horseMoney(useData.getState(), id);
    expect(money.paid).toBe(4_000);
    expect(money.debt).toBe(5_000);

    const cash = useData.getState().cash.filter((c) => c.type === "horse_owner_payment");
    expect(cash).toHaveLength(1);
    expect(cash[0].amount).toBe(4_000);
  });

  it("supprimer une dépense de club reprend son mouvement de caisse", async () => {
    const id = await clubHorse();
    const exp = await useData.getState().saveHorseExpense({
      horseId: id,
      amount: 12_000,
      date: "2026-09-10",
    });
    await useData.getState().deleteHorseExpense(exp.id!);
    expect(useData.getState().cash.filter((c) => c.type === "horse_expense")).toHaveLength(0);
    expect(horseMoney(useData.getState(), id).expenses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
//  3. Le rattachement à une fiche fait remonter la dette sur le compte
// ---------------------------------------------------------------------------

describe("le rattachement à une fiche du club", () => {
  it("le cheval d'un chevalier apparaît sur SON compte", async () => {
    const id = await boardedHorse();
    const mine = horsesOfStudent(useData.getState(), STU);
    expect(mine.map((h) => h.id)).toEqual([id]);
    expect(horseOwnerName(useData.getState(), mine[0])).not.toBe("Le club");
  });

  it("une autre dette rattachée remonte elle aussi", async () => {
    const debt = await useData.getState().saveOtherDebt({
      studentId: STU,
      personName: "Yacine Meziane",
      amount: 5_000,
      date: "2026-09-01",
      description: "Selle cassée",
    });
    expect(studentOtherDebt(useData.getState(), STU)).toBe(5_000);

    await useData.getState().payOtherDebt({ debtId: debt.id!, amount: 2_000 });
    const money = otherDebtMoney(useData.getState(), debt.id!);
    expect(money.paid).toBe(2_000);
    expect(money.rest).toBe(3_000);
    expect(studentOtherDebt(useData.getState(), STU)).toBe(3_000);

    // Le règlement entre en caisse.
    const cash = useData.getState().cash.filter((c) => c.type === "other_debt_payment");
    expect(cash).toHaveLength(1);
    expect(cash[0].amount).toBe(2_000);
  });
});

// ---------------------------------------------------------------------------
//  4. La vente
// ---------------------------------------------------------------------------

describe("la remise sur une vente", () => {
  it("un pourcentage s'applique au prix de départ", () => {
    expect(netSalePrice(600_000, "percent", 10)).toBe(540_000);
  });

  it("un montant fixe s'en retranche tel quel", () => {
    expect(netSalePrice(600_000, "amount", 50_000)).toBe(550_000);
  });

  it("UNE REMISE NE REND JAMAIS LE PRIX NÉGATIF : un cheval offert vaut zéro", () => {
    expect(netSalePrice(100_000, "amount", 500_000)).toBe(0);
    expect(netSalePrice(100_000, "percent", 300)).toBe(0);
  });

  it("sans remise, le prix ne bouge pas", () => {
    expect(netSalePrice(600_000)).toBe(600_000);
    expect(netSalePrice(600_000, "percent", 0)).toBe(600_000);
  });
});

describe("la vente d'un cheval", () => {
  it("marque le cheval vendu, encaisse l'acompte et laisse une dette", async () => {
    const id = await clubHorse();
    await useData.getState().saveHorseSale({
      horseId: id,
      buyerKind: "student",
      buyerStudentId: STU,
      buyerName: "Yacine Meziane",
      date: "2026-10-01",
      basePrice: 600_000,
      total: 600_000,
      paid: 200_000,
    });

    const horse = useData.getState().horses.find((h) => h.id === id)!;
    expect(horse.status).toBe("sold");

    const sale = useData.getState().horseSales[0];
    expect(sale.rest).toBe(400_000);
    expect(sale.status).toBe("debt");
    expect(studentHorseSaleDebt(useData.getState(), STU)).toBe(400_000);
    expect(salesOfStudent(useData.getState(), STU)).toHaveLength(1);

    const cash = useData.getState().cash.filter((c) => c.type === "horse_sale");
    expect(cash).toHaveLength(1);
    expect(cash[0].amount).toBe(200_000);
  });

  it("un versement descend le reste dû et solde la vente", async () => {
    const id = await clubHorse();
    const sale = await useData.getState().saveHorseSale({
      horseId: id,
      buyerKind: "external",
      buyerName: "Un acheteur",
      date: "2026-10-01",
      basePrice: 600_000,
      total: 600_000,
      paid: 200_000,
    });

    await useData.getState().payHorseSale({ saleId: sale.id!, amount: 400_000 });
    const live = useData.getState().horseSales[0];
    expect(live.paid).toBe(600_000);
    expect(live.rest).toBe(0);
    expect(live.status).toBe("completed");
  });

  it("un versement ne peut pas dépasser le reste dû", async () => {
    const id = await clubHorse();
    const sale = await useData.getState().saveHorseSale({
      horseId: id,
      buyerKind: "external",
      buyerName: "Un acheteur",
      date: "2026-10-01",
      basePrice: 600_000,
      total: 600_000,
      paid: 500_000,
    });
    await useData.getState().payHorseSale({ saleId: sale.id!, amount: 999_999 });
    const live = useData.getState().horseSales[0];
    expect(live.paid).toBe(600_000);
    expect(live.rest).toBe(0);
  });

  it("supprimer la vente rend le cheval à l'écurie et reprend la caisse", async () => {
    const id = await clubHorse();
    const sale = await useData.getState().saveHorseSale({
      horseId: id,
      buyerKind: "external",
      buyerName: "Un acheteur",
      date: "2026-10-01",
      basePrice: 600_000,
      total: 600_000,
      paid: 600_000,
    });
    await useData.getState().deleteHorseSale(sale.id!);

    expect(useData.getState().horses.find((h) => h.id === id)!.status).toBe("available");
    expect(useData.getState().cash.filter((c) => c.type === "horse_sale")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
//  5. Supprimer un cheval emporte tout ce qu'il a écrit
// ---------------------------------------------------------------------------

describe("supprimer un cheval", () => {
  it("emporte ses dépenses, ses règlements et ses mouvements de caisse", async () => {
    const id = await boardedHorse();
    await useData.getState().saveHorseExpense({ horseId: id, amount: 9_000, date: "2026-09-10" });
    await useData.getState().payHorseOwner({ horseId: id, amount: 4_000 });

    await useData.getState().deleteHorse(id);
    const db = useData.getState();
    expect(db.horses.find((h) => h.id === id)).toBeUndefined();
    expect(db.horseExpenses.filter((e) => e.horseId === id)).toHaveLength(0);
    expect(db.horseOwnerPayments.filter((p) => p.horseId === id)).toHaveLength(0);
    expect(db.cash.filter((c) => c.type === "horse_owner_payment")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
//  6. Le rapport de gestion
// ---------------------------------------------------------------------------

describe("le rapport de l'écurie", () => {
  it("groupe par PROPRIÉTAIRE, et non par cheval", async () => {
    const a = await boardedHorse("Sirocco");
    const b = await boardedHorse("Tempête");
    await useData.getState().saveHorseExpense({
      horseId: a,
      amount: 5_000,
      date: "2026-09-10",
      categoryName: "Vétérinaire",
    });
    await useData.getState().saveHorseExpense({
      horseId: b,
      amount: 3_000,
      date: "2026-09-12",
      categoryName: "Fourrage",
    });

    const report = stableReport(useData.getState(), "2026-09-01", "2026-09-30", "boarded");
    // Deux chevaux, UN propriétaire, une seule ligne — c'est à lui qu'on
    // présente une note.
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].horses).toHaveLength(2);
    expect(report.rows[0].expenses).toBe(8_000);
    expect(report.rows[0].debt).toBe(8_000);
    expect(report.categories).toEqual(["Fourrage", "Vétérinaire"]);
    expect(report.rows[0].byCategory["Vétérinaire"]).toBe(5_000);
  });

  it("une rubrique SANS dépense sur la période ne fabrique pas de colonne vide", async () => {
    const id = await boardedHorse();
    await useData.getState().saveHorseExpense({
      horseId: id,
      amount: 5_000,
      date: "2026-09-10",
      categoryName: "Vétérinaire",
    });
    await useData.getState().saveHorseExpense({
      horseId: id,
      amount: 3_000,
      date: "2026-12-10",
      categoryName: "Maréchal-ferrant",
    });

    const report = stableReport(useData.getState(), "2026-09-01", "2026-09-30");
    expect(report.categories).toEqual(["Vétérinaire"]);
  });

  it("un cheval du club ne DOIT rien : sa dépense est déjà sortie de la caisse", async () => {
    const id = await clubHorse();
    await useData.getState().saveHorseExpense({ horseId: id, amount: 12_000, date: "2026-09-10" });

    const report = stableReport(useData.getState(), "2026-09-01", "2026-09-30", "club");
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].club).toBe(true);
    expect(report.rows[0].expenses).toBe(12_000);
    expect(report.rows[0].debt).toBe(0);
  });

  it("le périmètre sépare les chevaux du club et les pensions", async () => {
    const club = await clubHorse();
    const boarded = await boardedHorse();
    await useData.getState().saveHorseExpense({ horseId: club, amount: 1_000, date: "2026-09-10" });
    await useData
      .getState()
      .saveHorseExpense({ horseId: boarded, amount: 2_000, date: "2026-09-10" });

    expect(stableReport(useData.getState(), "2026-09-01", "2026-09-30", "club").totals.expenses).toBe(
      1_000,
    );
    expect(
      stableReport(useData.getState(), "2026-09-01", "2026-09-30", "boarded").totals.expenses,
    ).toBe(2_000);
    expect(stableReport(useData.getState(), "2026-09-01", "2026-09-30", "all").totals.expenses).toBe(
      3_000,
    );
  });
});
