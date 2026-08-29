"use client";

/**
 * LA PAGE D'ACCUEIL DU SITE.
 *
 * Elle raconte le club dans l'ordre où l'on décide de s'y inscrire :
 *
 *   1. LE FRONTON  — la photographie, le nom, la présentation courte, et les
 *                    deux boutons qui mènent quelque part ;
 *   2. LES CHIFFRES— ce que le club tient en ce moment, pris sur les
 *                    formations elles-mêmes : rien n'est écrit à la main, donc
 *                    rien ne peut mentir ;
 *   3. LE RÉCIT    — la seconde présentation, plus longue, celle qu'on lit
 *                    quand on a déjà envie ;
 *   4. LA VIDÉO    — quand le club en a mis une ;
 *   5. LES DERNIÈRES FORMATIONS — trois cartes, et un lien vers toutes.
 *
 * LES ANIMATIONS SE DÉCLENCHENT À L'ARRIVÉE DU BLOC (`whileInView`, une seule
 * fois) et non au chargement : sur un téléphone, tout animer d'un coup fait
 * sauter la page et ne se voit pas. Le mouvement est neutralisé pour qui a
 * demandé à son système d'en avoir moins — `MotionConfig` s'en charge à la
 * racine, et la règle CSS globale couvre le reste.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Flame,
  PlayCircle,
  Trophy,
  Users,
} from "lucide-react";
import { FormationCard } from "@/components/site/FormationCard";
import { useSite } from "@/lib/store/site";
import { useT } from "@/lib/i18n/useT";
import { todayIso } from "@/lib/helpers";
import { formationStatus } from "@/lib/site/formations";
import { siteVideoOf } from "@/lib/site/contacts";

function Crest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.6 19.4 5.2v6.1c0 4.3-3.2 7.4-7.4 8.8-4.2-1.4-7.4-4.5-7.4-8.8V5.2Z"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="M12 2.6 19.4 5.2v6.1c0 4.3-3.2 7.4-7.4 8.8-4.2-1.4-7.4-4.5-7.4-8.8V5.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M12 6.4v10.2M9.4 10.4h5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SiteLanding() {
  const { tr } = useT();
  const school = useSite((s) => s.school);
  const formations = useSite((s) => s.formations);
  const loaded = useSite((s) => s.loaded);
  const [videoOpen, setVideoOpen] = useState(false);

  const today = todayIso();
  const live = useMemo(
    () => formations.filter((f) => formationStatus(f, today) !== "past"),
    [formations, today],
  );
  /** Les dernières publiées — trois suffisent à donner envie d'aller voir. */
  const latest = useMemo(
    () =>
      [...formations]
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, 3),
    [formations],
  );

  const video = siteVideoOf(school.siteVideoUrl);

  const stats = [
    { icon: CalendarDays, value: live.length, label: "Formations ouvertes" },
    { icon: Trophy, value: formations.length, label: "Formations & évènements" },
    {
      icon: Flame,
      value: formations.filter((f) => f.kind === "event").length,
      label: "Évènements",
    },
  ];

  return (
    <div>
      {/* ================= 1. LE FRONTON ================================ */}
      <section className="relative isolate flex min-h-[78vh] items-center overflow-hidden">
        {school.siteHeroImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={school.siteHeroImage}
            alt=""
            className="absolute inset-0 -z-20 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 -z-20 bg-gradient-primary" />
        )}
        {/* Les deux voiles qui rendent le texte lisible sur N'IMPORTE QUELLE
            photographie : un fondu vertical pour le contraste, un lavis d'acier
            pour la couleur. Sans eux, un club qui dépose une image claire
            perdrait son propre nom. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />

        <div className="mx-auto w-full max-w-6xl px-4 py-20 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-2xl"
          >
            <span className="mb-5 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/25 backdrop-blur">
              {school.logo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={school.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <Crest className="h-8 w-8 text-[#e8cb86]" />
              )}
            </span>

            <h1 className="font-display text-4xl font-extrabold leading-tight text-white drop-shadow-lg md:text-6xl">
              {school.name}
            </h1>

            {(school.siteDescription || school.description) && (
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.6 }}
                className="mt-5 max-w-xl whitespace-pre-line text-base leading-relaxed text-white/85 md:text-lg"
              >
                {school.siteDescription || school.description}
              </motion.p>
            )}

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.6 }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <Link
                href="/site/formations"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-accent px-6 py-3.5 text-base font-bold text-[#241a05] shadow-lg transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
              >
                {tr("Nos formations")}
                <ArrowRight className="h-5 w-5 rtl:rotate-180" />
              </Link>
              <Link
                href="/site/contact"
                className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-6 py-3.5 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                {tr("Nous contacter")}
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* Le repère qui dit « ça continue en dessous ». */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-x-0 bottom-6 flex justify-center"
        >
          <ChevronRight className="h-6 w-6 rotate-90 text-white/60" />
        </motion.div>
      </section>

      {/* ================= 2. LES CHIFFRES ============================== */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-3 gap-4 px-4 py-8 md:px-6">
          {stats.map(({ icon: Icon, value, label }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.45 }}
              className="text-center"
            >
              <Icon className="mx-auto h-5 w-5 text-accent-ink" strokeWidth={1.8} />
              <p className="font-display mt-1.5 text-2xl font-extrabold tabular-nums text-ink md:text-3xl">
                {value}
              </p>
              <p className="text-[11px] font-medium text-muted">{tr(label)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= 3. LE RÉCIT ================================== */}
      {(school.siteDescription2 || school.description) && (
        <section className="mx-auto w-full max-w-4xl px-4 py-16 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-ink">
              {tr("Le club")}
            </span>
            <h2 className="font-display mt-2 text-2xl font-bold text-ink md:text-3xl">
              {tr("Qui nous sommes")}
            </h2>
            <p className="mt-4 whitespace-pre-line text-[15px] leading-loose text-muted">
              {school.siteDescription2 || school.description}
            </p>
          </motion.div>
        </section>
      )}

      {/* ================= 4. LA VIDÉO ================================== */}
      {video && (
        <section className="mx-auto w-full max-w-5xl px-4 pb-16 md:px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden rounded-3xl border border-line bg-black card-shadow-lg"
          >
            <div className="relative aspect-video w-full">
              {video.kind === "file" ? (
                <video src={video.src} controls className="h-full w-full" />
              ) : videoOpen ? (
                <iframe
                  src={`${video.src}${video.src.includes("?") ? "&" : "?"}autoplay=1`}
                  title={school.name}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              ) : (
                /* LE CADRE N'EST CHARGÉ QU'AU CLIC. Une page d'accueil qui
                   embarque un lecteur vidéo dès son ouverture traîne trois
                   secondes de plus sur un téléphone, pour une vidéo que la
                   plupart des visiteurs ne lanceront jamais. */
                <button
                  type="button"
                  onClick={() => setVideoOpen(true)}
                  className="group flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-700 to-black"
                  aria-label={tr("Lancer la vidéo")}
                >
                  <span className="flex flex-col items-center gap-3 text-white/90">
                    <PlayCircle
                      className="h-16 w-16 transition-transform group-hover:scale-110 motion-reduce:group-hover:scale-100"
                      strokeWidth={1.3}
                    />
                    <span className="text-sm font-bold">{tr("Lancer la vidéo")}</span>
                  </span>
                </button>
              )}
            </div>
          </motion.div>
        </section>
      )}

      {/* ================= 5. LES DERNIÈRES FORMATIONS ================== */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-ink">
                {tr("La vitrine")}
              </span>
              <h2 className="font-display mt-2 text-2xl font-bold text-ink md:text-3xl">
                {tr("Dernières formations & évènements")}
              </h2>
            </div>
            <Link
              href="/site/formations"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary transition-colors hover:text-accent-ink"
            >
              {tr("Tout voir")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>

          {latest.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line py-16 text-center">
              <Users className="h-8 w-8 text-accent-ink opacity-50" strokeWidth={1.5} />
              <p className="text-sm font-medium text-ink">
                {tr(loaded ? "Aucune formation publiée pour l'instant" : "Chargement…")}
              </p>
              {loaded && (
                <p className="max-w-md text-xs leading-relaxed text-muted">
                  {tr("Revenez bientôt : les prochaines formations et les évènements du club seront annoncés ici.")}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {latest.map((f, i) => (
                <FormationCard key={f.id} formation={f} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
