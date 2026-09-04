"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useData } from "@/lib/store/data";
import { useSession } from "@/lib/store/session";
import { changeOwnPassword } from "@/lib/accounts/users";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { OwnerHorsesPanel } from "@/components/stable/OwnerHorsesPanel";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { CarteLedger, SlotLegend } from "@/components/portal/CarteLedger";
import { Modal } from "@/components/ui/Modal";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Banknote, Bell, BookOpen, Calendar, CalendarDays, CalendarX2, Check, Clock, DollarSign, Download, Eye, FileText, Home, MapPin, Megaphone, Search, Swords, Ticket, User, Users, Wallet, X } from "lucide-react";
import type {
  AttendanceRecord,
  Enrollment,
  Parent,
  Payment,
  ScheduleSession,
  Student,
  Subscription,
} from "@/lib/types";
import {
  carteShort,
  discountLabel,
  enrollmentExpiryStatus,
  enrollmentLabel,
  formatDateFr,
  remainingSeances,
  studentDebt,
  studentEnrollments,
  totalRemainingSeances,
} from "@/lib/helpers";
import { formatDA } from "@/lib/utils";

interface PageProps {
  slug: string;
}

/** Everything a parent view needs to talk about ONE child in séances. */
interface ChildSeanceInfo {
  enrollments: Enrollment[];
  remaining: number;
  debt: number;
  labelOf: (e: Enrollment) => string;
}

export function ParentPages({ slug }: PageProps) {
  const { user, updateUser } = useSession();
  const db = useData();
  const {
    parents,
    students,
    subscriptions,
    sessions,
    modules,
    classes,
    groups,
    announcements,
    notifications,
    attendance,
    updateItem,
  } = db;

  const parent = parents.find((p) => p.id === user?.entityId);

  if (!parent) {
    return (
      <div className="p-8 text-center text-xs">
        <AlertTriangle className="h-8 w-8 text-danger mx-auto mb-2" />
        <h3 className="font-bold text-ink">Erreur de Profil</h3>
        <p className="text-muted mt-1">Impossible de charger le profil parent. Veuillez vous reconnecter.</p>
      </div>
    );
  }

  // Children list
  const myChildren = students.filter((s) => parent.childIds.includes(s.id));

  // Séance situation of one child — the currency every parent view speaks now.
  const childInfo = (id: string): ChildSeanceInfo => ({
    enrollments: studentEnrollments(db, id),
    remaining: totalRemainingSeances(db, id),
    debt: studentDebt(db, id),
    labelOf: (e: Enrollment) => enrollmentLabel(db, e),
  });

  // Payments of every child, most recent first.
  const childIds = new Set(myChildren.map((c) => c.id));
  const childPayments = db.payments
    .filter((p) => childIds.has(p.studentId))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Helpers
  const getSessionInfo = (sesId: string) => {
    const s = sessions.find((se) => se.id === sesId);
    if (!s) return null;
    const cl = classes.find((c) => c.id === s.classId)?.name ?? "";
    const mod = modules.find((m) => m.id === s.moduleId)?.name ?? "";
    const gr = groups.find((g) => g.id === s.groupId)?.name ?? "";
    return { classLabel: cl, moduleLabel: mod, groupLabel: gr, ...s };
  };

  switch (slug) {
    case "home":
      return (
        <ParentHomeView
          parent={parent}
          myChildren={myChildren}
          getSessionInfo={getSessionInfo}
          announcements={announcements}
          notifications={notifications}
          childInfo={childInfo}
        />
      );
    case "my-children":
      return (
        <ParentChildrenView
          myChildren={myChildren}
          getSessionInfo={getSessionInfo}
          subscriptions={subscriptions}
          childInfo={childInfo}
          payments={childPayments}
          attendance={attendance}
        />
      );
    case "schedule":
      return <ParentScheduleView myChildren={myChildren} getSessionInfo={getSessionInfo} subscriptions={subscriptions} />;
    case "payments":
      return (
        <ParentPaymentsView
          parent={parent}
          myChildren={myChildren}
          payments={childPayments}
          childInfo={childInfo}
        />
      );
    case "notifications":
      return <ParentNotificationsView parent={parent} notifications={notifications} myChildren={myChildren} />;
    case "announcements":
      return <ParentAnnouncementsView announcements={announcements} />;
    case "account":
      return <ParentProfileView parent={parent} updateItem={updateItem} updateUser={updateUser} user={user} />;
    default:
      return <div className="p-4 text-xs text-muted">Page non trouvée</div>;
  }
}

// ----------------------------------------------------
// 1. HOME VIEW
// ----------------------------------------------------
function ParentHomeView({
  parent,
  myChildren,
  getSessionInfo,
  announcements,
  notifications,
  childInfo,
}: {
  parent: Parent;
  myChildren: Student[];
  getSessionInfo: (id: string) => any;
  announcements: any[];
  notifications: any[];
  childInfo: (id: string) => ChildSeanceInfo;
}) {
  // Children who are running out of séances, and those who still owe money.
  const lowChildren = myChildren.filter(
    (c) => !c.isFree && childInfo(c.id).enrollments.some((e) => remainingSeances(e) <= 2),
  );
  const indebtedChildren = myChildren.filter((c) => childInfo(c.id).debt > 0);
  const parentAlerts = notifications.filter((n) => n.parentId === parent.id);
  const activeAnn = announcements.filter(
    (ann) =>
      (ann.audience === "all" || ann.audience === "parents") &&
      new Date(ann.endDate) >= new Date()
  );

  return (
    <div className="space-y-6 text-xs">
      <PageHeader
        icon={Home}
        title={`Espace Tuteur : ${parent.firstName} ${parent.lastName}`}
        subtitle="Suivi de la cotisation et des séances de vos enfants"
      />

      {indebtedChildren.length > 0 && (
        <div className="p-4 bg-danger/10 border border-danger/25 rounded-2xl space-y-2 text-danger">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse" />
            <strong className="text-xs font-bold">Alerte : reste à payer</strong>
          </div>
          <ul className="list-disc ps-5 font-bold">
            {indebtedChildren.map((c) => (
              <li key={c.id}>
                {c.firstName} {c.lastName} — dette de {formatDA(childInfo(c.id).debt)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lowChildren.length > 0 && (
        <div className="p-4 bg-warning/10 border border-warning/25 rounded-2xl space-y-2 text-warning">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <strong className="text-xs font-bold">Séances bientôt épuisées</strong>
          </div>
          <ul className="list-disc ps-5 font-bold">
            {lowChildren.map((c) => {
              const info = childInfo(c.id);
              return (
                <li key={c.id}>
                  {c.firstName} {c.lastName} —{" "}
                  {info.enrollments
                    .filter((e) => remainingSeances(e) <= 2)
                    .map((e) => `${info.labelOf(e)} (${remainingSeances(e)})`)
                    .join(", ")}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Children stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {myChildren.map((child) => {
          const info = childInfo(child.id);
          return (
            <Card key={child.id}>
              <CardBody className="flex justify-between items-center h-28">
                <div>
                  <span className="text-muted font-bold block text-[10px] uppercase">
                    Séances restantes : {child.firstName}
                  </span>
                  <strong
                    className={`text-2xl font-extrabold block mt-1 ${
                      !child.isFree && info.remaining === 0 ? "text-danger" : "text-primary"
                    }`}
                  >
                    {child.isFree ? "Gratuit" : info.remaining}
                  </strong>
                  <span className="text-[9px] text-muted block mt-1 font-mono">Carte RFID: {child.rfid}</span>
                  {info.debt > 0 && (
                    <span className="text-[9px] font-bold text-danger block">Dette : {formatDA(info.debt)}</span>
                  )}
                </div>
                <div className="h-10 w-10 bg-primary-50 rounded-xl flex items-center justify-center text-primary font-bold">
                  {child.firstName[0]}{child.lastName[0]}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages / Notifications */}
        <Card>
          <CardBody className="space-y-4">
            <h3 className="font-bold text-ink flex items-center gap-2 border-b border-line pb-3">
              <Bell className="h-5 w-5 text-primary" /> Messages Administratifs
            </h3>
            {parentAlerts.length === 0 ? (
              <p className="text-xs text-muted italic p-4 text-center">Aucun message de la direction.</p>
            ) : (
              <div className="space-y-3 max-h-56 overflow-y-auto">
                {parentAlerts.reverse().map((n) => (
                  <div key={n.id} className="p-3 bg-canvas/40 border border-line rounded-xl space-y-1">
                    <strong className="text-ink font-bold text-xs block">{n.title}</strong>
                    <p className="text-muted text-[11px] leading-relaxed">{n.description}</p>
                    <span className="text-[9px] text-muted block text-end">Reçu le {new Date(n.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* School Announcements */}
        <Card>
          <CardBody className="space-y-4">
            <h3 className="font-bold text-ink flex items-center gap-2 border-b border-line pb-3">
              <Megaphone className="h-5 w-5 text-primary" /> Annonces Générales
            </h3>
            {activeAnn.length === 0 ? (
              <p className="text-xs text-muted italic p-4 text-center">Aucune annonce active.</p>
            ) : (
              <div className="space-y-3 max-h-56 overflow-y-auto">
                {activeAnn.map((ann) => (
                  <div key={ann.id} className="p-3 bg-canvas/40 border border-line rounded-xl space-y-1">
                    <strong className="text-ink font-bold text-xs block">{ann.title}</strong>
                    <p className="text-muted text-[11px] leading-relaxed">{ann.description}</p>
                    <span className="text-[9px] text-muted block text-end">Publié le {new Date(ann.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 2. CHILDREN LIST VIEW
// ----------------------------------------------------
/**
 * « MES CHEVALIERS » — un enfant à la fois, et TOUT sur lui.
 *
 * L'écran alignait des vignettes : un parent de trois enfants lisait trois
 * résumés partiels et n'avait le détail d'aucun. Il choisit désormais SON
 * chevalier, et l'écran ne parle plus que de celui-là — ses cartes séance par
 * séance, ses présences, ses absences, ses séances annulées, ses paiements.
 *
 * Le relevé par carte est exactement celui que l'enfant voit sur son propre
 * portail (`CarteLedger`) : le père et le fils ne peuvent pas lire deux comptes
 * différents du même carte.
 */
function ParentChildrenView({
  myChildren,
  getSessionInfo,
  subscriptions,
  childInfo,
  payments,
  attendance,
}: {
  myChildren: Student[];
  getSessionInfo: (id: string) => any;
  subscriptions: Subscription[];
  childInfo: (id: string) => ChildSeanceInfo;
  payments: Payment[];
  attendance: AttendanceRecord[];
}) {
  const [selectedId, setSelectedId] = useState(myChildren[0]?.id ?? "");
  const [tab, setTab] = useState<"cartes" | "payments" | "schedule">("cartes");

  const child = myChildren.find((c) => c.id === selectedId) ?? myChildren[0];

  if (!child) {
    return (
      <div className="space-y-6 text-xs">
        <PageHeader
          icon={Swords}
          title="Mes chevaliers"
          subtitle="Cartes, présences et paiements de chacun"
        />
        <EmptyState
          icon={Swords}
          message="Aucun chevalier rattaché à votre compte."
          hint="Contactez l'intendance du club pour faire le rattachement."
        />
      </div>
    );
  }

  const info = childInfo(child.id);
  const childSubs = subscriptions.filter((sub) => child.subscriptionIds.includes(sub.id));
  const myAtt = attendance.filter((a) => a.studentId === child.id);
  const myPayments = payments
    .filter((pay) => pay.studentId === child.id)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const cancelled = myAtt.filter((a) => a.status === "cancelled").length;
  const present = myAtt.filter((a) => a.status !== "absent" && a.status !== "cancelled").length;
  const absent = myAtt.filter((a) => a.status === "absent").length;
  const paidTotal = myPayments.reduce((n, pay) => n + pay.amountPaid, 0);

  const TABS = [
    { id: "cartes" as const, label: "Cartes & présences", icon: Ticket },
    { id: "payments" as const, label: "Paiements", icon: Banknote },
    { id: "schedule" as const, label: "Emploi du temps", icon: CalendarDays },
  ];

  return (
    <div className="space-y-6 text-xs">
      <PageHeader
        icon={Swords}
        title="Mes chevaliers"
        subtitle="Cartes, présences et paiements — un chevalier à la fois"
      />

      {/* ---- Le choix du chevalier ---- */}
      {myChildren.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {myChildren.map((c) => {
            const on = c.id === child.id;
            const ci = childInfo(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                aria-pressed={on}
                className={`relative cursor-pointer rounded-xl border px-3.5 py-2.5 text-start transition-colors ${
                  on
                    ? "border-accent/45 bg-accent/10"
                    : "border-line bg-surface hover:border-accent/30"
                }`}
              >
                <span className={`block text-xs font-bold ${on ? "text-ink" : "text-muted"}`}>
                  {c.firstName} {c.lastName}
                </span>
                <span className="mt-0.5 block text-[10px] text-muted">
                  {c.isFree ? "Gratuit" : `${ci.remaining} séance(s)`}
                  {ci.debt > 0 && <span className="text-danger"> · dette {formatDA(ci.debt)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ---- Les chiffres du chevalier choisi ---- */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard
          icon={Ticket}
          tone={child.isFree ? "success" : info.remaining === 0 ? "danger" : "primary"}
          label="Séances restantes"
          value={child.isFree ? "Gratuit" : info.remaining}
          index={0}
        />
        <StatCard icon={Check} tone="success" label="Présences" value={present} index={1} />
        <StatCard icon={X} tone="danger" label="Absences" value={absent} index={2} />
        <StatCard
          icon={CalendarX2}
          tone="primary"
          label="Séances annulées"
          value={cancelled}
          index={3}
        />
        <StatCard
          icon={Banknote}
          tone={info.debt > 0 ? "danger" : "accent"}
          label={info.debt > 0 ? "Dette" : "Total versé"}
          value={formatDA(info.debt > 0 ? info.debt : paidTotal)}
          index={4}
        />
      </div>

      {/* ---- Les onglets ---- */}
      <div
        role="tablist"
        className="flex flex-wrap gap-1 rounded-xl border border-line bg-canvas p-1"
      >
        {TABS.map((t) => {
          const on = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`relative flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${
                on ? "text-white" : "text-muted hover:text-ink"
              }`}
            >
              {on && (
                <motion.span
                  layoutId="parent-child-tab"
                  className="absolute inset-0 -z-10 rounded-lg bg-gradient-primary"
                  transition={{ type: "spring", stiffness: 440, damping: 36 }}
                />
              )}
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "cartes" && (
        <div className="space-y-3">
          <SlotLegend />
          <CarteLedger studentId={child.id} />
        </div>
      )}

      {tab === "payments" && (
        <Card>
          <CardBody className="p-0">
            {myPayments.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Banknote}
                  message="Aucun paiement enregistré pour ce chevalier."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="border-b border-line bg-canvas/60 text-start">
                    <tr className="text-[10px] uppercase tracking-wider text-muted">
                      <th className="px-4 py-2.5 text-start font-bold">Date</th>
                      <th className="px-4 py-2.5 text-start font-bold">Emploi du temps</th>
                      <th className="px-4 py-2.5 text-start font-bold">Carte</th>
                      <th className="px-4 py-2.5 text-start font-bold">Motif</th>
                      <th className="px-4 py-2.5 text-end font-bold">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {myPayments.map((pay) => {
                      const sub = subscriptions.find((x) => x.id === pay.subscriptionId);
                      const sess = sub ? getSessionInfo(sub.sessionId) : null;
                      return (
                        <tr key={pay.id} className="transition-colors hover:bg-canvas/50">
                          <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                            {formatDateFr(pay.date)}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-ink">
                            {sess?.moduleLabel ?? "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {pay.monthCode ? (
                              <Badge tone="accent">{carteShort(pay.monthCode)}</Badge>
                            ) : (
                              <span className="text-muted/60">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-muted">{pay.description || "—"}</td>
                          <td className="px-4 py-2.5 text-end font-bold tabular-nums text-success">
                            {formatDA(pay.amountPaid)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-line bg-canvas/60">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-end font-bold text-ink">
                        Total versé
                      </td>
                      <td className="px-4 py-2.5 text-end font-extrabold tabular-nums text-success">
                        {formatDA(paidTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "schedule" && (
        <Card>
          <CardBody className="space-y-2">
            {childSubs.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                message="Aucun emploi du temps pour ce chevalier."
              />
            ) : (
              childSubs.map((sub) => {
                const sess = getSessionInfo(sub.sessionId);
                return (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas/30 p-3"
                  >
                    <div className="min-w-0">
                      <strong className="block truncate text-ink">{sess?.moduleLabel}</strong>
                      <span className="block text-[10px] text-muted">
                        {sess?.classLabel} ({sess?.groupLabel})
                      </span>
                    </div>
                    <span className="shrink-0 font-bold tabular-nums text-accent-ink">
                      {sess?.startTime} – {sess?.endTime}
                    </span>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 3. SCHEDULE VIEW WITH SELECT FILTER
// ----------------------------------------------------
function ParentScheduleView({
  myChildren,
  getSessionInfo,
  subscriptions,
}: {
  myChildren: Student[];
  getSessionInfo: (id: string) => any;
  subscriptions: Subscription[];
}) {
  const { teachers, salles } = useData();
  const [selectedChildId, setSelectedChildId] = useState(myChildren[0]?.id || "");
  const [filterSessionId, setFilterSessionId] = useState("");
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const daysOfWeek = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

  const currentChild = myChildren.find((c) => c.id === selectedChildId);
  const childSubs = currentChild ? subscriptions.filter((sub) => currentChild.subscriptionIds.includes(sub.id)) : [];
  const childSessions = childSubs.map((sub) => getSessionInfo(sub.sessionId)).filter(Boolean) as any[];

  // Filter based on session choice
  const filteredSessions = filterSessionId
    ? childSessions.filter((s) => s.id === filterSessionId)
    : childSessions;

  // Helpers for formatting days
  const frenchDays: Record<string, string> = {
    saturday: "Samedi",
    sunday: "Dimanche",
    monday: "Lundi",
    tuesday: "Mardi",
    wednesday: "Mercredi",
    thursday: "Jeudi",
    friday: "Vendredi",
  };

  // Generate consistent coloring by module name
  const getSessionColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      "border-s-4 border-s-blue-500 bg-blue-50/70 text-blue-900 dark:bg-blue-950/20 dark:text-blue-200 border-blue-100",
      "border-s-4 border-s-emerald-500 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200 border-emerald-100",
      "border-s-4 border-s-amber-500 bg-amber-50/70 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200 border-amber-100",
      "border-s-4 border-s-rose-500 bg-rose-50/70 text-rose-900 dark:bg-rose-950/20 dark:text-rose-200 border-rose-100",
      "border-s-4 border-s-purple-500 bg-purple-50/70 text-purple-900 dark:bg-purple-950/20 dark:text-purple-200 border-purple-100",
      "border-s-4 border-s-cyan-500 bg-cyan-50/70 text-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-200 border-cyan-100",
      "border-s-4 border-s-indigo-500 bg-indigo-50/70 text-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200 border-indigo-100",
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const handleOpenDetails = (ses: any) => {
    const teacherObj = teachers.find((t) => t.id === ses.teacherId);
    const salleObj = salles.find((sa) => sa.id === ses.salleId);
    setSelectedSession({
      ...ses,
      teacherName: teacherObj ? `${teacherObj.firstName} ${teacherObj.lastName}` : "Non spécifié",
      salleName: salleObj ? salleObj.name : "Arène non spécifiée",
    });
    setIsDetailsOpen(true);
  };

  // Reset session filter when switching child
  const handleChildChange = (cid: string) => {
    setSelectedChildId(cid);
    setFilterSessionId("");
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <PageHeader icon={CalendarDays} title="Planning des Cours" subtitle="Emploi du temps hebdomadaire par enfant" />

        <div className="flex flex-wrap items-center gap-3">
          {/* Child Select */}
          {myChildren.length > 1 && (
            <div className="w-52">
              <Select value={selectedChildId} onChange={(e) => handleChildChange(e.target.value)} className="w-full">
                {myChildren.map((c) => (
                  <option key={c.id} value={c.id}>
                    Enfant : {c.firstName} {c.lastName}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Course filter select */}
          {childSessions.length > 0 && (
            <div className="w-52">
              <Select value={filterSessionId} onChange={(e) => setFilterSessionId(e.target.value)} className="w-full">
                <option value="">Tous les cours</option>
                {childSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.moduleLabel} ({s.groupLabel})
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4 min-w-[900px] md:min-w-0">
          {daysOfWeek.map((day) => {
            const daySessions = filteredSessions
              .filter((s) => s.days.includes(day))
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

            return (
              <div key={day} className="flex flex-col bg-canvas/30 rounded-2xl border border-line p-3 min-h-[380px] space-y-3">
                <span className="font-extrabold text-ink uppercase text-[10px] block border-b border-line pb-2 text-center capitalize">
                  {frenchDays[day] || day}
                </span>
                
                <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[400px]">
                  {daySessions.length === 0 ? (
                    <span className="text-[10px] text-muted italic block text-center mt-12 font-medium">Libre</span>
                  ) : (
                    daySessions.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleOpenDetails(s)}
                        className={`p-2.5 rounded-xl border cursor-pointer hover:scale-[1.02] hover:shadow-sm transition-all duration-200 space-y-1.5 ${getSessionColor(
                          s.moduleLabel
                        )}`}
                      >
                        <strong className="text-ink block text-[11px] font-black leading-tight truncate">{s.moduleLabel}</strong>
                        <span className="text-[9px] text-muted block truncate font-bold">{s.groupLabel}</span>
                        <div className="flex items-center gap-1 text-[9px] font-bold font-mono opacity-90 mt-1 border-t border-black/5 dark:border-white/5 pt-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{s.startTime} - {s.endTime}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Details Modal */}
      <Modal open={isDetailsOpen} onClose={() => setIsDetailsOpen(false)} title="Détails du Cours" wide>
        {selectedSession && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-primary-50/50 rounded-xl p-4 border border-line">
              <div>
                <span className="text-[10px] text-muted block uppercase font-sans">Matière</span>
                <span className="font-bold text-ink">{selectedSession.moduleLabel}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted block uppercase font-sans">Niveau / Catégorie</span>
                <span className="font-semibold text-ink">{selectedSession.classLabel}</span>
              </div>
              <div>
                <span className="text-[10px] text-muted block uppercase font-sans">Groupe / Arène</span>
                <span className="font-semibold text-ink">
                  {selectedSession.groupLabel} - {selectedSession.salleName}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted block uppercase font-sans">Entraîneur</span>
                <span className="font-semibold text-ink">{selectedSession.teacherName}</span>
              </div>
            </div>

            <div className="bg-surface border border-line p-4 rounded-xl space-y-3 max-w-md">
              <h4 className="font-bold text-ink flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" /> Jours & Horaires
              </h4>
              <div className="flex justify-between items-center text-xs border-b border-line pb-2">
                <span className="text-muted">Heure de début:</span>
                <strong className="text-primary font-bold">{selectedSession.startTime}</strong>
              </div>
              <div className="flex justify-between items-center text-xs border-b border-line pb-2">
                <span className="text-muted">Heure de fin:</span>
                <strong className="text-primary font-bold">{selectedSession.endTime}</strong>
              </div>
              <div>
                <span className="text-[10px] text-muted block mb-1.5 font-sans">Jours programmés:</span>
                <div className="flex flex-wrap gap-1">
                  {selectedSession.days.map((d: string) => (
                    <Badge key={d} tone="primary" className="uppercase text-[9px] font-bold">
                      {frenchDays[d] || d}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-line">
              <Button onClick={() => setIsDetailsOpen(false)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ----------------------------------------------------
// 5. PAYMENTS HISTORY VIEW
// ----------------------------------------------------
function ParentPaymentsView({
  parent,
  myChildren,
  payments,
  childInfo,
}: {
  parent: Parent;
  myChildren: Student[];
  payments: Payment[];
  childInfo: (id: string) => ChildSeanceInfo;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [childFilter, setChildFilter] = useState("");

  const getChildName = (sid: string) => {
    const c = myChildren.find((kid) => kid.id === sid);
    return c ? `${c.firstName} ${c.lastName}` : "Chevalier inconnu";
  };

  /** Module label of a payment, resolved through the child's inscriptions. */
  const titleOf = (p: Payment) => {
    const info = childInfo(p.studentId);
    const enr = info.enrollments.find((e) => e.id === p.enrollmentId);
    if (enr) return info.labelOf(enr);
    return p.description ?? (p.type === "debt_payment" ? "Règlement de dette" : "Paiement");
  };

  const filtered = payments.filter((p) => {
    if (childFilter && p.studentId !== childFilter) return false;

    if (searchTerm) {
      const haystack = `${titleOf(p)} ${p.description ?? ""} ${getChildName(p.studentId)}`.toLowerCase();
      if (!haystack.includes(searchTerm.toLowerCase())) return false;
    }

    if (typeFilter === "purchase" && p.type !== "subscription_payment") return false;
    if (typeFilter === "debt" && p.type !== "debt_payment") return false;
    if (typeFilter === "unpaid" && p.rest <= 0) return false;

    if (dateFilter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const compareDate = new Date(p.date);
      compareDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((today.getTime() - compareDate.getTime()) / (1000 * 60 * 60 * 24));
      if (dateFilter === "today" && diffDays !== 0) return false;
      if (dateFilter === "last_week" && (diffDays < 0 || diffDays > 7)) return false;
    }

    return true;
  });

  // Metrics follow the child filter, so a parent of several children can read
  // one child's situation without arithmetic.
  const scoped = childFilter ? payments.filter((p) => p.studentId === childFilter) : payments;
  const totalPaid = scoped.reduce((sum, p) => sum + p.amountPaid, 0);
  const totalSeances = scoped.reduce((sum, p) => sum + p.seancesPurchased, 0);
  const scopedChildren = childFilter ? myChildren.filter((c) => c.id === childFilter) : myChildren;
  const totalDebt = scopedChildren.reduce((sum, c) => sum + childInfo(c.id).debt, 0);
  const totalRemaining = scopedChildren.reduce((sum, c) => sum + childInfo(c.id).remaining, 0);

  return (
    <div className="space-y-6 text-xs">
      <PageHeader
        icon={Banknote}
        title="Historique des paiements"
        subtitle="Séances achetées, remises et restes à payer de vos enfants"
      />

      {/* Metrics Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-emerald-500/10 border border-emerald-500/20 dark:bg-emerald-950/20">
          <CardBody className="p-4 space-y-1">
            <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-wider block font-sans">
              Total versé
            </span>
            <div className="flex justify-between items-baseline">
              <strong className="text-xl text-emerald-700 dark:text-emerald-200 font-black">
                {formatDA(totalPaid)}
              </strong>
              <ArrowUpCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="block text-[10px] text-muted">{totalSeances} séance(s) achetée(s)</span>
          </CardBody>
        </Card>

        <Card className="bg-rose-500/10 border border-rose-500/20 dark:bg-rose-950/20">
          <CardBody className="p-4 space-y-1">
            <span className="text-[10px] text-rose-800 dark:text-rose-300 font-bold uppercase tracking-wider block font-sans">
              Reste à payer
            </span>
            <div className="flex justify-between items-baseline">
              <strong className="text-xl text-rose-700 dark:text-rose-200 font-black">
                {formatDA(totalDebt)}
              </strong>
              <ArrowDownCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <span className="block text-[10px] text-muted">
              {totalDebt > 0 ? "À régler à la réception" : "Compte à jour"}
            </span>
          </CardBody>
        </Card>

        <Card className="bg-primary-500/10 border border-primary-500/20 dark:bg-primary-950/20">
          <CardBody className="p-4 space-y-1">
            <span className="text-[10px] text-primary-800 dark:text-primary-300 font-bold uppercase tracking-wider block font-sans">
              {childFilter ? "Séances restantes" : "Séances restantes (total)"}
            </span>
            <div className="flex justify-between items-baseline">
              <strong className="text-xl text-primary-700 dark:text-primary-200 font-black">
                {totalRemaining}
              </strong>
              <Wallet className="h-5 w-5 text-primary shrink-0" />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Séances left, per child and per inscription */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scopedChildren.map((c) => {
          const info = childInfo(c.id);
          return (
            <Card key={c.id} className="border border-line">
              <CardBody className="space-y-2 p-4">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <strong className="text-xs text-ink">{c.firstName} {c.lastName}</strong>
                  <Badge tone={c.isFree ? "success" : info.remaining === 0 ? "danger" : "primary"}>
                    {c.isFree ? "Gratuit" : `${info.remaining} séance(s)`}
                  </Badge>
                </div>
                {info.enrollments.length === 0 ? (
                  <p className="text-[10px] italic text-muted">Aucune inscription enregistrée.</p>
                ) : (
                  info.enrollments.map((e) => {
                    const left = remainingSeances(e);
                    const status = enrollmentExpiryStatus(e);
                    return (
                      <div
                        key={e.id}
                        className={`flex items-center justify-between gap-2 rounded-lg border p-2 text-[10px] ${
                          left === 0 || status === "expired"
                            ? "border-danger/40 bg-danger/5"
                            : left <= 2 || status === "soon"
                              ? "border-warning/40 bg-warning/5"
                              : "border-line bg-canvas/30"
                        }`}
                      >
                        <span className="min-w-0 truncate text-ink">{info.labelOf(e)}</span>
                        <Badge
                          tone={left === 0 ? "danger" : left <= 2 ? "warning" : "success"}
                          className="shrink-0 font-mono"
                        >
                          {left}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/*
        L'ÉCURIE DANS L'ESPACE DU PARENT.

        Au même endroit que ce qu'il doit pour ses enfants : ce que coûte
        l'entretien de son cheval, ce qui reste à payer sur un cheval acheté au
        club, et ses autres dettes. C'est toute la raison du rattachement d'un
        cheval à une fiche — sans lui, ces lignes ne remonteraient nulle part, et
        la famille découvrirait son ardoise au comptoir.
      */}
      <OwnerHorsesPanel parentId={parent.id} readOnly />

      {/* Filter toolbar */}
      <Card className="border border-line shadow-sm">
        <CardBody className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par module, chevalier, désignation..."
              className="ps-9 w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {myChildren.length > 1 && (
              <div className="w-48">
                <Select value={childFilter} onChange={(e) => setChildFilter(e.target.value)} className="w-full">
                  <option value="">Tous les enfants</option>
                  {myChildren.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="w-44">
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full">
                <option value="">Toutes opérations</option>
                <option value="purchase">Achats de séances</option>
                <option value="debt">Règlements de dette</option>
                <option value="unpaid">Avec reste à payer</option>
              </Select>
            </div>

            <div className="w-40">
              <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-full">
                <option value="">Toutes les dates</option>
                <option value="today">Aujourd&apos;hui</option>
                <option value="last_week">Les 7 derniers jours</option>
              </Select>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Cards list */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center bg-canvas/30 border border-line border-dashed rounded-2xl">
          <Wallet className="h-10 w-10 text-muted mx-auto mb-2" />
          <p className="text-muted text-xs italic">Aucun paiement trouvé avec ces filtres.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((p) => {
            const isDebt = p.type === "debt_payment";
            return (
              <Card key={p.id} className="relative overflow-visible hover:shadow-md transition-all duration-200">
                <CardBody className="flex flex-col justify-between h-56 relative">
                  <div>
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className={`h-10 w-10 rounded-full border text-xs font-bold flex items-center justify-center tracking-wider shrink-0 ${
                          isDebt
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                            : "bg-primary-500/10 border-primary-500/20 text-primary"
                        }`}
                      >
                        {isDebt ? "RD" : "SÉ"}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-ink truncate" title={titleOf(p)}>
                          {titleOf(p)}
                        </h4>
                        <span className="text-[10px] text-muted block font-mono">
                          {p.date.substring(0, 16).replace("T", " ")}
                        </span>
                      </div>
                    </div>

                    <div className="mb-2 flex items-center justify-between rounded-xl border border-line/60 bg-canvas/30 p-2.5 text-[10px]">
                      <span className="uppercase font-semibold text-muted">Chevalier</span>
                      <span className="block max-w-[140px] truncate font-bold text-primary">
                        {getChildName(p.studentId)}
                      </span>
                    </div>

                    {!isDebt && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-line/60 bg-canvas/30 p-2.5 text-[10px]">
                        <span className="text-muted">
                          Séances : <strong className="text-ink">{p.seancesPurchased}</strong>
                        </span>
                        <span className="text-muted">
                          Prix séance : <strong className="text-ink">{formatDA(p.unitPrice)}</strong>
                        </span>
                        <span className="text-muted">
                          Remise :{" "}
                          <strong className="text-warning">
                            {p.discountValue && p.discountValue > 0
                              ? discountLabel({ type: p.discountType ?? "percent", value: p.discountValue })
                              : "—"}
                          </strong>
                        </span>
                        <span className="text-muted">
                          Net : <strong className="text-primary">{formatDA(p.netTotal)}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-line/60 pt-3 mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-muted flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${p.rest > 0 ? "bg-danger" : "bg-success"}`} />
                      {p.rest > 0 ? `Reste à payer : ${formatDA(p.rest)}` : "Payé intégralement"}
                    </span>
                    <Badge tone="success" className="font-mono font-bold text-xs px-2.5 py-0.5">
                      {formatDA(p.amountPaid)}
                    </Badge>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 6. NOTIFICATIONS VIEW
// ----------------------------------------------------
function ParentNotificationsView({
  parent,
  notifications,
  myChildren,
}: {
  parent: Parent;
  notifications: any[];
  myChildren: Student[];
}) {
  const alerts = notifications.filter((n) => n.parentId === parent.id);

  return (
    <div className="space-y-6 text-xs">
      <PageHeader icon={Bell} title="Notifications & Alertes" subtitle="Toutes les alertes et messages administratifs reçus" />

      {alerts.length === 0 ? (
        <Card className="p-8 text-center bg-canvas/30 border border-line">
          <Bell className="h-10 w-10 text-muted mx-auto mb-2 animate-pulse" />
          <h3 className="font-bold text-ink font-sans">Aucune notification</h3>
          <p className="text-xs text-muted mt-1">Vous n'avez reçu aucun message d'alerte pour le moment.</p>
        </Card>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {alerts.reverse().map((n) => (
            <Card key={n.id} className={n.auto ? "border-s-4 border-s-warning" : "border-s-4 border-s-primary"}>
              <CardBody className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <strong className="text-ink text-sm font-bold">{n.title}</strong>
                  <span className="text-[9px] text-muted font-mono">{n.date.substring(0, 16).replace("T", " ")}</span>
                </div>
                <p className="text-muted text-xs leading-relaxed">{n.description}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 7. ANNOUNCEMENTS VIEW
// ----------------------------------------------------
function ParentAnnouncementsView({ announcements }: { announcements: any[] }) {
  const activeAnn = announcements.filter(
    (ann) =>
      (ann.audience === "all" || ann.audience === "parents") &&
      new Date(ann.endDate) >= new Date()
  );

  return (
    <div className="space-y-6 text-xs">
      <PageHeader icon={Megaphone} title="Annonces Administratives" subtitle="Toutes les alertes du club et évènements" />

      {activeAnn.length === 0 ? (
        <Card className="p-8 text-center bg-canvas/30 border border-line">
          <Megaphone className="h-10 w-10 text-muted mx-auto mb-2" />
          <h3 className="font-bold text-ink">Aucune annonce</h3>
          <p className="text-xs text-muted mt-1">Aucune information importante n'est actuellement diffusée.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeAnn.map((ann) => (
            <Card key={ann.id}>
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2 border-b border-line pb-2">
                  <Megaphone className="h-4.5 w-4.5 text-primary shrink-0" />
                  <strong className="text-ink text-sm font-bold">{ann.title}</strong>
                </div>
                <p className="text-muted text-xs leading-relaxed whitespace-pre-line">{ann.description}</p>
                <div className="border-t border-line/60 pt-2 flex justify-between text-[10px] text-muted">
                  <span>Publié le: {new Date(ann.date).toLocaleDateString()}</span>
                  <span>Expire le: {ann.endDate}</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 8. PROFILE VIEW
// ----------------------------------------------------
function ParentProfileView({
  parent,
  updateItem,
  updateUser,
  user,
}: {
  parent: Parent;
  updateItem: any;
  updateUser: (fields: { name?: string }) => void;
  user: any;
}) {
  const [firstName, setFirstName] = useState(parent.firstName);
  const [lastName, setLastName] = useState(parent.lastName);
  const [phone, setPhone] = useState(parent.phone);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      if (password) {
        if (password.length < 6) {
          alert("Le mot de passe doit contenir au moins 6 caractères.");
          setSaving(false);
          return;
        }
        await changeOwnPassword(password);
        setPassword("");
      }

      updateItem("parents", parent.id, { firstName, lastName, phone });

      updateUser({ name: `${firstName} ${lastName}` });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <PageHeader icon={User} title="Mon Profil Parent" subtitle="Gérer vos identifiants d'accès et vos contacts" />

      <div className="max-w-2xl">
        <Card>
          <CardBody className="space-y-4">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2 border-b border-line pb-3">
              <User className="h-5 w-5 text-primary" /> Coordonnées du Tuteur
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Prénom</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1 font-sans">Nom</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Téléphone</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Email / Identifiant</label>
                <Input value={parent.email} disabled className="opacity-60" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-muted mb-1">Nouveau mot de passe</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Laisser vide pour ne pas changer"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-line flex justify-end">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? "..." : "Enregistrer les Modifications"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
