"use client";

/**
 * LES COMPTES DE LA DÉMONSTRATION.
 *
 * Il n'y a plus de table d'authentification : les comptes vivent ici, dans le
 * navigateur. Le registre se comporte quand même comme celui qu'il remplace —
 * on s'y connecte, on y crée un enseignant ou un parent, on y change un mot de
 * passe — pour que les écrans n'aient rien à savoir de la différence.
 *
 * DEUX FAÇONS D'ÊTRE IDENTIFIÉ, comme dans l'application d'origine :
 *
 *  - `id` est l'identifiant du COMPTE ;
 *  - `entityId` désigne la FICHE qu'il pilote (élève, enseignant, parent,
 *    travailleur).
 *
 * Les comptes créés par l'application portent le même identifiant des deux
 * côtés — c'est ce que les écrans supposent quand ils appellent
 * `resetUserPassword(teacher.id)`. Un travailleur à qui l'accès est ouvert APRÈS
 * coup fait exception : sa fiche existait avant son compte, elle ne bouge pas, et
 * c'est `entityId` qui fait le lien. La recherche accepte donc les deux.
 *
 * CE QUE CE REGISTRE N'EST PAS : un système de sécurité. Les mots de passe y
 * sont en clair, dans le navigateur du visiteur. C'est une démonstration — rien
 * de ce qu'elle contient n'est réel, et rien n'en sort.
 */

export type DemoRole = "admin" | "reception" | "student" | "teacher" | "parent";

export interface DemoAccount {
  id: string;
  /** la fiche que ce compte pilote — égale à `id` la plupart du temps */
  entityId: string;
  email: string;
  username: string;
  password: string;
  role: DemoRole;
  fullName: string;
}

const STORE_KEY = "altech-demo-accounts-v1";
const DEMO_PASSWORD = "demo1234";

// ---------------------------------------------------------------------------
//  Les accès rapides de la page de connexion
// ---------------------------------------------------------------------------

/**
 * LES TROIS PORTES D'ENTRÉE DE LA DÉMONSTRATION, plus les deux portails des
 * familles. La page de connexion en fait des boutons : un clic, et on est
 * dedans, sans rien avoir à taper.
 */
export interface QuickAccount {
  role: DemoRole;
  email: string;
  password: string;
  /** clé de traduction du libellé, sous `auth.quick.*` */
  labelKey: string;
  emoji: string;
  /** ce que ce compte donne à voir, en une ligne */
  hintKey: string;
}

export const QUICK_ACCOUNTS: QuickAccount[] = [
  {
    role: "admin",
    email: "admin@altech-school.dz",
    password: DEMO_PASSWORD,
    labelKey: "auth.quick.admin",
    emoji: "🛡️",
    hintKey: "auth.quick.adminHint",
  },
  {
    role: "teacher",
    email: "enseignant@altech-school.dz",
    password: DEMO_PASSWORD,
    labelKey: "auth.quick.teacher",
    emoji: "👨‍🏫",
    hintKey: "auth.quick.teacherHint",
  },
  {
    role: "reception",
    email: "travailleur@altech-school.dz",
    password: DEMO_PASSWORD,
    labelKey: "auth.quick.worker",
    emoji: "👥",
    hintKey: "auth.quick.workerHint",
  },
];

/** Les deux portails des familles — proposés à part, en second rang. */
export const FAMILY_ACCOUNTS: QuickAccount[] = [
  {
    role: "student",
    email: "eleve@altech-school.dz",
    password: DEMO_PASSWORD,
    labelKey: "auth.quick.student",
    emoji: "🎓",
    hintKey: "auth.quick.studentHint",
  },
  {
    role: "parent",
    email: "parent@altech-school.dz",
    password: DEMO_PASSWORD,
    labelKey: "auth.quick.parent",
    emoji: "👨‍👩‍👧",
    hintKey: "auth.quick.parentHint",
  },
];

// ---------------------------------------------------------------------------
//  Le registre d'origine
// ---------------------------------------------------------------------------

/**
 * Les comptes livrés avec la démonstration. Les cinq premiers sont ceux des
 * boutons d'accès rapide ; les suivants existent pour que les fiches du
 * personnel aient un vrai compte derrière elles — celui qu'on réinitialise
 * depuis l'écran des enseignants ou des travailleurs.
 */
function defaultAccounts(): DemoAccount[] {
  const staff = (
    id: string,
    email: string,
    username: string,
    fullName: string,
    role: DemoRole,
    entityId = id,
  ): DemoAccount => ({
    id,
    entityId,
    email,
    username,
    password: DEMO_PASSWORD,
    role,
    fullName,
  });

  return [
    // ---- Les accès rapides -------------------------------------------------
    staff("adm-1", "admin@altech-school.dz", "admin", "Direction ALTECH", "admin"),
    staff("tea-1", "enseignant@altech-school.dz", "karim", "Karim Bensalah", "teacher"),
    staff("rec-1", "travailleur@altech-school.dz", "yasmine", "Yasmine Belkacem", "reception"),
    staff("stu-1", "eleve@altech-school.dz", "yacine", "Yacine Amrani", "student"),
    staff("par-1", "parent@altech-school.dz", "rachid", "Rachid Amrani", "parent"),

    // ---- Le reste des enseignants -----------------------------------------
    staff("tea-2", "amina.haddad@altech-school.dz", "amina", "Amina Haddad", "teacher"),
    staff("tea-3", "sofiane.meziane@altech-school.dz", "sofiane", "Sofiane Meziane", "teacher"),
    staff("tea-5", "rachid.loucif@altech-school.dz", "rachid.l", "Rachid Loucif", "teacher"),
    staff("tea-6", "samira.benali@altech-school.dz", "samira", "Samira Benali", "teacher"),
    staff("tea-7", "hakim.zeroual@altech-school.dz", "hakim", "Hakim Zeroual", "teacher"),
    staff("tea-8", "leila.mansouri@altech-school.dz", "leila", "Leila Mansouri", "teacher"),
    staff("tea-9", "djalil.aitamrane@altech-school.dz", "djalil", "Djalil Ait Amrane", "teacher"),
    staff("tea-10", "fadila.ghanem@altech-school.dz", "fadila", "Fadila Ghanem", "teacher"),
    staff("tea-12", "hayet.boudjema@altech-school.dz", "hayet", "Hayet Boudjema", "teacher"),

    // ---- Les travailleurs à qui l'accès a été ouvert -----------------------
    staff("rec-5", "sofia.larbi@altech-school.dz", "sofia", "Sofia Larbi", "reception"),
    // Compte ouvert APRÈS la fiche : son identifiant n'est pas celui de la
    // fiche, et c'est `entityId` qui les relie.
    staff("acc-rec-8", "bilal.ghezali@altech-school.dz", "bilal", "Bilal Ghezali", "reception", "rec-8"),

    // ---- Les autres portails des familles ----------------------------------
    staff("stu-3", "mehdi.bouzid@eleve.altech-school.dz", "mehdi", "Mehdi Bouzid", "student"),
    staff("par-2", "fatima.bouzid@parent.altech-school.dz", "fatima", "Fatima Bouzid", "parent"),
  ];
}

// ---------------------------------------------------------------------------
//  Lecture / écriture du registre
// ---------------------------------------------------------------------------

let cache: DemoAccount[] | null = null;

function load(): DemoAccount[] {
  if (cache) return cache;
  if (typeof window === "undefined") return defaultAccounts();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DemoAccount[]) : null;
    cache = Array.isArray(parsed) && parsed.length ? parsed : defaultAccounts();
  } catch {
    cache = defaultAccounts();
  }
  return cache;
}

function save(list: DemoAccount[]): void {
  cache = list;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* le registre reste en mémoire : la démonstration continue */
  }
}

/** Tous les comptes, dans l'ordre où ils ont été créés. */
export function listAccounts(): DemoAccount[] {
  return load().slice();
}

/** Remet le registre dans son état d'origine. */
export function resetAccounts(): void {
  cache = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* rien à effacer */
  }
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Le compte qui répond à cet identifiant de connexion — l'email OU le nom
 * d'utilisateur. Les deux fonctionnent, comme au comptoir.
 */
export function findByLogin(login: string): DemoAccount | undefined {
  const key = norm(login);
  return load().find((a) => norm(a.email) === key || norm(a.username) === key);
}

/** Le compte, retrouvé par SON identifiant ou par celui de sa FICHE. */
export function findByAnyId(id: string): DemoAccount | undefined {
  return load().find((a) => a.id === id) ?? load().find((a) => a.entityId === id);
}

export function upsertAccount(account: DemoAccount): void {
  const list = load();
  const i = list.findIndex((a) => a.id === account.id);
  if (i >= 0) list[i] = account;
  else list.push(account);
  save(list.slice());
}

export function removeAccount(id: string): void {
  const list = load().filter((a) => a.id !== id && a.entityId !== id);
  save(list);
}

/** Y a-t-il déjà un administrateur ? La démonstration en a toujours un. */
export function hasAdmin(): boolean {
  return load().some((a) => a.role === "admin");
}

/** Un identifiant de compte tout neuf. */
export function newAccountId(prefix = "acc"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/** L'email est-il déjà pris par un AUTRE compte ? */
export function emailTaken(email: string, exceptId?: string): boolean {
  const key = norm(email);
  return load().some((a) => norm(a.email) === key && a.id !== exceptId);
}

// ---------------------------------------------------------------------------
//  La session courante
// ---------------------------------------------------------------------------

const SESSION_KEY = "altech-demo-session-v1";

/** Retient qui est connecté, pour qu'un rechargement ne déconnecte personne. */
export function rememberSession(accountId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (accountId) window.localStorage.setItem(SESSION_KEY, accountId);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* la session ne survivra pas au rechargement, sans plus */
  }
}

export function rememberedSession(): DemoAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    return load().find((a) => a.id === id) ?? null;
  } catch {
    return null;
  }
}
