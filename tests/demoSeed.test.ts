/**
 * LE JEU DE DÉMONSTRATION SE TIENT-IL DEBOUT ?
 *
 * L'application n'a plus de base : ce que ces vérifications protègent, c'est la
 * seule source de données qui lui reste. Elles ne comparent pas des chiffres
 * gravés dans le marbre — elles vérifient les INVARIANTS : chaque relation
 * pointe sur quelque chose qui existe, l'argent tombe juste des deux côtés, et
 * rien n'est retenu deux fois sur une paie.
 */
import { describe, expect, it } from "vitest";
import { buildDemoDatabase } from "@/lib/demo/seed";
import { COLLECTION_ORDER } from "@/lib/demo/collections";
import { cycleSizeOf, isFreeSub, studentSeancePrice } from "@/lib/helpers";
import { money } from "@/lib/utils";

const db = buildDemoDatabase();

describe("le jeu de démonstration", () => {
  it("remplit toutes les collections du magasin", () => {
    for (const key of COLLECTION_ORDER) {
      const list = (db as unknown as Record<string, unknown[]>)[key];
      expect(Array.isArray(list), key).toBe(true);
    }
    // Les collections qui portent la démonstration ne peuvent pas être vides.
    for (const key of [
      "students", "teachers", "reception", "sessions", "subscriptions",
      "enrollments", "payments", "attendance", "cash", "expenses",
      "teacherPayments", "workerPayments", "workerShifts", "independent",
      "groupSeances", "parents", "announcements", "notifications",
    ]) {
      expect((db as unknown as Record<string, unknown[]>)[key].length, key).toBeGreaterThan(0);
    }
  });

  it("donne du volume : une vraie club, pas trois fiches", () => {
    expect(db.students.length).toBeGreaterThanOrEqual(60);
    expect(db.attendance.length).toBeGreaterThan(500);
  });

  it("ne laisse aucune relation dans le vide", () => {
    const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
    const students = ids(db.students);
    const subs = ids(db.subscriptions);
    const sessions = ids(db.sessions);
    const teachers = ids(db.teachers);
    const workers = ids(db.reception);

    for (const s of db.subscriptions) expect(sessions.has(s.sessionId)).toBe(true);
    for (const s of db.sessions) expect(teachers.has(s.teacherId)).toBe(true);
    for (const e of db.enrollments) {
      expect(students.has(e.studentId)).toBe(true);
      expect(subs.has(e.subscriptionId)).toBe(true);
    }
    for (const a of db.attendance) {
      expect(students.has(a.studentId)).toBe(true);
      expect(sessions.has(a.sessionId)).toBe(true);
    }
    for (const p of db.payments) expect(students.has(p.studentId)).toBe(true);
    for (const u of db.unpaidTeacher) {
      expect(teachers.has(u.teacherId)).toBe(true);
      expect(students.has(u.studentId)).toBe(true);
    }
    for (const w of db.workerShifts) expect(workers.has(w.workerId)).toBe(true);
    for (const w of db.workerPayments) expect(workers.has(w.workerId)).toBe(true);
    for (const t of db.teacherPayments) expect(teachers.has(t.teacherId)).toBe(true);
    for (const c of db.studentCharges) expect(students.has(c.studentId)).toBe(true);
    for (const d of db.teacherChildDebts) {
      expect(teachers.has(d.teacherId)).toBe(true);
      expect(students.has(d.studentId)).toBe(true);
    }
  });

  it("fait tomber juste le solde de chaque inscription", () => {
    const subById = new Map(db.subscriptions.map((s) => [s.id, s]));
    for (const e of db.enrollments) {
      const sub = subById.get(e.subscriptionId)!;
      const credited = db.payments
        .filter((p) => p.studentId === e.studentId && p.subscriptionId === e.subscriptionId)
        .reduce((t, p) => t + p.amountPaid, 0);
      const consumed = db.attendance
        .filter(
          (a) =>
            a.studentId === e.studentId &&
            a.sessionId === sub.sessionId &&
            a.status !== "cancelled" &&
            !a.noCharge,
        )
        .reduce((t, a) => t + a.amountDeducted, 0);
      expect(e.balance).toBe(money(credited - consumed));
    }
  });

  it("facture chaque séance au tarif du cas du chevalier", () => {
    const studentById = new Map(db.students.map((s) => [s.id, s]));
    const subBySession = new Map(db.subscriptions.map((s) => [s.sessionId, s]));

    for (const a of db.attendance) {
      if (a.noCharge || a.status === "cancelled") {
        expect(a.amountDeducted).toBe(0);
        continue;
      }
      const student = studentById.get(a.studentId)!;
      const sub = subBySession.get(a.sessionId)!;
      const expected = isFreeSub(student, sub.id) ? 0 : studentSeancePrice(student, sub);
      expect(a.amountDeducted).toBe(expected);
    }
  });

  it("n'accorde jamais de part sur un chevalier gratuit", () => {
    const studentById = new Map(db.students.map((s) => [s.id, s]));
    const subBySession = new Map(db.subscriptions.map((s) => [s.sessionId, s]));

    for (const u of db.unpaidTeacher) {
      expect(u.amount).toBeGreaterThan(0);
      const student = studentById.get(u.studentId)!;
      const sub = subBySession.get(u.sessionId);
      if (sub) expect(isFreeSub(student, sub.id)).toBe(false);
    }
  });

  it("ne retient jamais deux fois la même ligne sur une paie", () => {
    const seen = new Set<string>();
    for (const p of db.teacherPayments) {
      for (const d of [...(p.acomptes ?? []), ...(p.expenses ?? []), ...(p.childDebts ?? [])]) {
        expect(seen.has(d.id)).toBe(false);
        seen.add(d.id);
      }
    }
    // Ce qui a été réglé porte la marque de son règlement.
    for (const a of db.acomptes) expect(a.paid ? !!a.paymentId : true).toBe(true);
    for (const e of db.teacherExpenses) expect(e.paid ? !!e.paymentId : true).toBe(true);
    for (const w of db.workerAcomptes) expect(w.paid ? !!w.paymentId : true).toBe(true);

    // Une période de travail ne se règle qu'une fois.
    const periods = new Set<string>();
    for (const p of db.workerPayments) {
      for (const key of p.periodKeys) {
        const composite = `${p.workerId}:${key}`;
        expect(periods.has(composite)).toBe(false);
        periods.add(composite);
      }
    }
  });

  it("laisse à chaque écran de paie quelque chose à régler", () => {
    expect(db.unpaidTeacher.some((u) => !u.paid)).toBe(true);
    expect(db.acomptes.some((a) => !a.paid)).toBe(true);
    expect(db.workerAcomptes.some((a) => !a.paid)).toBe(true);
    expect(db.workerShifts.some((s) => !s.paid && !s.frozen)).toBe(true);
  });

  it("couvre tous les cas de facturation des chevaliers", () => {
    const cases = new Set(db.students.map((s) => s.studentCase ?? "normal"));
    for (const c of ["normal", "special", "teacher_child", "reduction", "school_only"]) {
      expect(cases.has(c), c).toBe(true);
    }
    // Les deux formes de chaque cas : globale, et emploi par emploi.
    expect(db.students.some((s) => s.freeSubscriptionIds?.length)).toBe(true);
    expect(db.students.some((s) => s.schoolOnlySubscriptionIds?.length)).toBe(true);
    expect(db.students.some((s) => s.caseReduction?.type === "percent")).toBe(true);
    expect(db.students.some((s) => s.caseReduction?.type === "amount")).toBe(true);
    // Et les situations d'argent que la réception doit savoir lire.
    expect(db.payments.some((p) => p.rest > 0)).toBe(true);
    expect(db.payments.some((p) => p.paidFrom === "teacher_salary")).toBe(true);
    expect(db.payments.some((p) => p.paidFrom === "teacher_debt")).toBe(true);
    expect(db.payments.some((p) => p.paidFrom === "school_cash")).toBe(true);
    expect(db.enrollments.some((e) => (e.balance ?? 0) < 0)).toBe(true);
    expect(db.enrollments.some((e) => (e.balance ?? 0) > 0)).toBe(true);
    expect(db.students.some((s) => (s.registrationDue ?? 0) > 0)).toBe(true);
    expect(db.studentCharges.some((c) => c.origin === "school_advance")).toBe(true);
    expect(db.studentCharges.some((c) => (c.paidAmount ?? 0) > 0)).toBe(true);
  });

  it("couvre les trois paies d'entraîneur et les quatre contrats de travailleur", () => {
    const modes = new Set(db.teachers.map((t) => t.paymentType));
    expect(modes).toEqual(new Set(["percentage", "monthly", "per_group"]));
    expect(db.teachers.some((t) => t.isPassager)).toBe(true);

    const contracts = new Set(db.reception.map((w) => w.paymentType));
    expect(contracts).toEqual(new Set(["monthly", "daily", "half_day", "hourly"]));

    const methods = new Set(db.teacherPayments.map((p) => p.method));
    expect(methods.has("fixed")).toBe(true);
    expect(methods.has("percent")).toBe(true);
    expect(methods.has("group")).toBe(true);
  });

  it("garde la caisse en phase avec les opérations qu'elle recopie", () => {
    const cashed = db.cash
      .filter((c) => c.type === "student_payment")
      .reduce((t, c) => t + c.amount, 0);
    const fromFamilies = db.payments
      .filter((p) => p.paidFrom !== "teacher_salary" && p.paidFrom !== "teacher_debt")
      .reduce((t, p) => t + p.amountPaid, 0);
    const fromSeances =
      db.independent.reduce((t, i) => t + i.price, 0) +
      db.groupSeances.reduce((t, g) => t + g.studentsCount * g.pricePerStudent, 0);
    expect(money(cashed)).toBe(money(fromFamilies + fromSeances));

    // Aucun mouvement en double, et aucune sortie comptée comme une entrée.
    const ids = db.cash.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of db.cash) {
      if (c.type === "expense" || c.type === "withdraw" || c.type === "teacher_payment") {
        expect(c.amount).toBeLessThanOrEqual(0);
      }
    }
  });

  it("rend un objet neuf à chaque appel, et toujours la même club", () => {
    const other = buildDemoDatabase();
    expect(other.students).not.toBe(db.students);
    expect(other.students.length).toBe(db.students.length);
    expect(other.attendance.length).toBe(db.attendance.length);
    expect(other.attendance[0].amountDeducted).toBe(db.attendance[0].amountDeducted);
  });

  it("donne une taille de carte à chaque abonnement", () => {
    for (const sub of db.subscriptions) {
      expect(cycleSizeOf(sub)).toBeGreaterThan(0);
    }
  });
});
