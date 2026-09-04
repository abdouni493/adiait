"use client";

/**
 * =============================================================================
 *  LE RÈGLEMENT D'UN PROPRIÉTAIRE
 * =============================================================================
 *
 *  Les trois chiffres d'abord — porté à son compte, déjà réglé, reste dû —
 *  puis la seule question qui reste : combien règle-t-il aujourd'hui ? Le
 *  nouveau reste s'affiche AVANT d'enregistrer : personne ne devrait avoir à
 *  faire une soustraction de tête devant un client.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/SearchInput";
import { useData } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { useToast } from "@/lib/store/toast";
import { printHtmlDocument } from "@/lib/print";
import { formatDA } from "@/lib/utils";
import { todayIso } from "@/lib/helpers";
import { horseMoney, horseOwnerName, horseOwnerPhone } from "@/lib/stable";
import { buildStablePaymentReceipt } from "@/lib/reports/stable";
import type { Horse } from "@/lib/types";

export function HorseOwnerPayModal({ horse, onClose }: { horse: Horse; onClose: () => void }) {
  const db = useData();
  const { payHorseOwner } = db;
  const language = useSettings((s) => s.language);
  const { addToast } = useToast();

  const money = horseMoney(db, horse.id);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");

  const value = Math.max(0, Math.min(Number(amount) || 0, money.debt));
  const restAfter = Math.max(0, money.debt - value);

  const submit = async () => {
    if (value <= 0) return;
    const res = await payHorseOwner({
      horseId: horse.id,
      amount: value,
      date,
      description: note.trim() || undefined,
    });
    if (!res.ok) {
      addToast({ type: "danger", title: "Règlement refusé", message: "Vérifiez le montant." });
      return;
    }
    addToast({
      type: "success",
      title: "Règlement enregistré",
      message:
        restAfter > 0
          ? `${formatDA(value)} encaissés — reste ${formatDA(restAfter)}.`
          : `${formatDA(value)} encaissés — le compte est à jour.`,
    });

    if (confirm("Imprimer le reçu du règlement ?")) {
      printHtmlDocument(
        buildStablePaymentReceipt({
          school: db.school,
          lang: language,
          title: "Reçu de règlement — écurie",
          subject: `Entretien du cheval « ${horse.name} »`,
          personName: horseOwnerName(db, horse),
          personPhone: horseOwnerPhone(db, horse),
          amount: value,
          date,
          total: money.charged,
          paidBefore: money.paid,
          description: note.trim() || undefined,
        }),
      );
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Règlement — ${horseOwnerName(db, horse)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={value <= 0}>
            Enregistrer le règlement
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Cheval <strong className="text-ink">{horse.name}</strong> — propriétaire{" "}
          <strong className="text-ink">{horseOwnerName(db, horse)}</strong>
          {horseOwnerPhone(db, horse) ? ` · ${horseOwnerPhone(db, horse)}` : ""}
        </p>

        <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-canvas/40 p-3 text-center">
          <Cell label="Porté à son compte" value={formatDA(money.charged)} />
          <Cell label="Déjà réglé" value={formatDA(money.paid)} tone="success" />
          <Cell label="Reste dû" value={formatDA(money.debt)} tone="danger" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">
            Combien règle-t-il cette fois ? (DA)
          </label>
          <Input
            type="number"
            min={0}
            max={money.debt}
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
            {restAfter > 0 ? "Reste après ce règlement" : "Le compte sera à jour"}
          </span>
          <strong className="block text-lg font-black tabular-nums">{formatDA(restAfter)}</strong>
        </div>
      </div>
    </Modal>
  );
}

function Cell({
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
      <strong className={`block text-sm font-black tabular-nums ${color}`}>{value}</strong>
    </div>
  );
}
