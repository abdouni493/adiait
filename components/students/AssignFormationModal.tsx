"use client";

/**
 * INSCRIRE UN CHEVALIER SUR UNE FORMATION OU UN ÉVÈNEMENT, AU COMPTOIR.
 *
 * Le site inscrit sans encaisser — la famille paiera quand elle passera. Au
 * comptoir, elle EST là : la question de l'argent se pose donc tout de suite, et
 * elle a deux réponses. Les deux tiennent dans cette seule fenêtre, parce que
 * c'est un seul geste au guichet :
 *
 *   IL PAIE MAINTENANT  — en tout ou en partie. L'argent entre en caisse, un
 *                         reçu peut être imprimé, et ce qui n'est pas versé
 *                         reste dû ;
 *   IL PAIERA PLUS TARD — rien n'entre en caisse. Le prix est porté à son
 *                         compte comme un livre impayé : il s'affiche sur sa
 *                         fiche, sur la feuille de présence de son groupe et
 *                         dans les rapports, jusqu'à ce qu'il soit réglé.
 *
 * DANS LES DEUX CAS L'INSCRIPTION EST RÉELLE. C'est ce qui la distingue d'un
 * devis : sa place est prise, et le club sait ce qu'on lui doit.
 */

import { useMemo, useState } from "react";
import {
  Banknote,
  CalendarRange,
  Check,
  Clock,
  Megaphone,
  Search,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { useT } from "@/lib/i18n/useT";
import { chargeRemaining, studentName, todayIso } from "@/lib/helpers";
import { formatDA, positiveMoney } from "@/lib/utils";
import { formationStatus, hoursLabel, periodLabel } from "@/lib/site/formations";
import type { Student } from "@/lib/types";

export function AssignFormationModal({
  student,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const { tr } = useT();
  const formations = useData((s) => s.formations);
  const enrollments = useData((s) => s.formationEnrollments);
  const charges = useData((s) => s.studentCharges);
  const enrollInFormation = useData((s) => s.enrollInFormation);
  const unenrollFormation = useData((s) => s.unenrollFormation);
  const { addToast } = useToast();

  const today = todayIso();

  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [price, setPrice] = useState<number>(0);
  /** `now` = il paie au guichet · `later` = on le porte à sa dette. */
  const [moment, setMoment] = useState<"now" | "later">("later");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  /** Ce sur quoi il est DÉJÀ inscrit — on ne le lui repropose pas. */
  const mine = useMemo(
    () =>
      enrollments
        .filter((e) => e.studentId === student.id)
        .map((e) => {
          const formation = formations.find((f) => f.id === e.formationId);
          const charge = e.chargeId ? charges.find((c) => c.id === e.chargeId) : undefined;
          return { enrollment: e, formation, due: charge ? chargeRemaining(charge) : 0 };
        })
        .sort((a, b) => (b.enrollment.date ?? "").localeCompare(a.enrollment.date ?? "")),
    [enrollments, student.id, formations, charges],
  );

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const taken = new Set(mine.map((m) => m.enrollment.formationId));
    return formations
      .filter((f) => !taken.has(f.id))
      // Une formation TERMINÉE ne s'ouvre plus : y inscrire quelqu'un
      // facturerait des séances qui ont déjà eu lieu sans lui.
      .filter((f) => formationStatus(f, today) !== "past")
      .filter((f) =>
        !q ? true : `${f.name} ${f.trainerName ?? ""}`.toLowerCase().includes(q),
      )
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  }, [formations, mine, search, today]);

  const picked = formations.find((f) => f.id === pickedId);

  const choose = (id: string) => {
    setPickedId(id);
    const formation = formations.find((f) => f.id === id);
    setPrice(formation?.price ?? 0);
    setAmountPaid(0);
    setMoment("later");
  };

  const due = positiveMoney(price);
  const paying = moment === "now" ? Math.min(positiveMoney(amountPaid), due) : 0;
  const rest = positiveMoney(due - paying);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    const result = await enrollInFormation({
      formationId: picked.id,
      studentId: student.id,
      price: due,
      amountPaid: paying,
      date,
      source: "login",
    });
    setBusy(false);

    if (!result.ok) {
      addToast({
        type: "danger",
        title: "Inscription refusée",
        message:
          result.messageKey === "formation.alreadyEnrolled"
            ? "Ce chevalier est déjà inscrit sur cette formation."
            : "L'inscription n'a pas pu être enregistrée.",
      });
      return;
    }

    addToast({
      type: "success",
      title: "Inscription enregistrée",
      message:
        rest > 0
          ? `${picked.name} — ${formatDA(paying)} encaissé, ${formatDA(rest)} porté à sa dette.`
          : due > 0
            ? `${picked.name} — ${formatDA(paying)} encaissé, rien ne reste dû.`
            : `${picked.name} — inscription offerte.`,
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} wide title="Inscrire sur une formation ou un évènement">
      <div className="space-y-4">
        <p className="rounded-xl border border-line bg-canvas/40 p-2.5 text-[11px] leading-relaxed text-muted">
          <strong className="text-ink">{studentName(student)}</strong>{" "}
          {tr("sera inscrit pour de bon. L'argent, lui, se règle ici — ou plus tard, auquel cas le prix devient une dette ordinaire portée à son compte.")}
        </p>

        {/* ---- CE SUR QUOI IL EST DÉJÀ INSCRIT ------------------------- */}
        {mine.length > 0 && (
          <div className="space-y-1.5 rounded-2xl border border-line bg-canvas/40 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              {tr("Ses formations")}
            </span>
            {mine.map(({ enrollment, formation, due: owed }) => (
              <div
                key={enrollment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5"
              >
                <span className="min-w-0 text-[11px] font-semibold text-ink">
                  {formation?.name ?? tr("Formation supprimée")}
                  <span className="ms-2 text-[9px] font-normal text-muted">
                    {enrollment.source === "website"
                      ? tr("depuis le site")
                      : tr("depuis le comptoir")}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {owed > 0 ? (
                    <Badge tone="danger" className="text-[9px]">
                      {tr("Doit")} {formatDA(owed)}
                    </Badge>
                  ) : (
                    <Badge tone="success" className="text-[9px]">
                      {tr("Réglé")}
                    </Badge>
                  )}
                  <button
                    type="button"
                    title={tr("Retirer de cette formation")}
                    onClick={() => {
                      void unenrollFormation(enrollment.id);
                      addToast({
                        type: "success",
                        title: "Inscription retirée",
                        message:
                          owed > 0
                            ? `${formation?.name ?? ""} — le frais impayé part avec elle.`
                            : `${formation?.name ?? ""} — le règlement déjà encaissé, lui, reste.`,
                      });
                    }}
                    className="rounded-lg p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ---- CHOISIR LA FORMATION ------------------------------------ */}
        <div className="space-y-2 rounded-2xl border border-line bg-canvas/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            {tr("Choisir la formation")}
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Titre ou encadrant…"
              className="ps-9"
            />
          </div>

          {candidates.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              message="Aucune formation ouverte"
              hint="Publiez-en une depuis l'écran « Site web » — les formations terminées et celles où il est déjà inscrit n'apparaissent pas ici."
            />
          ) : (
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {candidates.map((f) => {
                const on = pickedId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => choose(f.id)}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start transition-colors ${
                      on
                        ? "border-primary bg-primary text-white"
                        : "border-line bg-surface text-ink hover:bg-primary-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <strong className="flex items-center gap-1.5 text-[12px]">
                        {on && <Check className="h-3.5 w-3.5" />}
                        {f.name}
                      </strong>
                      <span
                        className={`mt-0.5 flex flex-wrap items-center gap-x-3 text-[10px] ${
                          on ? "text-white/75" : "text-muted"
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <CalendarRange className="h-3 w-3" /> {periodLabel(f)}
                        </span>
                        {hoursLabel(f) && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {hoursLabel(f)}
                          </span>
                        )}
                        {f.trainerName && (
                          <span className="flex items-center gap-1">
                            <UserRound className="h-3 w-3" /> {f.trainerName}
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-[12px] font-bold ${
                        on ? "text-white" : "text-accent-ink"
                      }`}
                    >
                      {f.price > 0 ? formatDA(f.price) : tr("Offerte")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- L'ARGENT ------------------------------------------------ */}
        {picked && (
          <div className="space-y-3 rounded-2xl border border-accent/40 bg-accent-wash/60 p-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
              <Wallet className="h-3.5 w-3.5" /> {tr("Le règlement")}
            </span>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  {tr("Prix retenu (DA)")}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
                <p className="mt-1 text-[10px] leading-relaxed text-muted">
                  {tr("Le prix de la formation, qu'on peut corriger pour ce chevalier — une remise, un tarif de famille.")}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  {tr("Date de l'inscription")}
                </label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMoment("later");
                  setAmountPaid(0);
                }}
                className={`rounded-xl border p-2.5 text-start transition-colors ${
                  moment === "later"
                    ? "border-primary bg-primary text-white"
                    : "border-line bg-surface text-ink hover:bg-primary-50"
                }`}
              >
                <strong className="text-[11px]">{tr("Il paiera plus tard")}</strong>
                <span
                  className={`block text-[9px] ${
                    moment === "later" ? "text-white/80" : "text-muted"
                  }`}
                >
                  {tr("Le prix est porté à sa dette, et l'y suit jusqu'au règlement.")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoment("now");
                  setAmountPaid(due);
                }}
                disabled={due <= 0}
                className={`rounded-xl border p-2.5 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  moment === "now"
                    ? "border-primary bg-primary text-white"
                    : "border-line bg-surface text-ink hover:bg-primary-50"
                }`}
              >
                <strong className="text-[11px]">{tr("Il paie maintenant")}</strong>
                <span
                  className={`block text-[9px] ${
                    moment === "now" ? "text-white/80" : "text-muted"
                  }`}
                >
                  {tr("L'argent entre en caisse, en tout ou en partie.")}
                </span>
              </button>
            </div>

            {moment === "now" && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  {tr("Montant versé (DA)")}
                </label>
                <Input
                  type="number"
                  min={0}
                  max={due}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value))}
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface p-2.5 text-center">
              <div>
                <span className="block text-[9px] uppercase text-muted">{tr("Prix")}</span>
                <strong className="text-[13px] text-ink">{formatDA(due)}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase text-muted">{tr("Versé")}</span>
                <strong className="text-[13px] text-success">{formatDA(paying)}</strong>
              </div>
              <div>
                <span className="block text-[9px] uppercase text-muted">{tr("Reste dû")}</span>
                <strong className={`text-[13px] ${rest > 0 ? "text-danger" : "text-ink"}`}>
                  {formatDA(rest)}
                </strong>
              </div>
            </div>

            {rest > 0 && (
              <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[10px] leading-relaxed text-warning">
                <Banknote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {tr("Ce qui reste dû devient un frais au compte du chevalier : il apparaîtra sur sa fiche, sur la feuille de présence de son groupe et dans ses alertes, jusqu'à ce qu'il soit réglé.")}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Fermer
          </Button>
          <Button
            className="gap-1.5"
            disabled={busy || !picked}
            onClick={() => void submit()}
          >
            <Check className="h-4 w-4" />
            {busy ? tr("Inscription…") : tr("Inscrire")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
