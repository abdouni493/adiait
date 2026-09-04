"use client";

/**
 * =============================================================================
 *  LA VENTE D'UN CHEVAL
 * =============================================================================
 *
 *  On cherche le cheval par son nom, et la fiche se déplie : race, âge,
 *  discipline, prix affiché — ET LE TOTAL DE CE QU'IL A COÛTÉ. Ce dernier
 *  chiffre est la raison d'être de ce dépliant : vendre un cheval 300 000 DA
 *  alors qu'il en a coûté 180 000 en vétérinaire et en fourrage n'est pas la
 *  même affaire que de le vendre au même prix sans aucune dépense derrière.
 *  L'information existait déjà, éparpillée ; elle est ici, au moment où elle
 *  sert.
 *
 *  L'ACHETEUR PEUT ÊTRE UNE FICHE DU CLUB. C'est ce rattachement qui fait
 *  remonter la vente — et sa dette éventuelle — sur le compte du chevalier ou
 *  du parent. Sans lui, le nom saisi reste une chaîne que rien ne relie à
 *  personne.
 *
 *  LE MONTANT VERSÉ EST PRÉ-REMPLI AU TOTAL, et modifiable. C'est le cas le
 *  plus fréquent : on paie comptant. Descendre le montant ouvre la vente à
 *  crédit, et le reste dû s'affiche immédiatement — pas après enregistrement.
 */

import { useMemo, useState } from "react";
import { Coins, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/SearchInput";
import { useData } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { useToast } from "@/lib/store/toast";
import { printHtmlDocument } from "@/lib/print";
import { formatDA } from "@/lib/utils";
import { todayIso } from "@/lib/helpers";
import { GENDER_LABEL, horseAgeLabel, horseMoney, netSalePrice } from "@/lib/stable";
import { buildHorseSaleDocument } from "@/lib/reports/stable";
import { PersonPicker, type PersonValue } from "./PersonPicker";
import type { DiscountType, Horse, HorseSale } from "@/lib/types";

export function HorseSaleModal({
  sale,
  presetHorseId,
  onClose,
}: {
  /** une vente existante à corriger, ou rien pour en créer une */
  sale?: HorseSale | null;
  presetHorseId?: string;
  onClose: () => void;
}) {
  const db = useData();
  const { saveHorseSale } = db;
  const language = useSettings((s) => s.language);
  const { addToast } = useToast();

  const [query, setQuery] = useState("");
  const [horseId, setHorseId] = useState(sale?.horseId ?? presetHorseId ?? "");
  const [date, setDate] = useState(sale?.date ?? todayIso());
  const [basePrice, setBasePrice] = useState(String(sale?.basePrice ?? ""));
  const [discountType, setDiscountType] = useState<DiscountType | "">(sale?.discountType ?? "");
  const [discountValue, setDiscountValue] = useState(String(sale?.discountValue ?? ""));
  const [paidRaw, setPaidRaw] = useState<string | null>(sale ? String(sale.paid) : null);
  const [description, setDescription] = useState(sale?.description ?? "");
  const [buyer, setBuyer] = useState<PersonValue>(() => ({
    kind: sale?.buyerKind ?? "external",
    studentId: sale?.buyerStudentId,
    parentId: sale?.buyerParentId,
    name: sale?.buyerName ?? "",
    phone: sale?.buyerPhone ?? "",
    note: sale?.buyerNote ?? "",
  }));

  /** Les chevaux qu'on peut vendre : ceux qui sont encore là. La vente qu'on
   *  corrige garde le sien, même s'il est déjà marqué vendu. */
  const sellable = useMemo(
    () => db.horses.filter((h) => h.status === "available" || h.id === sale?.horseId),
    [db.horses, sale?.horseId],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return sellable
      .filter((h) =>
        `${h.name} ${h.reference ?? ""} ${h.breed ?? ""}`.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [query, sellable]);

  const horse: Horse | undefined = db.horses.find((h) => h.id === horseId);
  const horseCost = horse ? horseMoney(db, horse.id) : null;

  const num = (v: string) => {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const base = num(basePrice);
  const total = netSalePrice(
    base,
    discountType || undefined,
    discountType ? num(discountValue) : 0,
  );
  // Par défaut, on paie comptant : le champ est pré-rempli au total tant que
  // personne ne l'a touché.
  const paid = paidRaw === null ? total : Math.min(num(paidRaw), total);
  const rest = Math.max(0, total - paid);

  const pickHorse = (h: Horse) => {
    setHorseId(h.id);
    setQuery("");
    // Le prix affiché sur la fiche sert de point de départ, et reste modifiable.
    if (!sale) setBasePrice(String(h.sellingPrice ?? ""));
  };

  const problem = !horseId
    ? "Choisissez le cheval à vendre."
    : base <= 0
      ? "Indiquez le prix de vente."
      : buyer.kind === "external" && !buyer.name.trim()
        ? "Nommez l'acheteur."
        : buyer.kind !== "external" && !buyer.studentId && !buyer.parentId
          ? "Choisissez la fiche de l'acheteur, ou décrivez-le à la main."
          : "";

  const submit = async () => {
    if (problem || !horse) return;
    const res = await saveHorseSale({
      id: sale?.id,
      horseId,
      buyerKind: buyer.kind,
      buyerStudentId: buyer.kind === "student" ? buyer.studentId : undefined,
      buyerParentId: buyer.kind === "parent" ? buyer.parentId : undefined,
      buyerName: buyer.name.trim(),
      buyerPhone: buyer.phone?.trim() || undefined,
      buyerNote: buyer.note?.trim() || undefined,
      date,
      basePrice: base,
      discountType: discountType || undefined,
      discountValue: discountType ? num(discountValue) : undefined,
      total,
      paid,
      description: description.trim() || undefined,
    });
    if (!res.ok || !res.id) {
      addToast({ type: "danger", title: "Vente refusée", message: "Vérifiez les champs." });
      return;
    }

    addToast({
      type: rest > 0 ? "warning" : "success",
      title: sale ? "Vente modifiée" : "Vente enregistrée",
      message:
        rest > 0
          ? `${horse.name} vendu à ${buyer.name.trim()} — reste à payer ${formatDA(rest)}.`
          : `${horse.name} vendu à ${buyer.name.trim()} — vente soldée.`,
    });

    // « Imprimer le bon ? » — posée, jamais imposée.
    if (confirm("Imprimer le bon de vente ?")) {
      const saved = useData.getState().horseSales.find((s) => s.id === res.id);
      if (saved) {
        printHtmlDocument(
          buildHorseSaleDocument({ db: useData.getState(), school: db.school, lang: language, sale: saved }),
        );
      }
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={sale ? "Modifier la vente" : "Nouvelle vente de cheval"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={!!problem}>
            {sale ? "Enregistrer" : rest > 0 ? "Créer la vente à crédit" : "Créer la vente"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ---- Le cheval ---- */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">
            Le cheval <span className="text-danger">*</span>
          </label>
          {horse ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/8 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-ink">{horse.name}</strong>
                  <span className="block text-[11px] text-muted">
                    {[
                      horse.reference,
                      horse.breed,
                      horse.gender ? GENDER_LABEL[horse.gender] : "",
                      horseAgeLabel(horse),
                      horse.color,
                      horse.discipline,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {!sale && (
                  <button
                    type="button"
                    onClick={() => {
                      setHorseId("");
                      setBasePrice("");
                    }}
                    aria-label="Changer de cheval"
                    className="shrink-0 rounded-md p-1 text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* CE QUE CE CHEVAL A COÛTÉ — au moment où l'on fixe son prix. */}
              {horseCost && (
                <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-primary/20 pt-2.5 sm:grid-cols-4">
                  <Mini label="Prix d'achat" value={formatDA(horse.purchasePrice ?? 0)} />
                  <Mini label="Prix affiché" value={formatDA(horse.sellingPrice ?? 0)} />
                  <Mini label="Dépenses engagées" value={formatDA(horseCost.expenses)} tone="warning" />
                  <Mini
                    label="Marge au prix saisi"
                    value={formatDA(total - (horse.purchasePrice ?? 0) - horseCost.expenses)}
                    tone={total - (horse.purchasePrice ?? 0) - horseCost.expenses >= 0 ? "success" : "danger"}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted start-3" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Chercher un cheval disponible par son nom…"
                  className="ps-9"
                  autoFocus
                />
              </div>
              {query && results.length === 0 && (
                <p className="px-1 text-[10px] italic text-muted">
                  Aucun cheval disponible ne porte ce nom.
                </p>
              )}
              {results.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-line">
                  {results.map((h) => {
                    const cost = horseMoney(db, h.id);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => pickHorse(h)}
                        className="flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2 text-start last:border-b-0 hover:bg-primary-50/50"
                      >
                        <span className="min-w-0">
                          <strong className="block truncate text-xs text-ink">{h.name}</strong>
                          <span className="block truncate text-[10px] text-muted">
                            {[h.breed, h.gender ? GENDER_LABEL[h.gender] : "", horseAgeLabel(h), h.discipline]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-end">
                          <Badge tone="primary" className="text-[9px]">
                            {formatDA(h.sellingPrice ?? 0)}
                          </Badge>
                          <span className="mt-0.5 block text-[9px] text-muted">
                            dépenses {formatDA(cost.expenses)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- L'acheteur ---- */}
        <PersonPicker
          value={buyer}
          onChange={setBuyer}
          label="L'acheteur"
          externalLabel="Hors du club"
        />

        {/* ---- L'argent ---- */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">
              Prix de vente (DA) <span className="text-danger">*</span>
            </label>
            <Input
              type="number"
              min={0}
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Date de la vente</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Remise</label>
            <div className="flex gap-1.5">
              <Select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType | "")}
                className="w-32"
              >
                <option value="">Aucune</option>
                <option value="percent">Pourcentage</option>
                <option value="amount">Montant fixe</option>
              </Select>
              <Input
                type="number"
                min={0}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                disabled={!discountType}
                placeholder={discountType === "percent" ? "%" : "DA"}
                className="flex-1"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">
              Versé par le client (DA)
            </label>
            <Input
              type="number"
              min={0}
              value={paidRaw === null ? total : paidRaw}
              onChange={(e) => setPaidRaw(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Note sur la vente</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>

        {/* ---- Le récapitulatif ---- */}
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-canvas/40 p-3">
          <Mini label="Net à payer" value={formatDA(total)} />
          <Mini label="Versé" value={formatDA(paid)} tone="success" />
          <Mini
            label="Reste à payer"
            value={formatDA(rest)}
            tone={rest > 0 ? "danger" : "neutral"}
          />
        </div>

        {rest > 0 && (
          <p className="flex items-center gap-2 rounded-xl border border-warning/35 bg-warning/10 p-2.5 text-[11px] text-ink">
            <Coins className="h-4 w-4 shrink-0 text-warning" />
            Cette vente sera enregistrée <strong>à crédit</strong> : elle apparaîtra en alerte sur
            l&apos;écran principal jusqu&apos;à son règlement complet.
          </p>
        )}

        {problem && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
            {problem}
          </p>
        )}
      </div>
    </Modal>
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
    <div className="text-center">
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <strong className={`block text-sm font-black tabular-nums ${color}`}>{value}</strong>
    </div>
  );
}
