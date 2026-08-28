"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LOGOUT_ITEM, NAV_BY_ROLE, NAV_SECTIONS, type NavItem } from "@/lib/nav";
import { navIcon } from "@/lib/icons";
import { useSession } from "@/lib/store/session";
import { useData } from "@/lib/store/data";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { PERMISSION_PAGES } from "@/lib/permissions";
import { useAccessRights } from "@/lib/usePermissions";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const school = useData((s) => s.school);

  const role = user?.role ?? "admin";
  const rights = useAccessRights();

  /**
   * CE QUE CE COMPTE VOIT DANS SA BARRE LATÉRALE.
   *
   * Un travailleur ne reçoit plus « le menu de la réception » : il reçoit les
   * écrans que l'administration a cochés pour lui, dans l'ordre du catalogue
   * (`PERMISSION_PAGES`), qui est celui de l'application entière. Tout le reste
   * — administration, entraîneur, chevalier, parent — garde son menu de rôle.
   *
   * Le quartier de chaque écran est repris du menu de l'administration, pour
   * qu'un travailleur retrouve les mêmes intertitres que tout le monde.
   *
   * La déconnexion est une action, pas un écran : elle reste toujours là.
   */
  const items = useMemo<NavItem[]>(() => {
    if (rights.unrestricted) return NAV_BY_ROLE[role];

    const allowed = PERMISSION_PAGES.filter((p) => rights.pages.includes(p.key)).map((p) => {
      const known = NAV_BY_ROLE.admin.find((i) => i.href === p.href);
      return known ?? { key: p.key, href: p.href, section: "order" };
    });
    return [...allowed, LOGOUT_ITEM];
  }, [rights, role]);

  /** Les écrans regroupés par quartier, les quartiers vides écartés. */
  const groups = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        section,
        items: items.filter((i) => (i.section ?? "order") === section),
      })).filter((g) => g.items.length > 0),
    [items],
  );

  const handleClick = (item: NavItem) => {
    if (item.action === "logout") {
      logout();
      router.push("/login");
    }
    onNavigate?.();
  };

  const renderItem = (item: NavItem) => {
    const active = item.action !== "logout" && isActive(pathname, item.href);
    const Icon = navIcon(item.key);

    const content = (
      <>
        {/* Le fanion doré de l'écran ouvert. `layoutId` le fait GLISSER d'une
            ligne à l'autre au lieu de disparaître puis réapparaître : le
            déplacement dit d'où l'on vient. */}
        {active && (
          <motion.span
            layoutId="sidebar-pennant"
            className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-accent"
            transition={{ type: "spring", stiffness: 480, damping: 38 }}
          />
        )}
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
            active ? "text-accent" : "text-sidebar-muted group-hover:text-accent-soft",
          )}
          strokeWidth={active ? 2.2 : 1.8}
          aria-hidden="true"
        />
        <span className="truncate">{t(`nav.${item.key}`)}</span>
      </>
    );

    const classes = cn(
      "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200",
      "cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
      active
        ? "sidebar-active-pill font-semibold text-sidebar-text"
        : "font-medium text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text",
    );

    if (item.action === "logout") {
      return (
        <button
          key={item.key}
          onClick={() => handleClick(item)}
          className={cn(
            classes,
            "w-full text-start text-danger/85 hover:bg-danger/10 hover:text-danger",
          )}
        >
          {content}
        </button>
      );
    }

    return (
      <Link
        key={item.key}
        href={item.href}
        onClick={() => handleClick(item)}
        aria-current={active ? "page" : undefined}
        className={classes}
      >
        {content}
      </Link>
    );
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-e border-sidebar-border bg-gradient-sidebar text-sidebar-text">
      {/* L'écusson du club */}
      <div className="flex items-center gap-3 border-b border-sidebar-border/70 px-5 py-5">
        {school.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={school.logo}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-accent/30"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-logo-bg ring-1 ring-accent/25">
            {/* Le blason à l'épée — le même dessin que l'icône de l'onglet. */}
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" aria-hidden="true">
              <path
                d="M12 2.6 19.4 5.2v6.1c0 4.3-3.2 7.4-7.4 8.8-4.2-1.4-7.4-4.5-7.4-8.8V5.2Z"
                fill="currentColor"
                opacity="0.22"
              />
              <path
                d="M12 2.6 19.4 5.2v6.1c0 4.3-3.2 7.4-7.4 8.8-4.2-1.4-7.4-4.5-7.4-8.8V5.2Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M12 6.4v10.2M9.4 10.4h5.2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <p className="font-display truncate text-sm font-bold text-sidebar-text">
            {school.name || t("common.appName")}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent/80">
            {t(`roles.${role}`)}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group, gi) => (
          <div key={group.section} className={cn(gi > 0 && "mt-5")}>
            {/* Le quartier n'est titré que s'il en reste plus d'un : un
                travailleur à qui l'on n'a ouvert que deux écrans n'a pas
                besoin qu'on lui range deux lignes. */}
            {groups.length > 1 && (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-muted/55">
                {t(`navSection.${group.section}`)}
              </p>
            )}
            <div className="space-y-0.5">{group.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
