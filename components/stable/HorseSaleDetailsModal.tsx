"use client";

/**
 * =============================================================================
 *  LE DÉTAIL D'UNE VENTE — et l'historique de ses versements
 * =============================================================================
 *
 *  Une vente à crédit n'est pas un chiffre : c'est une suite de versements qui
 *  descendent un reste dû. Cet écran montre les deux — ce qui a été convenu, et
 *  ce qui a réellement été encaissé, ligne à ligne, avec de quoi corriger,
 *  supprimer et réimprimer chacune.
 *
 *  LE FORMULAIRE DE RÈGLEMENT RAPPELLE LES TROIS CHIFFRES avant de demander le
 *  quatrième : total dû, déjà versé, reste. On saisit alors « combien cette
 *  fois », et le nouveau reste s'affiche AVANT d'enregistrer. Personne ne
 *  devrait avoir à faire une soustraction de tête devant un client.
 */

import { useMemo, useState } from "react";
import { Coins, Edit, Printer, Trash2, Wallet } from "lucide-react";
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
import { buyerName } from "@/lib/stable";
import { buildHorseSaleDocument, buildStablePaymentReceipt } from "@/lib/reports/stable";
import type { HorseSale, HorseSalePayment } from "@/lib/types";

export function HorseSaleDetailsModal({
  sale,
  onClose,
}: {
  sale: HorseSale;
  onClose: () => void;
}) {
  const db = useData();
  const { payHorseSale, updateHorseSalePayment, deleteHorseSalePayment } = db;
  const language = useSettings((s) => s.language);
  const { addToast } = useToast();

  // La vente relue depuis le magasin : après un versement, les montants de
  // l'objet reçu en argument seraient périmés.
  const live = db.horseSales.find((s) => s.id === sale.id) ?? sale;

  const payments = useMemo(
    () =>
      db.horseSalePayments
        .filter((p) => p.saleId === sale.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [db.horseSalePayments, sale.id],
  );

  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<HorseSalePayment | null>(null);

  const value = Math.max(0, Math.min(Number(amount) || 0, live.rest));
  const restAfter = Math.max(0, live.rest - value);

  const submitPayment = async () => {
    if (value <= 0) return;
    const res = await payHorseSale({
      saleId: live.id,
      amount: value,
      date,
      description: note.trim() || undefined,
    });
    if (!res.ok) {
      addToast({ type: "danger", title: "Versement refusé", message: "Vérifiez le montant." });
      return;
    }
    addToast({
      type: "success",
      title: "Versement enregistré",
      message:
        restAfter > 0
          ? `${formatDA(value)} encaissés — reste ${formatDA(restAfter)}.`
          : `${formatDA(value)} encaissés — la vente est soldée.`,
    });

    if (confirm("Imprimer le reçu du versement ?")) {
      printHtmlDocument(
        buildStablePaymentReceipt({
          school: db.school,
          lang: language,
          title: "Reçu de versement — vente d'un cheval",
          subject: `Vente du cheval « ${live.horseName} »`,
          personName: buyerName(db, live),
          personPhone: live.buyerPhone,
          amount: value,
          date,
          total: live.total,
          paidBefore: live.paid,
          description: note.trim() || undefined,
        }),
      );
    }

    setPayOpen(false);
    setAmount("");
    setNote("");
  };

  return (
    <Modal open onClose={onClose} wide title={`Vente — ${live.horseName}`}>
      <div className="space-y-4">
        {/* ---- Le contrat ---- */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Net à payer" value={formatDA(live.total)} tone="neutral" />
          <Stat label="Total versé" value={formatDA(live.paid)} tone="success" />
          <Stat
            label="Reste à payer"
            value={formatDA(live.rest)}
            tone={live.rest > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="État"
            value={live.rest > 0 ? "À crédit" : "Soldée"}
            tone={live.rest > 0 ? "warning" : "success"}
          />
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-2xl border border-line p-3.5 sm:grid-cols-2">
          <Line label="Cheval" value={live.horseName} />
          <Line label="Date de la vente" value={formatDateFr(live.date)} />
          <Line label="Acheteur" value={buyerName(db, live)} />
          <Line label="Téléphone" value={live.buyerPhone} />
          <Line
            label="Rattachement"
            value={
              live.buyerKind === "student"
                ? "Chevalier du club"
                : live.buyerKind === "parent"
                  ? "Parent du club"
                  : "Extérieur"
            }
          />
          <Line label="Prix affiché" value={formatDA(live.basePrice)} />
          <Line
            label="Remise"
            value={
              live.discountType && live.discountValue
                ? live.discountType === "percent"
                  ? `${live.discountValue} %`
                  : formatDA(live.discountValue)
                : undefined
            }
          />
          <Line label="Note" value={live.description} wide />
          <Line label="Informations sur l'acheteur" value={live.buyerNote} wide />
        </div>

        <div className="flex flex-wrap gap-2">
          {live.rest > 0 && (
            <Button onClick={() => setPayOpen(true)} className="gap-1.5">
              <Wallet className="h-4 w-4" /> Payer la dette
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              printHtmlDocument(
                buildHorseSaleDocument({ db, school: db.school, lang: language, sale: live }),
              )
            }
          >
            <Printer className="h-4 w-4" /> Imprimer le bon de vente
          </Button>
        </div>

        {/* ---- L'historique des versements ---- */}
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
            <Coins className="h-3.5 w-3.5 text-primary" /> Historique des versements (
            {payments.length})
          </h4>
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
                {live.paid > 0 && payments.reduce((s, p) => s + p.amount, 0) < live.paid && (
                  <tr className="border-t border-line/60 bg-primary-50/30">
                    <td className="px-3 py-2 text-muted">{formatDateFr(live.date)}</td>
                    <td className="px-3 py-2 text-ink">
                      Versement initial, le jour de la vente
                      <Badge tone="neutral" className="ms-2 text-[9px]">
                        porté par la vente
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-end font-mono text-success">
                      {formatDA(live.paid - payments.reduce((s, p) => s + p.amount, 0))}
                    </td>
                    <td className="px-3 py-2 text-end text-[10px] italic text-muted">
                      se corrige en modifiant la vente
                    </td>
                  </tr>
                )}
                {payments.length === 0 && live.paid === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center italic text-muted">
                      Aucun versement à ce jour.
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
                          <IconBtn title="Modifier" icon={Edit} onClick={() => setEditing(p)} />
                          <IconBtn
                            title="Imprimer le reçu"
                            icon={Printer}
                            onClick={() =>
                              printHtmlDocument(
                                buildStablePaymentReceipt({
                                  school: db.school,
                                  lang: language,
                                  title: "Reçu de versement — vente d'un cheval",
                                  subject: `Vente du cheval « ${live.horseName} »`,
                                  personName: buyerName(db, live),
                                  personPhone: live.buyerPhone,
                                  amount: p.amount,
                                  date: p.date,
                                  total: live.total,
                                  paidBefore: live.paid - p.amount,
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
                              if (!confirm("Supprimer ce versement ?")) return;
                              await deleteHorseSalePayment(p.id);
                              addToast({
                                type: "success",
                                title: "Versement supprimé",
                                message: "Le reste à payer remonte d'autant.",
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
      </div>

      {/* ---- Le règlement ---- */}
      {payOpen && (
        <Modal
          open
          onClose={() => setPayOpen(false)}
          title="Encaisser un versement"
          footer={
            <>
              <Button variant="outline" onClick={() => setPayOpen(false)}>
                Annuler
              </Button>
              <Button onClick={() => void submitPayment()} disabled={value <= 0}>
                Enregistrer le versement
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-canvas/40 p-3">
              <Stat label="Total dû" value={formatDA(live.total)} tone="neutral" />
              <Stat label="Déjà versé" value={formatDA(live.paid)} tone="success" />
              <Stat label="Reste" value={formatDA(live.rest)} tone="danger" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">
                Combien règle-t-il cette fois ? (DA)
              </label>
              <Input
                type="number"
                min={0}
                max={live.rest}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Description</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div
              className={`rounded-xl border p-3 text-center ${
                restAfter > 0
                  ? "border-danger/35 bg-danger/10 text-danger"
                  : "border-success/35 bg-success/10 text-success"
              }`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80">
                {restAfter > 0 ? "Reste après ce versement" : "La vente sera soldée"}
              </span>
              <strong className="block text-lg font-black tabular-nums">
                {formatDA(restAfter)}
              </strong>
            </div>
          </div>
        </Modal>
      )}

      {/* ---- La correction d'un versement ---- */}
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title="Corriger un versement"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button
                onClick={async () => {
                  await updateHorseSalePayment(editing.id, {
                    amount: editing.amount,
                    date: editing.date,
                    description: editing.description,
                  });
                  addToast({
                    type: "success",
                    title: "Versement corrigé",
                    message: "Le reste à payer et la caisse ont suivi.",
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
                min={0}
                value={editing.amount}
                onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Date</label>
              <Input
                type="date"
                value={editing.date}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Description</label>
              <Input
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
          </div>
        </Modal>
      )}
    </Modal>
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

function Line({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  if (!value) return null;
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
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-primary-50 hover:text-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
