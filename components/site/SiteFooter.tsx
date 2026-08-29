"use client";

/**
 * LE PIED DE PAGE DU SITE — les coordonnées, partout, tout le temps.
 *
 * Un visiteur qui vient de lire une formation veut appeler. Le faire remonter
 * jusqu'au menu pour trouver « Nous contacter » est un pas de trop : les liens
 * et les numéros sont donc sous chaque page, et ils sont les MÊMES que ceux de
 * la page de contact, réglés au même endroit (l'écran « Site web »).
 *
 * UN CHAMP VIDE N'AFFICHE RIEN. Pas de liseré gris, pas d'icône morte : le club
 * qui n'a pas de TikTok n'a pas de bouton TikTok. C'est la règle de toute la
 * vitrine.
 */

import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import { useSite } from "@/lib/store/site";
import { useT } from "@/lib/i18n/useT";
import { socialLinksOf } from "@/lib/site/contacts";

export function SiteFooter() {
  const { tr } = useT();
  const school = useSite((s) => s.school);
  const socials = socialLinksOf(school);

  const phones = [school.sitePhone, school.sitePhone2].filter(Boolean) as string[];

  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 md:grid-cols-3 md:px-6">
        <div>
          <p className="font-display text-base font-bold text-ink">{school.name}</p>
          {school.siteDescription && (
            <p className="mt-2 text-xs leading-relaxed text-muted">{school.siteDescription}</p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-ink">
            {tr("Nous joindre")}
          </p>
          <div className="mt-2 space-y-1.5">
            {phones.map((phone) => (
              <a
                key={phone}
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
              >
                <Phone className="h-3.5 w-3.5" /> {phone}
              </a>
            ))}
            {school.siteMapsUrl && (
              <a
                href={school.siteMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
              >
                <MapPin className="h-3.5 w-3.5" /> {tr("Nous trouver")}
              </a>
            )}
            {school.address && <p className="text-xs text-muted">{school.address}</p>}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-ink">
            {tr("Nous suivre")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {socials.map(({ key, href, label, Mark }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={label}
                aria-label={label}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:border-accent/50 hover:text-accent-ink"
              >
                <Mark className="h-4 w-4" />
              </a>
            ))}
            {socials.length === 0 && (
              <p className="text-xs text-muted">{tr("Bientôt sur les réseaux.")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-muted md:px-6">
          <span>
            © {new Date().getFullYear()} {school.name}
          </span>
          <Link href="/login" className="transition-colors hover:text-ink">
            {tr("Espace membre")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
