"use client";

/**
 * =============================================================================
 *  GESTION DE L'ÉCURIE — le bilan sur une période
 * =============================================================================
 *
 *  On choisit deux dates, on génère, et l'on obtient UNE LIGNE PAR
 *  PROPRIÉTAIRE — pas par cheval. C'est au propriétaire qu'on présente une
 *  note, et quelqu'un qui a trois chevaux en pension veut un seul total.
 *
 *  LES COLONNES SONT LES RUBRIQUES RENCONTRÉES SUR LA PÉRIODE. Une rubrique
 *  sans dépense ne fabrique pas de colonne vide : un tableau à quinze colonnes
 *  dont douze sont à zéro ne se lit pas.
 *
 *  ⚠️ LE « RESTE DÛ » DE CE TABLEAU EST CELUI DE LA PÉRIODE — dépenses moins
 *  versements entre les deux dates. Ce n'est pas la dette courante du
 *  propriétaire, qui se lit sur sa fiche à l'écurie. Mélanger les deux ferait
 *  apparaître un impayé là où quelqu'un a réglé le mois suivant.
 */

import { useMemo, useState } from "react";
import { BarChart3, FileText, Printer } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { printHtmlDocument } from "@/lib/print";
import { formatDA } from "@/lib/utils";
import { formatDateFr, todayIso } from "@/lib/helpers";
import { stableReport, type StableScope } from "@/lib/stable";
import { buildStableReport } from "@/lib/reports/stable";

export function StableReportsPage() {
  const db = useData();
  const language = useSettings((s) => s.language);

  /** Par défaut : le mois en cours — la période qu'on regarde neuf fois sur dix. */
  const monthStart = todayIso().slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayIso());
  const [scope, setScope] = useState<StableScope>("all");
  const [generated, setGenerated] = useState<{ from: string; to: string; scope: StableScope } | null>(
    null,
  );

  const report = useMemo(
    () => (generated ? stableReport(db, generated.from, generated.to, generated.scope) : null),
    [db, generated],
  );

  const scopeLabel: Record<StableScope, string> = {
    all: "Tous les chevaux",
    club: "Chevaux du club uniquement",
    boarded: "Chevaux en pension uniquement",
  };

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="Gestion de l'écurie"
        subtitle="Le bilan des dépenses et des règlements, propriétaire par propriétaire"
      />

      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Du</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Au</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Périmètre</label>
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value as StableScope)}
              className="w-56"
            >
              <option value="all">Tous les chevaux</option>
              <option value="club">Chevaux du club uniquement</option>
              <option value="boarded">Chevaux en pension uniquement</option>
            </Select>
          </div>
          <Button
            disabled={!from || !to || to < from}
            onClick={() => setGenerated({ from, to, scope })}
            className="gap-1.5"
          >
            <FileText className="h-4 w-4" /> Générer le rapport
          </Button>
          {report && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                printHtmlDocument(
                  buildStableReport({
                    db,
                    school: db.school,
                    lang: language,
                    from: generated!.from,
                    to: generated!.to,
                    scope: generated!.scope,
                  }),
                )
              }
            >
              <Printer className="h-4 w-4" /> Imprimer
            </Button>
          )}
        </CardBody>
      </Card>

      {!report ? (
        <EmptyState
          icon={BarChart3}
          message="Choisissez une période, puis générez le rapport."
          hint="Le tableau donne, pour chaque propriétaire, le montant de chaque rubrique de dépense, le total, ce qui a été versé et ce qui reste dû sur la période."
        />
      ) : report.rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          message="Aucune dépense sur cette période."
          hint={`${scopeLabel[generated!.scope]} — du ${formatDateFr(generated!.from)} au ${formatDateFr(generated!.to)}.`}
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Total des dépenses" value={formatDA(report.totals.expenses)} tone="warning" />
            <Stat label="Total des règlements" value={formatDA(report.totals.paid)} tone="success" />
            <Stat
              label="Reste dû sur la période"
              value={formatDA(report.totals.debt)}
              tone={report.totals.debt > 0 ? "danger" : "neutral"}
            />
          </div>

          <Card>
            <CardBody>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-ink">
                  {scopeLabel[generated!.scope]}
                </h3>
                <Badge tone="neutral">
                  du {formatDateFr(generated!.from)} au {formatDateFr(generated!.to)}
                </Badge>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="w-full text-xs">
                  <thead className="bg-canvas/60">
                    <tr className="text-[10px] uppercase tracking-wide text-muted">
                      <th className="px-3 py-2.5 text-start">Propriétaire</th>
                      <th className="px-3 py-2.5 text-start">Chevaux</th>
                      {report.categories.map((c) => (
                        <th key={c} className="px-3 py-2.5 text-end">
                          {c}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-end">Total dépenses</th>
                      <th className="px-3 py-2.5 text-end">Versements</th>
                      <th className="px-3 py-2.5 text-end">Reste dû</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr
                        key={r.ownerKey}
                        className={`border-t border-line/60 ${
                          r.debt > 0 ? "bg-danger/5" : "hover:bg-primary-50/30"
                        }`}
                      >
                        <td className="px-3 py-2">
                          <strong className="block text-ink">{r.ownerName}</strong>
                          <span className="block text-[10px] text-muted">
                            {r.club ? "Le club" : r.ownerPhone || "aucun numéro"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {r.horses.map((h) => h.name).join(", ")}
                        </td>
                        {report.categories.map((c) => (
                          <td key={c} className="px-3 py-2 text-end font-mono text-ink">
                            {r.byCategory[c] ? formatDA(r.byCategory[c]) : "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-end font-mono font-bold text-ink">
                          {formatDA(r.expenses)}
                        </td>
                        <td className="px-3 py-2 text-end font-mono text-success">
                          {formatDA(r.paid)}
                        </td>
                        <td className="px-3 py-2 text-end font-mono">
                          {r.club ? (
                            <span className="text-[10px] italic text-muted">sur la caisse</span>
                          ) : r.debt > 0 ? (
                            <strong className="text-danger">{formatDA(r.debt)}</strong>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-canvas/60 text-[11px] font-bold">
                    <tr>
                      <td className="px-3 py-2.5 text-ink" colSpan={2}>
                        Totaux
                      </td>
                      {report.categories.map((c) => (
                        <td key={c} className="px-3 py-2.5 text-end font-mono text-ink">
                          {formatDA(report.rows.reduce((s, r) => s + (r.byCategory[c] ?? 0), 0))}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-end font-mono text-ink">
                        {formatDA(report.totals.expenses)}
                      </td>
                      <td className="px-3 py-2.5 text-end font-mono text-success">
                        {formatDA(report.totals.paid)}
                      </td>
                      <td className="px-3 py-2.5 text-end font-mono text-danger">
                        {formatDA(report.totals.debt)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="mt-3 rounded-xl border border-primary/25 bg-primary-50/40 p-2.5 text-[10px] leading-relaxed text-muted">
                Le <strong className="text-ink">reste dû</strong> de ce tableau est celui{" "}
                <strong className="text-ink">de la période</strong> : dépenses moins versements
                entre les deux dates. La dette courante d&apos;un propriétaire — tous exercices
                confondus — se lit sur la fiche de son cheval, à l&apos;écurie.
              </p>
            </CardBody>
          </Card>
        </>
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
    danger: "border-danger/40 bg-danger/10 text-danger",
    neutral: "border-line bg-canvas/50 text-muted",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${ring}`}>
      <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</span>
      <strong className="mt-1 block text-xl font-black tabular-nums">{value}</strong>
    </div>
  );
}
