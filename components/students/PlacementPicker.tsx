"use client";

/**
 * LE CHOIX DE LA CARTE ET DE LA SÉANCE OÙ UN NOUVEAU CHEVALIER COMMENCE.
 *
 * Une fois l'emploi du temps (le groupe) coché, l'écran de création montre la
 * carte COURANTE du groupe et ses cartes PRÉCÉDENTES, chacune avec sa jauge de
 * séances tenues. La réception choisit la carte, puis la séance de cette carte
 * sur une grille de cases datées :
 *
 *  - carte courante + séance du jour (choix par défaut, en vert) : il commence
 *    normalement ;
 *  - une séance passée (en ambre) : toutes les séances du groupe depuis ce
 *    placement jusqu'à aujourd'hui lui sont rattachées, « à régulariser » —
 *    rien n'est débité tant qu'elles ne sont pas pointées.
 */

import { useMemo } from "react";
import { AlertTriangle, CalendarClock, Check, CircleDot } from "lucide-react";
import { useData } from "@/lib/store/data";
import { carteLabel, carteShort, formatDateFr } from "@/lib/helpers";
import {
  placementBacklogCount,
  placementCartes,
  type PlacementChoice,
  type PlacementSeance,
} from "@/lib/placement";

export function PlacementPicker({
  subscriptionId,
  arrivalDay,
  value,
  onChange,
}: {
  subscriptionId: string;
  arrivalDay: string;
  /** null = carte courante, séance du jour */
  value: PlacementChoice | null;
  onChange: (choice: PlacementChoice | null) => void;
}) {
  const db = useData();
  const cartes = useMemo(
    () => placementCartes(db, subscriptionId, arrivalDay),
    [db, subscriptionId, arrivalDay],
  );
  // Un groupe qui n'a encore tenu aucune séance : rien à choisir, il commence au début.
  const hasPast = cartes.some((c) => c.seances.some((s) => s.past));
  if (cartes.length === 0 || !hasPast) return null;

  const current = cartes.find((c) => c.current) ?? cartes[0];
  const selectedCode = value?.carteCode ?? current.code;
  const carte = cartes.find((c) => c.code === selectedCode) ?? current;
  const normal = current.seances.find((s) => s.normal);
  const isPast = !!value?.date && value.date < arrivalDay;
  const backlog = isPast ? placementBacklogCount(db, subscriptionId, value, arrivalDay) : 0;

  const pickCarte = (code: string) => {
    const c = cartes.find((x) => x.code === code);
    if (!c) return;
    if (c.current) {
      onChange(null);
      return;
    }
    // Une carte précédente : sa première séance par défaut.
    const first = c.seances[0];
    onChange(first ? { carteCode: c.code, seance: first.index, date: first.date, slot: first.slot } : null);
  };

  const pickSeance = (s: PlacementSeance) => {
    if (s.normal || !s.past) {
      onChange(null);
      return;
    }
    onChange({ carteCode: carte.code, seance: s.index, date: s.date, slot: s.slot });
  };

  const isSelected = (s: PlacementSeance) =>
    value && value.carteCode === carte.code ? value.seance === s.index : !value && s.normal;

  // Les cases de la carte : ses séances, puis les places encore à venir.
  const upcoming = Math.max(0, carte.size - carte.seances.length);

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-line bg-canvas/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          <CalendarClock className="h-3.5 w-3.5" /> Placement — carte et séance de départ
        </span>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] font-bold text-primary hover:underline"
          >
            Revenir au départ normal
          </button>
        ) : null}
      </div>

      {/* 1. LA CARTE — la courante d'abord, puis les précédentes */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cartes.map((c) => {
          const on = c.code === carte.code;
          const pct = Math.round((c.held / Math.max(1, c.size)) * 100);
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => pickCarte(c.code)}
              aria-pressed={on}
              className={`min-w-[132px] shrink-0 cursor-pointer rounded-xl border p-2.5 text-start transition-all ${
                on
                  ? "border-accent bg-accent-wash/70 ring-2 ring-accent/30"
                  : "border-line bg-surface hover:border-accent/40"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <strong className={`font-display text-xs ${on ? "text-accent-ink" : "text-ink"}`}>
                  {carteLabel(c.code)}
                </strong>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
                    c.current ? "bg-success/15 text-success" : "bg-primary-50 text-muted"
                  }`}
                >
                  {c.current ? (c.complete ? "Dernière" : "En cours") : "Précédente"}
                </span>
              </span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-primary-50">
                <span
                  className={`block h-full rounded-full ${c.complete ? "bg-primary" : "bg-gradient-accent"}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="mt-1 block text-[9px] text-muted">
                {c.held}/{c.size} séances
                {c.startDate ? ` · dès le ${formatDateFr(c.startDate)}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. LA SÉANCE — une case par séance de la carte */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
        {carte.seances.map((s) => {
          const on = isSelected(s);
          const tone = s.normal
            ? "border-success/45 text-success"
            : s.past
              ? "border-warning/45 text-warning"
              : "border-line text-muted";
          return (
            <button
              key={s.index}
              type="button"
              onClick={() => pickSeance(s)}
              aria-pressed={!!on}
              className={`relative cursor-pointer rounded-xl border p-2 text-start transition-all ${
                on
                  ? "border-primary bg-gradient-primary text-white card-shadow"
                  : `bg-surface hover:-translate-y-0.5 ${tone}`
              }`}
            >
              {on && (
                <span className="absolute end-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-accent text-[#241a05]">
                  <Check className="h-3 w-3" />
                </span>
              )}
              <strong className="block font-display text-sm">
                {carteShort(carte.code)}·S{s.index + 1}
              </strong>
              <span className={`block text-[9px] ${on ? "text-white/80" : "text-muted"}`}>
                {s.date ? formatDateFr(s.date) : "à venir"}
              </span>
              <span
                className={`mt-0.5 block text-[8px] font-bold uppercase tracking-wide ${
                  on ? "text-[#fbe7b5]" : ""
                }`}
              >
                {s.normal ? "Aujourd'hui · normal" : s.past ? "Passée" : "À venir"}
              </span>
            </button>
          );
        })}
        {carte.current && !normal && (
            <button
              key="next"
              type="button"
              onClick={() => onChange(null)}
              className={`cursor-pointer rounded-xl border border-dashed p-2 text-start ${
                !value ? "border-primary bg-primary-50 text-primary" : "border-line text-muted"
              }`}
            >
              <strong className="block font-display text-sm">Prochaine</strong>
              <span className="block text-[9px]">départ normal</span>
            </button>
          )}
        {Array.from(
          { length: Math.max(0, upcoming - (carte.current && !normal ? 1 : 0)) },
          (_, i) => (
            <div
              key={`empty-${i}`}
              className="rounded-xl border border-dashed border-line/70 p-2 text-muted/50"
            >
              <strong className="block font-display text-sm">
                {carteShort(carte.code)}·S{carte.seances.length + i + 1 + (carte.current && !normal ? 1 : 0)}
              </strong>
              <span className="block text-[9px]">pas encore tenue</span>
            </div>
          ),
        )}
      </div>

      {/* la légende */}
      <div className="flex flex-wrap gap-3 text-[9px] text-muted">
        <span className="flex items-center gap-1">
          <CircleDot className="h-3 w-3 text-success" /> séance du jour (normal)
        </span>
        <span className="flex items-center gap-1">
          <CircleDot className="h-3 w-3 text-warning" /> séance passée (à régulariser)
        </span>
        <span className="flex items-center gap-1">
          <CircleDot className="h-3 w-3 text-muted/60" /> pas encore tenue
        </span>
      </div>

      {isPast ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/45 bg-warning/10 p-2.5 text-[10px] leading-relaxed text-ink">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            Placé en <strong>{carteLabel(value!.carteCode)} · séance {value!.seance + 1}</strong>{" "}
            ({formatDateFr(value!.date)}) : <strong>{backlog} séance(s)</strong> jusqu&apos;à
            aujourd&apos;hui lui seront rattachées <strong>à régulariser</strong>. Rien n&apos;est
            débité et aucune présence ni absence n&apos;est posée tant que vous ne les avez pas
            réglées depuis le <strong>tableau de bord</strong> ou l&apos;écran{" "}
            <strong>Présences</strong>.
          </span>
        </p>
      ) : (
        <p className="flex items-center gap-1.5 rounded-xl border border-success/35 bg-success/10 p-2 text-[10px] font-semibold text-success">
          <Check className="h-3.5 w-3.5" /> Carte courante, séance du jour : il commence normalement.
        </p>
      )}
    </div>
  );
}
