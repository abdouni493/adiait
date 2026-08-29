"use client";

import { useCallback } from "react";
import { useSettings } from "@/lib/store/settings";
import { phrase } from "./phrases";

/**
 * TRADUIRE UNE PHRASE ÉCRITE EN FRANÇAIS DANS L'ÉCRAN.
 *
 * `useTranslation()` traduit des CLÉS (`nav.students`). Ce crochet-ci traduit
 * la PHRASE elle-même : `tr("Présences")` rend « الحضور » en arabe, et
 * « Présences » partout ailleurs.
 *
 * C'est ce qui permet de rendre l'application arabe sans réécrire les milliers
 * de littéraux français qu'elle contient : les composants PARTAGÉS — en-tête
 * d'écran, boîtes de dialogue, boutons, champs, onglets, états vides — passent
 * leur texte par ici, et couvrent d'un coup presque tout ce qui s'affiche.
 *
 * Une phrase absente du dictionnaire revient en français : aucun écran ne peut
 * se retrouver avec un identifiant cru affiché à la place d'un mot.
 */
export function useT() {
  const language = useSettings((s) => s.language);
  const tr = useCallback((text: string) => phrase(language, text), [language]);
  return { tr, language, isRTL: language === "ar" };
}

/** La même chose, quand un seul texte est à traduire. */
export function useTr(): (text: string) => string {
  return useT().tr;
}
