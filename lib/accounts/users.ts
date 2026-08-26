"use client";

/**
 * LA GESTION DES COMPTES, EN MODE DÉMONSTRATION.
 *
 * Les signatures sont exactement celles de la version qui parlait à une base
 * d'authentification : créer un enseignant, ouvrir un accès à un travailleur,
 * réinitialiser un mot de passe, supprimer un compte. Seule l'implémentation
 * change — tout se joue désormais dans le registre local
 * (`lib/demo/accounts.ts`), donc aucun écran n'a eu à bouger.
 *
 * L'identifiant rendu à la création est celui du COMPTE, et l'appelant range sa
 * fiche (Teacher / Student / Parent / ReceptionStaff) sous ce même identifiant :
 * c'est ce qui relie une session à ses données.
 */

import {
  emailTaken,
  findByAnyId,
  newAccountId,
  removeAccount,
  rememberedSession,
  upsertAccount,
  type DemoAccount,
  type DemoRole,
} from "@/lib/demo/accounts";

export interface CreateUserPayload {
  role: DemoRole;
  email: string;
  password: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthDate?: string;
  rfid?: string;
  isFree?: boolean;
  parentId?: string;
  subscriptionIds?: string[];
  registrationDue?: number;
  paymentType?: string;
  monthlyAmount?: number;
  startDate?: string;
  percentage?: number;
  salary?: number;
  /** worker (reception_staff) job: reception | security | menage | … */
  workerRole?: string;
  /** worker badge used by the clock-in / clock-out scanner */
  workerRfid?: string;
  /** hourly contracts: price of one worked hour */
  hourlyRate?: number;
}

function displayName(payload: CreateUserPayload): string {
  return (
    payload.fullName?.trim() ||
    [payload.firstName, payload.lastName].filter(Boolean).join(" ").trim() ||
    payload.email
  );
}

function guard(payload: CreateUserPayload): string {
  if (!payload.role || !payload.email?.trim()) {
    throw new Error("Le rôle et l'email sont obligatoires.");
  }
  if (!payload.password || payload.password.length < 6) {
    throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
  }
  const email = payload.email.trim().toLowerCase();
  if (emailTaken(email)) {
    throw new Error("Cet email est déjà utilisé par un autre compte.");
  }
  return email;
}

/**
 * Crée le compte d'une nouvelle personne et rend son identifiant.
 *
 * Le compte et la fiche partagent le même identifiant : c'est la convention que
 * les écrans supposent quand ils réinitialisent un mot de passe à partir d'une
 * fiche (`resetUserPassword(teacher.id)`).
 */
export async function createRoleUser(payload: CreateUserPayload): Promise<{ id: string }> {
  const email = guard(payload);
  const id = newAccountId(payload.role.slice(0, 3));

  upsertAccount({
    id,
    entityId: id,
    email,
    username: email,
    password: payload.password,
    role: payload.role,
    fullName: displayName(payload),
  });

  return { id };
}

/**
 * OUVRIR UN COMPTE À UNE FICHE QUI EXISTE DÉJÀ.
 *
 * Un travailleur créé sans accès porte son propre identifiant. Le jour où
 * l'administration lui ouvre un compte, `createRoleUser` en rendrait un TOUT
 * NEUF : il faudrait déplacer sa fiche, ses pointages, ses acomptes et ses
 * règlements dessous. La fiche reste donc où elle est, et c'est le compte qui
 * pointe vers elle — ce que l'application lit pour retrouver les droits d'un
 * connecté.
 *
 * Renvoie l'identifiant du COMPTE, qui n'est pas celui de la fiche.
 */
export async function createAccountForEntity(
  entityId: string,
  payload: CreateUserPayload & { username?: string },
): Promise<{ id: string }> {
  const email = guard(payload);
  const id = newAccountId("acc");

  upsertAccount({
    id,
    entityId,
    email,
    username: payload.username?.trim() || email,
    password: payload.password,
    role: payload.role,
    fullName: displayName(payload),
  });

  return { id };
}

/**
 * LE COMPTE QUI PILOTE UNE FICHE, quand il en existe un.
 *
 * C'est lui qu'il faut viser pour changer un mot de passe ou un email :
 * l'identifiant de la fiche n'est pas forcément celui du compte, et ne l'est
 * jamais quand l'accès a été ouvert après coup.
 */
export async function accountIdForEntity(entityId: string): Promise<string | null> {
  return findByAnyId(entityId)?.id ?? null;
}

/** Le nom d'utilisateur affiché sur un compte. */
export async function updateUsername(id: string, username: string): Promise<void> {
  const account = mustFind(id);
  upsertAccount({ ...account, username: username.trim() || account.username });
}

/** Admin/réception réinitialise le mot de passe de quelqu'un d'autre. */
export async function resetUserPassword(id: string, password: string): Promise<void> {
  if (!password || password.length < 6) {
    throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
  }
  const account = mustFind(id);
  upsertAccount({ ...account, password });
}

/** Garde l'email de connexion en phase quand une fiche est modifiée. Une
 *  personne créée sans identifiants n'a simplement pas de compte à mettre à
 *  jour, et c'est très bien ainsi. */
export async function updateUserEmail(id: string, email: string): Promise<void> {
  if (!email?.trim()) return;
  const account = findByAnyId(id);
  if (!account) return;
  const next = email.trim().toLowerCase();
  if (emailTaken(next, account.id)) {
    throw new Error("Cet email est déjà utilisé par un autre compte.");
  }
  upsertAccount({
    ...account,
    email: next,
    // Le nom d'utilisateur suivait l'email tant qu'on ne l'a pas personnalisé.
    username: account.username === account.email ? next : account.username,
  });
}

/** Retire le compte d'une fiche supprimée. Ne lève jamais : la ligne s'en va de
 *  toute façon, et les personnes créées sans identifiants n'ont pas de compte. */
export async function deleteRoleUser(id: string): Promise<void> {
  removeAccount(id);
}

/** Changement de mot de passe par la personne elle-même. */
export async function changeOwnPassword(password: string): Promise<void> {
  if (!password || password.length < 6) {
    throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
  }
  const account = rememberedSession();
  if (!account) throw new Error("Aucun compte connecté.");
  upsertAccount({ ...account, password });
}

/** Le compte visé, ou une erreur lisible s'il n'existe pas. */
function mustFind(id: string): DemoAccount {
  const account = findByAnyId(id);
  if (!account) throw new Error("Cette fiche n'a pas de compte de connexion.");
  return account;
}
