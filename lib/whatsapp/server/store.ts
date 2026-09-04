/**
 * =============================================================================
 *  LE JOURNAL ET LA FILE — deux tables, jamais une
 * =============================================================================
 *
 *  | Table                | Ce qu'elle porte                                        |
 *  | -------------------- | ------------------------------------------------------- |
 *  | `whatsapp_messages`  | LE JOURNAL : destinataire, TEXTE réellement envoyé,      |
 *  |                      | avancement (`queued → sent → delivered → read → failed`) |
 *  | `whatsapp_outbox`    | LA FILE : ce qui n'a PAS pu partir, avec son texte,      |
 *  |                      | ses tentatives et sa dernière erreur                     |
 *
 *  LES DEUX PARTAGENT LE MÊME IDENTIFIANT : un message rattrapé depuis la file
 *  se retrouve dans le journal AU MÊME ENDROIT, jamais en double.
 *
 *  L'ÉCRITURE PASSE PAR LA CLÉ DE SERVICE. Le webhook n'a aucune session
 *  utilisateur — il vient de la passerelle, pas d'un navigateur — et ne peut
 *  donc pas écrire sous RLS. Si la clé manque, l'envoi direct continue de
 *  fonctionner mais l'application LE DIT au lieu de le taire : voir
 *  `hasPersistence()` et le drapeau `persistence` du statut.
 *
 *  LA FILE N'EST PAS UN RAFFINEMENT. Le poste qui héberge la passerelle sera
 *  éteint un jour ou l'autre : sans elle, chaque message émis pendant ce temps
 *  est PUREMENT PERDU, et un rappel automatique ne laisse rien derrière lui —
 *  personne ne revient l'envoyer à la main.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { OUTBOX_MAX_AGE_DAYS, OUTBOX_MAX_ATTEMPTS, type MessageStatus } from "../core";
import { gatewayEnv, hasPersistence } from "./env";

/** Le client de service, construit À L'APPEL — voir la note de `env.ts` sur la
 *  lecture de `process.env`. */
function client(): SupabaseClient | null {
  const e = gatewayEnv();
  if (!hasPersistence(e)) return null;
  return createClient(e.supabaseUrl!, e.supabaseServiceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface JournalEntry {
  id: string;
  recipientName: string;
  recipientPhone: string;
  body: string;
  status: MessageStatus;
  gatewayId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  origin?: string | null;
  error?: string | null;
}

/** Écrit (ou met à jour) une ligne du journal. Un échec d'écriture ne fait PAS
 *  échouer l'envoi : le message est parti, c'est le fait qui compte. */
export async function logMessage(entry: JournalEntry): Promise<void> {
  const db = client();
  if (!db) return;
  const { error } = await db.from("whatsapp_messages").upsert(
    {
      id: entry.id,
      recipient_name: entry.recipientName,
      recipient_phone: entry.recipientPhone,
      body: entry.body,
      status: entry.status,
      gateway_id: entry.gatewayId ?? null,
      student_id: entry.studentId ?? null,
      parent_id: entry.parentId ?? null,
      origin: entry.origin ?? null,
      last_error: entry.error ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) console.error("[whatsapp] journal :", error.message);
}

/** Fait avancer le statut d'un message déjà journalisé (webhook). */
export async function advanceStatus(
  gatewayId: string,
  status: MessageStatus,
  error?: string | null,
): Promise<void> {
  const db = client();
  if (!db) return;
  await db
    .from("whatsapp_messages")
    .update({ status, last_error: error ?? null, updated_at: new Date().toISOString() })
    .eq("gateway_id", gatewayId);
}

export interface OutboxRow {
  id: string;
  recipientName: string;
  recipientPhone: string;
  body: string;
  attempts: number;
  createdAt: string;
  studentId?: string | null;
  parentId?: string | null;
  origin?: string | null;
}

/** Met un message en file. Le TEXTE part avec lui : sans texte, la reprise
 *  devrait le recomposer, et une situation vieille d'un jour ne compose plus le
 *  même message. */
export async function enqueue(row: Omit<OutboxRow, "attempts" | "createdAt">): Promise<void> {
  const db = client();
  if (!db) {
    console.error("[whatsapp] file d'attente indisponible : SUPABASE_SERVICE_ROLE_KEY manquante.");
    return;
  }
  const { error } = await db.from("whatsapp_outbox").upsert(
    {
      id: row.id,
      recipient_name: row.recipientName,
      recipient_phone: row.recipientPhone,
      body: row.body,
      student_id: row.studentId ?? null,
      parent_id: row.parentId ?? null,
      origin: row.origin ?? null,
      status: "pending",
      attempts: 0,
      created_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) console.error("[whatsapp] mise en file :", error.message);
}

/** Les plus anciens en attente d'abord — c'est l'ordre que l'index sert. */
export async function pendingBatch(limit: number): Promise<OutboxRow[]> {
  const db = client();
  if (!db) return [];
  const { data, error } = await db
    .from("whatsapp_outbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[whatsapp] lecture de la file :", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    recipientName: String(r.recipient_name ?? ""),
    recipientPhone: String(r.recipient_phone ?? ""),
    body: String(r.body ?? ""),
    attempts: Number(r.attempts ?? 0),
    createdAt: String(r.created_at ?? ""),
    studentId: r.student_id,
    parentId: r.parent_id,
    origin: r.origin,
  }));
}

export interface OutboxCounts {
  pending: number;
  abandoned: number;
}

export async function countOutbox(): Promise<OutboxCounts> {
  const db = client();
  if (!db) return { pending: 0, abandoned: 0 };
  const [pending, abandoned] = await Promise.all([
    db.from("whatsapp_outbox").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db
      .from("whatsapp_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "abandoned"),
  ]);
  return { pending: pending.count ?? 0, abandoned: abandoned.count ?? 0 };
}

/** Le message est parti : il quitte la file. */
export async function dequeue(id: string): Promise<void> {
  const db = client();
  if (!db) return;
  await db.from("whatsapp_outbox").delete().eq("id", id);
}

/**
 * LES TROIS RÈGLES DE REPRISE, ET ELLES COMPTENT TOUTES LES TROIS.
 *
 *  1. UNE PASSERELLE INJOIGNABLE NE CONSOMME JAMAIS DE TENTATIVE. Ce n'est pas
 *     la faute du message. Sans cette règle, un week-end hors ligne épuiserait
 *     le compteur de TOUTE la file et ferait abandonner des messages
 *     parfaitement valides.
 *  2. UN REFUS PROPRE AU DESTINATAIRE en consomme une — trois au maximum, puis
 *     abandon motivé plutôt qu'un réessai sans fin.
 *  3. AU-DELÀ DE SEPT JOURS, LE MESSAGE EST PÉRIMÉ. Un rappel d'une semaine peut
 *     être devenu faux : la famille est peut-être déjà passée payer.
 */
export async function noteFailure(
  row: OutboxRow,
  opts: { unreachable: boolean; error: string },
): Promise<void> {
  const db = client();
  if (!db) return;

  const ageDays = row.createdAt
    ? (Date.now() - new Date(row.createdAt).getTime()) / 86_400_000
    : 0;

  if (ageDays > OUTBOX_MAX_AGE_DAYS) {
    await db
      .from("whatsapp_outbox")
      .update({ status: "abandoned", last_error: "Message périmé (plus de 7 jours)." })
      .eq("id", row.id);
    await advanceStatusById(row.id, "failed", "Message périmé : non envoyé.");
    return;
  }

  if (opts.unreachable) {
    // Règle 1 — la tentative n'est PAS consommée, seule l'erreur est notée.
    await db.from("whatsapp_outbox").update({ last_error: opts.error }).eq("id", row.id);
    return;
  }

  const attempts = row.attempts + 1;
  if (attempts >= OUTBOX_MAX_ATTEMPTS) {
    await db
      .from("whatsapp_outbox")
      .update({ status: "abandoned", attempts, last_error: opts.error })
      .eq("id", row.id);
    await advanceStatusById(row.id, "failed", opts.error);
    return;
  }
  await db.from("whatsapp_outbox").update({ attempts, last_error: opts.error }).eq("id", row.id);
}

/** Fait avancer le journal par l'identifiant PARTAGÉ avec la file. */
export async function advanceStatusById(
  id: string,
  status: MessageStatus,
  error?: string | null,
): Promise<void> {
  const db = client();
  if (!db) return;
  await db
    .from("whatsapp_messages")
    .update({ status, last_error: error ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Attache l'identifiant rendu par la passerelle à une ligne du journal. */
export async function attachGatewayId(id: string, gatewayId: string | null): Promise<void> {
  const db = client();
  if (!db) return;
  await db
    .from("whatsapp_messages")
    .update({ gateway_id: gatewayId, status: "sent", updated_at: new Date().toISOString() })
    .eq("id", id);
}
