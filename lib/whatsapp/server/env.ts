/**
 * =============================================================================
 *  LES RÉGLAGES SERVEUR DE LA PASSERELLE — et la DÉRIVATION de l'adresse du
 *  webhook
 * =============================================================================
 *
 *  ⚠️ TOUT CE QUI VIT SOUS `lib/whatsapp/server/` EST INTERDIT AU NAVIGATEUR.
 *  Ces fichiers ne sont importés QUE par le répartiteur de `app/api/whatsapp/`,
 *  et aucun d'eux ne porte `"use client"`. La règle est tenue par la revue et
 *  par le nom du dossier : rien n'empêche mécaniquement un composant client de
 *  les importer, mais un tel import se voit à l'œil nu — le chemin le dit.
 *
 *  AUCUNE DE CES VARIABLES NE PORTE LE PRÉFIXE `NEXT_PUBLIC_`. Ce préfixe est
 *  exactement ce qui ferait entrer la clé de la passerelle dans le paquet
 *  JavaScript téléchargé par chaque visiteur — c'est-à-dire le numéro WhatsApp
 *  du club offert à qui sait ouvrir l'onglet réseau.
 *
 *  ⚠️ `process.env` EST LU À L'APPEL, JAMAIS AU CHARGEMENT DU MODULE.
 *
 *  En ESM, les imports sont évalués AVANT le corps du fichier qui les importe :
 *  un module qui figerait `const KEY = process.env.X` à son chargement le
 *  ferait avant qu'un `.env.local` soit posé, et récolterait une valeur vide.
 *  Chez l'hébergeur le défaut est invisible — les variables y sont posées avant
 *  tout chargement — et il n'apparaît QUE sur le poste de développement. Ce
 *  qu'il casse, c'est la persistance, donc la file d'attente : tout message
 *  émis passerelle éteinte serait perdu, en silence. D'où des FONCTIONS.
 *
 *  ⚠️ L'ADRESSE DU WEBHOOK SE DÉDUIT DU DOMAINE SUR LEQUEL L'APPLICATION RÉPOND.
 *
 *  Elle ne vient JAMAIS d'une variable, et ce pour deux raisons vécues :
 *
 *   1. le webhook est stocké SUR LA PASSERELLE, pas dans l'application : il
 *      survit à un déménagement et continue de pointer vers l'ancienne adresse.
 *      Les messages partent, aucun accusé ne revient, et rien nulle part ne
 *      signale d'erreur ;
 *   2. recopier un `.env` local en bloc vers l'hébergeur emporte
 *      `http://host.docker.internal:3000` — l'adresse du poste de
 *      développement vue depuis le conteneur — et la mise en service échoue sur
 *      une 400 muette.
 *
 *  Donc : en production, toute valeur locale ou non-HTTPS est ÉCARTÉE et
 *  NOMMÉE dans le diagnostic. Une variable mal recopiée ne casse plus rien ;
 *  elle se voit.
 */

/** Une variable posée mais vide vaut ABSENTE : `??` ne l'aurait pas rattrapée. */
function env(name: string): string | undefined {
  const raw = process.env[name];
  const clean = typeof raw === "string" ? raw.trim() : "";
  return clean.length > 0 ? clean : undefined;
}

/** Retire le slash final : l'adresse est comparée AU CARACTÈRE PRÈS avec le
 *  `SERVER_URL` estampillé par la passerelle dans chaque accusé de remise. Un
 *  slash en trop d'un seul côté ⇒ tous les accusés refusés en 403. */
function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export interface GatewayEnv {
  /** adresse publique de la passerelle, sans slash final */
  baseUrl?: string;
  /** clé d'API — doit valoir EXACTEMENT `AUTHENTICATION_API_KEY` du conteneur */
  apiKey?: string;
  /** nom de l'instance côté passerelle */
  instance: string;
  /** le `Bearer` que la passerelle présentera à chaque accusé de remise */
  webhookToken?: string;
  /** projet Supabase visé par le journal et la file (écriture clé de service) */
  supabaseUrl?: string;
  supabaseServiceKey?: string;
}

/** Le nom d'instance par défaut, quand rien n'est posé. */
const DEFAULT_INSTANCE = "station";

export function gatewayEnv(): GatewayEnv {
  return {
    // `TUNNEL_PUBLIC_URL` sert de repli : l'adresse s'écrit à DEUX endroits qui
    // doivent rester identiques au caractère près (le `SERVER_URL` du conteneur
    // et la variable de l'application). Sur le poste de développement, une
    // seule valeur à tenir juste vaut mieux que deux qui divergeront.
    baseUrl: (() => {
      const raw = env("EVOLUTION_BASE_URL") ?? env("TUNNEL_PUBLIC_URL");
      return raw ? trimSlash(raw) : undefined;
    })(),
    apiKey: env("EVOLUTION_API_KEY"),
    instance: env("EVOLUTION_INSTANCE") ?? DEFAULT_INSTANCE,
    webhookToken: env("EVOLUTION_WEBHOOK_TOKEN"),
    supabaseUrl: env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseServiceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

/** Les deux variables sans lesquelles rien ne peut partir. */
export function isConfigured(e: GatewayEnv = gatewayEnv()): boolean {
  return !!e.baseUrl && !!e.apiKey;
}

/** Le journal et la file sont-ils écrivables ? Sans clé de service, l'envoi
 *  direct fonctionne toujours — mais l'application le DIT au lieu de le taire. */
export function hasPersistence(e: GatewayEnv = gatewayEnv()): boolean {
  return !!e.supabaseUrl && !!e.supabaseServiceKey;
}

/** L'hôte SEUL d'une adresse — jamais le chemin, jamais la clé. C'est tout ce
 *  que l'écran de réglages a le droit d'afficher : il est ouvert devant du
 *  personnel administratif et visible dans l'onglet réseau du navigateur. */
export function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Le nom d'instance, masqué : deux caractères, puis des points. */
export function maskInstance(instance: string | undefined): string | null {
  if (!instance) return null;
  if (instance.length <= 2) return `${instance[0] ?? ""}•••`;
  return `${instance.slice(0, 2)}${"•".repeat(Math.max(3, instance.length - 2))}`;
}

/** Ce déploiement est-il une PRÉVISUALISATION ? Les variables étant partagées
 *  entre production et prévisualisation, une branche parle à la MÊME passerelle
 *  et au MÊME emplacement de webhook : `setup` et `logout` y sont refusés. */
export function isPreviewDeployment(): boolean {
  return env("VERCEL_ENV") === "preview";
}

export interface WebhookTarget {
  /** l'adresse complète que la passerelle doit appeler */
  url: string | null;
  /** la variable écartée, et pourquoi — à afficher dans le diagnostic */
  ignored: string | null;
}

/**
 * L'ADRESSE DU WEBHOOK, DÉDUITE DU DOMAINE COURANT.
 *
 * `host` et `proto` viennent de la requête elle-même : c'est la seule source
 * qui ne peut pas mentir sur l'endroit où l'application répond réellement.
 *
 * En production, une adresse locale (`localhost`, `127.0.0.1`,
 * `host.docker.internal`) ou non-HTTPS est ÉCARTÉE et nommée : c'est
 * exactement le cas d'un `.env` recopié en bloc. En développement, l'inverse :
 * on accepte l'adresse locale, puisque c'est la seule qui existe.
 */
export function webhookTarget(host: string, proto: string): WebhookTarget {
  const declared = env("EVOLUTION_WEBHOOK_URL");
  const derived = `${proto}://${host}/api/whatsapp/webhook`;
  const local = /^(localhost|127\.0\.0\.1|host\.docker\.internal|0\.0\.0\.0)(:|$)/i.test(host);
  const production = process.env.NODE_ENV === "production";

  let ignored: string | null = null;
  if (declared) {
    // La variable ne devrait PAS exister. Si elle existe, on ne l'utilise pas —
    // mais on le dit, parce que celui qui l'a posée croit qu'elle sert.
    ignored =
      `EVOLUTION_WEBHOOK_URL est définie (« ${hostOf(declared) ?? declared} ») mais ELLE N'EST PAS UTILISÉE : ` +
      `l'adresse du webhook se déduit du domaine sur lequel l'application répond. Supprimez-la chez l'hébergeur.`;
  }

  if (production && (local || proto !== "https")) {
    return {
      url: null,
      ignored:
        (ignored ? `${ignored} ` : "") +
        `L'application répond sur « ${proto}://${host} », qui n'est ni public ni HTTPS : ` +
        `la passerelle ne pourrait pas l'appeler. Aucun webhook n'est enregistré.`,
    };
  }

  return { url: derived, ignored };
}
