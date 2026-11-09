import { describe, it, expect, beforeEach } from "vitest";
import { useData } from "@/lib/store/data";
import { buildSeed } from "@/tests/fixtures/seed";
import { carteCodeForDate, carteLayout } from "@/lib/cartes";

/**
 * LA FEUILLE S'OUVRE SUR LA CARTE QUI PORTE LES SÉANCES.
 *
 * Quand une carte vient de se clore et que la suivante, planifiée, n'a pas
 * encore tenu une séance, la feuille doit rester sur la carte pleine — sinon
 * les présences déjà pointées disparaissent derrière une carte vide.
 */

const SES = "ses-1";
const SUB = "sub-1";
const STU = "stu-1";

/** Un emploi du temps qui ne tient QUE le vendredi, cartes de 4 séances. */
function board() {
  const db = buildSeed();
  const sub = db.subscriptions.find((s) => s.id === SUB)!;
  sub.monthlySeances = 4;
  sub.monthlyPrice = 4 * sub.pricePerSession;
  const ses = db.sessions.find((s) => s.id === SES)!;
  ses.days = ["friday"];
  ses.daySlots = undefined;
  db.attendance = [];
  db.payments = [];
  db.freePeriods = [];
  db.enrollments = db.enrollments.filter((e) => e.subscriptionId !== SUB);
  db.emploiCartes = [];
  const student = db.students.find((st) => st.id === STU)!;
  student.subscriptionDates = {
    ...student.subscriptionDates,
    [SUB]: { subscribedAt: "2026-08-01", startDate: "2026-08-01" },
  };
  useData.setState(db);
}

/** Les quatre vendredis de septembre 2026 (04, 11, 18, 25) — une carte pleine. */
const FRIDAYS = ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"];

async function mark(date: string) {
  await useData.getState().setPresence({ studentId: STU, sessionId: SES, date, status: "present" });
  await useData.getState().syncCartes();
}

beforeEach(() => {
  useData.setState(buildSeed());
});

describe("carteCodeForDate", () => {
  it("garde la carte pleine tant que la suivante n'a pas tenu de séance", async () => {
    board();
    await useData.getState().syncCartes();
    for (const d of FRIDAYS) await mark(d);

    // Carte 1 close (4 séances), carte 2 planifiée et VIDE.
    const views = carteLayout(useData.getState(), SES);
    expect(views[0].complete).toBe(true);
    expect(views[0].held).toBe(4);
    expect(views.length).toBeGreaterThanOrEqual(2);
    expect(views[1].held).toBe(0);

    const s = useData.getState();
    // Une date DANS la carte 1 -> M1.
    expect(carteCodeForDate(s, SES, "2026-09-11")).toBe("M1");
    // Un jour SANS séance après la clôture (un lundi) -> toujours M1, pas la
    // carte 2 vide : les présences restent visibles.
    expect(carteCodeForDate(s, SES, "2026-10-05")).toBe("M1");
    // Un vendredi À VENIR -> la carte 2, prête à recevoir le nouveau pointage.
    expect(carteCodeForDate(s, SES, "2026-10-09")).toBe("M2");
  });

  it("sans aucune carte tenue, retombe sur la première", async () => {
    board();
    await useData.getState().syncCartes();
    expect(carteCodeForDate(useData.getState(), SES, "2026-10-05")).toBe("M1");
  });
});
