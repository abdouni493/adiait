"use client";

/**
 * LE DÉTAIL D'UNE FORMATION — la page où l'on décide de s'inscrire.
 *
 * C'est aussi la page que le lien copié depuis la gestion ouvre. On peut donc y
 * ARRIVER DIRECTEMENT, sans être passé par la liste : la formation est alors
 * lue seule, par son identifiant. Une adresse qui ne mène à rien — formation
 * supprimée, ou retirée du site — le dit clairement et renvoie vers la liste,
 * plutôt que d'afficher une page vide.
 *
 * LE BOUTON D'INSCRIPTION SUIT LE LECTEUR : il est en tête, il est en bas, et
 * sur un téléphone il reste collé au bord de l'écran. Une page de vente dont
 * l'action se trouve à un seul endroit oblige à remonter, et l'on ne remonte
 * pas toujours.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CalendarRange,
  CircleAlert,
  Clock,
  Layers,
  UserRound,
} from "lucide-react";
import { SubscribeModal } from "@/components/site/SubscribeModal";
import { useSite } from "@/lib/store/site";
import { useT } from "@/lib/i18n/useT";
import { todayIso } from "@/lib/helpers";
import { formatDA } from "@/lib/utils";
import {
  formationDays,
  formationStatus,
  hoursLabel,
  longDate,
  longMonth,
  periodLabel,
} from "@/lib/site/formations";
import type { Formation } from "@/lib/types";

/**
 * LE BOUTON D'INSCRIPTION — déclaré ICI, hors du rendu.
 *
 * Il apparaît trois fois sur la page : sous le titre, dans la colonne de
 * droite, et collé au bas de l'écran sur un téléphone. Le définir à l'intérieur
 * du composant en ferait un composant NEUF à chaque rendu — React démonterait
 * puis remonterait les trois à chaque frappe, et le clic se perdrait au pire
 * moment.
 */
function SubscribeButton({
  closed,
  onClick,
  className = "",
}: {
  closed: boolean;
  onClick: () => void;
  className?: string;
}) {
  const { tr } = useT();
  return (
    <button
      type="button"
      disabled={closed}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-accent px-6 py-3.5 text-base font-bold text-[#241a05] shadow-lg transition-[filter,transform] hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${className}`}
    >
      {tr(closed ? "Inscriptions closes" : "Je m'inscris")}
    </button>
  );
}

export function SiteFormationDetail({ id }: { id: string }) {
  const { tr, language } = useT();
  const fetchFormation = useSite((s) => s.fetchFormation);
  const known = useSite((s) => s.formations.find((f) => f.id === id));

  const [formation, setFormation] = useState<Formation | null>(known ?? null);
  const [missing, setMissing] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [shot, setShot] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await fetchFormation(id);
      if (cancelled) return;
      setFormation(found);
      setMissing(!found);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, fetchFormation]);

  if (missing && !formation) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center md:px-6">
        <CircleAlert className="h-10 w-10 text-warning" strokeWidth={1.4} />
        <h1 className="font-display text-2xl font-bold text-ink">
          {tr("Cette formation n'est plus affichée")}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          {tr("Elle a été retirée du site, ou le lien est incomplet. Nos autres formations vous attendent.")}
        </p>
        <Link
          href="/site/formations"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-bold text-white"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("Voir toutes les formations")}
        </Link>
      </div>
    );
  }

  if (!formation) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-24 text-center md:px-6">
        <p className="text-sm text-muted">{tr("Chargement…")}</p>
      </div>
    );
  }

  const status = formationStatus(formation, todayIso());
  const days = formationDays(formation);
  const closed = status === "past";

  /** Les journées rangées par mois — c'est ainsi qu'on lit un calendrier. */
  const byMonth = new Map<string, string[]>();
  for (const key of days) {
    const month = key.slice(0, 7);
    const list = byMonth.get(month);
    if (list) list.push(key);
    else byMonth.set(month, [key]);
  }

  const facts = [
    { icon: CalendarRange, label: "Période", value: periodLabel(formation, language) },
    { icon: Clock, label: "Horaires", value: hoursLabel(formation) || tr("À préciser") },
    { icon: CalendarDays, label: "Journées", value: `${days.length}` },
    {
      icon: Layers,
      label: "Séances",
      value: formation.seances > 0 ? `${formation.seances}` : tr("À préciser"),
    },
  ];

  return (
    <div>
      {/* ---- LE FRONTON DE LA FORMATION ------------------------------- */}
      <section className="relative isolate overflow-hidden">
        {formation.images[shot] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={formation.images[shot]}
            alt=""
            className="absolute inset-0 -z-20 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 -z-20 bg-gradient-primary" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/65 via-black/55 to-black/85" />

        <div className="mx-auto w-full max-w-5xl px-4 py-16 md:px-6 md:py-20">
          <Link
            href="/site/formations"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/70 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {tr("Toutes les formations")}
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5"
          >
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold text-[#241a05]">
                {tr(formation.kind === "event" ? "Évènement" : "Formation")}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold text-white ${
                  status === "running"
                    ? "bg-success"
                    : status === "upcoming"
                      ? "bg-primary"
                      : "bg-white/25"
                }`}
              >
                {tr(
                  status === "running"
                    ? "En cours"
                    : status === "upcoming"
                      ? "À venir"
                      : "Terminée",
                )}
              </span>
            </div>

            <h1 className="font-display mt-4 text-3xl font-extrabold leading-tight text-white drop-shadow-lg md:text-5xl">
              {formation.name}
            </h1>

            <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
              <span className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4" /> {periodLabel(formation, language)}
              </span>
              {formation.trainerName && (
                <span className="flex items-center gap-2">
                  <UserRound className="h-4 w-4" /> {formation.trainerName}
                </span>
              )}
              <span className="flex items-center gap-2 font-bold text-[#e8cb86]">
                <Banknote className="h-4 w-4" />
                {formation.price > 0 ? formatDA(formation.price, language) : tr("Gratuit")}
              </span>
            </p>

            <div className="mt-7">
              <SubscribeButton closed={closed} onClick={() => setSubscribing(true)} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---- LES AUTRES PHOTOGRAPHIES --------------------------------- */}
      {formation.images.length > 1 && (
        <div className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-5xl gap-2 overflow-x-auto px-4 py-3 md:px-6">
            {formation.images.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setShot(i)}
                aria-label={`${tr("Image")} ${i + 1}`}
                className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                  i === shot ? "border-accent" : "border-transparent hover:border-line"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- LE CORPS -------------------------------------------------- */}
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-14 md:grid-cols-3 md:px-6">
        <div className="space-y-10 md:col-span-2">
          {formation.description && (
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45 }}
            >
              <h2 className="font-display text-xl font-bold text-ink">{tr("Le programme")}</h2>
              <p className="mt-3 whitespace-pre-line text-[15px] leading-loose text-muted">
                {formation.description}
              </p>
            </motion.section>
          )}

          {/* ---- LE CALENDRIER ---- */}
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45 }}
          >
            <h2 className="font-display text-xl font-bold text-ink">{tr("Les journées")}</h2>
            <div className="mt-4 space-y-4">
              {[...byMonth.entries()].map(([month, list]) => (
                <div key={month}>
                  <p className="mb-2 text-xs font-bold capitalize text-accent-ink">
                    {longMonth(month, language)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((key) => (
                      <span
                        key={key}
                        title={longDate(key, language)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-sm font-bold tabular-nums text-ink"
                      >
                        {Number(key.slice(8, 10))}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ---- L'ENCADRANT ---- */}
          {(formation.trainerName || formation.trainerNote) && (
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45 }}
              className="rounded-3xl border border-accent/30 bg-accent-wash/50 p-6"
            >
              <h2 className="font-display flex items-center gap-2 text-xl font-bold text-ink">
                <UserRound className="h-5 w-5 text-accent-ink" /> {tr("L'encadrant")}
              </h2>
              {formation.trainerName && (
                <p className="mt-2 text-base font-bold text-ink">{formation.trainerName}</p>
              )}
              {formation.trainerNote && (
                <p className="mt-2 whitespace-pre-line text-[14px] leading-loose text-muted">
                  {formation.trainerNote}
                </p>
              )}
            </motion.section>
          )}
        </div>

        {/* ---- LA COLONNE DE DROITE : LES FAITS, ET L'ACTION ---- */}
        <aside className="md:sticky md:top-24 md:h-fit">
          <div className="space-y-4 rounded-3xl border border-line bg-surface p-6 card-shadow">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                {tr("Prix")}
              </span>
              <p className="font-display text-3xl font-extrabold text-accent-ink">
                {formation.price > 0 ? formatDA(formation.price, language) : tr("Gratuit")}
              </p>
            </div>

            <div className="space-y-2.5 border-t border-line pt-4">
              {facts.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wider text-muted">
                      {tr(label)}
                    </span>
                    <strong className="block text-[13px] text-ink">{value}</strong>
                  </span>
                </div>
              ))}
            </div>

            <SubscribeButton
              closed={closed}
              onClick={() => setSubscribing(true)}
              className="w-full"
            />

            <p className="text-[11px] leading-relaxed text-muted">
              {tr("Aucun paiement en ligne. Votre demande part au club, qui la vérifie et vous rappelle ; vous réglerez sur place.")}
            </p>
          </div>
        </aside>
      </div>

      {/* ---- SUR UN TÉLÉPHONE, L'ACTION RESTE SOUS LE POUCE ----------- */}
      <div className="sticky bottom-0 z-30 border-t border-line bg-surface/95 p-3 backdrop-blur md:hidden">
        <SubscribeButton
          closed={closed}
          onClick={() => setSubscribing(true)}
          className="w-full"
        />
      </div>

      {subscribing && (
        <SubscribeModal formation={formation} onClose={() => setSubscribing(false)} />
      )}
    </div>
  );
}
