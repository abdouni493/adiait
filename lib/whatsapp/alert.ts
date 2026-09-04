/**
 * =============================================================================
 *  À QUI L'ON ÉCRIT, ET AVEC QUEL MESSAGE
 * =============================================================================
 *
 *  Fichier volontairement PUR : aucune dépendance serveur, React ou navigateur.
 *  Il est partagé par le scan RFID (`useScanProcessor`), la fiche du chevalier,
 *  la fiche du parent et l'écran des semestres — pour qu'UNE SEULE logique
 *  décide à qui l'on écrit. L'envoi, lui, reste derrière `/api/whatsapp/send`,
 *  seul endroit où la clé de la passerelle est lue.
 *
 *  LA RÈGLE DU DESTINATAIRE, ET POURQUOI ELLE EST CELLE-LÀ.
 *
 *  On écrit au chevalier ET à son parent EN MÊME TEMPS, quand les deux ont un
 *  numéro. Ce n'est pas de la redondance : le chevalier est parfois mineur et ne
 *  porte pas de téléphone, le parent est parfois injoignable la journée, et une
 *  dette qui traîne coûte plus cher qu'un message de trop.
 *
 *  Si le chevalier n'a pas de numéro, le message part au parent SEUL.
 *  Si aucun des deux n'en a, on ne devine pas : l'appelant reçoit une liste vide
 *  et DOIT le dire à l'écran — un envoi silencieusement perdu est pire qu'un
 *  refus visible.
 */

import { isSendablePhone } from "./phone";
import {
  getTemplate,
  type MessageLanguage,
  type SituationDetail,
  type TemplateContext,
  type WhatsAppTemplateId,
} from "./templates";

/** Chevalier dont la situation alimente le modèle. */
export interface AlertStudent {
  id?: string;
  firstName: string;
  lastName: string;
  /** séances restantes, tous emplois du temps confondus */
  remainingSeances: number;
  /** reste à payer en DA (0 = compte à jour) */
  debt: number;
  /** frais d'inscription restant dus, le cas échéant */
  registrationDue?: number;
  registrationNumber?: string;
  phone?: string | null;
}

export interface AlertParent {
  id?: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  phone2?: string | null;
}

export interface AlertSchool {
  name?: string | null;
  phone?: string | null;
}

/** Un destinataire retenu, prêt pour `POST /api/whatsapp/send`. */
export interface AlertRecipient {
  /** identifiant stable dans la fenêtre d'envoi (« student-… », « parent-… ») */
  key: string;
  phone: string;
  name: string;
  role: "student" | "parent";
  studentId?: string;
  parentId?: string;
}

/**
 * LES DESTINATAIRES D'UN CHEVALIER : lui, et son parent, dans cet ordre.
 *
 * Les numéros inexploitables sont écartés ICI plutôt que découverts à l'envoi :
 * un numéro invalide doit se voir au moment où l'on coche, pas trois jours plus
 * tard au fond d'un journal.
 */
export function recipientsFor(
  student: AlertStudent,
  parent?: AlertParent | null,
): AlertRecipient[] {
  const out: AlertRecipient[] = [];
  const studentName = `${student.firstName} ${student.lastName}`.trim();

  if (isSendablePhone(student.phone)) {
    out.push({
      key: `student-${student.id ?? studentName}`,
      phone: student.phone!,
      name: studentName,
      role: "student",
      studentId: student.id,
    });
  }
  if (parent && isSendablePhone(parent.phone)) {
    out.push({
      key: `parent-${parent.id ?? parent.phone}`,
      phone: parent.phone!,
      name: `${parent.firstName} ${parent.lastName}`.trim(),
      role: "parent",
      studentId: student.id,
      parentId: parent.id,
    });
  }
  // Le SECOND numéro du parent : celui qu'on compose quand le premier ne répond
  // pas. Il n'est retenu que s'il diffère réellement du premier.
  if (parent && isSendablePhone(parent.phone2) && parent.phone2 !== parent.phone) {
    out.push({
      key: `parent2-${parent.id ?? parent.phone2}`,
      phone: parent.phone2!,
      name: `${parent.firstName} ${parent.lastName} (2)`.trim(),
      role: "parent",
      studentId: student.id,
      parentId: parent.id,
    });
  }
  return out;
}

/**
 * POURQUOI UN ENVOI EST IMPOSSIBLE — dit en une phrase, à afficher telle quelle.
 *
 * L'écran doit alerter, pas se taire : « le chevalier n'a pas de numéro et
 * n'est rattaché à aucun parent » est une information exploitable ; un bouton
 * qui ne fait rien ne l'est pas.
 */
export function unreachableReason(
  student: AlertStudent,
  parent?: AlertParent | null,
): string | null {
  if (recipientsFor(student, parent).length > 0) return null;
  const name = `${student.firstName} ${student.lastName}`.trim();
  if (!parent) {
    return `${name} n'a aucun numéro de téléphone et n'est rattaché à aucun parent : impossible de lui écrire.`;
  }
  return `Ni ${name} ni son parent n'ont de numéro de téléphone exploitable : impossible de leur écrire.`;
}

/** Le modèle que la situation appelle, ou `null` s'il n'y a rien à signaler. */
export function balanceAlertTemplate(
  student: { remainingSeances: number; debt: number; registrationDue?: number },
  opts: { low?: boolean } = {},
): WhatsAppTemplateId | null {
  if (student.debt > 0) return "debt";
  if (student.remainingSeances === 0) return "balance_empty";
  if (opts.low) return "balance_low";
  if ((student.registrationDue ?? 0) > 0) return "registration";
  return null;
}

/** Le contexte que les modèles consomment, monté depuis une situation. */
export function contextFor(params: {
  student: AlertStudent;
  school?: AlertSchool | null;
  audience: TemplateContext["audience"];
  detail?: SituationDetail;
}): TemplateContext {
  const { student, school, audience, detail } = params;
  return {
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    registrationNumber: student.registrationNumber,
    remainingSeances: student.remainingSeances,
    debt: student.debt,
    registrationDue: student.registrationDue,
    schoolName: school?.name || "Le club",
    schoolPhone: school?.phone || undefined,
    audience,
    detail,
  };
}

/** Charge utile d'une alerte automatique : les destinataires et leur texte. */
export interface AlertPayload {
  recipients: Array<AlertRecipient & { text: string }>;
  templateId: WhatsAppTemplateId;
}

/**
 * COMPOSE UNE ALERTE DE SOLDE POUR TOUS LES DESTINATAIRES D'UN CHEVALIER.
 *
 * Le texte est recomposé POUR CHACUN : la formule d'adresse d'un parent n'est
 * pas celle d'un chevalier, et un message qui commence par « Bonjour, cher
 * parent » envoyé au chevalier lui-même se remarque tout de suite.
 *
 * Renvoie `null` quand la situation ne justifie aucune alerte, ou quand
 * personne n'est joignable.
 */
export function buildBalanceAlert(params: {
  student: AlertStudent;
  parent?: AlertParent | null;
  school?: AlertSchool | null;
  lang: MessageLanguage;
  low?: boolean;
  templateId?: WhatsAppTemplateId | null;
  detail?: SituationDetail;
}): AlertPayload | null {
  const { student, parent, school, lang, low, detail } = params;

  const templateId = params.templateId ?? balanceAlertTemplate(student, { low });
  if (!templateId) return null;

  const recipients = recipientsFor(student, parent);
  if (recipients.length === 0) return null;

  const template = getTemplate(templateId);
  return {
    templateId,
    recipients: recipients.map((r) => ({
      ...r,
      text: template.build(
        contextFor({ student, school, audience: r.role, detail }),
        lang,
      ),
    })),
  };
}
