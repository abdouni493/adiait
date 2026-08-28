"use client";

/**
 * LE RELEVÉ D'UN CHEVALIER, CARTE PAR CARTE.
 *
 * Les portails du chevalier et du parent posaient la même question et y
 * répondaient chacun à leur façon : « où en suis-je ? ». Une liste de pointages
 * à plat n'y répond pas. Ce qu'un chevalier veut savoir tient en trois choses :
 * quelle carte est en cours, quelles séances elle a déjà consommées, et ce
 * qu'il reste à payer dessus.
 *
 * D'où ce relevé, écrit UNE fois et lu par les deux portails — sans quoi le
 * père et le fils finiraient par voir deux comptes différents du même mois.
 *
 * CE QU'IL MONTRE, séance par séance : présent, en retard, ABSENT et ANNULÉ.
 * Une séance annulée n'est pas une absence — elle n'a rien coûté et n'a pas
 * fait avancer la carte — et la confondre avec une absence donnerait au
 * chevalier un reproche qu'il ne mérite pas. Elle a donc sa propre couleur et
 * son propre compteur.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarX2, Check, ChevronDown, Clock, Ticket, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useData } from "@/lib/store/data";
import {
  carteShort,
  cycleSizeOf,
  currentCycleCode,
  enrollmentCycles,
  formatDateFr,
  studentMonthPrice,
} from "@/lib/helpers";
import { formatDA } from "@/lib/utils";
import type { AttendanceRecord } from "@/lib/types";

type SlotKind = "present" | "late" | "absent" | "cancelled" | "pending" | "before";

const SLOT_STYLE: Record<SlotKind, { label: string; className: string; icon?: typeof Check }> = {
  present: { label: "Présent", className: "bg-success/15 text-success ring-success/30", icon: Check },
  late: { label: "En retard", className: "bg-warning/15 text-warning ring-warning/30", icon: Clock },
  absent: { label: "Absent", className: "bg-danger/15 text-danger ring-danger/30", icon: X },
  cancelled: {
    label: "Annulée",
    className: "bg-muted/15 text-muted ring-muted/30",
    icon: CalendarX2,
  },
  pending: { label: "À venir", className: "bg-canvas text-muted/60 ring-line" },
  before: { label: "Avant son arrivée", className: "bg-transparent text-muted/30 ring-line/60" },
};

function kindOf(rec: AttendanceRecord | undefined): SlotKind {
  if (!rec) return "pending";
  if (rec.status === "cancelled") return "cancelled";
  if (rec.status === "absent") return "absent";
  if (rec.status === "late") return "late";
  return "present";
}

/** Une pastille de séance : la couleur porte l'état, l'info-bulle la date. */
function Slot({ kind, title, index }: { kind: SlotKind; title: string; index: number }) {
  const style = SLOT_STYLE[kind];
  const Icon = style.icon;
  return (
    <span
      title={title}
      aria-label={title}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ring-1 ${style.className}`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={2.4} /> : index + 1}
    </span>
  );
}

export function CarteLedger({
  studentId,
  /** n'afficher que cet emploi du temps — sinon, tous ceux du chevalier */
  subscriptionId,
}: {
  studentId: string;
  subscriptionId?: string;
}) {
  const db = useData();
  const student = db.students.find((s) => s.id === studentId);

  const subIds = useMemo(() => {
    const all = student?.subscriptionIds ?? [];
    return subscriptionId ? all.filter((id) => id === subscriptionId) : all;
  }, [student, subscriptionId]);

  if (!student || subIds.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        message="Aucune carte pour l'instant."
        hint="Les cartes apparaîtront dès la première inscription à un emploi du temps."
      />
    );
  }

  return (
    <div className="space-y-4">
      {subIds.map((subId) => (
        <SubscriptionLedger key={subId} studentId={studentId} subscriptionId={subId} />
      ))}
    </div>
  );
}

function SubscriptionLedger({
  studentId,
  subscriptionId,
}: {
  studentId: string;
  subscriptionId: string;
}) {
  const db = useData();
  const sub = db.subscriptions.find((s) => s.id === subscriptionId);
  const session = db.sessions.find((s) => s.id === sub?.sessionId);
  const [open, setOpen] = useState(true);

  const cycles = useMemo(
    () => enrollmentCycles(db, studentId, subscriptionId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.attendance, db.payments, db.students, studentId, subscriptionId],
  );

  if (!sub) return null;

  const size = cycleSizeOf(sub);
  const currentCode = currentCycleCode(db, studentId, subscriptionId);
  const monthPrice = studentMonthPrice(db.students.find((s) => s.id === studentId), sub);

  const moduleName = db.modules.find((m) => m.id === session?.moduleId)?.name ?? "Discipline";
  const groupName = db.groups.find((g) => g.id === session?.groupId)?.name ?? "";
  const title = session?.title || moduleName;

  // Le total des quatre états, toutes cartes confondues : c'est le résumé que
  // l'on veut lire AVANT d'ouvrir le détail.
  const tally = { present: 0, late: 0, absent: 0, cancelled: 0 };
  for (const c of cycles) {
    for (const r of c.records) {
      const k = kindOf(r);
      if (k === "present") tally.present += 1;
      else if (k === "late") tally.late += 1;
      else if (k === "absent") tally.absent += 1;
      else if (k === "cancelled") tally.cancelled += 1;
    }
  }

  return (
    <Card>
      <CardBody className="p-0">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 border-b border-line p-4 text-start"
        >
          <div className="min-w-0">
            <h3 className="font-display truncate text-sm font-bold text-ink">{title}</h3>
            <p className="mt-0.5 text-[11px] text-muted">
              {groupName && <>Groupe {groupName} · </>}
              {size} séance(s) par carte
              {monthPrice > 0 && <> · {formatDA(monthPrice)} la carte</>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone="accent">{carteShort(currentCode)} en cours</Badge>
            <ChevronDown
              className={`h-4 w-4 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </div>
        </button>

        {/* Le résumé des quatre états — visible plié comme déplié. */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-b border-line px-4 py-2.5 text-[11px]">
          <span className="text-muted">
            Présences <strong className="text-success tabular-nums">{tally.present}</strong>
          </span>
          <span className="text-muted">
            Retards <strong className="text-warning tabular-nums">{tally.late}</strong>
          </span>
          <span className="text-muted">
            Absences <strong className="text-danger tabular-nums">{tally.absent}</strong>
          </span>
          <span className="text-muted">
            Séances annulées <strong className="text-ink tabular-nums">{tally.cancelled}</strong>
          </span>
        </div>

        {open && (
          <div className="divide-y divide-line">
            {cycles.map((cycle, ci) => {
              /**
               * LES CASES DE LA CARTE.
               *
               * `lead` est le nombre de séances qui se sont tenues AVANT son
               * arrivée : elles ne sont pas les siennes, et les compter comme
               * « pas encore pointées » lui promettrait des séances qu'il
               * n'aura jamais.
               */
              const slots: { kind: SlotKind; title: string }[] = [];
              for (let i = 0; i < cycle.lead; i++) {
                slots.push({ kind: "before", title: "Séance tenue avant son inscription" });
              }
              for (let i = 0; i < size - cycle.lead; i++) {
                const rec = cycle.records[i];
                const kind = kindOf(rec);
                slots.push({
                  kind,
                  title: rec
                    ? `${SLOT_STYLE[kind].label} — ${formatDateFr(rec.timestamp)}`
                    : "Séance à venir",
                });
              }

              const owed = cycle.balance < 0 ? -cycle.balance : 0;
              const isCurrent = cycle.code === currentCode;

              return (
                <motion.div
                  key={cycle.code}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(ci * 0.03, 0.25), duration: 0.26 }}
                  className={`p-4 ${isCurrent ? "bg-accent/5" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Badge tone={isCurrent ? "accent" : "neutral"}>{carteShort(cycle.code)}</Badge>
                      <span className="text-[11px] font-semibold text-ink">
                        {cycle.complete ? "Carte close" : isCurrent ? "Carte en cours" : "Carte à venir"}
                      </span>
                      {cycle.startDate && (
                        <span className="text-[10px] text-muted">
                          {formatDateFr(cycle.startDate)}
                          {cycle.endDate && ` → ${formatDateFr(cycle.endDate)}`}
                        </span>
                      )}
                    </span>

                    <span className="flex items-center gap-3 text-[11px] tabular-nums">
                      <span className="text-muted">
                        Versé <strong className="text-ink">{formatDA(cycle.credited)}</strong>
                      </span>
                      {owed > 0 ? (
                        <Badge tone="danger">Reste {formatDA(owed)}</Badge>
                      ) : cycle.credited > 0 ? (
                        <Badge tone="success">À jour</Badge>
                      ) : null}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {slots.map((slot, i) => (
                      <Slot key={i} kind={slot.kind} title={slot.title} index={i} />
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** La légende des pastilles. Une couleur seule ne dit rien à qui la voit pour
 *  la première fois — et rien du tout à qui ne distingue pas le rouge du vert. */
export function SlotLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted">
      {(["present", "late", "absent", "cancelled", "pending"] as SlotKind[]).map((k) => {
        const style = SLOT_STYLE[k];
        const Icon = style.icon;
        return (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-md ring-1 ${style.className}`}
              aria-hidden="true"
            >
              {Icon && <Icon className="h-3 w-3" strokeWidth={2.4} />}
            </span>
            {style.label}
          </span>
        );
      })}
    </div>
  );
}
