"use client";

/**
 * =============================================================================
 *  UNE DÉPENSE PORTÉE SUR UN CHEVAL
 * =============================================================================
 *
 *  LA MÊME SAISIE, DEUX DESTINS — et l'écran le dit AVANT d'enregistrer :
 *
 *   • cheval DU CLUB   → la somme SORT DE LA CAISSE ;
 *   • cheval EN PENSION → la somme devient une DETTE de son propriétaire, et la
 *     caisse ne bouge pas.
 *
 *  Ce n'est pas un réglage : c'est une conséquence du propriétaire déjà inscrit
 *  sur la fiche. Laisser choisir ici ouvrirait la porte à une dépense de club
 *  facturée par erreur à un pensionnaire — le genre d'erreur qu'on découvre au
 *  moment de présenter la note.
 */

import { useState } from "react";
import { AlertTriangle, Landmark, User } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/SearchInput";
import { useData, uid } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { formatDA } from "@/lib/utils";
import { todayIso } from "@/lib/helpers";
import { horseOwnerName } from "@/lib/stable";
import { CategoryPicker } from "./PersonPicker";
import type { Horse, HorseExpense } from "@/lib/types";

export function HorseExpenseModal({
  horse,
  expense,
  onClose,
}: {
  horse: Horse;
  /** une dépense existante à corriger */
  expense?: HorseExpense | null;
  onClose: () => void;
}) {
  const db = useData();
  const { saveHorseExpense, push } = db;
  const { addToast } = useToast();

  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [description, setDescription] = useState(expense?.description ?? "");

  const ownerDebt = horse.ownerKind !== "club";
  const value = Math.max(0, Number(amount) || 0);

  const createCategory = (name: string) => {
    const id = uid("hcat");
    push("horseExpenseCategories", {
      id,
      name,
      createdAt: new Date().toISOString(),
    });
    setCategoryId(id);
  };

  const submit = async () => {
    if (value <= 0) return;
    const cat = db.horseExpenseCategories.find((c) => c.id === categoryId);
    const res = await saveHorseExpense({
      id: expense?.id,
      horseId: horse.id,
      categoryId: categoryId || undefined,
      categoryName: cat?.name,
      amount: value,
      date,
      description: description.trim() || undefined,
    });
    if (!res.ok) {
      addToast({ type: "danger", title: "Dépense refusée", message: "Vérifiez le montant." });
      return;
    }
    addToast({
      type: "success",
      title: expense ? "Dépense modifiée" : "Dépense enregistrée",
      message: ownerDebt
        ? `${formatDA(value)} portés au compte de ${horseOwnerName(db, horse)}.`
        : `${formatDA(value)} sortis de la caisse du club.`,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? "Corriger une dépense" : `Nouvelle dépense — ${horse.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={value <= 0}>
            {expense ? "Enregistrer" : "Créer la dépense"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* CE QUE LA DÉPENSE VA FAIRE — dit avant, pas après. */}
        <p
          className={`flex items-start gap-2 rounded-xl border p-3 text-[11px] leading-relaxed ${
            ownerDebt
              ? "border-warning/35 bg-warning/10 text-ink"
              : "border-primary/25 bg-primary-50/40 text-ink"
          }`}
        >
          {ownerDebt ? (
            <User className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          ) : (
            <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          )}
          <span>
            {ownerDebt ? (
              <>
                <strong>{horse.name}</strong> appartient à{" "}
                <strong>{horseOwnerName(db, horse)}</strong> : cette dépense sera portée à{" "}
                <strong>son compte</strong> et deviendra une dette. La caisse du club ne bouge pas.
              </>
            ) : (
              <>
                <strong>{horse.name}</strong> est un cheval du club : cette dépense{" "}
                <strong>sortira de la caisse générale</strong>.
              </>
            )}
          </span>
        </p>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Rubrique</label>
          <CategoryPicker
            categories={db.horseExpenseCategories}
            value={categoryId}
            onChange={setCategoryId}
            onCreate={createCategory}
            placeholder="Vétérinaire, fourrage, maréchal-ferrant…"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">
              Coût (DA) <span className="text-danger">*</span>
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
            <label className="mb-1.5 block text-xs font-semibold text-muted">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ce qui a été fait, par qui, avec quelle référence…"
            className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>

        {value <= 0 && (
          <p className="flex items-center gap-2 text-[11px] text-muted">
            <AlertTriangle className="h-3.5 w-3.5" /> Un coût est nécessaire pour enregistrer la
            dépense.
          </p>
        )}
      </div>
    </Modal>
  );
}
