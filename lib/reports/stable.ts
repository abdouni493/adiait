"use client";

/**
 * =============================================================================
 *  LES DOCUMENTS DE L'ÉCURIE
 * =============================================================================
 *
 *  Ce que le comptoir remet en main propre : le bon de vente d'un cheval, le
 *  reçu d'un versement, le relevé des dépenses d'un cheval sur une période, le
 *  rapport de gestion de l'écurie, et le reçu d'une « autre dette ».
 *
 *  Tous sont des chaînes HTML bâties sur les briques partagées de
 *  `lib/printTemplates.ts`, remises à `printHtmlDocument()` : l'impression se
 *  fait dans un cadre caché, sans jamais quitter l'écran en cours.
 *
 *  CHAQUE DOCUMENT PORTE L'EN-TÊTE COMPLET DU CLUB — nom, logo, adresse,
 *  téléphone et identifiants fiscaux. Un reçu sans en-tête ne prouve rien, et
 *  c'est précisément le jour d'un litige qu'on le découvre.
 */

import type { Language } from "@/lib/store/settings";
import type { Database } from "@/lib/store/data";
import type { Horse, HorseSale, OtherDebt, School } from "@/lib/types";
import {
  bannerHtml,
  letterheadHtml,
  metaFooterHtml,
  printDocument,
  signaturesHtml,
} from "@/lib/printTemplates";
import { formatDateFr } from "@/lib/helpers";
import {
  GENDER_LABEL,
  buyerName,
  expenseCategoryLabel,
  horseAgeLabel,
  horseMoney,
  horseOwnerName,
  horseOwnerPhone,
  otherDebtMoney,
  stableReport,
  type StableScope,
} from "@/lib/stable";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const da = (n: number) => `${Math.round(n).toLocaleString("fr-DZ")} DA`;

/** Une ligne « libellé / valeur » — omise quand la valeur manque, pour qu'un
 *  document ne se remplisse pas de tirets. */
function row(label: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === "" || value === "—") return "";
  return `<tr><th style="width:34%">${esc(label)}</th><td>${esc(value)}</td></tr>`;
}

/** L'identité d'un cheval, reprise par tous les documents qui le nomment. */
function horseIdentityHtml(db: Database, horse: Horse): string {
  return `
    <div class="frame frame-info">
      <h3>Le cheval</h3>
      <table><tbody>
        ${row("Nom", horse.name)}
        ${row("Référence", horse.reference)}
        ${row("Race", horse.breed)}
        ${row("Sexe", horse.gender ? GENDER_LABEL[horse.gender] : "")}
        ${row("Âge", horseAgeLabel(horse))}
        ${row("Robe", horse.color)}
        ${row("Taille", horse.height)}
        ${row("Discipline", horse.discipline)}
        ${row("Père", horse.sire)}
        ${row("Mère", horse.dam)}
        ${row("Propriétaire", horseOwnerName(db, horse))}
      </tbody></table>
    </div>`;
}

// ---------------------------------------------------------------------------
//  1. Le bon de vente
// ---------------------------------------------------------------------------

export function buildHorseSaleDocument(opts: {
  db: Database;
  school: School;
  lang: Language;
  sale: HorseSale;
}): string {
  const { db, school, lang, sale } = opts;
  const horse = db.horses.find((h) => h.id === sale.horseId);
  const payments = db.horseSalePayments
    .filter((p) => p.saleId === sale.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const discount =
    sale.discountType && sale.discountValue
      ? sale.discountType === "percent"
        ? `${sale.discountValue} %`
        : da(sale.discountValue)
      : "";

  const body = `
    ${letterheadHtml(school)}
    ${bannerHtml("Bon de vente d'un cheval", `${esc(sale.horseName)} — ${esc(formatDateFr(sale.date))}`)}
    <div class="frames-grid">
      ${horse ? horseIdentityHtml(db, horse) : ""}
      <div class="frame">
        <h3>L'acheteur</h3>
        <table><tbody>
          ${row("Nom", buyerName(db, sale))}
          ${row("Téléphone", sale.buyerPhone)}
          ${row("Rattachement", sale.buyerKind === "student" ? "Chevalier du club" : sale.buyerKind === "parent" ? "Parent du club" : "Extérieur")}
          ${row("Informations", sale.buyerNote)}
        </tbody></table>
      </div>
      <div class="frame ${sale.rest > 0 ? "frame-danger" : "frame-success"}">
        <h3>Le règlement</h3>
        <table><tbody>
          ${row("Prix affiché", da(sale.basePrice))}
          ${discount ? row("Remise", discount) : ""}
          ${row("Net à payer", da(sale.total))}
          ${row("Versé le jour de la vente", da(sale.paid))}
          ${row("Reste à payer", da(sale.rest))}
        </tbody></table>
        ${
          payments.length > 0
            ? `<h3 style="margin-top:14px">Versements ultérieurs</h3>
               <table>
                 <thead><tr><th>Date</th><th>Description</th><th class="num">Montant</th></tr></thead>
                 <tbody>
                   ${payments
                     .map(
                       (p) =>
                         `<tr><td>${esc(formatDateFr(p.date))}</td><td>${esc(p.description ?? "")}</td><td class="num">${da(p.amount)}</td></tr>`,
                     )
                     .join("")}
                 </tbody>
               </table>`
            : ""
        }
      </div>
    </div>
    <div class="summary-card">
      <div class="summary-line"><span>Net à payer</span><strong>${da(sale.total)}</strong></div>
      <div class="summary-line"><span>Total versé</span><strong>${da(sale.paid)}</strong></div>
      <div class="net-pay-box ${sale.rest > 0 ? "negative" : ""}">
        <span>${sale.rest > 0 ? "Reste à payer" : "Vente soldée"}</span><span>${da(sale.rest)}</span>
      </div>
    </div>
    ${signaturesHtml("Le club", "L'acheteur")}
    ${metaFooterHtml(school.name, lang)}`;

  return printDocument({ title: `Vente — ${sale.horseName}`, lang, bodyHtml: body });
}

// ---------------------------------------------------------------------------
//  2. Le reçu d'un versement
// ---------------------------------------------------------------------------

export function buildStablePaymentReceipt(opts: {
  school: School;
  lang: Language;
  title: string;
  subject: string;
  personName: string;
  personPhone?: string;
  amount: number;
  date: string;
  total: number;
  paidBefore: number;
  description?: string;
}): string {
  const { school, lang } = opts;
  const restAfter = Math.max(0, opts.total - opts.paidBefore - opts.amount);
  const body = `
    ${letterheadHtml(school)}
    ${bannerHtml(opts.title, `${esc(opts.subject)} — ${esc(formatDateFr(opts.date))}`)}
    <div class="frames-grid">
      <div class="frame frame-info">
        <h3>Le débiteur</h3>
        <table><tbody>
          ${row("Nom", opts.personName)}
          ${row("Téléphone", opts.personPhone)}
          ${row("Objet", opts.subject)}
          ${row("Note", opts.description)}
        </tbody></table>
      </div>
      <div class="frame frame-success">
        <h3>Le versement</h3>
        <table><tbody>
          ${row("Total dû", da(opts.total))}
          ${row("Déjà versé avant ce jour", da(opts.paidBefore))}
          ${row("Versé aujourd'hui", da(opts.amount))}
          ${row("Reste à payer", da(restAfter))}
        </tbody></table>
      </div>
    </div>
    <div class="summary-card">
      <div class="net-pay-box ${restAfter > 0 ? "negative" : ""}">
        <span>${restAfter > 0 ? "Reste à payer" : "Soldé"}</span><span>${da(restAfter)}</span>
      </div>
    </div>
    ${signaturesHtml("Le club", "Le débiteur")}
    ${metaFooterHtml(school.name, lang)}`;

  return printDocument({ title: opts.title, lang, bodyHtml: body });
}

// ---------------------------------------------------------------------------
//  3. Le relevé des dépenses d'UN cheval sur une période
// ---------------------------------------------------------------------------

export function buildHorseExpenseReport(opts: {
  db: Database;
  school: School;
  lang: Language;
  horse: Horse;
  from: string;
  to: string;
}): string {
  const { db, school, lang, horse, from, to } = opts;

  const expenses = db.horseExpenses
    .filter((e) => e.horseId === horse.id && e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const payments = db.horseOwnerPayments
    .filter((p) => p.horseId === horse.id && p.date >= from && p.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const label = expenseCategoryLabel(db, e);
    byCategory.set(label, (byCategory.get(label) ?? 0) + e.amount);
  }
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  /** La dette COURANTE, tous exercices confondus : c'est elle qu'on réclame,
   *  pas le solde de la seule période affichée. */
  const money = horseMoney(db, horse.id);

  const body = `
    ${letterheadHtml(school)}
    ${bannerHtml(
      "Relevé des dépenses d'un cheval",
      `${esc(horse.name)} — du ${esc(formatDateFr(from))} au ${esc(formatDateFr(to))}`,
    )}
    <div class="frames-grid">
      ${horseIdentityHtml(db, horse)}
      <div class="frame">
        <h3>Par rubrique</h3>
        <table>
          <thead><tr><th>Rubrique</th><th class="num">Montant</th></tr></thead>
          <tbody>
            ${
              byCategory.size === 0
                ? `<tr><td colspan="2"><em>Aucune dépense sur cette période.</em></td></tr>`
                : [...byCategory.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, amount]) => `<tr><td>${esc(label)}</td><td class="num">${da(amount)}</td></tr>`)
                    .join("")
            }
          </tbody>
          <tfoot>
            <tr><th>Total de la période</th><th class="num">${da(total)}</th></tr>
          </tfoot>
        </table>
      </div>
      <div class="frame">
        <h3>Le détail</h3>
        <table>
          <thead><tr><th>Date</th><th>Rubrique</th><th>Description</th><th class="num">Montant</th></tr></thead>
          <tbody>
            ${
              expenses.length === 0
                ? `<tr><td colspan="4"><em>Aucune dépense.</em></td></tr>`
                : expenses
                    .map(
                      (e) =>
                        `<tr><td>${esc(formatDateFr(e.date))}</td><td>${esc(expenseCategoryLabel(db, e))}</td><td>${esc(e.description ?? "")}</td><td class="num">${da(e.amount)}</td></tr>`,
                    )
                    .join("")
            }
          </tbody>
        </table>
      </div>
      <div class="frame frame-success">
        <h3>Les règlements du propriétaire</h3>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th class="num">Montant</th></tr></thead>
          <tbody>
            ${
              payments.length === 0
                ? `<tr><td colspan="3"><em>Aucun règlement sur cette période.</em></td></tr>`
                : payments
                    .map(
                      (p) =>
                        `<tr><td>${esc(formatDateFr(p.date))}</td><td>${esc(p.description ?? "")}</td><td class="num">${da(p.amount)}</td></tr>`,
                    )
                    .join("")
            }
          </tbody>
          <tfoot><tr><th>Total versé sur la période</th><th class="num" colspan="2">${da(paid)}</th></tr></tfoot>
        </table>
      </div>
    </div>
    <div class="summary-card">
      <h3>Récapitulatif</h3>
      <div class="summary-line"><span>Dépenses de la période</span><strong>${da(total)}</strong></div>
      <div class="summary-line"><span>Versements de la période</span><strong>${da(paid)}</strong></div>
      <div class="summary-line"><span>Total porté au propriétaire (depuis toujours)</span><strong>${da(money.charged)}</strong></div>
      <div class="summary-line"><span>Total réglé (depuis toujours)</span><strong>${da(money.paid)}</strong></div>
      <div class="net-pay-box ${money.debt > 0 ? "negative" : ""}">
        <span>${money.debt > 0 ? "Reste dû à ce jour" : "Compte à jour"}</span><span>${da(money.debt)}</span>
      </div>
    </div>
    ${signaturesHtml("Le club", "Le propriétaire")}
    ${metaFooterHtml(school.name, lang)}`;

  return printDocument({ title: `Dépenses — ${horse.name}`, lang, bodyHtml: body });
}

// ---------------------------------------------------------------------------
//  4. Le rapport de gestion de l'écurie
// ---------------------------------------------------------------------------

export function buildStableReport(opts: {
  db: Database;
  school: School;
  lang: Language;
  from: string;
  to: string;
  scope: StableScope;
}): string {
  const { db, school, lang, from, to, scope } = opts;
  const report = stableReport(db, from, to, scope);

  const scopeLabel =
    scope === "club"
      ? "Chevaux du club uniquement"
      : scope === "boarded"
        ? "Chevaux en pension uniquement"
        : "Tous les chevaux";

  const head = `
    <tr>
      <th>Propriétaire</th>
      <th>Chevaux</th>
      ${report.categories.map((c) => `<th class="num">${esc(c)}</th>`).join("")}
      <th class="num">Total dépenses</th>
      <th class="num">Versements</th>
      <th class="num">Reste dû</th>
    </tr>`;

  const rows = report.rows
    .map(
      (r) => `
      <tr>
        <td><strong>${esc(r.ownerName)}</strong>${r.ownerPhone ? `<br><span style="font-size:.85em;color:#59637a">${esc(r.ownerPhone)}</span>` : ""}</td>
        <td>${esc(r.horses.map((h) => h.name).join(", "))}</td>
        ${report.categories.map((c) => `<td class="num">${r.byCategory[c] ? da(r.byCategory[c]) : "—"}</td>`).join("")}
        <td class="num">${da(r.expenses)}</td>
        <td class="num">${da(r.paid)}</td>
        <td class="num">${r.club ? "—" : da(r.debt)}</td>
      </tr>`,
    )
    .join("");

  const body = `
    ${letterheadHtml(school)}
    ${bannerHtml(
      "Gestion de l'écurie",
      `${esc(scopeLabel)} — du ${esc(formatDateFr(from))} au ${esc(formatDateFr(to))}`,
    )}
    <div class="frame">
      <h3>Dépenses par propriétaire et par rubrique</h3>
      <table>
        <thead>${head}</thead>
        <tbody>
          ${rows || `<tr><td colspan="${report.categories.length + 5}"><em>Aucune dépense sur cette période.</em></td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Totaux</th>
            ${report.categories
              .map((c) => {
                const sum = report.rows.reduce((s, r) => s + (r.byCategory[c] ?? 0), 0);
                return `<th class="num">${da(sum)}</th>`;
              })
              .join("")}
            <th class="num">${da(report.totals.expenses)}</th>
            <th class="num">${da(report.totals.paid)}</th>
            <th class="num">${da(report.totals.debt)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="summary-card">
      <h3>Récapitulatif de la période</h3>
      <div class="summary-line"><span>Total des dépenses</span><strong>${da(report.totals.expenses)}</strong></div>
      <div class="summary-line"><span>Total des versements des propriétaires</span><strong>${da(report.totals.paid)}</strong></div>
      <div class="net-pay-box ${report.totals.debt > 0 ? "negative" : ""}">
        <span>Reste dû par les propriétaires</span><span>${da(report.totals.debt)}</span>
      </div>
    </div>
    ${signaturesHtml("Le club", "Le responsable de l'écurie")}
    ${metaFooterHtml(school.name, lang)}`;

  return printDocument({ title: "Gestion de l'écurie", lang, bodyHtml: body });
}

// ---------------------------------------------------------------------------
//  5. Le relevé d'une « autre dette »
// ---------------------------------------------------------------------------

export function buildOtherDebtDocument(opts: {
  db: Database;
  school: School;
  lang: Language;
  debt: OtherDebt;
}): string {
  const { db, school, lang, debt } = opts;
  const money = otherDebtMoney(db, debt.id);
  const payments = db.otherDebtPayments
    .filter((p) => p.debtId === debt.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const body = `
    ${letterheadHtml(school)}
    ${bannerHtml("Relevé d'une dette", `${esc(debt.personName)} — ${esc(formatDateFr(debt.date))}`)}
    <div class="frames-grid">
      <div class="frame frame-info">
        <h3>Le débiteur</h3>
        <table><tbody>
          ${row("Nom", debt.personName)}
          ${row("Téléphone", debt.phone)}
          ${row("Informations", debt.note)}
        </tbody></table>
      </div>
      <div class="frame ${money.rest > 0 ? "frame-danger" : "frame-success"}">
        <h3>La dette</h3>
        <table><tbody>
          ${row("Date", formatDateFr(debt.date))}
          ${row("Objet", debt.description)}
          ${row("Montant", da(money.amount))}
          ${row("Déjà réglé", da(money.paid))}
          ${row("Reste dû", da(money.rest))}
        </tbody></table>
      </div>
      <div class="frame">
        <h3>Les règlements</h3>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th class="num">Montant</th></tr></thead>
          <tbody>
            ${
              payments.length === 0
                ? `<tr><td colspan="3"><em>Aucun règlement à ce jour.</em></td></tr>`
                : payments
                    .map(
                      (p) =>
                        `<tr><td>${esc(formatDateFr(p.date))}</td><td>${esc(p.description ?? "")}</td><td class="num">${da(p.amount)}</td></tr>`,
                    )
                    .join("")
            }
          </tbody>
        </table>
      </div>
    </div>
    <div class="summary-card">
      <div class="net-pay-box ${money.rest > 0 ? "negative" : ""}">
        <span>${money.rest > 0 ? "Reste dû" : "Dette soldée"}</span><span>${da(money.rest)}</span>
      </div>
    </div>
    ${signaturesHtml("Le club", "Le débiteur")}
    ${metaFooterHtml(school.name, lang)}`;

  return printDocument({ title: `Dette — ${debt.personName}`, lang, bodyHtml: body });
}

/** L'identité d'un cheval, exposée pour les écrans qui impriment sa fiche. */
export function buildHorseSheet(opts: {
  db: Database;
  school: School;
  lang: Language;
  horse: Horse;
}): string {
  const { db, school, lang, horse } = opts;
  const money = horseMoney(db, horse.id);
  const body = `
    ${letterheadHtml(school)}
    ${bannerHtml("Fiche d'un cheval", esc(horse.name))}
    <div class="frames-grid">
      ${horseIdentityHtml(db, horse)}
      <div class="frame">
        <h3>Santé</h3>
        <table><tbody>
          ${row("Vaccinations", horse.vaccination)}
          ${row("Antécédents", horse.medicalHistory)}
          ${row("Examen vétérinaire", horse.vetExam)}
        </tbody></table>
      </div>
      <div class="frame">
        <h3>Travail</h3>
        <table><tbody>
          ${row("Discipline", horse.discipline)}
          ${row("Niveau", horse.trainingLevel)}
          ${row("Compétitions", horse.competitionHistory)}
          ${row("Récompenses", horse.awards)}
        </tbody></table>
      </div>
      <div class="frame">
        <h3>Argent</h3>
        <table><tbody>
          ${row("Prix d'achat", horse.purchasePrice ? da(horse.purchasePrice) : "")}
          ${row("Prix de vente affiché", horse.sellingPrice ? da(horse.sellingPrice) : "")}
          ${row("Total des dépenses", da(money.expenses))}
          ${row("Porté au propriétaire", da(money.charged))}
          ${row("Réglé", da(money.paid))}
          ${row("Reste dû", da(money.debt))}
          ${row("Téléphone du propriétaire", horseOwnerPhone(db, horse))}
        </tbody></table>
      </div>
    </div>
    ${metaFooterHtml(school.name, lang)}`;
  return printDocument({ title: `Cheval — ${horse.name}`, lang, bodyHtml: body });
}
