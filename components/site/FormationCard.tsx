"use client";

/**
 * LA CARTE D'UNE FORMATION, SUR LE SITE.
 *
 * Elle doit répondre en un regard aux quatre questions qu'un visiteur se pose
 * avant de cliquer : QUOI, QUAND, AVEC QUI, COMBIEN. Tout le reste — le détail
 * des journées, le parcours de l'encadrant, les autres photographies — attend
 * la page du détail, où l'on n'arrive que si les quatre réponses ont convaincu.
 *
 * L'image se rapproche au survol, la carte se soulève : c'est ce qui dit qu'on
 * peut cliquer, sans avoir à écrire « cliquez ici ».
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CalendarRange, Clock, Layers, UserRound } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import { formatDA } from "@/lib/utils";
import { todayIso } from "@/lib/helpers";
import {
  formationDays,
  formationStatus,
  hoursLabel,
  periodLabel,
} from "@/lib/site/formations";
import { formationPath } from "@/lib/site/public";
import type { Formation } from "@/lib/types";

const STATUS_STYLE = {
  upcoming: "bg-primary text-white",
  running: "bg-success text-white",
  past: "bg-muted/25 text-muted",
} as const;

const STATUS_LABEL = {
  upcoming: "À venir",
  running: "En cours",
  past: "Terminée",
} as const;

export function FormationCard({ formation, index = 0 }: { formation: Formation; index?: number }) {
  const { tr, language } = useT();
  const status = formationStatus(formation, todayIso());
  const days = formationDays(formation);

  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay: Math.min(index * 0.06, 0.4), duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="group overflow-hidden rounded-3xl border border-line bg-surface card-shadow transition-shadow hover:card-shadow-lg"
    >
      <Link href={formationPath(formation.id)} className="block">
        <div className="relative h-48 overflow-hidden bg-primary-50">
          {formation.images[0] ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={formation.images[0]}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-50 to-accent-wash">
              <svg viewBox="0 0 24 24" className="h-14 w-14 text-accent opacity-40" aria-hidden="true">
                <path
                  d="M12 2.6 19.4 5.2v6.1c0 4.3-3.2 7.4-7.4 8.8-4.2-1.4-7.4-4.5-7.4-8.8V5.2Z"
                  fill="currentColor"
                  opacity="0.35"
                />
                <path d="M12 6.4v10.2M9.4 10.4h5.2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />

          <span
            className={`absolute end-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLE[status]}`}
          >
            {tr(STATUS_LABEL[status])}
          </span>
          <span className="absolute start-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-[#241a05]">
            {tr(formation.kind === "event" ? "Évènement" : "Formation")}
          </span>

          <p className="absolute inset-x-4 bottom-3 truncate font-display text-lg font-bold text-white drop-shadow">
            {formation.name}
          </p>
        </div>

        <div className="space-y-3 p-5">
          <p className="line-clamp-2 min-h-10 text-[13px] leading-relaxed text-muted">
            {formation.description || tr("Le détail de cette formation vous attend.")}
          </p>

          <div className="space-y-1.5 text-[11px] text-muted">
            <span className="flex items-center gap-2">
              <CalendarRange className="h-3.5 w-3.5 shrink-0 text-accent-ink" />
              {periodLabel(formation, language)}
            </span>
            {hoursLabel(formation) && (
              <span className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-accent-ink" />
                {hoursLabel(formation)}
              </span>
            )}
            <span className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 shrink-0 text-accent-ink" />
              {days.length} {tr("journée(s)")}
              {formation.seances > 0 && ` · ${formation.seances} ${tr("séance(s)")}`}
            </span>
            {formation.trainerName && (
              <span className="flex items-center gap-2">
                <UserRound className="h-3.5 w-3.5 shrink-0 text-accent-ink" />
                {formation.trainerName}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="font-display text-lg font-bold text-accent-ink">
              {formation.price > 0 ? formatDA(formation.price, language) : tr("Gratuit")}
            </span>
            <span className="flex items-center gap-1.5 text-[12px] font-bold text-primary">
              {tr("Voir le détail")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
