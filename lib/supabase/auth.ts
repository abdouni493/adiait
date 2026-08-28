"use client";

/**
 * LE PREMIER COMPTE DE L'ÉCOLE.
 *
 * Une base fraîchement installée n'a AUCUN compte : personne ne peut se
 * connecter, donc personne ne peut créer le premier administrateur. C'est le
 * problème que ces fonctions règlent, et la seule chose que l'application sache
 * faire sans être connectée.
 *
 * `schemaState()` décide de ce que la page de connexion propose.
 * `bootstrapAdmin()` crée le compte — et la base REFUSE l'appel dès qu'un
 * administrateur existe. Le bouton n'est donc pas seulement caché : même
 * appelée à la main, la fonction ne peut pas amorcer une école qui tourne déjà.
 *
 * ELLES PASSENT PAR `rpcAnon`, ET NON PAR LE CLIENT SUPABASE. Les deux
 * fonctions sont ouvertes à `anon` et n'ont besoin d'aucune session ; les faire
 * dépendre de la couche d'authentification exposerait la page de connexion à
 * une panne qui n'a rien à voir avec elle (stockage du navigateur illisible,
 * verrou inter-onglets, jeton périmé). Voir `rpcAnon` dans `client.ts`.
 */

import { rpcAnon, errorMessage } from "./client";

/**
 * OÙ EN EST LE PROJET SUPABASE ?
 *
 *   `ready`         — la base est là, et quelqu'un l'administre déjà.
 *   `no-admin`      — la base est là, mais aucun compte : l'amorçage est
 *                     proposé.
 *   `not-installed` — le projet répond, mais `supabase/schema.sql` n'y a jamais
 *                     été exécuté. Le dire est la seule chose utile à faire :
 *                     ni le bouton ni le formulaire de connexion ne mèneraient
 *                     à quoi que ce soit.
 *   `unreachable`   — on n'a pas pu savoir. La page propose quand même
 *                     l'amorçage : c'est la BASE qui tranche, et elle refuse un
 *                     second administrateur. Mieux vaut un bouton qui explique
 *                     qu'une page muette.
 */
export type SchemaState = "ready" | "no-admin" | "not-installed" | "unreachable";

/** Ce que la dernière interrogation a répondu, pour l'afficher quand ça coince. */
let lastError = "";

export function lastSchemaError(): string {
  return lastError;
}

export async function schemaState(): Promise<SchemaState> {
  const { data, error } = await rpcAnon<boolean>("admin_exists");

  if (!error) {
    lastError = "";
    return data === true ? "ready" : "no-admin";
  }

  lastError = error.message;

  // PGRST202 : PostgREST ne trouve pas la fonction — le schéma n'est pas posé.
  // PGRST002 : il n'a pas pu lire le schéma du tout.
  if (error.code === "PGRST202" || error.code === "PGRST002" || error.code === "404") {
    console.error("[supabase] le schéma n'est pas installé — exécutez supabase/schema.sql");
    return "not-installed";
  }

  console.error("[supabase] admin_exists", error.code, error.message);
  return "unreachable";
}

/**
 * Y a-t-il déjà un administrateur ?
 *
 * Seul un « oui » vérifié compte comme un oui : tout le reste laisse la porte
 * ouverte, et c'est la base qui refusera si elle doit refuser.
 */
export async function adminExists(): Promise<boolean> {
  return (await schemaState()) === "ready";
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

  const { data, error } = await rpcAnon<string>("bootstrap_admin", {
    p_email: clean,
    p_password: password,
    p_full_name: fullName.trim() || "Administration",
  });

  if (error) {
    if (error.code === "PGRST202") {
      throw new Error(
        "La base de cette école n'est pas installée : exécutez supabase/schema.sql " +
          "dans le SQL Editor de votre projet Supabase.",
      );
    }
    throw new Error(errorMessage(error, "La création du compte a échoué."));
  }

  return String(data);
}
