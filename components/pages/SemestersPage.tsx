"use client";

/**
 * SEMESTRES — la saison du club, et tout ce qui se joue dedans.
 *
 * L'écran descend, palier par palier, du plus large au plus précis :
 *
 *   1. LES SEMESTRES — une carte par saison : ses dates, ses chevaliers, ce qui
 *      est rentré, ce qui reste dû. On en crée, on en modifie, on en supprime.
 *   2. SES CATÉGORIES — celles que ses emplois du temps font travailler, avec
 *      les mêmes trois chiffres.
 *   3. LES EMPLOIS DU TEMPS d'une catégorie — mêmes trois chiffres encore.
 *   4. UN EMPLOI DU TEMPS — ses cartes (quand chacune a commencé, quand elle
 *      s'est fermée, ce qu'elle a encaissé), puis la LISTE DE SES CHEVALIERS :
 *      ce que chacun a versé, ce qu'il doit, et de quoi l'encaisser sur place.
 *
 * L'encaissement n'est pas un écran de plus : c'est EXACTEMENT celui de la
 * fiche du chevalier (« Payer & recharger les soldes »). Un règlement fait
 * d'ici est un règlement comme un autre — il descend la dette et apparaît dans
 * son historique de paiements, au même endroit que tous les autres.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Edit,
  Eye,
  Layers,
  MessageCircle,
  PhoneOff,
  Plus,
  Send,
  Shield,
  Swords,
  Trash2,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import { useData } from "@/lib/store/data";
import { useToast } from "@/lib/store/toast";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { SoldManagerModal } from "@/components/students/SoldManagerModal";
import {
  WhatsAppMessageModal,
  type WhatsAppTarget,
} from "@/components/whatsapp/WhatsAppMessageModal";
import { targetFor } from "@/lib/whatsapp/situation";
import { isSendablePhone } from "@/lib/whatsapp/phone";
import { formatDA } from "@/lib/utils";
import { useCan } from "@/lib/usePermissions";
import type { ScheduleSession, Semester, Student } from "@/lib/types";
import {
  carteShort,
  formatDateFr,
  formatDays,
  groupName,
  moduleName as moduleNameOf,
  registrationNumberOf,
  salleName,
  sessionTimeLabel,
  studentName,
  teacherName,
  todayIso,
} from "@/lib/helpers";
import {
  carteLayout,
  carteTotals,
  semesterCategories,
  semesterProgress,
  semesterTotals,
  semestersOf,
  sessionTotals,
  sessionsOfSemester,
  studentSessionMoney,
  studentsOfSession,
  type CarteView,
  type SemesterState,
} from "@/lib/semesters";

const STATE_LABEL: Record<SemesterState, { label: string; tone: "success" | "warning" | "danger" | "primary" | "neutral" }> = {
  upcoming: { label: "À venir", tone: "neutral" },
  running: { label: "En cours", tone: "success" },
  overdue: { label: "Prolongé", tone: "warning" },
  closed: { label: "Terminé", tone: "danger" },
};

/** Où l'écran se trouve dans sa descente. */
type View =
  | { kind: "semesters" }
  | { kind: "categories"; semesterId: string }
  | { kind: "emplois"; semesterId: string; classId: string }
  | { kind: "emploi"; semesterId: string; classId: string; sessionId: string };

export function SemestersPage() {
  const can = useCan("semesters");
  const db = useData();
  const { addToast } = useToast();
  const { saveSemester, deleteSemester, closeSemester, syncCartes } = db;

  const [view, setView] = useState<View>({ kind: "semesters" });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [payTarget, setPayTarget] = useState<Student | null>(null);

  /**
   * L'ENVOI WHATSAPP DEPUIS LA LISTE DES CHEVALIERS.
   *
   * Une seule fenêtre sert les deux usages : un chevalier (un seul élément) ou
   * toute une sélection d'endettés (plusieurs). C'est elle qui compose le
   * message de CHACUN avec SA situation — carte, groupe, horaires, présences —
   * et qui refuse d'envoyer à qui n'a aucun numéro, en le disant.
   */
  const [waTargets, setWaTargets] = useState<WhatsAppTarget[] | null>(null);
  /** Les chevaliers cochés dans la liste d'un emploi du temps. */
  const [picked, setPicked] = useState<string[]>([]);

  /**
   * CE QUE CE COMPTE A LE DROIT DE VOIR EN ARGENT ENCAISSÉ.
   *
   * Sans le droit « Voir l'argent encaissé », les cartes de semestre, de
   * catégorie et d'emploi du temps n'affichent QUE les dettes : un travailleur
   * à qui l'on ouvre cet écran pour qu'il relance les impayés n'a pas à lire le
   * chiffre d'affaires du club. Le détail chevalier par chevalier, lui, reste
   * lisible dans la liste d'un emploi du temps — c'est précisément ce dont il a
   * besoin pour encaisser et pour écrire.
   */
  const showTotals = can("totals");

  /**
   * LES CARTES SE REMETTENT EN PHASE À L'OUVERTURE DE L'ÉCRAN.
   *
   * Une carte prend sa date au pointage, mais rien ne garantit que l'écran de
   * pointage ait été ouvert depuis un autre poste : on relance donc le moteur
   * ici, où les cartes sont lues. Il est idempotent — sans changement à faire,
   * il n'écrit rien.
   */
  useEffect(() => {
    void syncCartes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const semesters = useMemo(
    () => semestersOf(db),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.semesters],
  );

  const openCreate = () => {
    setEditing(null);
    setName("");
    setStartDate(todayIso());
    setEndDate("");
    setDescription("");
    setFormOpen(true);
  };

  const openEdit = (semester: Semester) => {
    setEditing(semester);
    setName(semester.name);
    setStartDate(semester.startDate);
    setEndDate(semester.endDate);
    setDescription(semester.description ?? "");
    setFormOpen(true);
  };

  const problem = !name.trim()
    ? "Donnez un nom au semestre."
    : !startDate || !endDate
      ? "Les deux dates sont nécessaires."
      : endDate < startDate
        ? "La date de fin ne peut pas précéder la date de début."
        : "";

  const submit = async () => {
    if (problem) return;
    const res = await saveSemester({
      id: editing?.id,
      name,
      startDate,
      endDate,
      description,
    });
    if (!res.ok) {
      addToast({ type: "danger", title: "Enregistrement refusé", message: "Vérifiez les dates." });
      return;
    }
    addToast({
      type: "success",
      title: editing ? "Semestre modifié" : "Semestre créé",
      message: `${name.trim()} — du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}.`,
    });
    setFormOpen(false);
  };

  const remove = async (semester: Semester) => {
    const sessions = sessionsOfSemester(db, semester.id, { includeArchived: true }).length;
    const warning =
      `Supprimer le semestre « ${semester.name} » ?\n\n` +
      (sessions > 0
        ? `${sessions} emploi(s) du temps y sont rattachés : ils ne seront PAS effacés — ils perdront simplement leur semestre, et leurs cartes s'en iront avec lui.\n\n`
        : "") +
      "Les présences, les paiements et les soldes des chevaliers ne bougent pas.";
    if (!confirm(warning)) return;
    const res = await deleteSemester(semester.id);
    if (!res.ok) return;
    addToast({
      type: "success",
      title: "Semestre supprimé",
      message: `${res.sessions ?? 0} emploi(s) du temps détaché(s), ${res.cartes ?? 0} carte(s) retirée(s).`,
    });
    setView({ kind: "semesters" });
  };

  const close = async (semester: Semester) => {
    if (
      !confirm(
        `Clore le semestre « ${semester.name} » ?\n\nLe pointage se ferme avec lui : plus aucune présence ne pourra être saisie tant que le semestre suivant n'aura pas été créé.`,
      )
    )
      return;
    await closeSemester(semester.id);
    addToast({
      type: "warning",
      title: "Semestre clos",
      message: "Le pointage est fermé jusqu'à la création du semestre suivant.",
    });
  };

  // -------------------------------------------------------------------------
  //  Les trois chiffres, partout les mêmes
  // -------------------------------------------------------------------------
  const Totals = ({
    students,
    gains,
    debts,
  }: {
    students: number;
    gains: number;
    debts: number;
  }) => (
    <div
      className={`mt-3 grid gap-1.5 border-t border-line pt-3 text-center ${
        showTotals ? "grid-cols-3" : "grid-cols-2"
      }`}
    >
      <div className="rounded-xl bg-primary-50/70 px-1.5 py-2">
        <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">
          Chevaliers
        </span>
        <strong className="block text-sm font-black text-primary tabular-nums">{students}</strong>
      </div>
      {/* L'argent encaissé ne s'affiche QUE pour qui en a le droit. */}
      {showTotals && (
        <div className="rounded-xl bg-success/10 px-1.5 py-2">
          <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">
            Gains
          </span>
          <strong className="block text-sm font-black text-success tabular-nums">
            {formatDA(gains)}
          </strong>
        </div>
      )}
      <div
        className={`rounded-xl px-1.5 py-2 ${debts > 0 ? "bg-danger/10" : "bg-canvas/60"}`}
      >
        <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">Dettes</span>
        <strong
          className={`block text-sm font-black tabular-nums ${
            debts > 0 ? "text-danger" : "text-muted"
          }`}
        >
          {formatDA(debts)}
        </strong>
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  //  1. Les semestres
  // -------------------------------------------------------------------------
  const renderSemesters = () => (
    <>
      {semesters.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          message="Aucun semestre pour le moment."
          hint="Un semestre est la saison du club : un nom, une date de début, une date de fin. Tout ce qui se joue entre les deux — emplois du temps, cartes, chevaliers, argent — s'y range tout seul."
          action={
            can("create") ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" /> Nouveau semestre
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {semesters.map((semester, i) => {
            const totals = semesterTotals(db, semester.id);
            const progress = semesterProgress(db, semester);
            const state = STATE_LABEL[progress.state];
            const extended =
              !!semester.plannedEndDate && semester.plannedEndDate !== semester.endDate;
            return (
              <motion.div
                key={semester.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.32), duration: 0.3 }}
              >
                <Card
                  className={`h-full ${
                    progress.state === "closed"
                      ? "border-2 border-danger/40"
                      : progress.state === "overdue"
                        ? "border-2 border-warning/50"
                        : ""
                  }`}
                >
                  <CardBody className="flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Badge tone={state.tone}>{state.label}</Badge>
                          <h3 className="font-display mt-2 truncate text-lg font-bold text-ink">
                            {semester.name}
                          </h3>
                          <span className="block text-[11px] text-muted">
                            Du {formatDateFr(semester.startDate)} au {formatDateFr(semester.endDate)}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {can("edit") && (
                            <button
                              onClick={() => openEdit(semester)}
                              aria-label={`Modifier ${semester.name}`}
                              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-primary-50 hover:text-ink"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                          {can("delete") && (
                            <button
                              onClick={() => remove(semester)}
                              aria-label={`Supprimer ${semester.name}`}
                              className="rounded-lg p-1.5 text-danger transition-colors hover:bg-danger/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {semester.description && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted">
                          {semester.description}
                        </p>
                      )}

                      {/* LA PROLONGATION : une carte a débordé, la date de fin a
                          été repoussée d'elle-même. On le dit, avec l'écart. */}
                      {extended && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-warning/40 bg-warning/10 p-2 text-[10px] leading-relaxed text-warning">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Fin repoussée : annoncée le{" "}
                            <strong>{formatDateFr(semester.plannedEndDate)}</strong>, portée au{" "}
                            <strong>{formatDateFr(semester.endDate)}</strong> — une carte décalée
                            devait encore donner sa dernière séance.
                          </span>
                        </p>
                      )}

                      {progress.state === "closed" && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-danger/40 bg-danger/10 p-2 text-[10px] leading-relaxed text-danger">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Semestre terminé le {formatDateFr(semester.closedAt)} — toutes les
                            cartes ont donné leurs séances. <strong>Le pointage est fermé</strong>{" "}
                            tant que le semestre suivant n&apos;est pas créé.
                          </span>
                        </p>
                      )}

                      {progress.state === "overdue" && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-warning/40 bg-warning/10 p-2 text-[10px] leading-relaxed text-warning">
                          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Date de fin dépassée, mais {progress.pending} emploi(s) du temps ont
                            encore une carte en cours : le semestre ne se ferme pas avant qu&apos;ils
                            aient fini.
                          </span>
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <Badge tone="neutral">{progress.sessions} emploi(s) du temps</Badge>
                        <Badge tone={progress.pending > 0 ? "warning" : "success"}>
                          {progress.finished} fini(s) · {progress.pending} en cours
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <Totals {...totals} />
                      <div className="mt-3 flex gap-2">
                        {can("view") && (
                          <Button
                            size="sm"
                            className="flex-1 gap-1.5"
                            onClick={() =>
                              setView({ kind: "categories", semesterId: semester.id })
                            }
                          >
                            <Eye className="h-3.5 w-3.5" /> Voir les détails
                          </Button>
                        )}
                        {can("close") && progress.completable && !semester.closedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => close(semester)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Clore
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );

  // -------------------------------------------------------------------------
  //  2. Les catégories d'un semestre
  // -------------------------------------------------------------------------
  const renderCategories = (semesterId: string) => {
    const semester = db.semesters.find((s) => s.id === semesterId);
    if (!semester) return null;
    const categories = semesterCategories(db, semesterId);
    return (
      <>
        <Crumb
          onBack={() => setView({ kind: "semesters" })}
          backLabel="Semestres"
          trail={[semester.name]}
        />
        {categories.length === 0 ? (
          <EmptyState
            icon={Shield}
            message="Aucune catégorie sur ce semestre."
            hint="Rattachez des emplois du temps à ce semestre depuis l'écran « Emplois du temps » : leurs catégories apparaîtront ici."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((cat, i) => (
              <motion.div
                key={cat.classId || "none"}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.32), duration: 0.3 }}
              >
                <Card className="h-full">
                  <CardBody className="flex h-full flex-col justify-between">
                    <div>
                      <Badge tone="accent">Catégorie</Badge>
                      <h3 className="font-display mt-2 truncate text-lg font-bold text-ink">
                        {cat.name}
                      </h3>
                      <span className="text-[11px] text-muted">
                        {cat.sessions.length} emploi(s) du temps sur ce semestre
                      </span>
                    </div>
                    <div>
                      <Totals {...cat.totals} />
                      <Button
                        size="sm"
                        className="mt-3 w-full gap-1.5"
                        onClick={() =>
                          setView({ kind: "emplois", semesterId, classId: cat.classId })
                        }
                      >
                        <Eye className="h-3.5 w-3.5" /> Voir les détails
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </>
    );
  };

  // -------------------------------------------------------------------------
  //  3. Les emplois du temps d'une catégorie
  // -------------------------------------------------------------------------
  const sessionTitle = (s: ScheduleSession) =>
    s.title || moduleNameOf(db, s.moduleId) || "Emploi du temps";

  const renderEmplois = (semesterId: string, classId: string) => {
    const semester = db.semesters.find((s) => s.id === semesterId);
    if (!semester) return null;
    const cat = semesterCategories(db, semesterId).find((c) => c.classId === classId);
    const sessions = cat?.sessions ?? [];
    return (
      <>
        <Crumb
          onBack={() => setView({ kind: "categories", semesterId })}
          backLabel="Catégories"
          trail={[semester.name, cat?.name ?? "Catégorie"]}
        />
        {sessions.length === 0 ? (
          <EmptyState icon={Layers} message="Aucun emploi du temps dans cette catégorie." />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session, i) => {
              const totals = sessionTotals(db, session.id);
              const cartes = carteLayout(db, session.id);
              const current = cartes.find((c) => !c.complete) ?? cartes[cartes.length - 1];
              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.32), duration: 0.3 }}
                >
                  <Card className="h-full">
                    <CardBody className="flex h-full flex-col justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="primary">{formatDays(session.days) || "—"}</Badge>
                          {current && (
                            <Badge tone={current.complete ? "success" : "warning"}>
                              {carteShort(current.carte.code)} · {current.held}/{current.size}
                            </Badge>
                          )}
                          {cartes.length === 0 && <Badge tone="neutral">Aucune carte ouverte</Badge>}
                        </div>
                        <h3 className="font-display mt-2 truncate text-base font-bold text-ink">
                          {sessionTitle(session)}
                        </h3>
                        <span className="block text-[11px] text-muted">
                          Groupe {groupName(db, session.groupId)} · {session.startTime}–
                          {session.endTime} · {salleName(db, session.salleId)}
                        </span>
                        <span className="block text-[11px] text-muted">
                          {teacherName(db, session.teacherId)}
                        </span>
                      </div>
                      <div>
                        <Totals {...totals} />
                        <Button
                          size="sm"
                          className="mt-3 w-full gap-1.5"
                          onClick={() =>
                            setView({ kind: "emploi", semesterId, classId, sessionId: session.id })
                          }
                        >
                          <Eye className="h-3.5 w-3.5" /> Voir les détails
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  // -------------------------------------------------------------------------
  //  4. Un emploi du temps : ses cartes, puis ses chevaliers
  // -------------------------------------------------------------------------
  const renderEmploi = (semesterId: string, classId: string, sessionId: string) => {
    const semester = db.semesters.find((s) => s.id === semesterId);
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!semester || !session) return null;
    const cat = semesterCategories(db, semesterId).find((c) => c.classId === classId);
    const cartes = carteLayout(db, sessionId);
    const students = studentsOfSession(db, sessionId);
    const totals = sessionTotals(db, sessionId);
    const currentCarte = cartes.find((c) => !c.complete) ?? cartes[cartes.length - 1];

    /**
     * LA LIGNE DE CHAQUE CHEVALIER, MONTÉE UNE FOIS.
     *
     * Le tableau et l'envoi WhatsApp lisent la MÊME ligne : ce qui s'affiche à
     * l'écran est exactement ce que le message racontera. Deux calculs séparés
     * finiraient par se contredire, et un rappel de dette qui contredit le
     * tableau du comptoir est pire que pas de rappel du tout.
     */
    const rows = students.map((st) => {
      const money = studentSessionMoney(db, st.id, sessionId);
      const parent = st.parentId ? db.parents.find((p) => p.id === st.parentId) : undefined;
      let presences = 0;
      let absences = 0;
      for (const a of db.attendance) {
        if (a.studentId !== st.id || a.sessionId !== sessionId) continue;
        if (a.status === "absent") absences += 1;
        else if (a.status !== "cancelled") presences += 1;
      }
      const reachable = isSendablePhone(st.phone) || isSendablePhone(parent?.phone);
      return { student: st, money, parent, presences, absences, reachable };
    });

    const debtors = rows.filter((r) => r.money.debts > 0);
    const pickedRows = rows.filter((r) => picked.includes(r.student.id));
    const openWhatsApp = (list: typeof rows) => {
      if (list.length === 0) return;
      setWaTargets(
        list.map((r) => targetFor(db, r.student, session, { semesterId, classId })),
      );
    };

    return (
      <>
        <Crumb
          onBack={() => setView({ kind: "emplois", semesterId, classId })}
          backLabel="Emplois du temps"
          trail={[semester.name, cat?.name ?? "Catégorie", sessionTitle(session)]}
        />

        {/* LE RAPPEL DE CE QU'ON REGARDE — c'est aussi ce que les messages
            enverront, et le lire ici évite d'aller le vérifier ailleurs. */}
        <Card className="mb-4">
          <CardBody className="grid grid-cols-2 gap-2 py-3 text-[11px] sm:grid-cols-3 lg:grid-cols-6">
            <Meta label="Semestre" value={semester.name} />
            <Meta label="Catégorie" value={cat?.name ?? "—"} />
            <Meta label="Groupe" value={groupName(db, session.groupId) || "—"} />
            <Meta label="Jours" value={formatDays(session.days) || "—"} />
            <Meta label="Horaire" value={sessionTimeLabel(session)} />
            <Meta
              label="Carte en cours"
              value={
                currentCarte
                  ? `${carteShort(currentCarte.carte.code)} · ${currentCarte.held}/${currentCarte.size}`
                  : "—"
              }
            />
          </CardBody>
        </Card>

        <div
          className={`mb-6 grid grid-cols-1 gap-3 ${showTotals ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
        >
          <SmallStat icon={Swords} label="Chevaliers" value={String(totals.students)} tone="primary" />
          {showTotals && (
            <SmallStat
              icon={Coins}
              label="Total des gains"
              value={formatDA(totals.gains)}
              tone="success"
            />
          )}
          <SmallStat
            icon={TrendingDown}
            label="Total des dettes"
            value={formatDA(totals.debts)}
            tone={totals.debts > 0 ? "danger" : "neutral"}
          />
        </div>

        {/* ---- Les cartes de l'emploi du temps ---- */}
        <Card className="mb-6">
          <CardBody>
            <h3 className="font-display mb-1 text-sm font-bold text-ink">
              Les cartes de cet emploi du temps
            </h3>
            <p className="mb-3 text-[11px] leading-relaxed text-muted">
              Une carte commence au jour de sa <strong>première présence</strong> — pas à la date
              annoncée — et se ferme sur la séance qui complète le pack. La suivante n&apos;existe
              pas avant. Une séance annulée pour tout le groupe ne compte pas : elle se rejoue la
              semaine d&apos;après, et la carte finit simplement plus tard.
            </p>
            {cartes.length === 0 ? (
              <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning">
                Aucune carte ouverte sur cet emploi du temps. Rattachez-le à un semestre et fixez la
                date de début de sa 1<sup>re</sup> carte depuis l&apos;écran « Emplois du temps ».
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {cartes.map((v) => (
                  <CarteCard
                    key={v.carte.id}
                    view={v}
                    totals={carteTotals(db, v)}
                    showGains={showTotals}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* ---- La liste des chevaliers ---- */}
        <Card>
          <CardBody>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-ink">
                Les chevaliers de cet emploi du temps ({students.length})
                {debtors.length > 0 && (
                  <Badge tone="danger" className="ms-2 align-middle text-[10px]">
                    {debtors.length} en dette
                  </Badge>
                )}
              </h3>

              {/* ---- L'ENVOI GROUPÉ ----
                  Cocher les endettés puis écrire à tous en un geste : c'est
                  l'usage qui a motivé cet écran. Chaque chevalier reçoit SON
                  message, composé avec SA situation — jamais un texte commun
                  qui ne dirait rien de précis à personne. */}
              {can("whatsapp") && students.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() =>
                      setPicked(
                        picked.length === debtors.length && debtors.length > 0
                          ? []
                          : debtors.map((r) => r.student.id),
                      )
                    }
                    disabled={debtors.length === 0}
                  >
                    <Users className="h-3.5 w-3.5" />
                    {picked.length === debtors.length && debtors.length > 0
                      ? "Tout décocher"
                      : `Cocher les ${debtors.length} endettés`}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={pickedRows.length === 0}
                    onClick={() => openWhatsApp(pickedRows)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Écrire aux {pickedRows.length} cochés
                  </Button>
                </div>
              )}
            </div>

            {students.length === 0 ? (
              <p className="py-8 text-center text-xs italic text-muted">
                Aucun chevalier inscrit sur cet emploi du temps.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead className="bg-canvas/60">
                    <tr className="text-start text-[10px] uppercase tracking-wide text-muted">
                      {can("whatsapp") && <th className="w-8 px-2 py-2.5" />}
                      <th className="px-3 py-2.5 text-start">N°</th>
                      <th className="px-3 py-2.5 text-start">Chevalier</th>
                      <th className="px-3 py-2.5 text-start">Téléphone</th>
                      <th className="px-3 py-2.5 text-start">Parent</th>
                      <th className="px-3 py-2.5 text-start">Groupe</th>
                      <th className="px-3 py-2.5 text-start">Carte</th>
                      <th className="px-3 py-2.5 text-center">Présences</th>
                      <th className="px-3 py-2.5 text-center">Absences</th>
                      <th className="px-3 py-2.5 text-end">Total payé</th>
                      <th className="px-3 py-2.5 text-end">Solde</th>
                      <th className="px-3 py-2.5 text-end">Dette</th>
                      <th className="px-3 py-2.5 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const { student: st, money, parent } = row;
                      const checked = picked.includes(st.id);
                      return (
                        <tr
                          key={st.id}
                          className={`border-t border-line/60 ${
                            money.debts > 0 ? "bg-danger/5" : "hover:bg-primary-50/30"
                          }`}
                        >
                          {can("whatsapp") && (
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setPicked((prev) =>
                                    prev.includes(st.id)
                                      ? prev.filter((x) => x !== st.id)
                                      : [...prev, st.id],
                                  )
                                }
                                aria-label={`Sélectionner ${studentName(st)}`}
                                className="h-4 w-4 rounded border-line bg-surface text-primary focus:ring-primary"
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 font-mono text-muted">
                            {registrationNumberOf(db, st)}
                          </td>
                          <td className="px-3 py-2 font-semibold text-ink">{studentName(st)}</td>
                          <td className="px-3 py-2 text-muted">
                            {st.phone || <span className="italic">aucun</span>}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {parent ? (
                              <span className="block leading-tight">
                                {parent.firstName} {parent.lastName}
                                <span className="block text-[10px] opacity-80">
                                  {parent.phone || "aucun numéro"}
                                </span>
                              </span>
                            ) : (
                              <span className="italic">non rattaché</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {groupName(db, session.groupId) || "—"}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {currentCarte
                              ? `${carteShort(currentCarte.carte.code)} · ${currentCarte.held}/${currentCarte.size}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-success">
                            {row.presences}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-danger">
                            {row.absences || "—"}
                          </td>
                          {/* LE DÉTAIL PAR CHEVALIER RESTE LISIBLE MÊME SANS LE
                              DROIT « voir l'argent encaissé » : c'est ce qu'il
                              faut pour encaisser et pour relancer. Seuls les
                              TOTAUX des cartes de l'écran sont masqués. */}
                          <td className="px-3 py-2 text-end font-mono text-success">
                            {formatDA(money.gains)}
                          </td>
                          <td
                            className={`px-3 py-2 text-end font-mono ${
                              money.sold < 0 ? "text-danger" : "text-ink"
                            }`}
                          >
                            {formatDA(money.sold)}
                          </td>
                          <td className="px-3 py-2 text-end font-mono">
                            {money.debts > 0 ? (
                              <strong className="text-danger">{formatDA(money.debts)}</strong>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {can("whatsapp") &&
                                (row.reachable ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5"
                                    title="Écrire au chevalier ET à son parent"
                                    onClick={() => openWhatsApp([row])}
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" /> Message
                                  </Button>
                                ) : (
                                  /* NI LUI NI SON PARENT N'ONT DE NUMÉRO : on
                                     l'annonce à l'endroit où l'on aurait cliqué,
                                     plutôt que d'ouvrir une fenêtre qui ne peut
                                     rien envoyer. */
                                  <span
                                    title={
                                      parent
                                        ? "Ni le chevalier ni son parent n'ont de numéro exploitable."
                                        : "Ce chevalier n'a pas de numéro et n'est rattaché à aucun parent."
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border border-danger/35 bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger"
                                  >
                                    <PhoneOff className="h-3 w-3" /> Injoignable
                                  </span>
                                ))}
                              {can("pay") && (
                                <Button
                                  size="sm"
                                  variant={money.debts > 0 ? "danger" : "outline"}
                                  className="gap-1.5"
                                  onClick={() => setPayTarget(st)}
                                >
                                  <Wallet className="h-3.5 w-3.5" />
                                  {money.debts > 0 ? "Payer la dette" : "Recharger"}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-line bg-canvas/60">
                    <tr className="text-[11px] font-bold text-ink">
                      <td colSpan={can("whatsapp") ? 9 : 8} className="px-3 py-2.5 text-end">
                        Totaux de cet emploi du temps
                      </td>
                      <td className="px-3 py-2.5 text-end font-mono text-success">
                        {formatDA(rows.reduce((s, r) => s + r.money.gains, 0))}
                      </td>
                      <td className="px-3 py-2.5 text-end font-mono">
                        {formatDA(rows.reduce((s, r) => s + r.money.sold, 0))}
                      </td>
                      <td className="px-3 py-2.5 text-end font-mono text-danger">
                        {formatDA(rows.reduce((s, r) => s + r.money.debts, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </>
    );
  };

  return (
    <div>
      <PageHeader
        icon={CalendarRange}
        title="Semestres"
        subtitle="Les saisons du club : leurs catégories, leurs emplois du temps, leurs cartes et leur argent"
        actions={
          can("create") && view.kind === "semesters" ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nouveau semestre
            </Button>
          ) : undefined
        }
      />

      {view.kind === "semesters" && renderSemesters()}
      {view.kind === "categories" && renderCategories(view.semesterId)}
      {view.kind === "emplois" && renderEmplois(view.semesterId, view.classId)}
      {view.kind === "emploi" &&
        renderEmploi(view.semesterId, view.classId, view.sessionId)}

      {/* ---- Création / modification ---- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Modifier le semestre" : "Nouveau semestre"}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={!!problem}>
              {editing ? "Enregistrer" : "Créer le semestre"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="sem-name" className="mb-1.5 block text-xs font-semibold text-muted">
              Nom du semestre <span className="text-danger">*</span>
            </label>
            <Input
              id="sem-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Saison 2026-2027 — 1er semestre"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sem-from" className="mb-1.5 block text-xs font-semibold text-muted">
                Date de début <span className="text-danger">*</span>
              </label>
              <Input
                id="sem-from"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="sem-to" className="mb-1.5 block text-xs font-semibold text-muted">
                Date de fin <span className="text-danger">*</span>
              </label>
              <Input
                id="sem-to"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="sem-desc" className="mb-1.5 block text-xs font-semibold text-muted">
              Description
            </label>
            <textarea
              id="sem-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Ce que cette saison recouvre, ses objectifs…"
              className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none"
            />
          </div>

          <p className="rounded-xl border border-primary/25 bg-primary-50/40 p-2.5 text-[10px] leading-relaxed text-muted">
            La date de fin est ce que le club <strong className="text-ink">annonce</strong>. Elle
            sera <strong className="text-ink">repoussée d&apos;elle-même</strong> si une carte
            décalée — une séance annulée pour tout un groupe — doit encore donner sa dernière
            séance après elle. Le semestre ne se ferme jamais sur une carte inachevée.
          </p>

          {problem && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
              {problem}
            </p>
          )}
        </div>
      </Modal>

      {/* L'ENCAISSEMENT — exactement celui de la fiche du chevalier. */}
      {payTarget && (
        <SoldManagerModal
          student={db.students.find((s) => s.id === payTarget.id) ?? payTarget}
          open
          onClose={() => setPayTarget(null)}
        />
      )}

      {/* L'ENVOI WHATSAPP — un chevalier, ou toute la sélection d'endettés. */}
      {waTargets && (
        <WhatsAppMessageModal
          onClose={() => setWaTargets(null)}
          targets={waTargets}
          origin="semesters"
          title={
            waTargets.length > 1
              ? `Écrire à ${waTargets.length} chevaliers`
              : "Envoyer un message WhatsApp"
          }
        />
      )}
    </div>
  );
}

/** Un repère de contexte : ce qu'on regarde, en deux lignes serrées. */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <strong className="block truncate text-xs text-ink">{value}</strong>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Les pièces d'écran
// ---------------------------------------------------------------------------

function Crumb({
  onBack,
  backLabel,
  trail,
}: {
  onBack: () => void;
  backLabel: string;
  trail: string[];
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
      </Button>
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
        {trail.map((step, i) => (
          <span key={`${step}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            <strong className={i === trail.length - 1 ? "text-ink" : ""}>{step}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function SmallStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  tone: "primary" | "success" | "danger" | "neutral";
}) {
  const ring = {
    primary: "border-primary/30 bg-primary-50/50 text-primary",
    success: "border-success/30 bg-success/10 text-success",
    danger: "border-danger/40 bg-danger/10 text-danger",
    neutral: "border-line bg-canvas/50 text-muted",
  }[tone];
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3.5 ${ring}`}>
      <Icon className="h-6 w-6 shrink-0 opacity-70" />
      <div className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80">
          {label}
        </span>
        <strong className="block text-lg font-black tabular-nums">{value}</strong>
      </div>
    </div>
  );
}

/** Une carte de l'emploi du temps : ses dates, son avancement, son argent. */
function CarteCard({
  view,
  totals,
  showGains,
}: {
  view: CarteView;
  totals: { students: number; gains: number; debts: number };
  /** l'encaissé ne s'affiche que pour qui a le droit de le lire */
  showGains: boolean;
}) {
  const { carte } = view;
  const tone = view.complete ? "success" : view.running ? "warning" : "neutral";
  const label = view.complete ? "Close" : view.running ? "En cours" : "À venir";
  return (
    <div
      className={`rounded-2xl border-2 p-3 ${
        view.complete
          ? "border-success/35 bg-success/5"
          : view.running
            ? "border-warning/45 bg-warning/5"
            : "border-line bg-canvas/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="text-base font-black text-ink">{carteShort(carte.code)}</strong>
        <Badge tone={tone}>{label}</Badge>
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-lg font-black tabular-nums text-ink">{view.held}</span>
        <span className="text-[11px] text-muted">/ {view.size} séances</span>
      </div>

      <div className="mt-1.5 space-y-0.5 text-[10px] text-muted">
        <div>
          Début :{" "}
          {view.startDate ? (
            <strong className="text-ink">{formatDateFr(view.startDate)}</strong>
          ) : (
            <span>
              prévu le {formatDateFr(carte.plannedStartDate)}{" "}
              <em>— pas encore pointée</em>
            </span>
          )}
        </div>
        <div>
          Fin :{" "}
          {view.endDate ? (
            <strong className="text-ink">{formatDateFr(view.endDate)}</strong>
          ) : (
            "—"
          )}
        </div>
        {view.postponed.length > 0 && (
          <div className="text-warning">
            {view.postponed.length} séance(s) annulée(s) pour tout le groupe, décalée(s) :{" "}
            {view.postponed.map((d) => formatDateFr(d)).join(" · ")}
          </div>
        )}
      </div>

      <div
        className={`mt-2 grid gap-1.5 border-t border-line pt-2 text-center ${
          showGains ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {showGains && (
          <div>
            <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">
              Encaissé
            </span>
            <strong className="block text-xs font-black text-success tabular-nums">
              {formatDA(totals.gains)}
            </strong>
          </div>
        )}
        <div>
          <span className="block text-[9px] font-bold uppercase tracking-wide text-muted">
            Reste dû
          </span>
          <strong
            className={`block text-xs font-black tabular-nums ${
              totals.debts > 0 ? "text-danger" : "text-muted"
            }`}
          >
            {formatDA(totals.debts)}
          </strong>
        </div>
      </div>
    </div>
  );
}
