/**
 * =============================================================================
 *  LES SIX ROUTES WHATSAPP, ÉCRITES UNE SEULE FOIS
 * =============================================================================
 *
 *  ```
 *  POST /api/whatsapp/send           envoi
 *  POST /api/whatsapp/webhook        accusés de remise
 *  GET  /api/whatsapp/status         état de session, pour l'écran de réglages
 *  POST /api/whatsapp/session        setup | connect | restart | logout
 *  GET  /api/whatsapp/outbox         comptage des messages en attente
 *  POST /api/whatsapp/outbox/flush   vidage de la file
 *  ```
 *
 *  Ce module ne connaît NI Next.js, NI l'hébergeur : il reçoit
 *  `{ path, method, body, headers, host, proto }` et rend `{ status, body }`.
 *  L'adaptateur de `app/api/whatsapp/[...path]/route.ts` ne fait que traduire.
 *
 *  ⚠️ LE CHEMIN EST LU SUR L'URL DE LA REQUÊTE, PAS SUR LE PARAMÈTRE DE ROUTAGE.
 *  Avec une route attrape-tout, le segment arrive VIDE en production chez
 *  certains hébergeurs : la fonction est bien invoquée, mais le paramètre n'est
 *  jamais injecté, et TOUTES les routes tombent sur « Route inconnue ». L'URL,
 *  elle, est toujours là. L'adaptateur garde le paramètre en repli.
 */

import {
  MAX_FLUSH_BATCH,
  MAX_RECIPIENTS_PER_CALL,
  MAX_MESSAGE_LENGTH,
  REQUEST_BUDGET_MS,
  nextPacingDelay,
  type GatewayStatus,
  type OutgoingRecipient,
  type SendResponse,
  type SendResult,
  type WebhookState,
} from "../core";
import { normalizePhone } from "../phone";
import {
  gatewayEnv,
  hasPersistence,
  hostOf,
  isConfigured,
  isPreviewDeployment,
  maskInstance,
  webhookTarget,
} from "./env";
import {
  GatewayError,
  connectInstance,
  createInstance,
  fetchInstance,
  findWebhook,
  logoutInstance,
  restartInstance,
  sendText,
  setWebhook,
} from "./gateway";
import {
  advanceStatus,
  attachGatewayId,
  countOutbox,
  dequeue,
  enqueue,
  logMessage,
  noteFailure,
  pendingBatch,
} from "./store";

export interface RouterRequest {
  /** le chemin complet, tel que l'URL le porte (« /api/whatsapp/send ») */
  path: string;
  method: string;
  body: unknown;
  headers: Record<string, string | undefined>;
  host: string;
  proto: string;
}

export interface RouterResponse {
  status: number;
  body: unknown;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * LE DERNIER SEGMENT UTILE DU CHEMIN, quels que soient les préfixes.
 *
 * Exporté pour être FIGÉ PAR UN TEST : le chemin arrive sous deux conventions
 * selon l'hébergeur (chemin complet `/api/whatsapp/send`, ou segment nu
 * `send`), et une régression ici ferait tomber les six routes d'un coup sur
 * « Route inconnue » — en production seulement.
 */
export function routeOf(path: string): string {
  const clean = path.split("?")[0].replace(/\/+$/, "");
  const marker = "/api/whatsapp";
  const at = clean.indexOf(marker);
  return at >= 0 ? clean.slice(at + marker.length).replace(/^\//, "") : clean.replace(/^\//, "");
}

export async function handleWhatsApp(req: RouterRequest): Promise<RouterResponse> {
  const route = routeOf(req.path);
  const method = req.method.toUpperCase();

  if (route === "status" && method === "GET") return status(req);
  if (route === "send" && method === "POST") return send(req);
  if (route === "session" && method === "POST") return session(req);
  if (route === "webhook" && method === "POST") return webhook(req);
  if (route === "outbox" && method === "GET") return outbox();
  if (route === "outbox/flush" && method === "POST") return flush();

  return { status: 404, body: { error: `Route inconnue : ${method} /api/whatsapp/${route}` } };
}

// ---------------------------------------------------------------------------
//  GET /status
// ---------------------------------------------------------------------------

async function status(req: RouterRequest): Promise<RouterResponse> {
  const e = gatewayEnv();
  const target = webhookTarget(req.host, req.proto);
  const counts = hasPersistence(e) ? await countOutbox() : { pending: 0, abandoned: 0 };

  const base: GatewayStatus = {
    configured: isConfigured(e),
    reachable: false,
    instanceExists: false,
    connected: false,
    phoneNumber: null,
    profileName: null,
    gatewayHost: hostOf(e.baseUrl),
    instanceMasked: maskInstance(e.instance),
    webhook: "missing",
    webhookHost: null,
    expectedWebhookHost: hostOf(target.url),
    persistence: hasPersistence(e),
    ignoredEnv: target.ignored,
    preview: isPreviewDeployment(),
    pending: counts.pending,
    error: null,
    hint: null,
  };

  if (!base.configured) {
    return {
      status: 200,
      body: {
        ...base,
        error: "La passerelle n'est pas configurée.",
        hint: "Posez EVOLUTION_BASE_URL et EVOLUTION_API_KEY chez l'hébergeur, puis REDÉPLOYEZ : les variables ne sont lues qu'au déploiement.",
      } satisfies GatewayStatus,
    };
  }

  try {
    const instance = await fetchInstance(e);
    base.reachable = true;
    base.instanceExists = instance.exists;
    base.connected = instance.state === "open";
    base.phoneNumber = instance.phoneNumber;
    base.profileName = instance.profileName;

    if (instance.exists) {
      const hook = await findWebhook(e);
      base.webhookHost = hostOf(hook.url);
      base.webhook = webhookVerdict(hook, target.url, e.webhookToken);
    }

    if (!instance.exists) {
      base.hint = "L'instance n'existe pas encore sur la passerelle : cliquez sur « Initialiser l'instance ».";
    } else if (!base.connected) {
      base.hint = "Aucun téléphone lié : cliquez sur « Afficher le QR » puis scannez-le depuis WhatsApp → Appareils connectés.";
    } else if (base.webhook !== "verified") {
      base.hint = webhookHint(base.webhook);
    }
  } catch (err) {
    const g = err instanceof GatewayError ? err : null;
    base.error = g ? `${g.code} — ${g.message}` : "Échec de l'appel à la passerelle.";
    base.hint = g?.hint ?? null;
    base.reachable = g ? !g.unreachable : false;
  }

  return { status: 200, body: base };
}

function webhookVerdict(
  hook: { url: string | null; authorization: string | null; enabled: boolean },
  expected: string | null,
  token: string | undefined,
): WebhookState {
  if (!hook.url || !hook.enabled) return "missing";
  // L'adresse est comparée AU CARACTÈRE PRÈS : un slash de plus d'un côté ⇒
  // tous les accusés en 403, et rien nulle part ne le dit.
  if (!expected || hook.url.replace(/\/+$/, "") !== expected.replace(/\/+$/, "")) return "stale";
  if (!token || hook.authorization !== `Bearer ${token}`) return "token-mismatch";
  return "verified";
}

function webhookHint(state: WebhookState): string {
  switch (state) {
    case "missing":
      return "Aucun webhook enregistré : les messages partiront, mais aucun accusé de remise ne reviendra. Cliquez sur « Réenregistrer le webhook ».";
    case "stale":
      return "Le webhook enregistré pointe vers une AUTRE adresse que celle où l'application répond — typiquement l'ancien domaine après un déménagement. Cliquez sur « Réenregistrer le webhook ».";
    case "token-mismatch":
      return "Le jeton enregistré sur la passerelle n'est plus celui qu'attend l'application : chaque accusé de remise sera refusé en 401. Cliquez sur « Réenregistrer le webhook ».";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
//  POST /send
// ---------------------------------------------------------------------------

interface SendBody {
  recipients?: OutgoingRecipient[];
}

async function send(req: RouterRequest): Promise<RouterResponse> {
  const e = gatewayEnv();
  const body = (req.body ?? {}) as SendBody;
  const all = Array.isArray(body.recipients) ? body.recipients : [];
  if (all.length === 0) return { status: 400, body: { error: "Aucun destinataire." } };

  const started = Date.now();
  const results: SendResult[] = [];
  let gatewayDown = false;

  // Au-delà du plafond, LE RESTE PART EN FILE plutôt que d'être envoyé plus
  // vite : la cadence ne se négocie pas.
  const direct = all.slice(0, MAX_RECIPIENTS_PER_CALL);
  const overflow = all.slice(MAX_RECIPIENTS_PER_CALL);

  for (let i = 0; i < direct.length; i++) {
    const r = direct[i];
    const normalized = normalizePhone(r.phone);

    // UN NUMÉRO INVALIDE EST REFUSÉ TOUT DE SUITE, jamais mis en file : le
    // découvrir trois jours plus tard au fond d'un journal ne sert personne.
    if (!normalized) {
      results.push({
        name: r.name,
        phone: r.phone,
        status: "failed",
        error: "Numéro inexploitable.",
      });
      continue;
    }

    const text = (r.text ?? "").slice(0, MAX_MESSAGE_LENGTH);
    if (!text.trim()) {
      results.push({ name: r.name, phone: r.phone, status: "failed", error: "Message vide." });
      continue;
    }

    const id = uid();
    await logMessage({
      id,
      recipientName: r.name,
      recipientPhone: normalized.display,
      body: text,
      status: "queued",
      studentId: r.studentId,
      parentId: r.parentId,
      origin: r.origin,
    });

    // LE BUDGET DE TEMPS : au-delà, le reste part en FILE plutôt que d'être
    // coupé en plein vol par l'hébergeur.
    if (Date.now() - started > REQUEST_BUDGET_MS || gatewayDown) {
      await enqueue({
        id,
        recipientName: r.name,
        recipientPhone: normalized.msisdn,
        body: text,
        studentId: r.studentId,
        parentId: r.parentId,
        origin: r.origin,
      });
      results.push({ name: r.name, phone: normalized.display, status: "queued" });
      continue;
    }

    try {
      const sent = await sendText(normalized.msisdn, text, e);
      await attachGatewayId(id, sent.messageId);
      results.push({
        name: r.name,
        phone: normalized.display,
        status: "sent",
        messageId: sent.messageId ?? undefined,
      });
    } catch (err) {
      const g = err instanceof GatewayError ? err : null;
      if (!g || g.unreachable) {
        // Passerelle injoignable : ce n'est PAS un échec. Le message attend.
        gatewayDown = true;
        await enqueue({
          id,
          recipientName: r.name,
          recipientPhone: normalized.msisdn,
          body: text,
          studentId: r.studentId,
          parentId: r.parentId,
          origin: r.origin,
        });
        results.push({
          name: r.name,
          phone: normalized.display,
          status: "queued",
          error: g?.code ?? "ENETWORK",
        });
      } else {
        await logMessage({
          id,
          recipientName: r.name,
          recipientPhone: normalized.display,
          body: text,
          status: "failed",
          studentId: r.studentId,
          parentId: r.parentId,
          origin: r.origin,
          error: g.message,
        });
        results.push({
          name: r.name,
          phone: normalized.display,
          status: "failed",
          error: g.message,
        });
      }
    }

    // La temporisation ne s'applique qu'ENTRE deux envois réels.
    if (i < direct.length - 1 && !gatewayDown) await sleep(nextPacingDelay());
  }

  for (const r of overflow) {
    const normalized = normalizePhone(r.phone);
    if (!normalized) {
      results.push({
        name: r.name,
        phone: r.phone,
        status: "failed",
        error: "Numéro inexploitable.",
      });
      continue;
    }
    const id = uid();
    const text = (r.text ?? "").slice(0, MAX_MESSAGE_LENGTH);
    await logMessage({
      id,
      recipientName: r.name,
      recipientPhone: normalized.display,
      body: text,
      status: "queued",
      studentId: r.studentId,
      parentId: r.parentId,
      origin: r.origin,
    });
    await enqueue({
      id,
      recipientName: r.name,
      recipientPhone: normalized.msisdn,
      body: text,
      studentId: r.studentId,
      parentId: r.parentId,
      origin: r.origin,
    });
    results.push({ name: r.name, phone: normalized.display, status: "queued" });
  }

  const response: SendResponse = {
    sent: results.filter((r) => r.status === "sent").length,
    queued: results.filter((r) => r.status === "queued").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
    gatewayDown,
  };
  return { status: 200, body: response };
}

// ---------------------------------------------------------------------------
//  POST /session — setup | connect | restart | logout
// ---------------------------------------------------------------------------

async function session(req: RouterRequest): Promise<RouterResponse> {
  const e = gatewayEnv();
  const action = String((req.body as { action?: string } | null)?.action ?? "");

  /**
   * LE GARDE-FOU DES DÉPLOIEMENTS DE PRÉVISUALISATION.
   *
   * Il n'y a qu'UNE passerelle, qu'UNE instance et qu'UN emplacement de
   * webhook — et le webhook est stocké SUR la passerelle, pas dans
   * l'application. Les variables étant partagées, chaque branche parle à la
   * même passerelle : `setup` réécrirait le webhook vers l'adresse de la
   * prévisualisation (la production continuerait d'envoyer et ne recevrait plus
   * AUCUN accusé, sans la moindre erreur nulle part), et `logout` délierait le
   * téléphone du poste. `connect` et `restart` ne réécrivent rien de durable.
   */
  if (isPreviewDeployment() && (action === "setup" || action === "logout")) {
    return {
      status: 409,
      body: {
        ok: false,
        error: "Action refusée depuis un déploiement de prévisualisation.",
        hint: "Il n'existe qu'une passerelle et qu'un emplacement de webhook. Faites-le depuis le site de PRODUCTION.",
      },
    };
  }

  try {
    switch (action) {
      case "setup": {
        await createInstance(e);
        const target = webhookTarget(req.host, req.proto);
        if (!target.url) {
          return {
            status: 400,
            body: {
              ok: false,
              error: "Aucune adresse de webhook exploitable.",
              hint: target.ignored ?? "L'application doit répondre sur une adresse publique en HTTPS.",
            },
          };
        }
        if (!e.webhookToken) {
          return {
            status: 400,
            body: {
              ok: false,
              error: "EVOLUTION_WEBHOOK_TOKEN n'est pas posée.",
              hint: "Sans jeton, n'importe qui pourrait forger un accusé de remise. Posez la variable chez l'hébergeur, puis redéployez.",
            },
          };
        }
        await setWebhook(target.url, e.webhookToken, e);
        const state = await fetchInstance(e);
        return { status: 200, body: { ok: true, state: state.state } };
      }
      case "connect": {
        const res = await connectInstance(e);
        return { status: 200, body: { ok: true, ...res } };
      }
      case "restart": {
        await restartInstance(e);
        return { status: 200, body: { ok: true } };
      }
      case "logout": {
        await logoutInstance(e);
        return { status: 200, body: { ok: true } };
      }
      default:
        return { status: 400, body: { ok: false, error: `Action inconnue : « ${action} ».` } };
    }
  } catch (err) {
    const g = err instanceof GatewayError ? err : null;
    return {
      status: g?.unreachable ? 503 : 502,
      body: {
        ok: false,
        error: g ? `${g.code} — ${g.message}` : "Échec de l'appel à la passerelle.",
        hint: g?.hint,
      },
    };
  }
}

// ---------------------------------------------------------------------------
//  POST /webhook — les accusés de remise
// ---------------------------------------------------------------------------

/** Les statuts que la passerelle remonte, traduits. */
const STATUS_MAP: Record<string, "sent" | "delivered" | "read" | "failed"> = {
  PENDING: "sent",
  SERVER_ACK: "sent",
  DELIVERY_ACK: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};

async function webhook(req: RouterRequest): Promise<RouterResponse> {
  const e = gatewayEnv();

  /**
   * DEUX CONTRÔLES, PAS UN.
   *
   *  1. le `Bearer` que nous avons nous-mêmes enregistré sur la passerelle ;
   *  2. le champ `server_url` du corps, comparé AU CARACTÈRE PRÈS à l'adresse
   *     déclarée — c'est ce qui distingue NOTRE passerelle d'une autre qui
   *     connaîtrait le jeton.
   *
   * SANS JETON ⇒ 401, sans exception : c'est ce que le script de diagnostic
   * éprouve.
   */
  const auth = req.headers["authorization"] ?? req.headers["Authorization"];
  if (!e.webhookToken || auth !== `Bearer ${e.webhookToken}`) {
    return { status: 401, body: { error: "Jeton absent ou invalide." } };
  }

  const payload = (req.body ?? {}) as Record<string, unknown>;
  const serverUrl = String(payload.server_url ?? payload.serverUrl ?? "");
  if (e.baseUrl && serverUrl && serverUrl.replace(/\/+$/, "") !== e.baseUrl) {
    return { status: 403, body: { error: "server_url inattendu." } };
  }

  // LES ÉVÈNEMENTS INCONNUS SONT ACCEPTÉS ET IGNORÉS : c'est ce qui permet au
  // script de diagnostic d'éprouver l'authentification sans rien écrire.
  const event = String(payload.event ?? "");
  if (event !== "messages.update" && event !== "MESSAGES_UPDATE") {
    return { status: 200, body: { ok: true, ignored: event || "sans évènement" } };
  }

  const data = payload.data;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  for (const row of rows as Record<string, unknown>[]) {
    const key = row.key as Record<string, unknown> | undefined;
    const id = String(key?.id ?? row.keyId ?? "");
    const raw = String(row.status ?? row.update ?? "");
    const status = STATUS_MAP[raw.toUpperCase()];
    if (id && status) await advanceStatus(id, status, status === "failed" ? raw : null);
  }
  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------------------------
//  GET /outbox — compter, sans jamais appeler la passerelle
// ---------------------------------------------------------------------------

async function outbox(): Promise<RouterResponse> {
  const e = gatewayEnv();
  if (!hasPersistence(e)) {
    return { status: 200, body: { pending: 0, abandoned: 0, persistence: false } };
  }
  const counts = await countOutbox();
  return { status: 200, body: { ...counts, persistence: true } };
}

// ---------------------------------------------------------------------------
//  POST /outbox/flush — le rattrapage
// ---------------------------------------------------------------------------

async function flush(): Promise<RouterResponse> {
  const e = gatewayEnv();
  if (!hasPersistence(e)) {
    return { status: 200, body: { sent: 0, remaining: 0, persistence: false } };
  }

  const batch = await pendingBatch(MAX_FLUSH_BATCH);
  if (batch.length === 0) {
    return { status: 200, body: { sent: 0, remaining: 0, persistence: true } };
  }

  const started = Date.now();
  let sent = 0;

  for (let i = 0; i < batch.length; i++) {
    if (Date.now() - started > REQUEST_BUDGET_MS) break;
    const row = batch[i];
    try {
      const res = await sendText(row.recipientPhone, row.body, e);
      await attachGatewayId(row.id, res.messageId);
      await dequeue(row.id);
      sent += 1;
    } catch (err) {
      const g = err instanceof GatewayError ? err : null;
      await noteFailure(row, {
        unreachable: !g || g.unreachable,
        error: g ? `${g.code} — ${g.message}` : "Échec réseau.",
      });
      // Passerelle éteinte : inutile d'insister sur les quatorze suivants.
      if (!g || g.unreachable) break;
    }
    // LE VIDAGE RESPECTE EXACTEMENT LA MÊME CADENCE QUE L'ENVOI DIRECT — c'est
    // même ici qu'elle compte le plus : on traite un lot accumulé, c'est le
    // moment où l'on ressemble le plus à un robot.
    if (i < batch.length - 1) await sleep(nextPacingDelay());
  }

  const counts = await countOutbox();
  return { status: 200, body: { sent, remaining: counts.pending, persistence: true } };
}
