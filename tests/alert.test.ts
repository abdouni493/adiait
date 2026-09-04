import { describe, it, expect } from "vitest";
import {
  balanceAlertTemplate,
  buildBalanceAlert,
  recipientsFor,
  unreachableReason,
} from "@/lib/whatsapp/alert";

const school = { name: "ALTECH SCHOOL", phone: "+213 21 00 00 00" };

describe("balanceAlertTemplate — choix du modèle selon la situation", () => {
  it("dette en cours → dette", () => {
    expect(balanceAlertTemplate({ remainingSeances: 4, debt: 500 })).toBe("debt");
  });

  it("plus aucune séance → séances épuisées", () => {
    expect(balanceAlertTemplate({ remainingSeances: 0, debt: 0 })).toBe("balance_empty");
  });

  it("réserve basse signalée par l'appelant → séances bientôt épuisées", () => {
    expect(balanceAlertTemplate({ remainingSeances: 2, debt: 0 }, { low: true })).toBe(
      "balance_low",
    );
  });

  it("frais d'inscription dus (sans réserve basse) → inscription", () => {
    expect(balanceAlertTemplate({ remainingSeances: 8, debt: 0, registrationDue: 2000 })).toBe(
      "registration",
    );
  });

  it("situation saine → aucun modèle (null)", () => {
    expect(balanceAlertTemplate({ remainingSeances: 8, debt: 0 })).toBeNull();
  });
});

/**
 * LA RÈGLE DU DESTINATAIRE : le chevalier ET son parent, ENSEMBLE.
 *
 * Ce n'est pas de la redondance. Le chevalier est parfois mineur et ne porte
 * pas de téléphone ; le parent est parfois injoignable la journée ; et une
 * dette qui traîne coûte plus cher qu'un message de trop.
 */
describe("recipientsFor — qui reçoit le message", () => {
  const student = {
    id: "stu-1",
    firstName: "Yacine",
    lastName: "Meziane",
    remainingSeances: 0,
    debt: 1200,
    phone: "0555111222",
  };

  it("vise le chevalier ET son parent quand les deux sont joignables", () => {
    const parent = { id: "par-1", firstName: "Karim", lastName: "Meziane", phone: "0661333444" };
    const out = recipientsFor(student, parent);
    expect(out.map((r) => r.phone)).toEqual(["0555111222", "0661333444"]);
    expect(out.map((r) => r.role)).toEqual(["student", "parent"]);
  });

  it("retient AUSSI le second numéro du parent, s'il diffère du premier", () => {
    const parent = {
      id: "par-1",
      firstName: "Karim",
      lastName: "Meziane",
      phone: "0661333444",
      phone2: "0770999888",
    };
    expect(recipientsFor(student, parent)).toHaveLength(3);
  });

  it("ne double pas un second numéro identique au premier", () => {
    const parent = {
      id: "par-1",
      firstName: "Karim",
      lastName: "Meziane",
      phone: "0661333444",
      phone2: "0661333444",
    };
    expect(recipientsFor(student, parent)).toHaveLength(2);
  });

  it("le parent seul, quand le chevalier n'a pas de numéro", () => {
    const parent = { id: "par-1", firstName: "Karim", lastName: "Meziane", phone: "0661333444" };
    const out = recipientsFor({ ...student, phone: "" }, parent);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("parent");
  });

  it("le chevalier seul, quand le parent n'a pas de numéro exploitable", () => {
    const parent = { id: "par-1", firstName: "Karim", lastName: "Meziane", phone: "" };
    const out = recipientsFor(student, parent);
    expect(out).toHaveLength(1);
    expect(out[0].phone).toBe("0555111222");
  });

  it("personne de joignable → liste vide, et une raison À AFFICHER", () => {
    const orphan = { ...student, phone: "" };
    expect(recipientsFor(orphan, null)).toHaveLength(0);
    // Un envoi silencieusement perdu est pire qu'un refus visible.
    expect(unreachableReason(orphan, null)).toContain("aucun numéro");
    expect(unreachableReason(orphan, null)).toContain("Yacine Meziane");
    expect(unreachableReason(student, null)).toBeNull();
  });
});

describe("buildBalanceAlert — le message composé pour chacun", () => {
  const student = {
    id: "stu-1",
    firstName: "Yacine",
    lastName: "Meziane",
    remainingSeances: 0,
    debt: 1200,
    phone: "0555111222",
  };

  it("compose un texte PAR destinataire, avec la formule d'adresse qui lui va", () => {
    const parent = { id: "par-1", firstName: "Karim", lastName: "Meziane", phone: "0661333444" };
    const out = buildBalanceAlert({ student, parent, school, lang: "fr", low: false });
    expect(out).not.toBeNull();
    expect(out!.templateId).toBe("debt");
    expect(out!.recipients).toHaveLength(2);

    const toStudent = out!.recipients.find((r) => r.role === "student")!;
    const toParent = out!.recipients.find((r) => r.role === "parent")!;
    expect(toStudent.text).toContain("Bonjour Yacine Meziane,");
    expect(toParent.text).toContain("cher parent de Yacine Meziane");
    // Le corps nomme le chevalier des deux côtés, et le club signe.
    for (const r of out!.recipients) {
      expect(r.text).toContain("Yacine Meziane");
      expect(r.text).toContain("ALTECH SCHOOL");
      expect(r.text).toContain("1 200 DA");
    }
  });

  it("réserve basse → modèle « séances bientôt épuisées »", () => {
    const out = buildBalanceAlert({
      student: {
        firstName: "Sara",
        lastName: "Bakhti",
        remainingSeances: 2,
        debt: 0,
        phone: "0555000111",
      },
      school,
      lang: "fr",
      low: true,
    });
    expect(out!.templateId).toBe("balance_low");
    expect(out!.recipients[0].text).toContain("Sara Bakhti");
    expect(out!.recipients[0].text).toContain("arrivent à leur fin");
  });

  it("langue arabe : le texte part en arabe", () => {
    const out = buildBalanceAlert({
      student: {
        firstName: "Sara",
        lastName: "Bakhti",
        remainingSeances: 3,
        debt: 1500,
        phone: "0555000111",
      },
      school,
      lang: "ar",
    });
    expect(/[؀-ۿ]/.test(out!.recipients[0].text)).toBe(true);
  });

  it("le modèle « situation » déplie le détail que l'écran lui donne", () => {
    const out = buildBalanceAlert({
      student: {
        firstName: "Sara",
        lastName: "Bakhti",
        remainingSeances: 1,
        debt: 3000,
        phone: "0555000111",
        registrationNumber: "2026-0042",
      },
      school,
      lang: "fr",
      templateId: "situation",
      detail: {
        semesterName: "Saison 2026 — 1er semestre",
        categoryName: "Poussins",
        groupName: "Groupe A",
        emploiTitle: "Équitation",
        emploiDays: "Lundi · Mercredi",
        emploiTime: "17:00 – 18:30",
        carteName: "Carte 3",
        carteHeld: 2,
        carteSize: 4,
        presences: 9,
        absences: 2,
        paid: 12000,
        debt: 3000,
      },
    });
    const text = out!.recipients[0].text;
    for (const needle of [
      "2026-0042",
      "Saison 2026",
      "Poussins",
      "Groupe A",
      "Équitation",
      "Lundi · Mercredi",
      "17:00 – 18:30",
      "Carte 3",
      "2 / 4",
      "Séances suivies : 9",
      "Absences : 2",
      "12 000 DA",
      "3 000 DA",
    ]) {
      expect(text).toContain(needle);
    }
  });

  it("situation saine sans modèle explicite → null (aucun envoi)", () => {
    const out = buildBalanceAlert({
      student: {
        firstName: "Sara",
        lastName: "Bakhti",
        remainingSeances: 10,
        debt: 0,
        phone: "0555000111",
      },
      lang: "fr",
    });
    expect(out).toBeNull();
  });

  it("personne de joignable → null, même quand la situation le justifierait", () => {
    const out = buildBalanceAlert({
      student: {
        firstName: "Sara",
        lastName: "Bakhti",
        remainingSeances: 0,
        debt: 900,
        phone: "",
      },
      parent: null,
      lang: "fr",
    });
    expect(out).toBeNull();
  });
});
