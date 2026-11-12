"use client";

/**
 * LA MISE EN PAGE DE LA FICHE D'UN CHEVALIER — création et modification.
 *
 * Trois pièces, toutes aux couleurs du club (acier & or) et lisibles en clair
 * comme en sombre, puisqu'elles ne parlent qu'en jetons de thème :
 *
 *  - `FicheHero`    : l'en-tête — le blason du chevalier (ses initiales), son
 *                     nom tel qu'il se tape, son numéro et ce qui est déjà choisi ;
 *  - `FicheStepper` : les étapes de la fiche, cochées au fur et à mesure, et qui
 *                     mènent d'un clic à leur section ;
 *  - `FicheSection` : une section numérotée, avec son icône, sa couleur et son
 *                     liseré.
 */

import type { ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";

export type FicheTone = "primary" | "accent" | "success" | "warning";

const TONE: Record<
  FicheTone,
  { stripe: string; icon: string; wash: string; ring: string }
> = {
  primary: {
    stripe: "bg-primary",
    icon: "bg-primary/12 text-primary",
    wash: "from-primary-50/80",
    ring: "border-primary/25",
  },
  accent: {
    stripe: "bg-gradient-accent",
    icon: "bg-accent/15 text-accent-ink",
    wash: "from-accent-wash/80",
    ring: "border-accent/35",
  },
  success: {
    stripe: "bg-success",
    icon: "bg-success/15 text-success",
    wash: "from-success/8",
    ring: "border-success/30",
  },
  warning: {
    stripe: "bg-warning",
    icon: "bg-warning/15 text-warning",
    wash: "from-warning/8",
    ring: "border-warning/35",
  },
};

/** L'identifiant DOM d'une section, pour que le stepper y conduise. */
export const ficheAnchor = (key: string) => `fiche-${key}`;

export function FicheSection({
  id,
  step,
  icon: Icon,
  title,
  subtitle,
  tone = "primary",
  done = false,
  aside,
  children,
}: {
  id: string;
  step: number;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tone?: FicheTone;
  done?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <section
      id={ficheAnchor(id)}
      className={`relative scroll-mt-20 overflow-hidden rounded-2xl border bg-surface card-shadow ${t.ring}`}
    >
      <span aria-hidden className={`absolute inset-y-0 start-0 w-1 ${t.stripe}`} />
      <header
        className={`flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r to-transparent px-4 py-3 ps-5 ${t.wash}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon}`}
          >
            <Icon className="h-5 w-5" />
            <span
              className={`absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface text-[10px] font-black ${
                done ? "bg-success text-white" : "bg-gradient-accent text-[#241a05]"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : step}
            </span>
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
            {subtitle && <p className="text-[11px] leading-snug text-muted">{subtitle}</p>}
          </div>
        </div>
        {aside && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{aside}</div>}
      </header>
      <div className="space-y-3 p-4 ps-5">{children}</div>
    </section>
  );
}

export interface FicheStep {
  key: string;
  label: string;
  icon: LucideIcon;
  done: boolean;
  /** quelque chose demande l'attention (séances à régulariser, compte incomplet…) */
  warn?: boolean;
}

export function FicheStepper({ steps }: { steps: FicheStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / Math.max(1, steps.length)) * 100);
  return (
    <nav aria-label="Étapes de la fiche" className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() =>
                document
                  .getElementById(ficheAnchor(s.key))
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                s.warn
                  ? "border-warning/50 bg-warning/10 text-warning"
                  : s.done
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-line bg-surface text-muted hover:border-accent/40 hover:text-ink"
              }`}
            >
              {s.done && !s.warn ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              <span className="font-mono text-[10px] opacity-70">{i + 1}</span>
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-primary-50">
        <div
          className="h-full rounded-full bg-gradient-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </nav>
  );
}

export function FicheHero({
  name,
  number,
  isEdit,
  chips,
}: {
  name: string;
  number: string;
  isEdit: boolean;
  chips: ReactNode;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-primary p-4 text-white card-shadow">
      {/* le liseré d'or et un blason discret en filigrane */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-gradient-accent" />
      <span
        aria-hidden
        className="pointer-events-none absolute -end-8 -top-10 h-40 w-40 rounded-full border-[14px] border-white/5"
      />
      <div className="relative flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-accent font-display text-xl font-black text-[#241a05] ring-4 ring-white/10">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
            {isEdit ? "Fiche du chevalier" : "Nouveau chevalier"}
          </span>
          <strong className="block truncate font-display text-lg">
            {name.trim() || "Prénom et nom à saisir"}
          </strong>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{chips}</div>
        </div>
        <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-end">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-white/60">
            Matricule
          </span>
          <strong className="font-mono text-base">N° {number}</strong>
        </div>
      </div>
    </div>
  );
}

/** Une pastille claire posée sur l'en-tête sombre. */
export function HeroChip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "gold" | "warn" }) {
  const cls =
    tone === "gold"
      ? "border-accent-soft/50 bg-accent/25 text-[#fbe7b5]"
      : tone === "warn"
        ? "border-warning/60 bg-warning/25 text-white"
        : "border-white/15 bg-white/10 text-white/85";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}
