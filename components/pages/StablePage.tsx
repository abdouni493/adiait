"use client";

/**
 * =============================================================================
 *  L'ÉCURIE — tous les chevaux présents, et ce qu'ils coûtent
 * =============================================================================
 *
 *  Ici vivent TOUS les chevaux disponibles : ceux que le club a achetés (venus
 *  de l'écran « Achat & vente ») et ceux qui n'ont jamais été achetés — nés sur
 *  place, ou mis en pension par un chevalier, un parent, quelqu'un du dehors.
 *
 *  DEUX FAMILLES, ET LA DIFFÉRENCE EST UNIQUEMENT COMPTABLE :
 *
 *   • CHEVAL DU CLUB    — ses dépenses sortent de la caisse. Il porte un prix de
 *     vente, parce que le club peut le vendre.
 *   • CHEVAL EN PENSION — ses dépenses deviennent une DETTE de son propriétaire.
 *     Sa carte affiche donc ce qui a été réglé, ce qui reste dû, et un bouton
 *     pour encaisser.
 *
 *  Le reste — la fiche, le suivi, les rubriques de dépense, le relevé de
 *  période — est identique : un cheval est un cheval.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Edit,
  Eye,
  Landmark,
  Plus,
  Receipt,
  Search,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { useCan } from "@/lib/usePermissions";
import { formatDA } from "@/lib/utils";
import {
  GENDER_LABEL,
  horseAgeLabel,
  horseMoney,
  horseOwnerName,
  horseOwnerPhone,
} from "@/lib/stable";
import { HorseFormModal } from "@/components/stable/HorseFormModal";
import { HorseDetailsModal } from "@/components/stable/HorseDetailsModal";
import { HorseExpenseModal } from "@/components/stable/HorseExpenseModal";
import { HorseOwnerPayModal } from "@/components/stable/HorseOwnerPayModal";
import type { Horse, HorseExpense } from "@/lib/types";

export function StablePage() {
  const can = useCan("stable");
  const db = useData();
  const { deleteHorse } = db;
  const { addToast } = useToast();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "club" | "boarded">("all");
  const [gender, setGender] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [debtOnly, setDebtOnly] = useState(false);
  const [sort, setSort] = useState<"name" | "debt" | "expenses" | "recent">("name");

  const [formOpen, setFormOpen] = useState(false);
  const [editHorse, setEditHorse] = useState<Horse | null>(null);
  const [detailHorse, setDetailHorse] = useState<Horse | null>(null);
  const [expenseFor, setExpenseFor] = useState<Horse | null>(null);
  const [editExpense, setEditExpense] = useState<HorseExpense | null>(null);
  const [payFor, setPayFor] = useState<Horse | null>(null);

  const disciplines = useMemo(
    () => [...new Set(db.horses.map((h) => h.discipline).filter(Boolean) as string[])].sort(),
    [db.horses],
  );

  /** L'écurie ne montre QUE les chevaux présents : un cheval vendu est parti. */
  const present = useMemo(() => db.horses.filter((h) => h.status !== "sold"), [db.horses]);

  const horses = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = present.filter((h) => {
      if (scope === "club" && h.ownerKind !== "club") return false;
      if (scope === "boarded" && h.ownerKind === "club") return false;
      if (gender && h.gender !== gender) return false;
      if (discipline && h.discipline !== discipline) return false;
      if (debtOnly && horseMoney(db, h.id).debt <= 0) return false;
      if (!q) return true;
      // La recherche porte sur le cheval ET sur son propriétaire — c'est
      // souvent par le nom du propriétaire qu'on cherche une pension.
      return `${h.name} ${h.reference ?? ""} ${h.breed ?? ""} ${horseOwnerName(db, h)} ${horseOwnerPhone(db, h)}`
        .toLowerCase()
        .includes(q);
    });
    return [...list].sort((a, b) => {
      if (sort === "debt") return horseMoney(db, b.id).debt - horseMoney(db, a.id).debt;
      if (sort === "expenses") return horseMoney(db, b.id).expenses - horseMoney(db, a.id).expenses;
      if (sort === "recent") return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      return a.name.localeCompare(b.name);
    });
  }, [present, query, scope, gender, discipline, debtOnly, sort, db]);

  /** Les pensions qui doivent quelque chose : l'alerte du haut d'écran. */
  const debtors = useMemo(
    () =>
      present
        .filter((h) => h.ownerKind !== "club")
        .map((h) => ({ horse: h, money: horseMoney(db, h.id) }))
        .filter((r) => r.money.debt > 0),
    [present, db],
  );
  const debtTotal = debtors.reduce((s, r) => s + r.money.debt, 0);

  const clubCount = present.filter((h) => h.ownerKind === "club").length;
  const boardedCount = present.length - clubCount;

  const remove = async (h: Horse) => {
    if (
      !confirm(
        `Supprimer le cheval « ${h.name} » ?\n\nSes dépenses et les règlements de son propriétaire partent avec lui, ainsi que les mouvements de caisse correspondants.`,
      )
    )
      return;
    await deleteHorse(h.id);
    addToast({ type: "success", title: "Cheval supprimé", message: h.name });
  };

  return (
    <div>
      <PageHeader
        icon={Landmark}
        title="L'écurie"
        subtitle="Les chevaux présents, leur suivi et ce qu'ils coûtent"
        actions={
          can("create") ? (
            <Button
              onClick={() => {
                setEditHorse(null);
                setFormOpen(true);
              }}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" /> Nouveau cheval
            </Button>
          ) : undefined
        }
      />

      {/* ---- L'ALERTE DES PENSIONS EN DETTE ---- */}
      {debtors.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setDebtOnly(true);
            setScope("boarded");
          }}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border-2 border-danger/40 bg-danger/10 p-4 text-start transition-colors hover:bg-danger/15"
        >
          <AlertTriangle className="h-6 w-6 shrink-0 text-danger" />
          <span className="min-w-0 flex-1">
            <strong className="block text-sm text-danger">
              {debtors.length} propriétaire(s) doivent {formatDA(debtTotal)} d&apos;entretien
            </strong>
            <span className="block text-[11px] text-muted">
              {debtors
                .slice(0, 3)
                .map((r) => `${r.horse.name} · ${horseOwnerName(db, r.horse)} (${formatDA(r.money.debt)})`)
                .join("  |  ")}
              {debtors.length > 3 ? "  |  …" : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold text-danger">Ne voir qu&apos;eux →</span>
        </button>
      )}

      {/* ---- Le sommaire ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Chevaux présents" value={String(present.length)} icon={Landmark} tone="primary" />
        <Summary label="Au club" value={String(clubCount)} icon={Landmark} tone="success" />
        <Summary label="En pension" value={String(boardedCount)} icon={User} tone="neutral" />
        <Summary
          label="Dû par les pensions"
          value={formatDA(debtTotal)}
          icon={Wallet}
          tone={debtTotal > 0 ? "danger" : "neutral"}
        />
      </div>

      {/* ---- La recherche et les filtres ---- */}
      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end gap-2 py-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted start-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom du cheval, nom du propriétaire, téléphone…"
              className="ps-9"
            />
          </div>
          <Select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            className="w-44"
          >
            <option value="all">Tous les chevaux</option>
            <option value="club">Chevaux du club</option>
            <option value="boarded">Chevaux en pension</option>
          </Select>
          <Select value={gender} onChange={(e) => setGender(e.target.value)} className="w-36">
            <option value="">Tous les sexes</option>
            <option value="stallion">Étalon</option>
            <option value="mare">Jument</option>
            <option value="gelding">Hongre</option>
          </Select>
          <Select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
            className="w-44"
          >
            <option value="">Toutes les disciplines</option>
            {disciplines.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="w-48"
          >
            <option value="name">Par nom</option>
            <option value="debt">Dette décroissante</option>
            <option value="expenses">Dépenses décroissantes</option>
            <option value="recent">Les plus récents</option>
          </Select>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-xs font-semibold text-ink">
            <input
              type="checkbox"
              checked={debtOnly}
              onChange={(e) => setDebtOnly(e.target.checked)}
              className="h-4 w-4 rounded border-line bg-surface text-primary focus:ring-primary"
            />
            En dette seulement
          </label>
        </CardBody>
      </Card>

      {horses.length === 0 ? (
        <EmptyState
          icon={Landmark}
          message="Aucun cheval ne correspond."
          hint="« Nouveau cheval » enregistre un cheval sans achat : né sur place, ou mis en pension par un chevalier, un parent, ou quelqu'un du dehors."
          action={
            can("create") ? (
              <Button
                onClick={() => {
                  setEditHorse(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Nouveau cheval
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {horses.map((h, i) => {
            const money = horseMoney(db, h.id);
            const club = h.ownerKind === "club";
            return (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.32), duration: 0.3 }}
              >
                <Card className={`h-full ${money.debt > 0 ? "border-2 border-danger/40" : ""}`}>
                  <CardBody className="flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Badge tone={club ? "primary" : "accent"}>
                            {club ? "Cheval du club" : "En pension"}
                          </Badge>
                          <h3 className="font-display mt-2 truncate text-lg font-bold text-ink">
                            {h.name}
                          </h3>
                          <span className="block text-[11px] text-muted">
                            {[
                              h.reference,
                              h.breed,
                              h.gender ? GENDER_LABEL[h.gender] : "",
                              horseAgeLabel(h),
                              h.color,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {!club && (
                            <span className="mt-1 block truncate text-[11px] text-ink">
                              <User className="me-1 inline h-3 w-3" />
                              {horseOwnerName(db, h)}
                              {horseOwnerPhone(db, h) ? ` · ${horseOwnerPhone(db, h)}` : ""}
                            </span>
                          )}
                          {h.discipline && (
                            <span className="mt-0.5 block text-[11px] text-muted">
                              {h.discipline}
                              {h.trainingLevel ? ` — ${h.trainingLevel}` : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {can("edit") && (
                            <IconBtn
                              title="Modifier"
                              icon={Edit}
                              onClick={() => {
                                setEditHorse(h);
                                setFormOpen(true);
                              }}
                            />
                          )}
                          {can("delete") && (
                            <IconBtn
                              title="Supprimer"
                              danger
                              icon={Trash2}
                              onClick={() => void remove(h)}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      {/* LES CHIFFRES : un cheval du club n'a pas de dette —
                          sa dépense est déjà sortie de la caisse. */}
                      <div
                        className={`mt-3 grid gap-1.5 border-t border-line pt-3 text-center ${
                          club ? "grid-cols-2" : "grid-cols-3"
                        }`}
                      >
                        <Mini label="Dépenses" value={formatDA(money.expenses)} tone="warning" />
                        {club ? (
                          <Mini
                            label="Prix de vente"
                            value={formatDA(h.sellingPrice ?? 0)}
                            tone="neutral"
                          />
                        ) : (
                          <>
                            <Mini label="Réglé" value={formatDA(money.paid)} tone="success" />
                            <Mini
                              label="Reste dû"
                              value={formatDA(money.debt)}
                              tone={money.debt > 0 ? "danger" : "neutral"}
                            />
                          </>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => setDetailHorse(h)}
                        >
                          <Eye className="h-3.5 w-3.5" /> Détails & suivi
                        </Button>
                        {can("expense") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => {
                              setEditExpense(null);
                              setExpenseFor(h);
                            }}
                          >
                            <Receipt className="h-3.5 w-3.5" /> Dépense
                          </Button>
                        )}
                        {!club && money.debt > 0 && can("pay") && (
                          <Button
                            size="sm"
                            variant="danger"
                            className="gap-1.5"
                            onClick={() => setPayFor(h)}
                          >
                            <Wallet className="h-3.5 w-3.5" /> Payer
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ---- Les fenêtres ---- */}
      {formOpen && (
        <HorseFormModal
          mode="stable"
          horse={editHorse}
          onClose={() => {
            setFormOpen(false);
            setEditHorse(null);
          }}
        />
      )}
      {detailHorse && (
        <HorseDetailsModal
          horse={db.horses.find((h) => h.id === detailHorse.id) ?? detailHorse}
          onClose={() => setDetailHorse(null)}
          onEditExpense={(e) => {
            setEditExpense(e);
            setExpenseFor(db.horses.find((h) => h.id === e.horseId) ?? detailHorse);
          }}
        />
      )}
      {expenseFor && (
        <HorseExpenseModal
          horse={expenseFor}
          expense={editExpense}
          onClose={() => {
            setExpenseFor(null);
            setEditExpense(null);
          }}
        />
      )}
      {payFor && (
        <HorseOwnerPayModal horse={payFor} onClose={() => setPayFor(null)} />
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Landmark;
  tone: "primary" | "success" | "danger" | "neutral";
}) {
  const ring = {
    primary: "border-primary/30 bg-primary-50/50 text-primary",
    success: "border-success/30 bg-success/10 text-success",
    danger: "border-danger/40 bg-danger/10 text-danger",
    neutral: "border-line bg-canvas/50 text-muted",
  }[tone];
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3.5 ${ring}`}>
      <Icon className="h-5 w-5 shrink-0 opacity-70" />
      <div className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80">
          {label}
        </span>
        <strong className="block text-base font-black tabular-nums">{value}</strong>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  const color = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    neutral: "text-ink",
  }[tone];
  return (
    <div className="rounded-xl bg-canvas/60 px-1.5 py-2">
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <strong className={`block text-xs font-black tabular-nums ${color}`}>{value}</strong>
    </div>
  );
}

function IconBtn({
  title,
  icon: Icon,
  onClick,
  danger,
}: {
  title: string;
  icon: typeof Edit;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition-colors ${
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-primary-50 hover:text-ink"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
