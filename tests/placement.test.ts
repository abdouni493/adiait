import { describe, it, expect, beforeEach } from "vitest";
import { useData } from "@/lib/store/data";
import { buildSeed } from "@/tests/fixtures/seed";
import { cycleOf, enrollmentStart, joinPointFor, soldFor } from "@/lib/helpers";
import {
  pendingPlacements,
  placementCartes,
  placementDates,
  placementStatus,
} from "@/lib/placement";
import type { Student } from "@/lib/types";

/**
 * LE PLACEMENT D'UN NOUVEAU CHEVALIER SUR UNE CARTE / SÉANCE PASSÉE.
 *
 * Les séances depuis le placement lui appartiennent mais restent « à
 * régulariser » : rien de débité, ni présence ni absence, jusqu'au pointage.
 */

const SUB = "sub-1";
const SES = "ses-1";
const OLD = "stu-1";
const NEW = "stu-new";

function board(monthSeances = 4) {
  const db = buildSeed();
  const sub = db.subscriptions.find((s) => s.id === SUB)!;
  sub.monthlySeances = monthSeances;
  sub.monthlyPrice = monthSeances * sub.pricePerSession;
  sub.schoolMonthShare = Math.round(sub.monthlyPrice / 2);
  sub.teacherPerSeance = Math.round(sub.monthlyPrice / 2 / monthSeances);
  db.attendance = [];
  db.payments = [];
  db.enrollments = db.enrollments.filter((e) => e.subscriptionId !== SUB);
  db.freePeriods = [];
  db.absencePenalties = [];
  const opened = new Date();
  opened.setDate(opened.getDate() - 400);
  const openedIso = opened.toLocaleDateString("fr-CA");
  db.students = db.students.map((st) =>
    st.id === OLD
      ? {
          ...st,
          subscriptionDates: {
            ...st.subscriptionDates,
            [SUB]: { subscribedAt: openedIso, startDate: openedIso },
          },
        }
      : { ...st, subscriptionIds: st.subscriptionIds.filter((id) => id !== SUB) },
  );
  useData.setState(db);
  return sub;
}

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function scheduledDays(count: number): string[] {
  const session = useData.getState().sessions.find((s) => s.id === SES)!;
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 120);
  while (out.length < count) {
    if (session.days.includes(DAY_KEYS[d.getDay()] as never)) out.push(d.toLocaleDateString("fr-CA"));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const mark = (studentId: string, date: string, status: "present" | "absent", retro = false) =>
  useData.getState().setPresence({ studentId, sessionId: SES, date, status, retro });

/** Crée le nouveau chevalier exactement comme l'écran de création. */
function createPlaced(arrival: string, carteCode: string, seance: number) {
  const db = useData.getState();
  const carte = placementCartes(db, SUB, arrival).find((c) => c.code === carteCode)!;
  const s = carte.seances.find((x) => x.index === seance)!;
  const point = joinPointFor(db, SUB, arrival);
  const student: Student = {
    id: NEW,
    registrationNumber: "00099",
    firstName: "Nadir",
    lastName: "Zerrouki",
    birthDate: "",
    phone: "",
    email: "",
    rfid: "RFID-9099",
    isFree: false,
    subscriptionIds: [SUB],
    subscriptionDates: {
      [SUB]: {
        subscribedAt: arrival,
        startDate: arrival,
        joinMonthCode: point.monthCode,
        joinSlotIndex: point.slotIndex,
        ...placementDates(db, SUB, { carteCode, seance, date: s.date, slot: s.slot }, arrival),
      },
    },
  };
  useData.setState({ students: [...db.students, student] });
  return student;
}

beforeEach(() => {
  useData.setState(buildSeed());
});

describe("placement sur une carte / séance précédente", () => {
  async function groupLived(n: number) {
    const days = scheduledDays(n + 1);
    for (const day of days.slice(0, n)) await mark(OLD, day, "present");
    await useData.getState().syncCartes();
    return days;
  }

  it("propose la carte courante et les cartes précédentes avec leurs séances", async () => {
    board(4);
    const days = await groupLived(6); // C1 complète, C2 à 2/4
    const cartes = placementCartes(useData.getState(), SUB, days[6]);
    expect(cartes[0].current).toBe(true);
    expect(cartes[0].code).toBe("M2");
    expect(cartes.map((c) => c.code)).toContain("M1");
    const m1 = cartes.find((c) => c.code === "M1")!;
    expect(m1.seances).toHaveLength(4);
    expect(m1.seances.every((s) => s.past)).toBe(true);
    // La carte courante propose la séance du jour (normale) après ses 2 séances tenues.
    expect(cartes[0].seances.some((s) => s.normal)).toBe(true);
  });

  it("carte courante + séance du jour : rien à régulariser", async () => {
    board(4);
    const days = await groupLived(6);
    const out = placementDates(useData.getState(), SUB, null, days[6]);
    expect(out).toEqual({});
  });

  it("les séances depuis le placement sont à régulariser, sans rien débiter", async () => {
    board(4);
    const days = await groupLived(6);
    // Placé en Carte 1 · séance 3 -> séances 3, 4 de C1 et 1, 2 de C2.
    createPlaced(days[6], "M1", 2);
    let db = useData.getState();
    const st = placementStatus(db, db.students.find((s) => s.id === NEW)!, SUB)!;
    expect(st.total).toBe(4);
    expect(st.pending.map((p) => p.date)).toEqual(days.slice(2, 6));
    expect(pendingPlacements(db)).toHaveLength(1);
    // Rien de débité, aucune présence ni absence.
    expect(soldFor(db, NEW, SUB)).toBe(0);
    expect(db.attendance.filter((a) => a.studentId === NEW)).toHaveLength(0);

    // Il commence normalement aujourd'hui.
    await mark(NEW, days[6], "present");
    db = useData.getState();
    expect(enrollmentStart(db, NEW, SUB)).toMatchObject({ monthIndex: 1, slotIndex: 2 });
  });

  it("régulariser débite normalement et ramène son entrée au placement choisi", async () => {
    const sub = board(4);
    const days = await groupLived(6);
    createPlaced(days[6], "M1", 2);
    await mark(NEW, days[6], "present");

    // Régularisation : 3 présents, 1 absent (l'absence coûte une séance).
    await mark(NEW, days[2], "present", true);
    await mark(NEW, days[3], "absent", true);
    await mark(NEW, days[4], "present", true);
    await mark(NEW, days[5], "present", true);

    const db = useData.getState();
    const st = placementStatus(db, db.students.find((s) => s.id === NEW)!, SUB)!;
    expect(st.pending).toHaveLength(0);
    expect(pendingPlacements(db)).toHaveLength(0);
    // Il entre exactement à Carte 1 · séance 3.
    expect(enrollmentStart(db, NEW, SUB)).toEqual({ monthIndex: 0, slotIndex: 2, offset: 2 });
    expect(cycleOf(db, NEW, SUB, "M1").done).toBe(2);
    expect(cycleOf(db, NEW, SUB, "M2").done).toBe(3);
    expect(soldFor(db, NEW, SUB)).toBe(-5 * sub.pricePerSession);
  });

  it("pointée depuis la feuille du jour (sans retro), la séance du placement se facture", async () => {
    const sub = board(4);
    const days = await groupLived(6);
    createPlaced(days[6], "M1", 2);
    await mark(NEW, days[2], "present");
    const db = useData.getState();
    const rec = db.attendance.find((a) => a.studentId === NEW)!;
    expect(rec.preStart).toBeFalsy();
    expect(rec.amountDeducted).toBe(sub.pricePerSession);
  });
});
