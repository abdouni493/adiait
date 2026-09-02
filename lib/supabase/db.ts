"use client";

/**
 * LA LECTURE DE LA BASE.
 *
 * L'application travaille sur la base ENTIÈRE, chargée en un temps au moment de
 * la connexion : tous les écrans calculent ensuite à partir de cet instantané
 * en mémoire, sans repasser par le réseau. C'est ce qui rend le pointage d'une
 * feuille de présence instantané, et ce qui permet aux rapports de recouper
 * présences, paiements et paie sans vingt requêtes.
 *
 * CE QUE CHACUN RAMÈNE N'EST PAS LA MÊME CHOSE : la RLS filtre à la source. Le
 * comptoir voit le club entier ; un parent ne ramène que ses enfants. Aucun
 * écran n'a à le savoir — la collection est simplement plus courte.
 *
 * LA PAGINATION EST OBLIGATOIRE : PostgREST rend mille lignes au maximum par
 * requête, et un club d'un trimestre dépasse largement ce chiffre en
 * présences. Une lecture tronquée ne lèverait aucune erreur — elle ferait juste
 * disparaître des présences et fausserait toutes les paies.
 */

import { supabase } from "./client";
import { toModel } from "./mapping";
import { SCHOOL_ROW_ID, SCHOOL_TABLE, TABLES, WRITE_ORDER, type CollectionKey } from "./schema";
import type { Database } from "@/lib/store/data";
import type { School } from "@/lib/types";

/** La taille d'une page de lecture. C'est la limite de PostgREST. */
const PAGE = 1000;

/** L'établissement vide — ce que la page de connexion affiche avant tout. */
export function emptySchool(): School {
  return {
    id: SCHOOL_ROW_ID,
    name: "Club",
    description: "",
    phone: "",
    email: "",
    address: "",
  };
}

/** Une base sans la moindre ligne. */
export function emptyDatabase(): Database {
  const db = { school: emptySchool() } as Database;
  for (const key of WRITE_ORDER) {
    (db as unknown as Record<string, unknown>)[key] = [];
  }
  return db;
}

/**
 * L'établissement seul.
 *
 * La page de connexion l'affiche — nom et logo — avant que quiconque soit
 * connecté : cette ligne-là est lisible sans compte (politique `anon` de la
 * section 6 du schéma). Un projet qui ne répond pas rend l'établissement vide
 * plutôt qu'une page blanche.
 */
export async function loadSchool(): Promise<School> {
  const { data, error } = await supabase()
    .from(SCHOOL_TABLE.table)
    .select("*")
    .eq("id", SCHOOL_ROW_ID)
    .maybeSingle();

  if (error || !data) return emptySchool();
  return { ...emptySchool(), ...toModel<School>(data) };
}

/** Une table entière, page par page. */
async function loadTable(table: string, orderBy: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase()
      .from(table)
      .select("*")
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...(page as Record<string, unknown>[]));
    if (page.length < PAGE) return rows;
  }
}

/**
 * TOUTE LA BASE, en un seul passage.
 *
 * Les 41 collections partent EN PARALLÈLE : elles ne dépendent pas les unes des
 * autres à la lecture, et les attendre en file rendrait la connexion trois fois
 * plus lente.
 *
 * Une table qui échoue ne fait pas tomber les autres : elle revient vide, et
 * son erreur est signalée. Mieux vaut un club à laquelle il manque les
 * annonces qu'un écran de connexion qui tourne dans le vide.
 */
export async function loadDatabase(): Promise<Database> {
  const db = emptyDatabase();
  const failures: string[] = [];

  const jobs = WRITE_ORDER.map(async (key: CollectionKey) => {
    const spec = TABLES[key];
    try {
      const rows = await loadTable(spec.table, spec.pk);
      (db as unknown as Record<string, unknown>)[key] = rows.map((row) => toModel(row));
    } catch (err) {
      failures.push(`${spec.table} (${err instanceof Error ? err.message : "échec"})`);
    }
  });

  const [school] = await Promise.all([loadSchool(), ...jobs]);
  db.school = school;

  if (failures.length) {
    console.error("[supabase] tables non chargées :", failures.join(", "));
  }
  return db;
}
