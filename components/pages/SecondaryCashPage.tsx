"use client";

/**
 * =============================================================================
 *  LA CAISSE SECONDAIRE — celle des travailleurs
 * =============================================================================
 *
 *  Elle a les mêmes gestes que la caisse générale — dépôt, retrait, rubrique,
 *  correction, suppression — mais elle ne montre QUE ce qu'elle a elle-même
 *  saisi. C'est toute sa raison d'être : un travailleur y enregistre ses
 *  mouvements sans lire le chiffre d'affaires du club, ni la paie des
 *  entraîneurs, ni les encaissements du comptoir.
 *
 *  ⚠️ L'ARGENT, LUI, N'EST PAS SÉPARÉ. Ces mouvements alimentent la MÊME
 *  trésorerie : la caisse générale les affiche tous, chacun portant l'étiquette
 *  de la caisse qui l'a saisi. Deux caisses réellement distinctes auraient
 *  demandé deux soldes, deux rapprochements et deux vérités — ce qui n'est pas
 *  ce qu'on veut d'un poste de travail secondaire.
 */

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  Edit,
  Filter,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { CashCategoryPicker } from "@/components/cash/CashCategoryPicker";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { useCan } from "@/lib/usePermissions";
import { formatDA } from "@/lib/utils";
import { formatDateFr, todayIso } from "@/lib/helpers";
import type { CashTransaction } from "@/lib/types";

export function SecondaryCashPage() {
  const can = useCan("cash-secondary");
  const db = useData();
  const { cashMove, updateItem, deleteFrom } = db;
  const { addToast } = useToast();

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "deposit" | "withdraw">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [editing, setEditing] = useState<CashTransaction | null>(null);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso());
  const [categoryId, setCategoryId] = useState("");

  const reset = () => {
    setAmount("");
    setDescription("");
    setDate(todayIso());
    setCategoryId("");
  };

  /** Elle ne montre QUE ses propres mouvements. Un mouvement sans caisse est
   *  antérieur à cette distinction : il appartient à la caisse générale. */
  const mine = useMemo(
    () => db.cash.filter((t) => t.caisse === "secondary"),
    [db.cash],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine
      .filter((t) => {
        const day = t.date.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (kind === "deposit" && t.amount <= 0) return false;
        if (kind === "withdraw" && t.amount >= 0) return false;
        if (!q) return true;
        return `${t.description} ${t.amount}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [mine, query, kind, from, to]);

  const inflow = rows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outflow = rows.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  /** Le solde DE CETTE CAISSE, tous mouvements confondus — pas celui du club. */
  const balance = mine.reduce((s, t) => s + t.amount, 0);

  const submit = (type: "deposit" | "withdraw") => {
    const value = Math.max(0, Number(amount) || 0);
    if (value <= 0 || !description.trim()) {
      addToast({
        type: "danger",
        title: "Mouvement refusé",
        message: "Un montant et une description sont nécessaires.",
      });
      return;
    }
    cashMove(type, value, description.trim(), date, categoryId || undefined, "secondary");
    addToast({
      type: "success",
      title: type === "deposit" ? "Dépôt enregistré" : "Retrait enregistré",
      message: `${formatDA(value)} — ${description.trim()}`,
    });
    reset();
    setDepositOpen(false);
    setWithdrawOpen(false);
  };

  const categoryName = (id?: string) =>
    id ? (db.cashCategories.find((c) => c.id === id)?.name ?? "") : "";

  return (
    <div>
      <PageHeader
        icon={Wallet}
        title="Caisse secondaire"
        subtitle="Les mouvements saisis par les travailleurs — visibles ici, et dans la caisse générale"
        actions={
          <div className="flex gap-2">
            {can("deposit") && (
              <Button
                onClick={() => {
                  reset();
                  setDepositOpen(true);
                }}
                variant="success"
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" /> Dépôt
              </Button>
            )}
            {can("withdraw") && (
              <Button
                onClick={() => {
                  reset();
                  setWithdrawOpen(true);
                }}
                variant="danger"
                className="gap-1.5"
              >
                <ArrowDownLeft className="h-4 w-4" /> Retrait
              </Button>
            )}
          </div>
        }
      />

      <p className="mb-5 rounded-xl border border-primary/25 bg-primary-50/40 p-3 text-[11px] leading-relaxed text-muted">
        Cette caisse ne montre que <strong className="text-ink">ses propres mouvements</strong>.
        L&apos;argent, lui, n&apos;est pas séparé : chaque ligne saisie ici apparaît aussi dans la{" "}
        <strong className="text-ink">caisse générale</strong>, marquée « caisse secondaire ».
      </p>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Entrées de la période" value={formatDA(inflow)} tone="success" icon={TrendingUp} />
        <Stat
          label="Sorties de la période"
          value={formatDA(outflow)}
          tone="danger"
          icon={TrendingDown}
        />
        <Stat
          label="Solde de cette caisse"
          value={formatDA(balance)}
          tone={balance >= 0 ? "primary" : "danger"}
          icon={Wallet}
        />
      </div>

      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end gap-2 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted start-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Description, montant…"
              className="ps-9"
            />
          </div>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="w-40"
          >
            <option value="all">Tous les mouvements</option>
            <option value="deposit">Dépôts</option>
            <option value="withdraw">Retraits</option>
          </Select>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted">Du</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted">Au</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {(from || to || kind !== "all" || query) && (
            <Button
              variant="ghost"
              className="gap-1.5"
              onClick={() => {
                setFrom("");
                setTo("");
                setKind("all");
                setQuery("");
              }}
            >
              <Filter className="h-4 w-4" /> Réinitialiser
            </Button>
          )}
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          message="Aucun mouvement dans cette caisse."
          hint="Les dépôts et les retraits saisis ici n'apparaissent que sur cet écran — et dans la caisse générale, où ils sont marqués comme venant de la caisse secondaire."
        />
      ) : (
        <Card>
          <CardBody>
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-canvas/60">
                  <tr className="text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2.5 text-start">Date</th>
                    <th className="px-3 py-2.5 text-start">Type</th>
                    <th className="px-3 py-2.5 text-start">Description</th>
                    <th className="px-3 py-2.5 text-start">Rubrique</th>
                    <th className="px-3 py-2.5 text-start">Saisi par</th>
                    <th className="px-3 py-2.5 text-end">Montant</th>
                    <th className="px-3 py-2.5 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-t border-line/60 hover:bg-primary-50/30">
                      <td className="px-3 py-2 text-muted">{formatDateFr(t.date.slice(0, 10))}</td>
                      <td className="px-3 py-2">
                        <Badge tone={t.amount >= 0 ? "success" : "danger"} className="text-[9px]">
                          {t.amount >= 0 ? "Dépôt" : "Retrait"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-ink">{t.description}</td>
                      <td className="px-3 py-2 text-muted">{categoryName(t.categoryId) || "—"}</td>
                      <td className="px-3 py-2 text-muted">{t.createdByName || "—"}</td>
                      <td
                        className={`px-3 py-2 text-end font-mono font-bold ${
                          t.amount >= 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {t.amount >= 0 ? "+" : ""}
                        {formatDA(t.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {can("edit") && (
                            <IconBtn title="Modifier" icon={Edit} onClick={() => setEditing(t)} />
                          )}
                          {can("delete") && (
                            <IconBtn
                              title="Supprimer"
                              danger
                              icon={Trash2}
                              onClick={() => {
                                if (!confirm("Supprimer ce mouvement ?")) return;
                                deleteFrom("cash", t.id);
                                addToast({
                                  type: "success",
                                  title: "Mouvement supprimé",
                                  message: t.description,
                                });
                              }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-line bg-canvas/60 text-[11px] font-bold">
                  <tr>
                    <td colSpan={5} className="px-3 py-2.5 text-end text-ink">
                      Total de la période
                    </td>
                    <td
                      className={`px-3 py-2.5 text-end font-mono ${
                        inflow - outflow >= 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      {formatDA(inflow - outflow)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ---- Dépôt / retrait ---- */}
      {(depositOpen || withdrawOpen) && (
        <Modal
          open
          onClose={() => {
            setDepositOpen(false);
            setWithdrawOpen(false);
          }}
          title={depositOpen ? "Dépôt en caisse secondaire" : "Retrait de la caisse secondaire"}
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setDepositOpen(false);
                  setWithdrawOpen(false);
                }}
              >
                Annuler
              </Button>
              <Button
                variant={depositOpen ? "success" : "danger"}
                onClick={() => submit(depositOpen ? "deposit" : "withdraw")}
              >
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">
                Montant (DA) <span className="text-danger">*</span>
              </label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">
                Description <span className="text-danger">*</span>
              </label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Rubrique</label>
              <CashCategoryPicker value={categoryId} onChange={setCategoryId} />
            </div>
          </div>
        </Modal>
      )}

      {/* ---- Correction ---- */}
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title="Modifier un mouvement"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button
                onClick={() => {
                  const value = Math.abs(Number(editing.amount) || 0);
                  updateItem("cash", editing.id, {
                    amount: editing.amount < 0 ? -value : value,
                    description: editing.description,
                    date: editing.date,
                    categoryId: editing.categoryId,
                  });
                  addToast({
                    type: "success",
                    title: "Mouvement modifié",
                    message: editing.description,
                  });
                  setEditing(null);
                }}
              >
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Montant (DA)</label>
              <Input
                type="number"
                value={Math.abs(editing.amount)}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    amount:
                      editing.amount < 0
                        ? -(Number(e.target.value) || 0)
                        : Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Description</label>
              <Input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Date</label>
              <Input
                type="date"
                value={editing.date.slice(0, 10)}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    date: `${e.target.value}T${new Date().toISOString().substring(11)}`,
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Rubrique</label>
              <CashCategoryPicker
                value={editing.categoryId ?? ""}
                onChange={(id) => setEditing({ ...editing, categoryId: id || undefined })}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "success" | "danger" | "primary";
  icon: typeof Wallet;
}) {
  const ring = {
    success: "border-success/30 bg-success/10 text-success",
    danger: "border-danger/40 bg-danger/10 text-danger",
    primary: "border-primary/30 bg-primary-50/50 text-primary",
  }[tone];
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${ring}`}>
      <div className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80">
          {label}
        </span>
        <strong className="mt-1 block text-xl font-black tabular-nums">{value}</strong>
      </div>
      <Icon className="h-6 w-6 shrink-0 opacity-70" />
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
