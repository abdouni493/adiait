"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { tr } = useT();
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted start-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ? tr(placeholder) : placeholder}
        className="h-10 w-full rounded-xl border border-line bg-surface text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-primary ps-9 pe-3"
      />
    </div>
  );
}

/**
 * LE TEXTE D'INVITE D'UN CHAMP PASSE PAR LE DICTIONNAIRE.
 *
 * Les `placeholder` de l'application sont écrits en clair, en français, dans
 * chaque écran. Les traduire ici — au seul endroit par lequel ils passent tous
 * — met l'application entière en arabe sans réécrire un seul formulaire. Un
 * texte inconnu du dictionnaire revient en français, tel qu'il a été écrit.
 */
export function Input({
  className,
  placeholder,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const { tr } = useT();
  return (
    <input
      placeholder={placeholder ? tr(placeholder) : placeholder}
      className={cn(
        "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-primary",
        className,
      )}
      {...props}
    />
  );
}

/**
 * LES LIBELLÉS D'UNE LISTE DÉROULANTE AUSSI.
 *
 * Chaque `<option>` porte son texte en clair — « Toutes les catégories »,
 * « Sélectionner une arène » — et non une clé. On traduit donc les options ICI,
 * au passage : une option dont le texte est inconnu du dictionnaire garde son
 * français, et TOUT le reste (les noms de chevaliers, de groupes, d'entraîneurs
 * — des données, pas de l'interface) traverse forcément intact, puisqu'il n'est
 * pas dans le dictionnaire.
 */
export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { tr } = useT();
  const translate = (node: React.ReactNode): React.ReactNode =>
    React.Children.map(node, (child) => {
      if (!React.isValidElement(child)) return child;
      if (child.type !== "option" && child.type !== "optgroup") return child;
      const props = child.props as { children?: React.ReactNode; label?: string };
      const next: Record<string, unknown> = {};
      if (typeof props.children === "string") next.children = tr(props.children);
      else if (child.type === "optgroup") next.children = translate(props.children);
      if (typeof props.label === "string") next.label = tr(props.label);
      return Object.keys(next).length > 0 ? React.cloneElement(child, next) : child;
    });

  return (
    <select
      className={cn(
        "h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-primary",
        className,
      )}
      {...props}
    >
      {translate(children)}
    </select>
  );
}
