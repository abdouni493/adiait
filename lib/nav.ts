import type { Role } from "@/lib/store/session";
import { PERMISSION_PAGES, canSeePage, type AccessRights } from "@/lib/permissions";

export interface NavItem {
  /** i18n key under `nav.*` */
  key: string;
  href: string;
  /**
   * LE QUARTIER DU MENU auquel l'écran appartient — clé i18n sous
   * `navSection.*`. La barre latérale s'en sert pour poser un intertitre :
   * dix-sept écrans à la file se lisent mal, quatre groupes de quatre se
   * balaient d'un regard.
   */
  section?: string;
  /** logout is an action, not a route */
  action?: "logout";
}

/** La déconnexion : une action, pas un écran. Elle est toujours affichée. */
export const LOGOUT_ITEM: NavItem = {
  key: "logout",
  href: "/login",
  section: "keep",
  action: "logout",
};

const logout = LOGOUT_ITEM;

/** Landing route after login, per role. */
export function roleHome(role: Role): string {
  return role === "student" || role === "parent" ? "/home" : "/dashboard";
}

/**
 * OÙ ATTERRIT-ON APRÈS S'ÊTRE CONNECTÉ ?
 *
 * Sur le tableau de bord, sauf pour un travailleur à qui on ne l'a pas ouvert :
 * il arriverait alors sur un écran qu'il n'a pas le droit de lire. On l'emmène
 * au premier écran de SA barre latérale — et à la page de connexion s'il n'en a
 * aucun, ce qui est le seul cas où il n'a rien à faire dans l'application.
 */
export function landingRoute(role: Role, rights: AccessRights): string {
  const home = roleHome(role);
  if (canSeePage(rights, home.replace(/^\//, ""))) return home;

  const first = PERMISSION_PAGES.find((p) => rights.pages.includes(p.key));
  return first?.href ?? home;
}

/** Resolve a route href to its nav metadata (i18n key + section), looking
 *  across every role's menu. Used by the generic module placeholder. */
export function navMetaForHref(href: string): { key: string } | null {
  for (const items of Object.values(NAV_BY_ROLE)) {
    const match = items.find((i) => i.href === href && i.action !== "logout");
    if (match) return { key: match.key };
  }
  return null;
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    { key: "dashboard", href: "/dashboard", section: "order" },
    { key: "semesters", href: "/semesters", section: "order" },
    { key: "classes", href: "/classes", section: "order" },
    { key: "planner", href: "/planner", section: "order" },

    { key: "students", href: "/students", section: "company" },
    { key: "attendance", href: "/attendance", section: "company" },
    { key: "teachers", href: "/teachers", section: "company" },
    { key: "parents", href: "/parents", section: "company" },
    { key: "workers", href: "/workers", section: "company" },
    { key: "independent", href: "/independent", section: "company" },

    { key: "horses", href: "/horses", section: "stable" },
    { key: "stable", href: "/stable", section: "stable" },
    { key: "stable-reports", href: "/stable-reports", section: "stable" },

    { key: "announcements", href: "/announcements", section: "stewardship" },
    { key: "other-debts", href: "/other-debts", section: "stewardship" },
    { key: "expenses", href: "/expenses", section: "stewardship" },
    { key: "analytics", href: "/analytics", section: "stewardship" },
    { key: "cash-secondary", href: "/cash-secondary", section: "stewardship" },
    { key: "cash", href: "/cash", section: "stewardship" },
    { key: "reports", href: "/reports", section: "stewardship" },

    { key: "website", href: "/website", section: "gate" },
    { key: "website-inscriptions", href: "/website-inscriptions", section: "gate" },

    { key: "settings", href: "/settings", section: "keep" },
    logout,
  ],
  reception: [
    { key: "dashboard", href: "/dashboard", section: "order" },
    { key: "semesters", href: "/semesters", section: "order" },
    { key: "classes", href: "/classes", section: "order" },
    { key: "planner", href: "/planner", section: "order" },

    { key: "students", href: "/students", section: "company" },
    { key: "attendance", href: "/attendance", section: "company" },
    { key: "parents", href: "/parents", section: "company" },
    { key: "independent", href: "/independent", section: "company" },

    { key: "horses", href: "/horses", section: "stable" },
    { key: "stable", href: "/stable", section: "stable" },
    { key: "stable-reports", href: "/stable-reports", section: "stable" },

    { key: "announcements", href: "/announcements", section: "stewardship" },
    { key: "other-debts", href: "/other-debts", section: "stewardship" },
    { key: "expenses", href: "/expenses", section: "stewardship" },
    { key: "cash-secondary", href: "/cash-secondary", section: "stewardship" },

    { key: "website", href: "/website", section: "gate" },
    { key: "website-inscriptions", href: "/website-inscriptions", section: "gate" },

    { key: "settings", href: "/settings", section: "keep" },
    logout,
  ],
  student: [
    { key: "home", href: "/home", section: "order" },
    { key: "schedule", href: "/schedule", section: "order" },
    { key: "attendance", href: "/attendance", section: "order" },
    { key: "payments", href: "/payments", section: "stewardship" },
    { key: "announcements", href: "/announcements", section: "stewardship" },
    { key: "profile", href: "/profile", section: "keep" },
    logout,
  ],
  teacher: [
    { key: "dashboard", href: "/dashboard", section: "order" },
    { key: "schedule", href: "/schedule", section: "order" },
    { key: "attendance", href: "/attendance", section: "order" },
    { key: "myClasses", href: "/my-classes", section: "company" },
    { key: "salary", href: "/salary", section: "stewardship" },
    { key: "announcements", href: "/announcements", section: "stewardship" },
    { key: "profile", href: "/profile", section: "keep" },
    logout,
  ],
  parent: [
    { key: "home", href: "/home", section: "order" },
    { key: "myChildren", href: "/my-children", section: "company" },
    { key: "schedule", href: "/schedule", section: "order" },
    { key: "payments", href: "/payments", section: "stewardship" },
    { key: "notifications", href: "/notifications", section: "stewardship" },
    { key: "announcements", href: "/announcements", section: "stewardship" },
    { key: "account", href: "/account", section: "keep" },
    logout,
  ],
};

/**
 * L'ordre dans lequel les quartiers du menu se suivent.
 *
 * `stable` — L'ÉCURIE — est le quartier des chevaux : ce que le club achète et
 * revend, les bêtes qu'il héberge, et ce que leur entretien coûte. Il se tient
 * entre la compagnie, qui compte les gens, et l'intendance, qui compte
 * l'argent : un cheval est exactement entre les deux.
 *
 * `gate` — LA HERSE — est le quartier qui donne sur le dehors : la vitrine du
 * club et ce qu'elle rapporte. Il se tient entre l'intendance, qui regarde
 * l'intérieur, et le donjon, qui ne regarde que soi.
 */
export const NAV_SECTIONS = [
  "order",
  "company",
  "stable",
  "stewardship",
  "gate",
  "keep",
] as const;
