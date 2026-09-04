"use client";

/**
 * =============================================================================
 *  LES CHEVAUX D'UNE PERSONNE — sur sa fiche, et dans son espace
 * =============================================================================
 *
 *  Le même panneau sert quatre écrans : la fiche d'un chevalier, la fiche d'un
 *  parent, l'espace du chevalier et l'espace du parent. Écrit une fois, il ne
 *  peut pas raconter deux histoires différentes selon l'endroit d'où on le lit
 *  — ce qui serait le pire défaut d'un relevé de dettes.
 *
 *  IL RÉPOND À TROIS QUESTIONS, ET SEULEMENT À CELLES-LÀ :
 *
 *   1. QUELS CHEVAUX cette personne possède-t-elle, et que coûte leur
 *      entretien ? (ce qui est porté à son compte, ce qu'elle a réglé, ce qui
 *      reste dû, dépense par dépense) ;
 *   2. QUELS CHEVAUX a-t-elle ACHETÉS au club, et lui reste-t-il à payer ?
 *   3. QUELLES AUTRES DETTES porte-t-elle ?
 *
 *  `readOnly` sépare les deux publics : la gestion peut ouvrir la fiche
 *  complète d'un cheval ; une famille, dans son espace, lit ses chiffres et ne
 *  touche à rien.
 */

import { useMemo, useState } from "react";
import { Coins, Eye, Landmark, Receipt, Tag } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useData } from "@/lib/store/data";
import { formatDA } from "@/lib/utils";
import { formatDateFr } from "@/lib/helpers";
import {
  GENDER_LABEL,
  expenseCategoryLabel,
  horseAgeLabel,
  horseExpensesOf,
  horseMoney,
  horsesOfParent,
  horsesOfStudent,
  otherDebtMoney,
  salesOfParent,
  salesOfStudent,
} from "@/lib/stable";
import { HorseDetailsModal } from "./HorseDetailsModal";
import type { Horse } from "@/lib/types";

export function OwnerHorsesPanel({
  studentId,
  parentId,
  readOnly = false,
}: {
  studentId?: string;
  parentId?: string;
  /** l'espace d'une famille : on lit, on n'ouvre pas la fiche de gestion */
  readOnly?: boolean;
}) {
  const db = useData();
  const [detail, setDetail] = useState<Horse | null>(null);
  const [openHorse, setOpenHorse] = useState<string | null>(null);

  const horses = useMemo(
    () => [
      ...(studentId ? horsesOfStudent(db, studentId) : []),
      ...(parentId ? horsesOfParent(db, parentId) : []),
    ],
    [db, studentId, parentId],
  );

  const sales = useMemo(
    () => [
      ...(studentId ? salesOfStudent(db, studentId) : []),
      ...(parentId ? salesOfParent(db, parentId) : []),
    ],
    [db, studentId, parentId],
  );

  const debts = useMemo(
    () =>
      db.otherDebts.filter(
        (d) => (studentId && d.studentId === studentId) || (parentId && d.parentId === parentId),
      ),
    [db.otherDebts, studentId, parentId],
  );

  const upkeepCharged = horses.reduce((s, h) => s + horseMoney(db, h.id).charged, 0);
  const upkeepPaid = horses.reduce((s, h) => s + horseMoney(db, h.id).paid, 0);
  const upkeepDebt = horses.reduce((s, h) => s + horseMoney(db, h.id).debt, 0);
  const saleRest = sales.reduce((s, x) => s + x.rest, 0);
  const otherRest = debts.reduce((s, d) => s + otherDebtMoney(db, d.id).rest, 0);
  const grandDebt = upkeepDebt + saleRest + otherRest;

  if (horses.length === 0 && sales.length === 0 && debts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line py-8 text-center text-xs italic text-muted">
        Aucun cheval, aucun achat de cheval et aucune autre dette rattachés à cette fiche.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---- LE TOTAL, D'ABORD. C'est la question qu'on pose en ouvrant. ---- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Entretien porté au compte" value={formatDA(upkeepCharged)} tone="warning" />
        <Stat label="Entretien réglé" value={formatDA(upkeepPaid)} tone="success" />
        <Stat label="Achats de chevaux — reste" value={formatDA(saleRest)} tone={saleRest > 0 ? "danger" : "neutral"} />
        <Stat
          label="Total dû (écurie + autres)"
          value={formatDA(grandDebt)}
          tone={grandDebt > 0 ? "danger" : "success"}
        />
      </div>

      {/* ================= LES CHEVAUX POSSÉDÉS ================= */}
      {horses.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
            <Landmark className="h-3.5 w-3.5 text-primary" /> Ses chevaux ({horses.length})
          </h4>
          <div className="space-y-2">
            {horses.map((h) => {
              const money = horseMoney(db, h.id);
              const expanded = openHorse === h.id;
              const expenses = expanded ? horseExpensesOf(db, h.id) : [];
              const payments = expanded
                ? db.horseOwnerPayments
                    .filter((p) => p.horseId === h.id)
                    .sort((a, b) => b.date.localeCompare(a.date))
                : [];
              return (
                <div
                  key={h.id}
                  className={`rounded-2xl border p-3 ${
                    money.debt > 0 ? "border-danger/40 bg-danger/5" : "border-line"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-ink">{h.name}</strong>
                      <span className="block text-[11px] text-muted">
                        {[
                          h.reference,
                          h.breed,
                          h.gender ? GENDER_LABEL[h.gender] : "",
                          horseAgeLabel(h),
                          h.color,
                          h.discipline,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge tone={money.debt > 0 ? "danger" : "success"} className="text-[9px]">
                        {money.debt > 0 ? `Reste ${formatDA(money.debt)}` : "À jour"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setOpenHorse(expanded ? null : h.id)}
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        {expanded ? "Masquer le détail" : "Voir le détail"}
                      </Button>
                      {!readOnly && (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setDetail(h)}
                          title="Ouvrir la fiche complète du cheval"
                        >
                          <Eye className="h-3.5 w-3.5" /> Fiche
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-1.5 border-t border-line pt-2 text-center">
                    <Mini label="Dépenses" value={formatDA(money.expenses)} />
                    <Mini label="Réglé" value={formatDA(money.paid)} tone="success" />
                    <Mini
                      label="Reste dû"
                      value={formatDA(money.debt)}
                      tone={money.debt > 0 ? "danger" : "neutral"}
                    />
                  </div>

                  {/* LE DÉTAIL, DÉPENSE PAR DÉPENSE — c'est ce qu'une famille
                      demande quand elle reçoit une note : « de quoi s'agit-il ? » */}
                  {expanded && (
                    <div className="mt-3 space-y-3">
                      <div className="overflow-x-auto rounded-xl border border-line">
                        <table className="w-full min-w-[480px] text-[11px]">
                          <thead className="bg-canvas/60">
                            <tr className="text-[9px] uppercase tracking-wide text-muted">
                              <th className="px-2.5 py-1.5 text-start">Date</th>
                              <th className="px-2.5 py-1.5 text-start">Rubrique</th>
                              <th className="px-2.5 py-1.5 text-start">Description</th>
                              <th className="px-2.5 py-1.5 text-end">Montant</th>
                            </tr>
                          </thead>
                          <tbody>
                            {expenses.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-2.5 py-3 text-center italic text-muted">
                                  Aucune dépense enregistrée.
                                </td>
                              </tr>
                            ) : (
                              expenses.map((e) => (
                                <tr key={e.id} className="border-t border-line/60">
                                  <td className="px-2.5 py-1.5 text-muted">
                                    {formatDateFr(e.date)}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-ink">
                                    {expenseCategoryLabel(db, e)}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-muted">
                                    {e.description || "—"}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-end font-mono text-ink">
                                    {formatDA(e.amount)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-line">
                        <table className="w-full min-w-[420px] text-[11px]">
                          <thead className="bg-canvas/60">
                            <tr className="text-[9px] uppercase tracking-wide text-muted">
                              <th className="px-2.5 py-1.5 text-start">Règlement</th>
                              <th className="px-2.5 py-1.5 text-start">Description</th>
                              <th className="px-2.5 py-1.5 text-end">Montant</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payments.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-2.5 py-3 text-center italic text-muted">
                                  Aucun règlement enregistré.
                                </td>
                              </tr>
                            ) : (
                              payments.map((p) => (
                                <tr key={p.id} className="border-t border-line/60">
                                  <td className="px-2.5 py-1.5 text-muted">
                                    {formatDateFr(p.date)}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-ink">
                                    {p.description || "—"}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-end font-mono text-success">
                                    {formatDA(p.amount)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ================= LES ACHATS DE CHEVAUX ================= */}
      {sales.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
            <Coins className="h-3.5 w-3.5 text-primary" /> Ses achats de chevaux ({sales.length})
          </h4>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-canvas/60">
                <tr className="text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 text-start">Date</th>
                  <th className="px-3 py-2 text-start">Cheval</th>
                  <th className="px-3 py-2 text-end">Net</th>
                  <th className="px-3 py-2 text-end">Versé</th>
                  <th className="px-3 py-2 text-end">Reste</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-t border-line/60 ${s.rest > 0 ? "bg-danger/5" : ""}`}
                  >
                    <td className="px-3 py-2 text-muted">{formatDateFr(s.date)}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{s.horseName}</td>
                    <td className="px-3 py-2 text-end font-mono text-ink">{formatDA(s.total)}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ================= LES AUTRES DETTES ================= */}
      {debts.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
            <Tag className="h-3.5 w-3.5 text-warning" /> Ses autres dettes ({debts.length})
          </h4>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-canvas/60">
                <tr className="text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 text-start">Date</th>
                  <th className="px-3 py-2 text-start">Objet</th>
                  <th className="px-3 py-2 text-end">Montant</th>
                  <th className="px-3 py-2 text-end">Réglé</th>
                  <th className="px-3 py-2 text-end">Reste</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((d) => {
                  const m = otherDebtMoney(db, d.id);
                  return (
                    <tr
                      key={d.id}
                      className={`border-t border-line/60 ${m.rest > 0 ? "bg-danger/5" : ""}`}
                    >
                      <td className="px-3 py-2 text-muted">{formatDateFr(d.date)}</td>
                      <td className="px-3 py-2 text-ink">{d.description || "—"}</td>
                      <td className="px-3 py-2 text-end font-mono text-ink">
                        {formatDA(m.amount)}
                      </td>
                      <td className="px-3 py-2 text-end font-mono text-success">
                        {formatDA(m.paid)}
                      </td>
                      <td className="px-3 py-2 text-end font-mono">
                        {m.rest > 0 ? (
                          <strong className="text-danger">{formatDA(m.rest)}</strong>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail && !readOnly && (
        <HorseDetailsModal
          horse={db.horses.find((h) => h.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const ring = {
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/35 bg-warning/10 text-warning",
    danger: "border-danger/35 bg-danger/10 text-danger",
    neutral: "border-line bg-canvas/50 text-ink",
  }[tone];
  return (
    <div className={`rounded-xl border p-2.5 text-center ${ring}`}>
      <span className="block text-[9px] font-bold uppercase tracking-wide opacity-80">{label}</span>
      <strong className="block text-sm font-black tabular-nums">{value}</strong>
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
  tone?: "success" | "danger" | "neutral";
}) {
  const color = { success: "text-success", danger: "text-danger", neutral: "text-ink" }[tone];
  return (
    <div>
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <strong className={`block text-xs font-black tabular-nums ${color}`}>{value}</strong>
    </div>
  );
}
