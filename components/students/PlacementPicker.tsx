"use client";

/**
 * LE CHOIX DE LA CARTE ET DE LA SÉANCE OÙ UN NOUVEAU CHEVALIER COMMENCE.
 *
 * Une fois l'emploi du temps (le groupe) coché, l'écran de création montre la
 * carte COURANTE du groupe et ses cartes PRÉCÉDENTES. La réception choisit la
 * carte, puis la séance de cette carte :
 *
 *  - carte courante + séance du jour (choix par défaut) : il commence
 *    normalement ;
 *  - une séance passée : toutes les séances du groupe depuis ce placement
 *    jusqu'à aujourd'hui lui sont rattachées, « à régulariser » — rien n'est
 *    débité tant qu'elles ne sont pas pointées.
 */

import { useMemo } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { useData } from "@/lib/store/data";
import { carteLabel, formatDateFr } from "@/lib/helpers";
import {
  placementBacklogCount,
  placementCartes,
  type PlacementChoice,
} from "@/lib/placement";

export function PlacementPicker({
  subscriptionId,
  arrivalDay,
  value,
  onChange,
}: {
  subscriptionId: string;
  arrivalDay: string;
  /** null = carte courante, séance du jour */
  value: PlacementChoice | null;
  onChange: (choice: PlacementChoice | null) => void;
}) {
  const db = useData();
  const cartes = useMemo(
    () => placementCartes(db, subscriptionId, arrivalDay),
    [db, subscriptionId, arrivalDay],
  );
  // Un groupe qui n'a encore tenu aucune séance : rien à choisir, il commence au début.
  const hasPast = cartes.some((c) => c.seances.some((s) => s.past));
  if (cartes.length === 0 || !hasPast) return null;

  const current = cartes.find((c) => c.current) ?? cartes[0];
  const selectedCode = value?.carteCode ?? current.code;
  const carte = cartes.find((c) => c.code === selectedCode) ?? current;
  const normal = current.seances.find((s) => s.normal);
  const isPast = !!value?.date && value.date < arrivalDay;
  const backlog = isPast ? placementBacklogCount(db, subscriptionId, value, arrivalDay) : 0;

  const pickCarte = (code: string) => {
    const c = cartes.find((x) => x.code === code);
    if (!c) return;
    if (c.current) {
      onChange(null);
      return;
    }
    // Une carte précédente : sa première séance par défaut.
    const first = c.seances[0];
    onChange(first ? { carteCode: c.code, seance: first.index, date: first.date, slot: first.slot } : null);
  };

  const pickSeance = (index: number) => {
    const s = carte.seances.find((x) => x.index === index);
    if (!s || s.normal || !s.past) {
      onChange(null);
      return;
    }
    onChange({ carteCode: carte.code, seance: s.index, date: s.date, slot: s.slot });
  };

  const selectedSeance = value && value.carteCode === carte.code ? value.seance : normal?.index ?? -1;

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-primary/30 bg-primary-50/40 p-2.5">
      <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-primary">
        <CalendarClock className="h-3 w-3" /> Placement — carte et séance de départ
      </span>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[9px] font-semibold text-muted">Carte du groupe</span>
          <select
            value={carte.code}
            onChange={(e) => pickCarte(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink"
          >
            {cartes.map((c) => (
              <option key={c.code} value={c.code}>
                {carteLabel(c.code)} — {c.current ? "courante" : "précédente"} · {c.held}/{c.size}
                {c.startDate ? ` · depuis le ${formatDateFr(c.startDate)}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] font-semibold text-muted">Séance de départ</span>
          <select
            value={selectedSeance}
            onChange={(e) => pickSeance(Number(e.target.value))}
            className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink"
          >
            {carte.current && !normal && (
              <option value={-1}>Prochaine séance (normal)</option>
            )}
            {carte.seances.map((s) => (
              <option key={`${s.index}`} value={s.index}>
                Séance {s.index + 1}
                {s.date ? ` — ${formatDateFr(s.date)}` : " — à venir"}
                {s.normal ? " (séance du jour · normal)" : s.past ? " (passée)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isPast ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-warning/45 bg-warning/10 p-2 text-[10px] leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Placé sur une séance passée : <strong>{backlog} séance(s)</strong> depuis ce placement
            jusqu&apos;à aujourd&apos;hui lui seront rattachées <strong>à régulariser</strong>. Rien
            n&apos;est débité et aucune présence ni absence n&apos;est posée tant que vous ne les
            avez pas réglées depuis le <strong>tableau de bord</strong> ou l&apos;écran{" "}
            <strong>Présences</strong>.
          </span>
        </p>
      ) : (
        <p className="text-[10px] text-muted">
          Carte courante, séance du jour : il commence normalement.
        </p>
      )}
    </div>
  );
}
