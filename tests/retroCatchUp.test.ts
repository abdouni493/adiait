import { describe, it, expect, beforeEach } from "vitest";
import { useData } from "@/lib/store/data";
import { buildSeed } from "@/tests/fixtures/seed";
import {
  cycleLead,
  cycleOf,
  cycleSlots,
  enrollmentStart,
  soldFor,
} from "@/lib/helpers";
import type { Student } from "@/lib/types";

/**
 * RATTRAPAGE DES SÉANCES PRÉCÉDENTES.
 *
 * Un chevalier créé en retard commence là où en est le groupe, mais il a pu
 * être là pour les séances d'avant. Les pointer (retro) doit les rattacher à
 * SA carte d'entrée — jamais les pousser sur la carte suivante.
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

const present = (studentId: string, date: string) =>
  useData.getState().setPresence({ studentId, sessionId: SES, date, status: "present" });

const retroPresent = (studentId: string, date: string) =>
  useData.getState().setPresence({ studentId, sessionId: SES, date, status: "present", retro: true });

function registerNew(monthCode: string, slotIndex: number, day: string) {
  const student: Student = {
    id: NEW,
    registrationNumber: "00099",
    firstName: "Nadir",
    lastName: "Zerrouki",
    birthDate: "",
    phone: "",
    email: "nadir.zerrouki@eleve.test",
    rfid: "RFID-9099",
    isFree: false,
    subscriptionIds: [SUB],
    subscriptionDates: {
      [SUB]: {
        subscribedAt: day,
        startDate: day,
        joinMonthCode: monthCode,
        joinSlotIndex: slotIndex,
      },
    },
  };
  useData.setState({ students: [...useData.getState().students, student] });
  return student;
}

beforeEach(() => {
  useData.setState(buildSeed());
});

describe("rattraper les séances d'avant garde tout sur la carte d'entrée", () => {
  it("les séances rattrapées remontent le point d'entrée au lieu de déborder", async () => {
    const sub = board(4);
    // Le groupe a vécu M1 en entier puis les 2 premières séances de M2.
    const days = scheduledDays(7);
    for (const day of days.slice(0, 6)) await present(OLD, day);

    // Le nouveau est créé aujourd'hui (séance 3 de M2) et pointé présent.
    registerNew("M2", 2, days[6]);
    await present(NEW, days[6]);

    // Il était en fait là pour les DEUX séances de M2 d'avant : on les rattrape.
    await retroPresent(NEW, days[4]);
    await retroPresent(NEW, days[5]);

    const db = useData.getState();

    // Son point d'entrée remonte : il entre désormais à la séance 1 de M2.
    expect(enrollmentStart(db, NEW, SUB)).toEqual({
      monthIndex: 1,
      slotIndex: 0,
      offset: 4,
    });
    expect(cycleLead(db, NEW, SUB, "M2")).toBe(0);

    // Les 3 séances sont TOUTES sur M2 — rien n'a été poussé sur M3.
    const m2 = cycleOf(db, NEW, SUB, "M2");
    const m3 = cycleOf(db, NEW, SUB, "M3");
    expect(m2.done).toBe(3);
    expect(m3.done).toBe(0);
    expect(cycleSlots(db, NEW, SUB, "M2")).toHaveLength(3);

    // Le solde débité : 3 séances consommées.
    expect(soldFor(db, NEW, SUB)).toBe(-3 * sub.pricePerSession);
  });

  it("un chevalier à l'heure n'est pas touché (aucune séance avant son inscription)", async () => {
    board(4);
    const days = scheduledDays(7);
    for (const day of days.slice(0, 6)) await present(OLD, day);
    registerNew("M2", 2, days[6]);
    await present(NEW, days[6]);
    expect(enrollmentStart(useData.getState(), NEW, SUB)).toEqual({
      monthIndex: 1,
      slotIndex: 2,
      offset: 6,
    });
  });
});
