"use client";

/**
 * LE DÉTAIL D'UNE FORMATION, CÔTÉ GESTION.
 *
 * C'est ce que le site montre au visiteur, PLUS ce que le visiteur ne voit pas :
 * qui s'est inscrit, ce que chacun doit encore, et ce que la formation a
 * rapporté en tout.
 *
 * Le calendrier est repris tel quel — les journées cochées, mois par mois —
 * parce que c'est la question qu'on pose le plus souvent devant cette fiche :
 * « elle tombe quel jour, déjà ? ».
 */

import { useMemo } from "react";
import {
  Banknote,
  CalendarDays,
  CalendarRange,
  Clock,
  EyeOff,
  Images,
  Layers,
  UserRound,
  Users,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useData } from "@/lib/store/data";
import { useT } from "@/lib/i18n/useT";
import { chargeRemaining, studentName, todayIso } from "@/lib/helpers";
import { formatDA, money } from "@/lib/utils";
import {
  formationDays,
  formationStatus,
  hoursLabel,
  longDate,
  longMonth,
  periodLabel,
} from "@/lib/site/formations";
import type { Formation } from "@/lib/types";

const STATUS_TONE = {
  upcoming: "primary",
  running: "success",
  past: "neutral",
} as const;

const STATUS_LABEL = {
  upcoming: "À venir",
  running: "En cours",
  past: "Terminée",
} as const;

function Line({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  const { tr } = useT();
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-ink" />
      <span className="min-w-0">
        <span className="block text-[9px] uppercase tracking-wider text-muted">{tr(label)}</span>
        <strong className="block text-[12px] text-ink">{value}</strong>
      </span>
    </div>
  );
}

export function FormationDetailsModal({
  formation,
  onClose,
}: {
  formation: Formation;
  onClose: () => void;
}) {
  const { tr } = useT();
  const students = useData((s) => s.students);
  const charges = useData((s) => s.studentCharges);
  const enrollments = useData((s) => s.formationEnrollments);

  const status = formationStatus(formation, todayIso());
  const days = formationDays(formation);

  /** Les journées, rangées par mois — c'est ainsi qu'un calendrier se lit. */
  const byMonth = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const key of days) {
      const month = key.slice(0, 7);
      const list = groups.get(month);
      if (list) list.push(key);
      else groups.set(month, [key]);
    }
    return [...groups.entries()];
  }, [days]);

  /** Les inscrits, avec ce que chacun doit ENCORE sur cette formation. */
  const roster = useMemo(
    () =>
      enrollments
        .filter((e) => e.formationId === formation.id)
        .map((e) => {
          const student = students.find((s) => s.id === e.studentId);
          const charge = e.chargeId ? charges.find((c) => c.id === e.chargeId) : undefined;
          return {
            enrollment: e,
            label: student ? studentName(student) : tr("Fiche supprimée"),
            due: charge ? chargeRemaining(charge) : 0,
            paid: charge ? money(charge.amount - chargeRemaining(charge)) : e.price,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [enrollments, formation.id, students, charges, tr],
  );

  const collected = roster.reduce((t, r) => t + r.paid, 0);
  const outstanding = roster.reduce((t, r) => t + r.due, 0);

  return (
    <Modal open onClose={onClose} wide title={formation.name}>
      <div className="space-y-4">
        {/* ---- L'IDENTITÉ ---------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={formation.kind === "event" ? "accent" : "primary"} className="text-[10px]">
            {tr(formation.kind === "event" ? "Évènement" : "Formation")}
          </Badge>
          <Badge tone={STATUS_TONE[status]} className="text-[10px]">
            {tr(STATUS_LABEL[status])}
          </Badge>
          {formation.hidden && (
            <Badge tone="warning" className="text-[10px]">
              <EyeOff className="h-3 w-3" /> {tr("Masquée du site")}
            </Badge>
          )}
        </div>

        {formation.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {formation.images.map((url) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={url}
                src={url}
                alt=""
                className="h-32 w-48 shrink-0 rounded-xl border border-line object-cover"
              />
            ))}
          </div>
        )}

        {formation.description && (
          <p className="whitespace-pre-line rounded-2xl border border-line bg-canvas/40 p-3 text-[12px] leading-relaxed text-ink">
            {formation.description}
          </p>
        )}

        {/* ---- LES FAITS ----------------------------------------------- */}
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-canvas/40 p-3 sm:grid-cols-3">
          <Line icon={CalendarRange} label="Période" value={periodLabel(formation)} />
          <Line icon={Clock} label="Horaires" value={hoursLabel(formation) || "—"} />
          <Line icon={CalendarDays} label="Journées" value={`${days.length}`} />
          <Line icon={Layers} label="Séances" value={`${formation.seances || "—"}`} />
          <Line
            icon={Banknote}
            label="Prix"
            value={formation.price > 0 ? formatDA(formation.price) : tr("Offerte")}
          />
          <Line
            icon={UserRound}
            label="Encadrant"
            value={formation.trainerName || tr("Non désigné")}
          />
        </div>

        {formation.trainerNote && (
          <div className="rounded-2xl border border-accent/30 bg-accent-wash/50 p-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
              <UserRound className="h-3.5 w-3.5" /> {tr("L'encadrant")}
            </span>
            <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-ink">
              {formation.trainerNote}
            </p>
          </div>
        )}

        {/* ---- LE CALENDRIER ------------------------------------------- */}
        <div className="space-y-2 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            <CalendarDays className="h-3.5 w-3.5" /> {tr("Les journées retenues")}
          </span>
          {byMonth.length === 0 ? (
            <p className="text-[11px] italic text-muted">{tr("Aucune journée.")}</p>
          ) : (
            byMonth.map(([month, list]) => (
              <div key={month}>
                <p className="mb-1 text-[11px] font-bold capitalize text-ink">{longMonth(month)}</p>
                <div className="flex flex-wrap gap-1">
                  {list.map((key) => (
                    <span
                      key={key}
                      title={longDate(key)}
                      className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-ink"
                    >
                      {Number(key.slice(8, 10))}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ---- LES INSCRITS -------------------------------------------- */}
        <div className="space-y-2 rounded-2xl border border-line bg-canvas/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <Users className="h-3.5 w-3.5" /> {tr("Les inscrits")}
            </span>
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary" className="text-[9px]">
                {roster.length} {tr("inscrit(s)")}
              </Badge>
              <Badge tone="success" className="text-[9px]">
                {tr("Encaissé")} : {formatDA(collected)}
              </Badge>
              {outstanding > 0 && (
                <Badge tone="danger" className="text-[9px]">
                  {tr("Reste dû")} : {formatDA(outstanding)}
                </Badge>
              )}
            </div>
          </div>

          {roster.length === 0 ? (
            <EmptyState
              icon={Users}
              message="Personne n'est encore inscrit"
              hint="Les inscriptions venues du site apparaissent ici une fois vérifiées, et celles du comptoir dès qu'elles sont posées depuis la fiche d'un chevalier."
            />
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {roster.map((r) => (
                <div
                  key={r.enrollment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5"
                >
                  <span className="min-w-0 text-[11px] font-semibold text-ink">
                    {r.label}
                    <span className="ms-2 text-[9px] font-normal text-muted">
                      {r.enrollment.source === "website"
                        ? tr("depuis le site")
                        : tr("depuis le comptoir")}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {r.due > 0 ? (
                      <Badge tone="danger" className="text-[9px]">
                        {tr("Doit")} {formatDA(r.due)}
                      </Badge>
                    ) : (
                      <Badge tone="success" className="text-[9px]">
                        {tr("Réglé")}
                      </Badge>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {formation.images.length === 0 && (
          <p className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[10px] leading-relaxed text-warning">
            <Images className="h-3.5 w-3.5 shrink-0" />
            {tr("Cette formation n'a aucune image : sa carte s'affichera sur le site avec le blason du club à la place.")}
          </p>
        )}

        <div className="flex justify-end border-t border-line pt-4">
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </Modal>
  );
}
