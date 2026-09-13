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
import {
  formatDateFr,
  groupSeanceShareFor,
  groupSeanceTotals,
  groupSeanceTrainers,
} from "@/lib/helpers";

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
  /**
   * CE QUE **CE** ENCADRANT TOUCHE, et non ce que le programme rapporte en tout.
   *
   * Une sortie se mène rarement seul : la part entraîneur se partage à parts
   * égales entre ceux qui sont partis. Imprimer le total sur la fiche de chacun
   * promettrait trois fois la même somme — et le club ne verse qu'une fois.
   */
  const trainers = groupSeanceTrainers(seance);
  const share = groupSeanceShareFor(seance, teacher.id);
  const shared = trainers.length > 1;
  const perStudent = shared ? t.teacherPerStudent / trainers.length : t.teacherPerStudent;
  const trainerNames = trainers
    .map((id) => {
      const other = db.teachers.find((x) => x.id === id);
      return other ? `${other.firstName} ${other.lastName}` : "—";
    })
    .join(", ");

  const body = `
    ${letterheadHtml(db.school)}
    ${bannerHtml(
      "Fiche de paie — programme de groupe",
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
          ${shared ? `<tr><th>Encadrants</th><td>${esc(trainerNames)} — <strong>part partagée en ${trainers.length}</strong></td></tr>` : ""}
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
            <td class="num">${da(perStudent)}</td>
            <td class="num"><strong>${da(share)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary-card">
      <h3>Récapitulatif</h3>
      <div class="summary-line"><span>Chevaliers présents</span><strong>${t.students}</strong></div>
      <div class="summary-line"><span>Part de l'entraîneur par chevalier</span><strong>${da(perStudent)}</strong></div>
      ${shared ? `<div class="summary-line"><span>Part totale du programme, partagée en ${trainers.length}</span><strong>${da(t.teacherTotal)}</strong></div>` : ""}
      <div class="net-pay-box"><span>Net à verser à l'entraîneur</span><span>${da(share)}</span></div>
    </div>

    ${signaturesHtml("La Direction", "L'Entraîneur")}
    ${metaFooterHtml(db.school.name, language)}
  `;

  return printDocument({
    title: "Fiche de paie — programme de groupe",
    lang: language,
    bodyHtml: body,
  });
}
