"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Edit,
  Eye,
  MoreVertical,
  Plus,
  Shield,
  Swords,
  Trash2,
  Users,
} from "lucide-react";
import { useData, uid } from "@/lib/store/data";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/lib/store/toast";
import type { SchoolClass } from "@/lib/types";
import {
  ageRangeLabel,
  categoryAccepts,
  studentFullyFree,
  totalRemainingSeances,
} from "@/lib/helpers";
import { useCan } from "@/lib/usePermissions";

/** Les âges proposés par les deux listes. Un club de chevalerie accueille des
 *  enfants comme des adultes : la fourchette va large. */
const AGES = Array.from({ length: 68 }, (_, i) => i + 3); // 3 → 70 ans

type AgeFilter = "all" | "child" | "teen" | "adult";

const AGE_FILTERS: { value: AgeFilter; label: string; from: number; to: number }[] = [
  { value: "child", label: "Enfants (3 – 12 ans)", from: 3, to: 12 },
  { value: "teen", label: "Cadets (13 – 17 ans)", from: 13, to: 17 },
  { value: "adult", label: "Adultes (18 ans et plus)", from: 18, to: 120 },
];

export function ClassesPage() {
  const can = useCan("classes");
  const db = useData();
  const { classes, students, subscriptions, sessions, push, deleteFrom, updateItem } = db;
  const addToast = useToast((s) => s.addToast);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<SchoolClass | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // ---- LE FORMULAIRE : trois champs, et c'est tout ------------------------
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ageFrom, setAgeFrom] = useState(18);
  const [ageTo, setAgeTo] = useState(25);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState<AgeFilter>("all");

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
    setActiveMenuId(null);
    setIsEditOpen(true);
  };

  const openDetails = (cls: SchoolClass) => {
    setSelected(cls);
    setActiveMenuId(null);
    setIsDetailsOpen(true);
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
      setActiveMenuId(null);
      return;
    }
    if (!confirm(`Supprimer la catégorie « ${cls.name} » ?`)) return;
    deleteFrom("classes", cls.id);
    setActiveMenuId(null);
  };

  // ---- Les chevaliers et les créneaux d'une catégorie ---------------------
  const classStudents = (classId: string) => {
    const subIds = subscriptions
      .filter((sub) => {
        const ses = sessions.find((s) => s.id === sub.sessionId);
        return ses && (ses.classId === classId || ses.classIds?.includes(classId));
      })
      .map((s) => s.id);
    return students.filter((st) => st.subscriptionIds?.some((id) => subIds.includes(id)));
  };

  const classSessions = (classId: string) =>
    sessions.filter((s) => s.classId === classId || s.classIds?.includes(classId));

  const visible = useMemo(() => {
    if (filter === "all") return classes;
    const band = AGE_FILTERS.find((f) => f.value === filter);
    if (!band) return classes;
    // Une catégorie apparaît dès que sa tranche CHEVAUCHE la bande choisie.
    return classes.filter(
      (c) => (c.ageFrom ?? 0) <= band.to && (c.ageTo ?? 120) >= band.from,
    );
  }, [classes, filter]);

  // ---- Les champs partagés par la création et la modification -------------
  const FormFields = (
    <div className="space-y-4">
      <div>
        <label htmlFor="cat-name" className="mb-1.5 block text-xs font-semibold text-muted">
          Nom de la catégorie <span className="text-danger">*</span>
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
          Description
        </label>
        <textarea
          id="cat-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ce que cette catégorie regroupe, son niveau d'exigence…"
          rows={3}
          className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none"
        />
      </div>

      {/* ---- La tranche d'âge ---- */}
      <fieldset className="rounded-xl border border-line bg-canvas/60 p-4">
        <legend className="px-1.5 text-xs font-bold text-accent-ink">Tranche d&apos;âge</legend>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[110px] flex-1">
            <label htmlFor="cat-from" className="mb-1.5 block text-[11px] font-semibold text-muted">
              De
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
          <span className="pb-2.5 text-sm font-semibold text-muted">à</span>
          <div className="min-w-[110px] flex-1">
            <label htmlFor="cat-to" className="mb-1.5 block text-[11px] font-semibold text-muted">
              Jusqu&apos;à
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
          Cette catégorie accueillera les chevaliers{" "}
          <strong className="text-accent-ink">{ageRangeLabel(ageFrom, ageTo)}</strong>.
        </p>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        icon={Shield}
        title="Catégories"
        subtitle="Les catégories de l'Ordre et la tranche d'âge que chacune accueille"
        actions={
          can("create") ? (
            <Button
              onClick={() => {
                resetForm();
                setIsCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Nouvelle catégorie
            </Button>
          ) : undefined
        }
      />

      {/* ---- Filtre par tranche d'âge ---- */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted">Filtrer par âge :</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === "all"
                ? "border-accent/40 bg-accent/15 text-accent-ink"
                : "border-line text-muted hover:border-accent/30 hover:text-ink"
            }`}
          >
            Toutes
          </button>
          {AGE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.value
                  ? "border-accent/40 bg-accent/15 text-accent-ink"
                  : "border-line text-muted hover:border-accent/30 hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ms-auto text-xs text-muted">
          {visible.length} catégorie{visible.length > 1 ? "s" : ""}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Shield}
          message={
            classes.length === 0
              ? "Aucune catégorie pour le moment."
              : "Aucune catégorie sur cette tranche d'âge."
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
                <Plus className="h-4 w-4" /> Nouvelle catégorie
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((cls, i) => {
            const count = classStudents(cls.id).length;
            return (
              <motion.div
                key={cls.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.035, 0.35), duration: 0.3 }}
              >
                <Card className="relative h-full overflow-visible">
                  <CardBody className="flex h-full min-h-[13rem] flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Badge tone="accent">{ageRangeLabel(cls.ageFrom, cls.ageTo)}</Badge>
                          <h3 className="font-display mt-2 truncate text-lg font-bold text-ink">
                            {cls.name}
                          </h3>
                        </div>

                        <div className="relative shrink-0">
                          <button
                            onClick={() => setActiveMenuId(activeMenuId === cls.id ? null : cls.id)}
                            aria-label={`Actions sur ${cls.name}`}
                            aria-expanded={activeMenuId === cls.id}
                            className="cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-primary-50 hover:text-ink"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>
                          {activeMenuId === cls.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)} />
                              <div className="absolute end-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                                {can("view") && (
                                  <button
                                    onClick={() => openDetails(cls)}
                                    className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-start text-sm text-ink hover:bg-primary-50"
                                  >
                                    <Eye className="h-4 w-4" /> Détails
                                  </button>
                                )}
                                {can("edit") && (
                                  <button
                                    onClick={() => openEdit(cls)}
                                    className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-start text-sm text-ink hover:bg-primary-50"
                                  >
                                    <Edit className="h-4 w-4" /> Modifier
                                  </button>
                                )}
                                {can("delete") && (
                                  <button
                                    onClick={() => handleDelete(cls)}
                                    className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-start text-sm text-danger hover:bg-danger/10"
                                  >
                                    <Trash2 className="h-4 w-4" /> Supprimer
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-muted">
                        {cls.description || "Aucune description"}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {classSessions(cls.id).length} emploi(s)
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2 py-1 text-sm font-bold text-primary">
                        <Swords className="h-3.5 w-3.5" />
                        {count}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            );
          })}
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
      <Modal
        open={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title={selected ? selected.name : "Détails"}
        wide
        footer={<Button onClick={() => setIsDetailsOpen(false)}>Fermer</Button>}
      >
        {selected && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-canvas/60 p-4 md:grid-cols-4">
              <div>
                <span className="block text-xs text-muted">Nom</span>
                <span className="font-bold text-ink">{selected.name}</span>
              </div>
              <div>
                <span className="block text-xs text-muted">Tranche d&apos;âge</span>
                <Badge tone="accent">{ageRangeLabel(selected.ageFrom, selected.ageTo)}</Badge>
              </div>
              <div>
                <span className="block text-xs text-muted">Emplois du temps</span>
                <span className="font-semibold text-ink">{classSessions(selected.id).length}</span>
              </div>
              <div>
                <span className="block text-xs text-muted">Chevaliers</span>
                <span className="font-semibold text-ink">{classStudents(selected.id).length}</span>
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs font-semibold text-muted">Description</span>
              <p className="rounded-xl border border-line bg-surface p-3 text-sm text-ink">
                {selected.description || "Aucune description fournie."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface/50 p-4">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-ink">
                  <CalendarDays className="h-4 w-4 text-accent-ink" />
                  Emplois du temps ({classSessions(selected.id).length})
                </h4>
                {classSessions(selected.id).length === 0 ? (
                  <p className="text-xs italic text-muted">
                    Aucun emploi du temps affecté à cette catégorie.
                  </p>
                ) : (
                  <div className="max-h-60 space-y-2 overflow-y-auto">
                    {classSessions(selected.id).map((s) => {
                      const modName = db.modules.find((m) => m.id === s.moduleId)?.name ?? "Discipline";
                      const t = db.teachers.find((x) => x.id === s.teacherId);
                      return (
                        <div key={s.id} className="space-y-1 rounded-lg border border-line bg-surface p-2.5 text-xs">
                          <div className="flex justify-between font-bold text-ink">
                            <span>{s.title || modName}</span>
                            <span className="tabular-nums">
                              {s.startTime} – {s.endTime}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted">
                            <span>Entraîneur : {t ? `${t.firstName} ${t.lastName}` : "-"}</span>
                            <span>
                              Arène : {db.salles.find((sl) => sl.id === s.salleId)?.name ?? "-"}
                            </span>
                          </div>
                          <div className="text-[10px] font-semibold text-accent-ink">
                            {s.days.map((d) => d.substring(0, 3).toUpperCase()).join(", ")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-line bg-surface/50 p-4">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-ink">
                  <Users className="h-4 w-4 text-accent-ink" />
                  Chevaliers inscrits ({classStudents(selected.id).length})
                </h4>
                {classStudents(selected.id).length === 0 ? (
                  <p className="text-xs italic text-muted">
                    Aucun chevalier inscrit dans cette catégorie.
                  </p>
                ) : (
                  <div className="max-h-60 space-y-2 overflow-y-auto">
                    {classStudents(selected.id).map((stu) => {
                      const fits = categoryAccepts(selected, stu.birthDate);
                      return (
                        <div
                          key={stu.id}
                          className="flex items-center justify-between rounded-lg border border-line bg-surface p-2.5 text-xs"
                        >
                          <div className="min-w-0">
                            <strong className="block truncate text-ink">
                              {stu.firstName} {stu.lastName}
                            </strong>
                            <span className="text-[10px] text-muted">
                              {/* Un chevalier hors tranche n'est pas une erreur —
                                  il a pu grandir depuis son inscription — mais
                                  cela se voit plutôt que de rester tu. */}
                              {fits === false ? "Hors tranche d'âge" : stu.phone}
                            </span>
                          </div>
                          <Badge
                            tone={
                              studentFullyFree(stu)
                                ? "success"
                                : totalRemainingSeances(db, stu.id) === 0
                                  ? "danger"
                                  : "primary"
                            }
                          >
                            {studentFullyFree(stu)
                              ? "Gratuit"
                              : `${totalRemainingSeances(db, stu.id)} séance(s)`}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
