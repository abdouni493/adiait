import { describe, it, expect, beforeEach } from "vitest";
import { useData } from "@/lib/store/data";
import { buildSeed } from "@/tests/fixtures/seed";
import {
  carteLayout,
  cartesOf,
  presenceLock,
  semesterProgress,
  sessionSeances,
  sessionTotals,
  studentsOfSession,
} from "@/lib/semesters";
import { soldFor } from "@/lib/helpers";

/**
 * LE MOTEUR DES CARTES ET DES SEMESTRES, mené par les mêmes clics que la
 * feuille de présence.
 *
 * Le scénario de référence est celui que le club a décrit :
 *
 *   Un semestre du 15 septembre au 15 janvier. Deux emplois du temps, chacun
 *   avec une carte de 4 séances qui démarre le 20 septembre. On pointe. La
 *   carte 1 se ferme sur sa 4e séance, la carte 2 s'ouvre toute seule, et la
 *   date de départ de chacune est celle de sa PREMIÈRE présence — jamais celle
 *   qui avait été annoncée.
 *
 *   Puis une séance est annulée pour tout le groupe : elle ne compte pas, la
 *   carte finit une semaine plus tard, et si cela déborde la date de fin, le
 *   semestre est prolongé au lieu de se fermer.
 */

const SES = "ses-1";
const SUB = "sub-1";
const STU = "stu-1";
const SEM = "sem-test";

/** Un magasin propre : un semestre, un emploi du temps, une carte de 4 séances. */
function board(opts: { start?: string; end?: string; size?: number } = {}) {
  const size = opts.size ?? 4;
  const db = buildSeed();
  const sub = db.subscriptions.find((s) => s.id === SUB)!;
  sub.monthlySeances = size;
  sub.monthlyPrice = size * sub.pricePerSession;
  db.attendance = [];
  db.payments = [];
  db.freePeriods = [];
  db.enrollments = db.enrollments.filter((e) => e.subscriptionId !== SUB);
  db.semesters = [
    {
      id: SEM,
      name: "Saison de test",
      startDate: opts.start ?? "2026-09-15",
      endDate: opts.end ?? "2027-01-15",
      plannedEndDate: opts.end ?? "2027-01-15",
    },
  ];
  db.sessions = db.sessions.map((s) => (s.id === SES ? { ...s, semesterId: SEM } : s));
  db.emploiCartes = [];
  const student = db.students.find((st) => st.id === STU)!;
  student.subscriptionDates = {
    ...student.subscriptionDates,
    [SUB]: { subscribedAt: "2026-09-01", startDate: "2026-09-01" },
  };
  useData.setState(db);
  return { size };
}

/** Pointe une présence un jour donné, puis laisse le moteur travailler. */
async function mark(date: string, status: "present" | "cancelled" = "present") {
  await useData.getState().setPresence({ studentId: STU, sessionId: SES, date, status });
  await useData.getState().syncCartes();
}

beforeEach(() => {
  useData.setState(buildSeed());
});

describe("une carte commence à sa première présence, pas à la date annoncée", () => {
  it("la carte 1 reste « prévue » tant que personne n'a été pointé", async () => {
    board();
    const res = await useData
      .getState()
      .openFirstCarte({ sessionId: SES, semesterId: SEM, startDate: "2026-09-20" });
    expect(res.ok).toBe(true);

    await useData.getState().syncCartes();
    const [carte] = cartesOf(useData.getState(), SES);
    expect(carte.index).toBe(1);
    expect(carte.code).toBe("M1");
    expect(carte.plannedStartDate).toBe("2026-09-20");
    expect(carte.startDate).toBeUndefined();
    expect(carte.status).toBe("planned");
  });

  it("la date de départ se décale au jour du premier pointage", async () => {
    board();
    await useData
      .getState()
      .openFirstCarte({ sessionId: SES, semesterId: SEM, startDate: "2026-09-20" });

    // Prévue le 20, pointée pour la première fois le 27 : elle commence le 27.
    await mark("2026-09-27");

    const [carte] = cartesOf(useData.getState(), SES);
    expect(carte.startDate).toBe("2026-09-27");
    expect(carte.plannedStartDate).toBe("2026-09-20");
    expect(carte.status).toBe("running");
    expect(carte.held).toBe(1);
  });
});

describe("la carte suivante n'existe qu'une fois la précédente close", () => {
  it("aucune carte 2 tant que la carte 1 n'a pas donné ses 4 séances", async () => {
    board({ size: 4 });
    await useData
      .getState()
      .openFirstCarte({ sessionId: SES, semesterId: SEM, startDate: "2026-09-20" });

    for (const day of ["2026-09-20", "2026-09-27", "2026-10-04"]) {
      await mark(day);
    }
    expect(cartesOf(useData.getState(), SES)).toHaveLength(1);
    expect(carteLayout(useData.getState(), SES)[0].held).toBe(3);
    expect(carteLayout(useData.getState(), SES)[0].complete).toBe(false);

    // La 4e séance ferme la carte 1 — et ouvre la carte 2.
    await mark("2026-10-11");

    const cartes = cartesOf(useData.getState(), SES);
    expect(cartes).toHaveLength(2);
    expect(cartes[0].status).toBe("complete");
    expect(cartes[0].endDate).toBe("2026-10-11");
    expect(cartes[1].index).toBe(2);
    expect(cartes[1].code).toBe("M2");
    expect(cartes[1].startDate).toBeUndefined();
  });

  it("la carte 2 prend pour début la date de sa propre première présence", async () => {
    board({ size: 4 });
    await useData
      .getState()
      .openFirstCarte({ sessionId: SES, semesterId: SEM, startDate: "2026-09-20" });
    for (const day of ["2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11"]) {
      await mark(day);
    }

    await mark("2026-10-25"); // deux semaines plus tard : c'est CE jour-là

    const cartes = cartesOf(useData.getState(), SES);
    expect(cartes[1].startDate).toBe("2026-10-25");
    expect(cartes[1].status).toBe("running");
    expect(cartes[1].held).toBe(1);
  });
});

describe("une séance annulée pour tout le groupe ne compte pas", () => {
  it("elle n'avance pas la carte et se lit comme décalée", async () => {
    board({ size: 4 });
    await useData
      .getState()
      .openFirstCarte({ sessionId: SES, semesterId: SEM, startDate: "2026-09-20" });

    await mark("2026-09-20");
    await mark("2026-09-27", "cancelled"); // annulée pour tout le monde
    await mark("2026-10-04");

    const [view] = carteLayout(useData.getState(), SES);
    expect(view.held).toBe(2); // la séance annulée n'a pas eu lieu
    expect(view.postponed).toContain("2026-09-27");

    // La séance annulée est bien enregistrée : elle existe, elle ne compte pas.
    const seances = sessionSeances(useData.getState(), SES);
    expect(seances.find((s) => s.date === "2026-09-27")?.cancelled).toBe(true);
  });
});

describe("le semestre ne se ferme pas sur une carte inachevée", () => {
  it("passé la date de fin, aucune carte nouvelle ne s'ouvre", async () => {
    board({ size: 2, end: "2026-10-01" });
    await useData
      .getState()
      .openFirstCarte({ sessionId: SES, semesterId: SEM, startDate: "2026-09-20" });

    // La carte 1 se ferme le 4 octobre, APRÈS la date de fin annoncée : plus
    // rien ne s'ouvre derrière elle.
    await mark("2026-09-27");
    await mark("2026-10-04");

    expect(cartesOf(useData.getState(), SES)).toHaveLength(1);
  });

  it("une carte qui déborde repousse la date de fin du semestre", async () => {
    board({ size: 2, end: "2026-10-01" });
    await useData
      .getState()
      .openFirstCarte({ sessionId: SES, semesterId: SEM, startDate: "2026-09-20" });

    await mark("2026-09-27");
    await mark("2026-10-20"); // la dernière séance tombe bien après le 1er octobre

    const semester = useData.getState().semesters.find((s) => s.id === SEM)!;
    expect(semester.endDate).toBe("2026-10-20");
    expect(semester.plannedEndDate).toBe("2026-10-01");
  });

  it("il reste « prolongé » tant qu'une carte court encore", async () => {
    board({ size: 4, end: "2026-10-01" });
    await useData
      .getState()
      .openFirstCarte({ sessionId: SES, semesterId: SEM, startDate: "2026-09-20" });
    await mark("2026-09-27"); // 1 séance sur 4 : la carte court

    const db = useData.getState();
    const progress = semesterProgress(db, db.semesters[0], "2026-11-01");
    expect(progress.state).toBe("overdue");
    expect(progress.pending).toBe(1);
  });
});

describe("une saison close ferme le pointage", () => {
  it("aucune présence ne s'écrit tant que le semestre suivant n'existe pas", async () => {
    board({ end: "2026-10-01" });
    await useData.getState().closeSemester(SEM);

    const lock = presenceLock(useData.getState(), "2026-11-05");
    expect(lock.locked).toBe(true);

    const res = await useData
      .getState()
      .setPresence({ studentId: STU, sessionId: SES, date: "2026-11-05", status: "present" });
    expect(res.ok).toBe(false);
    expect(res.messageKey).toBe("semester.closed");
  });

  it("créer le semestre suivant rouvre le pointage", async () => {
    board({ end: "2026-10-01" });
    await useData.getState().closeSemester(SEM);
    await useData.getState().saveSemester({
      name: "Deuxième semestre",
      startDate: "2026-10-02",
      endDate: "2027-02-01",
    });

    expect(presenceLock(useData.getState(), "2026-11-05").locked).toBe(false);
  });

  it("un club sans le moindre semestre n'est jamais bloqué", () => {
    useData.setState(buildSeed());
    expect(presenceLock(useData.getState(), "2026-11-05").locked).toBe(false);
  });
});

describe("la mutation d'un chevalier emporte son solde et laisse son histoire", () => {
  it("le solde restant est retiré de l'ancien emploi et crédité sur le nouveau", async () => {
    const db = buildSeed();
    db.freePeriods = [];
    useData.setState(db);
    const target = useData.getState().subscriptions.find((s) => s.id !== SUB && !s.archivedAt)!;

    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 3000, monthCode: "M1" });
    const before = soldFor(useData.getState(), STU, SUB);
    expect(before).toBeGreaterThan(0);

    const res = await useData.getState().transferStudent({
      studentId: STU,
      fromSubscriptionId: SUB,
      toSubscriptionId: target.id,
      date: "2026-09-20",
    });

    expect(res.ok).toBe(true);
    expect(res.moved).toBe(before);
    // L'ancien emploi est vidé, le nouveau porte exactement la même somme.
    expect(soldFor(useData.getState(), STU, SUB)).toBe(0);
    expect(soldFor(useData.getState(), STU, target.id)).toBe(before);
  });

  it("il quitte la liste de l'ancien groupe et rejoint celle du nouveau", async () => {
    const db = buildSeed();
    db.freePeriods = [];
    useData.setState(db);
    const target = useData.getState().subscriptions.find((s) => s.id !== SUB && !s.archivedAt)!;

    await useData.getState().transferStudent({
      studentId: STU,
      fromSubscriptionId: SUB,
      toSubscriptionId: target.id,
    });

    const student = useData.getState().students.find((s) => s.id === STU)!;
    expect(student.subscriptionIds).not.toContain(SUB);
    expect(student.subscriptionIds).toContain(target.id);
    // Son passage sur l'ancien emploi reste daté sur sa fiche : rien n'est effacé.
    expect(student.subscriptionDates?.[SUB]?.unsubscribedAt).toBeTruthy();
  });

  it("aucun mouvement de caisse : l'argent change de case, il n'entre ni ne sort", async () => {
    const db = buildSeed();
    db.freePeriods = [];
    useData.setState(db);
    const target = useData.getState().subscriptions.find((s) => s.id !== SUB && !s.archivedAt)!;
    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 2000, monthCode: "M1" });

    const cashBefore = useData.getState().cash.length;
    await useData.getState().transferStudent({
      studentId: STU,
      fromSubscriptionId: SUB,
      toSubscriptionId: target.id,
    });

    expect(useData.getState().cash).toHaveLength(cashBefore);
    // Les deux lignes se font face dans son historique.
    const moves = useData
      .getState()
      .payments.filter((p) => p.studentId === STU && p.paidFrom === "transfer");
    expect(moves).toHaveLength(2);
    expect(moves.reduce((t, p) => t + p.amountPaid, 0)).toBe(0);
  });

  it("une dette ne suit pas : elle reste due là où elle a été creusée", async () => {
    const db = buildSeed();
    db.freePeriods = [];
    useData.setState(db);
    const target = useData.getState().subscriptions.find((s) => s.id !== SUB && !s.archivedAt)!;

    // Le solde de départ du fixture est remis à zéro : c'est une présence NON
    // COUVERTE qu'on veut, et elle doit creuser la dette.
    useData.setState({
      enrollments: useData
        .getState()
        .enrollments.map((e) =>
          e.studentId === STU && e.subscriptionId === SUB ? { ...e, balance: 0, paidSeances: e.consumedSeances } : e,
        ),
    });
    const session = useData.getState().sessions.find((s) => s.id === SES)!;
    const day = new Date();
    while (!session.days.includes(
      (["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const)[
        day.getDay()
      ],
    )) {
      day.setDate(day.getDate() - 1);
    }
    await useData.getState().setPresence({
      studentId: STU,
      sessionId: SES,
      date: day.toLocaleDateString("fr-CA"),
      status: "present",
    });
    const owed = soldFor(useData.getState(), STU, SUB);
    expect(owed).toBeLessThan(0);

    await useData.getState().transferStudent({
      studentId: STU,
      fromSubscriptionId: SUB,
      toSubscriptionId: target.id,
    });

    expect(soldFor(useData.getState(), STU, SUB)).toBe(owed);
    expect(soldFor(useData.getState(), STU, target.id)).toBe(0);
  });
});

describe("les totaux d'un emploi du temps", () => {
  it("comptent ses chevaliers, ce qui est rentré et ce qui reste dû", async () => {
    const db = buildSeed();
    db.freePeriods = [];
    useData.setState(db);

    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 1500, monthCode: "M1" });

    const totals = sessionTotals(useData.getState(), SES);
    expect(totals.students).toBe(studentsOfSession(useData.getState(), SES).length);
    expect(totals.gains).toBeGreaterThanOrEqual(1500);
    expect(totals.debts).toBeGreaterThanOrEqual(0);
  });
});
