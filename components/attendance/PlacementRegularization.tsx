"use client";

/**
 * =============================================================================
 *  LES SÉANCES À RÉGULARISER D'UN CHEVALIER PLACÉ SUR UNE SÉANCE PASSÉE
 * =============================================================================
 *
 * Trois pièces, partagées par le tableau de bord, l'écran Présences, la fiche
 * du chevalier et les portails :
 *
 *  - `PendingPlacementsAlert` : l'alerte « N chevalier(s) à régulariser »,
 *    avec un bouton par chevalier qui ouvre la fenêtre de régularisation ;
 *  - `RegularizeModal` : la liste des séances en attente, chacune se pointe
 *    présent / absent / annulée — exactement comme une séance ordinaire
 *    (présent et absent débitent le solde, annulée ne coûte rien) ;
 *  - `PlacementSummary` : la lecture seule du placement, pour la fiche et les
 *    portails du chevalier et de son parent.
 *
 * Tant qu'une séance n'est pas pointée, elle ne débite rien et ne vaut ni
 * présence ni absence : elle est simplement « à régulariser ».
 */

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarClock, Check, Slash, X } from "lucide-react";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDA } from "@/lib/utils";
import {
  attendanceOn,
  carteLabel,
  carteShort,
  dayKeyOf,
  formatDateFr,
  registrationNumberOf,
  studentName,
  subscriptionTitleOf,
} from "@/lib/helpers";
import {
  pendingPlacements,
  placementStatus,
  studentPlacements,
  type PlacementStatus,
} from "@/lib/placement";
import type { AttendanceStatus, Student } from "@/lib/types";

const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: "Présent",
  late: "En retard",
  absent: "Absent",
  cancelled: "Annulée",
};

/** « Carte 1 · séance 3 (12/10/2026) » */
export function placementLabel(p: Pick<PlacementStatus, "carteCode" | "seance" | "date">): string {
  return `${carteLabel(p.carteCode)} · séance ${p.seance + 1} (${formatDateFr(p.date)})`;
}

// ---------------------------------------------------------------------------
//  La fenêtre de régularisation
// ---------------------------------------------------------------------------

export function RegularizeModal({
  studentId,
  subscriptionId,
  onClose,
}: {
  studentId: string;
  subscriptionId: string;
  onClose: () => void;
}) {
  const db = useData();
  const { setPresence } = db;
  const { addToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const student = db.students.find((s) => s.id === studentId);
  const status = student ? placementStatus(db, student, subscriptionId) : undefined;
  // Toute la fenêtre — réglées comprises — pour pouvoir corriger un clic.
  const rows = (() => {
    if (!status) return [];
    const sub = db.subscriptions.find((s) => s.id === subscriptionId);
    if (!sub) return [];
    const pendingKeys = new Set(status.pending.map((p) => `${p.date}#${p.slot}`));
    const out: { date: string; slot: number; carteCode: string; seanceIndex: number; pending: boolean }[] = [];
    for (const p of status.pending) out.push({ ...p, pending: true });
    // Les séances déjà réglées de la fenêtre, relues depuis les présences.
    for (const a of db.attendance) {
      if (a.studentId !== studentId || a.sessionId !== sub.sessionId) continue;
      const d = dayKeyOf(a.timestamp);
      if (d < status.date || d >= status.arrivalDay) continue;
      const k = `${d}#${a.slot ?? 0}`;
      if (pendingKeys.has(k)) continue;
      out.push({ date: d, slot: a.slot ?? 0, carteCode: "", seanceIndex: -1, pending: false });
    }
    return out.sort((a, b) => (a.date === b.date ? a.slot - b.slot : a.date.localeCompare(b.date)));
  })();

  if (!student || !status) return null;

  const mark = async (date: string, slot: number, value: AttendanceStatus | null) => {
    const key = `${date}#${slot}`;
    setBusy(key);
    const res = await setPresence({
      studentId,
      sessionId: status.sessionId,
      date,
      slot,
      status: value,
      retro: true,
    });
    setBusy(null);
    if (!res.ok) {
      addToast({
        type: "danger",
        title: "Régularisation refusée",
        message: "Impossible d'enregistrer ce pointage.",
        studentName: studentName(student),
      });
      return false;
    }
    return true;
  };

  const markAll = async (value: AttendanceStatus) => {
    setBusy("all");
    let n = 0;
    for (const p of status.pending) {
      const res = await setPresence({
        studentId,
        sessionId: status.sessionId,
        date: p.date,
        slot: p.slot,
        status: value,
        retro: true,
      });
      if (res.ok) n++;
    }
    setBusy(null);
    addToast({
      type: "success",
      title: "Séances régularisées",
      message: `${n} séance(s) pointée(s) « ${STATUS_TEXT[value]} ».`,
      studentName: studentName(student),
    });
  };

  return (
    <Modal open onClose={onClose} title={`Régulariser — ${studentName(student)}`} wide>
      <div className="space-y-3">
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] leading-relaxed text-ink">
          <strong className="block text-xs">
            {subscriptionTitleOf(db, subscriptionId)} — placé en {placementLabel(status)}
          </strong>
          Ces séances lui appartiennent depuis son placement, mais aucune n&apos;a encore été
          pointée : elles ne débitent rien et ne comptent ni comme présence ni comme absence tant
          qu&apos;elles ne sont pas réglées. <strong>Présent</strong> ou <strong>Absent</strong> :
          la séance est débitée de son solde comme un pointage normal. <strong>Annulée</strong> :
          rien n&apos;est débité.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.pending.length > 0 ? "warning" : "success"}>
            {status.pending.length > 0
              ? `${status.pending.length} / ${status.total} séance(s) à régulariser`
              : `Toutes les ${status.total} séance(s) sont réglées`}
          </Badge>
          {status.pending.length > 1 && (
            <>
              <Button size="sm" variant="success" disabled={!!busy} onClick={() => markAll("present")}>
                <Check className="h-3.5 w-3.5" /> Tout présent
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => markAll("absent")}>
                <X className="h-3.5 w-3.5" /> Tout absent
              </Button>
            </>
          )}
        </div>

        <div className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {rows.length === 0 && (
            <p className="p-4 text-center text-xs text-muted">Aucune séance dans la fenêtre.</p>
          )}
          {rows.map((r) => {
            const key = `${r.date}#${r.slot}`;
            const rec = attendanceOn(db, studentId, status.sessionId, r.date, r.slot);
            const dis = !!busy;
            return (
              <div key={key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="text-xs">
                  <span className="font-semibold text-ink">{formatDateFr(r.date)}</span>
                  {r.slot > 0 && <span className="ms-1 text-muted">· séance {r.slot + 1} du jour</span>}
                  {r.carteCode && (
                    <span className="ms-1 text-muted">
                      · {carteShort(r.carteCode)} S{r.seanceIndex + 1}
                    </span>
                  )}
                  {rec ? (
                    <Badge tone={rec.status === "absent" ? "danger" : rec.status === "cancelled" ? "primary" : "success"} className="ms-2 text-[10px]">
                      {STATUS_TEXT[rec.status]}
                      {rec.amountDeducted > 0 ? ` −${formatDA(rec.amountDeducted)}` : ""}
                    </Badge>
                  ) : (
                    <Badge tone="warning" className="ms-2 text-[10px]">
                      À régulariser
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <RegButton active={rec?.status === "present"} disabled={dis} tone="success" title="Présent" onClick={() => mark(r.date, r.slot, "present")}>
                    <Check className="h-3.5 w-3.5" />
                  </RegButton>
                  <RegButton active={rec?.status === "absent"} disabled={dis} tone="danger" title="Absent" onClick={() => mark(r.date, r.slot, "absent")}>
                    <X className="h-3.5 w-3.5" />
                  </RegButton>
                  <RegButton active={rec?.status === "cancelled"} disabled={dis} tone="primary" title="Séance annulée (ne touche pas le solde)" onClick={() => mark(r.date, r.slot, "cancelled")}>
                    <Slash className="h-3.5 w-3.5" />
                  </RegButton>
                  {rec && (
                    <button
                      type="button"
                      disabled={dis}
                      onClick={() => mark(r.date, r.slot, null)}
                      title="Remettre « à régulariser » (le montant est rendu)"
                      className="rounded-lg border border-line px-2 py-1 text-[10px] text-muted hover:text-ink disabled:opacity-50"
                    >
                      Annuler le pointage
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RegButton({
  active,
  disabled,
  tone,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  tone: "success" | "danger" | "primary";
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const on = {
    success: "border-success bg-success text-white",
    danger: "border-danger bg-danger text-white",
    primary: "border-primary bg-primary text-white",
  }[tone];
  const off = {
    success: "border-success/40 text-success hover:bg-success/10",
    danger: "border-danger/40 text-danger hover:bg-danger/10",
    primary: "border-primary/40 text-primary hover:bg-primary/10",
  }[tone];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${active ? on : off}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
//  L'alerte « à régulariser » (tableau de bord, Présences, feuille de présence)
// ---------------------------------------------------------------------------

export function PendingPlacementsAlert({
  sessionId,
  canMark = true,
}: {
  /** limiter l'alerte à un emploi du temps (la feuille de présence) */
  sessionId?: string;
  canMark?: boolean;
}) {
  const db = useData();
  const [open, setOpen] = useState<{ studentId: string; subscriptionId: string } | null>(null);
  const rows = useMemo(() => pendingPlacements(db, sessionId), [db, sessionId]);
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.pending.length, 0);

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-warning/45">
      <div className="flex flex-wrap items-center gap-2 bg-warning/10 p-3">
        <span className="rounded-xl bg-warning/15 p-2 text-warning">
          <CalendarClock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <strong className="block text-xs text-ink">
            {rows.length} chevalier(s) placé(s) sur des séances passées — {total} séance(s) à
            régulariser
          </strong>
          <span className="block text-[10px] text-muted">
            Tant qu&apos;elles ne sont pas pointées, ces séances ne débitent rien et ne comptent ni
            comme présence ni comme absence.
          </span>
        </div>
      </div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto p-2.5">
        {rows.map((r) => {
          const student = db.students.find((s) => s.id === r.studentId)!;
          return (
            <div
              key={`${r.studentId}-${r.subscriptionId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2"
            >
              <span className="min-w-0 text-xs">
                <span className="font-mono text-[10px] text-muted">
                  {registrationNumberOf(db, student)}
                </span>{" "}
                <strong className="text-ink">{studentName(student)}</strong>
                <span className="block text-[10px] text-muted">
                  {subscriptionTitleOf(db, r.subscriptionId)} · placé en {placementLabel(r)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Badge tone="warning" className="text-[10px]">
                  {r.pending.length} à régler
                </Badge>
                {canMark && (
                  <Button
                    size="sm"
                    onClick={() => setOpen({ studentId: r.studentId, subscriptionId: r.subscriptionId })}
                  >
                    Régulariser
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {open && (
        <RegularizeModal
          studentId={open.studentId}
          subscriptionId={open.subscriptionId}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
//  La lecture du placement — fiche, profil du chevalier, profil du parent
// ---------------------------------------------------------------------------

export function PlacementSummary({
  student,
  /** la réception peut régulariser depuis la fiche ; les portails lisent seulement */
  canRegularize = false,
}: {
  student: Student;
  canRegularize?: boolean;
}) {
  const db = useData();
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => studentPlacements(db, student), [db, student]);
  if (list.length === 0) return null;

  return (
    <div className="space-y-2">
      {list.map((p) => {
        const done = p.total - p.pending.length;
        const settled = p.pending.length === 0;
        return (
          <div
            key={p.subscriptionId}
            className={`rounded-xl border p-3 ${
              settled ? "border-success/35 bg-success/5" : "border-warning/45 bg-warning/10"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <strong className="flex items-center gap-1.5 text-xs text-ink">
                  {settled ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  )}
                  {subscriptionTitleOf(db, p.subscriptionId)}
                </strong>
                <span className="block text-[11px] text-muted">
                  Placé en <strong className="text-ink">{placementLabel(p)}</strong> · arrivé le{" "}
                  {formatDateFr(p.arrivalDay)}
                </span>
                <span className="block text-[11px] text-muted">
                  {settled
                    ? `Les ${p.total} séance(s) depuis le placement sont réglées.`
                    : `${done} / ${p.total} séance(s) réglée(s) — ${p.pending.length} en attente de régularisation (ni présence ni absence, rien de débité).`}
                </span>
              </div>
              {canRegularize && !settled && (
                <Button size="sm" onClick={() => setOpen(p.subscriptionId)}>
                  Régulariser
                </Button>
              )}
            </div>
            {!settled && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.pending.map((s) => (
                  <Badge key={`${s.date}#${s.slot}`} tone="warning" className="text-[10px]">
                    {carteShort(s.carteCode)} S{s.seanceIndex + 1} · {formatDateFr(s.date)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {open && (
        <RegularizeModal
          studentId={student.id}
          subscriptionId={open}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/**
 * LE PLACEMENT, VU DES PORTAILS — une carte « Placement & séances à
 * régulariser » pour un chevalier ou pour chacun des enfants d'un parent.
 * Rien ne s'affiche tant qu'aucun d'eux n'a été placé sur une séance passée.
 */
export function PortalPlacementCard({ students }: { students: Student[] }) {
  const db = useData();
  const placed = students.filter((s) => studentPlacements(db, s).length > 0);
  if (placed.length === 0) return null;
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 card-shadow">
      <h3 className="flex items-center gap-2 border-b border-line pb-3 text-sm font-bold text-ink">
        <CalendarClock className="h-5 w-5 text-primary" /> Placement &amp; séances à régulariser
      </h3>
      <p className="text-[11px] text-muted">
        Les séances depuis le placement sont rattachées au chevalier. Celles « à régulariser »
        n&apos;ont encore été comptées ni comme présence ni comme absence, et rien n&apos;a été
        débité : l&apos;intendance du club les règle au comptoir.
      </p>
      {placed.map((s) => (
        <div key={s.id} className="space-y-1.5">
          {students.length > 1 && <strong className="block text-xs text-ink">{studentName(s)}</strong>}
          <PlacementSummary student={s} />
        </div>
      ))}
    </div>
  );
}
