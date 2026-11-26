import { describe, it, expect } from "vitest";
import {
  caseReductionCut,
  schoolPerSeanceOf,
  teacherSeanceShareOf,
  studentListPrice,
  studentSchoolPerSeance,
  studentTeacherPerSeance,
  studentMonthPrice,
} from "@/lib/helpers";
import type { Student, Subscription } from "@/lib/types";

/**
 * RÉDUCTION PAR CARTE — la famille paie un total de carte fixé à la main, et
 * club + entraîneur se partagent ce total AU PRORATA de leur part normale.
 *
 * L'emploi : carte de 4 séances à 2000 DA, dont 800 pour le club et 1200 pour
 * l'entraîneur (pas de transport). Total partageable = 2000.
 */
const SUB: Subscription = {
  id: "sub-x",
  sessionId: "ses-x",
  pricePerSession: 500,
  monthlySeances: 4,
  monthlyPrice: 2000,
  schoolMonthShare: 800,
  teacherPerSeance: 300, // (2000 - 800) / 4
} as Subscription;

function student(total: number): Student {
  return {
    id: "stu-x",
    studentCase: "reduction",
    caseReduction: { type: "amount", schoolValue: 0, teacherValue: 0, mode: "carte", carteTotals: { "sub-x": total } },
    subscriptionIds: ["sub-x"],
  } as unknown as Student;
}

describe("réduction par carte", () => {
  it("partage le nouveau total entre club et entraîneur au prorata", () => {
    const stu = student(1000); // moitié du tarif plein (2000)
    // Prix d'une séance pour la famille : 1000 / 4 = 250.
    expect(studentListPrice(stu, SUB)).toBe(250);
    // Club : 1000 × 800/2000 = 400 -> 100 / séance.
    expect(studentSchoolPerSeance(stu, SUB)).toBe(100);
    // Entraîneur : 1000 × 1200/2000 = 600 -> 150 / séance.
    expect(studentTeacherPerSeance(stu, SUB)).toBe(150);
    // Les deux parts se recomposent exactement au prix payé.
    expect(studentSchoolPerSeance(stu, SUB) + studentTeacherPerSeance(stu, SUB)).toBe(
      studentListPrice(stu, SUB),
    );
    // Le mois (la carte) coûte bien le total saisi.
    expect(studentMonthPrice(stu, SUB)).toBe(1000);
  });

  it("le cut de chaque côté est ce qu'il abandonne par séance", () => {
    const stu = student(1000);
    // Club plein = 200/séance, réduit à 100 -> cut de 100.
    expect(caseReductionCut(stu, "school", schoolPerSeanceOf(SUB), SUB)).toBe(100);
    // Entraîneur plein = 300/séance, réduit à 150 -> cut de 150.
    expect(caseReductionCut(stu, "teacher", teacherSeanceShareOf(SUB), SUB)).toBe(150);
  });

  it("un total au tarif plein ne réduit rien", () => {
    const stu = student(2000);
    expect(studentListPrice(stu, SUB)).toBe(500);
    expect(studentSchoolPerSeance(stu, SUB)).toBe(200);
    expect(studentTeacherPerSeance(stu, SUB)).toBe(300);
  });

  it("un total au-dessus du tarif plein est plafonné (jamais de surcoût)", () => {
    const stu = student(5000);
    expect(studentListPrice(stu, SUB)).toBe(500);
  });
});
