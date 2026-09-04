"use client";

/**
 * =============================================================================
 *  ACHAT & VENTE DES CHEVAUX
 * =============================================================================
 *
 *  Deux listes sur un seul écran, et un bouton pour passer de l'une à l'autre :
 *
 *   • LES CHEVAUX ACHETÉS — leur fiche, leur prix, leur état (disponible ou
 *     vendu), avec de quoi modifier, supprimer et tout relire ;
 *   • L'HISTORIQUE DES VENTES — qui a acheté quoi, pour combien, et ce qui
 *     reste dû.
 *
 *  LES VENTES À CRÉDIT SONT ANNONCÉES EN HAUT, EN ROUGE, ET ELLES SE CLIQUENT.
 *  Une dette qui dort au fond d'un onglet n'est jamais recouvrée : l'alerte est
 *  la première chose que l'écran montre, et un clic mène droit au détail où
 *  l'on encaisse.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Coins,
  Edit,
  Eye,
  History,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { useToast } from "@/lib/store/toast";
import { useCan } from "@/lib/usePermissions";
import { printHtmlDocument } from "@/lib/print";
import { formatDA } from "@/lib/utils";
import { formatDateFr } from "@/lib/helpers";
import {
  GENDER_LABEL,
  buyerName,
  horseAgeLabel,
  horseMoney,
  salesOf,
} from "@/lib/stable";
import { buildHorseSaleDocument } from "@/lib/reports/stable";
import { HorseFormModal } from "@/components/stable/HorseFormModal";
import { HorseDetailsModal } from "@/components/stable/HorseDetailsModal";
import { HorseSaleModal } from "@/components/stable/HorseSaleModal";
import { HorseSaleDetailsModal } from "@/components/stable/HorseSaleDetailsModal";
import type { Horse, HorseSale } from "@/lib/types";

type Tab = "horses" | "sales";

export function HorseTradePage() {
  const can = useCan("horses");
  const db = useData();
  const { deleteHorse, deleteHorseSale } = db;
  const language = useSettings((s) => s.language);
  const { addToast } = useToast();

  const [tab, setTab] = useState<Tab>("horses");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "available" | "sold">("all");
  const [gender, setGender] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "price" | "margin">("recent");

  const [formOpen, setFormOpen] = useState(false);
  const [editHorse, setEditHorse] = useState<Horse | null>(null);
  const [detailHorse, setDetailHorse] = useState<Horse | null>(null);
  const [saleOpen, setSaleOpen] = useState(false);
  const [editSale, setEditSale] = useState<HorseSale | null>(null);
  const [detailSale, setDetailSale] = useState<HorseSale | null>(null);

  /** L'écran d'achat montre LES CHEVAUX ACHETÉS. Ceux nés sur place ou mis en
   *  pension vivent à l'écurie — ils n'ont pas d'achat à raconter. */
  const purchased = useMemo(
    () => db.horses.filter((h) => h.origin === "purchase"),
    [db.horses],
  );

  const disciplines = useMemo(
    () => [...new Set(db.horses.map((h) => h.discipline).filter(Boolean) as string[])].sort(),
    [db.horses],
  );

  const horses = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = purchased.filter((h) => {
      if (status !== "all" && h.status !== status) return false;
      if (gender && h.gender !== gender) return false;
      if (discipline && h.discipline !== discipline) return false;
      if (!q) return true;
      return `${h.name} ${h.reference ?? ""} ${h.breed ?? ""} ${h.color ?? ""} ${h.sellerName ?? ""}`
        .toLowerCase()
        .includes(q);
    });
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "price") return (b.sellingPrice ?? 0) - (a.sellingPrice ?? 0);
      if (sort === "margin") {
        const m = (h: Horse) =>
          (h.sellingPrice ?? 0) - (h.purchasePrice ?? 0) - horseMoney(db, h.id).expenses;
        return m(b) - m(a);
      }
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  }, [purchased, query, status, gender, discipline, sort, db]);

  const sales = useMemo(() => {
    const q = query.trim().toLowerCase();
    return salesOf(db).filter((s) =>
      !q
        ? true
        : `${s.horseName} ${buyerName(db, s)} ${s.buyerPhone ?? ""}`.toLowerCase().includes(q),
    );
  }, [db, query]);

  const creditSales = useMemo(() => db.horseSales.filter((s) => s.rest > 0), [db.horseSales]);
  const creditTotal = creditSales.reduce((s, x) => s + x.rest, 0);

  const removeHorse = async (h: Horse) => {
    if (
      !confirm(
        `Supprimer le cheval « ${h.name} » ?\n\nSes dépenses, ses règlements et sa vente éventuelle partent avec lui, ainsi que les mouvements de caisse correspondants.`,
      )
    )
      return;
    await deleteHorse(h.id);
    addToast({ type: "success", title: "Cheval supprimé", message: h.name });
  };

  const removeSale = async (s: HorseSale) => {
    if (
      !confirm(
        `Supprimer la vente du cheval « ${s.horseName} » ?\n\nLe cheval redeviendra disponible et les encaissements seront repris en caisse.`,
      )
    )
      return;
    await deleteHorseSale(s.id);
    addToast({ type: "success", title: "Vente supprimée", message: s.horseName });
  };

  return (
    <div>
      <PageHeader
        icon={Coins}
        title="Achat & vente des chevaux"
        subtitle="Ce que le club achète, ce qu'il revend, et ce qui reste dû"
        actions={
          <div className="flex flex-wrap gap-2">
            {can("create") && (
              <Button
                onClick={() => {
                  setEditHorse(null);
                  setFormOpen(true);
                }}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" /> Nouvel achat
              </Button>
            )}
            {can("sell") && (
              <Button variant="accent" onClick={() => setSaleOpen(true)} className="gap-1.5">
                <Coins className="h-4 w-4" /> Nouvelle vente
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setTab(tab === "horses" ? "sales" : "horses")}
              className="gap-1.5"
            >
              {tab === "horses" ? (
                <>
                  <History className="h-4 w-4" /> Historique des ventes
                </>
              ) : (
                <>
                  <ArrowLeft className="h-4 w-4" /> Retour aux chevaux
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* ---- L'ALERTE DES VENTES À CRÉDIT ---- */}
      {creditSales.length > 0 && (
        <button
          type="button"
          onClick={() => setTab("sales")}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border-2 border-danger/40 bg-danger/10 p-4 text-start transition-colors hover:bg-danger/15"
        >
          <AlertTriangle className="h-6 w-6 shrink-0 text-danger" />
          <span className="min-w-0 flex-1">
            <strong className="block text-sm text-danger">
              {creditSales.length} vente(s) à crédit — {formatDA(creditTotal)} restent dus
            </strong>
            <span className="block text-[11px] text-muted">
              {creditSales
                .slice(0, 3)
                .map((s) => `${s.horseName} · ${buyerName(db, s)} (${formatDA(s.rest)})`)
                .join("  |  ")}
              {creditSales.length > 3 ? "  |  …" : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs font-bold text-danger">Voir le détail →</span>
        </button>
      )}

      {/* ---- La recherche et les filtres ---- */}
      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end gap-2 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted start-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "horses"
                  ? "Nom, référence, race, robe, vendeur…"
                  : "Cheval, acheteur, téléphone…"
              }
              className="ps-9"
            />
          </div>
          {tab === "horses" && (
            <>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-40"
              >
                <option value="all">Tous les états</option>
                <option value="available">Disponibles</option>
                <option value="sold">Vendus</option>
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
                className="w-44"
              >
                <option value="recent">Les plus récents</option>
                <option value="name">Par nom</option>
                <option value="price">Prix de vente décroissant</option>
                <option value="margin">Marge décroissante</option>
              </Select>
            </>
          )}
        </CardBody>
      </Card>

      {/* ================= LES CHEVAUX ================= */}
      {tab === "horses" &&
        (horses.length === 0 ? (
          <EmptyState
            icon={Coins}
            message="Aucun cheval acheté pour le moment."
            hint="« Nouvel achat » enregistre la fiche complète d'un cheval et sort son prix de la caisse. Seuls le nom et les deux prix sont obligatoires."
            action={
              can("create") ? (
                <Button
                  onClick={() => {
                    setEditHorse(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Nouvel achat
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {horses.map((h, i) => {
              const cost = horseMoney(db, h.id);
              const margin = (h.sellingPrice ?? 0) - (h.purchasePrice ?? 0) - cost.expenses;
              return (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.32), duration: 0.3 }}
                >
                  <Card className={`h-full ${h.status === "sold" ? "border-2 border-line" : ""}`}>
                    <CardBody className="flex h-full flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Badge tone={h.status === "sold" ? "neutral" : "success"}>
                              {h.status === "sold" ? "Vendu" : "Disponible"}
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
                            {h.discipline && (
                              <span className="mt-1 block text-[11px] text-muted">
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
                                onClick={() => void removeHorse(h)}
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-line pt-3 text-center sm:grid-cols-4">
                          <Mini label="Achat" value={formatDA(h.purchasePrice ?? 0)} />
                          <Mini label="Vente" value={formatDA(h.sellingPrice ?? 0)} />
                          <Mini
                            label="Dépenses"
                            value={formatDA(cost.expenses)}
                            tone={cost.expenses > 0 ? "warning" : "neutral"}
                          />
                          <Mini
                            label="Marge"
                            value={formatDA(margin)}
                            tone={margin >= 0 ? "success" : "danger"}
                          />
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() => setDetailHorse(h)}
                          >
                            <Eye className="h-3.5 w-3.5" /> Voir les détails
                          </Button>
                          {h.status === "available" && can("sell") && (
                            <Button
                              size="sm"
                              variant="accent"
                              className="gap-1.5"
                              onClick={() => {
                                setEditSale(null);
                                setDetailHorse(null);
                                setSaleOpen(true);
                              }}
                            >
                              <Coins className="h-3.5 w-3.5" /> Vendre
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
        ))}

      {/* ================= L'HISTORIQUE DES VENTES ================= */}
      {tab === "sales" &&
        (sales.length === 0 ? (
          <EmptyState icon={History} message="Aucune vente enregistrée." />
        ) : (
          <Card>
            <CardBody>
              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="bg-canvas/60">
                    <tr className="text-[10px] uppercase tracking-wide text-muted">
                      <th className="px-3 py-2.5 text-start">Date</th>
                      <th className="px-3 py-2.5 text-start">Cheval</th>
                      <th className="px-3 py-2.5 text-start">Acheteur</th>
                      <th className="px-3 py-2.5 text-start">Téléphone</th>
                      <th className="px-3 py-2.5 text-end">Net à payer</th>
                      <th className="px-3 py-2.5 text-end">Versé</th>
                      <th className="px-3 py-2.5 text-end">Reste</th>
                      <th className="px-3 py-2.5 text-center">État</th>
                      <th className="px-3 py-2.5 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr
                        key={s.id}
                        className={`border-t border-line/60 ${
                          s.rest > 0 ? "bg-danger/5" : "hover:bg-primary-50/30"
                        }`}
                      >
                        <td className="px-3 py-2 text-muted">{formatDateFr(s.date)}</td>
                        <td className="px-3 py-2 font-semibold text-ink">{s.horseName}</td>
                        <td className="px-3 py-2 text-ink">{buyerName(db, s)}</td>
                        <td className="px-3 py-2 text-muted">{s.buyerPhone || "—"}</td>
                        <td className="px-3 py-2 text-end font-mono text-ink">
                          {formatDA(s.total)}
                        </td>
                        <td className="px-3 py-2 text-end font-mono text-success">
                          {formatDA(s.paid)}
                        </td>
                        <td className="px-3 py-2 text-end font-mono">
                          {s.rest > 0 ? (
                            <strong className="text-danger">{formatDA(s.rest)}</strong>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge tone={s.rest > 0 ? "danger" : "success"} className="text-[9px]">
                            {s.rest > 0 ? "À crédit" : "Soldée"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <IconBtn
                              title="Voir les détails"
                              icon={Eye}
                              onClick={() => setDetailSale(s)}
                            />
                            {can("sell") && (
                              <IconBtn
                                title="Modifier"
                                icon={Edit}
                                onClick={() => {
                                  setEditSale(s);
                                  setSaleOpen(true);
                                }}
                              />
                            )}
                            <IconBtn
                              title="Imprimer le bon de vente"
                              icon={Printer}
                              onClick={() =>
                                printHtmlDocument(
                                  buildHorseSaleDocument({
                                    db,
                                    school: db.school,
                                    lang: language,
                                    sale: s,
                                  }),
                                )
                              }
                            />
                            {can("delete") && (
                              <IconBtn
                                title="Supprimer"
                                danger
                                icon={Trash2}
                                onClick={() => void removeSale(s)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        ))}

      {/* ---- Les fenêtres ---- */}
      {formOpen && (
        <HorseFormModal
          mode="purchase"
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
        />
      )}
      {saleOpen && (
        <HorseSaleModal
          sale={editSale}
          onClose={() => {
            setSaleOpen(false);
            setEditSale(null);
          }}
        />
      )}
      {detailSale && (
        <HorseSaleDetailsModal
          sale={db.horseSales.find((s) => s.id === detailSale.id) ?? detailSale}
          onClose={() => setDetailSale(null)}
        />
      )}
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
