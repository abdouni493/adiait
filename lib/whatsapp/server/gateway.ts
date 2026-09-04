/**
 * =============================================================================
 *  LE CLIENT DE LA PASSERELLE — le SEUL fichier qui détient la clé
 * =============================================================================
 *
 *  Le navigateur ne parle JAMAIS à la passerelle. Une seule route serveur la
 *  touche, et elle passe par ici.
 *
 *  TROIS DÉCISIONS QUI ONT CHACUNE COÛTÉ UNE MISE EN SERVICE :
 *
 *  1. CHAQUE ÉCHEC PORTE SA CAUSE SYSTÈME (`ECONNRESET`, `ENOTFOUND`,
 *     `ETIMEDOUT`, `HTTP_401`…), l'hôte visé, et CE QU'IL FAUT FAIRE — jamais
 *     la clé. C'est le changement le plus rentable de tout le montage : tant que
 *     chaque échec réseau rendait la même phrase, rien n'était diagnosticable.
 *
 *  2. L'IDEMPOTENCE EST DÉCLARÉE APPEL PAR APPEL, JAMAIS DÉDUITE DU VERBE HTTP.
 *     L'hébergeur étant serverless, la fonction est gelée entre deux requêtes et
 *     son pool garde des sockets que la passerelle a fermées entre-temps : la
 *     première requête d'une fonction réveillée tombe sur une socket morte
 *     (`ECONNRESET`) sans que rien ne soit cassé nulle part. D'où une reprise —
 *     mais `/message/sendText` N'EST JAMAIS REJOUÉ : un message posté deux fois
 *     chez une famille est PIRE qu'un envoi manqué, que la file rattrape de
 *     toute façon. `/instance/create`, lui, est parfaitement idempotent, et
 *     c'est justement le bouton sur lequel la réception tombe.
 *
 *  3. UNE RÉPONSE HTTP, MÊME EN ERREUR, PROUVE QUE LA PASSERELLE EST JOIGNABLE.
 *     Ce n'est PAS le cas « poste éteint », et la file d'attente ne doit pas
 *     s'en saisir comme tel — sinon un refus légitime (numéro sans compte
 *     WhatsApp) attendrait éternellement dans la file.
 */

import { gatewayEnv, hostOf, type GatewayEnv } from "./env";

/** Deux reprises courtes, sous un BUDGET DE TEMPS — et non un seuil de délai
 *  fixe : une demande de QR attend jusqu'à 30 s et ne doit pas être écartée de
 *  la reprise alors qu'elle en a largement le temps. */
const RETRY_DELAYS_MS = [250, 900];
const RETRY_BUDGET_MS = 12_000;

/** Délai maximal d'un appel à la passerelle. La demande de QR est la plus
 *  longue : la passerelle attend que Baileys ait produit le code. */
const CALL_TIMEOUT_MS = 30_000;

export class GatewayError extends Error {
  /** cause système ou HTTP : `ECONNRESET`, `ENOTFOUND`, `HTTP_401`… */
  readonly code: string;
  /** l'hôte visé — jamais l'URL complète, jamais la clé */
  readonly host: string | null;
  /** la passerelle n'a PAS répondu : le poste est probablement éteint */
  readonly unreachable: boolean;
  /** ce qu'il faut faire, en une phrase */
  readonly hint: string;

  constructor(opts: {
    code: string;
    host: string | null;
    unreachable: boolean;
    message: string;
    hint: string;
  }) {
    super(opts.message);
    this.name = "GatewayError";
    this.code = opts.code;
    this.host = opts.host;
    this.unreachable = opts.unreachable;
    this.hint = opts.hint;
  }
}

/** La cause système d'une erreur `fetch`, telle que Node la range. */
function systemCode(err: unknown): string {
  const cause = (err as { cause?: { code?: string } } | undefined)?.cause;
  if (cause?.code) return cause.code;
  if (err instanceof Error && err.name === "TimeoutError") return "ETIMEDOUT";
  if (err instanceof Error && err.name === "AbortError") return "ETIMEDOUT";
  return "ENETWORK";
}

function hintFor(code: string, host: string | null): string {
  switch (code) {
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `La passerelle « ${host ?? "?"} » ne répond pas. Vérifiez que le poste qui l'héberge est allumé, que Docker tourne, et que le Funnel Tailscale est bien accordé.`;
    case "ECONNRESET":
      return `La liaison avec « ${host ?? "?"} » a été coupée en cours de route. C'est souvent une socket gelée côté hébergeur : réessayez.`;
    case "ETIMEDOUT":
      return `La passerelle « ${host ?? "?"} » n'a pas répondu à temps. Le poste est peut-être en veille.`;
    case "HTTP_401":
    case "HTTP_403":
      return `La clé d'API est refusée par la passerelle. « EVOLUTION_API_KEY » doit valoir EXACTEMENT « AUTHENTICATION_API_KEY » du conteneur.`;
    case "HTTP_404":
      return `L'instance demandée n'existe pas encore sur la passerelle. Cliquez sur « Initialiser l'instance ».`;
    default:
      return `Échec de l'appel à la passerelle (${code}).`;
  }
}

interface CallOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  /** L'appel peut-il être REJOUÉ sans effet de bord ? Déclaré, jamais déduit. */
  idempotent: boolean;
  /** les statuts HTTP à accepter comme succès en plus de 2xx */
  tolerate?: number[];
}

async function call<T>(opts: CallOptions, e: GatewayEnv = gatewayEnv()): Promise<T> {
  const host = hostOf(e.baseUrl);
  if (!e.baseUrl || !e.apiKey) {
    throw new GatewayError({
      code: "NOT_CONFIGURED",
      host,
      unreachable: true,
      message: "La passerelle n'est pas configurée.",
      hint: "Posez EVOLUTION_BASE_URL et EVOLUTION_API_KEY chez l'hébergeur, puis redéployez : ces variables ne sont lues qu'au déploiement.",
    });
  }

  const started = Date.now();
  let attempt = 0;

  for (;;) {
    try {
      const res = await fetch(`${e.baseUrl}${opts.path}`, {
        method: opts.method,
        headers: {
          "content-type": "application/json",
          apikey: e.apiKey,
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        cache: "no-store",
      });

      const text = await res.text();
      const parsed = text ? safeJson(text) : null;

      if (!res.ok && !(opts.tolerate ?? []).includes(res.status)) {
        // UNE RÉPONSE, MÊME EN ERREUR, PROUVE QUE LA PASSERELLE EST JOIGNABLE.
        // `unreachable: false` : la file ne doit pas s'en saisir comme d'une
        // panne de poste.
        throw new GatewayError({
          code: `HTTP_${res.status}`,
          host,
          unreachable: false,
          message: messageOf(parsed) ?? `La passerelle a répondu ${res.status}.`,
          hint: hintFor(`HTTP_${res.status}`, host),
        });
      }
      return (parsed ?? {}) as T;
    } catch (err) {
      if (err instanceof GatewayError) throw err;

      const code = systemCode(err);
      const canRetry =
        opts.idempotent &&
        attempt < RETRY_DELAYS_MS.length &&
        Date.now() - started < RETRY_BUDGET_MS;

      if (!canRetry) {
        throw new GatewayError({
          code,
          host,
          unreachable: true,
          message: `La passerelle « ${host ?? "?"} » est injoignable (${code}).`,
          hint: hintFor(code, host),
        });
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      attempt += 1;
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function messageOf(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const response = o.response as Record<string, unknown> | undefined;
  const nested = response?.message;
  const value = nested ?? o.message ?? o.error;
  if (Array.isArray(value)) return value.map(String).join(" · ");
  return typeof value === "string" ? value : null;
}

// ---------------------------------------------------------------------------
//  Les appels
// ---------------------------------------------------------------------------

export interface InstanceState {
  exists: boolean;
  /** `open` = un téléphone est lié et la session est ouverte */
  state: string;
  phoneNumber: string | null;
  profileName: string | null;
}

/**
 * L'ÉTAT DE L'INSTANCE.
 *
 * `fetchInstances` est préféré à `connectionState` : il rend en plus le numéro
 * lié et le nom du profil, que l'écran de réglages affiche pour prouver que
 * c'est bien LE BON téléphone qui a été scanné.
 */
export async function fetchInstance(e: GatewayEnv = gatewayEnv()): Promise<InstanceState> {
  const data = await call<unknown>(
    {
      method: "GET",
      path: `/instance/fetchInstances?instanceName=${encodeURIComponent(e.instance)}`,
      idempotent: true,
      tolerate: [404],
    },
    e,
  );

  const list = Array.isArray(data) ? data : data ? [data] : [];
  const row = list
    .map((item) => {
      const o = item as Record<string, unknown>;
      // Evolution v2 rend la fiche à plat ; v2.1 la niche sous `instance`.
      return (o.instance as Record<string, unknown> | undefined) ?? o;
    })
    .find((o) => (o.instanceName ?? o.name) === e.instance);

  if (!row) return { exists: false, state: "close", phoneNumber: null, profileName: null };

  const raw = String(row.connectionStatus ?? row.status ?? row.state ?? "close");
  const owner = String(row.ownerJid ?? row.owner ?? "");
  return {
    exists: true,
    state: raw,
    phoneNumber: owner ? `+${owner.split("@")[0].split(":")[0]}` : null,
    profileName: (row.profileName as string) ?? null,
  };
}

/**
 * CRÉE L'INSTANCE — et AVALE « already in use ».
 *
 * C'est le résultat ATTENDU au deuxième appel, et ce bouton doit rester
 * cliquable sur une session déjà ouverte : c'est par lui qu'on répare un webhook
 * périmé sans délier le téléphone.
 */
export async function createInstance(e: GatewayEnv = gatewayEnv()): Promise<void> {
  try {
    await call(
      {
        method: "POST",
        path: "/instance/create",
        body: {
          instanceName: e.instance,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        },
        // POST parfaitement idempotent : le second appel dit « déjà prise »,
        // ce qui est le résultat voulu.
        idempotent: true,
        tolerate: [403],
      },
      e,
    );
  } catch (err) {
    const already =
      err instanceof GatewayError && /already in use|already exists/i.test(err.message);
    if (!already) throw err;
  }
}

export interface ConnectResult {
  qr: string | null;
  pairingCode: string | null;
  state: string;
}

/** Demande le QR (ou le code de couplage). L'appel peut attendre jusqu'à 30 s :
 *  la passerelle attend que Baileys ait produit le code. */
export async function connectInstance(e: GatewayEnv = gatewayEnv()): Promise<ConnectResult> {
  const data = await call<Record<string, unknown>>(
    { method: "GET", path: `/instance/connect/${encodeURIComponent(e.instance)}`, idempotent: true },
    e,
  );
  const base64 = (data.base64 as string) ?? null;
  const qrObject = data.qrcode as Record<string, unknown> | undefined;
  const qr = base64 ?? ((qrObject?.base64 as string) ?? null);
  return {
    qr: qr ? (qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`) : null,
    pairingCode: (data.pairingCode as string) ?? (qrObject?.pairingCode as string) ?? null,
    state: String(data.instance ? "connecting" : (data.state ?? "connecting")),
  };
}

export async function restartInstance(e: GatewayEnv = gatewayEnv()): Promise<void> {
  await call(
    { method: "PUT", path: `/instance/restart/${encodeURIComponent(e.instance)}`, idempotent: true },
    e,
  );
}

export async function logoutInstance(e: GatewayEnv = gatewayEnv()): Promise<void> {
  await call(
    {
      method: "DELETE",
      path: `/instance/logout/${encodeURIComponent(e.instance)}`,
      idempotent: true,
      tolerate: [404],
    },
    e,
  );
}

/** Les évènements que l'application veut recevoir. Rien d'autre : chaque
 *  évènement inutile est une requête de plus vers une fonction serverless. */
const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE"];

/**
 * ENREGISTRE LE WEBHOOK SUR LA PASSERELLE.
 *
 * Le jeton part dans l'en-tête `Authorization`, que la passerelle recopiera à
 * chaque accusé. L'endpoint le compare — ET compare aussi le `server_url` du
 * corps : deux contrôles, pas un.
 */
export async function setWebhook(
  url: string,
  token: string,
  e: GatewayEnv = gatewayEnv(),
): Promise<void> {
  await call(
    {
      method: "POST",
      path: `/webhook/set/${encodeURIComponent(e.instance)}`,
      body: {
        webhook: {
          enabled: true,
          url,
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          byEvents: false,
          base64: false,
          events: WEBHOOK_EVENTS,
        },
      },
      idempotent: true,
    },
    e,
  );
}

export interface WebhookRecord {
  url: string | null;
  /** le jeton RÉELLEMENT enregistré, comparé au nôtre — jamais renvoyé au
   *  navigateur, seulement le verdict de la comparaison */
  authorization: string | null;
  enabled: boolean;
}

/**
 * RELIT LE WEBHOOK ENREGISTRÉ.
 *
 * Constater que la variable existe côté serveur ne dit RIEN de ce que la
 * passerelle enverra : les deux divergent dès qu'on régénère la variable sans
 * réenregistrer le webhook. Les messages partent, les accusés reviennent en
 * 401, et l'écran affiche « prête ». D'où cette relecture.
 */
export async function findWebhook(e: GatewayEnv = gatewayEnv()): Promise<WebhookRecord> {
  try {
    const data = await call<Record<string, unknown>>(
      {
        method: "GET",
        path: `/webhook/find/${encodeURIComponent(e.instance)}`,
        idempotent: true,
        tolerate: [404],
      },
      e,
    );
    const row = (data.webhook as Record<string, unknown> | undefined) ?? data;
    const headers = (row.headers as Record<string, string> | undefined) ?? {};
    return {
      url: (row.url as string) ?? null,
      authorization: headers.authorization ?? headers.Authorization ?? null,
      enabled: row.enabled !== false && !!row.url,
    };
  } catch (err) {
    if (err instanceof GatewayError && err.code === "HTTP_404") {
      return { url: null, authorization: null, enabled: false };
    }
    throw err;
  }
}

export interface SendTextResult {
  messageId: string | null;
}

/**
 * ENVOIE UN MESSAGE TEXTE.
 *
 * ⚠️ `idempotent: false` — CET APPEL N'EST JAMAIS REJOUÉ. Un message posté deux
 * fois chez une famille est pire qu'un envoi manqué : le manqué, la file le
 * rattrape ; le doublon, personne ne le reprend.
 */
export async function sendText(
  msisdn: string,
  text: string,
  e: GatewayEnv = gatewayEnv(),
): Promise<SendTextResult> {
  const data = await call<Record<string, unknown>>(
    {
      method: "POST",
      path: `/message/sendText/${encodeURIComponent(e.instance)}`,
      body: { number: msisdn, text, delay: 0, linkPreview: false },
      idempotent: false,
    },
    e,
  );
  const key = data.key as Record<string, unknown> | undefined;
  return { messageId: (key?.id as string) ?? (data.id as string) ?? null };
}
