"use client";

/**
 * =============================================================================
 *  LES AUTRES DETTES — ce qu'on doit au club sans que ce soit une cotisation
 * =============================================================================
 *
 *  Un fournisseur avancé, une casse à rembourser, du matériel prêté non rendu :
 *  des sommes qui n'appartiennent à aucun emploi du temps et qui n'ont leur
 *  place ni sur une carte, ni sur un frais de chevalier. Faute d'un endroit à
 *  elles, elles finissaient sur un papier au fond d'un tiroir.
 *
 *  LA PERSONNE PEUT ÊTRE UNE FICHE DU CLUB. C'est ce rattachement qui fait
 *  remonter la dette sur son compte — et sur celui de son parent. Saisi à la
 *  main, le nom reste une chaîne que rien ne relie à personne.
 *
 *  DEUX VUES SUR LES MÊMES LIGNES : des cartes, pour parcourir, et un tableau,
 *  pour comparer. Aucune des deux ne remplace l'autre.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Edit,
  Eye,
  LayoutGrid,
  List,
  Plus,
  Printer,
  Receipt,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { useData } from "@/lib/store/data";
import { useSettings } from "@/lib/store/settings";
import { useToast } from "@/lib/store/toast";
import { useCan } from "@/lib/usePermissions";
import { printHtmlDocument } from "@/lib/print";
import { formatDA } from "@/lib/utils";
import { formatDateFr, todayIso } from "@/lib/helpers";
import { otherDebtMoney } from "@/lib/stable";
import { buildOtherDebtDocument, buildStablePaymentReceipt } from "@/lib/reports/stable";
import { PersonPicker, type PersonValue } from "@/components/stable/PersonPicker";
import type { OtherDebt, OtherDebtPayment } from "@/lib/types";

export function OtherDebtsPage() {
  const can = useCan("other-debts");
  const db = useData();
  const { saveOtherDebt, deleteOtherDebt } = db;
  const language = useSettings((s) => s.language);
  const { addToast } = useToast();

  const [view, setView] = useState<"cards" | "table">("cards");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"all" | "open" | "settled">("all");
  const [sort, setSort] = useState<"recent" | "name" | "rest">("recent");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OtherDebt | null>(null);
  const [detail, setDetail] = useState<OtherDebt | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = db.otherDebts
      .map((d) => ({ debt: d, money: otherDebtMoney(db, d.id) }))
      .filter((r) => {
        if (state === "open" && r.money.rest <= 0) return false;
        if (state === "settled" && r.money.rest > 0) return false;
        if (!q) return true;
        return `${r.debt.personName} ${r.debt.phone ?? ""} ${r.debt.description ?? ""} ${r.debt.note ?? ""}`
          .toLowerCase()
          .includes(q);
      });
    return list.sort((a, b) => {
      if (sort === "name") return a.debt.personName.localeCompare(b.debt.personName);
      if (sort === "rest") return b.money.rest - a.money.rest;
      return b.debt.date.localeCompare(a.debt.date);
    });
  }, [db, query, state, sort]);

  const openRows = rows.filter((r) => r.money.rest > 0);
  const totalOpen = db.otherDebts.reduce((s, d) => s + otherDebtMoney(db, d.id).rest, 0);

  const remove = async (d: OtherDebt) => {
    if (
      !confirm(
        `Supprimer la dette de « ${d.personName} » ?\n\nSes règlements partent avec elle, et les mouvements de caisse correspondants sont repris.`,
      )
    )
      return;
    await deleteOtherDebt(d.id);
    addToast({ type: "success", title: "Dette supprimée", message: d.personName });
  };

  return (
    <div>
      <PageHeader
        icon={Receipt}
        title="Autres dettes"
        subtitle="Ce que l'on doit au club en dehors des cotisations"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setView(view === "cards" ? "table" : "cards")}
              className="gap-1.5"
            >
              {view === "cards" ? (
                <>
                  <List className="h-4 w-4" /> Voir en tableau
                </>
              ) : (
                <>
                  <LayoutGrid className="h-4 w-4" /> Voir en cartes
                </>
              )}
            </Button>
            {can("create") && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" /> Nouvelle dette
              </Button>
            )}
          </div>
        }
      />

      {/* ---- L'ALERTE ---- */}
      {totalOpen > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border-2 border-danger/40 bg-danger/10 p-4">
          <AlertTriangle className="h-6 w-6 shrink-0 text-danger" />
          <span className="min-w-0 flex-1">
            <strong className="block text-sm text-danger">
              {db.otherDebts.filter((d) => otherDebtMoney(db, d.id).rest > 0).length} dette(s) en
              cours — {formatDA(totalOpen)} restent dus
            </strong>
            <span className="block text-[11px] text-muted">
              Ces sommes n&apos;apparaissent sur aucune carte de chevalier : c&apos;est ici, et
              nulle part ailleurs, qu&apos;on les retrouve.
            </span>
          </span>
          <Button size="sm" variant="outline" onClick={() => setState("open")}>
            Ne voir que celles-là
          </Button>
        </div>
      )}

      {/* ---- Recherche et filtres ---- */}
      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end gap-2 py-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted start-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom, téléphone, objet de la dette…"
              className="ps-9"
            />
          </div>
          <Select
            value={state}
            onChange={(e) => setState(e.target.value as typeof state)}
            className="w-44"
          >
            <option value="all">Toutes</option>
            <option value="open">En cours</option>
            <option value="settled">Soldées</option>
          </Select>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="w-48"
          >
            <option value="recent">Les plus récentes</option>
            <option value="name">Par nom</option>
            <option value="rest">Reste dû décroissant</option>
          </Select>
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          message="Aucune dette enregistrée."
          hint="Une « autre dette » est une somme due au club qui n'est pas une cotisation : un fournisseur avancé, une casse à rembourser, du matériel non rendu."
          action={
            can("create") ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Nouvelle dette
              </Button>
            ) : undefined
          }
        />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <motion.div
              key={r.debt.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.32), duration: 0.3 }}
            >
              <Card className={`h-full ${r.money.rest > 0 ? "border-2 border-danger/40" : ""}`}>
                <CardBody className="flex h-full flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Badge tone={r.money.rest > 0 ? "danger" : "success"}>
                          {r.money.rest > 0 ? "En cours" : "Soldée"}
                        </Badge>
                        <h3 className="font-display mt-2 truncate text-lg font-bold text-ink">
                          {r.debt.personName}
                        </h3>
                        <span className="block text-[11px] text-muted">
                          {r.debt.phone || "aucun numéro"} · {formatDateFr(r.debt.date)}
                        </span>
                        {r.debt.studentId && (
                          <Badge tone="primary" className="mt-1 text-[9px]">
                            Chevalier du club
                          </Badge>
                        )}
                        {r.debt.parentId && (
                          <Badge tone="primary" className="mt-1 text-[9px]">
                            Parent du club
                          </Badge>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {can("edit") && (
                          <IconBtn
                            title="Modifier"
                            icon={Edit}
                            onClick={() => {
                              setEditing(r.debt);
                              setFormOpen(true);
                            }}
                          />
                        )}
                        {can("delete") && (
                          <IconBtn
                            title="Supprimer"
                            danger
                            icon={Trash2}
                            onClick={() => void remove(r.debt)}
                          />
                        )}
                      </div>
                    </div>
                    {r.debt.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted">{r.debt.description}</p>
                    )}
                  </div>

                  <div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-line pt-3 text-center">
                      <Mini label="Montant" value={formatDA(r.money.amount)} />
                      <Mini label="Réglé" value={formatDA(r.money.paid)} tone="success" />
                      <Mini
                        label="Reste"
                        value={formatDA(r.money.rest)}
                        tone={r.money.rest > 0 ? "danger" : "neutral"}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => setDetail(r.debt)}
                      >
                        <Eye className="h-3.5 w-3.5" /> Détails
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() =>
                          printHtmlDocument(
                            buildOtherDebtDocument({
                              db,
                              school: db.school,
                              lang: language,
                              debt: r.debt,
                            }),
                          )
                        }
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card>
          <CardBody>
            <div className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[860px] text-xs">
                <thead className="bg-canvas/60">
                  <tr className="text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2.5 text-start">Date</th>
                    <th className="px-3 py-2.5 text-start">Personne</th>
                    <th className="px-3 py-2.5 text-start">Téléphone</th>
                    <th className="px-3 py-2.5 text-start">Objet</th>
                    <th className="px-3 py-2.5 text-end">Montant</th>
                    <th className="px-3 py-2.5 text-end">Réglé</th>
                    <th className="px-3 py-2.5 text-end">Reste</th>
                    <th className="px-3 py-2.5 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.debt.id}
                      className={`border-t border-line/60 ${
                        r.money.rest > 0 ? "bg-danger/5" : "hover:bg-primary-50/30"
                      }`}
                    >
                      <td className="px-3 py-2 text-muted">{formatDateFr(r.debt.date)}</td>
                      <td className="px-3 py-2 font-semibold text-ink">{r.debt.personName}</td>
                      <td className="px-3 py-2 text-muted">{r.debt.phone || "—"}</td>
                      <td className="px-3 py-2 text-muted">{r.debt.description || "—"}</td>
                      <td className="px-3 py-2 text-end font-mono text-ink">
                        {formatDA(r.money.amount)}
                      </td>
                      <td className="px-3 py-2 text-end font-mono text-success">
                        {formatDA(r.money.paid)}
                      </td>
                      <td className="px-3 py-2 text-end font-mono">
                        {r.money.rest > 0 ? (
                          <strong className="text-danger">{formatDA(r.money.rest)}</strong>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <IconBtn title="Détails" icon={Eye} onClick={() => setDetail(r.debt)} />
                          {can("edit") && (
                            <IconBtn
                              title="Modifier"
                              icon={Edit}
                              onClick={() => {
                                setEditing(r.debt);
                                setFormOpen(true);
                              }}
                            />
                          )}
                          <IconBtn
                            title="Imprimer"
                            icon={Printer}
                            onClick={() =>
                              printHtmlDocument(
                                buildOtherDebtDocument({
                                  db,
                                  school: db.school,
                                  lang: language,
                                  debt: r.debt,
                                }),
                              )
                            }
                          />
                          {can("delete") && (
                            <IconBtn
                              title="Supprimer"
                              danger
                              icon={Trash2}
                              onClick={() => void remove(r.debt)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-line bg-canvas/60 text-[11px] font-bold">
                  <tr>
                    <td className="px-3 py-2.5 text-ink" colSpan={4}>
                      Totaux ({rows.length} ligne(s), dont {openRows.length} en cours)
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-ink">
                      {formatDA(rows.reduce((s, r) => s + r.money.amount, 0))}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-success">
                      {formatDA(rows.reduce((s, r) => s + r.money.paid, 0))}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-danger">
                      {formatDA(rows.reduce((s, r) => s + r.money.rest, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {formOpen && (
        <OtherDebtFormModal
          debt={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={saveOtherDebt}
        />
      )}
      {detail && (
        <OtherDebtDetailsModal
          debt={db.otherDebts.find((d) => d.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  La création / modification
// ---------------------------------------------------------------------------

function OtherDebtFormModal({
  debt,
  onClose,
  onSave,
}: {
  debt: OtherDebt | null;
  onClose: () => void;
  onSave: ReturnType<typeof useData.getState>["saveOtherDebt"];
}) {
  const { addToast } = useToast();
  const [person, setPerson] = useState<PersonValue>(() => ({
    kind: debt?.studentId ? "student" : debt?.parentId ? "parent" : "external",
    studentId: debt?.studentId,
    parentId: debt?.parentId,
    name: debt?.personName ?? "",
    phone: debt?.phone ?? "",
    note: debt?.note ?? "",
  }));
  const [amount, setAmount] = useState(debt ? String(debt.amount) : "");
  const [date, setDate] = useState(debt?.date ?? todayIso());
  const [description, setDescription] = useState(debt?.description ?? "");

  const value = Math.max(0, Number(amount) || 0);
  const problem = !person.name.trim()
    ? "Nommez la personne."
    : value <= 0
      ? "Indiquez le montant de la dette."
      : "";

  const submit = async () => {
    if (problem) return;
    const res = await onSave({
      id: debt?.id,
      studentId: person.kind === "student" ? person.studentId : undefined,
      parentId: person.kind === "parent" ? person.parentId : undefined,
      personName: person.name.trim(),
      phone: person.phone?.trim() || undefined,
      note: person.note?.trim() || undefined,
      amount: value,
      description: description.trim() || undefined,
      date,
    });
    if (!res.ok) {
      addToast({ type: "danger", title: "Enregistrement refusé", message: "Vérifiez les champs." });
      return;
    }
    addToast({
      type: "success",
      title: debt ? "Dette modifiée" : "Dette enregistrée",
      message: `${person.name.trim()} — ${formatDA(value)}.`,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={debt ? "Modifier la dette" : "Nouvelle dette"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={!!problem}>
            {debt ? "Enregistrer" : "Créer la dette"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <PersonPicker
          value={person}
          onChange={setPerson}
          label="Qui doit cette somme ?"
          externalLabel="Hors du club"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">
              Montant (DA) <span className="text-danger">*</span>
            </label>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">Date de la dette</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">
            Objet de la dette
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ce qui a été avancé, cassé, prêté…"
            className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>

        {problem && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
//  Le détail et l'historique
// ---------------------------------------------------------------------------

function OtherDebtDetailsModal({ debt, onClose }: { debt: OtherDebt; onClose: () => void }) {
  const db = useData();
  const { payOtherDebt, updateOtherDebtPayment, deleteOtherDebtPayment } = db;
  const language = useSettings((s) => s.language);
  const { addToast } = useToast();

  const money = otherDebtMoney(db, debt.id);
  const payments = useMemo(
    () =>
      db.otherDebtPayments
        .filter((p) => p.debtId === debt.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [db.otherDebtPayments, debt.id],
  );

  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<OtherDebtPayment | null>(null);

  const value = Math.max(0, Math.min(Number(amount) || 0, money.rest));
  const restAfter = Math.max(0, money.rest - value);

  const submitPayment = async () => {
    if (value <= 0) return;
    const res = await payOtherDebt({
      debtId: debt.id,
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
          : `${formatDA(value)} encaissés — la dette est soldée.`,
    });
    if (confirm("Imprimer le reçu du règlement ?")) {
      printHtmlDocument(
        buildStablePaymentReceipt({
          school: db.school,
          lang: language,
          title: "Reçu de règlement",
          subject: debt.description || "Autre dette",
          personName: debt.personName,
          personPhone: debt.phone,
          amount: value,
          date,
          total: money.amount,
          paidBefore: money.paid,
          description: note.trim() || undefined,
        }),
      );
    }
    setPayOpen(false);
    setAmount("");
    setNote("");
  };

  return (
    <Modal open onClose={onClose} wide title={`Dette — ${debt.personName}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Montant" value={formatDA(money.amount)} tone="neutral" />
          <Stat label="Réglé" value={formatDA(money.paid)} tone="success" />
          <Stat
            label="Reste dû"
            value={formatDA(money.rest)}
            tone={money.rest > 0 ? "danger" : "neutral"}
          />
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-2xl border border-line p-3.5 sm:grid-cols-2">
          <Line label="Personne" value={debt.personName} />
          <Line label="Téléphone" value={debt.phone} />
          <Line label="Date" value={formatDateFr(debt.date)} />
          <Line
            label="Rattachement"
            value={
              debt.studentId ? "Chevalier du club" : debt.parentId ? "Parent du club" : "Extérieur"
            }
          />
          <Line label="Objet" value={debt.description} wide />
          <Line label="Informations sur la personne" value={debt.note} wide />
        </div>

        <div className="flex flex-wrap gap-2">
          {money.rest > 0 && (
            <Button onClick={() => setPayOpen(true)} className="gap-1.5">
              <Wallet className="h-4 w-4" /> Payer la dette
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              printHtmlDocument(
                buildOtherDebtDocument({ db, school: db.school, lang: language, debt }),
              )
            }
          >
            <Printer className="h-4 w-4" /> Imprimer le relevé
          </Button>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-bold text-ink">
            Historique des règlements ({payments.length})
          </h4>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-canvas/60">
                <tr className="text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 text-start">Date</th>
                  <th className="px-3 py-2 text-start">Description</th>
                  <th className="px-3 py-2 text-end">Montant</th>
                  <th className="px-3 py-2 text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center italic text-muted">
                      Aucun règlement à ce jour.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id} className="border-t border-line/60">
                      <td className="px-3 py-2 text-muted">{formatDateFr(p.date)}</td>
                      <td className="px-3 py-2 text-ink">{p.description || "—"}</td>
                      <td className="px-3 py-2 text-end font-mono text-success">
                        {formatDA(p.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <IconBtn title="Modifier" icon={Edit} onClick={() => setEditing(p)} />
                          <IconBtn
                            title="Imprimer le reçu"
                            icon={Printer}
                            onClick={() =>
                              printHtmlDocument(
                                buildStablePaymentReceipt({
                                  school: db.school,
                                  lang: language,
                                  title: "Reçu de règlement",
                                  subject: debt.description || "Autre dette",
                                  personName: debt.personName,
                                  personPhone: debt.phone,
                                  amount: p.amount,
                                  date: p.date,
                                  total: money.amount,
                                  paidBefore: money.paid - p.amount,
                                  description: p.description,
                                }),
                              )
                            }
                          />
                          <IconBtn
                            title="Supprimer"
                            danger
                            icon={Trash2}
                            onClick={async () => {
                              if (!confirm("Supprimer ce règlement ?")) return;
                              await deleteOtherDebtPayment(p.id);
                              addToast({
                                type: "success",
                                title: "Règlement supprimé",
                                message: "Le reste dû remonte d'autant.",
                              });
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {payOpen && (
        <Modal
          open
          onClose={() => setPayOpen(false)}
          title="Encaisser un règlement"
          footer={
            <>
              <Button variant="outline" onClick={() => setPayOpen(false)}>
                Annuler
              </Button>
              <Button onClick={() => void submitPayment()} disabled={value <= 0}>
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-canvas/40 p-3">
              <Stat label="Total dû" value={formatDA(money.amount)} tone="neutral" />
              <Stat label="Déjà réglé" value={formatDA(money.paid)} tone="success" />
              <Stat label="Reste" value={formatDA(money.rest)} tone="danger" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">
                Combien règle-t-il cette fois ? (DA)
              </label>
              <Input
                type="number"
                min={0}
                max={money.rest}
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
                {restAfter > 0 ? "Reste après ce règlement" : "La dette sera soldée"}
              </span>
              <strong className="block text-lg font-black tabular-nums">
                {formatDA(restAfter)}
              </strong>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title="Corriger un règlement"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button
                onClick={async () => {
                  await updateOtherDebtPayment(editing.id, {
                    amount: editing.amount,
                    date: editing.date,
                    description: editing.description,
                  });
                  addToast({
                    type: "success",
                    title: "Règlement corrigé",
                    message: "Le reste dû et la caisse ont suivi.",
                  });
                  setEditing(null);
                }}
              >
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Montant (DA)</label>
              <Input
                type="number"
                min={0}
                value={editing.amount}
                onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Date</label>
              <Input
                type="date"
                value={editing.date}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted">Description</label>
              <Input
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
//  Les pièces d'écran
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "danger" | "neutral";
}) {
  const ring = {
    success: "border-success/30 bg-success/10 text-success",
    danger: "border-danger/35 bg-danger/10 text-danger",
    neutral: "border-line bg-canvas/50 text-ink",
  }[tone];
  return (
    <div className={`rounded-xl border p-2.5 text-center ${ring}`}>
      <span className="block text-[9px] font-bold uppercase tracking-wide opacity-80">{label}</span>
      <strong className="block text-sm font-black tabular-nums">{value}</strong>
    </div>
  );
}

function Mini({
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
    <div className="rounded-xl bg-canvas/60 px-1.5 py-2">
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <strong className={`block text-xs font-black tabular-nums ${color}`}>{value}</strong>
    </div>
  );
}

function Line({ label, value, wide }: { label: string; value?: string; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className="block whitespace-pre-wrap text-xs text-ink">{value}</span>
    </div>
  );
}

function IconBtn({
  title,
  icon: Icon,
  onClick,
  danger,
}: {
  title: string;
  icon: typeof Edit;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition-colors ${
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-primary-50 hover:text-ink"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
