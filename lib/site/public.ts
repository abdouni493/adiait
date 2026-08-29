"use client";

/**
 * CE QUE LE SITE PUBLIC A LE DROIT DE LIRE.
 *
 * Le visiteur du site n'a pas de compte. La RLS ne lui ouvre que DEUX portes,
 * et ce fichier est le seul endroit de l'application qui les emprunte :
 *
 *   `schools`            — le nom, le logo, et toute la vitrine : les textes de
 *                          présentation, l'image et la vidéo d'accueil, les
 *                          coordonnées et les réseaux sociaux ;
 *   `website_formations` — les formations et les évènements PUBLIÉS. Celles
 *                          qu'on a retirées du site (`hidden`) ne sortent pas :
 *                          le filtre est posé ici ET dans la politique de
 *                          lecture, pour qu'une adresse devinée ne rende pas
 *                          une annonce qu'on a décidé de cacher.
 *
 * Rien d'autre n'est lisible sans compte, et c'est pour cela que le nom de
 * l'encadrant est RECOPIÉ sur la formation : la table des entraîneurs, elle,
 * reste fermée.
 *
 * TOUT ÉCHEC REND DU VIDE, ET NON UNE EXCEPTION. Un site vitrine qui ne peut
 * pas joindre son serveur doit afficher le club sans ses formations, pas une
 * page blanche.
 */

import { restAnon } from "@/lib/supabase/client";
import { toModel } from "@/lib/supabase/mapping";
import { SCHOOL_ROW_ID } from "@/lib/supabase/schema";
import { emptySchool } from "@/lib/supabase/db";
import type { Formation, School } from "@/lib/types";

/** La fiche de l'établissement, vitrine comprise. */
export async function loadSiteSchool(): Promise<School> {
  const { data, error } = await restAnon<Record<string, unknown>>(
    "schools",
    `select=*&id=eq.${SCHOOL_ROW_ID}&limit=1`,
  );
  if (error || !data?.length) return emptySchool();
  return { ...emptySchool(), ...toModel<School>(data[0]) };
}

/** Les formations et les évènements affichés, les plus proches d'abord. */
export async function loadSiteFormations(): Promise<Formation[]> {
  const { data, error } = await restAnon<Record<string, unknown>>(
    "website_formations",
    "select=*&or=(hidden.is.null,hidden.is.false)&order=start_date.desc",
  );
  if (error || !data) return [];
  return data.map((row) => normalize(toModel<Formation>(row)));
}

/** UNE formation, celle que le lien copié depuis la gestion désigne. */
export async function loadSiteFormation(id: string): Promise<Formation | null> {
  const { data, error } = await restAnon<Record<string, unknown>>(
    "website_formations",
    `select=*&id=eq.${encodeURIComponent(id)}&or=(hidden.is.null,hidden.is.false)&limit=1`,
  );
  if (error || !data?.length) return null;
  return normalize(toModel<Formation>(data[0]));
}

/**
 * Une colonne vide revient comme un champ ABSENT (`toModel`), ce qui est le bon
 * comportement partout ailleurs — mais le site parcourt `days` et `images` sans
 * les avoir demandés à personne. On les rend donc toujours listes.
 */
function normalize(formation: Formation): Formation {
  return {
    ...formation,
    days: formation.days ?? [],
    images: formation.images ?? [],
    price: Number(formation.price ?? 0),
    seances: Number(formation.seances ?? 0),
  };
}

/**
 * L'ADRESSE PUBLIQUE D'UNE FORMATION — celle que « Copier le lien » met dans le
 * presse-papier, et celle que le site ouvre quand on clique dessus.
 *
 * Elle est ABSOLUE quand on la copie (on l'envoie par message, elle doit
 * pouvoir être cliquée n'importe où) et relative quand le site navigue chez
 * lui. `origin` n'existe pas côté serveur : sans navigateur, on rend le chemin.
 */
export function formationPath(id: string): string {
  return `/site/formations/${encodeURIComponent(id)}`;
}

export function formationUrl(id: string): string {
  const path = formationPath(id);
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
