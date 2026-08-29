"use client";

/**
 * « NOUS CONTACTER » — les coordonnées du club, en grand.
 *
 * Le pied de page les porte déjà, en petit et sur toutes les pages. Cette
 * page-ci existe pour celui qui les CHERCHE : les numéros s'y appellent d'un
 * doigt, le plan s'y ouvre d'un clic, et chaque réseau a sa tuile.
 *
 * TOUT VIENT DE « SITE WEB › COORDONNÉES », et rien n'est écrit en dur. Un
 * champ vide n'affiche rien du tout — jamais un lien mort, jamais une icône
 * grise qui ne mène nulle part. Un club qui n'a encore rien réglé voit donc une
 * page qui le dit, plutôt qu'une page cassée.
 */

import { motion } from "framer-motion";
import { MapPin, Phone } from "lucide-react";
import { useSite } from "@/lib/store/site";
import { useT } from "@/lib/i18n/useT";
import { socialLinksOf } from "@/lib/site/contacts";

export function SiteContact() {
  const { tr } = useT();
  const school = useSite((s) => s.school);
  const loaded = useSite((s) => s.loaded);

  const socials = socialLinksOf(school);
  const phones = [school.sitePhone, school.sitePhone2].filter(Boolean) as string[];
  const nothing = socials.length === 0 && phones.length === 0 && !school.siteMapsUrl;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 md:px-6 md:py-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-ink">
          {tr("Le club")}
        </span>
        <h1 className="font-display mt-2 text-3xl font-extrabold text-ink md:text-4xl">
          {tr("Nous contacter")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          {tr("Une question sur une formation, un horaire, une inscription ? Appelez-nous, écrivez-nous, ou passez nous voir.")}
        </p>
      </motion.div>

      {nothing ? (
        <div className="mt-10 rounded-3xl border border-dashed border-line py-16 text-center">
          <p className="text-sm font-medium text-ink">
            {tr(loaded ? "Les coordonnées du club arrivent bientôt" : "Chargement…")}
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {/* ---- LES NUMÉROS ET LE PLAN ---- */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="space-y-3 rounded-3xl border border-line bg-surface p-6 card-shadow"
          >
            <h2 className="font-display text-lg font-bold text-ink">{tr("Nous joindre")}</h2>

            {phones.map((phone) => (
              <a
                key={phone}
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors hover:border-accent/50 hover:bg-primary-50/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-accent-ink">
                  <Phone className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider text-muted">
                    {tr("Téléphone")}
                  </span>
                  <strong className="block text-[15px] text-ink" dir="ltr">
                    {phone}
                  </strong>
                </span>
              </a>
            ))}

            {school.siteMapsUrl && (
              <a
                href={school.siteMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors hover:border-accent/50 hover:bg-primary-50/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-accent-ink">
                  <MapPin className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider text-muted">
                    {tr("Nous trouver")}
                  </span>
                  <strong className="block text-[15px] text-ink">
                    {school.address || tr("Ouvrir le plan")}
                  </strong>
                </span>
              </a>
            )}
          </motion.div>

          {/* ---- LES RÉSEAUX ---- */}
          {socials.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08, duration: 0.45 }}
              className="rounded-3xl border border-line bg-surface p-6 card-shadow"
            >
              <h2 className="font-display text-lg font-bold text-ink">{tr("Nous suivre")}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {tr("Les photographies des entraînements, les annonces et les résultats des tournois.")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {socials.map(({ key, href, label, Mark }) => (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-2xl border border-line p-3 text-sm font-semibold text-ink transition-colors hover:border-accent/50 hover:bg-primary-50/50"
                  >
                    <Mark className="h-5 w-5 shrink-0 text-accent-ink" />
                    {label}
                  </a>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
