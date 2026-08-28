"use client";

import { createElement } from "react";
import { navIcon } from "@/lib/icons";

/**
 * L'EMBLÈME D'UN ÉCRAN, rendu à partir de sa clé.
 *
 * `navIcon()` ne FABRIQUE pas de composant : il en CHOISIT un dans un registre
 * figé au chargement du module (`lib/icons.ts`). L'identité rendue est donc
 * stable pour une clé donnée, et React ne remonte rien d'un rendu à l'autre.
 *
 * `createElement` plutôt que du JSX : écrit en JSX, le choix ressemble à s'y
 * méprendre à un composant défini en cours de rendu — ce que React signale à
 * juste titre d'ordinaire. Ici, ce serait une fausse alerte, et la contourner
 * en désactivant la règle la désactiverait aussi pour les vrais cas.
 */
export function NavIcon({
  navKey,
  className,
  strokeWidth = 1.9,
}: {
  navKey: string;
  className?: string;
  strokeWidth?: number;
}) {
  return createElement(navIcon(navKey), {
    className,
    strokeWidth,
    "aria-hidden": true,
  });
}
