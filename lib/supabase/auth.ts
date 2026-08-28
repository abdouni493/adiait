"use client";

/**
 * LE PREMIER COMPTE DE L'ÉCOLE.
 *
 * Une base fraîchement installée n'a AUCUN compte : personne ne peut se
 * connecter, donc personne ne peut créer le premier administrateur. C'est le
 * problème que ces deux fonctions règlent, et la seule chose que l'application
 * sache faire sans être connectée.
 *
 * `adminExists()` décide de l'affichage du bouton sur la page de connexion.
 * `bootstrapAdmin()` crée le compte — et la base REFUSE l'appel dès qu'un
 * administrateur existe. Le bouton n'est donc pas seulement caché : même
 * appelée à la main, la fonction ne peut pas amorcer une école qui tourne déjà.
 */

import { supabase, errorMessage } from "./client";

/**
 * OÙ EN EST LE PROJET SUPABASE ?
 *
 *   `ready`         — la base est là, et quelqu'un l'administre déjà.
 *   `no-admin`      — la base est là, mais aucun compte : c'est le seul cas où
 *                     l'amorçage est proposé.
 *   `not-installed` — le projet répond, mais `supabase/schema.sql` n'y a jamais
 *                     été exécuté. Le dire est la seule chose utile à faire :
 *                     ni le bouton ni le formulaire de connexion ne mèneraient
 *                     à quoi que ce soit.
 *   `unreachable`   — le projet ne répond pas.
 */
export type SchemaState = "ready" | "no-admin" | "not-installed" | "unreachable";

export async function schemaState(): Promise<SchemaState> {
  const { data, error } = await supabase().rpc("admin_exists");

  if (!error) return data === true ? "ready" : "no-admin";

  // PGRST202 : PostgREST ne trouve pas la fonction — le schéma n'est pas posé.
  if (error.code === "PGRST202" || /function .*admin_exists/i.test(error.message)) {
    console.error("[supabase] le schéma n'est pas installé — exécutez supabase/schema.sql");
    return "not-installed";
  }

  console.error("[supabase] admin_exists", error.message);
  return "unreachable";
}

/**
 * Y a-t-il déjà un administrateur ?
 *
 * Tout ce qui n'est pas « la base est là et personne ne l'administre » répond
 * « oui » : mieux vaut ne pas proposer la création que de l'offrir à tort.
 */
export async function adminExists(): Promise<boolean> {
  return (await schemaState()) !== "no-admin";
}

/** Crée le compte d'administration de l'école, et rend son identifiant. */
export async function bootstrapAdmin(
  email: string,
  password: string,
  fullName: string,
): Promise<string> {
  const clean = email.trim().toLowerCase();
  if (!clean) throw new Error("L'email est obligatoire.");
  if (!password || password.length < 6) {
    throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
  }

  const { data, error } = await supabase().rpc("bootstrap_admin", {
    p_email: clean,
    p_password: password,
    p_full_name: fullName.trim() || "Administration",
  });
  if (error) throw new Error(errorMessage(error, "La création du compte a échoué."));
  return String(data);
}
