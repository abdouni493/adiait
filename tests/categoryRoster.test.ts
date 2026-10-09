import { describe, it, expect } from "vitest";
import { buildSeed } from "@/tests/fixtures/seed";
import { categoryRoster } from "@/lib/categoryRoster";
import type { Database } from "@/lib/store/data";
import type { ScheduleSession, Student, Subscription } from "@/lib/types";

/**
 * L'écran « Catégories » range chaque chevalier dans le GROUPE de l'emploi du
 * temps qu'il suit — et ne laisse personne tomber entre deux cases : un emploi
 * sans groupe a sa propre case, un chevalier rangé dans la catégorie mais
 * inscrit nulle part attend dans « Sans emploi du temps ».
 */

function session(id: string, groupId: string, extra: Partial<ScheduleSession> = {}): ScheduleSession {
  return {
    id,
    classId: "cls-g3",
    moduleId: "",
    groupId,
    salleId: "",
    teacherId: "",
    days: ["friday"],
    startTime: "08:00",
    endTime: "10:00",
    groupIds: groupId ? [groupId] : [],
    ...extra,
  };
}

function sub(id: string, sessionId: string, extra: Partial<Subscription> = {}): Subscription {
  return { id, sessionId, pricePerSession: 625, monthlySeances: 8, monthlyPrice: 5000, ...extra };
}

function student(id: string, lastName: string, subIds: string[], extra: Partial<Student> = {}): Student {
  return {
    id,
    firstName: "Chevalier",
    lastName,
    birthDate: "",
    phone: "",
    email: "",
    rfid: `rfid-${id}`,
    isFree: false,
    subscriptionIds: subIds,
    enrollmentLevel: "cls-g3",
    ...extra,
  };
}

function board(): Database {
  const db = buildSeed();
  db.classes = [{ id: "cls-g3", name: "GALOP 3", description: "", ageFrom: 10, ageTo: 70 } as never];
  db.groups = [
    { id: "grp-new", name: "GALOP 3 جدد", classId: "cls-g3" },
    { id: "grp-exam", name: "GALOP 3 تحضير الامتحان", classId: "cls-g3" },
    { id: "grp-empty", name: "Groupe vide", classId: "cls-g3" },
  ];
  db.sessions = [
    session("ses-am", "grp-new"),
    session("ses-pm", "grp-exam"),
    session("ses-adults", "grp-exam", { days: ["tuesday"] }),
    session("ses-solo", ""),
    session("ses-old", "grp-new", { archivedAt: "2026-09-01" }),
  ];
  db.subscriptions = [
    sub("sub-am", "ses-am"),
    sub("sub-pm", "ses-pm"),
    sub("sub-adults", "ses-adults"),
    sub("sub-solo", "ses-solo"),
    sub("sub-old", "ses-old", { archivedAt: "2026-09-01" }),
  ];
  db.students = [
    student("s1", "Amrani", ["sub-am"]),
    student("s2", "Belkacem", ["sub-am"]),
    student("s3", "Cherif", ["sub-pm"]),
    student("s4", "Djebbar", ["sub-adults"]),
    student("s5", "Essaid", ["sub-solo"]),
    student("s6", "Ferhat", []),
    student("s7", "Ghoul", ["sub-old"]),
    // Rangé en GALOP 3, mais il s'entraîne ailleurs : il n'attend rien ici.
    student("s8", "Hamdi", ["sub-elsewhere"]),
  ];
  db.subscriptions.push(sub("sub-elsewhere", "ses-other-category"));
  db.enrollments = [
    { id: "e1", studentId: "s1", subscriptionId: "sub-am", paidSeances: 0, consumedSeances: 0, balance: 40000, createdAt: "" },
    { id: "e2", studentId: "s2", subscriptionId: "sub-am", paidSeances: 0, consumedSeances: 0, balance: -1250, createdAt: "" },
  ];
  db.attendance = [];
  db.payments = [];
  return db;
}

describe("une catégorie, groupe par groupe", () => {
  it("range chaque chevalier dans le groupe de son emploi du temps", () => {
    const roster = categoryRoster(board(), "cls-g3")!;
    const byName = Object.fromEntries(roster.buckets.map((b) => [b.name, b]));

    expect(byName["GALOP 3 جدد"].students.map((s) => s.student.id)).toEqual(["s1", "s2"]);
    // Deux emplois du temps, un seul groupe : leurs inscrits se rejoignent.
    expect(byName["GALOP 3 تحضير الامتحان"].students.map((s) => s.student.id)).toEqual(["s3", "s4"]);
    expect(byName["GALOP 3 تحضير الامتحان"].sessions.map((s) => s.id)).toEqual(["ses-pm", "ses-adults"]);
    // Le groupe vide existe, sans personne.
    expect(byName["Groupe vide"].students).toEqual([]);
  });

  it("n'oublie ni l'emploi sans groupe, ni le chevalier inscrit nulle part", () => {
    const roster = categoryRoster(board(), "cls-g3")!;
    const nogroup = roster.buckets.find((b) => b.kind === "nogroup")!;
    expect(nogroup.students.map((s) => s.student.id)).toEqual(["s5"]);
    const pending = roster.buckets.find((b) => b.kind === "pending")!;
    // s7 n'est inscrit que sur un emploi ARCHIVÉ : il attend un créneau, lui aussi.
    expect(pending.students.map((s) => s.student.id).sort()).toEqual(["s6", "s7"]);
  });

  it("compte chaque chevalier une fois et additionne les dettes", () => {
    const roster = categoryRoster(board(), "cls-g3")!;
    expect(roster.total).toBe(7);
    expect(roster.sessions).toHaveLength(4);
    expect(roster.activeGroups).toBe(2);
    expect(roster.debtors).toBe(1);
    expect(roster.debt).toBe(1250);
    const g = roster.buckets.find((b) => b.name === "GALOP 3 جدد")!;
    expect(g.debtors).toBe(1);
    expect(g.debt).toBe(1250);
    expect(g.students.find((s) => s.student.id === "s1")?.sold).toBe(40000);
  });
});
