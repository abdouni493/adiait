"use client";

import { useEffect, useState } from "react";
import { Clock, GraduationCap, MapPin, Search, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/SearchInput";
import { useData } from "@/lib/store/data";
import {
  classLabel,
  courseKeyOf,
  coursLevelLabel,
  formatDays,
  groupName,
  hasMonthlyPlan,
  isFreeSub,
  monthlyPriceOf,
  groupsOfClass,
  salleName,
  sessionTitleOf,
  sessionGroupsOfClass,
  sessionTimeLabel,
  soldFor,
  teacherName,
} from "@/lib/helpers";
import { formatDA } from "@/lib/utils";
import type { CoursLevel, Student } from "@/lib/types";

/**
 * One sellable timing of a class: the schedule row plus the tariff it is sold
 * with. A timing without a subscription carries no price, so it can never be
 * enrolled on — it is simply not offered.
 */
export interface ClassTimingOption {
  /** subscription id — this is what gets stored on the student */
  subId: string;
  /** the emploi du temps this tariff prices */
  sessionId: string;
  /** identity of the cours: same class, same module, same teacher */
  courseKey: string;
  /** every timing of that cours, this one included */
  siblingSubIds: string[];
  className: string;
  classId: string;
  /**
   * LES GROUPES QUE CETTE CATÉGORIE AMÈNE SUR CE CRÉNEAU.
   *
   * C'est par eux que l'écran d'inscription se lit maintenant : on choisit une
   * catégorie, elle montre SES groupes, et chaque groupe montre les créneaux
   * qu'il tient. Un emploi multi-niveaux ne présente donc à la 8-10 ans que les
   * groupes de la 8-10 ans, jamais ceux de l'autre catégorie.
   */
  groupIds: string[];
  moduleName: string;
  groupName: string;
  salleName: string;
  teacherName: string;
  daysLabel: string;
  time: string;
  price: number;
  hasMonthly: boolean;
  monthlySeances: number;
  monthlyPrice: number;
  isOpen: boolean;
  isFormation: boolean;
  periodMonths?: number;
  enrolled: number;
}

/** Level filter values: the four school levels plus formations. */
export type LevelValue = CoursLevel | "formation";

/**
 * OÙ LE COMPTOIR EN EST DANS LE CATALOGUE : les CATÉGORIES qu'il a ouvertes.
 *
 * C'était « le niveau et l'année affichés » — deux notions d'école qu'un club
 * de chevalerie n'emploie plus. La fiche s'en sert pour rouvrir là où le
 * chevalier a été inscrit, même quand aucun créneau n'a encore été coché.
 */
export interface TimingScope {
  classIds: string[];
}

/** Un niveau lu depuis une fiche : tout ce qui n'est pas connu retombe sur
 *  « primaire », comme l'écran l'a toujours fait. */
export function asLevelValue(value?: string): LevelValue {
  const known: string[] = ["maternelle", "primaire", "moyen", "lycee", "formation"];
  return (known.includes(value ?? "") ? value : "primaire") as LevelValue;
}

/** Year options per school level (kindergarten uses sections). */
export function timingYearOptions(level: LevelValue): string[] {
  switch (level) {
    case "maternelle":
      return ["Petite section", "Moyenne section", "Grande section"];
    case "primaire":
      return ["1AP", "2AP", "3AP", "4AP", "5AP"];
    case "moyen":
      return ["1AM", "2AM", "3AM", "4AM"];
    case "lycee":
      return ["1AS", "2AS", "3AS"];
    default:
      return [];
  }
}

/**
 * Ticking a timing, as every enrollment screen does it. A cours is followed
 * through exactly ONE of its groups, so ticking another group of a cours the
 * student is already on MOVES him to it instead of enrolling — and billing —
 * him twice for the same cours. Ticking the one he is on removes it.
 */
export function toggleTimingSelection(
  selected: string[],
  option: { subId: string; siblingSubIds: string[] },
): string[] {
  const withoutCourse = selected.filter((id) => !option.siblingSubIds.includes(id));
  return selected.includes(option.subId) ? withoutCourse : [...withoutCourse, option.subId];
}

/** Timings and catégories, ready to be listed. Shared by every screen that
 *  enrolls a student, so they all read the same catalogue. */
export function useClassTimings() {
  const db = useData();
  const { sessions, subscriptions, classes, modules, teachers, groups, salles, students } = db;

  /** Every timing of ONE class, séances libres opened to it included. */
  const timingsOf = (classId: string): ClassTimingOption[] => {
    const cls0 = classes.find((c) => c.id === classId);
    const rows = sessions
      // Un emploi du temps supprimé n'est plus au catalogue : on ne peut plus y
      // inscrire personne, même si sa ligne reste en base pour l'historique.
      .filter((s) => !s.archivedAt)
      .filter((s) => s.classId === classId || s.classIds?.includes(classId))
      .flatMap((s) => {
        const sub = subscriptions.find((x) => x.sessionId === s.id);
        if (!sub || sub.archivedAt) return [];
        const cls = classes.find((c) => c.id === s.classId);
        const mod = modules.find((m) => m.id === s.moduleId)?.name ?? "Module";
        const t = teachers.find((te) => te.id === s.teacherId);
        const isFormation = cls?.type === "formation";
        return [
          {
            subId: sub.id,
            sessionId: s.id,
            courseKey: courseKeyOf(s),
            siblingSubIds: [] as string[],
            className: cls0?.name ?? cls?.name ?? "-",
            classId,
            groupIds: sessionGroupsOfClass(s, classId),
            // Le module n'est plus demandé à la création d'un emploi du temps :
            // le nom saisi l'emporte, et à défaut ce sont les GROUPES qui
            // nomment le créneau. Le module reste le dernier repli, pour les
            // emplois d'avant qui en portent encore un.
            moduleName:
              s.title ||
              sessionGroupsOfClass(s, classId)
                .map((gid) => groups.find((g) => g.id === gid)?.name)
                .filter(Boolean)
                .join(" · ") ||
              mod,
            groupName:
              sessionGroupsOfClass(s, classId)
                .map((gid) => groups.find((g) => g.id === gid)?.name)
                .filter(Boolean)
                .join(" · ") || "-",
            salleName: salles.find((sl) => sl.id === s.salleId)?.name ?? "-",
            teacherName: t ? `${t.firstName} ${t.lastName}` : "-",
            daysLabel: formatDays(s.days) || "—",
            time: `${s.startTime}-${s.endTime}`,
            price: isFormation ? sub.levelPrice ?? 0 : sub.pricePerSession,
            hasMonthly: hasMonthlyPlan(sub),
            monthlySeances: sub.monthlySeances ?? 0,
            monthlyPrice: monthlyPriceOf(sub),
            isOpen: !!s.isOpen,
            isFormation: !!isFormation,
            periodMonths: sub.periodMonths,
            enrolled: students.filter((st) => st.subscriptionIds.includes(sub.id)).length,
          },
        ];
      });

    // A student follows a cours through exactly ONE of its groups: every timing
    // needs to know its siblings so ticking another one MOVES him instead of
    // enrolling (and billing) him twice on the same cours.
    return rows
      .map((row) => ({
        ...row,
        siblingSubIds: rows.filter((o) => o.courseKey === row.courseKey).map((o) => o.subId),
      }))
      .sort((a, b) => a.moduleName.localeCompare(b.moduleName) || a.time.localeCompare(b.time));
  };

  /** Every timing of every class of a given level (+ year), aggregated. This is
   *  the catalogue the enrollment picker lists once a level & year are chosen. */
  const timingsForLevelYear = (level: LevelValue, year: string): ClassTimingOption[] => {
    const matchingClasses = classes.filter((cls) => {
      if (level === "formation") return cls.type === "formation";
      return cls.type === "cours" && cls.coursLevel === level && (!year || cls.year === year);
    });
    const all = matchingClasses.flatMap((cls) => timingsOf(cls.id));
    // Re-derive siblings across the WHOLE aggregated set (two groups of the same
    // cours may sit in different catégories of the same level).
    return all
      .map((row) => ({
        ...row,
        siblingSubIds: all.filter((o) => o.courseKey === row.courseKey).map((o) => o.subId),
      }))
      .sort(
        (a, b) =>
          a.className.localeCompare(b.className) ||
          a.moduleName.localeCompare(b.moduleName) ||
          a.time.localeCompare(b.time),
      );
  };

  /** Enrollment cost of ONE subscription: the month price for a monthly plan,
   *  the level price for a formation, otherwise the price of one séance. */
  const subCost = (subId: string): number => {
    const sub = subscriptions.find((s) => s.id === subId);
    if (!sub) return 0;
    if (hasMonthlyPlan(sub)) return monthlyPriceOf(sub);
    const session = sessions.find((se) => se.id === sub.sessionId);
    const cls = session && classes.find((c) => c.id === session.classId);
    if (cls?.type === "formation") return sub.levelPrice ?? 0;
    return sub.pricePerSession;
  };

  /**
   * The catalogue entry of ONE subscription — what the chips need to be able to
   * untick an emploi du temps without going back through its level and year.
   */
  const timingOf = (subId: string): ClassTimingOption | null => {
    const sub = subscriptions.find((s) => s.id === subId);
    const session = sub && sessions.find((se) => se.id === sub.sessionId);
    if (!session) return null;
    return timingsOf(session.classId).find((t) => t.subId === subId) ?? null;
  };

  /**
   * WHERE a subscription sits in the catalogue: the level and the year of its
   * class. The enrollment picker opens there when a student already follows it,
   * instead of on the default primaire/1AP where his emplois are invisible.
   */
  const levelYearOf = (subId: string): { level: LevelValue; year: string } | null => {
    const sub = subscriptions.find((s) => s.id === subId);
    const session = sub && sessions.find((se) => se.id === sub.sessionId);
    const cls = session && classes.find((c) => c.id === session.classId);
    if (!cls) return null;
    if (cls.type === "formation") return { level: "formation", year: "" };
    return { level: (cls.coursLevel ?? "primaire") as LevelValue, year: cls.year ?? "" };
  };

  /** Human label of a subscription (module · group), for the selected chips. */
  const subLabel = (subId: string): string => {
    const sub = subscriptions.find((s) => s.id === subId);
    if (!sub) return "—";
    const session = sessions.find((se) => se.id === sub.sessionId);
    if (!session) return "—";
    const mod = session.title || modules.find((m) => m.id === session.moduleId)?.name || "Module";
    const grp = groups.find((g) => g.id === session.groupId)?.name ?? "";
    return grp ? `${mod} · ${grp}` : mod;
  };

  /**
   * LES GROUPES D'UNE CATÉGORIE, chacun avec les créneaux qu'il tient.
   *
   * C'est la vue dont le comptoir a besoin : « la 8-10 ans, qu'est-ce qu'elle
   * propose ? » — Groupe A le samedi matin, Groupe B le mardi soir. Un groupe
   * sans créneau tarifé apparaît quand même, avec zéro créneau : c'est une
   * information, pas un oubli.
   */
  const groupsWithTimings = (classId: string) => {
    const all = timingsOf(classId);
    const rows = groupsOfClass(db, classId).map((g) => ({
      group: g,
      timings: all.filter((t) => t.groupIds.includes(g.id)),
    }));
    // Les créneaux qu'aucun groupe ne réclame — un emploi créé sans groupe.
    const orphans = all.filter((t) => t.groupIds.length === 0);
    return { rows, orphans };
  };

  /** Combien de créneaux tarifés une catégorie propose-t-elle ? */
  const timingCountOf = (classId: string) => timingsOf(classId).length;

  /** LA CATÉGORIE d'un abonnement — le point d'entrée du nouveau catalogue. */
  const classIdOf = (subId: string): string | null => {
    const sub = subscriptions.find((s) => s.id === subId);
    const session = sub && sessions.find((se) => se.id === sub.sessionId);
    return session?.classId || null;
  };

  return {
    timingsOf,
    timingsForLevelYear,
    timingOf,
    levelYearOf,
    subCost,
    subLabel,
    groupsWithTimings,
    timingCountOf,
    classIdOf,
  };
}

/**
 * « OÙ EN EST-IL, LÀ, MAINTENANT ? » — les inscriptions en cours du chevalier,
 * écrites en toutes lettres au-dessus du catalogue.
 *
 * Avant de déplacer un enfant, la réception a besoin de voir ce qu'il suit
 * DÉJÀ : dans quelle catégorie, sur quelle année, sur quels emplois du temps, avec
 * quel entraîneur et à quelles heures. Sans ce rappel, cocher un créneau dans la
 * liste du dessous relève du pari — c'est justement ainsi qu'on inscrit un chevalier
 * de 4AP sur un créneau de 3AP sans s'en apercevoir.
 *
 * Le tableau lit la SÉLECTION EN COURS, pas seulement ce qui est enregistré :
 * dans un écran de modification, il montre donc l'état dans lequel la fiche sera
 * sauvegardée, ligne ajoutée comprise. Chaque ligne se retire d'un clic.
 */
export function CurrentInscriptions({
  subIds,
  student,
  savedSubIds,
  onRemove,
  title = "Inscriptions actuelles du chevalier",
}: {
  /** les emplois du temps cochés — ce que la fiche portera une fois enregistrée */
  subIds: string[];
  /** la fiche, quand elle existe : elle apporte le solde et les cas de gratuité */
  student?: Student | null;
  /** ce que la fiche porte DÉJÀ en base, pour distinguer les ajouts en attente */
  savedSubIds?: string[];
  /** retirer cet emploi du temps de la sélection */
  onRemove?: (subId: string) => void;
  title?: string;
}) {
  const db = useData();
  const { subscriptions, sessions, classes } = db;

  const rows = subIds.flatMap((subId) => {
    const sub = subscriptions.find((s) => s.id === subId);
    if (!sub) return [];
    const session = sessions.find((s) => s.id === sub.sessionId);
    if (!session) return [];
    const cls = classes.find((c) => c.id === session.classId);
    return [
      {
        subId,
        label: sessionTitleOf(db, session),
        className: cls?.name ?? "—",
        levelLabel:
          cls?.type === "formation"
            ? `Formation ${cls.formationLevel ?? ""}`.trim()
            : coursLevelLabel(cls?.coursLevel) || "—",
        year: cls?.type === "formation" ? "" : cls?.year ?? "",
        groupName: groupName(db, session.groupId),
        salleName: salleName(db, session.salleId),
        teacherName: teacherName(db, session.teacherId),
        daysLabel: formatDays(session.days) || "—",
        timeLabel: sessionTimeLabel(session),
        unitPrice: sub.pricePerSession,
        balance: student ? soldFor(db, student.id, subId) : 0,
        offered: student ? isFreeSub(student, subId) : false,
        archived: !!session.archivedAt,
        pending: savedSubIds ? !savedSubIds.includes(subId) : false,
      },
    ];
  });

  /**
   * CE QUE LA FICHE A RETENU quand elle ne porte encore aucun créneau.
   *
   * `enrollmentLevel` désigne aujourd'hui une CATÉGORIE : c'est par elles que
   * l'écran d'inscription se lit. Les fiches d'avant y portent encore un niveau
   * d'école (« primaire », « lycee ») — on lit donc la catégorie d'abord, et on
   * retombe sur l'ancien libellé quand ce n'en est pas une.
   */
  const cls0 = db.classes.find((c) => c.id === student?.enrollmentLevel);
  const lastScopeLabel = cls0
    ? classLabel(db, cls0)
    : student?.enrollmentLevel || student?.enrollmentYear
      ? [
          student?.enrollmentLevel === "formation"
            ? "Formation"
            : coursLevelLabel(student?.enrollmentLevel as CoursLevel) ||
              student?.enrollmentLevel,
          student?.enrollmentYear,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  return (
    <div className="rounded-xl border border-primary/25 bg-primary-50/25 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          <GraduationCap className="h-3.5 w-3.5" /> {title}
        </span>
        <span className="text-[10px] font-semibold text-muted">
          {rows.length} emploi(s) du temps
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="py-3 text-center text-[11px] text-muted">
          {/* Une fiche créée SANS emploi du temps garde tout de même sa catégorie
              et son année : les rappeler ici évite de chercher où le chevalier a
              été inscrit avant de pouvoir lui choisir un créneau. */}
          {lastScopeLabel ? (
            <>
              <strong className="block text-ink">Inscrit en {lastScopeLabel}</strong>
              <span className="italic">
                Aucun emploi du temps choisi pour l&apos;instant — la liste ci-dessous s&apos;ouvre
                déjà sur cette catégorie.
              </span>
            </>
          ) : (
            <span className="italic">
              Aucun emploi du temps pour l&apos;instant — choisissez-en un dans la liste ci-dessous.
            </span>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] text-[11px]">
            <thead className="bg-canvas/60">
              <tr className="text-left text-[9px] uppercase tracking-wide text-muted">
                <th className="px-2 py-1.5">Catégorie</th>
                <th className="px-2 py-1.5">Niveau / Année</th>
                <th className="px-2 py-1.5">Emploi du temps</th>
                <th className="px-2 py-1.5">Groupe</th>
                <th className="px-2 py-1.5">Jours &amp; heures</th>
                <th className="px-2 py-1.5">Entraîneur</th>
                <th className="px-2 py-1.5 text-right">Séance</th>
                {student && <th className="px-2 py-1.5 text-right">Solde</th>}
                {onRemove && <th className="px-2 py-1.5 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.subId} className="border-t border-line/50">
                  <td className="px-2 py-1.5 font-semibold text-ink">{r.className}</td>
                  <td className="px-2 py-1.5 text-muted">
                    {r.levelLabel}
                    {r.year ? ` · ${r.year}` : ""}
                  </td>
                  <td className="px-2 py-1.5">
                    <strong className="text-ink">{r.label}</strong>
                    <span className="flex flex-wrap gap-1">
                      {r.pending && (
                        <Badge tone="warning" className="text-[8px]">
                          à enregistrer
                        </Badge>
                      )}
                      {r.offered && (
                        <Badge tone="success" className="text-[8px]">
                          offert
                        </Badge>
                      )}
                      {r.archived && (
                        <Badge tone="neutral" className="text-[8px]">
                          emploi supprimé
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-muted">{r.groupName}</td>
                  <td className="px-2 py-1.5 text-muted">
                    {r.daysLabel}
                    <span className="block font-mono text-[9px]">{r.timeLabel}</span>
                    <span className="block text-[9px]">Arène {r.salleName}</span>
                  </td>
                  <td className="px-2 py-1.5 text-muted">{r.teacherName}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{formatDA(r.unitPrice)}</td>
                  {student && (
                    <td className="px-2 py-1.5 text-right font-mono">
                      <span className={r.balance < 0 ? "text-danger" : "text-success"}>
                        {r.balance < 0
                          ? `${formatDA(-r.balance)} dus`
                          : `${formatDA(r.balance)} d'avance`}
                      </span>
                    </td>
                  )}
                  {onRemove && (
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(r.subId)}
                        title="Retirer cet emploi du temps — son historique reste sur sa fiche"
                        className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[9px] font-bold text-danger transition-colors hover:bg-danger/10"
                      >
                        <X className="h-3 w-3" /> Retirer
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * L'ÉCRAN D'INSCRIPTION — PAR CATÉGORIE, PUIS PAR GROUPE.
 *
 * Il demandait autrefois un NIVEAU (« Primaire ») puis une ANNÉE (« 1AP ») :
 * deux notions d'école qui n'existent plus dans un club de chevalerie, où l'on
 * range ses membres par tranche d'âge. On cherchait donc un enfant de 9 ans
 * dans « Primaire / 4AP », ce qui ne voulait plus rien dire.
 *
 * Le comptoir choisit désormais ce qu'il a réellement sous les yeux :
 *
 *   1. une ou PLUSIEURS CATÉGORIES — cherchées par leur nom, cochées d'un clic ;
 *   2. dans chacune, un ou PLUSIEURS GROUPES — ceux de cette catégorie, et
 *      d'elle seule ;
 *   3. et, quand un groupe tient plusieurs créneaux, LEQUEL on prend.
 *
 * Un groupe qui ne tient QU'UN créneau se coche donc d'un seul clic : c'est le
 * cas courant, et il ne demande rien de plus.
 *
 * CE QUI EST ENREGISTRÉ N'A PAS CHANGÉ : ce sont toujours des abonnements
 * (`subId`), un par emploi du temps suivi. Seule la façon de les trouver a
 * changé — et un chevalier suit toujours un cours par UN seul de ses groupes,
 * cocher un autre groupe du même cours l'y DÉPLACE.
 */
export function ClassTimingPicker({
  selectedSubIds,
  onToggle,
  showTotal = true,
  student,
  savedSubIds,
  showCurrent = false,
  initialClassIds,
  onScopeChange,
}: {
  selectedSubIds: string[];
  /** The option carries `siblingSubIds`: the other groups of the same cours,
   *  which the caller drops when the student is moved from one to another. */
  onToggle: (option: ClassTimingOption) => void;
  showTotal?: boolean;
  /** la fiche concernée : elle fait apparaître ses soldes sur le rappel du haut */
  student?: Student | null;
  /** ce que la fiche porte DÉJÀ en base, pour marquer les ajouts en attente */
  savedSubIds?: string[];
  /** rappeler EN HAUT les emplois du temps actuels du chevalier */
  showCurrent?: boolean;
  /** les catégories à ouvrir d'emblée (une activation de compte les impose) */
  initialClassIds?: string[];
  /** remonte les catégories ouvertes, pour que la fiche s'en souvienne */
  onScopeChange?: (scope: TimingScope) => void;
}) {
  const db = useData();
  const { classes } = db;
  const { timingOf, subCost, subLabel, groupsWithTimings, timingCountOf, classIdOf } =
    useClassTimings();

  /**
   * L'ÉCRAN S'OUVRE LÀ OÙ LE CHEVALIER EST DÉJÀ : les catégories de ses
   * inscriptions en cours. En modification, ses créneaux sont donc visibles et
   * décochables tout de suite, au lieu d'être cachés derrière une catégorie
   * arbitraire qui ne le concerne pas.
   */
  const [openClassIds, setOpenClassIds] = useState<string[]>(() => {
    const fromSubs = selectedSubIds.map(classIdOf).filter(Boolean) as string[];
    const start = [...new Set([...(initialClassIds ?? []), ...fromSubs])];
    return start;
  });
  const [classSearch, setClassSearch] = useState("");
  const [search, setSearch] = useState("");
  /** Les groupes DÉPLIÉS : ceux dont on regarde les créneaux un par un. */
  const [openGroupIds, setOpenGroupIds] = useState<string[]>([]);

  // Les catégories ouvertes remontent à la fiche, qui les enregistre.
  useEffect(() => {
    onScopeChange?.({ classIds: openClassIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openClassIds.join("|")]);

  const toggleClass = (id: string) =>
    setOpenClassIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const toggleGroupOpen = (id: string) =>
    setOpenGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

  const cq = classSearch.trim().toLowerCase();
  const shownClasses = cq
    ? classes.filter((c) => `${c.name} ${c.description ?? ""}`.toLowerCase().includes(cq))
    : classes;

  const q = search.trim().toLowerCase();
  const matches = (t: ClassTimingOption) =>
    !q ||
    `${t.moduleName} ${t.groupName} ${t.teacherName} ${t.salleName} ${t.className} ${t.daysLabel} ${t.time}`
      .toLowerCase()
      .includes(q);

  const totalCost = selectedSubIds.reduce((sum, id) => sum + subCost(id), 0);

  /** Une ligne de créneau, cochable — la même partout dans l'écran. */
  const renderTiming = (t: ClassTimingOption) => {
    const picked = selectedSubIds.includes(t.subId);
    const moves =
      !picked && t.siblingSubIds.some((id) => id !== t.subId && selectedSubIds.includes(id));
    return (
      <button
        key={t.subId}
        type="button"
        onClick={() => onToggle(t)}
        className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-start text-[11px] transition-colors ${
          picked
            ? "border-primary bg-primary text-white"
            : "border-line bg-surface text-ink hover:bg-primary-50"
        }`}
      >
        <span className="min-w-0">
          <strong className="block">
            {t.moduleName}
            {t.isOpen && (
              <span
                className={`ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                  picked ? "bg-white/20 text-white" : "bg-success/15 text-success"
                }`}
              >
                Séance libre
              </span>
            )}
            {moves && (
              <span className="ml-1.5 rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold text-warning">
                Change de groupe
              </span>
            )}
          </strong>
          <span
            className={`mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 ${
              picked ? "text-white/85" : "text-muted"
            }`}
          >
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {t.daysLabel} · {t.time}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {t.salleName}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {t.enrolled} inscrit(s)
            </span>
            <span>Ens: {t.teacherName}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-end">
            <strong className="block">
              {formatDA(t.price)}
              {t.isFormation ? ` / ${t.periodMonths} carte` : " / séance"}
            </strong>
            {t.hasMonthly && (
              <span className={picked ? "text-white/80" : "text-warning"}>
                {t.monthlySeances} séances · {formatDA(t.monthlyPrice)} / carte
              </span>
            )}
          </span>
          <input type="checkbox" checked={picked} readOnly className="h-4 w-4" />
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Ce qu'il suit DÉJÀ — catégorie, groupe, créneaux — avant de toucher à
          quoi que ce soit. Sans ce rappel, on coche à l'aveugle. */}
      {showCurrent && (
        <CurrentInscriptions
          subIds={selectedSubIds}
          student={student}
          savedSubIds={savedSubIds}
          onRemove={(subId) => {
            const option = timingOf(subId);
            if (option) onToggle(option);
          }}
        />
      )}

      {/* ---- Étape 1 : LES CATÉGORIES ---------------------------------- */}
      <div className="space-y-2 rounded-xl border border-primary/25 bg-primary-50/25 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <GraduationCap className="h-3.5 w-3.5" /> 1. Catégories — plusieurs possibles
          </span>
          <span className="text-[10px] font-semibold text-muted">
            {openClassIds.length} ouverte(s)
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input
            value={classSearch}
            onChange={(e) => setClassSearch(e.target.value)}
            placeholder="Rechercher une catégorie par son nom…"
            className="pl-9"
          />
        </div>

        {shownClasses.length === 0 ? (
          <p className="p-1.5 text-[11px] italic text-muted">
            Aucune catégorie ne correspond. Les catégories se créent depuis l&apos;écran
            Catégories.
          </p>
        ) : (
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {shownClasses.map((c) => {
              const open = openClassIds.includes(c.id);
              const count = timingCountOf(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleClass(c.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    open
                      ? "border-primary bg-primary text-white"
                      : "border-line bg-surface text-ink hover:bg-primary-50"
                  }`}
                >
                  {classLabel(db, c)}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      open ? "bg-white/20 text-white" : "bg-primary-50 text-primary"
                    }`}
                  >
                    {count} créneau(x)
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Étape 2 : LES GROUPES DE CHAQUE CATÉGORIE ------------------ */}
      {openClassIds.length === 0 ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] leading-relaxed text-warning">
          Choisissez au moins une catégorie ci-dessus : ses groupes — et les créneaux de
          chacun — s&apos;afficheront ici.
        </p>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer les créneaux (groupe, entraîneur, arène, horaire…)"
              className="pl-9"
            />
          </div>

          <div className="space-y-2">
            {openClassIds.map((cid) => {
              const cls = classes.find((c) => c.id === cid);
              const { rows, orphans } = groupsWithTimings(cid);
              const shownOrphans = orphans.filter(matches);
              return (
                <div key={cid} className="rounded-xl border border-line bg-surface p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[11px] text-ink">
                      {cls ? classLabel(db, cls) : "—"}
                    </strong>
                    <Badge tone={rows.length > 0 ? "primary" : "warning"} className="text-[9px]">
                      {rows.length} groupe(s)
                    </Badge>
                  </div>

                  {rows.length === 0 && shownOrphans.length === 0 ? (
                    <p className="text-[10px] italic text-muted">
                      Cette catégorie n&apos;a encore aucun groupe. Ils se créent depuis
                      l&apos;écran Emplois du temps, bouton « Groupes des catégories ».
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {rows.map(({ group, timings }) => {
                        const shown = timings.filter(matches);
                        const chosen = timings.filter((t) => selectedSubIds.includes(t.subId));
                        const single = shown.length === 1 ? shown[0] : null;
                        const expanded = openGroupIds.includes(group.id);
                        return (
                          <div
                            key={group.id}
                            className={`rounded-lg border ${
                              chosen.length > 0
                                ? "border-primary/50 bg-primary-50/40"
                                : "border-line bg-canvas/30"
                            }`}
                          >
                            {/* UN GROUPE QUI NE TIENT QU'UN CRÉNEAU SE COCHE
                                D'UN CLIC — c'est le cas courant, et il n'a
                                aucune raison de demander un dépliage de plus. */}
                            <button
                              type="button"
                              onClick={() =>
                                single ? onToggle(single) : toggleGroupOpen(group.id)
                              }
                              className="flex w-full flex-wrap items-center justify-between gap-2 px-2.5 py-2 text-start"
                            >
                              <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-ink">
                                <Users className="h-3.5 w-3.5 text-primary" /> {group.name}
                                <span className="text-[9px] font-normal text-muted">
                                  {timings.length} créneau(x)
                                </span>
                                {chosen.length > 0 && (
                                  <Badge tone="success" className="text-[9px]">
                                    {chosen.length} choisi(s)
                                  </Badge>
                                )}
                                {timings.length === 0 && (
                                  <Badge tone="warning" className="text-[9px]">
                                    aucun tarif
                                  </Badge>
                                )}
                              </span>
                              <span className="shrink-0 text-[10px] font-bold text-primary">
                                {single
                                  ? selectedSubIds.includes(single.subId)
                                    ? "✓ Inscrit sur ce groupe"
                                    : "Choisir ce groupe"
                                  : timings.length > 1
                                    ? expanded
                                      ? "Masquer les créneaux"
                                      : "Voir les créneaux"
                                    : ""}
                              </span>
                            </button>

                            {/* Plusieurs créneaux : on dit lequel on prend. */}
                            {!single && expanded && shown.length > 0 && (
                              <div className="space-y-1.5 border-t border-line p-2">
                                {shown.map(renderTiming)}
                              </div>
                            )}
                            {/* Le créneau unique est rappelé sous le groupe, pour
                                qu'on voie l'heure et l'arène sans rien déplier. */}
                            {single && (
                              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line px-2.5 py-1.5 text-[10px] text-muted">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> {single.daysLabel} · {single.time}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> {single.salleName}
                                </span>
                                <span>Ens: {single.teacherName}</span>
                                <span className="font-bold text-ink">
                                  {formatDA(single.price)} / séance
                                </span>
                                {single.hasMonthly && (
                                  <span className="font-bold text-warning">
                                    {single.monthlySeances} séances ·{" "}
                                    {formatDA(single.monthlyPrice)} / carte
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      })}

                      {/* Les créneaux de la catégorie qu'aucun groupe ne
                          réclame : un emploi du temps créé sans groupe. */}
                      {shownOrphans.length > 0 && (
                        <div className="rounded-lg border border-dashed border-line bg-canvas/30 p-2">
                          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted">
                            Créneaux sans groupe
                          </span>
                          <div className="space-y-1.5">{shownOrphans.map(renderTiming)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Total cost of what is ticked */}
      {showTotal && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-xs">
          <span className="font-semibold text-muted">
            {selectedSubIds.length} créneau(x) sélectionné(s)
          </span>
          <span className="text-sm font-black text-primary">Coût total : {formatDA(totalCost)}</span>
        </div>
      )}

      {/* Les créneaux cochés — y compris ceux d'une catégorie qui n'est pas
          ouverte. Un clic sur la croix les décoche sans avoir à la rouvrir. */}
      {selectedSubIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSubIds.map((id) => {
            const option = timingOf(id);
            return (
              <span
                key={id}
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary-50/50 px-2 py-1 text-[10px] font-semibold text-ink"
              >
                {subLabel(id)} · {formatDA(subCost(id))}
                {option && (
                  <button
                    type="button"
                    title="Retirer cet emploi du temps"
                    onClick={() => onToggle(option)}
                    className="flex h-4 w-4 items-center justify-center rounded text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
