/**
 * LE PONT ENTRE L'APPLICATION ET LA BASE.
 *
 * Une école entière est fabriquée en mémoire (`lib/demo/seed.ts` — il sert
 * désormais de jeu d'essai), puis on vérifie que CHAQUE champ de CHAQUE ligne
 * qu'elle contient a bien une colonne pour l'accueillir.
 *
 * C'est le seul filet qui rattrape la faute la plus coûteuse de cette
 * architecture : ajouter un champ à un type TypeScript sans ajouter sa colonne
 * dans `supabase/schema.sql`. Sans ce test, le champ partirait, PostgreSQL
 * refuserait la ligne — et l'écran, lui, afficherait la modification comme si
 * elle avait été enregistrée.
 */
import { describe, expect, it } from "vitest";
import { buildDemoDatabase } from "@/lib/demo/seed";
import { COLLECTION_ORDER } from "@/lib/demo/collections";
import { SCHOOL_TABLE, TABLES, WRITE_ORDER, DELETE_ORDER } from "@/lib/supabase/schema";
import { sameRow, toCamel, toModel, toRow, toSnake } from "@/lib/supabase/mapping";

const db = buildDemoDatabase();

describe("les noms de champs", () => {
  it("font l'aller-retour sans se déformer", () => {
    for (const name of [
      "id",
      "firstName",
      "pricePerSession",
      "schoolOnlySubscriptionIds",
      "createdByRole",
      "phone2",
      "rfid",
      "nif",
    ]) {
      expect(toCamel(toSnake(name))).toBe(name);
    }
  });

  it("traduisent bien dans les deux sens", () => {
    expect(toSnake("pricePerSession")).toBe("price_per_session");
    expect(toSnake("phone2")).toBe("phone2");
    expect(toCamel("registration_fee_class_ids")).toBe("registrationFeeClassIds");
  });
});

describe("le schéma couvre tout ce que l'application écrit", () => {
  it("connaît les 39 collections du magasin", () => {
    expect(WRITE_ORDER.slice().sort()).toEqual(COLLECTION_ORDER.slice().sort());
    expect(DELETE_ORDER).toEqual([...WRITE_ORDER].reverse());
  });

  it("a une colonne pour chaque champ de chaque ligne", () => {
    const missing: string[] = [];

    for (const key of WRITE_ORDER) {
      const spec = TABLES[key];
      const known = new Set(spec.columns);
      const rows = db[key] as unknown as Record<string, unknown>[];
      for (const row of rows) {
        for (const field of Object.keys(row)) {
          const column = toSnake(field);
          if (!known.has(column)) missing.push(`${spec.table}.${column} (${key}.${field})`);
        }
      }
    }

    for (const field of Object.keys(db.school)) {
      const column = toSnake(field);
      if (!SCHOOL_TABLE.columns.includes(column)) {
        missing.push(`schools.${column} (school.${field})`);
      }
    }

    expect([...new Set(missing)]).toEqual([]);
  });

  it("désigne chaque ligne par une clé primaire qui est réellement remplie", () => {
    for (const key of WRITE_ORDER) {
      const spec = TABLES[key];
      const rows = db[key] as unknown as Record<string, unknown>[];
      for (const row of rows) {
        const value = toRow(row, spec)[spec.pk];
        expect(value, `${spec.table}.${spec.pk}`).toBeTruthy();
      }
    }
  });
});

describe("ce qui part, et ce qui revient", () => {
  const spec = TABLES.students;

  it("n'envoie ni les champs absents ni les colonnes inconnues", () => {
    const row = toRow(
      { id: "stu-1", firstName: "Yacine", lastName: undefined, soldeCalcule: 1200 },
      spec,
    );
    expect(row).toEqual({ id: "stu-1", first_name: "Yacine" });
  });

  it("rend une colonne vide comme un champ ABSENT, et non comme `null`", () => {
    // C'est ce qui fait la différence entre « droits jamais réglés »
    // (`navKeys` absent) et « aucun écran » (`navKeys` vide) : les deux
    // n'ouvrent pas le même menu.
    const jamais = toModel<{ navKeys?: string[] }>({ id: "rec-1", nav_keys: null });
    expect("navKeys" in jamais).toBe(false);

    const aucun = toModel<{ navKeys?: string[] }>({ id: "rec-1", nav_keys: [] });
    expect(aucun.navKeys).toEqual([]);
  });

  it("garde les listes et les objets tels quels", () => {
    const row = toRow(
      { id: "stu-1", subscriptionIds: ["sub-1"], caseReduction: { type: "percent", schoolValue: 50 } },
      spec,
    );
    expect(row.subscription_ids).toEqual(["sub-1"]);
    expect(row.case_reduction).toEqual({ type: "percent", schoolValue: 50 });
  });
});

describe("la comparaison qui décide d'envoyer, ou de ne rien faire", () => {
  it("ignore l'ordre des propriétés", () => {
    // Un objet reconstruit par étalement ressort dans un autre ordre sans avoir
    // changé. Le prendre pour une modification ferait repartir toute l'école à
    // chaque pointage.
    expect(sameRow({ id: "a", name: "x" }, { name: "x", id: "a" })).toBe(true);
    expect(sameRow({ id: "a", meta: { b: 1, a: 2 } }, { id: "a", meta: { a: 2, b: 1 } })).toBe(true);
  });

  it("voit une vraie modification", () => {
    expect(sameRow({ id: "a", amount: 100 }, { id: "a", amount: 150 })).toBe(false);
    expect(sameRow({ id: "a" }, { id: "a", paid: false })).toBe(false);
  });

  it("ne confond pas une liste vide avec une liste absente", () => {
    expect(sameRow({ id: "a", nav_keys: [] }, { id: "a" })).toBe(false);
  });
});
