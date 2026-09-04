/**
 * =============================================================================
 *  LE NOYAU WHATSAPP — partagé par le navigateur ET par le serveur
 * =============================================================================
 *
 *  Ce fichier n'importe RIEN : ni React, ni `server-only`, ni le magasin. C'est
 *  la condition pour qu'il soit lu des deux côtés — la fenêtre d'envoi compose
 *  ses messages avec, la route serveur les cadence avec, et la file d'attente
 *  les reprend avec.
 *
 *  POURQUOI CE PARTAGE EST UNE RÈGLE ET NON UN CONFORT.
 *
 *  La temporisation ci-dessous protège le NUMÉRO du club. WhatsApp bannit les
 *  comptes qui écrivent vite et à beaucoup de monde, et un numéro banni l'est
 *  SANS RECOURS : le montage est auto-hébergé, personne ne viendra plaider le
 *  dossier. Dupliquer ces constantes — une copie dans l'envoi direct, une autre
 *  dans le vidage de la file — les laisserait diverger, et la divergence se
 *  paierait en numéro perdu.
 *
 *  LE VIDAGE DE LA FILE RESPECTE EXACTEMENT LA MÊME CADENCE QUE L'ENVOI DIRECT.
 *  C'est même là qu'elle compte le plus : le rattrapage traite des lots
 *  accumulés, c'est le moment où l'on ressemble le plus à un robot.
 */

// ---------------------------------------------------------------------------
//  1. La temporisation — ce qui protège le numéro
// ---------------------------------------------------------------------------

/** Attente MINIMALE entre deux destinataires (ms). */
export const PACING_MIN_MS = 3000;
/** Attente MAXIMALE entre deux destinataires (ms). */
export const PACING_MAX_MS = 7000;

/**
 * L'ATTENTE ENTRE DEUX ENVOIS, TIRÉE AU HASARD.
 *
 * Un intervalle régulier au millième près fait robot : c'est précisément le
 * genre de régularité qu'un détecteur d'abus repère. On tire donc entre 3 et
 * 7 secondes, à chaque fois.
 */
export function nextPacingDelay(): number {
  return PACING_MIN_MS + Math.floor(Math.random() * (PACING_MAX_MS - PACING_MIN_MS + 1));
}

/** Destinataires traités dans UN appel d'envoi. Au-delà, la file prend le relais. */
export const MAX_RECIPIENTS_PER_CALL = 40;

/** Messages repris dans UN vidage de file. */
export const MAX_FLUSH_BATCH = 15;

/**
 * LE BUDGET DE TEMPS D'UNE REQUÊTE (ms).
 *
 * Une fonction serverless est coupée net à son délai maximal (60 s déclarées
 * dans la route). On envoie tant qu'il reste du temps, et **on met le reste en
 * FILE plutôt que d'accélérer** : la cadence ne se négocie pas pour faire tenir
 * un lot dans une requête.
 */
export const REQUEST_BUDGET_MS = 45_000;

/** Tentatives maximales sur un message mis en file. */
export const OUTBOX_MAX_ATTEMPTS = 3;

/**
 * AU-DELÀ DE CE DÉLAI, LE MESSAGE EST PÉRIMÉ.
 *
 * Un rappel de dette vieux d'une semaine peut être devenu faux — la famille est
 * peut-être déjà passée payer. Mieux vaut ne rien envoyer qu'envoyer une
 * information fausse signée du club.
 */
export const OUTBOX_MAX_AGE_DAYS = 7;

/** Longueur maximale d'un message WhatsApp texte. */
export const MAX_MESSAGE_LENGTH = 4096;

// ---------------------------------------------------------------------------
//  2. Les jetons des modèles
// ---------------------------------------------------------------------------

/**
 * REMPLIT LES JETONS D'UN MODÈLE — `{chevalier}`, `{dette}`, `{club}`…
 *
 * UN JETON INCONNU RESTE TEL QUEL. C'est délibéré : remplacer `{truc}` par du
 * vide enverrait une phrase amputée que personne ne relirait ; le laisser
 * visible fait qu'on le corrige avant d'envoyer. Le message est toujours montré
 * avant de partir — c'est le dernier filet.
 */
export function fillTokens(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? whole : String(value);
  });
}

// ---------------------------------------------------------------------------
//  3. Les trois issues d'un envoi — jamais confondues
// ---------------------------------------------------------------------------

/**
 * CE QU'UN MESSAGE EST DEVENU.
 *
 *  - `sent`      : la passerelle l'a pris en charge ;
 *  - `queued`    : la passerelle était INJOIGNABLE — le poste est éteint. Ce
 *                  n'est **pas** un échec : le message repartira tout seul, et
 *                  l'interface ne doit jamais l'afficher en rouge ;
 *  - `delivered` / `read` : remontés plus tard par le webhook ;
 *  - `failed`    : refus propre au destinataire (numéro sans compte WhatsApp,
 *                  refus de la passerelle).
 */
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

/** Un message en partance, tel que l'interface le décrit. */
export interface OutgoingRecipient {
  /** numéro tel qu'il est saisi — la normalisation est faite côté serveur */
  phone: string;
  name: string;
  /** le texte RÉELLEMENT envoyé à cette personne */
  text: string;
  studentId?: string;
  parentId?: string;
  /** d'où part le message : « semesters », « students », « parents »… */
  origin?: string;
}

/** Le compte rendu d'un destinataire. */
export interface SendResult {
  name: string;
  phone: string;
  status: MessageStatus;
  /** identifiant du message côté passerelle (présent quand `sent`) */
  messageId?: string;
  /** motif d'un `failed`, ou cause système d'une mise en file */
  error?: string;
}

export interface SendResponse {
  sent: number;
  queued: number;
  failed: number;
  results: SendResult[];
  /** la passerelle était injoignable : tout est parti en file */
  gatewayDown?: boolean;
}

// ---------------------------------------------------------------------------
//  4. L'état de la passerelle, tel que l'écran de réglages le lit
// ---------------------------------------------------------------------------

/** Ce que l'application sait du webhook enregistré SUR la passerelle. */
export type WebhookState =
  /** aucun webhook déclaré */
  | "missing"
  /** déclaré, mais vers une autre adresse que le domaine courant */
  | "stale"
  /** déclaré vers la bonne adresse, mais avec un jeton qui n'est pas le nôtre */
  | "token-mismatch"
  /** déclaré vers la bonne adresse, avec le bon jeton */
  | "verified";

/** Réponse de `GET /api/whatsapp/status`. NE CONTIENT JAMAIS DE SECRET :
 *  ni clé d'API, ni jeton de webhook, ni URL complète de la passerelle. */
export interface GatewayStatus {
  /** les variables minimales pour parler à la passerelle sont posées */
  configured: boolean;
  /** la passerelle a répondu */
  reachable: boolean;
  /** l'instance existe côté passerelle */
  instanceExists: boolean;
  /** un téléphone est lié et la session est ouverte */
  connected: boolean;
  /** le numéro lié, tel que la passerelle le rend */
  phoneNumber: string | null;
  /** le nom du profil WhatsApp lié */
  profileName: string | null;
  /** l'hôte de la passerelle SEUL — jamais le chemin, jamais la clé */
  gatewayHost: string | null;
  /** le nom d'instance, masqué */
  instanceMasked: string | null;
  webhook: WebhookState;
  /** l'adresse vers laquelle le webhook enregistré pointe, hôte seul */
  webhookHost: string | null;
  /** l'adresse que l'application ATTEND, hôte seul */
  expectedWebhookHost: string | null;
  /** la persistance (journal + file) est configurée côté serveur */
  persistence: boolean;
  /** une variable d'environnement a été ÉCARTÉE, et pourquoi */
  ignoredEnv: string | null;
  /** ce déploiement est une prévisualisation : `setup` et `logout` y sont refusés */
  preview: boolean;
  /** messages en attente dans la file */
  pending: number;
  /** cause système d'un échec (ECONNRESET, ENOTFOUND, HTTP_401…) */
  error: string | null;
  /** ce qu'il faut faire, en une phrase */
  hint: string | null;
}

/** Réponse de `POST /api/whatsapp/session` quand l'action rend un QR. */
export interface SessionResponse {
  ok: boolean;
  /** image du QR en data-URI, à afficher tel quel */
  qr?: string | null;
  /** code de couplage, quand la passerelle en propose un */
  pairingCode?: string | null;
  state?: string;
  error?: string;
  hint?: string;
}

/** Réponse de `GET /api/whatsapp/outbox`. */
export interface OutboxCount {
  pending: number;
  /** abandonnés : trop de tentatives, ou périmés */
  abandoned: number;
  persistence: boolean;
}
