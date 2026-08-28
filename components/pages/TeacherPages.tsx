"use client";

/**
 * LE COMPTE D'UN ENTRAÎNEUR — ce qu'il voit, et ce qu'il ne peut pas faire.
 *
 * Son compte est un écran de LECTURE sur sa propre activité. Il y retrouve
 * exactement les mêmes chiffres que ceux dont l'administration se sert pour le
 * régler — même modèle, même calcul, mêmes tables — mais aucun des gestes qui
 * les produisent : pas d'encaissement, pas de règlement, pas de correction.
 *
 *   · TABLEAU DE BORD  — sa journée (navigable jour par jour), sa paie en un
 *     coup d'œil, et les chevaliers qui lui retiennent son argent ;
 *   · EMPLOI DU TEMPS  — sa semaine, une couleur par groupe ;
 *   · PRÉSENCES        — le pointage de ses séances ;
 *   · MATIÈRES         — les supports qu'il publie à ses chevaliers ;
 *   · MA PAIE          — l'écran de règlement du guichet, en lecture seule :
 *     ses emplois du temps → ses carte M1…M12 → le détail d'une carte ;
 *   · MES CATÉGORIES      — la liste des chevaliers, groupe par groupe.
 *
 * Partout où un groupe apparaît, un clic ouvre SA liste de chevaliers — et rien
 * d'autre : c'est la seule action qu'un entraîneur a sur un groupe.
 */

import { useMemo, useState } from "react";
import { useData } from "@/lib/store/data";
import { dayKeyOf } from "@/lib/helpers";
import { useSession } from "@/lib/store/session";
import { changeOwnPassword } from "@/lib/accounts/users";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { TeacherDashboard } from "@/components/teachers/TeacherDashboard";
import { TeacherScheduleBoard } from "@/components/teachers/TeacherScheduleBoard";
import { TeacherPayCenterView } from "@/components/teachers/TeacherPayCenterView";
import { TeacherGroupRoster } from "@/components/teachers/TeacherGroupRoster";
import { payEmplois } from "@/lib/teacherPayBoard";
import type { TeacherEmploi } from "@/lib/teacherMonths";
import { AlertTriangle, ChevronRight, FileText, Megaphone, Plus, Trash2, Upload, User, UserCheck, Users } from "lucide-react";
import type { Teacher, ScheduleSession, Student, AttendanceStatus } from "@/lib/types";
import { formatDA } from "@/lib/utils";

interface PageProps {
  slug: string;
}

export function TeacherPages({ slug }: PageProps) {
  const { user, updateUser } = useSession();
  const {
    teachers,
    sessions,
    modules,
    classes,
    groups,
    announcements,
    students,
    attendance,
    push,
    deleteFrom,
    updateItem,
  } = useData();

  const teacher = teachers.find((t) => t.id === user?.entityId);

  if (!teacher) {
    return (
      <div className="p-8 text-center text-xs">
        <AlertTriangle className="h-8 w-8 text-danger mx-auto mb-2" />
        <h3 className="font-bold text-ink">Erreur de Profil</h3>
        <p className="text-muted mt-1">Impossible de charger le profil de l&apos;entraîneur. Veuillez vous reconnecter.</p>
      </div>
    );
  }

  // Helpers
  const getSessionInfo = (s: ScheduleSession) => {
    const cl = classes.find((c) => c.id === s.classId)?.name ?? "";
    const mod = modules.find((m) => m.id === s.moduleId)?.name ?? "";
    const gr = groups.find((g) => g.id === s.groupId)?.name ?? "";
    return { classLabel: cl, moduleLabel: mod, groupLabel: gr, ...s };
  };

  const teacherSessions = sessions.filter((s) => s.teacherId === teacher.id);

  switch (slug) {
    case "dashboard":
      return <TeacherDashboard teacher={teacher} />;
    case "schedule":
      return <TeacherScheduleBoard teacher={teacher} />;
    case "attendance":
      return (
        <TeacherAttendanceView
          teacher={teacher}
          teacherSessions={teacherSessions}
          getSessionInfo={getSessionInfo}
          students={students}
          attendance={attendance}
          push={push}
          updateItem={updateItem}
        />
      );
    case "salary":
      return <TeacherPayCenterView teacher={teacher} />;
    case "my-classes":
      return <TeacherClassesView teacher={teacher} />;
    case "announcements":
      return <TeacherAnnouncementsView announcements={announcements} />;
    case "profile":
      return <TeacherProfileView teacher={teacher} updateItem={updateItem} updateUser={updateUser} user={user} />;
    default:
      return <div className="p-4 text-xs text-muted">Page non trouvée</div>;
  }
}
// ----------------------------------------------------
// 3. ATTENDANCE VIEW
// ----------------------------------------------------
function TeacherAttendanceView({
  teacherSessions,
  getSessionInfo,
  students,
  attendance,
}: {
  teacher: Teacher;
  teacherSessions: ScheduleSession[];
  getSessionInfo: (s: ScheduleSession) => any;
  students: Student[];
  attendance: any[];
  push: any;
  updateItem: any;
}) {
  const setPresence = useData((s) => s.setPresence);
  const [activeSession, setActiveSession] = useState<ScheduleSession | null>(null);

  // Enrolled students for selected session group
  const getEnrolledStudents = (s: ScheduleSession) => {
    return students.filter((st) =>
      st.subscriptionIds.some((subId) => {
        const sub = useData.getState().subscriptions.find((x) => x.id === subId);
        return sub?.sessionId === s.id;
      })
    );
  };

  const getStudentStatusForSessionToday = (sid: string, sesId: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const record = attendance.find(
      (a) => a.studentId === sid && a.sessionId === sesId && a.timestamp.startsWith(todayStr)
    );
    return record?.status || null;
  };

  /** One entry point for every presence: the store rule decides what a presence
   *  costs (one séance) and what the teacher earns for it, so the teacher's own
   *  sheet can never drift from reception's. */
  const handleToggleAttendance = (student: Student, session: ScheduleSession, status: AttendanceStatus) => {
    const todayStr = new Date().toLocaleDateString("fr-CA");
    const existing = attendance.find(
      (a) => a.studentId === student.id && a.sessionId === session.id && dayKeyOf(a.timestamp) === todayStr,
    );
    // Clicking the status already written takes it back — same "retour" the
    // reception sheet offers.
    void setPresence({
      studentId: student.id,
      sessionId: session.id,
      date: todayStr,
      status: existing && existing.status === status ? null : status,
    });
  };

  return (
    <div className="space-y-6 text-xs">
      <PageHeader icon={UserCheck} title="Appel & Présences" subtitle="Validez la présence des chevaliers de vos groupes aujourd'hui" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sessions list */}
        <div className="space-y-3">
          <span className="font-bold text-ink uppercase tracking-wider block text-[10px]">Sélectionner un Groupe</span>
          {teacherSessions.map((s) => {
            const info = getSessionInfo(s);
            const isSel = activeSession?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSession(s)}
                className={`w-full text-start p-3 rounded-2xl border transition-all ${
                  isSel ? "border-primary bg-primary-50/15" : "border-line bg-surface hover:bg-primary-50/20"
                }`}
              >
                <strong className="text-ink block">{info.moduleLabel}</strong>
                <span className="text-[10px] text-muted block mt-0.5">{info.classLabel} ({info.groupLabel})</span>
                <span className="text-primary block font-mono font-bold mt-1 text-[9px]">{s.startTime} - {s.endTime}</span>
              </button>
            );
          })}
        </div>

        {/* Student list checkoff */}
        <div className="md:col-span-2 space-y-3">
          {activeSession ? (
            <Card>
              <CardBody className="space-y-4">
                <h3 className="font-bold text-ink border-b border-line pb-3">
                  Appel : {getSessionInfo(activeSession).moduleLabel} ({getSessionInfo(activeSession).groupLabel})
                </h3>

                <div className="space-y-2">
                  {getEnrolledStudents(activeSession).length === 0 ? (
                    <p className="text-xs text-muted italic p-4 text-center">Aucun chevalier inscrit dans ce groupe.</p>
                  ) : (
                    getEnrolledStudents(activeSession).map((st) => {
                      const status = getStudentStatusForSessionToday(st.id, activeSession.id);
                      return (
                        <div key={st.id} className="flex justify-between items-center p-3 bg-canvas/30 rounded-xl border border-line">
                          <div>
                            <strong className="text-ink text-xs block">{st.firstName} {st.lastName}</strong>
                            <span className="text-[9px] text-muted font-mono block">RFID: {st.rfid}</span>
                          </div>

                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant={status === "present" ? "primary" : "outline"}
                              onClick={() => handleToggleAttendance(st, activeSession, "present")}
                            >
                              Présent
                            </Button>
                            <Button
                              size="sm"
                              variant={status === "late" ? "secondary" : "outline"}
                              onClick={() => handleToggleAttendance(st, activeSession, "late")}
                            >
                              En Retard
                            </Button>
                            <Button
                              size="sm"
                              variant={status === "absent" ? "danger" : "outline"}
                              onClick={() => handleToggleAttendance(st, activeSession, "absent")}
                              className={status === "absent" ? "bg-danger text-white hover:bg-danger/90" : ""}
                            >
                              Absent
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardBody>
            </Card>
          ) : (
            <div className="bg-canvas border border-line border-dashed p-8 rounded-2xl text-center text-muted">
              Veuillez sélectionner un groupe dans la colonne de gauche pour faire l'appel.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 6. MY CATÉGORIES VIEW
// ----------------------------------------------------
/**
 * MES GROUPES — la même carte que partout ailleurs, et la même liste.
 *
 * L'entraîneur retrouve ici, en grand, ce que son tableau de bord lui montre en
 * bas de page : chacun de ses emplois du temps, avec son effectif, son carte en
 * cours et ses retardataires. Un clic ouvre la liste des chevaliers — en lecture
 * seule, comme partout dans son compte.
 */
function TeacherClassesView({ teacher }: { teacher: Teacher }) {
  const db = useData();
  const [openEmploi, setOpenEmploi] = useState<TeacherEmploi | null>(null);

  const emplois = useMemo(
    () => payEmplois(db, teacher.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      teacher.id,
      db.sessions,
      db.attendance,
      db.unpaidTeacher,
      db.payments,
      db.enrollments,
      db.students,
      db.subscriptions,
      db.independent,
      db.teacherPayments,
    ],
  );

  const roster = emplois.reduce((s, e) => s + e.rosterCount, 0);
  const inDebt = emplois.reduce((s, e) => s + e.studentsInDebt, 0);

  return (
    <div className="space-y-5 text-xs">
      <PageHeader
        icon={Users}
        title="Mes catégories & groupes"
        subtitle="Consultez la liste des chevaliers inscrits à chacun de vos cours"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ClassStat label="Groupes" value={String(emplois.length)} tone="text-primary" />
        <ClassStat label="Chevaliers suivis" value={String(roster)} tone="text-ink" />
        <ClassStat
          label="En retard de paiement"
          value={String(inDebt)}
          tone={inDebt > 0 ? "text-danger" : "text-muted"}
        />
        <ClassStat
          label="Payable maintenant"
          value={formatDA(emplois.reduce((s, e) => s + e.payable, 0))}
          tone="text-success"
        />
      </div>

      {emplois.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line py-14 text-center text-xs font-bold text-muted">
          Aucun groupe ne vous est encore assigné.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {emplois.map((e) => (
            <button
              key={e.sessionId}
              onClick={() => setOpenEmploi(e)}
              className="group overflow-hidden rounded-2xl border border-line bg-surface text-start transition-all hover:border-primary/50 hover:shadow-md"
            >
              <div className="bg-gradient-to-r from-primary-50/70 to-transparent p-4">
                <strong className="block truncate text-sm text-ink">{e.title}</strong>
                <span className="block truncate text-[10px] text-muted">
                  Groupe {e.groupName} · {e.className} · Arène {e.salleName}
                </span>
                <span className="block truncate text-[10px] text-muted">
                  {e.daysLabel} · <span className="font-mono">{e.timeLabel}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
                <Badge tone="neutral" className="text-[9px] font-bold">
                  <Users className="h-3 w-3" /> {e.rosterCount} chevalier(s)
                </Badge>
                <Badge tone="primary" className="font-mono text-[9px]">
                  {e.currentCode} · séance {Math.min(Math.max(e.currentHeld, 0), e.size)}/{e.size}
                </Badge>
                {e.studentsInDebt > 0 && (
                  <Badge tone="danger" className="text-[9px] font-bold">
                    <AlertTriangle className="h-3 w-3" /> {e.studentsInDebt} en retard
                  </Badge>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line bg-canvas/40 px-4 py-2 text-[10px] font-bold text-primary">
                <span>Voir la liste des chevaliers</span>
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {openEmploi && (
        <TeacherGroupRoster emploi={openEmploi} onClose={() => setOpenEmploi(null)} />
      )}
    </div>
  );
}

function ClassStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 text-center">
      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <strong className={`mt-0.5 block font-mono text-base font-black ${tone}`}>{value}</strong>
    </div>
  );
}

// ----------------------------------------------------
// 7. ANNOUNCEMENTS VIEW
// ----------------------------------------------------
function TeacherAnnouncementsView({ announcements }: { announcements: any[] }) {
  const activeAnn = announcements.filter(
    (ann) =>
      (ann.audience === "all" || ann.audience === "teachers") &&
      new Date(ann.endDate) >= new Date()
  );

  return (
    <div className="space-y-6 text-xs">
      <PageHeader icon={Megaphone} title="Annonces pour le corps Entraîneur" subtitle="Informations du club importantes" />

      {activeAnn.length === 0 ? (
        <Card className="p-8 text-center bg-canvas/30 border border-line">
          <Megaphone className="h-10 w-10 text-muted mx-auto mb-2" />
          <h3 className="font-bold text-ink">Aucune annonce</h3>
          <p className="text-xs text-muted mt-1">Aucune information importante n'est actuellement diffusée.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeAnn.map((ann) => (
            <Card key={ann.id}>
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2 border-b border-line pb-2">
                  <Megaphone className="h-4.5 w-4.5 text-primary shrink-0" />
                  <strong className="text-ink text-sm font-bold">{ann.title}</strong>
                </div>
                <p className="text-muted text-xs leading-relaxed whitespace-pre-line">{ann.description}</p>
                <div className="border-t border-line/60 pt-2 flex justify-between text-[10px] text-muted">
                  <span>Publié le: {new Date(ann.date).toLocaleDateString()}</span>
                  <span>Date limite: {ann.endDate}</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 8. PROFILE VIEW
// ----------------------------------------------------
function TeacherProfileView({
  teacher,
  updateItem,
  updateUser,
  user,
}: {
  teacher: Teacher;
  updateItem: any;
  updateUser: (fields: { name?: string }) => void;
  user: any;
}) {
  const [firstName, setFirstName] = useState(teacher.firstName);
  const [lastName, setLastName] = useState(teacher.lastName);
  const [phone, setPhone] = useState(teacher.phone);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      if (password) {
        if (password.length < 6) {
          alert("Le mot de passe doit contenir au moins 6 caractères.");
          setSaving(false);
          return;
        }
        await changeOwnPassword(password);
        setPassword("");
      }

      updateItem("teachers", teacher.id, { firstName, lastName, phone });

      updateUser({ name: `${firstName} ${lastName}` });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <PageHeader icon={User} title="Mon Profil Entraîneur" subtitle="Gérer vos identifiants d'accès et contacts" />

      <div className="max-w-2xl">
        <Card>
          <CardBody className="space-y-4">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2 border-b border-line pb-3">
              <User className="h-5 w-5 text-primary" /> Informations Personnelles
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Prénom</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1 font-sans">Nom</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Téléphone</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Email (Identifiant)</label>
                <Input value={teacher.email} disabled className="opacity-60" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-muted mb-1">Nouveau mot de passe</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Laisser vide pour ne pas changer"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-line flex justify-end">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? "..." : "Enregistrer les Modifications"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
