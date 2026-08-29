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
 * normale — et deux choses peuvent alors arriver.
 *
 * LE NUMÉRO DE TÉLÉPHONE RECONNAÎT LES SIENS. Un chevalier ou un parent déjà
 * inscrit au club n'a aucune raison d'attendre : son numéro désigne sa fiche, et
 * la base le rattache et l'active dans le même geste. Il se connecte et voit
 * tout, sans que personne au club ait à lever le petit doigt.
 *
 * LE NUMÉRO NE DIT RIEN — ou il désigne deux fiches à la fois, ou la fiche
 * trouvée est déjà pilotée par un autre compte. Le compte naît alors sans fiche :
 * il n'a rien à lire, l'application lui affiche « votre compte attend son
 * activation », et la demande apparaît sur le tableau de bord. L'intendance la
 * rattache à une fiche existante, ou crée la fiche depuis la demande.
 *
 * POURQUOI DES FONCTIONS SQL. Créer un compte pour quelqu'un d'autre demande la
 * clé de service, qui n'a rien à faire dans un navigateur. `request_account()`
 * est `security definer` : elle écrit dans `auth.users`, pose le profil INACTIF
 * et enregistre la demande, le tout sans qu'aucun droit ne soit accordé au
 * visiteur. Elle est ouverte à `anon` parce que celui qui la demande n'est,
 * par définition, pas encore connecté.
 */

import { rpcAnon, supabase, errorMessage } from "@/lib/supabase/client";
import type {
  AccountRequestChild,
  AccountRequestKind,
  AccountRequestSource,
} from "@/lib/types";

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
  /**
   * PAR QUELLE PORTE LA DEMANDE EST ENTRÉE.
   *
   * `login` — la page de connexion de l'application ; `website` — le site
   * public du club, au bas d'une formation. Les deux créent le même compte
   * inactif ; elles ne s'affichent simplement pas dans la même file d'attente.
   */
  source?: AccountRequestSource;
  /**
   * LA FORMATION D'OÙ LA DEMANDE EST PARTIE.
   *
   * Elle ne réserve rien et n'engage aucun argent : c'est une INTENTION, que
   * l'intendance transforme en inscription réelle quand elle vérifie la
   * demande. Tant qu'elle n'a pas vérifié, personne n'est inscrit et rien n'est
   * facturé.
   */
  formationId?: string;
}

/**
 * CE QUE LA CRÉATION A DONNÉ.
 *
 * Un compte ne naît plus toujours en attente : quand le NUMÉRO DE TÉLÉPHONE
 * désigne une fiche du club — et une seule, encore pilotée par personne — la
 * base rattache le compte à cette fiche et l'ACTIVE dans le même geste. La
 * famille se connecte et voit tout, sans attendre que quelqu'un du club passe.
 *
 * L'écran de confirmation a donc deux choses à dire selon le cas, et c'est ce
 * que cet objet lui apprend.
 */
export interface AccountRequestOutcome {
  /** l'identifiant du compte créé dans `auth.users` */
  accountId: string;
  /** le numéro a reconnu une fiche : le compte est déjà actif */
  linked: boolean;
  /** la fiche à laquelle il vient d'être rattaché */
  entityId?: string;
  /** son nom, pour pouvoir le dire à la famille */
  entityName?: string;
  /**
   * LA DEMANDE ATTEND-ELLE ENCORE L'INTENDANCE ?
   *
   * Activer un compte n'est pas traiter une demande : une formation à facturer
   * ou des fils à créer restent du travail humain, même quand la porte est déjà
   * ouverte.
   */
  pending: boolean;
}

/**
 * Crée le compte de connexion d'un chevalier ou d'un parent, et dépose sa
 * demande d'activation. Rend ce que la base en a fait — voir
 * `AccountRequestOutcome`.
 */
export async function requestAccount(
  payload: AccountRequestPayload,
): Promise<AccountRequestOutcome> {
  const email = payload.email.trim().toLowerCase();
  if (!email) throw new Error("L'email est obligatoire.");
  if (!payload.password || payload.password.length < 6) {
    throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
  }
  if (!payload.firstName.trim() && !payload.lastName.trim()) {
    throw new Error("Indiquez au moins un nom ou un prénom.");
  }

  const { data, error } = await rpcAnon<RawOutcome>("request_account", {
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
    p_source: payload.source ?? "login",
    p_formation_id: payload.formationId ?? null,
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

  /**
   * UNE BASE QUI N'A PAS ENCORE REÇU LA MIGRATION REND UNE CHAÎNE.
   *
   * `request_account` rendait l'identifiant du compte, tout nu ; elle rend
   * désormais un objet. Le compte est créé dans les deux cas — l'application ne
   * doit donc pas tomber devant l'ancienne forme : elle la lit comme « créé,
   * mais pas rattaché », ce qui est exactement ce que faisait cette base-là.
   */
  if (typeof data === "string") {
    return { accountId: data, linked: false, pending: true };
  }

  const raw = (data ?? {}) as RawOutcome;
  return {
    accountId: String(raw.account_id ?? ""),
    linked: raw.linked === true,
    entityId: raw.entity_id ?? undefined,
    entityName: raw.entity_name ?? undefined,
    pending: raw.pending !== false,
  };
}

/** Ce que la fonction SQL rend, en `snake_case`. */
interface RawOutcome {
  account_id?: string;
  kind?: string;
  linked?: boolean;
  entity_id?: string | null;
  entity_name?: string | null;
  pending?: boolean;
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
