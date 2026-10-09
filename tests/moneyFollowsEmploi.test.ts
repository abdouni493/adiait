import { describe, it, expect, beforeEach } from "vitest";
import { useData } from "@/lib/store/data";
import { buildSeed } from "@/tests/fixtures/seed";
import {
  cycleCredits,
  cycleOf,
  enrollmentCycles,
  monthProposal,
  soldFor,
  studentSoldDebtRows,
} from "@/lib/helpers";
import { withClearedColumns } from "@/lib/supabase/persist";

/**
 * L'ARGENT SUIT L'EMPLOI DU TEMPS.
 *
 * Le cas réel qui a motivé ces tests : un chevalier verse 40 000 DA à son
 * inscription, sur la carte 1 d'un emploi à 5 000 DA la carte (8 séances à
 * 625 DA). La carte 1 se pointait correctement — puis la carte 2 s'affichait
 * « sans crédit », en dette dès sa première séance, alors que son solde était
 * encore de 35 000 DA. L'argent était épinglé au code de carte écrit sur le
 * versement ; il appartient désormais à l'emploi du temps, et paie les cartes
 * dans l'ordre.
 */

const SUB = "sub-1";
const SES = "ses-1";
const STU = "stu-1";
const PRICE = 625;
const SIZE = 8;

function board() {
  const db = buildSeed();
  const sub = db.subscriptions.find((s) => s.id === SUB)!;
  sub.pricePerSession = PRICE;
  sub.monthlySeances = SIZE;
  sub.monthlyPrice = PRICE * SIZE;
  sub.schoolMonthShare = 3040;
  sub.transportMonthShare = 1000;
  sub.teacherPerSeance = 120;
  db.attendance = [];
  db.payments = [];
  db.unpaidTeacher = [];
  db.freePeriods = [];
  db.enrollments = db.enrollments.filter((e) => e.subscriptionId !== SUB);
  const opened = new Date();
  opened.setDate(opened.getDate() - 400);
  const student = db.students.find((st) => st.id === STU)!;
  student.subscriptionDates = {
    ...student.subscriptionDates,
    [SUB]: {
      subscribedAt: opened.toLocaleDateString("fr-CA"),
      startDate: opened.toLocaleDateString("fr-CA"),
    },
  };
  useData.setState(db);
}

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function scheduledDays(count: number): string[] {
  const session = useData.getState().sessions.find((s) => s.id === SES)!;
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 300);
  while (out.length < count) {
    if (session.days.includes(DAY_KEYS[d.getDay()] as never)) out.push(d.toLocaleDateString("fr-CA"));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const mark = (date: string, status: "present" | "absent" | "cancelled" = "present") =>
  useData.getState().setPresence({ studentId: STU, sessionId: SES, date, status });

beforeEach(() => board());

describe("40 000 DA versés sur la carte 1 paient les cartes suivantes", () => {
  it("la carte 2 n'est PAS en dette : la bourse de l'emploi la paie", async () => {
    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 40000, monthCode: "M1" });
    const days = scheduledDays(11);
    for (const day of days) await mark(day);

    const db = useData.getState();
    expect(soldFor(db, STU, SUB)).toBe(40000 - 11 * PRICE);

    const c1 = cycleOf(db, STU, SUB, "M1");
    expect(c1.complete).toBe(true);
    expect(c1.credited).toBe(5000);
    expect(c1.balance).toBe(0);

    const c2 = cycleOf(db, STU, SUB, "M2");
    expect(c2.done).toBe(3);
    expect(c2.credited).toBe(5000);
    expect(c2.balance).toBe(5000 - 3 * PRICE);

    // Rien n'est dû, nulle part.
    expect(studentSoldDebtRows(db, STU)).toEqual([]);
    expect(monthProposal(db, STU, SUB, "M2").total).toBe(0);
  });

  it("liste les cartes payées d'avance, jusqu'à la huitième", () => {
    return useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 40000, monthCode: "M1" })
      .then(() => {
        const db = useData.getState();
        const cycles = enrollmentCycles(db, STU, SUB);
        expect(cycles).toHaveLength(8);
        expect(cycles.every((c) => c.credited === 5000)).toBe(true);
        // La somme des cartes est toujours le solde de l'emploi.
        expect(cycles.reduce((s, c) => s + c.balance, 0)).toBe(soldFor(db, STU, SUB));
        expect(cycleOf(db, STU, SUB, "M9").credited).toBe(0);
        // Les écrans de paie ne veulent que les cartes vécues.
        expect(enrollmentCycles(db, STU, SUB, { prepaid: false })).toHaveLength(1);
      });
  });

  it("quand la bourse est vide, la dette commence séance après séance", async () => {
    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 5000, monthCode: "M1" });
    const days = scheduledDays(10);
    for (const day of days.slice(0, 8)) await mark(day);
    expect(soldFor(useData.getState(), STU, SUB)).toBe(0);

    await mark(days[8]);
    await mark(days[9], "absent");

    const db = useData.getState();
    expect(soldFor(db, STU, SUB)).toBe(-2 * PRICE);
    const c2 = cycleOf(db, STU, SUB, "M2");
    expect(c2.credited).toBe(0);
    expect(c2.balance).toBe(-2 * PRICE);
    expect(studentSoldDebtRows(db, STU)).toEqual([
      expect.objectContaining({ code: "M2", debt: 2 * PRICE }),
    ]);
  });

  it("un versement fait plus tard sur « la carte 3 » éponge d'abord la plus ancienne dette", async () => {
    const days = scheduledDays(10);
    for (const day of days) await mark(day);
    // 10 séances, rien versé : carte 1 (8) et 2 séances de la carte 2 dues.
    expect(soldFor(useData.getState(), STU, SUB)).toBe(-10 * PRICE);

    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 5000, monthCode: "M3" });
    const db = useData.getState();
    expect(cycleOf(db, STU, SUB, "M1").balance).toBe(0);
    expect(cycleOf(db, STU, SUB, "M2").balance).toBe(-2 * PRICE);
  });

  it("dit d'où vient l'argent qui paie chaque carte", async () => {
    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 5000, monthCode: "M1" });
    await useData.getState().addSold({
      studentId: STU,
      subscriptionId: SUB,
      amount: 2500,
      monthCode: "M1",
      source: "school_cash",
    });
    const db = useData.getState();
    expect(cycleCredits(db, STU, SUB, "M1")).toMatchObject({ family: 5000, school: 0, total: 5000 });
    expect(cycleCredits(db, STU, SUB, "M2")).toMatchObject({ family: 0, school: 2500, total: 2500 });
  });
});

describe("une absence débite le solde du prix de la séance", () => {
  it("présence et absence coûtent la même chose ; l'annulée ne coûte rien", async () => {
    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 5000, monthCode: "M1" });
    const days = scheduledDays(3);
    await mark(days[0], "absent");
    await mark(days[1], "present");
    await mark(days[2], "cancelled");
    expect(soldFor(useData.getState(), STU, SUB)).toBe(5000 - 2 * PRICE);

    // « Retour » sur l'absence rend son prix.
    await useData.getState().setPresence({ studentId: STU, sessionId: SES, date: days[0], status: null });
    expect(soldFor(useData.getState(), STU, SUB)).toBe(5000 - PRICE);
  });

  it("un chevalier qui n'a jamais rien versé plonge dans le rouge, absences comprises", async () => {
    const days = scheduledDays(2);
    await mark(days[0], "absent");
    await mark(days[1], "absent");
    expect(soldFor(useData.getState(), STU, SUB)).toBe(-2 * PRICE);
  });
});

describe("le badge débite comme la feuille", () => {
  it("un chevalier sans ligne de solde, badgé, doit le prix de sa séance", async () => {
    const [day] = scheduledDays(1);
    const when = new Date(`${day}T08:05:00`);
    const student = useData.getState().students.find((s) => s.id === STU)!;
    expect(useData.getState().enrollments.some((e) => e.studentId === STU && e.subscriptionId === SUB)).toBe(false);

    const res = await useData.getState().scanCard(student.rfid, when);
    expect(res.ok).toBe(true);
    expect(res.cost).toBe(PRICE);
    expect(soldFor(useData.getState(), STU, SUB)).toBe(-PRICE);
  });
});

describe("corriger une présence depuis la fiche bouge le solde de l'écart", () => {
  it("présent -> annulée rend la séance, et l'inverse la reprend", async () => {
    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 5000, monthCode: "M1" });
    const [day] = scheduledDays(1);
    await mark(day);
    const att = useData.getState().attendance.find((a) => a.studentId === STU)!;

    await useData.getState().updateAttendance(att.id, { status: "cancelled" });
    expect(soldFor(useData.getState(), STU, SUB)).toBe(5000);
    expect(cycleOf(useData.getState(), STU, SUB, "M1").done).toBe(0);

    await useData.getState().updateAttendance(att.id, { status: "absent" });
    expect(soldFor(useData.getState(), STU, SUB)).toBe(5000 - PRICE);
    expect(cycleOf(useData.getState(), STU, SUB, "M1").done).toBe(1);

    // Corriger le prix débité rend exactement la différence.
    await useData.getState().updateAttendance(att.id, { amount: 500 });
    expect(soldFor(useData.getState(), STU, SUB)).toBe(5000 - 500);
  });

  it("supprimer une présence depuis la fiche rend ce qu'elle avait débité", async () => {
    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 5000, monthCode: "M1" });
    const [day] = scheduledDays(1);
    await mark(day, "absent");
    const att = useData.getState().attendance.find((a) => a.studentId === STU)!;
    const res = await useData.getState().cancelAttendance(att.id);
    expect(res.ok).toBe(true);
    expect(res.refunded).toBe(1);
    expect(soldFor(useData.getState(), STU, SUB)).toBe(5000);
  });
});

describe("un champ vidé à l'écran se vide en base", () => {
  it("envoie null pour une colonne qui portait une valeur et n'en porte plus", () => {
    const before = { id: "crt-1", start_date: "2026-10-02", end_date: "2026-10-23", held: 0 };
    const now = { id: "crt-1", held: 0 };
    expect(withClearedColumns(now, before, "id")).toEqual({
      id: "crt-1",
      held: 0,
      start_date: null,
      end_date: null,
    });
    // Une ligne neuve n'a rien à vider.
    expect(withClearedColumns(now, undefined, "id")).toBe(now);
  });
});
