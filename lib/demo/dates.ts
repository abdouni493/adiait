"use client";

/**
 * LE TEMPS DE LA DÉMONSTRATION.
 *
 * Toutes les dates du jeu de données sont RELATIVES à aujourd'hui : la grille
 * des emplois du temps, la feuille de présence et le scan ont donc toujours des
 * séances vivantes, quel que soit le jour où la démonstration est ouverte.
 *
 * Le hasard, lui, ne bouge pas : `rng()` tire ses nombres d'une graine de texte
 * (identifiant de l'élève + date), jamais de `Math.random()`. Deux visiteurs
 * voient la même école et un rechargement ne rejoue pas le mois.
 */

import type { Day } from "@/lib/types";

const JS_DAYS: Day[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function iso(d: Date): string {
  return d.toLocaleDateString("fr-CA");
}

/** Le jour situé a `days` d'aujourd'hui (negatif = dans le passe). */
export function shiftDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
}

/** Un horodatage ISO a `hhmm`, `days` jours d'aujourd'hui. */
export function stamp(days: number, hhmm: string): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** L'horodatage d'une DATE donnee (YYYY-MM-DD) a `hhmm`. */
export function stampOn(dateIso: string, hhmm: string): string {
  const [y, mo, da] = dateIso.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(y, mo - 1, da, h, mi, 0, 0).toISOString();
}

/** Le nom du jour de la semaine situe a `n` jours d'aujourd'hui. */
export function weekday(n = 0): Day {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return JS_DAYS[d.getDay()];
}

export const TODAY: Day = weekday(0);

/**
 * Les jours PASSES ou un emploi du temps est tombe, du plus ancien au plus
 * recent. `since` est un decalage negatif (−60 = il y a soixante jours) et
 * `until` s'arrete par defaut a aujourd'hui inclus.
 */
export function pastOccurrences(days: Day[], since: number, until = 0): string[] {
  const wanted = new Set(days);
  const out: string[] = [];
  for (let i = since; i <= until; i++) {
    if (wanted.has(weekday(i))) out.push(shiftDays(i));
  }
  return out;
}

/** Le mois calendaire d'une date, sous la forme « 08/2026 » des periodes de paie. */
export function monthKeyOf(dateIso: string): string {
  const [y, m] = dateIso.split("-");
  return `${m}/${y}`;
}

/**
 * UN HASARD QUI NE BOUGE PAS — FNV-1a puis xorshift, ramene dans [0, 1[.
 * La meme graine rend toujours le meme nombre.
 */
export function rng(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return ((h >>> 0) % 100000) / 100000;
}

/** Un entier de `min` a `max` inclus, tire de la meme graine. */
export function pick(seed: string, min: number, max: number): number {
  return min + Math.floor(rng(seed) * (max - min + 1));
}

/** Un element d'une liste, tire de la meme graine. */
export function choose<T>(seed: string, list: readonly T[]): T {
  return list[Math.floor(rng(seed) * list.length) % list.length];
}
