"use client";

/**
 * LA CONNEXION AU PROJET SUPABASE.
 *
 * Un seul client pour toute l'application : il porte la session (le jeton
 * d'accès, son renouvellement, sa persistance dans le navigateur), et toutes
 * les requêtes passent par lui.
 *
 * LA CLÉ « ANON » EST PUBLIQUE, ET C'EST NORMAL. Elle ne donne aucun droit par
 * elle-même : c'est la RLS, côté PostgreSQL, qui décide ligne par ligne de ce
 * qu'un compte peut lire et écrire (`supabase/schema.sql`, section 6). Sans
 * connexion, elle ne permet de lire que le nom et le logo de l'établissement —
 * ce que la page de connexion affiche.
 *
 * LA CLÉ DE SERVICE (`service_role`), elle, n'apparaît NULLE PART dans ce dépôt
 * et ne doit jamais rejoindre un navigateur. Créer le compte d'un enseignant ou
 * d'un travailleur passe par les fonctions `security definer` du schéma, qui
 * vérifient elles-mêmes qui appelle.
 *
 * Les variables d'environnement l'emportent quand elles sont posées (un autre
 * projet, une préproduction) ; sinon on retombe sur le projet de l'école, pour
 * qu'un dépôt fraîchement cloné démarre sans configuration.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * UNE VARIABLE POSÉE MAIS VIDE EST TRAITÉE COMME ABSENTE.
 *
 * C'est le piège qui a coûté une page de connexion morte. `??` ne retient son
 * repli que pour `undefined` et `null` : une variable déclarée dans les
 * réglages d'un hébergeur mais laissée SANS VALEUR vaut `""`, qui traverse
 * `??` intact — et `createClient("")` lève « supabaseUrl is required » avant
 * que quoi que ce soit s'affiche.
 *
 * Une adresse vide n'est pas une adresse. On la traite donc comme une absence,
 * et le projet de l'école reprend la main.
 */
function envOr(name: string, value: string | undefined, fallback: string): string {
  const clean = typeof value === "string" ? value.trim() : "";
  if (clean.length > 0) return clean;

  // Déclarée mais laissée vide : ce n'est pas la même chose qu'absente, et
  // celui qui l'a posée mérite de savoir qu'elle ne sert à rien.
  if (typeof value === "string") {
    console.warn(`[supabase] ${name} est déclarée mais vide — le projet par défaut est utilisé.`);
  }
  return fallback;
}

/** Le projet de l'école, utilisé quand rien n'est posé dans l'environnement. */
const DEFAULT_URL = "https://nbhfpumaqirvhridhygr.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iaGZwdW1hcWlydmhyaWRoeWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NjgyMjQsImV4cCI6MjEwMzQ0NDIyNH0.Ph5Fhegn16rpiGdsXxznXch0cZfIb-JR_sjJk5FUcEY";

export const SUPABASE_URL = envOr(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  DEFAULT_URL,
);

export const SUPABASE_ANON_KEY = envOr(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  DEFAULT_ANON_KEY,
);

/**
 * Une adresse mal formée ne doit pas non plus casser l'application : elle est
 * signalée une fois, et le projet de l'école reprend la main. Sans cela, une
 * faute de frappe dans une variable d'environnement rendrait la même page morte
 * que celle qu'on vient de réparer.
 */
const BASE_URL = /^https?:\/\//.test(SUPABASE_URL) ? SUPABASE_URL : DEFAULT_URL;

if (BASE_URL !== SUPABASE_URL) {
  console.error(
    `[supabase] NEXT_PUBLIC_SUPABASE_URL ne ressemble pas à une adresse ("${SUPABASE_URL}") — ` +
      "le projet par défaut est utilisé à la place.",
  );
}

/**
 * Le client est créé PARESSEUSEMENT : le module est importé par des fichiers
 * que Next rend aussi côté serveur, et rien ne doit y ouvrir de session.
 */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(BASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // La session survit au rechargement, et se renouvelle toute seule.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "ecole-privee-auth",
      },
    });
  }
  return client;
}

/**
 * UN APPEL DE FONCTION QUI NE DÉPEND PAS D'UNE SESSION.
 *
 * POURQUOI NE PAS PASSER PAR LE CLIENT. Avant chaque requête, `supabase-js`
 * attend `auth.getSession()` — il faut bien savoir quel jeton poser. Cette
 * attente met en jeu le stockage du navigateur et un verrou inter-onglets, et
 * elle peut échouer ou ne jamais revenir : navigation privée, stockage
 * désactivé, jeton illisible laissé par une version antérieure, deuxième onglet
 * qui garde le verrou.
 *
 * Or les trois fonctions dont la page de connexion a besoin — « y a-t-il un
 * administrateur ? », « crée le premier », « quel email derrière ce nom
 * d'utilisateur ? » — sont ouvertes à `anon` et n'ont besoin d'AUCUNE session.
 * Les faire dépendre de la couche d'authentification, c'est risquer une page de
 * connexion muette pour une raison qui n'a rien à voir avec elle.
 *
 * Elles passent donc par un `fetch` direct : la clé publique, et rien d'autre.
 * Avec un DÉLAI MAXIMUM, pour qu'un serveur qui ne répond pas produise un
 * message plutôt qu'une page qui réfléchit indéfiniment.
 */
export interface RpcResult<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

const RPC_TIMEOUT = 12_000;

export async function rpcAnon<T>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT);

  try {
    const response = await fetch(`${BASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload: unknown = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const body = (payload ?? {}) as { code?: string; message?: string };
      return {
        data: null,
        error: {
          code: body.code ?? String(response.status),
          message: body.message ?? `HTTP ${response.status}`,
        },
      };
    }
    return { data: payload as T, error: null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      data: null,
      error: {
        code: aborted ? "TIMEOUT" : "NETWORK",
        message: aborted
          ? "Le serveur n'a pas répondu à temps."
          : "Impossible de joindre le serveur.",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Le message d'une erreur Supabase, dit en français quand on le peut.
 *
 * Les messages de la couche d'authentification arrivent en anglais et parlent
 * de « credentials » à quelqu'un qui vient de taper son mot de passe au
 * comptoir. Les erreurs que NOS fonctions SQL lèvent, elles, sont déjà écrites
 * pour être lues telles quelles.
 */
export function errorMessage(err: unknown, fallback = "Une erreur est survenue."): string {
  if (!err) return fallback;
  const raw =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "";

  if (!raw) return fallback;

  const map: Record<string, string> = {
    "Invalid login credentials": "Identifiants invalides",
    "Email not confirmed": "Cet email n'a pas encore été confirmé.",
    "User already registered": "Cet email est déjà utilisé par un autre compte.",
    "Failed to fetch": "Impossible de joindre le serveur. Vérifiez la connexion.",
  };
  for (const [needle, french] of Object.entries(map)) {
    if (raw.includes(needle)) return french;
  }
  return raw;
}
