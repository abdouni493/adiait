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
 *
 * CETTE SECTION NE DESSINE AUCUNE LISTE. Elle n'est que les gestes — le
 * formulaire, le détail, la fiche de paie, la suppression — et l'écran du
 * Programme du club les déclenche par `ref` depuis SON historique, celui qui
 * mêle les programmes solo et les programmes de groupe dans un seul tableau.
 * Deux listes pour un même écran, c'était deux endroits où chercher la même
 * sortie.
 */

import { useImperativeHandle, useState, type Ref } from "react";
import { useData, uid } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { useToast } from "@/lib/store/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/SearchInput";
import { printHtmlDocument } from "@/lib/print";
import { groupSeancePayslipHtml } from "@/lib/reports/groupSeance";
import { formatDA } from "@/lib/utils";
import { formatDateFr, groupSeanceTotals, groupSeanceTrainers, todayIso } from "@/lib/helpers";
import type { GroupSeance } from "@/lib/types";
import { Briefcase, CalendarRange, Check, Plus, Printer, Search, Tag, Trash2 } from "lucide-react";

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

/**
 * CE QUE L'ÉCRAN PEUT DEMANDER À UN PROGRAMME DE GROUPE.
 *
 * L'historique du Programme du club affiche les sorties de groupe au milieu
 * des programmes solo, mais il ne sait rien de leur formulaire ni de leur
 * fiche de paie. Il tient une `ref` sur cette section et lui passe la main :
 * les cinq gestes ci-dessous sont tout ce qu'il a besoin de connaître.
 */
export interface GroupProgramApi {
  /** ouvrir le formulaire vide — le bouton « Programme groupe » du haut */
  openCreate: () => void;
  openEdit: (seance: GroupSeance) => void;
  openDetails: (seance: GroupSeance) => void;
  printPayslip: (seance: GroupSeance) => void;
  remove: (seance: GroupSeance) => void;
}

export function GroupSeanceSection({ ref }: { ref?: Ref<GroupProgramApi> } = {}) {
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
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [teacherQuery, setTeacherQuery] = useState("");
  /** la recherche des AUTRES qui partent — chauffeur, infirmier, intendant… */
  const [workerQuery, setWorkerQuery] = useState("");
  /** la saisie d'une nature de sortie, sans quitter le formulaire */
  const [newCategory, setNewCategory] = useState("");
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
  };

  const totals = groupSeanceTotals(draft);

  const openCreate = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setTeacherQuery("");
    setWorkerQuery("");
    setNewCategory("");
    setFormOpen(true);
  };

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

  /**
   * LES CINQ GESTES, tendus à l'écran qui porte l'historique.
   *
   * Recalculés à chaque rendu, et c'est voulu : chacun se referme sur l'état
   * du moment, si bien qu'un clic dans le tableau du parent agit toujours sur
   * ce que la section connaît maintenant.
   */
  useImperativeHandle(ref, () => ({
    openCreate,
    openEdit,
    openDetails: setDetails,
    printPayslip,
    remove,
  }));

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
