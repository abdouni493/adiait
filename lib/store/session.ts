"use client";

/**
 * QUI EST CONNECTÉ.
 *
 * La session est celle de Supabase : `signInWithPassword` sur `auth.users`,
 * avec le jeton renouvelé et rangé par le client. Ce magasin y ajoute ce que
 * l'application a besoin de savoir en plus — le RÔLE, et la FICHE que le compte
 * pilote — qu'il lit dans `public.profiles`.
 *
 * DEUX FAÇONS D'ÊTRE IDENTIFIÉ, et il faut les deux :
 *
 *   `id`       — l'identifiant du COMPTE (`auth.users.id`).
 *   `entityId` — l'identifiant de la FICHE (chevalier, entraîneur, parent,
 *                travailleur), sous laquelle vivent ses données.
 *
 * Ils sont égaux pour un compte créé en même temps que sa fiche. Ils DIFFÈRENT
 * pour un travailleur à qui l'accès a été ouvert après coup : sa fiche, ses
 * pointages et ses acomptes existaient déjà, et le compte est venu pointer
 * dessus. C'est `entityId` qui commande partout ailleurs.
 *
 * ON SE CONNECTE AVEC SON EMAIL OU SON NOM D'UTILISATEUR. Supabase ne connaît
 * que les emails ; « yasmine » est donc d'abord traduit par la fonction
 * `login_email()`, puis la connexion se fait tout à fait normalement.
 */

import { create } from "zustand";
import { rpcAnon, supabase, errorMessage } from "@/lib/supabase/client";

export type Role = "admin" | "reception" | "student" | "teacher" | "parent";

export interface SessionUser {
  id: string;
  name: string;
  /** Son identifiant de connexion — l'email quand aucun nom d'utilisateur
   *  n'a été choisi. */
  username: string;
  email: string;
  role: Role;
  /** La ligne que ce compte pilote dans students / teachers / parents /
   *  reception_staff. */
  entityId?: string;
}

interface Profile {
  id: string;
  entity_id: string;
  role: Role;
  email: string;
  username: string;
  full_name: string;
}

function toSessionUser(profile: Profile): SessionUser {
  return {
    id: profile.id,
    name: profile.full_name || profile.email,
    username: profile.username || profile.email,
    email: profile.email,
    role: profile.role,
    entityId: profile.entity_id || profile.id,
  };
}

/** La fiche de compte du connecté. */
async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase()
    .from("profiles")
    .select("id, entity_id, role, email, username, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[supabase] profil", error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
}

/**
 * L'email derrière un identifiant de connexion.
 *
 * Une adresse est rendue telle quelle sans interroger la base — c'est le cas
 * courant, et cela évite un aller-retour avant chaque connexion.
 */
async function emailForLogin(login: string): Promise<string> {
  const clean = login.trim();
  if (clean.includes("@")) return clean.toLowerCase();

  // `rpcAnon` plutôt que le client : traduire un nom d'utilisateur se fait AVANT
  // toute session, et ne doit pas dépendre de la couche d'authentification.
  const { data, error } = await rpcAnon<string>("login_email", { p_login: clean });
  if (error || !data) {
    // Personne ne répond à cet identifiant. On ne le dit PAS : le message est
    // le même que pour un mot de passe faux, et rien ne se déduit de l'écart.
    throw new Error("Identifiants invalides");
  }
  return String(data);
}

interface SessionState {
  user: SessionUser | null;
  hydrated: boolean;
  /** Se connecte avec un identifiant (email OU nom d'utilisateur). */
  signIn: (login: string, password: string) => Promise<SessionUser>;
  /** Renomme le compte connecté (les portails laissent chacun se renommer). */
  updateUser: (fields: Partial<SessionUser>) => void;
  logout: () => Promise<void>;
  setHydrated: () => void;
  /** Restaure la session en cours au démarrage de l'application. */
  initSession: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  hydrated: false,

  signIn: async (login, password) => {
    const email = await emailForLogin(login);

    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      throw new Error(errorMessage(error, "Identifiants invalides"));
    }

    const profile = await loadProfile(data.user.id);
    if (!profile) {
      // Un compte sans fiche ne sait pas quoi afficher : mieux vaut le refuser
      // que de l'envoyer sur une application vide.
      await supabase().auth.signOut();
      throw new Error("Ce compte n'est rattaché à aucun rôle. Contactez l'administration.");
    }

    const user = toSessionUser(profile);
    set({ user, hydrated: true });
    return user;
  },

  updateUser: (fields) => {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...fields };
    set({ user: next });

    void (async () => {
      try {
        if (fields.name !== undefined && fields.name !== current.name) {
          await supabase().rpc("set_app_user_name", { p_id: current.id, p_full_name: next.name });
        }
        if (fields.username !== undefined && fields.username !== current.username) {
          await supabase().rpc("set_app_user_username", {
            p_id: current.id,
            p_username: next.username,
          });
        }
        if (fields.email !== undefined && fields.email !== current.email) {
          await supabase().rpc("set_app_user_email", { p_id: current.id, p_email: next.email });
        }
      } catch (err) {
        console.error("[supabase] mise à jour du compte", err);
      }
    })();
  },

  logout: async () => {
    await supabase().auth.signOut();
    set({ user: null });
  },

  setHydrated: () => set({ hydrated: true }),

  /**
   * LA SESSION SURVIT AU RECHARGEMENT.
   *
   * Le jeton est rangé par le client Supabase et relu ici. Un jeton expiré ou
   * révoqué rend simplement une page de connexion, ce qui est le bon
   * comportement.
   */
  initSession: async () => {
    try {
      const { data } = await supabase().auth.getSession();
      const account = data.session?.user;
      if (!account) {
        set({ user: null, hydrated: true });
        return;
      }
      const profile = await loadProfile(account.id);
      set({ user: profile ? toSessionUser(profile) : null, hydrated: true });
    } catch (err) {
      console.error("[supabase] session", err);
      set({ user: null, hydrated: true });
    }
  },
}));
