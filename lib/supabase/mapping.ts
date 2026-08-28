"use client";

/**
 * LA TRADUCTION ENTRE LES DEUX CÔTÉS.
 *
 * L'application parle `camelCase` (`pricePerSession`), PostgreSQL parle
 * `snake_case` (`price_per_session`). Le schéma a été écrit pour que la
 * traduction soit MÉCANIQUE : aucune table de correspondance à tenir à jour,
 * donc aucune colonne qu'on oublierait d'y ajouter.
 *
 * TROIS RÈGLES, ET C'EST TOUT :
 *
 *  1. `undefined` ne part pas. Une ligne n'envoie que les champs qu'elle porte.
 *  2. `null` ne revient pas : une colonne vide redevient un champ ABSENT, pas
 *     un champ à `null`. C'est ce qui fait que `worker.navKeys === undefined`
 *     garde son sens — « ses droits n'ont jamais été réglés » — face à `[]`,
 *     qui veut dire « aucun écran », et qui est une décision.
 *  3. Ce que la table ne connaît pas ne part pas non plus (`columns`) : un
 *     champ calculé posé sur une ligne par un écran ne fait pas échouer
 *     l'enregistrement de toute la ligne.
 */

import type { TableSpec } from "./schema";

/** `pricePerSession` -> `price_per_session` */
export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** `price_per_session` -> `pricePerSession` */
export function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export type Row = Record<string, unknown>;

/**
 * Une ligne du magasin, prête à partir.
 *
 * Les champs `undefined` et les colonnes inconnues sont écartés ; tout le reste
 * part tel quel — les objets et les listes atterrissent dans des colonnes
 * `jsonb` et reviendront identiques.
 */
export function toRow(model: Record<string, unknown>, spec: TableSpec): Row {
  const known = new Set(spec.columns);
  const row: Row = {};
  for (const [key, value] of Object.entries(model)) {
    if (value === undefined) continue;
    const column = toSnake(key);
    if (!known.has(column)) continue;
    row[column] = value;
  }
  return row;
}

/** Une ligne de la base, telle que le magasin l'attend. */
export function toModel<T>(row: Row): T {
  const model: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (value === null) continue; // une colonne vide = un champ absent
    model[toCamel(column)] = value;
  }
  return model as T;
}

/**
 * DEUX LIGNES SONT-ELLES LA MÊME ?
 *
 * La réplication compare l'état courant du magasin à ce qu'elle a envoyé la
 * fois d'avant : sans cette comparaison, la moindre présence pointée
 * réécrirait la base entière.
 *
 * La comparaison est faite SUR LA FORME ENVOYÉE (`toRow`), et clé par clé
 * triée, pour qu'un simple changement d'ordre des propriétés — chose courante
 * quand un objet est reconstruit par étalement — ne passe pas pour une
 * modification.
 */
export function sameRow(a: Row, b: Row): boolean {
  return stable(a) === stable(b);
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[key] = (v as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return v;
  });
}
