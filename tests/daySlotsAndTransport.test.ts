import { describe, it, expect, beforeEach } from "vitest";
import { useData } from "@/lib/store/data";
import { buildSeed } from "@/tests/fixtures/seed";
import {
  attendanceOn,
  attendancesOn,
  clashingDays,
  hasMultiSlotDays,
  schoolMonthShareOf,
  schoolPerSeanceOf,
  sessionSlotCountOn,
  sessionSlotsOn,
  sessionTimeLabel,
  sessionTimesOn,
  teacherMonthShareOf,
  teacherPerSeanceOf,
  transportMonthShareOf,
  transportPerSeanceOf,
  weeklySeanceCount,
} from "@/lib/helpers";
import type { ScheduleSession, Subscription } from "@/lib/types";

/**
 * DEUX SÉANCES LE MÊME JOUR, ET LA PART DU TRANSPORT.
 *
 * Un groupe s'entraîne parfois le matin PUIS le soir : ce sont deux séances,
 * pas une. Elles se pointent séparément, décomptent deux séances de la carte, et
 * rapportent deux parts à l'entraîneur.
 *
 * Et le prix d'une carte se coupe désormais en TROIS : le bus d'abord, puis le
 * club, puis ce qui reste pour l'entraîneur.
 */

const base = (over: Partial<ScheduleSession> = {}): ScheduleSession => ({
  id: "ses-x",
  classId: "cls-1",
  moduleId: "mod-1",
  groupId: "grp-1",
  salleId: "sal-1",
  teacherId: "tea-1",
  days: ["saturday", "tuesday"],
  startTime: "08:00",
  endTime: "10:00",
  ...over,
});

/** Un samedi à deux séances : le matin et le soir. */
const twoOnSaturday = () =>
  base({
    daySlots: {
      saturday: [
        { startTime: "08:00", endTime: "10:00" },
        { startTime: "17:00", endTime: "19:00" },
      ],
    },
  });

describe("les séances d'une journée", () => {
  it("rend UNE séance quand le jour n'en tient qu'une", () => {
    const s = base();
    expect(sessionSlotsOn(s, "saturday")).toEqual([{ startTime: "08:00", endTime: "10:00" }]);
    expect(sessionSlotCountOn(s, "saturday")).toBe(1);
    expect(hasMultiSlotDays(s)).toBe(false);
  });

  it("rend les DEUX séances du jour, dans l'ordre où elles tombent", () => {
    const s = twoOnSaturday();
    expect(sessionSlotsOn(s, "saturday")).toEqual([
      { startTime: "08:00", endTime: "10:00" },
      { startTime: "17:00", endTime: "19:00" },
    ]);
    // Le mardi, lui, n'en tient toujours qu'une : le repli reste en place.
    expect(sessionSlotsOn(s, "tuesday")).toEqual([{ startTime: "08:00", endTime: "10:00" }]);
    expect(hasMultiSlotDays(s)).toBe(true);
  });

  it("les range par heure de début, même saisies à l'envers", () => {
    const s = base({
      daySlots: {
        saturday: [
          { startTime: "17:00", endTime: "19:00" },
          { startTime: "08:00", endTime: "10:00" },
        ],
      },
    });
    expect(sessionSlotsOn(s, "saturday").map((t) => t.startTime)).toEqual(["08:00", "17:00"]);
  });

  it("`sessionTimesOn` lit la séance demandée, et la première par défaut", () => {
    const s = twoOnSaturday();
    expect(sessionTimesOn(s, "saturday")).toEqual({ startTime: "08:00", endTime: "10:00" });
    expect(sessionTimesOn(s, "saturday", 1)).toEqual({ startTime: "17:00", endTime: "19:00" });
  });

  it("compte les séances de la SEMAINE, pas les journées", () => {
    expect(weeklySeanceCount(base())).toBe(2); // samedi + mardi
    expect(weeklySeanceCount(twoOnSaturday())).toBe(3); // samedi ×2 + mardi
  });

  it("résume les deux horaires du jour", () => {
    expect(sessionTimeLabel(twoOnSaturday(), "saturday")).toBe(
      "08:00 – 10:00 · 17:00 – 19:00",
    );
    expect(sessionTimeLabel(twoOnSaturday(), "saturday", 1)).toBe("17:00 – 19:00");
  });

  it("une arène est prise dès qu'UNE des deux séances se chevauche", () => {
    const evening = base({
      id: "ses-soir",
      days: ["saturday"],
      startTime: "17:30",
      endTime: "19:30",
    });
    // Le matin seul ne heurte rien ; le matin ET le soir, si.
    expect(clashingDays(base({ days: ["saturday"] }), evening, "sal-1")).toEqual([]);
    expect(clashingDays(twoOnSaturday(), evening, "sal-1")).toEqual(["saturday"]);
  });
});

describe("le partage du prix d'une carte, en trois", () => {
  const sub = (over: Partial<Subscription> = {}): Subscription => ({
    id: "sub-x",
    sessionId: "ses-x",
    pricePerSession: 1000,
    monthlySeances: 4,
    monthlyPrice: 4000,
    schoolMonthShare: 2000,
    ...over,
  });

  it("sans transport, la carte se coupe exactement comme avant", () => {
    const s = sub();
    expect(transportMonthShareOf(s)).toBe(0);
    expect(schoolMonthShareOf(s)).toBe(2000);
    expect(teacherMonthShareOf(s)).toBe(2000);
    expect(schoolPerSeanceOf(s)).toBe(500);
    expect(teacherPerSeanceOf(s)).toBe(500);
  });

  it("le transport se prélève AVANT le club et l'entraîneur", () => {
    // 4 000 DA : 800 de bus, 2 000 pour le club, il reste 1 200 à l'entraîneur.
    const s = sub({ transportMonthShare: 800, teacherPerSeance: undefined });
    expect(transportMonthShareOf(s)).toBe(800);
    expect(schoolMonthShareOf(s)).toBe(2000);
    expect(teacherMonthShareOf(s)).toBe(1200);
    expect(transportPerSeanceOf(s)).toBe(200);
    expect(schoolPerSeanceOf(s)).toBe(500);
    expect(teacherPerSeanceOf(s)).toBe(300);
  });

  it("la part du club est ramenée à ce qui reste après le bus", () => {
    // Le club réclame 4 000 alors que le bus en a déjà pris 1 000.
    const s = sub({ transportMonthShare: 1000, schoolMonthShare: 4000 });
    expect(schoolMonthShareOf(s)).toBe(3000);
    expect(teacherMonthShareOf(s)).toBe(0);
  });

  it("le transport ne dépasse jamais le prix de la carte", () => {
    const s = sub({ transportMonthShare: 9999 });
    expect(transportMonthShareOf(s)).toBe(4000);
    expect(teacherMonthShareOf(s)).toBe(0);
  });

  it("garde ses décimales : une carte qui ne tombe pas juste se partage au centime", () => {
    // 4 000 sur 3 séances, 700 de bus, 1 900 pour le club -> 1 400 à l'entraîneur.
    const s = sub({
      monthlySeances: 3,
      transportMonthShare: 700,
      schoolMonthShare: 1900,
      teacherPerSeance: undefined,
    });
    expect(teacherMonthShareOf(s)).toBe(1400);
    expect(transportPerSeanceOf(s)).toBeCloseTo(233.33, 2);
    expect(teacherPerSeanceOf(s)).toBeCloseTo(466.67, 2);
  });
});

describe("pointer les deux séances d'une même journée", () => {
  const SES = "ses-1";
  const DAY = "2026-03-07";

  beforeEach(() => {
    const seed = buildSeed();
    useData.setState({
      ...seed,
      sessions: seed.sessions.map((s) =>
        s.id === SES
          ? {
              ...s,
              days: ["saturday"],
              daySlots: {
                saturday: [
                  { startTime: "08:00", endTime: "10:00" },
                  { startTime: "17:00", endTime: "19:00" },
                ],
              },
            }
          : s,
      ),
      attendance: [],
      unpaidTeacher: [],
    });
  });

  it("écrit DEUX lignes le même jour, une par séance", async () => {
    const db = useData.getState();
    const student = db.students.find((s) =>
      s.subscriptionIds.includes(db.subscriptions.find((x) => x.sessionId === SES)!.id),
    )!;

    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 0, status: "present" });
    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 1, status: "present" });

    const rows = attendancesOn(useData.getState(), student.id, SES, DAY);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.slot ?? 0)).toEqual([0, 1]);
  });

  it("chaque séance se relit séparément", async () => {
    const db = useData.getState();
    const student = db.students.find((s) =>
      s.subscriptionIds.includes(db.subscriptions.find((x) => x.sessionId === SES)!.id),
    )!;

    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 0, status: "present" });
    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 1, status: "absent" });

    expect(attendanceOn(useData.getState(), student.id, SES, DAY, 0)?.status).toBe("present");
    expect(attendanceOn(useData.getState(), student.id, SES, DAY, 1)?.status).toBe("absent");
  });

  it("retirer la séance du matin laisse celle du soir intacte", async () => {
    const db = useData.getState();
    const student = db.students.find((s) =>
      s.subscriptionIds.includes(db.subscriptions.find((x) => x.sessionId === SES)!.id),
    )!;

    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 0, status: "present" });
    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 1, status: "present" });
    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 0, status: null });

    const rows = attendancesOn(useData.getState(), student.id, SES, DAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].slot).toBe(1);
    // La part due à l'entraîneur pour la séance du SOIR n'a pas été emportée.
    const dues = useData
      .getState()
      .unpaidTeacher.filter((u) => u.sessionId === SES && u.studentId === student.id);
    expect(dues).toHaveLength(1);
    expect(dues[0].slot).toBe(1);
  });

  it("deux séances rapportent DEUX parts à l'entraîneur", async () => {
    const db = useData.getState();
    const student = db.students.find((s) =>
      s.subscriptionIds.includes(db.subscriptions.find((x) => x.sessionId === SES)!.id),
    )!;

    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 0, status: "present" });
    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 1, status: "present" });

    const dues = useData
      .getState()
      .unpaidTeacher.filter((u) => u.sessionId === SES && u.studentId === student.id);
    expect(dues).toHaveLength(2);
    expect(new Set(dues.map((d) => d.slot ?? 0))).toEqual(new Set([0, 1]));
  });

  it("deux séances consomment DEUX séances de la carte", async () => {
    const before = useData.getState();
    const sub = before.subscriptions.find((x) => x.sessionId === SES)!;
    const student = before.students.find((s) => s.subscriptionIds.includes(sub.id))!;
    const consumedBefore =
      before.enrollments.find((e) => e.studentId === student.id && e.subscriptionId === sub.id)
        ?.consumedSeances ?? 0;

    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 0, status: "present" });
    await useData
      .getState()
      .setPresence({ studentId: student.id, sessionId: SES, date: DAY, slot: 1, status: "present" });

    const after = useData
      .getState()
      .enrollments.find((e) => e.studentId === student.id && e.subscriptionId === sub.id)!;
    expect(after.consumedSeances).toBe(consumedBefore + 2);
  });
});
