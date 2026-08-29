"use client";

/**
 * LES COMPTES QUE LES FAMILLES CRÉENT ELLES-MÊMES.
 *
 * Jusqu'ici, un compte de connexion naissait TOUJOURS au comptoir : quelqu'un
 * de l'intendance saisissait une fiche, cochait « ouvrir un accès », et tapait
 * un mot de passe. Un chevalier qui voulait suivre ses présences devait donc
 * passer par le club pour obtenir ce que son téléphone pouvait lui donner en
 * deux minutes.
 *
 * La page de connexion propose désormais « créer mon compte ». Le compte est
 * bien créé dans `auth.users` — il se connecte immédiatement, par la porte
 * normale — mais il n'est rattaché à AUCUNE fiche : il n'a donc rien à lire, et
 * l'application lui affiche « votre compte attend son activation ».
 *
 * L'intendance rattache ensuite ce compte à une fiche existante, ou crée la
 * fiche depuis la demande. C'est à cet instant seulement que le compte voit
 * quelque chose.
 *
 * POURQUOI DES FONCTIONS SQL. Créer un compte pour quelqu'un d'autre demande la
 * clé de service, qui n'a rien à faire dans un navigateur. `request_account()`
 * est `security definer` : elle écrit dans `auth.users`, pose le profil INACTIF
 * et enregistre la demande, le tout sans qu'aucun droit ne soit accordé au
 * visiteur. Elle est ouverte à `anon` parce que celui qui la demande n'est,
 * par définition, pas encore connecté.
 */

import { rpcAnon, supabase, errorMessage } from "@/lib/supabase/client";
import type { AccountRequestChild, AccountRequestKind } from "@/lib/types";

export interface AccountRequestPayload {
  kind: AccountRequestKind;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  phone2?: string;
  birthDate?: string;
  address?: string;
  /** « je suis déjà inscrit au club, je veux seulement mon accès » */
  existingMember: boolean;
  /** parent : ses fils sont-ils déjà inscrits au club ? */
  childrenSubscribed?: boolean;
  /** parent : les fils déclarés, quand ils ne sont pas encore inscrits */
  children?: AccountRequestChild[];
}

/**
 * Crée le compte de connexion d'un chevalier ou d'un parent, et dépose sa
 * demande d'activation. Rend l'identifiant du compte créé.
 */
export async function requestAccount(payload: AccountRequestPayload): Promise<string> {
  const email = payload.email.trim().toLowerCase();
  if (!email) throw new Error("L'email est obligatoire.");
  if (!payload.password || payload.password.length < 6) {
    throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
  }
  if (!payload.firstName.trim() && !payload.lastName.trim()) {
    throw new Error("Indiquez au moins un nom ou un prénom.");
  }

  const { data, error } = await rpcAnon<string>("request_account", {
    p_email: email,
    p_password: payload.password,
    p_kind: payload.kind,
    p_first_name: payload.firstName.trim(),
    p_last_name: payload.lastName.trim(),
    p_phone: payload.phone.trim(),
    p_phone2: payload.phone2?.trim() || null,
    p_birth_date: payload.birthDate || null,
    p_address: payload.address?.trim() || null,
    p_existing_member: payload.existingMember,
    p_children_subscribed: payload.childrenSubscribed ?? null,
    p_children: payload.children ?? [],
  });

  if (error) {
    if (error.code === "PGRST202") {
      throw new Error(
        "La création de compte n'est pas encore installée sur cette base : " +
          "exécutez la migration SQL dans le SQL Editor de Supabase.",
      );
    }
    throw new Error(errorMessage(error, "La création du compte a échoué."));
  }
  return String(data);
}

/**
 * RATTACHE UN COMPTE EN ATTENTE À UNE FICHE, ET L'ACTIVE.
 *
 * C'est le seul geste qui ouvre l'application à une demande : le profil pointe
 * désormais la fiche (`entity_id`), et il est marqué actif. Le compte voit dès
 * sa prochaine connexion — ou son prochain rechargement — exactement ce qu'il
 * verrait s'il avait été créé au comptoir.
 */
export async function linkAccountToEntity(
  accountId: string,
  entityId: string,
  role: "student" | "parent",
): Promise<void> {
  const { error } = await supabase().rpc("link_account_entity", {
    p_account_id: accountId,
    p_entity_id: entityId,
    p_role: role,
  });
  if (error) throw new Error(errorMessage(error, "Le rattachement du compte a échoué."));
}

/** Le profil d'un compte est-il actif ? (utilisé par l'écran d'attente) */
export async function accountIsActive(accountId: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from("profiles")
    .select("active")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { active?: boolean }).active !== false;
}
