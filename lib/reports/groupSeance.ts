"use client";

/**
 * La fiche de paie d'une **sortie libre de groupe**.
 *
 * Elle est remise à l'entraîneur, donc elle ne dit JAMAIS ce que le club garde :
 * on y lit le nombre de chevaliers, ce que la séance lui rapporte par chevalier et le
 * total qui lui revient — rien d'autre. La part du club reste sur l'écran de
 * la réception et dans les rapports.
 */

import type { Language } from "@/lib/store/settings";
import type { Database } from "@/lib/store/data";
import type { GroupSeance, Teacher } from "@/lib/types";
import {
  bannerHtml,
  letterheadHtml,
  metaFooterHtml,
  printDocument,
  signaturesHtml,
} from "@/lib/printTemplates";
import { formatDateFr, groupSeanceTotals } from "@/lib/helpers";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const da = (n: number) => `${Math.round(n).toLocaleString("fr-DZ")} DA`;

export function groupSeancePayslipHtml(
  db: Database,
  opts: { seance: GroupSeance; teacher: Teacher; language: Language },
): string {
  const { seance, teacher, language } = opts;
  const t = groupSeanceTotals(seance);

  const body = `
    ${letterheadHtml(db.school)}
    ${bannerHtml(
      "Fiche de paie — séance libre",
      `${esc(teacher.firstName)} ${esc(teacher.lastName)} — ${esc(formatDateFr(seance.date))}`,
    )}

    <div class="frame frame-info">
      <h3>La séance</h3>
      <table>
        <tbody>
          <tr><th style="width:34%">Intitulé</th><td><strong>${esc(seance.title)}</strong></td></tr>
          <tr><th>Date</th><td>${esc(formatDateFr(seance.date))}</td></tr>
          <tr><th>Horaire</th><td><span style="font-family:monospace">${esc(seance.startTime)} → ${esc(seance.endTime)}</span></td></tr>
          <tr><th>Entraîneur</th><td><strong>${esc(teacher.firstName)} ${esc(teacher.lastName)}</strong>${teacher.phone ? ` — ${esc(teacher.phone)}` : ""}</td></tr>
          ${seance.description ? `<tr><th>Description</th><td>${esc(seance.description)}</td></tr>` : ""}
        </tbody>
      </table>
    </div>

    <div class="frame frame-success" style="margin-top:16px">
      <h3>Ce que la séance rapporte à l'entraîneur</h3>
      <table>
        <thead>
          <tr>
            <th>Désignation</th>
            <th class="ctr">Nombre de chevaliers</th>
            <th class="num">Part par chevalier</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${esc(seance.title)}</strong></td>
            <td class="ctr"><strong>${t.students}</strong></td>
            <td class="num">${da(t.teacherPerStudent)}</td>
            <td class="num"><strong>${da(t.teacherTotal)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-card">
      <h3>Récapitulatif</h3>
      <div class="summary-line"><span>Chevaliers présents</span><strong>${t.students}</strong></div>
      <div class="summary-line"><span>Part de l'entraîneur par chevalier</span><strong>${da(t.teacherPerStudent)}</strong></div>
      <div class="net-pay-box"><span>Net à verser à l'entraîneur</span><span>${da(t.teacherTotal)}</span></div>
    </div>

    ${signaturesHtml("La Direction", "L'Enseignant")}
    ${metaFooterHtml(db.school.name, language)}
  `;

  return printDocument({
    title: "Fiche de paie — sortie libre de groupe",
    lang: language,
    bodyHtml: body,
  });
}
