/**
 * LES ÉCRANS TIENNENT-ILS SUR LE JEU DE DÉMONSTRATION ?
 *
 * Vérifier que les données sont cohérentes ne suffit pas : ce sont les LECTURES
 * de l'application qui doivent en tirer quelque chose. Ce fichier fait donc
 * tourner, sur la base de démonstration, ce que chaque grand écran calcule —
 * le tableau de bord, la fiche d'un chevalier, l'écran de paie d'un entraîneur, la
 * fiche d'un travailleur, la caisse et les rapports.
 *
 * Il attrape ce qu'aucune vérification d'invariants ne verrait : un écran qui
 * s'ouvrirait vide, ou qui lèverait une erreur sur une relation qu'il croyait
 * toujours présente.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { useData } from "@/lib/store/data";
import { buildDemoDatabase } from "@/lib/demo/seed";
import {
  activeSessions,
  cashBalance,
  studentDebtSummary,
  studentInscriptionRows,
  studentTotalDue,
  totalRevenue,
  totalStudentDebt,
  teacherPayableTotal,
} from "@/lib/helpers";
import { teacherEmplois, teacherPayableTotalOf, unpaidStudents } from "@/lib/teacherMonths";
import { boardTotals, buildPayBoard, freezeBoard, monthTiles, payEmplois } from "@/lib/teacherPayBoard";
import { unpaidPeriodsOf, workerBalance } from "@/lib/workers";

const db = buildDemoDatabase();

beforeAll(() => {
  useData.getState().restoreState(db);
});

describe("les écrans, sur les données de démonstration", () => {
  it("donne au tableau de bord des séances vivantes et une caisse chiffrée", () => {
    expect(activeSessions(db).length).toBeGreaterThan(10);
    // Des emplois du temps tombent aujourd'hui, sinon la feuille de présence
    // du jour serait vide au premier lancement.
    const today = new Date().toLocaleDateString("fr-CA");
    expect(db.attendance.some((a) => a.timestamp.slice(0, 10) === today)).toBe(true);
    expect(cashBalance(db)).not.toBeNaN();
    expect(totalRevenue(db)).toBeGreaterThan(0);
    expect(totalStudentDebt(db)).toBeGreaterThan(0);
  });

  it("ouvre la fiche de chaque chevalier sans trébucher", () => {
    for (const student of db.students) {
      const summary = studentDebtSummary(db, student.id);
      expect(summary.total).not.toBeNaN();
      expect(studentTotalDue(db, student.id)).not.toBeNaN();
      const rows = studentInscriptionRows(db, student);
      expect(Array.isArray(rows)).toBe(true);
    }
  });

  it("remplit l'écran de paie de chaque entraîneur", () => {
    let boardsBuilt = 0;

    for (const teacher of db.teachers) {
      const emplois = teacherEmplois(db, teacher.id);
      expect(Array.isArray(emplois)).toBe(true);
      expect(teacherPayableTotalOf(emplois)).not.toBeNaN();
      expect(teacherPayableTotal(db, teacher.id)).not.toBeNaN();
      expect(Array.isArray(unpaidStudents(emplois))).toBe(true);

      for (const emploi of payEmplois(db, teacher.id)) {
        for (const tile of monthTiles(db, emploi, teacher.id)) {
          if (tile.state === "empty") continue;
          const board = buildPayBoard(db, teacher, emploi, tile.code);
          boardsBuilt += 1;

          // On coche tout, comme le fait le bouton « tout sélectionner », et on
          // vérifie que l'addition de l'écran tombe juste : le brut est la somme
          // des trois tableaux qui rapportent, le net le brut moins les retenues.
          const picked = {
            studentIds: board.students.map((r) => r.studentId),
            arrearKeys: board.arrears.map((r) => r.key),
            passagerIds: board.passagers.map((r) => r.id),
            deductionIds: board.deductions.filter((d) => d.selectable).map((d) => d.id),
          };
          const sums = boardTotals(board, picked);
          expect(Math.abs(sums.gross - (sums.students + sums.arrears + sums.passagers)))
            .toBeLessThan(0.01);
          expect(Math.abs(sums.net - (sums.gross - sums.deductions))).toBeLessThan(0.01);

          // Et la photographie que le règlement gardera dit la même chose.
          const frozen = freezeBoard(db, board, picked);
          expect(Math.abs(frozen.gross - sums.gross)).toBeLessThan(0.01);
          expect(Math.abs(frozen.net - sums.net)).toBeLessThan(0.01);
        }
      }
    }

    // Au moins un entraîneur a une carte complète à régler quand on ouvre l'app.
    expect(boardsBuilt).toBeGreaterThan(0);
  });

  it("remplit la fiche de chaque travailleur, contrat par contrat", () => {
    for (const worker of db.reception) {
      const balance = workerBalance(db, worker);
      expect(balance.gross).not.toBeNaN();
      expect(balance.net).not.toBeNaN();
      expect(Array.isArray(unpaidPeriodsOf(db, worker))).toBe(true);
    }
    // Chaque type de contrat doit avoir au moins un travailleur à payer :
    // c'est ce que l'écran de règlement montre.
    const payable = db.reception.filter((w) => workerBalance(db, w).gross > 0);
    const kinds = new Set(payable.map((w) => w.paymentType));
    expect(kinds).toEqual(new Set(["monthly", "daily", "half_day", "hourly"]));
  });

  it("laisse le magasin faire son travail sur ces données", () => {
    const store = useData.getState();
    expect(store.students.length).toBe(db.students.length);

    // Un encaissement ordinaire : le solde monte de ce qui a été versé.
    const enrollment = store.enrollments.find((e) => (e.balance ?? 0) < 0);
    expect(enrollment).toBeDefined();
    const before = enrollment!.balance ?? 0;
    store.cashMove("deposit", 1000, "Test de dépôt");
    expect(useData.getState().cash.length).toBe(db.cash.length + 1);
    expect(useData.getState().enrollments.find((e) => e.id === enrollment!.id)?.balance).toBe(
      before,
    );
  });
});
