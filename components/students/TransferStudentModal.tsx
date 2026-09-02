"use client";

/**
 * LA MUTATION D'UN CHEVALIER — d'un emploi du temps vers un autre.
 *
 * Un enfant change de groupe : il grandit, il change d'horaire, l'entraîneur
 * réorganise ses catégories. Jusqu'ici il fallait le DÉSINSCRIRE d'un côté et
 * le RÉINSCRIRE de l'autre, en deux gestes séparés — et le solde qu'il avait
 * encore sur l'ancien créneau restait bloqué là, sur un groupe qu'il ne
 * fréquentait plus.
 *
 * L'écran fait le déplacement d'un seul geste, en trois questions :
 *
 *   1. D'OÙ ? — l'emploi du temps qu'il quitte, avec ce qu'il y a versé, ce
 *      qu'il y reste, et ce qu'il y doit encore.
 *   2. VERS QUELLE CATÉGORIE ? — puis, une fois choisie, VERS QUEL EMPLOI DU
 *      TEMPS de cette catégorie.
 *   3. ET SON SOLDE ? — ce qui restait le suit par défaut, au dinar près, et
 *      lui sert sur son nouveau créneau. Aucun argent n'entre ni ne sort de la
 *      caisse : c'est le même argent qui change de case.
 *
 * CE QUI NE BOUGE PAS : son histoire. Les présences pointées sur l'ancien
 * emploi, les paiements qui y ont été encaissés et les dettes qui y restent
 * demeurent sur sa fiche, datés de sa sortie — la mutation ne réécrit jamais le
 * passé, elle en ouvre un nouveau chapitre. Une dette, elle, ne le suit pas :
 * elle reste due là où elle a été creusée.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  History,
  MoveRight,
  Shield,
  Wallet,
} from "lucide-react";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/SearchInput";
import { formatDA } from "@/lib/utils";
import type { Student } from "@/lib/types";
import {
  carteShort,
  cycleSizeOf,
  formatDays,
  groupName,
  joinPointFor,
  moduleName as moduleNameOf,
  salleName,
  sessionAttendance,
  sessionTimeLabel,
  soldFor,
  studentName,
  teacherName,
  todayIso,
} from "@/lib/helpers";

export function TransferStudentModal({
  student,
  open,
  onClose,
}: {
  student: Student;
  open: boolean;
  onClose: () => void;
}) {
  const db = useData();
  const { transferStudent, subscriptions, sessions, classes } = db;
  const { addToast } = useToast();

  const [fromSubId, setFromSubId] = useState<string>(student.subscriptionIds[0] ?? "");
  const [classId, setClassId] = useState<string>("");
  const [toSubId, setToSubId] = useState<string>("");
  const [moveBalance, setMoveBalance] = useState(true);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  /** Ce qu'il suit aujourd'hui : le point de départ possible de la mutation. */
  const current = useMemo(
    () =>
      student.subscriptionIds.flatMap((subId) => {
        const sub = subscriptions.find((s) => s.id === subId);
        const session = sub && sessions.find((s) => s.id === sub.sessionId);
        if (!sub || !session) return [];
        return [
          {
            subId,
            sub,
            session,
            label: session.title || moduleNameOf(db, session.moduleId) || "Emploi du temps",
            sold: soldFor(db, student.id, subId),
            presences: sessionAttendance(db, student.id, session.id).length,
          },
        ];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [student, subscriptions, sessions, db.enrollments, db.attendance],
  );

  const from = current.find((r) => r.subId === fromSubId);

  /**
   * LES EMPLOIS DU TEMPS DE LA CATÉGORIE CHOISIE.
   *
   * Un créneau ne peut accueillir que s'il a un TARIF : sans prix, personne ne
   * sait à quoi l'inscrire. Un emploi archivé n'est plus au catalogue, et celui
   * qu'il quitte ne se propose évidemment pas comme destination.
   */
  const destinations = useMemo(() => {
    if (!classId) return [];
    return sessions
      .filter((s) => !s.archivedAt)
      .filter((s) => s.classId === classId || s.classIds?.includes(classId))
      .flatMap((s) => {
        const sub = subscriptions.find((x) => x.sessionId === s.id && !x.archivedAt);
        if (!sub || sub.id === fromSubId) return [];
        return [
          {
            subId: sub.id,
            sub,
            session: s,
            label: s.title || moduleNameOf(db, s.moduleId) || "Emploi du temps",
            enrolled: db.students.filter((st) => st.subscriptionIds.includes(sub.id)).length,
            alreadyOn: student.subscriptionIds.includes(sub.id),
          },
        ];
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, sessions, subscriptions, fromSubId, db.students, student.subscriptionIds]);

  const to = destinations.find((d) => d.subId === toSubId);

  /** Où il atterrit sur le nouveau créneau : là où le groupe en est ce jour-là. */
  const landing = useMemo(
    () => (toSubId ? joinPointFor(db, toSubId, date, student.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toSubId, date, db.attendance, student.id],
  );

  const carried = moveBalance ? Math.max(0, from?.sold ?? 0) : 0;
  const staying = Math.max(0, -(from?.sold ?? 0));

  const problem = !from
    ? "Choisissez l'emploi du temps qu'il quitte."
    : !classId
      ? "Choisissez la catégorie d'accueil."
      : !to
        ? "Choisissez l'emploi du temps d'accueil."
        : to.alreadyOn
          ? "Il suit déjà cet emploi du temps."
          : "";

  const submit = async () => {
    if (problem || !from || !to) return;
    setBusy(true);
    const res = await transferStudent({
      studentId: student.id,
      fromSubscriptionId: from.subId,
      toSubscriptionId: to.subId,
      date,
      moveBalance,
      description: note.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      addToast({
        type: "danger",
        title: "Mutation refusée",
        message:
          res.messageKey === "transfer.archived"
            ? "L'emploi du temps d'accueil a été supprimé."
            : "Ce chevalier n'a pas pu être muté.",
        studentName: studentName(student),
      });
      return;
    }
    addToast({
      type: "success",
      title: "Chevalier muté",
      message:
        `De « ${from.label} » vers « ${to.label} » — il entre en ${carteShort(
          res.monthCode ?? "M1",
        )} · séance ${(res.slotIndex ?? 0) + 1}.` +
        ((res.moved ?? 0) > 0
          ? ` Son solde de ${formatDA(res.moved ?? 0)} l'a suivi.`
          : " Aucun solde à transporter."),
      studentName: studentName(student),
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transférer le chevalier vers un autre emploi du temps"
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!!problem || busy} className="gap-1.5">
            <MoveRight className="h-4 w-4" /> {busy ? "Transfert…" : "Transférer"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-primary-50/60 p-4">
          <strong className="block text-sm text-ink">{studentName(student)}</strong>
          <span className="text-[11px] text-muted">
            {student.subscriptionIds.length} emploi(s) du temps suivi(s)
          </span>
        </div>

        {current.length === 0 ? (
          <p className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-xs text-warning">
            Ce chevalier n&apos;est inscrit sur aucun emploi du temps : il n&apos;y a rien à
            transférer. Inscrivez-le d&apos;abord depuis sa fiche.
          </p>
        ) : (
          <>
            {/* ---- 1. D'où ? ---- */}
            <section className="rounded-2xl border border-line bg-surface p-3.5">
              <span className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                <History className="h-3.5 w-3.5" /> 1 · L&apos;emploi du temps qu&apos;il quitte
              </span>
              <Select
                value={fromSubId}
                onChange={(e) => setFromSubId(e.target.value)}
                className="w-full"
              >
                {current.map((r) => (
                  <option key={r.subId} value={r.subId}>
                    {r.label} — groupe {groupName(db, r.session.groupId)} ·{" "}
                    {formatDays(r.session.days) || "—"} · solde {formatDA(r.sold)}
                  </option>
                ))}
              </Select>

              {from && (
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Tile label="Solde restant" value={formatDA(from.sold)} tone={from.sold < 0 ? "danger" : "success"} />
                  <Tile label="Présences pointées" value={String(from.presences)} />
                  <Tile label="Séances / carte" value={String(cycleSizeOf(from.sub))} />
                  <Tile
                    label="Arène & horaire"
                    value={`${salleName(db, from.session.salleId)} · ${sessionTimeLabel(from.session)}`}
                  />
                </div>
              )}
            </section>

            {/* ---- 2. Vers quelle catégorie, puis quel emploi ? ---- */}
            <section className="rounded-2xl border border-primary/25 bg-primary-50/25 p-3.5">
              <span className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                <Shield className="h-3.5 w-3.5" /> 2 · La catégorie et l&apos;emploi du temps
                d&apos;accueil
              </span>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
                    Catégorie
                  </label>
                  <Select
                    value={classId}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      setToSubId("");
                    }}
                    className="w-full"
                  >
                    <option value="">Choisir une catégorie…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
                    Emploi du temps
                  </label>
                  <Select
                    value={toSubId}
                    onChange={(e) => setToSubId(e.target.value)}
                    disabled={!classId}
                    className="w-full"
                  >
                    <option value="">
                      {classId ? "Choisir un emploi du temps…" : "Choisissez d'abord la catégorie"}
                    </option>
                    {destinations.map((d) => (
                      <option key={d.subId} value={d.subId} disabled={d.alreadyOn}>
                        {d.label} — {formatDays(d.session.days) || "—"} ·{" "}
                        {sessionTimeLabel(d.session)} · {d.enrolled} chevalier(s)
                        {d.alreadyOn ? " — déjà inscrit" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {classId && destinations.length === 0 && (
                <p className="mt-2 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[10px] text-warning">
                  Aucun emploi du temps tarifé dans cette catégorie. Un créneau sans tarif ne peut
                  accueillir personne : fixez-lui un prix depuis l&apos;écran « Emplois du temps ».
                </p>
              )}

              {to && (
                <div className="mt-2.5 space-y-1 rounded-xl border border-line bg-surface p-2.5 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="primary">{formatDays(to.session.days) || "—"}</Badge>
                    <Badge tone="neutral">{sessionTimeLabel(to.session)}</Badge>
                    <Badge tone="neutral">{salleName(db, to.session.salleId)}</Badge>
                    <Badge tone="neutral">{teacherName(db, to.session.teacherId)}</Badge>
                  </div>
                  <p className="text-muted">
                    Groupe {groupName(db, to.session.groupId)} · {cycleSizeOf(to.sub)} séances /
                    carte · séance à {formatDA(to.sub.pricePerSession)}
                  </p>
                  {landing && (
                    <p className="font-semibold text-primary">
                      Il entrera en {carteShort(landing.monthCode)} · séance{" "}
                      {landing.slotIndex + 1} — là où le groupe en est, jamais à la séance 1
                      d&apos;une carte qu&apos;il a manquée.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ---- 3. Le solde ---- */}
            <section className="rounded-2xl border border-accent/30 bg-accent-wash/30 p-3.5">
              <span className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
                <Wallet className="h-3.5 w-3.5" /> 3 · Son solde
              </span>

              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={moveBalance}
                  onChange={(e) => setMoveBalance(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <strong className="block text-[11px] text-ink">
                    Transporter le solde restant vers le nouvel emploi du temps
                    {carried > 0 ? ` — ${formatDA(carried)}` : ""}
                  </strong>
                  <span className="block text-[9px] leading-relaxed text-muted">
                    Ce qu&apos;il a déjà versé et n&apos;a pas consommé le suit et lui sert sur son
                    nouveau créneau. Aucun mouvement de caisse : l&apos;argent ne fait que changer
                    de case, et les deux lignes se lisent l&apos;une en face de l&apos;autre dans
                    son historique.
                  </span>
                </span>
              </label>

              {staying > 0 && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-danger/40 bg-danger/10 p-2.5 text-[10px] leading-relaxed text-danger">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Il doit <strong>{formatDA(staying)}</strong> sur l&apos;emploi du temps
                    qu&apos;il quitte. Cette dette <strong>ne le suit pas</strong> : elle reste due
                    là où elle a été creusée, et continue d&apos;apparaître sur sa fiche jusqu&apos;à
                    ce qu&apos;elle soit réglée.
                  </span>
                </p>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
                    Date de la mutation
                  </label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
                    Motif (facultatif)
                  </label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex. changement d'horaire demandé par la famille"
                  />
                </div>
              </div>
            </section>

            {/* ---- Le résumé, en une phrase ---- */}
            {from && to && (
              <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-success/40 bg-success/10 p-3 text-[11px] leading-relaxed text-success">
                <strong>{from.label}</strong>
                <ArrowRight className="h-3.5 w-3.5" />
                <strong>{to.label}</strong>
                <span className="text-success/85">
                  — ses présences, ses paiements et ses dettes sur l&apos;ancien créneau restent
                  lisibles sur sa fiche ; il disparaît de ses feuilles de présence et apparaît sur
                  celles du nouveau dès aujourd&apos;hui.
                </span>
              </p>
            )}

            {problem && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">
                {problem}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Tile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const color =
    tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-canvas/50 px-2.5 py-2">
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <strong className={`block truncate text-xs font-black ${color}`}>{value}</strong>
    </div>
  );
}
