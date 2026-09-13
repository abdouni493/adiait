import { describe, it, expect, beforeEach } from "vitest";
import { useData } from "@/lib/store/data";
import { buildSeed } from "@/tests/fixtures/seed";
import { carteLayout, cartesOf, sessionSeances } from "@/lib/cartes";
import { periodCategories, periodTotals, sessionTotals, studentsOfSessionIn } from "@/lib/periods";
import {
  cycleOf,
  cycleSlots,
  groupSeanceShareFor,
  groupSeanceTrainers,
  monthOrder,
  schoolMonthByCode,
  soldFor,
  teacherGroupSeances,
} from "@/lib/helpers";

/**
 * LE MOTEUR DES CARTES, mené par les mêmes clics que la feuille de présence.
 *
 * Une carte ne dépend de RIEN : ni d'une saison, ni d'un calendrier, ni d'une
 * date décidée d'avance. Elle naît avec le tarif du créneau, commence à sa
 * première présence, se ferme sur la séance qui complète le pack, et la
 * suivante s'ouvre derrière elle — toute seule.
 */

const SES = "ses-1";
const SUB = "sub-1";
const STU = "stu-1";

/** Un magasin propre : un emploi du temps, des cartes de `size` séances. */
function board(size = 4) {
  const db = buildSeed();
  const sub = db.subscriptions.find((s) => s.id === SUB)!;
  sub.monthlySeances = size;
  sub.monthlyPrice = size * sub.pricePerSession;
  db.attendance = [];
  db.payments = [];
  db.freePeriods = [];
  db.enrollments = db.enrollments.filter((e) => e.subscriptionId !== SUB);
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

describe("les cartes naissent toutes seules, sans rien demander à personne", () => {
  it("un créneau TARIFÉ reçoit sa carte 1 au premier passage du moteur", async () => {
    board();
    expect(cartesOf(useData.getState(), SES)).toHaveLength(0);

    await useData.getState().syncCartes();

    const [carte] = cartesOf(useData.getState(), SES);
    expect(carte.index).toBe(1);
    expect(carte.code).toBe("M1");
    expect(carte.status).toBe("planned");
    expect(carte.startDate).toBeUndefined();
  });

  it("un créneau SANS tarif n'en reçoit aucune", async () => {
    const db = buildSeed();
    db.emploiCartes = [];
    // Le tarif s'en va : plus rien à vendre, donc plus de carte à ouvrir.
    db.subscriptions = db.subscriptions.filter((s) => s.sessionId !== SES);
    useData.setState(db);

    await useData.getState().syncCartes();
    expect(cartesOf(useData.getState(), SES)).toHaveLength(0);
  });

  it("le moteur est idempotent : le relancer ne crée pas de doublon", async () => {
    board();
    await useData.getState().syncCartes();
    await useData.getState().syncCartes();
    await useData.getState().syncCartes();
    expect(cartesOf(useData.getState(), SES)).toHaveLength(1);
  });
});

describe("une carte commence à sa première présence, pas à la date annoncée", () => {
  it("la date de départ se décale au jour du premier pointage", async () => {
    board();
    await useData.getState().syncCartes();
    await useData.getState().setFirstCarteStart(SES, "2026-09-20");

    // Prévue le 20, pointée pour la première fois le 27 : elle commence le 27.
    await mark("2026-09-27");

    const [carte] = cartesOf(useData.getState(), SES);
    expect(carte.startDate).toBe("2026-09-27");
    expect(carte.plannedStartDate).toBe("2026-09-20");
    expect(carte.status).toBe("running");
    expect(carte.held).toBe(1);
  });

  it("une carte déjà commencée ne se laisse plus redater", async () => {
    board();
    await useData.getState().syncCartes();
    await mark("2026-09-20");

    await useData.getState().setFirstCarteStart(SES, "2026-10-01");

    const [carte] = cartesOf(useData.getState(), SES);
    expect(carte.startDate).toBe("2026-09-20");
  });
});

describe("la carte suivante n'existe qu'une fois la précédente close", () => {
  it("aucune carte 2 tant que la carte 1 n'a pas donné ses 4 séances", async () => {
    board(4);
    await useData.getState().syncCartes();

    for (const day of ["2026-09-20", "2026-09-27", "2026-10-04"]) await mark(day);
    expect(cartesOf(useData.getState(), SES)).toHaveLength(1);
    expect(carteLayout(useData.getState(), SES)[0].held).toBe(3);

    // La 4e séance ferme la carte 1 — et ouvre la carte 2.
    await mark("2026-10-11");

    const cartes = cartesOf(useData.getState(), SES);
    expect(cartes).toHaveLength(2);
    expect(cartes[0].status).toBe("complete");
    expect(cartes[0].endDate).toBe("2026-10-11");
    expect(cartes[1].index).toBe(2);
    expect(cartes[1].code).toBe("M2");
  });

  it("les cartes s'enchaînent sans fin — rien ne les arrête", async () => {
    board(2);
    await useData.getState().syncCartes();
    for (const day of [
      "2026-09-05",
      "2026-09-12",
      "2026-09-19",
      "2026-09-26",
      "2026-10-03",
      "2026-10-10",
    ]) {
      await mark(day);
    }
    // 6 séances, 2 par carte : trois cartes closes, et la quatrième ouverte.
    const cartes = cartesOf(useData.getState(), SES);
    expect(cartes.map((c) => c.code)).toEqual(["M1", "M2", "M3", "M4"]);
    expect(cartes.filter((c) => c.status === "complete")).toHaveLength(3);
  });
});

describe("une séance annulée pour tout le groupe ne compte pas", () => {
  it("elle n'avance pas la carte et se lit comme décalée", async () => {
    board(4);
    await useData.getState().syncCartes();

    await mark("2026-09-20");
    await mark("2026-09-27", "cancelled"); // annulée pour tout le monde
    await mark("2026-10-04");

    const [view] = carteLayout(useData.getState(), SES);
    expect(view.held).toBe(2); // la séance annulée n'a pas eu lieu
    expect(view.postponed).toContain("2026-09-27");

    const seances = sessionSeances(useData.getState(), SES);
    expect(seances.find((s) => s.date === "2026-09-27")?.cancelled).toBe(true);
  });
});

/**
 * LE BOGUE QUI FAISAIT LIRE LA MÊME CARTE PARTOUT.
 *
 * « M2 » est ce que la base ÉCRIT ; « C2 » est ce que l'écran AFFICHE. Des
 * composants passaient la seconde forme là où la première était attendue : le
 * code n'était pas reconnu, `monthOrder` rendait -1, tout le monde retombait
 * sur la carte 1 — et la feuille de présence montrait les mêmes séances quelle
 * que soit la carte choisie.
 */
describe("chaque carte a ses propres présences", () => {
  it("les deux formes du code désignent la même carte", () => {
    expect(schoolMonthByCode("M2")?.index).toBe(1);
    expect(schoolMonthByCode("C2")?.index).toBe(1);
    expect(monthOrder("C3")).toBe(2);
    // Un code qui ne veut rien dire reste inconnu — il ne retombe pas sur M1.
    expect(schoolMonthByCode("septembre")).toBeNull();
    expect(monthOrder("septembre")).toBe(-1);
  });

  it("la carte 1 et la carte 2 ne montrent pas les mêmes séances", async () => {
    board(2);
    await useData.getState().syncCartes();
    const days = ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"];
    for (const day of days) await mark(day);

    const db = useData.getState();
    const m1 = cycleSlots(db, STU, SUB, "M1").map((r) => r.timestamp.slice(0, 10));
    const m2 = cycleSlots(db, STU, SUB, "M2").map((r) => r.timestamp.slice(0, 10));

    expect(m1).toHaveLength(2);
    expect(m2).toHaveLength(2);
    // Aucune séance ne se retrouve dans les deux cartes.
    expect(m1.some((d) => m2.includes(d))).toBe(false);
    expect(cycleOf(db, STU, SUB, "M1").done).toBe(2);
    expect(cycleOf(db, STU, SUB, "M2").done).toBe(2);
  });

  it("la forme courte lit la MÊME carte que la forme stockée", async () => {
    board(2);
    await useData.getState().syncCartes();
    for (const day of ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"]) {
      await mark(day);
    }

    const db = useData.getState();
    const stored = cycleSlots(db, STU, SUB, "M2").map((r) => r.id);
    const short = cycleSlots(db, STU, SUB, "C2").map((r) => r.id);
    expect(short).toEqual(stored);
    // Et surtout : ce n'est PAS la carte 1.
    expect(stored).not.toEqual(cycleSlots(db, STU, SUB, "M1").map((r) => r.id));
  });
});

describe("le pointage n'est jamais bloqué", () => {
  it("aucune saison ne ferme la feuille de présence", async () => {
    board();
    const res = await useData
      .getState()
      .setPresence({ studentId: STU, sessionId: SES, date: "2027-06-01", status: "present" });
    expect(res.ok).toBe(true);
  });
});

describe("le rapport d'une période", () => {
  it("ne compte en GAINS que ce qui est entré dans la fenêtre", async () => {
    board();
    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 2000, monthCode: "M1", date: "2026-09-20" });
    await useData
      .getState()
      .addSold({ studentId: STU, subscriptionId: SUB, amount: 3000, monthCode: "M1", date: "2026-12-20" });

    const db = useData.getState();
    const autumn = sessionTotals(db, SES, { from: "2026-09-01", to: "2026-10-31" });
    const winter = sessionTotals(db, SES, { from: "2026-12-01", to: "2026-12-31" });
    const whole = sessionTotals(db, SES, { from: "2026-09-01", to: "2026-12-31" });

    expect(autumn.gains).toBe(2000);
    expect(winter.gains).toBe(3000);
    expect(whole.gains).toBe(5000);
  });

  it("ne retient que les chevaliers que la période a concernés", async () => {
    board();
    await useData.getState().syncCartes();
    await mark("2026-09-20");

    const db = useData.getState();
    expect(studentsOfSessionIn(db, SES, { from: "2026-09-01", to: "2026-09-30" }).map((s) => s.id))
      .toContain(STU);
    // Une fenêtre passée où il ne s'est rien joué ne concerne personne.
    expect(studentsOfSessionIn(db, SES, { from: "2020-01-01", to: "2020-12-31" })).toHaveLength(0);
  });

  it("range les emplois du temps sous leurs catégories", async () => {
    board();
    const db = useData.getState();
    const cats = periodCategories(db, { from: "2026-01-01", to: "2026-12-31" });
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.every((c) => c.sessions.length > 0)).toBe(true);
    // Le total de la période retrouve les mêmes chiffres que la somme des siens.
    const totals = periodTotals(db, { from: "2026-01-01", to: "2026-12-31" });
    expect(totals.gains).toBe(cats.reduce((s, c) => s + c.totals.gains, 0));
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
    expect(soldFor(useData.getState(), STU, SUB)).toBe(0);
    expect(soldFor(useData.getState(), STU, target.id)).toBe(before);
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
    const moves = useData
      .getState()
      .payments.filter((p) => p.studentId === STU && p.paidFrom === "transfer");
    expect(moves).toHaveLength(2);
    expect(moves.reduce((t, p) => t + p.amountPaid, 0)).toBe(0);
  });
});

describe("les modèles de période ne commandent rien", () => {
  it("s'enregistrent, se modifient, et leur suppression n'efface aucune donnée", async () => {
    board();
    await useData.getState().syncCartes();
    await mark("2026-09-20");

    const created = await useData.getState().savePeriodTemplate({
      name: "Semestre 1",
      startDate: "2026-09-15",
      endDate: "2027-01-15",
    });
    expect(created.ok).toBe(true);
    expect(useData.getState().periodTemplates).toHaveLength(1);

    await useData.getState().savePeriodTemplate({
      id: created.id,
      name: "Semestre 1 (corrigé)",
      startDate: "2026-09-15",
      endDate: "2027-01-31",
    });
    expect(useData.getState().periodTemplates).toHaveLength(1);
    expect(useData.getState().periodTemplates[0].name).toBe("Semestre 1 (corrigé)");

    const cartesBefore = cartesOf(useData.getState(), SES).length;
    const attendanceBefore = useData.getState().attendance.length;
    await useData.getState().deletePeriodTemplate(created.id!);

    expect(useData.getState().periodTemplates).toHaveLength(0);
    expect(cartesOf(useData.getState(), SES)).toHaveLength(cartesBefore);
    expect(useData.getState().attendance).toHaveLength(attendanceBefore);
  });

  it("une date de fin antérieure au début est refusée", async () => {
    const res = await useData.getState().savePeriodTemplate({
      name: "À l'envers",
      startDate: "2026-10-01",
      endDate: "2026-09-01",
    });
    expect(res.ok).toBe(false);
    expect(res.messageKey).toBe("period.datesReversed");
  });
});

describe("le programme de groupe et ses encadrants", () => {
  it("la part entraîneur se partage à parts égales entre ceux qui sont partis", async () => {
    const db = buildSeed();
    useData.setState(db);
    const [a, b] = useData.getState().teachers;

    const res = await useData.getState().saveGroupSeance({
      id: "gsl-test",
      teacherId: a.id,
      teacherIds: [a.id, b.id],
      title: "Randonnée de printemps",
      date: "2026-09-20",
      startTime: "08:00",
      endTime: "16:00",
      studentsCount: 10,
      pricePerStudent: 1000,
      schoolPerStudent: 400,
    });
    expect(res.ok).toBe(true);

    const saved = useData.getState().groupSeances.find((g) => g.id === "gsl-test")!;
    // 10 × (1000 − 400) = 6000 pour les encadrants, soit 3000 chacun.
    expect(groupSeanceShareFor(saved, a.id)).toBe(3000);
    expect(groupSeanceShareFor(saved, b.id)).toBe(3000);
    // Et le programme apparaît bien sur la fiche des DEUX.
    expect(teacherGroupSeances(useData.getState(), a.id).map((g) => g.id)).toContain("gsl-test");
    expect(teacherGroupSeances(useData.getState(), b.id).map((g) => g.id)).toContain("gsl-test");
    // Le club ne verse pas deux fois : une seule sortie de caisse, du total.
    const out = useData
      .getState()
      .cash.filter((c) => c.id === saved.cashOutId)
      .reduce((t, c) => t + c.amount, 0);
    expect(out).toBe(-6000);
  });

  it("un programme d'avant la nouveauté n'a qu'un encadrant, et touche tout", () => {
    const db = buildSeed();
    useData.setState(db);
    const [a] = useData.getState().teachers;
    const legacy = {
      id: "gsl-old",
      teacherId: a.id,
      title: "Ancienne sortie",
      date: "2026-01-10",
      startTime: "08:00",
      endTime: "10:00",
      studentsCount: 4,
      pricePerStudent: 500,
      schoolPerStudent: 200,
      createdAt: "2026-01-10T08:00:00.000Z",
    };
    expect(groupSeanceTrainers(legacy)).toEqual([a.id]);
    expect(groupSeanceShareFor(legacy, a.id)).toBe(1200);
  });

  it("effacer une catégorie ne supprime pas les programmes qui la portaient", async () => {
    const db = buildSeed();
    useData.setState(db);
    const [a] = useData.getState().teachers;

    const cat = await useData.getState().saveProgramCategory({ name: "Randonnée" });
    await useData.getState().saveGroupSeance({
      id: "gsl-cat",
      teacherId: a.id,
      teacherIds: [a.id],
      categoryId: cat.id,
      title: "Sortie",
      date: "2026-09-20",
      startTime: "08:00",
      endTime: "10:00",
      studentsCount: 2,
      pricePerStudent: 500,
      schoolPerStudent: 200,
    });

    await useData.getState().deleteProgramCategory(cat.id!);

    const saved = useData.getState().groupSeances.find((g) => g.id === "gsl-cat");
    expect(saved).toBeTruthy();
    expect(saved!.categoryId).toBeUndefined();
    expect(useData.getState().programCategories).toHaveLength(0);
  });

  it("deux catégories du même nom n'en font qu'une", async () => {
    useData.setState(buildSeed());
    const first = await useData.getState().saveProgramCategory({ name: "Stage" });
    const twin = await useData.getState().saveProgramCategory({ name: "  stage  " });
    expect(twin.id).toBe(first.id);
    expect(useData.getState().programCategories).toHaveLength(1);
  });
});
