"use client";

/**
 * LE CÔTÉ NAVIGATEUR DE LA PASSERELLE.
 *
 * Le navigateur ne parle JAMAIS à la passerelle : il parle à `/api/whatsapp/*`,
 * qui est le seul endroit où la clé est lue. Ce fichier n'est donc qu'une
 * poignée d'appels typés — mais il centralise deux choses qui, dispersées,
 * finissent par diverger :
 *
 *  - la lecture d'une réponse d'erreur (l'API rend toujours `{ error, hint }`) ;
 *  - la distinction entre « la route n'est pas déployée » (404 sur une
 *    application dont l'API n'a pas encore été publiée) et « la passerelle est
 *    éteinte ». Le rattrapage de la file s'arrête définitivement dans le premier
 *    cas, et réessaie dans le second.
 */

import type {
  GatewayStatus,
  OutboxCount,
  OutgoingRecipient,
  SendResponse,
  SessionResponse,
} from "./core";

export class ApiError extends Error {
  readonly status: number;
  readonly hint?: string;
  /** la route elle-même n'existe pas : inutile de réessayer */
  readonly notDeployed: boolean;

  constructor(status: number, message: string, hint?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.hint = hint;
    this.notDeployed = status === 404 || status === 405;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/whatsapp/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const o = (body ?? {}) as { error?: string; hint?: string };
    throw new ApiError(res.status, o.error ?? `Échec de la requête (${res.status}).`, o.hint);
  }
  return body as T;
}

export function fetchStatus(): Promise<GatewayStatus> {
  return call<GatewayStatus>("status");
}

export function sessionAction(
  action: "setup" | "connect" | "restart" | "logout",
): Promise<SessionResponse> {
  return call<SessionResponse>("session", { method: "POST", body: JSON.stringify({ action }) });
}

export function sendMessages(recipients: OutgoingRecipient[]): Promise<SendResponse> {
  return call<SendResponse>("send", { method: "POST", body: JSON.stringify({ recipients }) });
}

export function fetchOutbox(): Promise<OutboxCount> {
  return call<OutboxCount>("outbox");
}

export function flushOutbox(): Promise<{ sent: number; remaining: number }> {
  return call<{ sent: number; remaining: number }>("outbox/flush", { method: "POST" });
}
