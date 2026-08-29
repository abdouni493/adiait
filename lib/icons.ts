import {
  Award,
  BarChart3,
  Banknote,
  Bell,
  Briefcase,
  CalendarDays,
  CreditCard,
  Flag,
  Globe,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MailOpen,
  Receipt,
  Settings,
  Shield,
  Swords,
  Ticket,
  User,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * L'ICÔNE DE CHAQUE ÉCRAN, EN UN SEUL ENDROIT.
 *
 * La barre latérale, l'en-tête d'écran et l'écran générique tiraient chacun
 * un émoji de leur côté. Un émoji n'est pas une icône : il change de dessin
 * d'un système à l'autre, ne prend pas la couleur du thème et ne s'aligne sur
 * rien. Le blason de l'Ordre demande un trait unique — c'est ce registre.
 *
 * Une clé absente retombe sur le blason : un écran ajouté demain s'affiche,
 * il n'a simplement pas encore reçu son emblème.
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  // — L'Ordre —
  dashboard: LayoutDashboard,
  classes: Shield,
  planner: CalendarDays,
  subscriptions: Ticket,

  // — La Compagnie —
  students: Swords,
  attendance: UserCheck,
  teachers: Award,
  parents: Users,
  workers: Briefcase,
  administration: Briefcase,
  independent: Flag,

  // — L'Intendance —
  announcements: Megaphone,
  expenses: Receipt,
  analytics: BarChart3,
  cash: Banknote,
  reports: Wallet,

  // — La Herse : ce qui donne sur le dehors —
  website: Globe,
  "website-inscriptions": MailOpen,

  // — Le Château —
  settings: Settings,
  logout: LogOut,

  // — Les portails (chevalier, entraîneur, parent) —
  home: Home,
  schedule: CalendarDays,
  payments: CreditCard,
  profile: User,
  account: User,
  salary: Banknote,
  myClasses: Shield,
  myChildren: Swords,
  notifications: Bell,
};

export function navIcon(key: string): LucideIcon {
  return NAV_ICONS[key] ?? Shield;
}

export type { LucideIcon };
