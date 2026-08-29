/**
 * LE CALENDRIER D'UNE FORMATION.
 *
 * Une formation ne « tient pas tous les mardis » : elle tient LES 4, 11 et
 * 18 mars. C'est une différence de fond, et c'est elle qui commande tout ce
 * fichier — on déplie la période en journées réelles, on en coche certaines, et
 * ce sont ces dates-là qui sont enregistrées.
 *
 * Une règle de récurrence aurait été plus courte à écrire et impossible à
 * relire : elle n'aurait su dire ni « sauf le 1er mai », ni « et aussi le
 * samedi de la remise des prix ».
 *
 * Ces fonctions sont PURES et sans dépendance au navigateur : la gestion s'en
 * sert pour dessiner le calendrier à cocher, et le site public pour afficher
 * les dates retenues.
 */

import type { Day, Formation } from "@/lib/types";

const JS_DAYS: Day[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Le jour de la semaine sur lequel tombe une date YYYY-MM-DD. Lue à midi :
 *  un décalage de fuseau ne peut alors jamais la faire glisser à la veille. */
export function weekdayOfKey(key: string): Day {
  return JS_DAYS[new Date(`${key}T12:00:00`).getDay()];
}

/** `key` avancée de `n` jours, toujours en YYYY-MM-DD local. */
export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString("fr-CA");
}

/**
 * TOUTES LES JOURNÉES D'UNE PÉRIODE, bornes comprises.
 *
 * Le garde-fou des 400 jours n'est pas de la prudence excessive : une faute de
 * frappe sur l'année (« 2036 » au lieu de « 2026 ») demanderait autrement
 * quatre mille cases à dessiner, et l'écran de création se figerait sans que
 * personne comprenne pourquoi.
 */
export function daysInPeriod(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const out: string[] = [];
  for (let key = startDate; key <= endDate; key = addDaysKey(key, 1)) {
    out.push(key);
    if (out.length > 400) break;
  }
  return out;
}

/** Les journées d'une période, groupées par mois — un calendrier se lit ainsi. */
export function monthsOfPeriod(
  startDate: string,
  endDate: string,
): { month: string; days: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const key of daysInPeriod(startDate, endDate)) {
    const month = key.slice(0, 7);
    const list = groups.get(month);
    if (list) list.push(key);
    else groups.set(month, [key]);
  }
  return [...groups.entries()].map(([month, days]) => ({ month, days }));
}

/**
 * LES JOURNÉES RÉELLEMENT TENUES.
 *
 * Une liste vide veut dire « toute la période » : c'est le cas d'un évènement
 * d'un seul tenant, qu'on ne va pas faire cocher jour par jour.
 */
export function formationDays(formation: Formation): string[] {
  const chosen = (formation.days ?? []).filter(Boolean);
  if (chosen.length > 0) return [...chosen].sort();
  return daysInPeriod(formation.startDate, formation.endDate);
}

/** Où en est la formation, le jour où on la regarde. */
export type FormationStatus = "upcoming" | "running" | "past";

export function formationStatus(formation: Formation, today: string): FormationStatus {
  if (formation.startDate && today < formation.startDate) return "upcoming";
  if (formation.endDate && today > formation.endDate) return "past";
  return "running";
}

/** « 4 mars 2026 » — la date écrite comme on la lit, et non comme on la range. */
export function longDate(key: string, locale = "fr"): string {
  if (!key) return "";
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** « mars 2026 » — l'intertitre d'un mois du calendrier. */
export function longMonth(month: string, locale = "fr"): string {
  const d = new Date(`${month}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    month: "long",
    year: "numeric",
  });
}

/** « du 4 au 18 mars 2026 », ou la seule date quand la période tient en un jour. */
export function periodLabel(formation: Formation, locale = "fr"): string {
  const from = longDate(formation.startDate, locale);
  const to = longDate(formation.endDate, locale);
  if (!from) return "";
  if (!to || to === from) return from;
  return locale === "ar" ? `من ${from} إلى ${to}` : `du ${from} au ${to}`;
}

/** « 08:00 – 12:00 », quand les heures ont été données. */
export function hoursLabel(formation: Formation): string {
  const { startTime, endTime } = formation;
  if (!startTime && !endTime) return "";
  if (startTime && endTime) return `${startTime} – ${endTime}`;
  return startTime || endTime || "";
}
