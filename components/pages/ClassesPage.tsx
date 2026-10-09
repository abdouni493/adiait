"use client";

/**
 * LES CATÉGORIES — groupe par groupe, et les chevaliers de chacun.
 *
 * L'écran répondait à « combien ? » ; il répond désormais à « qui, et où ? ».
 * Chaque catégorie s'ouvre sur ses GROUPES, chaque groupe sur ses emplois du
 * temps et la liste de ses chevaliers — avec leur N°, leur âge, la carte qu'ils
 * vivent et leur solde — et son effectif en grand.
 *
 * Les gestes sont VISIBLES sur chaque catégorie (Détails, Imprimer, Modifier,
 * Supprimer) : ils vivaient dans un menu déroulant que le survol de la carte —
 * une transformation CSS, qui devient le repère des éléments `fixed` —
 * enfermait sous la carte voisine, si bien que « Détails » ne s'ouvrait pas.
 *
 * Pour lire vite : une recherche (catégorie, groupe, chevalier, N°, téléphone),
 * les tranches d'âge, trois tris, une vue détaillée ou compacte, les groupes
 * vides à la demande, et « seulement les endettés ».
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Edit,
  Eye,
  LayoutGrid,
  Layers,
  List,
  Plus,
  Printer,
  Shield,
  Swords,
  Trash2,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { useData, uid } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
import { Input, SearchInput, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/lib/store/toast";
import { useT } from "@/lib/i18n/useT";
import { printHtmlDocument } from "@/lib/print";
import { categoryRosterHtml } from "@/lib/reports/documents";
import { categoryRoster, type CategoryRoster, type RosterBucket, type RosterStudent } from "@/lib/categoryRoster";
import type { SchoolClass } from "@/lib/types";
import { formatDA } from "@/lib/utils";
import {
  ageRangeLabel,
  carteShort,
  formatDays,
  salleName,
  sessionTimeLabel,
  studentMatches,
  teacherName,
} from "@/lib/helpers";
import { useCan } from "@/lib/usePermissions";

/** Les âges proposés par les deux listes. Un club de chevalerie accueille des
 *  enfants comme des adultes : la fourchette va large. */
const AGES = Array.from({ length: 68 }, (_, i) => i + 3); // 3 → 70 ans

type AgeFilter = "all" | "child" | "teen" | "adult";
type SortKey = "name" | "size" | "age";
type ViewMode = "detailed" | "compact";

const AGE_FILTERS: { value: AgeFilter; label: string; from: number; to: number }[] = [
  { value: "child", label: "Enfants (3 – 12 ans)", from: 3, to: 12 },
  { value: "teen", label: "Cadets (13 – 17 ans)", from: 13, to: 17 },
  { value: "adult", label: "Adultes (18 ans et plus)", from: 18, to: 120 },
];

/**
 * UNE COULEUR PAR CATÉGORIE, toujours la même (elle suit l'ordre de création).
 * Des teintes moyennes, lisibles en bandeau sur fond clair comme sur fond de
 * nuit ; le TEXTE, lui, reste à l'encre du thème.
 */
const HUES = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#dc2626",
  "#65a30d",
  "#4f46e5",
  "#0d9488",
];
const tint = (hue: string, pct: number) => `color-mix(in srgb, ${hue} ${pct}%, transparent)`;

/** Ce que l'écran garde d'une catégorie une fois la recherche appliquée. */
interface VisibleCategory {
  roster: CategoryRoster;
  hue: string;
  buckets: RosterBucket[];
}

export function ClassesPage() {
  const can = useCan("classes");
  const db = useData();
  const { classes, sessions, push, deleteFrom, updateItem } = db;
  const addToast = useToast((s) => s.addToast);
  const { tr } = useT();
  const { language } = useSettings();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selected, setSelected] = useState<SchoolClass | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // ---- LE FORMULAIRE : trois champs, et c'est tout ------------------------
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ageFrom, setAgeFrom] = useState(18);
  const [ageTo, setAgeTo] = useState(25);
  const [error, setError] = useState("");

  // ---- CE QUI DÉCIDE DE CE QUI S'AFFICHE -----------------------------------
  const [filter, setFilter] = useState<AgeFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [view, setView] = useState<ViewMode>("detailed");
  const [showEmpty, setShowEmpty] = useState(false);
  const [debtOnly, setDebtOnly] = useState(false);
  /** les catégories repliées — toutes dépliées à l'ouverture */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const resetForm = () => {
    setName("");
    setDescription("");
    setAgeFrom(18);
    setAgeTo(25);
    setError("");
  };

  /**
   * CE QUI EMPÊCHE D'ENREGISTRER.
   *
   * Deux choses seulement : une catégorie sans nom, et une tranche d'âge à
   * l'envers. Le message est rendu ici plutôt que jeté au moment du clic, pour
   * que le bouton puisse être désactivé et que la raison soit lisible AVANT.
   */
  const problem = useMemo(() => {
    if (!name.trim()) return "Donnez un nom à la catégorie.";
    if (ageTo < ageFrom) return "L'âge maximum ne peut pas être inférieur à l'âge minimum.";
    return "";
  }, [name, ageTo, ageFrom]);

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim(),
    ageFrom,
    ageTo,
  });

  const handleCreate = () => {
    if (problem) return setError(problem);
    push("classes", { id: uid("cls"), ...buildPayload() } as SchoolClass);
    addToast({
      type: "success",
      title: "Catégorie créée",
      message: `${name.trim()} — ${ageRangeLabel(ageFrom, ageTo)}.`,
    });
    resetForm();
    setIsCreateOpen(false);
  };

  const handleEdit = () => {
    if (!selected) return;
    if (problem) return setError(problem);
    updateItem("classes", selected.id, buildPayload());
    addToast({ type: "success", title: "Catégorie modifiée", message: name.trim() });
    setIsEditOpen(false);
  };

  const openEdit = (cls: SchoolClass) => {
    setSelected(cls);
    setName(cls.name);
    setDescription(cls.description || "");
    setAgeFrom(cls.ageFrom ?? 18);
    setAgeTo(cls.ageTo ?? 25);
    setError("");
    setIsEditOpen(true);
  };

  /**
   * SUPPRIMER UNE CATÉGORIE QUI SERT ENCORE.
   *
   * Un emploi du temps pointe dessus, des chevaliers y sont inscrits : effacer
   * la ligne les laisserait rattachés à un identifiant qui ne désigne plus
   * rien. On refuse, et on dit précisément ce qui retient.
   */
  const handleDelete = (cls: SchoolClass) => {
    const used = sessions.filter((s) => s.classId === cls.id || s.classIds?.includes(cls.id));
    if (used.length > 0) {
      addToast({
        type: "danger",
        title: "Suppression refusée",
        message: `${used.length} emploi(s) du temps utilisent encore « ${cls.name} ».`,
      });
      return;
    }
    if (!confirm(`Supprimer la catégorie « ${cls.name} » ?`)) return;
    deleteFrom("classes", cls.id);
  };

  const printRoster = (roster: CategoryRoster, onlyKey?: string) =>
    printHtmlDocument(categoryRosterHtml(db, roster, { language, onlyKey }));

  // ---- Les catégories, découpées en groupes --------------------------------
  const rosters = useMemo(
    () =>
      classes
        .map((cls, i) => {
          const roster = categoryRoster(db, cls.id);
          return roster ? { roster, hue: HUES[i % HUES.length] } : null;
        })
        .filter(Boolean) as { roster: CategoryRoster; hue: string }[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      classes,
      db.groups,
      db.sessions,
      db.subscriptions,
      db.students,
      db.enrollments,
      db.attendance,
    ],
  );

  /**
   * LA RECHERCHE TAILLE AU PLUS JUSTE.
   *
   * Le nom d'une CATÉGORIE la montre en entier ; celui d'un GROUPE ne montre que
   * ce groupe ; un CHEVALIER (nom, N°, téléphone) ne montre que les groupes où
   * il est — et, dans ces groupes, que lui.
   */
  const visible = useMemo<VisibleCategory[]>(() => {
    const q = query.trim().toLowerCase();
    const band = AGE_FILTERS.find((f) => f.value === filter);
    const out: VisibleCategory[] = [];

    for (const { roster, hue } of rosters) {
      const cls = roster.cls;
      // Une catégorie apparaît dès que sa tranche CHEVAUCHE la bande choisie.
      if (band && !((cls.ageFrom ?? 0) <= band.to && (cls.ageTo ?? 120) >= band.from)) continue;

      const classHit =
        !q ||
        cls.name.toLowerCase().includes(q) ||
        (cls.description ?? "").toLowerCase().includes(q);

      let buckets = roster.buckets.map((b) => {
        let students = b.students;
        if (debtOnly) students = students.filter((s) => s.sold < 0 && !s.free);
        if (q && !classHit && !b.name.toLowerCase().includes(q)) {
          students = students.filter((s) => studentMatches(db, s.student, q));
        }
        return { ...b, students };
      });

      if (q && !classHit) {
        buckets = buckets.filter(
          (b) =>
            b.students.length > 0 ||
            (b.name.toLowerCase().includes(q) && (!debtOnly || b.students.length > 0)),
        );
        if (buckets.length === 0) continue;
      }
      if (debtOnly) buckets = buckets.filter((b) => b.students.length > 0);
      else if (!showEmpty) buckets = buckets.filter((b) => b.students.length > 0);
      if (debtOnly && buckets.length === 0) continue;

      out.push({ roster, hue, buckets });
    }

    const byName = (a: VisibleCategory, b: VisibleCategory) =>
      a.roster.cls.name.localeCompare(b.roster.cls.name);
    out.sort((a, b) =>
      sort === "size"
        ? b.roster.total - a.roster.total || byName(a, b)
        : sort === "age"
          ? (a.roster.cls.ageFrom ?? 0) - (b.roster.cls.ageFrom ?? 0) || byName(a, b)
          : byName(a, b),
    );
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosters, query, filter, sort, showEmpty, debtOnly]);

  // ---- Les chiffres du haut — ceux de ce qui est affiché -------------------
  const totals = useMemo(() => {
    const students = new Set<string>();
    const debtors = new Set<string>();
    let groups = 0;
    let debt = 0;
    for (const v of visible) {
      groups += v.roster.activeGroups;
      debt += v.roster.debt;
      for (const b of v.roster.buckets) {
        for (const s of b.students) {
          students.add(s.student.id);
          if (s.sold < 0 && !s.free) debtors.add(s.student.id);
        }
      }
    }
    return { students: students.size, debtors: debtors.size, groups, debt };
  }, [visible]);

  const detailsEntry = rosters.find((r) => r.roster.cls.id === detailsId);
  const allCollapsed = visible.length > 0 && visible.every((v) => collapsed.has(v.roster.cls.id));

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- Les champs partagés par la création et la modification -------------
  const FormFields = (
    <div className="space-y-4">
      <div>
        <label htmlFor="cat-name" className="mb-1.5 block text-xs font-semibold text-muted">
          {tr("Nom de la catégorie")} <span className="text-danger">*</span>
        </label>
        <Input
          id="cat-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          placeholder="Ex. Chevaliers d'Or, Écuyers, Novices…"
          autoFocus
        />
      </div>

      <div>
        <label htmlFor="cat-desc" className="mb-1.5 block text-xs font-semibold text-muted">
          {tr("Description")}
        </label>
        <textarea
          id="cat-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={tr("Ce que cette catégorie regroupe, son niveau d'exigence…")}
          rows={3}
          className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none"
        />
      </div>

      {/* ---- La tranche d'âge ---- */}
      <fieldset className="rounded-xl border border-line bg-canvas/60 p-4">
        <legend className="px-1.5 text-xs font-bold text-accent-ink">{tr("Tranche d'âge")}</legend>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[110px] flex-1">
            <label htmlFor="cat-from" className="mb-1.5 block text-[11px] font-semibold text-muted">
              {tr("De")}
            </label>
            <Select
              id="cat-from"
              className="w-full"
              value={ageFrom}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAgeFrom(v);
                // Remonter le plancher au-dessus du plafond n'a pas de sens :
                // on pousse le plafond plutôt que de refuser la saisie.
                if (v > ageTo) setAgeTo(v);
                setError("");
              }}
            >
              {AGES.map((a) => (
                <option key={a} value={a}>
                  {a} ans
                </option>
              ))}
            </Select>
          </div>
          <span className="pb-2.5 text-sm font-semibold text-muted">{tr("à")}</span>
          <div className="min-w-[110px] flex-1">
            <label htmlFor="cat-to" className="mb-1.5 block text-[11px] font-semibold text-muted">
              {tr("Jusqu'à")}
            </label>
            <Select
              id="cat-to"
              className="w-full"
              value={ageTo}
              onChange={(e) => {
                setAgeTo(Number(e.target.value));
                setError("");
              }}
            >
              {AGES.filter((a) => a >= ageFrom).map((a) => (
                <option key={a} value={a}>
                  {a} ans
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="mt-2.5 text-[11px] text-muted">
          {tr("Cette catégorie accueillera les chevaliers")}{" "}
          <strong className="text-accent-ink">{ageRangeLabel(ageFrom, ageTo)}</strong>.
        </p>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {tr(error)}
        </p>
      )}
    </div>
  );

  const chip = (active: boolean) =>
    `cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? "border-accent/40 bg-accent/15 text-accent-ink"
        : "border-line text-muted hover:border-accent/30 hover:text-ink"
    }`;

  return (
    <div>
      <PageHeader
        icon={Shield}
        title="Catégories"
        subtitle="Les catégories de l'Ordre, leurs groupes et les chevaliers de chacun"
        actions={
          can("create") ? (
            <Button
              onClick={() => {
                resetForm();
                setIsCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> {tr("Nouvelle catégorie")}
            </Button>
          ) : undefined
        }
      />

      {/* ---- Les chiffres de ce qui est affiché ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Shield} label="Catégories" value={visible.length} tone="primary" index={0} />
        <StatCard icon={Layers} label="Groupes actifs" value={totals.groups} tone="accent" index={1} />
        <StatCard icon={Users} label="Chevaliers inscrits" value={totals.students} tone="success" index={2} />
        <StatCard
          icon={Wallet}
          label="Chevaliers en dette"
          value={totals.debtors > 0 ? `${totals.debtors} · ${formatDA(totals.debt)}` : 0}
          tone={totals.debtors > 0 ? "danger" : "success"}
          index={3}
        />
      </div>

      {/* ---- La barre d'outils ---- */}
      <div className="mb-6 space-y-3 rounded-2xl border border-line bg-surface p-3 card-shadow sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Rechercher une catégorie, un groupe, un chevalier, un N°…"
            className="min-w-[220px] flex-1"
          />
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-auto"
            aria-label={tr("Trier")}
          >
            <option value="name">Trier par nom</option>
            <option value="size">Trier par effectif</option>
            <option value="age">Trier par âge</option>
          </Select>
          <div className="flex items-center gap-1 rounded-xl border border-line bg-canvas p-1">
            <button
              onClick={() => setView("detailed")}
              aria-pressed={view === "detailed"}
              title={tr("Détaillé")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                view === "detailed" ? "bg-primary text-white" : "text-muted hover:text-ink"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {tr("Détaillé")}
            </button>
            <button
              onClick={() => setView("compact")}
              aria-pressed={view === "compact"}
              title={tr("Compact")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                view === "compact" ? "bg-primary text-white" : "text-muted hover:text-ink"
              }`}
            >
              <List className="h-3.5 w-3.5" /> {tr("Compact")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">{tr("Filtrer par âge :")}</span>
          <button onClick={() => setFilter("all")} className={chip(filter === "all")}>
            {tr("Toutes")}
          </button>
          {AGE_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)} className={chip(filter === f.value)}>
              {tr(f.label)}
            </button>
          ))}

          <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" aria-hidden="true" />

          <button
            onClick={() => setDebtOnly((v) => !v)}
            aria-pressed={debtOnly}
            className={`${chip(debtOnly)} inline-flex items-center gap-1.5`}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> {tr("Seulement les endettés")}
          </button>
          <button
            onClick={() => setShowEmpty((v) => !v)}
            aria-pressed={showEmpty}
            className={`${chip(showEmpty)} inline-flex items-center gap-1.5`}
          >
            <Layers className="h-3.5 w-3.5" /> {tr("Groupes vides")}
          </button>
          <button
            onClick={() =>
              setCollapsed(allCollapsed ? new Set() : new Set(visible.map((v) => v.roster.cls.id)))
            }
            className={`${chip(false)} ms-auto inline-flex items-center gap-1.5`}
          >
            {allCollapsed ? (
              <ChevronsUpDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronsDownUp className="h-3.5 w-3.5" />
            )}
            {tr(allCollapsed ? "Tout déplier" : "Tout replier")}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Shield}
          message={
            classes.length === 0
              ? "Aucune catégorie pour le moment."
              : "Aucune catégorie ne correspond à ces critères."
          }
          hint={
            classes.length === 0
              ? "Créez-en une : un nom, une description, et les âges qu'elle accueille."
              : undefined
          }
          action={
            classes.length === 0 && can("create") ? (
              <Button
                onClick={() => {
                  resetForm();
                  setIsCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> {tr("Nouvelle catégorie")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {visible.map((v, i) => (
            <CategorySection
              key={v.roster.cls.id}
              entry={v}
              index={i}
              view={view}
              open={!collapsed.has(v.roster.cls.id)}
              onToggle={() => toggle(v.roster.cls.id)}
              canView={can("view")}
              canEdit={can("edit")}
              canDelete={can("delete")}
              onDetails={() => setDetailsId(v.roster.cls.id)}
              onEdit={() => openEdit(v.roster.cls)}
              onDelete={() => handleDelete(v.roster.cls)}
              onPrint={(onlyKey) => printRoster(v.roster, onlyKey)}
            />
          ))}
        </div>
      )}

      {/* ---- Création ---- */}
      <Modal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Nouvelle catégorie"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={!!problem}>
              Créer la catégorie
            </Button>
          </>
        }
      >
        {FormFields}
      </Modal>

      {/* ---- Modification ---- */}
      <Modal
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Modifier la catégorie"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleEdit} disabled={!!problem}>
              Enregistrer
            </Button>
          </>
        }
      >
        {FormFields}
      </Modal>

      {/* ---- Détails ---- */}
      <CategoryDetailsModal
        entry={detailsEntry ?? null}
        onClose={() => setDetailsId(null)}
        canEdit={can("edit")}
        onEdit={(cls) => {
          setDetailsId(null);
          openEdit(cls);
        }}
        onPrint={(roster, onlyKey) => printRoster(roster, onlyKey)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
//  UNE CATÉGORIE
// ---------------------------------------------------------------------------

function CategorySection({
  entry,
  index,
  view,
  open,
  onToggle,
  canView,
  canEdit,
  canDelete,
  onDetails,
  onEdit,
  onDelete,
  onPrint,
}: {
  entry: VisibleCategory;
  index: number;
  view: ViewMode;
  open: boolean;
  onToggle: () => void;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrint: (onlyKey?: string) => void;
}) {
  const { tr } = useT();
  const { roster, hue, buckets } = entry;
  const cls = roster.cls;
  const largest = Math.max(1, ...buckets.map((b) => b.students.length));

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.28 }}
      className="overflow-hidden rounded-2xl border border-line bg-surface card-shadow"
      aria-label={cls.name}
    >
      <div className="h-1.5" style={{ background: hue }} aria-hidden="true" />

      {/* ---- L'en-tête : qui, combien, et les gestes ---- */}
      {/* Sur un téléphone, les gestes passent SOUS le titre : à côté, ils
          écrasaient la colonne du nom jusqu'à un mot par ligne. */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: tint(hue, 14), color: hue }}
            aria-hidden="true"
          >
            <Shield className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display truncate text-lg font-bold text-ink">{cls.name}</h3>
              <Badge tone="accent" className="whitespace-nowrap">
                {ageRangeLabel(cls.ageFrom, cls.ageTo)}
              </Badge>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">
              {cls.description || tr("Aucune description")}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <Pill icon={Users} hue={hue}>
                {roster.total} {tr("chevaliers")}
              </Pill>
              <Pill icon={Layers} hue={hue}>
                {roster.activeGroups} {tr("groupes")}
              </Pill>
              <Pill icon={CalendarDays} hue={hue}>
                {roster.sessions.length} {tr("emplois du temps")}
              </Pill>
              {roster.debtors > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-danger/10 px-2.5 py-1 text-danger ring-1 ring-danger/25">
                  <AlertTriangle className="h-3 w-3" />
                  {roster.debtors} {tr("en dette")} · {formatDA(roster.debt)}
                </span>
              )}
              {roster.outOfAge > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-warning ring-1 ring-warning/25">
                  {roster.outOfAge} {tr("hors tranche")}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
          {canView && (
            <Button size="sm" variant="outline" onClick={onDetails} className="gap-1.5">
              <Eye className="h-3.5 w-3.5" /> {tr("Détails")}
            </Button>
          )}
          <IconButton title={tr("Imprimer la liste")} onClick={() => onPrint()}>
            <Printer className="h-4 w-4" />
          </IconButton>
          {canEdit && (
            <IconButton title={tr("Modifier")} onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </IconButton>
          )}
          {canDelete && (
            <IconButton title={tr("Supprimer")} onClick={onDelete} danger>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton
            title={tr(open ? "Replier" : "Déplier")}
            onClick={onToggle}
            aria-expanded={open}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </IconButton>
        </div>
      </div>

      {/* ---- Les groupes ---- */}
      {open && (
        <div className="border-t border-line bg-canvas/40 p-3 sm:p-4">
          {buckets.length === 0 ? (
            <p className="py-6 text-center text-xs italic text-muted">
              {tr("Aucun chevalier inscrit dans cette catégorie.")}
            </p>
          ) : view === "compact" ? (
            <GroupsTable buckets={buckets} hue={hue} onPrint={onPrint} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {buckets.map((b) => (
                <GroupPanel
                  key={b.key}
                  bucket={b}
                  hue={hue}
                  share={b.students.length / largest}
                  onPrint={() => onPrint(b.key)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}

function Pill({
  icon: Icon,
  hue,
  children,
}: {
  icon: typeof Users;
  hue: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-ink"
      style={{ background: tint(hue, 10), boxShadow: `inset 0 0 0 1px ${tint(hue, 28)}` }}
    >
      <Icon className="h-3 w-3" style={{ color: hue }} />
      {children}
    </span>
  );
}

function IconButton({
  title,
  onClick,
  danger,
  children,
  ...rest
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-line transition-colors ${
        danger
          ? "text-danger hover:border-danger/40 hover:bg-danger/10"
          : "text-muted hover:border-accent/40 hover:bg-primary-50 hover:text-ink"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

const bucketKindLabel = (b: RosterBucket) =>
  b.kind === "group" ? "Groupe" : b.kind === "nogroup" ? "Emploi sans groupe" : "En attente d'un créneau";

// ---------------------------------------------------------------------------
//  UN GROUPE, ET SES CHEVALIERS
// ---------------------------------------------------------------------------

function GroupPanel({
  bucket,
  hue,
  share,
  onPrint,
}: {
  bucket: RosterBucket;
  hue: string;
  share: number;
  onPrint: () => void;
}) {
  const { tr } = useT();
  const db = useData();
  const muted = bucket.kind !== "group";

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div
        className="flex items-start justify-between gap-2 px-3 pb-2 pt-3"
        style={{ borderTop: `3px solid ${muted ? "var(--border)" : hue}` }}
      >
        <div className="min-w-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${muted ? "text-warning" : "text-muted"}`}
          >
            {tr(bucketKindLabel(bucket))}
          </span>
          <strong className="block truncate text-sm text-ink" title={bucket.name}>
            {bucket.kind === "pending" ? tr(bucket.name) : bucket.name}
          </strong>
        </div>
        <div className="shrink-0 text-end">
          <span className="block text-2xl font-black leading-none tabular-nums text-ink">
            {bucket.students.length}
          </span>
          <span className="text-[10px] text-muted">{tr("chevaliers")}</span>
        </div>
      </div>

      {/* La part du groupe dans la catégorie, d'un coup d'œil. */}
      <div className="mx-3 h-1 overflow-hidden rounded-full bg-line/60" aria-hidden="true">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round(share * 100)}%`, background: muted ? "var(--warning)" : hue }}
        />
      </div>

      {bucket.sessions.length > 0 && (
        <ul className="space-y-1 px-3 pt-2 text-[11px] text-muted">
          {bucket.sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <CalendarDays className="h-3 w-3 shrink-0" style={{ color: hue }} />
              <span className="font-semibold text-ink">{s.title || tr("Emploi du temps")}</span>
              <span>{formatDays(s.days)}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {sessionTimeLabel(s)}
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" /> {teacherName(db, s.teacherId)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {bucket.students.length === 0 ? (
        <p className="flex-1 px-3 py-5 text-center text-xs italic text-muted">
          {tr("Aucun chevalier dans ce groupe.")}
        </p>
      ) : (
        <ul className="mt-2 max-h-72 flex-1 divide-y divide-line/60 overflow-y-auto border-t border-line/60">
          {bucket.students.map((s) => (
            <StudentLine key={`${s.student.id}-${s.sessionId ?? ""}`} s={s} />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line/60 bg-canvas/40 px-3 py-2 text-[11px]">
        {bucket.debtors > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-danger">
            <AlertTriangle className="h-3 w-3" />
            {bucket.debtors} {tr("en dette")} · {formatDA(bucket.debt)}
          </span>
        ) : (
          <span className="font-semibold text-success">{tr("Tout le groupe est à jour")}</span>
        )}
        {bucket.students.length > 0 && (
          <button
            onClick={onPrint}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-muted hover:bg-primary-50 hover:text-ink"
          >
            <Printer className="h-3 w-3" /> {tr("Imprimer")}
          </button>
        )}
      </div>
    </div>
  );
}

function SoldPill({ s }: { s: RosterStudent }) {
  const { tr } = useT();
  if (s.free) return <Badge tone="success" className="text-[10px]">{tr("offert")}</Badge>;
  if (!s.subscriptionId) return <Badge tone="neutral" className="text-[10px]">—</Badge>;
  const tone = s.sold < 0 ? "danger" : s.sold === 0 ? "warning" : "success";
  return (
    <Badge
      tone={tone}
      className="font-mono text-[10px]"
      title={s.sold < 0 ? tr("Reste dû sur cet emploi du temps") : tr("Solde de l'emploi du temps")}
    >
      {s.sold < 0 ? `−${formatDA(-s.sold)}` : formatDA(s.sold)}
    </Badge>
  );
}

function StudentLine({ s }: { s: RosterStudent }) {
  const { tr } = useT();
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-primary-50/40">
      <span className="w-11 shrink-0 font-mono text-[10px] text-muted">{s.number}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink" title={s.name}>
          {s.name}
        </span>
        <span className="block truncate text-[10px] text-muted">
          {s.age !== null ? `${s.age} ${tr("ans")}` : tr("Âge inconnu")}
          {s.student.phone ? ` · ${s.student.phone}` : ""}
          {s.outOfAge && <span className="font-semibold text-warning"> · {tr("hors tranche")}</span>}
        </span>
      </span>
      {s.cardCode && (
        <span className="shrink-0 rounded-md bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary">
          {carteShort(s.cardCode)}
        </span>
      )}
      <SoldPill s={s} />
    </li>
  );
}

// ---------------------------------------------------------------------------
//  LA VUE COMPACTE : un tableau de groupes
// ---------------------------------------------------------------------------

function GroupsTable({
  buckets,
  hue,
  onPrint,
}: {
  buckets: RosterBucket[];
  hue: string;
  onPrint: (onlyKey?: string) => void;
}) {
  const { tr } = useT();
  const db = useData();
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[620px] text-xs">
        <thead>
          <tr className="border-b border-line text-start text-[10px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2 text-start">{tr("Groupe")}</th>
            <th className="px-3 py-2 text-start">{tr("Emplois du temps")}</th>
            <th className="px-3 py-2 text-start">{tr("Entraîneur")}</th>
            <th className="px-3 py-2 text-end">{tr("Chevaliers")}</th>
            <th className="px-3 py-2 text-end">{tr("En dette")}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key} className="border-b border-line/60 last:border-0 hover:bg-primary-50/30">
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: b.kind === "group" ? hue : "var(--warning)" }}
                  />
                  <span>
                    <strong className="block text-ink">
                      {b.kind === "pending" ? tr(b.name) : b.name}
                    </strong>
                    <span className="text-[10px] text-muted">{tr(bucketKindLabel(b))}</span>
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-muted">
                {b.sessions.length === 0
                  ? "—"
                  : b.sessions.map((s) => (
                      <span key={s.id} className="block">
                        {s.title || tr("Emploi du temps")} · {formatDays(s.days)} · {sessionTimeLabel(s)}
                      </span>
                    ))}
              </td>
              <td className="px-3 py-2 text-muted">
                {[...new Set(b.sessions.map((s) => teacherName(db, s.teacherId)))].join(", ") || "—"}
              </td>
              <td className="px-3 py-2 text-end text-base font-black tabular-nums text-ink">
                {b.students.length}
              </td>
              <td className="px-3 py-2 text-end">
                {b.debtors > 0 ? (
                  <span className="font-semibold text-danger">
                    {b.debtors} · {formatDA(b.debt)}
                  </span>
                ) : (
                  <span className="text-success">✓</span>
                )}
              </td>
              <td className="px-3 py-2 text-end">
                {b.students.length > 0 && (
                  <button
                    onClick={() => onPrint(b.key)}
                    title={tr("Imprimer la liste")}
                    className="rounded-md p-1 text-muted hover:bg-primary-50 hover:text-ink"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  LES DÉTAILS D'UNE CATÉGORIE
// ---------------------------------------------------------------------------

function CategoryDetailsModal({
  entry,
  onClose,
  canEdit,
  onEdit,
  onPrint,
}: {
  entry: { roster: CategoryRoster; hue: string } | null;
  onClose: () => void;
  canEdit: boolean;
  onEdit: (cls: SchoolClass) => void;
  onPrint: (roster: CategoryRoster, onlyKey?: string) => void;
}) {
  const { tr } = useT();
  const db = useData();
  const [search, setSearch] = useState("");
  const [groupKey, setGroupKey] = useState("all");
  const [onlyDebt, setOnlyDebt] = useState(false);

  const roster = entry?.roster;
  const hue = entry?.hue ?? HUES[0];

  /** Tous ses chevaliers, une ligne par (chevalier, groupe). */
  const rows = useMemo(() => {
    if (!roster) return [];
    const q = search.trim();
    return roster.buckets
      .filter((b) => groupKey === "all" || b.key === groupKey)
      .flatMap((b) => b.students.map((s) => ({ s, bucket: b })))
      .filter(({ s }) => (!onlyDebt || (s.sold < 0 && !s.free)) && (!q || studentMatches(db, s.student, q)))
      .sort((a, b) => a.s.name.localeCompare(b.s.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, search, groupKey, onlyDebt]);

  if (!roster) return <Modal open={false} onClose={onClose}>{null}</Modal>;
  const cls = roster.cls;

  const groupsTab = (
    <div className="space-y-3">
      {roster.buckets.length === 0 && (
        <p className="py-6 text-center text-xs italic text-muted">
          {tr("Aucun chevalier inscrit dans cette catégorie.")}
        </p>
      )}
      {roster.buckets.map((b) => (
        <details
          key={b.key}
          open={b.students.length > 0 && b.students.length <= 40}
          className="group overflow-hidden rounded-xl border border-line bg-surface"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 hover:bg-primary-50/40">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: b.kind === "group" ? hue : "var(--warning)" }}
              />
              <span className="min-w-0">
                <strong className="block truncate text-sm text-ink">
                  {b.kind === "pending" ? tr(b.name) : b.name}
                </strong>
                <span className="text-[10px] text-muted">
                  {tr(bucketKindLabel(b))}
                  {b.sessions.length > 0 &&
                    ` · ${b.sessions.map((s) => `${formatDays(s.days)} ${sessionTimeLabel(s)}`).join(" / ")}`}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {b.debtors > 0 && (
                <Badge tone="danger" className="text-[10px]">
                  {b.debtors} {tr("en dette")}
                </Badge>
              )}
              <Badge tone="primary" className="font-mono">
                {b.students.length}
              </Badge>
              <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
            </span>
          </summary>
          {b.students.length > 0 ? (
            <ul className="divide-y divide-line/60 border-t border-line/60">
              {b.students.map((s) => (
                <StudentLine key={`${s.student.id}-${s.sessionId ?? ""}`} s={s} />
              ))}
            </ul>
          ) : (
            <p className="border-t border-line/60 px-3 py-3 text-xs italic text-muted">
              {tr("Aucun chevalier dans ce groupe.")}
            </p>
          )}
        </details>
      ))}
    </div>
  );

  const studentsTab = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Nom, N° ou téléphone…"
          className="min-w-[180px] flex-1"
        />
        <Select value={groupKey} onChange={(e) => setGroupKey(e.target.value)} className="w-auto">
          <option value="all">Tous les groupes</option>
          {roster.buckets.map((b) => (
            <option key={b.key} value={b.key}>
              {b.kind === "pending" ? tr(b.name) : b.name} ({b.students.length})
            </option>
          ))}
        </Select>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted">
          <input
            type="checkbox"
            checked={onlyDebt}
            onChange={(e) => setOnlyDebt(e.target.checked)}
            className="h-4 w-4 accent-[var(--danger)]"
          />
          {tr("Seulement les endettés")}
        </label>
      </div>
      <div className="max-h-[50vh] overflow-auto rounded-xl border border-line">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-[10px] uppercase tracking-wider text-muted">
              <th className="px-2 py-2 text-start">{tr("N°")}</th>
              <th className="px-2 py-2 text-start">{tr("Chevalier")}</th>
              <th className="px-2 py-2 text-start">{tr("Groupe")}</th>
              <th className="px-2 py-2 text-center">{tr("Âge")}</th>
              <th className="px-2 py-2 text-start">{tr("Téléphone")}</th>
              <th className="px-2 py-2 text-center">{tr("Carte")}</th>
              <th className="px-2 py-2 text-end">{tr("Solde")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center italic text-muted">
                  {tr("Aucun résultat")}
                </td>
              </tr>
            ) : (
              rows.map(({ s, bucket }) => (
                <tr key={`${s.student.id}-${bucket.key}`} className="border-b border-line/60 last:border-0">
                  <td className="px-2 py-1.5 font-mono text-[10px] text-muted">{s.number}</td>
                  <td className="px-2 py-1.5 font-semibold text-ink">
                    {s.name}
                    {s.outOfAge && (
                      <span className="ms-1 text-[10px] font-semibold text-warning">({tr("hors tranche")})</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-muted">
                    {bucket.kind === "pending" ? tr(bucket.name) : bucket.name}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{s.age ?? "—"}</td>
                  <td className="px-2 py-1.5 text-muted">{s.student.phone || "—"}</td>
                  <td className="px-2 py-1.5 text-center">{s.cardCode ? carteShort(s.cardCode) : "—"}</td>
                  <td className="px-2 py-1.5 text-end">
                    <SoldPill s={s} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">
        {rows.length} {tr("ligne(s)")}
      </p>
    </div>
  );

  const sessionsTab = (
    <div className="space-y-2">
      {roster.sessions.length === 0 ? (
        <p className="py-6 text-center text-xs italic text-muted">
          {tr("Aucun emploi du temps affecté à cette catégorie.")}
        </p>
      ) : (
        roster.sessions.map((s) => {
          const sub = db.subscriptions.find((x) => x.sessionId === s.id && !x.archivedAt);
          const count = sub ? db.students.filter((st) => st.subscriptionIds.includes(sub.id)).length : 0;
          return (
            <div key={s.id} className="rounded-xl border border-line bg-surface p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm text-ink">{s.title || tr("Emploi du temps")}</strong>
                <Badge tone="primary" className="font-mono">
                  {count} {tr("chevaliers")}
                </Badge>
              </div>
              <div className="mt-1.5 grid grid-cols-1 gap-1 text-muted sm:grid-cols-2">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> {formatDays(s.days)} · {sessionTimeLabel(s)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> {teacherName(db, s.teacherId)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Swords className="h-3.5 w-3.5" /> {tr("Arène")} : {salleName(db, s.salleId)}
                </span>
                {sub && (
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" /> {formatDA(sub.pricePerSession)} / {tr("séance")}
                    {sub.monthlyPrice ? ` · ${formatDA(sub.monthlyPrice)} / ${tr("carte")}` : ""}
                  </span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={cls.name}
      wide
      footer={
        <>
          <Button variant="outline" onClick={() => onPrint(roster)} className="gap-1.5">
            <Printer className="h-4 w-4" /> {tr("Imprimer la liste")}
          </Button>
          {canEdit && (
            <Button variant="outline" onClick={() => onEdit(cls)} className="gap-1.5">
              <Edit className="h-4 w-4" /> {tr("Modifier")}
            </Button>
          )}
          <Button onClick={onClose}>Fermer</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="h-1.5 rounded-full" style={{ background: hue }} aria-hidden="true" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <MiniStat label={tr("Tranche d'âge")} value={ageRangeLabel(cls.ageFrom, cls.ageTo)} />
          <MiniStat label={tr("Groupes")} value={String(roster.activeGroups)} />
          <MiniStat label={tr("Chevaliers")} value={String(roster.total)} />
          <MiniStat label={tr("Emplois du temps")} value={String(roster.sessions.length)} />
          <MiniStat
            label={tr("En dette")}
            value={roster.debtors > 0 ? `${roster.debtors} · ${formatDA(roster.debt)}` : "0"}
            danger={roster.debtors > 0}
          />
        </div>
        {cls.description && (
          <p className="rounded-xl border border-line bg-canvas/50 p-3 text-sm text-ink">{cls.description}</p>
        )}
        <Tabs
          tabs={[
            { id: "groups", label: "Groupes", content: groupsTab },
            { id: "students", label: "Chevaliers", content: studentsTab },
            { id: "sessions", label: "Emplois du temps", content: sessionsTab },
          ]}
        />
      </div>
    </Modal>
  );
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/50 px-3 py-2">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className={`block text-sm font-bold tabular-nums ${danger ? "text-danger" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}
