"use client";

/**
 * LA GESTION DES COMPTES.
 *
 * Créer un entraîneur, ouvrir un accès à un travailleur, réinitialiser un mot
 * de passe, supprimer un compte : tout se joue dans `auth.users`, la vraie
 * table d'authentification de Supabase. Un compte créé ici se connecte donc par
 * la porte normale — email (ou nom d'utilisateur) et mot de passe.
 *
 * POURQUOI DES `rpc()` ET PAS L'API D'ADMINISTRATION. Créer le compte de
 * quelqu'un d'autre demande la clé de service, qui donne tous les droits sur le
 * projet et n'a rien à faire dans un navigateur. Les fonctions
 * `security definer` du schéma (`supabase/schema.sql`, section 7) font ce
 * travail à sa place et VÉRIFIENT elles-mêmes qui appelle : un travailleur sans
 * l'écran « Travailleurs » se voit refuser la création, quoi qu'il envoie.
 *
 * L'IDENTIFIANT RENDU À LA CRÉATION est celui du COMPTE, et l'appelant range sa
 * fiche (Teacher / Student / Parent) sous ce même identifiant : c'est ce qui
 * relie une session à ses données. `createAccountForEntity` fait exception —
 * voir son commentaire.
 */

import { supabase, errorMessage } from "@/lib/supabase/client";
import type { Role } from "@/lib/store/session";

export interface CreateUserPayload {
  role: Role;
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
  /** le métier d'un travailleur : réception, sécurité, ménage, … */
  workerRole?: string;
  /** le badge du pointage */
  workerRfid?: string;
  /** contrats horaires : le prix d'une heure travaillée */
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
  return payload.email.trim().toLowerCase();
}

/** Crée le compte d'une nouvelle personne et rend son identifiant. */
export async function createRoleUser(payload: CreateUserPayload): Promise<{ id: string }> {
  const email = guard(payload);

  const { data, error } = await supabase().rpc("create_app_user", {
    p_email: email,
    p_password: payload.password,
    p_role: payload.role,
    p_full_name: displayName(payload),
    p_username: null,
    p_entity_id: null,
  });
  if (error) throw new Error(errorMessage(error, "La création du compte a échoué."));

  return { id: String(data) };
}

/**
 * OUVRIR UN COMPTE À UNE FICHE QUI EXISTE DÉJÀ.
 *
 * Un travailleur créé sans accès porte son propre identifiant. Le jour où
 * l'administration lui ouvre un compte, `createRoleUser` en rendrait un TOUT
 * NEUF : il faudrait déplacer sa fiche, ses pointages, ses acomptes et ses
 * règlements dessous. La fiche reste donc où elle est, et c'est le compte qui
 * pointe vers elle.
 *
 * Renvoie l'identifiant du COMPTE, qui n'est pas celui de la fiche.
 */
export async function createAccountForEntity(
  entityId: string,
  payload: CreateUserPayload & { username?: string },
): Promise<{ id: string }> {
  const email = guard(payload);

  const { data, error } = await supabase().rpc("create_app_user", {
    p_email: email,
    p_password: payload.password,
    p_role: payload.role,
    p_full_name: displayName(payload),
    p_username: payload.username?.trim() || null,
    p_entity_id: entityId,
  });
  if (error) throw new Error(errorMessage(error, "La création du compte a échoué."));

  return { id: String(data) };
}

/**
 * LE COMPTE QUI PILOTE UNE FICHE, quand il en existe un.
 *
 * C'est lui qu'il faut viser pour changer un mot de passe ou un email :
 * l'identifiant de la fiche n'est pas forcément celui du compte, et ne l'est
 * jamais quand l'accès a été ouvert après coup.
 */
export async function accountIdForEntity(entityId: string): Promise<string | null> {
  const { data, error } = await supabase().rpc("account_id_for_entity", {
    p_entity_id: entityId,
  });
  if (error) {
    console.error("[supabase] account_id_for_entity", error.message);
    return null;
  }
  return data ? String(data) : null;
}

/** Le nom d'utilisateur affiché sur un compte. */
export async function updateUsername(id: string, username: string): Promise<void> {
  const { error } = await supabase().rpc("set_app_user_username", {
    p_id: id,
    p_username: username.trim(),
  });
  if (error) throw new Error(errorMessage(error, "Ce nom d'utilisateur n'a pas pu être posé."));
}

/** L'administration réinitialise le mot de passe de quelqu'un d'autre. */
export async function resetUserPassword(id: string, password: string): Promise<void> {
  if (!password || password.length < 6) {
    throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
  }
  const { error } = await supabase().rpc("set_app_user_password", {
    p_id: id,
    p_password: password,
  });
  if (error) throw new Error(errorMessage(error, "Le mot de passe n'a pas pu être changé."));
}

/**
 * Garde l'email de connexion en phase quand une fiche est modifiée.
 *
 * Une personne créée sans identifiants n'a simplement pas de compte à mettre à
 * jour, et c'est très bien ainsi : la fonction ne lève pas pour autant.
 */
export async function updateUserEmail(id: string, email: string): Promise<void> {
  if (!email?.trim()) return;

  const accountId = (await accountIdForEntity(id)) ?? id;
  const { error } = await supabase().rpc("set_app_user_email", {
    p_id: accountId,
    p_email: email.trim().toLowerCase(),
  });
  if (!error) return;

  // « Cet email est déjà pris » doit remonter à l'écran ; l'absence de compte,
  // non — la fiche se modifie quand même.
  if (/déjà utilisé|already/i.test(error.message)) {
    throw new Error(errorMessage(error));
  }
  console.error("[supabase] set_app_user_email", error.message);
}

/**
 * Retire le compte d'une fiche supprimée.
 *
 * Ne lève jamais : la ligne s'en va de toute façon, et les personnes créées
 * sans identifiants n'ont pas de compte. La fonction SQL accepte aussi bien
 * l'identifiant du compte que celui de la fiche.
 */
export async function deleteRoleUser(id: string): Promise<void> {
  const { error } = await supabase().rpc("delete_app_user", { p_id: id });
  if (error) console.error("[supabase] delete_app_user", error.message);
}

/**
 * Changement de mot de passe par la personne elle-même.
 *
 * Celui-là passe par la porte normale de Supabase : c'est SA session qui
 * autorise le changement, sans qu'aucun droit particulier soit nécessaire.
 */
export async function changeOwnPassword(password: string): Promise<void> {
  if (!password || password.length < 6) {
    throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
  }
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(errorMessage(error, "Le mot de passe n'a pas pu être changé."));
}
