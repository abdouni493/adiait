import { describe, it, expect, beforeEach } from "vitest";
import { useData } from "@/lib/store/data";
import { buildSeed } from "@/tests/fixtures/seed";
import { cycleOf, soldFor } from "@/lib/helpers";

/**
 * Un encaissement se corrige et se supprime là où il a été saisi — depuis la
 * feuille de présence du groupe comme depuis la fiche du chevalier.
 *
 * Ce qui compte : le SOLDE de l'emploi du temps et la CAISSE suivent
 * exactement le mouvement. Corriger 4000 en 2000 rend 2000 ; supprimer la ligne
 * reprend tout, et la recette disparaît de la caisse avec elle.
 */

const SUB = "sub-1";
const STU = "stu-1";

const cashOf = () => useData.getState().cash.filter((c) => c.type === "student_payment");

describe("corriger et supprimer un encaissement", () => {
  beforeEach(() => {
    const db = buildSeed();
    db.payments = [];
    db.cash = [];
    db.enrollments = db.enrollments.filter((e) => e.subscriptionId !== SUB);
    useData.setState(db);
  });

  it("supprime le paiement, reprend le solde et retire la recette", async () => {
    const res = await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 4000, monthCode: "M1" });
    expect(soldFor(useData.getState(), STU, SUB)).toBe(4000);
    expect(cashOf()).toHaveLength(1);

    const gone = await useData.getState().deleteStudentPayment(res.paymentId!);
    expect(gone).toMatchObject({ ok: true, amount: 4000, balance: 0 });

    const db = useData.getState();
    expect(db.payments.some((p) => p.id === res.paymentId)).toBe(false);
    expect(soldFor(db, STU, SUB)).toBe(0);
    expect(cycleOf(db, STU, SUB, "M1").credited).toBe(0);
    expect(cashOf()).toHaveLength(0);
  });

  it("corrige le montant : le solde et la caisse bougent du même écart", async () => {
    const res = await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 4000, monthCode: "M1" });

    await useData.getState().updateStudentPayment(res.paymentId!, { amount: 2000 });

    const db = useData.getState();
    expect(soldFor(db, STU, SUB)).toBe(2000);
    expect(cycleOf(db, STU, SUB, "M1").credited).toBe(2000);
    expect(cashOf()).toHaveLength(1);
    expect(cashOf()[0].amount).toBe(2000);
  });

  /**
   * Le code de carte d'un versement n'est plus qu'une ÉTIQUETTE (le reçu, la
   * ligne de l'historique) : l'argent appartient à l'emploi du temps et paie
   * les cartes dans l'ordre. Le changer ne déplace donc rien.
   */
  it("réétiquette un versement sur une autre carte sans rien déplacer", async () => {
    const res = await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 3000, monthCode: "M1" });

    await useData.getState().updateStudentPayment(res.paymentId!, { monthCode: "M2" });

    const db = useData.getState();
    expect(db.payments.find((p) => p.id === res.paymentId)?.monthCode).toBe("M2");
    expect(soldFor(db, STU, SUB)).toBe(3000);
    // La carte 1 n'est pas encore payée en entier : la bourse la paie d'abord.
    expect(cycleOf(db, STU, SUB, "M1").credited).toBe(3000);
    expect(cycleOf(db, STU, SUB, "M2").credited).toBe(0);
  });

  it("réécrit la description sans rien déplacer d'autre", async () => {
    const res = await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 1500, monthCode: "M1" });

    await useData.getState().updateStudentPayment(res.paymentId!, { description: "Espèces — mère" });

    const db = useData.getState();
    const p = db.payments.find((x) => x.id === res.paymentId)!;
    expect(p.description).toBe("Espèces — mère");
    expect(p.amountPaid).toBe(1500);
    expect(soldFor(db, STU, SUB)).toBe(1500);
  });

  it("refuse de supprimer un règlement de dette : il a soldé des restes ailleurs", async () => {
    // Un achat qui laisse un reste, puis son règlement.
    await useData.getState().createEnrollmentPayment({
      studentId: STU,
      subscriptionId: SUB,
      seances: 4,
      amountPaid: 0,
    });
    const paid = await useData.getState().payStudentDebt(STU, 500);
    expect(paid.ok).toBe(true);
    const receipt = useData.getState().payments.find((p) => p.type === "debt_payment")!;

    expect(await useData.getState().deleteStudentPayment(receipt.id)).toMatchObject({ ok: false });
    expect(
      await useData.getState().updateStudentPayment(receipt.id, { amount: 100 }),
    ).toMatchObject({ ok: false });
    expect(useData.getState().payments.some((p) => p.id === receipt.id)).toBe(true);
  });

  /**
   * SUPPRIMER DEPUIS LA CAISSE EFFACE AUSSI LE COMPTE DU CHEVALIER.
   *
   * L'autre sens : on efface la ligne depuis le journal de caisse. Le versement
   * du chevalier, le crédit de son emploi du temps et la recette doivent partir
   * ENSEMBLE — sinon le compte du chevalier garderait un paiement orphelin.
   */
  it("supprime depuis la caisse et nettoie le compte du chevalier", async () => {
    const res = await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 4000, monthCode: "M1" });
    expect(soldFor(useData.getState(), STU, SUB)).toBe(4000);
    expect(cashOf()).toHaveLength(1);

    const cashId = cashOf()[0].id;
    const gone = await useData.getState().deleteCashTransaction(cashId);
    expect(gone).toMatchObject({ ok: true });

    const db = useData.getState();
    expect(db.cash.some((c) => c.id === cashId)).toBe(false);
    expect(db.payments.some((p) => p.id === res.paymentId)).toBe(false);
    expect(soldFor(db, STU, SUB)).toBe(0);
    expect(cycleOf(db, STU, SUB, "M1").credited).toBe(0);
    expect(cashOf()).toHaveLength(0);
  });

  it("supprime un mouvement de caisse ordinaire sans toucher aux paiements", async () => {
    await useData.getState().addSold({ studentId: STU, subscriptionId: SUB, amount: 2000, monthCode: "M1" });
    useData.getState().cashMove("deposit", 5000, "Apport", "2026-01-10");
    const deposit = useData.getState().cash.find((c) => c.type === "deposit")!;

    expect(await useData.getState().deleteCashTransaction(deposit.id)).toMatchObject({ ok: true });

    const db = useData.getState();
    expect(db.cash.some((c) => c.id === deposit.id)).toBe(false);
    // Le versement du chevalier, lui, n'a pas bougé.
    expect(soldFor(db, STU, SUB)).toBe(2000);
    expect(cashOf()).toHaveLength(1);
  });

  it("ignore un identifiant inconnu", async () => {
    expect(await useData.getState().deleteStudentPayment("pay-inconnu")).toEqual({ ok: false });
    expect(await useData.getState().deleteCashTransaction("csh-inconnu")).toEqual({ ok: false });
    expect(await useData.getState().updateStudentPayment("pay-inconnu", { amount: 1 })).toEqual({
      ok: false,
    });
  });
});
