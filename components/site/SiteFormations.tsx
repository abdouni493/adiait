"use client";

/**
 * TOUTES LES FORMATIONS ET LES ÉVÈNEMENTS DU CLUB.
 *
 * Le tri par défaut met EN TÊTE ce qui n'est pas encore passé : un visiteur
 * vient chercher ce à quoi il peut s'inscrire, pas l'archive de l'an dernier.
 * Les formations terminées ne disparaissent pas pour autant — elles disent ce
 * que le club fait vraiment — mais elles ferment la marche.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarSearch, Search } from "lucide-react";
import { FormationCard } from "@/components/site/FormationCard";
import { Input } from "@/components/ui/SearchInput";
import { useSite } from "@/lib/store/site";
import { useT } from "@/lib/i18n/useT";
import { todayIso } from "@/lib/helpers";
import { formationStatus } from "@/lib/site/formations";

type Filter = "all" | "formation" | "event";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "formation", label: "Formations" },
  { id: "event", label: "Évènements" },
];

export function SiteFormations() {
  const { tr } = useT();
  const formations = useSite((s) => s.formations);
  const loaded = useSite((s) => s.loaded);

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const today = todayIso();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    /** 0 = ouvert (à venir ou en cours), 1 = terminé. */
    const rank = (id: string) => (id === "past" ? 1 : 0);
    return formations
      .filter((f) => filter === "all" || f.kind === filter)
      .filter((f) =>
        !q
          ? true
          : `${f.name} ${f.description} ${f.trainerName ?? ""}`.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const ra = rank(formationStatus(a, today));
        const rb = rank(formationStatus(b, today));
        if (ra !== rb) return ra - rb;
        // Les ouvertes par date de début croissante (la plus proche d'abord),
        // les passées par date décroissante (la plus récente d'abord).
        return ra === 0
          ? (a.startDate ?? "").localeCompare(b.startDate ?? "")
          : (b.startDate ?? "").localeCompare(a.startDate ?? "");
      });
  }, [formations, filter, search, today]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-ink">
          {tr("La vitrine")}
        </span>
        <h1 className="font-display mt-2 text-3xl font-extrabold text-ink md:text-4xl">
          {tr("Formations & évènements")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          {tr("Choisissez ce qui vous convient, lisez le détail — les journées, l'encadrant, le prix — et inscrivez-vous en quelques minutes. Aucun paiement en ligne : vous réglerez sur place.")}
        </p>
      </motion.div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`relative rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                filter === f.id ? "text-white" : "text-muted hover:text-ink"
              }`}
            >
              {filter === f.id && (
                <motion.span
                  layoutId="site-filter"
                  className="absolute inset-0 -z-10 rounded-lg bg-gradient-primary"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              {tr(f.label)}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chercher une formation, un encadrant…"
            className="h-11 ps-9"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line py-20 text-center">
          <CalendarSearch className="h-9 w-9 text-accent-ink opacity-50" strokeWidth={1.4} />
          <p className="text-sm font-medium text-ink">
            {tr(loaded ? "Rien à afficher pour l'instant" : "Chargement…")}
          </p>
          {loaded && (
            <p className="max-w-md text-xs leading-relaxed text-muted">
              {tr("Aucune formation ne correspond à votre recherche. Revenez bientôt : le club en publie régulièrement.")}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((f, i) => (
            <FormationCard key={f.id} formation={f} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
