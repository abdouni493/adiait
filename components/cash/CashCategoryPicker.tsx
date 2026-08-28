"use client";

/**
 * LA RUBRIQUE D'UN MOUVEMENT DE CAISSE — choisie, créée ou supprimée SUR PLACE.
 *
 * Le formulaire de dépôt et celui de retrait posent la même question : « à quoi
 * ce mouvement se rattache-t-il ? ». Or la bonne rubrique n'existe pas toujours
 * encore, et l'intendance ne devrait pas avoir à fermer sa saisie, aller la
 * déclarer ailleurs, puis tout recommencer. Elle se crée donc ici, en une ligne,
 * et se supprime ici aussi.
 *
 * CE QUI PROTÈGE LES ÉCRITURES DÉJÀ PASSÉES : une rubrique encore portée par un
 * mouvement ne se supprime pas. La refuser en le disant vaut mieux que de
 * laisser derrière soi des mouvements qui pointent une ligne disparue.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, Tag, Trash2, X } from "lucide-react";
import { uid, useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { Input } from "@/components/ui/SearchInput";
import { formatDA } from "@/lib/utils";
import { todayIso } from "@/lib/helpers";

/** Les jetons proposés à la création. Ils reprennent la palette de l'Ordre. */
const SWATCHES = ["#b08328", "#35506f", "#15803d", "#b45309", "#b91c1c", "#1e293b"];

export function CashCategoryPicker({
  value,
  onChange,
  /** autorise la création et la suppression — un droit, pas une décoration */
  canManage = true,
}: {
  value: string;
  onChange: (categoryId: string) => void;
  canManage?: boolean;
}) {
  const { cashCategories, cash, push, deleteFrom } = useData();
  const addToast = useToast((s) => s.addToast);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);

  /** Combien de mouvements chaque rubrique porte — ce qui la rend supprimable
   *  ou non, et ce que la puce affiche en info-bulle. */
  const usage = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const tx of cash) {
      if (!tx.categoryId) continue;
      const cur = map.get(tx.categoryId) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += tx.amount;
      map.set(tx.categoryId, cur);
    }
    return map;
  }, [cash]);

  const create = () => {
    const name = draft.trim();
    if (!name) return;
    const clash = cashCategories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (clash) {
      // Deux rubriques du même nom ne se distinguent plus dans un total :
      // on rattache la saisie à celle qui existe déjà.
      onChange(clash.id);
      setAdding(false);
      setDraft("");
      return;
    }
    const id = uid("ccat");
    push("cashCategories", { id, name, color, createdAt: todayIso() });
    onChange(id);
    setAdding(false);
    setDraft("");
    addToast({ type: "success", title: "Rubrique créée", message: name });
  };

  const remove = (id: string, name: string) => {
    const used = usage.get(id);
    if (used && used.count > 0) {
      addToast({
        type: "danger",
        title: "Suppression refusée",
        message: `« ${name} » porte encore ${used.count} mouvement(s). Reclassez-les d'abord.`,
      });
      return;
    }
    if (!confirm(`Supprimer la rubrique « ${name} » ?`)) return;
    if (value === id) onChange("");
    deleteFrom("cashCategories", id);
  };

  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Tag className="h-3.5 w-3.5" /> Rubrique
      </span>

      <div className="flex flex-wrap gap-1.5">
        {/* « Non classé » est un choix explicite, pas un oubli. */}
        <button
          type="button"
          onClick={() => onChange("")}
          aria-pressed={value === ""}
          className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
            value === ""
              ? "border-accent/45 bg-accent/15 text-accent-ink"
              : "border-line text-muted hover:border-accent/30 hover:text-ink"
          }`}
        >
          Non classé
        </button>

        {cashCategories.map((cat) => {
          const on = value === cat.id;
          const used = usage.get(cat.id);
          return (
            <span key={cat.id} className="group relative inline-flex">
              <button
                type="button"
                onClick={() => onChange(cat.id)}
                aria-pressed={on}
                title={
                  used
                    ? `${used.count} mouvement(s) · ${formatDA(used.total)}`
                    : "Aucun mouvement pour l'instant"
                }
                className={`cursor-pointer rounded-lg border py-1.5 text-[11px] font-semibold transition-colors ${
                  canManage ? "ps-2.5 pe-7" : "px-2.5"
                } ${
                  on
                    ? "border-accent/45 bg-accent/15 text-accent-ink"
                    : "border-line text-muted hover:border-accent/30 hover:text-ink"
                }`}
              >
                <span
                  className="me-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: cat.color || "var(--accent)" }}
                />
                {cat.name}
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(cat.id, cat.name)}
                  aria-label={`Supprimer la rubrique ${cat.name}`}
                  className="absolute end-1 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted/60 opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}

        {canManage && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-accent/40 px-2.5 py-1.5 text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent/10"
          >
            <Plus className="h-3 w-3" /> Nouvelle rubrique
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.16 } }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 rounded-xl border border-line bg-canvas/60 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      create();
                    }
                    if (e.key === "Escape") setAdding(false);
                  }}
                  placeholder="Nom de la rubrique — ex. Équipement"
                  className="h-9 flex-1"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={create}
                  disabled={!draft.trim()}
                  aria-label="Créer la rubrique"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-gradient-accent text-[#241a05] disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setDraft("");
                  }}
                  aria-label="Annuler"
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line text-muted hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[10px] font-semibold text-muted">Repère :</span>
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Repère ${c}`}
                    aria-pressed={color === c}
                    className={`h-5 w-5 cursor-pointer rounded-full ring-offset-2 ring-offset-canvas transition-all ${
                      color === c ? "ring-2 ring-accent" : "ring-1 ring-line"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
