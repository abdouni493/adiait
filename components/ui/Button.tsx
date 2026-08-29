"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/useT";

type Variant =
  | "primary"
  | "accent"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-primary text-white card-shadow hover:brightness-115 active:brightness-95",
  // L'or porte l'action de tête. Son encre est SOMBRE : du blanc sur de l'or
  // ne passerait pas le contraste.
  accent:
    "bg-gradient-accent text-[#241a05] card-shadow hover:brightness-105 active:brightness-95",
  secondary:
    "bg-primary-50 text-primary border border-line hover:border-accent/40",
  outline:
    "border border-line bg-transparent text-ink hover:border-accent/50 hover:bg-primary-50/60",
  ghost: "bg-transparent text-muted hover:bg-primary-50/60 hover:text-ink",
  danger: "bg-gradient-danger text-white card-shadow hover:brightness-110",
  success: "bg-gradient-success text-white card-shadow hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
  icon: "h-10 w-10 justify-center rounded-xl",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * LE TEXTE D'UN BOUTON PASSE PAR LE DICTIONNAIRE.
 *
 * Les boutons de l'application portent leur libellé en clair — `<Button>
 * Enregistrer</Button>` — et non une clé. On traduit donc ICI, au seul endroit
 * par lequel ils passent tous : les enfants qui sont du TEXTE sont traduits, le
 * reste (icônes, fragments, éléments) traverse intact.
 *
 * Un libellé absent du dictionnaire revient en français, exactement comme il a
 * été écrit : aucun bouton ne peut se retrouver vide ou porteur d'un code.
 */
function TranslatedChildren({ children }: { children: React.ReactNode }) {
  const { tr } = useT();
  return (
    <>
      {React.Children.map(children, (child) =>
        typeof child === "string" ? tr(child) : child,
      )}
    </>
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium",
        // L'enfoncement se joue sur `transform` seul : il ne déplace jamais
        // ce qui l'entoure, et reste donc à 60 images par seconde.
        "transition-[background,color,border-color,box-shadow,filter,transform] duration-200 active:scale-[0.97]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      <TranslatedChildren>{children}</TranslatedChildren>
    </button>
  ),
);
Button.displayName = "Button";
