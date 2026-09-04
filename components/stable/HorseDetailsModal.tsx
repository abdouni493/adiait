"use client";

/**
 * =============================================================================
 *  LE DÉTAIL D'UN CHEVAL — sa fiche, son suivi, son argent
 * =============================================================================
 *
 *  Quatre onglets, et chacun répond à une question qu'on se pose devant un
 *  cheval :
 *
 *   • LA FICHE      — qui est cet animal (identité, santé, travail, origines) ;
 *   • LES DÉPENSES  — ce qu'il a coûté, avec le RELEVÉ SUR UNE PÉRIODE que le
 *                     propriétaire réclame en fin de mois ;
 *   • LES RÈGLEMENTS— ce que son propriétaire a versé, ligne à ligne ;
 *   • LA VENTE      — s'il a été vendu, à qui et pour combien.
 *
 *  LE RELEVÉ DE PÉRIODE EST LA PIÈCE QUI COMPTE. Il donne le total par rubrique
 *  sur les dates choisies, le total général, ce qui a été versé et ce qui reste
 *  dû — et il s'imprime avec l'en-tête complet du club. C'est ce document-là
 *  qu'on tend à un propriétaire, pas une liste de lignes à l'écran.
 */

import { useMemo, useState } from "react";
import {
  Coins,
  Edit,
  FileText,
  HeartPulse,
  Printer,
  Receipt,
  Trash2,
  Trophy,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/SearchInput";
import { useData } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { useToast } from "@/lib/store/toast";
import { printHtmlDocument } from "@/lib/print";
import { formatDA } from "@/lib/utils";
import { formatDateFr, todayIso } from "@/lib/helpers";
import {
  GENDER_LABEL,
  OWNER_KIND_LABEL,
  buyerName,
  expenseCategoryLabel,
  horseAgeLabel,
  horseExpensesOf,
  horseMoney,
  horseOwnerName,
  horseOwnerPhone,
  saleOfHorse,
} from "@/lib/stable";
import {
  buildHorseExpenseReport,
  buildHorseSheet,
  buildStablePaymentReceipt,
} from "@/lib/reports/stable";
import type { Horse, HorseExpense, HorseOwnerPayment } from "@/lib/types";

const TABS = [
  { id: "sheet", label: "La fiche", icon: FileText },
  { id: "expenses", label: "Les dépenses", icon: Receipt },
  { id: "payments", label: "Les règlements", icon: Wallet },
  { id: "sale", label: "La vente", icon: Coins },
] as const;

export function HorseDetailsModal({
  horse,
  onClose,
  onEditExpense,
}: {
  horse: Horse;
  onClose: () => void;
  /** rouvre le formulaire de dépense sur une ligne existante */
  onEditExpense?: (expense: HorseExpense) => void;
}) {
  const db = useData();
  const { deleteHorseExpense, updateHorseOwnerPayment, deleteHorseOwnerPayment } = db;
  const language = useSettings((s) => s.language);
  const { addToast } = useToast();

  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("sheet");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayIso());
  const [generated, setGenerated] = useState<{ from: string; to: string } | null>(null);
  const [editPayment, setEditPayment] = useState<HorseOwnerPayment | null>(null);

  const money = horseMoney(db, horse.id);
  const expenses = horseExpensesOf(db, horse.id);
  const payments = useMemo(
    () =>
      db.horseOwnerPayments
        .filter((p) => p.horseId === horse.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [db.horseOwnerPayments, horse.id],
  );
  const sale = saleOfHorse(db, horse.id);

  /** Le tableau du relevé : une ligne par rubrique, sur la période choisie. */
  const report = useMemo(() => {
    if (!generated) return null;
    const rows = new Map<string, number>();
    let total = 0;
    for (const e of db.horseExpenses) {
      if (e.horseId !== horse.id || e.date < generated.from || e.date > generated.to) continue;
      const label = expenseCategoryLabel(db, e);
      rows.set(label, (rows.get(label) ?? 0) + e.amount);
      total += e.amount;
    }
    const paid = db.horseOwnerPayments
      .filter((p) => p.horseId === horse.id && p.date >= generated.from && p.date <= generated.to)
      .reduce((s, p) => s + p.amount, 0);
    return {
      rows: [...rows.entries()].sort((a, b) => b[1] - a[1]),
      total,
      paid,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated, db.horseExpenses, db.horseOwnerPayments, horse.id]);

  const printReport = () => {
    if (!generated) return;
    printHtmlDocument(
      buildHorseExpenseReport({
        db,
        school: db.school,
        lang: language,
        horse,
        from: generated.from,
        to: generated.to,
      }),
    );
  };

  return (
    <Modal open onClose={onClose} wide title={`Cheval « ${horse.name} »`}>
      <div className="space-y-4">
        {/* ---- Le bandeau d'argent ---- */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Dépenses" value={formatDA(money.expenses)} tone="warning" />
          <Stat
            label={horse.ownerKind === "club" ? "Sur la caisse" : "Porté au propriétaire"}
            value={formatDA(horse.ownerKind === "club" ? money.expenses : money.charged)}
            tone="neutral"
          />
          <Stat label="Réglé" value={formatDA(money.paid)} tone="success" />
          <Stat
            label="Reste dû"
            value={formatDA(money.debt)}
            tone={money.debt > 0 ? "danger" : "neutral"}
          />
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-canvas p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === t.id ? "bg-gradient-primary text-white" : "text-muted hover:text-ink"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* ================= LA FICHE ================= */}
        {tab === "sheet" && (
          <div className="space-y-3">
            <Block title="Identité" icon={FileText}>
              <Line label="Nom" value={horse.name} />
              <Line label="Référence" value={horse.reference} />
              <Line label="Race" value={horse.breed} />
              <Line label="Sexe" value={horse.gender ? GENDER_LABEL[horse.gender] : undefined} />
              <Line label="Naissance" value={horse.birthDate ? formatDateFr(horse.birthDate) : undefined} />
              <Line label="Âge" value={horseAgeLabel(horse)} />
              <Line label="Robe" value={horse.color} />
              <Line label="Taille" value={horse.height} />
              <Line label="Poids" value={horse.weight} />
              <Line label="Statut" value={horse.status === "sold" ? "Vendu" : "Disponible"} />
              <Line label="Propriétaire" value={horseOwnerName(db, horse)} />
              <Line label="Type de propriétaire" value={OWNER_KIND_LABEL[horse.ownerKind]} />
              <Line label="Téléphone du propriétaire" value={horseOwnerPhone(db, horse)} />
              <Line label="Note sur le propriétaire" value={horse.ownerNote} />
            </Block>

            <Block title="Santé" icon={HeartPulse}>
              <Line label="Vaccinations" value={horse.vaccination} wide />
              <Line label="Antécédents médicaux" value={horse.medicalHistory} wide />
              <Line label="Examen vétérinaire" value={horse.vetExam} wide />
            </Block>

            <Block title="Travail" icon={Trophy}>
              <Line label="Discipline" value={horse.discipline} />
              <Line label="Niveau" value={horse.trainingLevel} />
              <Line label="Compétitions" value={horse.competitionHistory} wide />
              <Line label="Récompenses" value={horse.awards} wide />
            </Block>

            <Block title="Origines" icon={FileText}>
              <Line label="Père" value={horse.sire} />
              <Line label="Mère" value={horse.dam} />
              <Line label="Documents" value={horse.pedigreeDocs} wide />
            </Block>

            <Block title="Achat" icon={Coins}>
              <Line
                label="Prix d'achat"
                value={horse.purchasePrice ? formatDA(horse.purchasePrice) : undefined}
              />
              <Line
                label="Date d'achat"
                value={horse.purchaseDate ? formatDateFr(horse.purchaseDate) : undefined}
              />
              <Line label="Vendeur" value={horse.sellerName} />
              <Line label="Téléphone du vendeur" value={horse.sellerPhone} />
              <Line label="Note sur le vendeur" value={horse.sellerNote} wide />
              <Line
                label="Prix de vente affiché"
                value={horse.sellingPrice ? formatDA(horse.sellingPrice) : undefined}
              />
            </Block>

            <div className="flex justify-end">
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() =>
                  printHtmlDocument(
                    buildHorseSheet({ db, school: db.school, lang: language, horse }),
                  )
                }
              >
                <Printer className="h-4 w-4" /> Imprimer la fiche
              </Button>
            </div>
          </div>
        )}

        {/* ================= LES DÉPENSES ================= */}
        {tab === "expenses" && (
          <div className="space-y-4">
            {/* ---- Le relevé de période ---- */}
            <div className="rounded-2xl border border-line bg-canvas/40 p-3.5">
              <h4 className="mb-2 text-xs font-bold text-ink">
                Relevé des dépenses sur une période
              </h4>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-muted">Du</label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-muted">Au</label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <Button
                  disabled={!from || !to || to < from}
                  onClick={() => setGenerated({ from, to })}
                  className="gap-1.5"
                >
                  <FileText className="h-4 w-4" /> Générer
                </Button>
                {report && (
                  <Button variant="outline" onClick={printReport} className="gap-1.5">
                    <Printer className="h-4 w-4" /> Imprimer
                  </Button>
                )}
              </div>

              {report && (
                <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                  <table className="w-full text-xs">
                    <thead className="bg-surface">
                      <tr className="text-[10px] uppercase tracking-wide text-muted">
                        <th className="px-3 py-2 text-start">Rubrique</th>
                        <th className="px-3 py-2 text-end">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-3 py-4 text-center italic text-muted">
                            Aucune dépense sur cette période.
                          </td>
                        </tr>
                      ) : (
                        report.rows.map(([label, amount]) => (
                          <tr key={label} className="border-t border-line/60">
                            <td className="px-3 py-2 text-ink">{label}</td>
                            <td className="px-3 py-2 text-end font-mono text-ink">
                              {formatDA(amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="border-t-2 border-line bg-canvas/60 text-[11px] font-bold">
                      <tr>
                        <td className="px-3 py-2 text-ink">Total de la période</td>
                        <td className="px-3 py-2 text-end font-mono text-ink">
                          {formatDA(report.total)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-success">Versements de la période</td>
                        <td className="px-3 py-2 text-end font-mono text-success">
                          {formatDA(report.paid)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-danger">Reste dû à ce jour</td>
                        <td className="px-3 py-2 text-end font-mono text-danger">
                          {formatDA(money.debt)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* ---- Le détail ---- */}
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="bg-canvas/60">
                  <tr className="text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 text-start">Date</th>
                    <th className="px-3 py-2 text-start">Rubrique</th>
                    <th className="px-3 py-2 text-start">Description</th>
                    <th className="px-3 py-2 text-start">Portée à</th>
                    <th className="px-3 py-2 text-end">Montant</th>
                    <th className="px-3 py-2 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center italic text-muted">
                        Aucune dépense enregistrée pour ce cheval.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((e) => (
                      <tr key={e.id} className="border-t border-line/60">
                        <td className="px-3 py-2 text-muted">{formatDateFr(e.date)}</td>
                        <td className="px-3 py-2 text-ink">{expenseCategoryLabel(db, e)}</td>
                        <td className="px-3 py-2 text-muted">{e.description || "—"}</td>
                        <td className="px-3 py-2">
                          <Badge tone={e.ownerDebt ? "warning" : "primary"} className="text-[9px]">
                            {e.ownerDebt ? "Propriétaire" : "Caisse du club"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-end font-mono text-ink">
                          {formatDA(e.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            {onEditExpense && (
                              <IconBtn
                                title="Modifier"
                                onClick={() => onEditExpense(e)}
                                icon={Edit}
                              />
                            )}
                            <IconBtn
                              title="Supprimer"
                              danger
                              icon={Trash2}
                              onClick={async () => {
                                if (!confirm("Supprimer cette dépense ?")) return;
                                await deleteHorseExpense(e.id);
                                addToast({
                                  type: "success",
                                  title: "Dépense supprimée",
                                  message: "Le mouvement de caisse correspondant a été repris.",
                                });
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= LES RÈGLEMENTS ================= */}
        {tab === "payments" && (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-canvas/60">
                <tr className="text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 text-start">Date</th>
                  <th className="px-3 py-2 text-start">Description</th>
                  <th className="px-3 py-2 text-end">Montant</th>
                  <th className="px-3 py-2 text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center italic text-muted">
                      Aucun règlement enregistré.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id} className="border-t border-line/60">
                      <td className="px-3 py-2 text-muted">{formatDateFr(p.date)}</td>
                      <td className="px-3 py-2 text-ink">{p.description || "—"}</td>
                      <td className="px-3 py-2 text-end font-mono text-success">
                        {formatDA(p.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <IconBtn title="Modifier" icon={Edit} onClick={() => setEditPayment(p)} />
                          <IconBtn
                            title="Imprimer le reçu"
                            icon={Printer}
                            onClick={() =>
                              printHtmlDocument(
                                buildStablePaymentReceipt({
                                  school: db.school,
                                  lang: language,
                                  title: "Reçu de règlement — écurie",
                                  subject: `Entretien du cheval « ${horse.name} »`,
                                  personName: horseOwnerName(db, horse),
                                  personPhone: horseOwnerPhone(db, horse),
                                  amount: p.amount,
                                  date: p.date,
                                  total: money.charged,
                                  paidBefore: money.paid - p.amount,
                                  description: p.description,
                                }),
                              )
                            }
                          />
                          <IconBtn
                            title="Supprimer"
                            danger
                            icon={Trash2}
                            onClick={async () => {
                              if (!confirm("Supprimer ce règlement ?")) return;
                              await deleteHorseOwnerPayment(p.id);
                              addToast({
                                type: "success",
                                title: "Règlement supprimé",
                                message: "La dette du propriétaire remonte d'autant.",
                              });
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ================= LA VENTE ================= */}
        {tab === "sale" && (
          <div>
            {!sale ? (
              <p className="py-8 text-center text-xs italic text-muted">
                Ce cheval n&apos;a pas été vendu.
              </p>
            ) : (
              <Block title={`Vendu le ${formatDateFr(sale.date)}`} icon={Coins}>
                <Line label="Acheteur" value={buyerName(db, sale)} />
                <Line label="Téléphone" value={sale.buyerPhone} />
                <Line label="Prix affiché" value={formatDA(sale.basePrice)} />
                <Line
                  label="Remise"
                  value={
                    sale.discountType && sale.discountValue
                      ? sale.discountType === "percent"
                        ? `${sale.discountValue} %`
                        : formatDA(sale.discountValue)
                      : undefined
                  }
                />
                <Line label="Net à payer" value={formatDA(sale.total)} />
                <Line label="Versé" value={formatDA(sale.paid)} />
                <Line label="Reste à payer" value={formatDA(sale.rest)} />
                <Line label="Note" value={sale.buyerNote} wide />
              </Block>
            )}
          </div>
        )}
      </div>

      {/* ---- La correction d'un règlement ---- */}
      {editPayment && (
        <Modal
          open
          onClose={() => setEditPayment(null)}
          title="Corriger un règlement"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditPayment(null)}>
                Annuler
              </Button>
              <Button
                onClick={async () => {
                  await updateHorseOwnerPayment(editPayment.id, {
                    amount: editPayment.amount,
                    date: editPayment.date,
                    description: editPayment.description,
                  });
                  addToast({
                    type: "success",
                    title: "Règlement corrigé",
                    message: "Le mouvement de caisse a suivi.",
                  });
                  setEditPayment(null);
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
                min={0}
                value={editPayment.amount}
                onChange={(e) =>
                  setEditPayment({ ...editPayment, amount: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Date</label>
              <Input
                type="date"
                value={editPayment.date}
                onChange={(e) => setEditPayment({ ...editPayment, date: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Description</label>
              <Input
                value={editPayment.description ?? ""}
                onChange={(e) => setEditPayment({ ...editPayment, description: e.target.value })}
              />
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
//  Les pièces d'écran
// ---------------------------------------------------------------------------

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

function Block({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line p-3.5">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
        <Icon className="h-3.5 w-3.5 text-primary" /> {title}
      </h4>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** Une ligne d'information — ABSENTE quand la valeur manque : un écran plein de
 *  tirets fait douter de ce qui est réellement renseigné. */
function Line({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  if (!value || value === "—") return null;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className="block whitespace-pre-wrap text-xs text-ink">{value}</span>
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
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-muted hover:bg-primary-50 hover:text-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
