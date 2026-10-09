/**
 * =============================================================================
 *  UNE CATÉGORIE, GROUPE PAR GROUPE — et les chevaliers de chacun
 * =============================================================================
 *
 * L'écran « Catégories » ne se contente plus de compter : il répond à la
 * question que la réception pose vraiment — « qui est dans quel groupe ? ».
 *
 *   Catégorie  ->  ses groupes  ->  les emplois du temps de chaque groupe
 *                                ->  les chevaliers inscrits sur ces emplois
 *
 * Un chevalier appartient au groupe de l'emploi du temps sur lequel il est
 * INSCRIT AUJOURD'HUI (`subscriptionIds`), et seulement si cet emploi est
 * vivant (non archivé). Deux cas ne rentrent dans aucun groupe, et ne doivent
 * pourtant pas disparaître de l'écran :
 *
 *   - un emploi du temps SANS GROUPE : ses inscrits forment leur propre case,
 *     au nom de l'emploi (« Sans groupe — 1er degré jeudi ») ;
 *   - un chevalier rangé dans la catégorie (`enrollmentLevel`) mais inscrit sur
 *     AUCUN de ses emplois du temps : il attend son créneau, et la case
 *     « Sans emploi du temps » le dit.
 *
 * Ce module ne fait que lire : il ne modifie rien.
 */

import type { Database } from "@/lib/store/data";
import type { Group, ScheduleSession, SchoolClass, Student, Subscription } from "@/lib/types";
import {
  ageFromBirthDate,
  categoryAccepts,
  currentCycleCode,
  groupsOfClass,
  isFreeSub,
  registrationNumberOf,
  sessionGroupsOfClass,
  sessionHasClass,
  soldFor,
  studentName,
} from "@/lib/helpers";

/** Un chevalier, tel que l'écran des catégories le montre. */
export interface RosterStudent {
  student: Student;
  number: string;
  name: string;
  /** l'emploi du temps qui le range dans ce groupe */
  sessionId?: string;
  subscriptionId?: string;
  /** solde de cet emploi du temps — négatif = ce qu'il doit */
  sold: number;
  /** la carte qu'il vit sur cet emploi (« M2 ») */
  cardCode?: string;
  age: number | null;
  /** son âge sort de la tranche de la catégorie (il a grandi depuis) */
  outOfAge: boolean;
  /** l'emploi lui est offert (cas spécial) */
  free: boolean;
}

export type RosterBucketKind = "group" | "nogroup" | "pending";

/** Une case de la catégorie : un groupe, ou ce qui n'en a pas. */
export interface RosterBucket {
  key: string;
  kind: RosterBucketKind;
  name: string;
  group?: Group;
  /** les emplois du temps VIVANTS qui font travailler cette case */
  sessions: ScheduleSession[];
  students: RosterStudent[];
  /** combien lui doivent quelque chose sur leur emploi */
  debtors: number;
  /** ce que la case doit, en tout */
  debt: number;
}

export interface CategoryRoster {
  cls: SchoolClass;
  buckets: RosterBucket[];
  /** emplois du temps vivants de la catégorie */
  sessions: ScheduleSession[];
  /** chevaliers DISTINCTS de la catégorie — un chevalier sur deux groupes compte une fois */
  total: number;
  debtors: number;
  debt: number;
  outOfAge: number;
  /** combien de groupes ont au moins un chevalier */
  activeGroups: number;
}

const byName = (a: RosterStudent, b: RosterStudent) =>
  a.name.localeCompare(b.name) || a.number.localeCompare(b.number);

function liveSubscriptionOf(db: Database, sessionId: string): Subscription | undefined {
  return db.subscriptions.find((s) => s.sessionId === sessionId && !s.archivedAt);
}

function rosterStudent(
  db: Database,
  cls: SchoolClass,
  student: Student,
  session?: ScheduleSession,
  sub?: Subscription,
): RosterStudent {
  const age = ageFromBirthDate(student.birthDate);
  return {
    student,
    number: registrationNumberOf(db, student),
    name: studentName(student),
    sessionId: session?.id,
    subscriptionId: sub?.id,
    sold: sub ? soldFor(db, student.id, sub.id) : 0,
    cardCode: sub ? currentCycleCode(db, student.id, sub.id) : undefined,
    age,
    outOfAge: categoryAccepts(cls, student.birthDate) === false,
    free: sub ? isFreeSub(student, sub.id) : false,
  };
}

function finish(bucket: RosterBucket): RosterBucket {
  bucket.students.sort(byName);
  const owing = bucket.students.filter((s) => s.sold < 0 && !s.free);
  bucket.debtors = owing.length;
  bucket.debt = owing.reduce((t, s) => t - s.sold, 0);
  return bucket;
}

/** La catégorie, découpée en groupes, avec les chevaliers de chacun. */
export function categoryRoster(db: Database, classId: string): CategoryRoster | null {
  const cls = db.classes.find((c) => c.id === classId);
  if (!cls) return null;

  const sessions = db.sessions.filter((s) => !s.archivedAt && sessionHasClass(s, classId));
  const buckets = new Map<string, RosterBucket>();

  // Les groupes de la catégorie d'abord, même vides : l'écran peut les montrer.
  for (const group of groupsOfClass(db, classId)) {
    buckets.set(`g:${group.id}`, {
      key: `g:${group.id}`,
      kind: "group",
      name: group.name,
      group,
      sessions: [],
      students: [],
      debtors: 0,
      debt: 0,
    });
  }

  const seen = new Set<string>();
  const placed = new Map<string, Set<string>>();
  const place = (bucket: RosterBucket, rs: RosterStudent) => {
    const ids = placed.get(bucket.key) ?? new Set<string>();
    if (ids.has(rs.student.id)) return;
    ids.add(rs.student.id);
    placed.set(bucket.key, ids);
    bucket.students.push(rs);
    seen.add(rs.student.id);
  };

  for (const session of sessions) {
    const sub = liveSubscriptionOf(db, session.id);
    const enrolled = sub ? db.students.filter((st) => st.subscriptionIds.includes(sub.id)) : [];
    const groupIds = sessionGroupsOfClass(session, classId);

    const targets: RosterBucket[] = [];
    if (groupIds.length === 0) {
      const key = `s:${session.id}`;
      const title = session.title?.trim() || "Emploi du temps";
      const bucket: RosterBucket = buckets.get(key) ?? {
        key,
        kind: "nogroup",
        name: title,
        sessions: [],
        students: [],
        debtors: 0,
        debt: 0,
      };
      buckets.set(key, bucket);
      targets.push(bucket);
    } else {
      for (const gid of groupIds) {
        const key = `g:${gid}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          const group = db.groups.find((g) => g.id === gid);
          bucket = {
            key,
            kind: "group",
            name: group?.name ?? "Groupe",
            group,
            sessions: [],
            students: [],
            debtors: 0,
            debt: 0,
          };
          buckets.set(key, bucket);
        }
        targets.push(bucket);
      }
    }

    for (const bucket of targets) {
      if (!bucket.sessions.some((s) => s.id === session.id)) bucket.sessions.push(session);
      for (const st of enrolled) place(bucket, rosterStudent(db, cls, st, session, sub));
    }
  }

  // Rangés dans la catégorie, inscrits sur AUCUN emploi vivant : ils attendent un
  // créneau. Celui qui s'entraîne dans une autre catégorie n'attend rien — il
  // apparaît là où il s'entraîne.
  const live = new Set(db.subscriptions.filter((s) => !s.archivedAt).map((s) => s.id));
  const waiting = db.students.filter(
    (st) =>
      st.enrollmentLevel === classId &&
      !seen.has(st.id) &&
      !st.subscriptionIds.some((id) => live.has(id)),
  );
  if (waiting.length > 0) {
    const bucket: RosterBucket = {
      key: "pending",
      kind: "pending",
      name: "Sans emploi du temps",
      sessions: [],
      students: [],
      debtors: 0,
      debt: 0,
    };
    for (const st of waiting) place(bucket, rosterStudent(db, cls, st));
    buckets.set(bucket.key, bucket);
  }

  const order: Record<RosterBucketKind, number> = { group: 0, nogroup: 1, pending: 2 };
  const list = [...buckets.values()]
    .map(finish)
    .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));

  // Les totaux comptent chaque chevalier UNE fois, quel que soit le nombre de
  // groupes où il apparaît.
  const unique = new Map<string, RosterStudent>();
  for (const b of list) for (const s of b.students) if (!unique.has(s.student.id)) unique.set(s.student.id, s);
  // Sa dette, elle, se lit emploi par emploi : on additionne donc chaque ligne
  // d'emploi une fois.
  const debtLines = new Map<string, number>();
  for (const b of list) {
    for (const s of b.students) {
      if (s.sold >= 0 || s.free) continue;
      debtLines.set(`${s.student.id}|${s.subscriptionId ?? ""}`, -s.sold);
    }
  }
  const debtorIds = new Set([...debtLines.keys()].map((k) => k.split("|")[0]));

  return {
    cls,
    buckets: list,
    sessions,
    total: unique.size,
    debtors: debtorIds.size,
    debt: [...debtLines.values()].reduce((t, v) => t + v, 0),
    outOfAge: [...unique.values()].filter((s) => s.outOfAge).length,
    activeGroups: list.filter((b) => b.kind === "group" && b.students.length > 0).length,
  };
}
