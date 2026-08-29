"use client";

/**
 * LA COQUILLE DU SITE PUBLIC — l'en-tête, le pied de page, et rien d'autre.
 *
 * Elle n'a AUCUN rapport avec `AppShell` : pas de session à attendre, pas de
 * droits à lire, pas de barre latérale. Un visiteur arrive, la page s'affiche.
 * C'est la seule exigence, et elle commande tout le reste.
 *
 * LA LANGUE. Le site s'ouvre EN ARABE — c'est celle du club et de ses familles
 * — et le français reste à un clic. Le choix passe par le même magasin que
 * l'application (`useSettings`, rangé dans le navigateur) : quelqu'un qui a
 * déjà mis l'application en français retrouve le site en français, et la
 * direction d'écriture suit sans qu'on ait à y penser, le script anti-flash de
 * `app/layout.tsx` lisant la même clé avant le premier rendu.
 *
 * LE FAVICON vient de la vitrine (`school.siteFavicon`) : il est posé sur le
 * document une fois la fiche du club lue. Le titre de l'onglet aussi — le nom
 * du club vaut mieux que celui de l'application.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LogIn, Menu, Phone, X } from "lucide-react";
import { ThemeToggle } from "@/components/controls/ThemeToggle";
import { LanguageSwitcher } from "@/components/controls/LanguageSwitcher";
import { SiteFooter } from "@/components/site/SiteFooter";
import { useSite } from "@/lib/store/site";
import { useT } from "@/lib/i18n/useT";

const LINKS = [
  { href: "/site", label: "Accueil" },
  { href: "/site/formations", label: "Formations & évènements" },
  { href: "/site/contact", label: "Nous contacter" },
];

/** Le blason, quand le club n'a pas déposé de logo. */
function Crest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.6 19.4 5.2v6.1c0 4.3-3.2 7.4-7.4 8.8-4.2-1.4-7.4-4.5-7.4-8.8V5.2Z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M12 2.6 19.4 5.2v6.1c0 4.3-3.2 7.4-7.4 8.8-4.2-1.4-7.4-4.5-7.4-8.8V5.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 6.4v10.2M9.4 10.4h5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { tr } = useT();
  const pathname = usePathname();
  const school = useSite((s) => s.school);
  const load = useSite((s) => s.load);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  /** Le titre de l'onglet et son icône, tirés de la vitrine du club. */
  useEffect(() => {
    if (!school?.name) return;
    document.title = school.name;

    const icon = school.siteFavicon || school.logo;
    if (!icon) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = icon;
  }, [school?.name, school?.siteFavicon, school?.logo]);

  const isActive = (href: string) =>
    href === "/site" ? pathname === "/site" : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
          <Link href="/site" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-50 ring-1 ring-accent/25">
              {school.logo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={school.logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <Crest className="h-5 w-5 text-accent-ink" />
              )}
            </span>
            <span className="font-display truncate text-base font-bold text-ink">
              {school.name}
            </span>
          </Link>

          <nav className="ms-auto hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(l.href) ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {tr(l.label)}
                {isActive(l.href) && (
                  <motion.span
                    layoutId="site-nav-underline"
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-1.5 md:ms-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden items-center gap-1.5 rounded-xl bg-gradient-primary px-3.5 py-2 text-sm font-semibold text-white transition-[filter] hover:brightness-115 sm:inline-flex"
            >
              <LogIn className="h-4 w-4" /> {tr("Espace membre")}
            </Link>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={tr(open ? "Fermer le menu" : "Ouvrir le menu")}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors hover:bg-primary-50 md:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Le menu du téléphone — déroulé sous l'en-tête, jamais par-dessus. */}
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden border-t border-line md:hidden"
          >
            <div className="space-y-1 p-3">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive(l.href)
                      ? "bg-gradient-primary text-white"
                      : "text-ink hover:bg-primary-50"
                  }`}
                >
                  {tr(l.label)}
                </Link>
              ))}
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
              >
                <LogIn className="h-4 w-4" /> {tr("Espace membre")}
              </Link>
              {school.sitePhone && (
                <a
                  href={`tel:${school.sitePhone.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
                >
                  <Phone className="h-4 w-4" /> {school.sitePhone}
                </a>
              )}
            </div>
          </motion.nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}
