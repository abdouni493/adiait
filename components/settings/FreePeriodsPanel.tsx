"use client";

/**
 * LES PÉRIODES OFFERTES — déménagées ici avec la fin de « Cartes & tarifs ».
 *
 * L'écran « Cartes & tarifs » a été retiré de l'application : le tarif d'un
 * emploi du temps se fixe désormais sur l'emploi du temps lui-même, au moment
 * où on le crée. Mais il portait aussi les PÉRIODES GRATUITES, qui n'ont rien
 * à voir avec un tarif et que rien d'autre ne réglait. Elles sont donc passées
 * dans les Paramètres, telles quelles, plutôt que de disparaître avec l'écran
 * qui les hébergeait.
 */

import { useEffect, useMemo, useState } from "react";
import { useData, uid } from "@/lib/store/data";
import { classLabel, formatDateFr, studentName, todayIso } from "@/lib/helpers";
import { formatDA } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Input } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AlertTriangle,
  CalendarRange,
  Edit,
  Eye,
  Gift,
  MoreVertical,
  Plus,
  Power,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import type { FreePeriod, FreePeriodStat } from "@/lib/types";

// =============================================================================
// Périodes gratuites
// -----------------------------------------------------------------------------
// A free period is a date window during which séances are OFFERED: the card is
// scanned normally and the presence is written, but the price is never taken
// off the student's balance. The server stores what it would have charged on
// each presence (`waivedAmount`), so this panel can show exactly what the
// period cost the school. Totals come from the `free_period_stats` RPC —
// aggregated server-side, so they never depend on how many attendance rows the
// browser happened to load.
// =============================================================================

type PeriodStatus = "upcoming" | "running" | "ended" | "off";

const STATUS_META: Record<PeriodStatus, { label: string; tone: Tone }> = {
  running: { label: "En cours", tone: "success" },
  upcoming: { label: "À venir", tone: "primary" },
  ended: { label: "Terminée", tone: "neutral" },
  off: { label: "Désactivée", tone: "warning" },
};

function statusOf(fp: FreePeriod): PeriodStatus {
  if (!fp.active) return "off";
  const today = todayIso(); // YYYY-MM-DD sorts lexicographically
  if (fp.startDate > today) return "upcoming";
  if (fp.endDate < today) return "ended";
  return "running";
}

export function FreePeriodsPanel() {
  const db = useData();
  const {
    classes,
    students,
    sessions,
    modules,
    freePeriods,
    attendance,
    push,
    updateItem,
    deleteFrom,
    fetchFreePeriodStats,
  } = db;

  const [stats, setStats] = useState<FreePeriodStat[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [editing, setEditing] = useState<FreePeriod | null>(null);
  const [viewing, setViewing] = useState<FreePeriod | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  // Form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [payTeachers, setPayTeachers] = useState(true);
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");

  // The cost of a period only moves when a period is created/edited or a new
  // presence lands, so recomputing on those two is enough.
  useEffect(() => {
    let alive = true;
    fetchFreePeriodStats().then((rows) => {
      if (alive) setStats(rows);
    });
    return () => {
      alive = false;
    };
  }, [fetchFreePeriodStats, freePeriods, attendance]);

  const statOf = (id: string) =>
    stats.find((s) => s.id === id) ?? { id, presences: 0, students: 0, waived: 0 };

  const sorted = useMemo(
    () => [...freePeriods].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [freePeriods],
  );

  const totals = useMemo(
    () => ({
      running: freePeriods.filter((fp) => statusOf(fp) === "running").length,
      waived: stats.reduce((s, r) => s + (r.waived ?? 0), 0),
      presences: stats.reduce((s, r) => s + (r.presences ?? 0), 0),
    }),
    [freePeriods, stats],
  );

  const classesOf = (fp: FreePeriod) =>
    fp.allClasses ? classes : classes.filter((c) => fp.classIds.includes(c.id));

  /** Presences the period offered, most recent first (best-effort local list —
   *  the headline totals above come from the server). */
  const presencesOf = (fp: FreePeriod) =>
    attendance
      .filter((a) => a.freePeriodId === fp.id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setStartDate(todayIso());
    setEndDate(todayIso());
    // Every class is covered by default; the user unchecks what he wants out.
    setSelectedClassIds(classes.map((c) => c.id));
    setPayTeachers(true);
    setActive(true);
    setError("");
    setIsFormOpen(true);
  };

  const openEdit = (fp: FreePeriod) => {
    setEditing(fp);
    setName(fp.name);
    setDescription(fp.description);
    setStartDate(fp.startDate);
    setEndDate(fp.endDate);
    setSelectedClassIds(fp.allClasses ? classes.map((c) => c.id) : [...fp.classIds]);
    setPayTeachers(fp.payTeachers);
    setActive(fp.active);
    setError("");
    setMenuId(null);
    setIsFormOpen(true);
  };

  const toggleClass = (id: string) =>
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleSave = () => {
    if (!startDate || !endDate) {
      setError("Indiquez une date de début et une date de fin.");
      return;
    }
    if (endDate < startDate) {
      setError("La date de fin doit être postérieure (ou égale) à la date de début.");
      return;
    }
    if (selectedClassIds.length === 0) {
      setError("Sélectionnez au moins une catégorie.");
      return;
    }

    const allClasses = classes.length > 0 && selectedClassIds.length === classes.length;
    const payload = {
      name: name.trim() || "Période gratuite",
      description: description.trim(),
      startDate,
      endDate,
      allClasses,
      // A period covering everything keeps an empty list: a class created later
      // is then automatically covered too.
      classIds: allClasses ? [] : selectedClassIds,
      payTeachers,
      active,
    };

    if (editing) {
      updateItem("freePeriods", editing.id, payload);
    } else {
      push("freePeriods", {
        id: uid("fp"),
        createdAt: new Date().toISOString(),
        ...payload,
      });
    }
    setIsFormOpen(false);
  };

  const handleToggleActive = (fp: FreePeriod) => {
    updateItem("freePeriods", fp.id, { active: !fp.active });
    setMenuId(null);
  };

  const handleDelete = (fp: FreePeriod) => {
    const stat = statOf(fp.id);
    const warning =
      stat.presences > 0
        ? `\n\nATTENTION : ${stat.presences} présence(s) déjà offertes par cette période perdront leur rattachement (les chevaliers ne seront PAS débités, mais le récapitulatif de ${formatDA(stat.waived)} disparaîtra). Pour la stopper sans perdre l'historique, utilisez plutôt « Désactiver ».`
        : "";
    if (confirm(`Supprimer la période gratuite « ${fp.name} » ?${warning}`)) {
      deleteFrom("freePeriods", fp.id);
      setMenuId(null);
    }
  };

  const sessionLabelOf = (sessionId: string) => {
    const s = sessions.find((se) => se.id === sessionId);
    if (!s) return "—";
    const mod = modules.find((m) => m.id === s.moduleId)?.name ?? "—";
    return `${mod} (${s.startTime}-${s.endTime})`;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-muted">
          Pendant une période gratuite, le chevalier badge normalement et sa{" "}
          <strong className="text-ink">présence est enregistrée</strong>, mais{" "}
          <strong className="text-ink">aucune séance n&apos;est décomptée</strong>. Le prix non
          facturé est mémorisé : c&apos;est le coût réel de la période pour le club.
        </p>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nouvelle période gratuite
        </Button>
      </div>

      {/* Headline figures — server-side totals */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="flex items-center gap-3">
            <div className="rounded-xl bg-success/10 p-2.5 text-success">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
                Périodes en cours
              </span>
              <strong className="text-lg font-extrabold text-ink">{totals.running}</strong>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-3">
            <div className="rounded-xl bg-primary-50 p-2.5 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
                Présences offertes
              </span>
              <strong className="text-lg font-extrabold text-ink">{totals.presences}</strong>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-3">
            <div className="rounded-xl bg-warning/10 p-2.5 text-warning">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
                Coût total offert
              </span>
              <strong className="text-lg font-extrabold text-warning">
                {formatDA(totals.waived)}
              </strong>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* History — one card per period */}
      {sorted.length === 0 ? (
        <EmptyState
          icon={Gift}
          message="Aucune période gratuite. Créez-en une pour offrir les séances sur une plage de dates."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((fp) => {
            const status = STATUS_META[statusOf(fp)];
            const stat = statOf(fp.id);
            const covered = classesOf(fp);

            return (
              <Card key={fp.id} className="relative overflow-visible">
                <CardBody className="flex min-h-48 flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Gift
                          className={`h-5 w-5 shrink-0 ${
                            statusOf(fp) === "running" ? "text-success" : "text-primary"
                          }`}
                        />
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold text-ink">{fp.name}</h4>
                          <span className="flex items-center gap-1 text-[11px] text-muted">
                            <CalendarRange className="h-3 w-3" />
                            {formatDateFr(fp.startDate)} → {formatDateFr(fp.endDate)}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Badge tone={status.tone} className="px-1.5 py-0 text-[9px]">
                          {status.label}
                        </Badge>
                        <div className="relative">
                          <button
                            onClick={() => setMenuId(menuId === fp.id ? null : fp.id)}
                            className="rounded-lg p-1 text-muted transition-colors hover:bg-primary-50 hover:text-ink"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>
                          {menuId === fp.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                              <div className="absolute end-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                                <button
                                  onClick={() => {
                                    setViewing(fp);
                                    setIsDetailsOpen(true);
                                    setMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-ink hover:bg-primary-50"
                                >
                                  <Eye className="h-4 w-4" /> Détails
                                </button>
                                <button
                                  onClick={() => openEdit(fp)}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-ink hover:bg-primary-50"
                                >
                                  <Edit className="h-4 w-4" /> Modifier
                                </button>
                                <button
                                  onClick={() => handleToggleActive(fp)}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-ink hover:bg-primary-50"
                                >
                                  <Power className="h-4 w-4" />
                                  {fp.active ? "Désactiver" : "Réactiver"}
                                </button>
                                <button
                                  onClick={() => handleDelete(fp)}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-danger hover:bg-danger/10"
                                >
                                  <Trash2 className="h-4 w-4" /> Supprimer
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {fp.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted">{fp.description}</p>
                    )}

                    <div className="mt-3 space-y-1 text-xs">
                      <div className="flex justify-between text-muted">
                        <span>Catégories:</span>
                        <strong className="max-w-[60%] truncate text-end text-ink">
                          {fp.allClasses
                            ? "Toutes les catégories"
                            : `${covered.length} classe${covered.length > 1 ? "s" : ""}`}
                        </strong>
                      </div>
                      <div className="flex justify-between text-muted">
                        <span>Présences offertes:</span>
                        <strong className="text-ink">{stat.presences}</strong>
                      </div>
                      <div className="flex justify-between text-muted">
                        <span>Chevaliers concernés:</span>
                        <strong className="text-ink">{stat.students}</strong>
                      </div>
                      <div className="flex justify-between text-muted">
                        <span>Entraîneurs payés:</span>
                        <strong className="text-ink">{fp.payTeachers ? "Oui" : "Non"}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
                    <span className="text-muted">Coût de la période</span>
                    <strong className="rounded-lg bg-warning/10 px-2 py-1 text-sm font-bold text-warning">
                      {formatDA(stat.waived)}
                    </strong>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Modal
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? "Modifier la période gratuite" : "Nouvelle période gratuite"}
        wide
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Nom de la période</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Semaine portes ouvertes"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Motif de la gratuité (facultatif)"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Date de début</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Date de fin</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Catégories — all selected by default, the user unchecks what stays payant */}
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Catégories concernées ({selectedClassIds.length}/{classes.length})
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedClassIds(classes.map((c) => c.id))}
                >
                  Tout sélectionner
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedClassIds([])}>
                  Tout désélectionner
                </Button>
              </div>
            </div>

            {classes.length === 0 ? (
              <p className="px-1 text-xs italic text-muted">Aucune catégorie enregistrée.</p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {classes.map((c) => {
                  const checked = selectedClassIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                        checked
                          ? "border-primary/30 bg-primary-50/50 text-ink"
                          : "border-line/60 bg-surface text-muted"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClass(c.id)}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      <span className="font-semibold">{classLabel(db, c)}</span>
                      <Badge
                        tone={c.type === "formation" ? "primary" : "neutral"}
                        className="ml-auto px-1.5 py-0 text-[9px]"
                      >
                        {c.type === "formation" ? c.formationLevel : c.coursLevel}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            )}

            <p className="mt-2 text-[11px] text-muted">
              {classes.length > 0 && selectedClassIds.length === classes.length
                ? "✅ Toutes les catégories sont couvertes — une catégorie créée plus tard le sera aussi."
                : "Seules les catégories cochées bénéficient de la gratuité ; les autres restent facturées normalement."}
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-xs">
            <input
              type="checkbox"
              checked={payTeachers}
              onChange={(e) => setPayTeachers(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <strong className="text-ink">Rémunérer les entraîneurs normalement</strong>
              <span className="mt-0.5 block text-muted">
                Les entraîneurs payés au pourcentage touchent leur part sur le prix habituel de la
                séance, même si le chevalier n&apos;a rien payé. Décochez pour que la séance offerte
                ne génère aucune part entraîneur.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-xs">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              <strong className="text-ink">Période active</strong>
              <span className="mt-0.5 block text-muted">
                Décochez pour suspendre la gratuité sans supprimer la période ni son historique.
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-line bg-primary-50/50 p-3 text-xs text-muted">
            🎁 <strong className="text-ink">Effet au scan :</strong> la carte est acceptée
            normalement, la présence est enregistrée (et compte pour l&apos;entraîneur et les
            statistiques), mais <strong className="text-ink">aucune séance n&apos;est décomptée</strong>{" "}
            de son abonnement. Les absences hebdomadaires ne sont pas décomptées non plus sur
            les semaines couvertes.
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-semibold text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave}>{editing ? "Enregistrer" : "Créer la période"}</Button>
          </div>
        </div>
      </Modal>

      {/* Details / history */}
      <Modal
        open={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title="Détails de la période gratuite"
        wide
      >
        {viewing && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-primary-50/50 p-4 md:grid-cols-4">
              <div>
                <span className="block text-[10px] uppercase text-muted">Période</span>
                <span className="font-bold text-ink">{viewing.name}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-muted">Du → au</span>
                <span className="font-semibold text-ink">
                  {formatDateFr(viewing.startDate)} → {formatDateFr(viewing.endDate)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-muted">Statut</span>
                <Badge tone={STATUS_META[statusOf(viewing)].tone} className="mt-0.5">
                  {STATUS_META[statusOf(viewing)].label}
                </Badge>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-muted">Coût total</span>
                <span className="font-extrabold text-warning">
                  {formatDA(statOf(viewing.id).waived)}
                </span>
              </div>
            </div>

            {viewing.description && (
              <p className="rounded-xl border border-line bg-canvas/30 p-3 text-xs text-muted">
                {viewing.description}
              </p>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-2 font-bold text-ink">🏫 Catégories couvertes</h4>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line bg-surface p-3">
                  {viewing.allClasses && (
                    <p className="mb-1 text-[11px] font-semibold text-success">
                      Toutes les catégories (y compris celles créées plus tard).
                    </p>
                  )}
                  {classesOf(viewing).map((c) => (
                    <div
                      key={c.id}
                      className="rounded border border-line/50 bg-canvas/30 px-2 py-1.5 text-xs text-ink"
                    >
                      {classLabel(db, c)}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-2 font-bold text-ink">📊 Ce que la période a offert</h4>
                <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-center justify-between border-b border-line pb-2 text-sm">
                    <span className="text-muted">Présences offertes:</span>
                    <strong className="text-ink">{statOf(viewing.id).presences}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-line pb-2 text-sm">
                    <span className="text-muted">Chevaliers concernés:</span>
                    <strong className="text-ink">{statOf(viewing.id).students}</strong>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-muted">Coût pour le club:</span>
                    <strong className="text-lg font-extrabold text-warning">
                      {formatDA(statOf(viewing.id).waived)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-bold text-ink">🎫 Séances offertes</h4>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
                {presencesOf(viewing).length === 0 ? (
                  <p className="p-4 text-xs italic text-muted">
                    Aucune présence enregistrée sur cette période pour l&apos;instant.
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-canvas/80 backdrop-blur">
                      <tr className="text-start text-[10px] uppercase text-muted">
                        <th className="px-3 py-2">Chevalier</th>
                        <th className="px-3 py-2">Séance</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2 text-end">Offert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presencesOf(viewing).map((a) => {
                        const st = students.find((s) => s.id === a.studentId);
                        return (
                          <tr key={a.id} className="border-t border-line/60">
                            <td className="px-3 py-2 font-semibold text-ink">
                              {st ? studentName(st) : "—"}
                            </td>
                            <td className="px-3 py-2 text-muted">
                              {sessionLabelOf(a.sessionId)}
                            </td>
                            <td className="px-3 py-2 text-muted">
                              {new Date(a.timestamp).toLocaleString("fr-DZ", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-3 py-2 text-end font-bold text-success">
                              {formatDA(a.waivedAmount ?? 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-line pt-2">
              <Button onClick={() => setIsDetailsOpen(false)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
