"use client";

/**
 * **PROGRAMME GROUPE** — une sortie du club vendue à un groupe entier, sans
 * nommer un seul chevalier.
 *
 * La réception choisit SES ENCADRANTS (un, deux, trois — une sortie se mène
 * rarement seul), les AUTRES QUI PARTENT AVEC (chauffeur, infirmier, intendant
 * : ils ne touchent rien sur le prix, ils sont salariés par ailleurs, mais un
 * programme doit dire qui était là), la NATURE de la sortie, la date, les
 * horaires, puis tape trois nombres : combien de chevaliers, combien paie un
 * chevalier, et combien le club garde sur ce prix. Tout le reste se calcule :
 *
 *     part entraîneur par chevalier = prix chevalier − part club
 *     total encaissé            = chevaliers × prix chevalier
 *     total club               = chevaliers × part club
 *     total entraîneur          = chevaliers × part entraîneur
 *
 * LA PART ENTRAÎNEUR SE PARTAGE À PARTS ÉGALES entre ceux qui sont partis. Le
 * club verse le même total ; c'est sa répartition qui change, et chacun la lit
 * sur sa propre fiche de paie.
 *
 * À la création, l'écran propose d'imprimer la **fiche de paie** de
 * l'encadrant principal — qui n'affiche jamais la part du club. Le programme
 * apparaît ensuite dans l'historique de paiement de chaque encadrant, dans la
 * caisse et dans les rapports ; le modifier ou le supprimer déplace ces
 * trois-là avec lui.
 */

import { useMemo, useState } from "react";
import { useData, uid } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { useToast } from "@/lib/store/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/SearchInput";
import { printHtmlDocument } from "@/lib/print";
import { groupSeancePayslipHtml } from "@/lib/reports/groupSeance";
import { formatDA } from "@/lib/utils";
import { formatDateFr, groupSeanceTotals, groupSeanceTrainers, todayIso } from "@/lib/helpers";
import type { GroupSeance } from "@/lib/types";
import {
  Briefcase,
  CalendarRange,
  Check,
  Edit,
  Eye,
  Plus,
  Printer,
  Search,
  Tag,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";

interface Draft {
  id: string;
  /** tous les encadrants ; le premier est le principal */
  teacherIds: string[];
  /** les autres qui partent : chauffeur, infirmier, intendant… */
  workerIds: string[];
  /** la nature de la sortie */
  categoryId: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  studentsCount: number;
  pricePerStudent: number;
  schoolPerStudent: number;
}

const emptyDraft = (): Draft => ({
  id: uid("gsl"),
  teacherIds: [],
  workerIds: [],
  categoryId: "",
  title: "",
  description: "",
  date: todayIso(),
  startTime: "08:00",
  endTime: "10:00",
  studentsCount: 0,
  pricePerStudent: 0,
  schoolPerStudent: 0,
});

export function GroupSeanceSection({
  openTick = 0,
}: {
  /**
   * LE BOUTON « PROGRAMME GROUPE » DU HAUT DE L'ÉCRAN.
   *
   * Un COMPTEUR, et non un booléen : le parent l'incrémente à chaque clic, et
   * la section ouvre son formulaire dès qu'elle voit un nombre qu'elle ne
   * connaît pas. Un booléen aurait demandé au parent de le remettre à faux —
   * donc à la section de modifier l'état de son parent pendant son propre
   * rendu, ce que React refuse à juste titre.
   */
  openTick?: number;
} = {}) {
  const db = useData();
  const {
    groupSeances,
    teachers,
    reception,
    programCategories,
    saveGroupSeance,
    deleteGroupSeance,
    saveProgramCategory,
    deleteProgramCategory,
  } = db;
  const { language } = useSettings();
  const { addToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  /** le dernier clic du bouton du haut que la section a déjà honoré */
  const [seenTick, setSeenTick] = useState(openTick);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [teacherQuery, setTeacherQuery] = useState("");
  /** la recherche des AUTRES qui partent — chauffeur, infirmier, intendant… */
  const [workerQuery, setWorkerQuery] = useState("");
  /** la saisie d'une nature de sortie, sans quitter le formulaire */
  const [newCategory, setNewCategory] = useState("");
  const [listQuery, setListQuery] = useState("");
  /** la nature sur laquelle la liste est filtrée — « » = toutes */
  const [catFilter, setCatFilter] = useState("");
  const [details, setDetails] = useState<GroupSeance | null>(null);
  /** la séance qu'on vient de créer : on propose sa fiche de paie */
  const [printAsk, setPrintAsk] = useState<GroupSeance | null>(null);

  const teacherName = (id: string) => {
    const t = teachers.find((x) => x.id === id);
    return t ? `${t.firstName} ${t.lastName}` : "—";
  };

  const workerName = (id: string) => {
    const w = reception.find((x) => x.id === id);
    return w ? `${w.firstName} ${w.lastName}` : "—";
  };

  const categoryName = (id?: string) =>
    programCategories.find((c) => c.id === id)?.name ?? "Sans catégorie";

  /** Les encadrants d'un programme, nommés — « Karim B. + 2 » quand ils sont trois. */
  const trainersLabel = (g: GroupSeance) => {
    const ids = groupSeanceTrainers(g);
    if (ids.length === 0) return "—";
    const first = teacherName(ids[0]);
    return ids.length > 1 ? `${first} + ${ids.length - 1}` : first;
  };

  /** Coche / décoche un encadrant. Le PREMIER coché reste le principal. */
  const toggleTrainer = (id: string) =>
    setDraft((d) => ({
      ...d,
      teacherIds: d.teacherIds.includes(id)
        ? d.teacherIds.filter((x) => x !== id)
        : [...d.teacherIds, id],
    }));

  const toggleWorker = (id: string) =>
    setDraft((d) => ({
      ...d,
      workerIds: d.workerIds.includes(id)
        ? d.workerIds.filter((x) => x !== id)
        : [...d.workerIds, id],
    }));

  /** Crée une nature de sortie et la choisit aussitôt. */
  const addCategory = async () => {
    const label = newCategory.trim();
    if (!label) return;
    const res = await saveProgramCategory({ name: label });
    if (!res.ok || !res.id) return;
    setDraft((d) => ({ ...d, categoryId: res.id! }));
    setNewCategory("");
  };

  const removeCategory = async (id: string, label: string) => {
    const used = groupSeances.filter((g) => g.categoryId === id).length;
    if (
      !confirm(
        `Supprimer la catégorie « ${label} » ?` +
          (used > 0
            ? `\n\n${used} programme(s) la portent : ils ne seront PAS effacés — ils se rangeront simplement sous « Sans catégorie ».`
            : ""),
      )
    )
      return;
    await deleteProgramCategory(id);
    setDraft((d) => (d.categoryId === id ? { ...d, categoryId: "" } : d));
    if (catFilter === id) setCatFilter("");
  };

  const rows = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return [...groupSeances]
      .filter((g) => (catFilter ? g.categoryId === catFilter : true))
      .filter((g) =>
        q
          ? `${g.title} ${g.description ?? ""} ${groupSeanceTrainers(g)
              .map(teacherName)
              .join(" ")} ${categoryName(g.categoryId)}`
              .toLowerCase()
              .includes(q)
          : true,
      )
      .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSeances, listQuery, catFilter, teachers, programCategories]);

  const totals = groupSeanceTotals(draft);
  const grand = rows.reduce(
    (acc, g) => {
      const t = groupSeanceTotals(g);
      acc.total += t.total;
      acc.school += t.schoolTotal;
      acc.teacher += t.teacherTotal;
      acc.students += t.students;
      return acc;
    },
    { total: 0, school: 0, teacher: 0, students: 0 },
  );

  const openCreate = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setTeacherQuery("");
    setWorkerQuery("");
    setNewCategory("");
    setFormOpen(true);
  };

  /**
   * LE BOUTON DU HAUT OUVRE CE FORMULAIRE-CI, pendant le rendu.
   *
   * C'est le réglage d'état « en cours de rendu » que React documente : on
   * compare le compteur reçu à celui qu'on a déjà vu, et on ouvre. Aucun effet,
   * donc aucun rendu en cascade — et le parent n'a rien à remettre à zéro.
   */
  if (openTick !== seenTick) {
    setSeenTick(openTick);
    openCreate();
  }

  const openEdit = (g: GroupSeance) => {
    setDraft({
      id: g.id,
      teacherIds: groupSeanceTrainers(g),
      workerIds: g.workerIds ?? [],
      categoryId: g.categoryId ?? "",
      title: g.title,
      description: g.description ?? "",
      date: g.date,
      startTime: g.startTime,
      endTime: g.endTime,
      studentsCount: g.studentsCount,
      pricePerStudent: g.pricePerStudent,
      schoolPerStudent: g.schoolPerStudent,
    });
    setEditingId(g.id);
    setTeacherQuery("");
    setWorkerQuery("");
    setNewCategory("");
    setFormOpen(true);
  };

  const submit = async () => {
    if (draft.teacherIds.length === 0) {
      addToast({
        type: "danger",
        title: "Encadrant manquant",
        message: "Cochez au moins un entraîneur : un programme part toujours avec quelqu'un.",
      });
      return;
    }
    if (!draft.title.trim()) {
      addToast({ type: "danger", title: "Intitulé manquant", message: "Nommez ce programme." });
      return;
    }
    if (totals.students <= 0 || totals.pricePerStudent <= 0) {
      addToast({
        type: "danger",
        title: "Chiffres incomplets",
        message: "Indiquez le nombre de chevaliers et le prix payé par un chevalier.",
      });
      return;
    }

    const row: GroupSeance = {
      id: draft.id,
      // Le PREMIER coché est l'encadrant principal : c'est lui que la colonne
      // historique porte, et lui dont la fiche de paie s'imprime d'abord.
      teacherId: draft.teacherIds[0],
      teacherIds: draft.teacherIds,
      workerIds: draft.workerIds,
      categoryId: draft.categoryId || undefined,
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      studentsCount: totals.students,
      pricePerStudent: totals.pricePerStudent,
      schoolPerStudent: totals.schoolPerStudent,
      createdAt: new Date().toISOString(),
    };
    const res = await saveGroupSeance(row);
    if (!res.ok) {
      addToast({ type: "danger", title: "Enregistrement impossible", message: "Réessayez." });
      return;
    }
    setFormOpen(false);
    addToast({
      type: "success",
      title: editingId ? "Programme de groupe modifié" : "Programme de groupe créé",
      message:
        `${formatDA(totals.total)} encaissés · ${formatDA(totals.teacherTotal)} partagés entre ` +
        `${draft.teacherIds.length} encadrant(s) · caisse et rapports mis à jour.`,
    });
    if (!editingId) setPrintAsk(row);
  };

  const remove = async (g: GroupSeance) => {
    if (
      !confirm(
        `Supprimer « ${g.title} » ?\nLa recette et la paie des encadrants seront retirées de la caisse, de leurs fiches et des rapports.`,
      )
    )
      return;
    const res = await deleteGroupSeance(g.id);
    addToast({
      type: res.ok ? "success" : "danger",
      title: res.ok ? "Programme supprimé" : "Suppression impossible",
      message: res.ok ? "Caisse, fiches des encadrants et rapports mis à jour." : "Réessayez.",
    });
  };

  const printPayslip = (g: GroupSeance) => {
    const teacher = teachers.find((t) => t.id === g.teacherId);
    if (!teacher) return;
    printHtmlDocument(groupSeancePayslipHtml(db, { seance: g, teacher, language }));
  };

  const shownTeachers = teachers.filter((t) =>
    `${t.firstName} ${t.lastName} ${t.phone ?? ""}`.toLowerCase().includes(teacherQuery.toLowerCase()),
  );

  /** Les AUTRES qui partent : tout le personnel, cherché par nom ou par métier. */
  const shownWorkers = reception.filter((w) =>
    `${w.firstName} ${w.lastName} ${w.phone ?? ""} ${
      db.workerRoles.find((r) => r.id === w.role)?.name ?? ""
    }`
      .toLowerCase()
      .includes(workerQuery.toLowerCase()),
  );

  return (
    <>
      <Card className="border border-line card-shadow">
        <CardBody className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-base font-black text-ink">
                <UsersRound className="h-5 w-5 text-primary" /> Programmes de groupe
              </h3>
              <p className="text-[11px] text-muted">
                Une sortie du club vendue à un groupe entier — on saisit le nombre de chevaliers,
                pas leurs noms.
              </p>
            </div>
            <Button onClick={openCreate} className="gap-2">
              <UsersRound className="h-4 w-4" /> Nouveau programme groupe
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Séances" value={String(rows.length)} tone="text-ink" />
            <Tile label="Chevaliers cumulés" value={String(grand.students)} tone="text-primary" />
            <Tile label="Total encaissé" value={formatDA(grand.total)} tone="text-success" />
            <Tile label="Part entraîneurs" value={formatDA(grand.teacher)} tone="text-warning" />
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Rechercher un programme — intitulé, encadrant ou catégorie…"
                className="ps-9"
              />
            </div>

            {/* LA NATURE DE LA SORTIE, en filtre. Les catégories se créent dans
                le formulaire ; ici elles servent à retrouver. */}
            {programCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-muted" />
                <button
                  type="button"
                  onClick={() => setCatFilter("")}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    catFilter === ""
                      ? "border-primary bg-primary text-white"
                      : "border-line text-muted hover:border-primary/40 hover:text-ink"
                  }`}
                >
                  Toutes
                </button>
                {programCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCatFilter(catFilter === c.id ? "" : c.id)}
                    className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      catFilter === c.id
                        ? "border-primary bg-primary text-white"
                        : "border-line text-muted hover:border-primary/40 hover:text-ink"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-xs italic text-muted">
              {catFilter
                ? "Aucun programme dans cette catégorie."
                : "Aucun programme de groupe pour le moment."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="bg-canvas/60">
                  <tr className="text-start text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2.5">Date &amp; horaire</th>
                    <th className="px-3 py-2.5">Programme</th>
                    <th className="px-3 py-2.5">Encadrants</th>
                    <th className="px-3 py-2.5 text-center">Chevaliers</th>
                    <th className="px-3 py-2.5 text-end">Prix / chevalier</th>
                    <th className="px-3 py-2.5 text-end">Total</th>
                    <th className="px-3 py-2.5 text-end">Club</th>
                    <th className="px-3 py-2.5 text-end">Encadrants</th>
                    <th className="px-3 py-2.5 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => {
                    const t = groupSeanceTotals(g);
                    return (
                      <tr key={g.id} className="border-t border-line/60 hover:bg-primary-50/30">
                        <td className="px-3 py-2.5">
                          <span className="block font-semibold text-ink">{formatDateFr(g.date)}</span>
                          <span className="block font-mono text-[10px] text-muted">
                            {g.startTime} → {g.endTime}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <strong className="block text-ink">{g.title}</strong>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1">
                            {g.categoryId && (
                              <Badge tone="accent" className="text-[9px]">
                                {categoryName(g.categoryId)}
                              </Badge>
                            )}
                            {(g.workerIds?.length ?? 0) > 0 && (
                              <Badge tone="neutral" className="gap-1 text-[9px]">
                                <Briefcase className="h-2.5 w-2.5" /> {g.workerIds!.length} autre(s)
                              </Badge>
                            )}
                          </span>
                          {g.description && (
                            <span className="block text-[10px] text-muted">{g.description}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted" title={groupSeanceTrainers(g).map(teacherName).join(" · ")}>
                          {trainersLabel(g)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge tone="primary" className="gap-1 font-mono">
                            <Users className="h-3 w-3" /> {t.students}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-end font-mono">{formatDA(t.pricePerStudent)}</td>
                        <td className="px-3 py-2.5 text-end font-mono font-bold text-success">
                          {formatDA(t.total)}
                        </td>
                        <td className="px-3 py-2.5 text-end font-mono text-primary">
                          {formatDA(t.schoolTotal)}
                        </td>
                        <td className="px-3 py-2.5 text-end font-mono text-warning">
                          {formatDA(t.teacherTotal)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <IconBtn title="Voir les détails" onClick={() => setDetails(g)}>
                              <Eye className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn title="Imprimer la fiche de paie" onClick={() => printPayslip(g)}>
                              <Printer className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn title="Modifier" onClick={() => openEdit(g)}>
                              <Edit className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn title="Supprimer" danger onClick={() => remove(g)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ---- create / edit ---------------------------------------------- */}
      {formOpen && (
        <Modal
          open
          onClose={() => setFormOpen(false)}
          title={editingId ? "Modifier le programme de groupe" : "Nouveau programme de groupe"}
          wide
        >
          <div className="space-y-4">
            {/* ---- LA NATURE DE LA SORTIE -------------------------------
                Randonnée, stage, compétition : le club nomme lui-même ce
                qu'il organise. Une catégorie ne commande rien — ni tarif, ni
                paie — elle sert à retrouver. */}
            <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-wash/25 p-3">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
                <Tag className="h-3.5 w-3.5" /> Catégorie de la sortie
              </span>

              {programCategories.length === 0 ? (
                <p className="text-[11px] italic text-muted">
                  Aucune catégorie — créez-en une ci-dessous.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {programCategories.map((c) => {
                    const picked = draft.categoryId === c.id;
                    return (
                      <span key={c.id} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({ ...draft, categoryId: picked ? "" : c.id })
                          }
                          className={`rounded-s-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                            picked
                              ? "border-primary bg-primary text-white"
                              : "border-line bg-surface text-ink hover:bg-primary-50"
                          }`}
                        >
                          {picked && <Check className="me-1 inline h-3 w-3" />}
                          {c.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCategory(c.id, c.name)}
                          title={`Supprimer la catégorie « ${c.name} »`}
                          className="rounded-e-lg border border-s-0 border-line bg-surface px-1.5 py-1.5 text-danger transition-colors hover:bg-danger/10"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addCategory();
                    }
                  }}
                  placeholder="Nouvelle catégorie : randonnée, stage, compétition…"
                  className="flex-1"
                />
                <Button size="sm" variant="outline" onClick={addCategory} disabled={!newCategory.trim()}>
                  <Plus className="h-3.5 w-3.5" /> Ajouter
                </Button>
              </div>
            </div>

            {/* ---- LES ENCADRANTS ---------------------------------------
                Une sortie se mène rarement seul. La part entraîneur se
                partage à parts égales entre ceux qui sont cochés ; le
                PREMIER est le principal. */}
            <div className="space-y-2 rounded-xl border border-line bg-canvas/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  👨‍🏫 Entraîneurs encadrants *
                </span>
                <Badge tone={draft.teacherIds.length > 0 ? "primary" : "warning"} className="text-[9px]">
                  {draft.teacherIds.length} coché(s)
                </Badge>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                La part entraîneur se partage <strong className="text-ink">à parts égales</strong>{" "}
                entre eux — le club verse le même total. Le premier coché est l&apos;encadrant
                principal : c&apos;est sa fiche de paie qui s&apos;imprime d&apos;abord.
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  value={teacherQuery}
                  onChange={(e) => setTeacherQuery(e.target.value)}
                  placeholder="Rechercher un entraîneur…"
                  className="ps-9"
                />
              </div>
              <div className="max-h-36 space-y-1 overflow-y-auto">
                {shownTeachers.length === 0 ? (
                  <p className="py-3 text-center text-[11px] italic text-muted">
                    Aucun entraîneur ne correspond.
                  </p>
                ) : (
                  shownTeachers.map((t) => {
                    const picked = draft.teacherIds.includes(t.id);
                    const main = draft.teacherIds[0] === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTrainer(t.id)}
                        className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
                          picked
                            ? "border-primary bg-primary text-white"
                            : "border-line bg-surface text-ink hover:bg-primary-50"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <input type="checkbox" checked={picked} readOnly className="h-3.5 w-3.5" />
                          {t.firstName} {t.lastName}
                          {main && draft.teacherIds.length > 1 && (
                            <span className="rounded bg-white/25 px-1 py-0.5 text-[8px] font-bold">
                              principal
                            </span>
                          )}
                        </span>
                        {t.phone && <span className="opacity-70">{t.phone}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* ---- LES AUTRES QUI PARTENT -------------------------------
                Chauffeur, infirmier, cuisinier, intendant. Ils ne touchent
                RIEN sur le prix payé par les chevaliers — ils sont salariés
                par ailleurs — mais un programme doit dire qui était là. */}
            <div className="space-y-2 rounded-xl border border-line bg-canvas/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Briefcase className="h-3.5 w-3.5" /> Autres accompagnateurs
                </span>
                <Badge tone="neutral" className="text-[9px]">
                  {draft.workerIds.length} coché(s)
                </Badge>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                Chauffeur, infirmier, intendant… Ils ne touchent{" "}
                <strong className="text-ink">rien</strong> sur le prix payé par les chevaliers : ils
                sont salariés par ailleurs. On les nomme ici parce qu&apos;un programme doit dire
                qui était là.
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  value={workerQuery}
                  onChange={(e) => setWorkerQuery(e.target.value)}
                  placeholder="Rechercher — nom ou métier…"
                  className="ps-9"
                />
              </div>
              <div className="max-h-36 space-y-1 overflow-y-auto">
                {shownWorkers.length === 0 ? (
                  <p className="py-3 text-center text-[11px] italic text-muted">
                    {reception.length === 0
                      ? "Aucun membre du personnel enregistré."
                      : "Personne ne correspond."}
                  </p>
                ) : (
                  shownWorkers.map((w) => {
                    const picked = draft.workerIds.includes(w.id);
                    const role = db.workerRoles.find((r) => r.id === w.role)?.name;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => toggleWorker(w.id)}
                        className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
                          picked
                            ? "border-accent bg-accent text-[#241a05]"
                            : "border-line bg-surface text-ink hover:bg-primary-50"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <input type="checkbox" checked={picked} readOnly className="h-3.5 w-3.5" />
                          {w.firstName} {w.lastName}
                        </span>
                        {role && <span className="opacity-70">{role}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* identité de la séance */}
            <div className="space-y-3 rounded-xl border border-line bg-canvas/30 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                🗓️ Le programme
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Intitulé du programme *
                  </label>
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder="Ex: Randonnée de printemps — forêt de Chréa"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Date *</label>
                  <Input
                    type="date"
                    value={draft.date}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Heure de début *</label>
                  <Input
                    type="time"
                    value={draft.startTime}
                    onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Heure de fin *</label>
                  <Input
                    type="time"
                    value={draft.endTime}
                    onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Description (optionnel)
                </label>
                <Input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Ex: 3ᵉ AS — toutes séries"
                />
              </div>
            </div>

            {/* les chiffres */}
            <div className="space-y-3 rounded-xl border border-primary/25 bg-primary-50/40 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                💰 Les chiffres
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Nombre total de chevaliers *
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.studentsCount || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, studentsCount: Math.max(0, Number(e.target.value) || 0) })
                    }
                    placeholder="Ex: 25"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Prix de la séance / chevalier *
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.pricePerStudent || ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        pricePerStudent: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    placeholder="Ex: 500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Part du club / chevalier *
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.schoolPerStudent || ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        schoolPerStudent: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    placeholder="Ex: 200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile
                  label="Entraîneur / chevalier"
                  value={formatDA(totals.teacherPerStudent)}
                  hint="prix chevalier − part club"
                  tone="text-warning"
                />
                <Tile label="Total encaissé" value={formatDA(totals.total)} hint={`${totals.students} × ${totals.pricePerStudent}`} tone="text-success" />
                <Tile label="Total club" value={formatDA(totals.schoolTotal)} tone="text-primary" />
                <Tile
                  label="Total encadrants"
                  value={formatDA(totals.teacherTotal)}
                  hint={
                    draft.teacherIds.length > 1
                      ? `${formatDA(totals.teacherTotal / draft.teacherIds.length)} chacun`
                      : undefined
                  }
                  tone="text-warning"
                />
              </div>
              {totals.schoolPerStudent >= totals.pricePerStudent && totals.pricePerStudent > 0 && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
                  Le club garde tout : ce programme ne rapporte rien aux encadrants.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                Annuler
              </Button>
              <Button onClick={submit}>
                {editingId ? "Enregistrer les modifications" : "Créer le programme"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ---- details ---------------------------------------------------- */}
      {details && (
        <Modal open onClose={() => setDetails(null)} title="Détails du programme de groupe">
          {(() => {
            const t = groupSeanceTotals(details);
            return (
              <div className="space-y-3">
                <div className="rounded-xl bg-primary-50/60 p-3">
                  <strong className="block text-sm text-ink">{details.title}</strong>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <CalendarRange className="h-3 w-3" />
                    {formatDateFr(details.date)} ·{" "}
                    <span className="font-mono">
                      {details.startTime} → {details.endTime}
                    </span>
                  </span>
                  {details.description && (
                    <span className="mt-1 block text-[11px] text-ink">{details.description}</span>
                  )}

                  {/* QUI ÉTAIT LÀ — les encadrants payés, puis les autres, qui
                      ne touchent rien sur le prix mais dont le programme doit
                      garder la trace. */}
                  <div className="mt-2 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-muted">
                        Encadrants
                      </span>
                      {groupSeanceTrainers(details).map((id) => (
                        <Badge key={id} tone="primary" className="text-[9px]">
                          {teacherName(id)}
                        </Badge>
                      ))}
                    </div>
                    {(details.workerIds?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-muted">
                          Accompagnateurs
                        </span>
                        {details.workerIds!.map((id) => (
                          <Badge key={id} tone="neutral" className="gap-1 text-[9px]">
                            <Briefcase className="h-2.5 w-2.5" /> {workerName(id)}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {details.categoryId && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-muted">
                          Catégorie
                        </span>
                        <Badge tone="accent" className="text-[9px]">
                          {categoryName(details.categoryId)}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Chevaliers" value={String(t.students)} tone="text-ink" />
                  <Tile label="Prix / chevalier" value={formatDA(t.pricePerStudent)} tone="text-ink" />
                  <Tile label="Part club / chevalier" value={formatDA(t.schoolPerStudent)} tone="text-primary" />
                  <Tile
                    label="Part entraîneur / chevalier"
                    value={formatDA(t.teacherPerStudent)}
                    tone="text-warning"
                  />
                  <Tile label="Total encaissé" value={formatDA(t.total)} tone="text-success" />
                  <Tile label="Total club" value={formatDA(t.schoolTotal)} tone="text-primary" />
                  <Tile
                    label="Total encadrants"
                    value={formatDA(t.teacherTotal)}
                    hint={
                      groupSeanceTrainers(details).length > 1
                        ? `${formatDA(t.teacherTotal / groupSeanceTrainers(details).length)} chacun`
                        : undefined
                    }
                    tone="text-warning"
                  />
                  <Tile
                    label="Créée le"
                    value={formatDateFr(details.createdAt.slice(0, 10))}
                    tone="text-muted"
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-line pt-3">
                  <Button variant="outline" onClick={() => setDetails(null)}>
                    Fermer
                  </Button>
                  <Button onClick={() => printPayslip(details)} className="gap-1.5">
                    <Printer className="h-4 w-4" /> Fiche de paie
                  </Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ---- « imprimer la fiche de paie ? » ------------------------------ */}
      {printAsk && (
        <Modal open onClose={() => setPrintAsk(null)} title="Impression">
          <div className="space-y-4">
            <p className="text-sm text-ink">
              Séance enregistrée. Imprimer la <strong>fiche de paie</strong> de{" "}
              {teacherName(printAsk.teacherId)} ?
            </p>
            <p className="text-[11px] text-muted">
              La fiche remise à l&apos;entraîneur n&apos;affiche jamais la part du club :
              seulement les chevaliers, sa part par chevalier et son total.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPrintAsk(null)}>
                Non, merci
              </Button>
              <Button
                onClick={() => {
                  printPayslip(printAsk);
                  setPrintAsk(null);
                }}
                className="gap-1.5"
              >
                <Printer className="h-4 w-4" /> Imprimer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-2.5 text-center">
      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <strong className={`block font-mono text-sm ${tone}`}>{value}</strong>
      {hint && <span className="block text-[9px] text-muted">{hint}</span>}
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border border-line transition-colors ${
        danger ? "text-danger hover:bg-danger/10" : "text-primary hover:bg-primary-50"
      }`}
    >
      {children}
    </button>
  );
}
