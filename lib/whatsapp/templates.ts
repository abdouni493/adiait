/**
 * =============================================================================
 *  LES MODÈLES DE MESSAGES WHATSAPP
 * =============================================================================
 *
 *  La passerelle du club envoie du TEXTE LIBRE depuis le numéro de
 *  l'organisation (moteur Baileys derrière Evolution API) : il n'y a donc ni
 *  modèle à faire approuver, ni facturation au message, ni fenêtre de service
 *  client de 24 h. Ce que ce fichier compose est EXACTEMENT ce que la famille
 *  reçoit — d'où le soin porté à la formule d'adresse et à la signature.
 *
 *  POURQUOI L'APPLICATION ÉCRIT LE PREMIER JET.
 *
 *  Devant un champ vide, on écrit vite et mal : pas de salutation, pas de nom
 *  de club, pas de moyen de répondre. Une famille qui reçoit « vous devez
 *  12 000 DA » d'un numéro inconnu BLOQUE le numéro — et un numéro bloqué par
 *  plusieurs personnes finit banni, sans recours. Le texte proposé ici est donc
 *  complet et poli ; il reste entièrement modifiable avant l'envoi, et il n'est
 *  JAMAIS envoyé sans avoir été montré.
 *
 *  Ce fichier reste PUR : aucun `server-only`, aucune lecture d'environnement,
 *  aucun import du magasin. La fenêtre d'envoi le lit dans le navigateur.
 */

export type WhatsAppTemplateId =
  /** la situation complète : emploi du temps, carte, présences, argent */
  | "situation"
  /** le rappel de dette, court */
  | "debt"
  /** plus aucune séance restante */
  | "balance_empty"
  /** une ou deux séances restantes */
  | "balance_low"
  /** les frais d'inscription encore dus */
  | "registration"
  /** le message libre, écrit de bout en bout par l'utilisateur */
  | "custom";

/** Tous les modèles sauf le message libre — ceux que l'application compose. */
export type AlertTemplateId = Exclude<WhatsAppTemplateId, "custom">;

/** À qui l'on parle : cela change la formule d'adresse. `mixed` couvre l'envoi
 *  simultané au chevalier ET à son parent, qui est le cas ordinaire. */
export type WhatsAppAudience = "student" | "parent" | "mixed";

export type MessageLanguage = "fr" | "ar";

/**
 * LE DÉTAIL D'UNE SITUATION, tel que l'écran des semestres le connaît.
 *
 * C'est ce qui distingue un rappel utile d'un rappel agaçant : la famille lit
 * de quel groupe on parle, quel jour et à quelle heure il s'entraîne, sur
 * quelle carte on en est, combien de séances ont été suivies et combien ont été
 * manquées, ce qui a été versé et ce qui reste. Elle n'a plus à téléphoner pour
 * comprendre — ce qui est le seul but d'un rappel.
 *
 * Tout est facultatif : un écran qui ne connaît qu'une partie de ces éléments
 * envoie ce qu'il sait, et les lignes absentes disparaissent du message plutôt
 * que de s'afficher vides.
 */
export interface SituationDetail {
  semesterName?: string;
  semesterStart?: string;
  semesterEnd?: string;
  categoryName?: string;
  groupName?: string;
  /** le nom de l'emploi du temps (module ou titre libre) */
  emploiTitle?: string;
  /** « Lundi · Mercredi » */
  emploiDays?: string;
  /** « 17:00 – 18:30 » */
  emploiTime?: string;
  salleName?: string;
  teacherName?: string;
  /** « Carte 3 » */
  carteName?: string;
  carteStart?: string;
  carteEnd?: string;
  carteHeld?: number;
  carteSize?: number;
  /** séances suivies (présent ou en retard) */
  presences?: number;
  /** séances manquées */
  absences?: number;
  /** séances annulées pour tout le groupe */
  cancelled?: number;
  /** total versé sur cet emploi du temps */
  paid?: number;
  /** reste dû sur cet emploi du temps */
  debt?: number;
  /** solde de la carte en cours (négatif = dans le rouge) */
  sold?: number;
  /** prix d'une séance */
  unitPrice?: number;
}

export interface TemplateContext {
  studentName: string;
  /** son numéro d'inscription, quand l'écran le connaît */
  registrationNumber?: string;
  /** séances restantes, tous emplois du temps confondus */
  remainingSeances: number;
  /** reste à payer en DA (0 = compte à jour) */
  debt: number;
  /** frais d'inscription restant dus */
  registrationDue?: number;
  schoolName: string;
  schoolPhone?: string;
  audience: WhatsAppAudience;
  detail?: SituationDetail;
}

export interface TemplateDefinition {
  id: WhatsAppTemplateId;
  labelFr: string;
  /** courte explication affichée sous le libellé dans la fenêtre d'envoi */
  hintFr: string;
  build: (ctx: TemplateContext, lang: MessageLanguage) => string;
}

// ---------------------------------------------------------------------------
//  Les briques communes
// ---------------------------------------------------------------------------

const money = (amount: number) =>
  `${Math.round(Math.abs(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} DA`;

/** Formule d'adresse selon le destinataire. Le corps nomme toujours le
 *  chevalier, donc la variante `mixed` peut rester neutre sans perdre en clarté. */
function opening(ctx: TemplateContext, lang: MessageLanguage): string {
  if (lang === "ar") {
    if (ctx.audience === "parent") return `السلام عليكم، ولي أمر الفارس ${ctx.studentName}،`;
    if (ctx.audience === "student") return `السلام عليكم ${ctx.studentName}،`;
    return "السلام عليكم،";
  }
  if (ctx.audience === "parent") return `Bonjour, cher parent de ${ctx.studentName},`;
  if (ctx.audience === "student") return `Bonjour ${ctx.studentName},`;
  return "Bonjour,";
}

/** Pied de message : nom du club et numéro de contact. SANS moyen de répondre,
 *  un rappel devient une injonction anonyme — et se fait bloquer. */
function signature(ctx: TemplateContext, lang: MessageLanguage): string {
  const contact = ctx.schoolPhone
    ? lang === "ar"
      ? `\nللاستفسار: ${ctx.schoolPhone}`
      : `\nContact : ${ctx.schoolPhone}`
    : "";
  return `\n\n${ctx.schoolName}${contact}`;
}

/** Une ligne de détail, écartée quand la valeur manque. */
function line(label: string, value?: string | number | null): string | null {
  if (value === undefined || value === null || value === "") return null;
  return `• ${label} : ${value}`;
}

/**
 * LE BLOC DE DÉTAIL — le cœur du modèle « situation ».
 *
 * Chaque ligne disparaît d'elle-même quand l'écran n'a pas l'information. On ne
 * montre jamais « Groupe : — » : une ligne vide fait douter de toutes les
 * autres.
 */
function detailBlock(ctx: TemplateContext, lang: MessageLanguage): string {
  const d = ctx.detail;
  if (!d) return "";
  const ar = lang === "ar";

  const identity = [
    line(ar ? "رقم التسجيل" : "N° d'inscription", ctx.registrationNumber),
    line(ar ? "الموسم" : "Semestre", d.semesterName),
    d.semesterStart && d.semesterEnd
      ? line(ar ? "فترة الموسم" : "Période", `${d.semesterStart} → ${d.semesterEnd}`)
      : null,
    line(ar ? "الفئة" : "Catégorie", d.categoryName),
    line(ar ? "الفوج" : "Groupe", d.groupName),
  ].filter(Boolean);

  const schedule = [
    line(ar ? "البرنامج" : "Emploi du temps", d.emploiTitle),
    line(ar ? "الأيام" : "Jours", d.emploiDays),
    line(ar ? "التوقيت" : "Horaire", d.emploiTime),
    line(ar ? "الحلبة" : "Arène", d.salleName),
    line(ar ? "المدرب" : "Entraîneur", d.teacherName),
  ].filter(Boolean);

  const carte = [
    line(ar ? "البطاقة" : "Carte", d.carteName),
    d.carteHeld !== undefined && d.carteSize !== undefined
      ? line(ar ? "تقدم البطاقة" : "Avancement", `${d.carteHeld} / ${d.carteSize}`)
      : null,
    line(ar ? "بداية البطاقة" : "Début de la carte", d.carteStart),
    line(ar ? "نهاية البطاقة" : "Fin de la carte", d.carteEnd),
  ].filter(Boolean);

  const attendance = [
    line(ar ? "الحصص المحضورة" : "Séances suivies", d.presences),
    line(ar ? "الغيابات" : "Absences", d.absences),
    d.cancelled ? line(ar ? "حصص ملغاة" : "Séances annulées", d.cancelled) : null,
    line(ar ? "الحصص المتبقية" : "Séances restantes", ctx.remainingSeances),
  ].filter(Boolean);

  const account = [
    d.unitPrice ? line(ar ? "ثمن الحصة" : "Prix de la séance", money(d.unitPrice)) : null,
    d.paid !== undefined ? line(ar ? "المدفوع" : "Total versé", money(d.paid)) : null,
    d.debt !== undefined ? line(ar ? "الباقي" : "Reste à payer", money(d.debt)) : null,
  ].filter(Boolean);

  const heads = ar
    ? ["معلومات الفارس", "البرنامج", "البطاقة", "الحضور", "الحساب"]
    : ["Le chevalier", "L'emploi du temps", "La carte", "Les présences", "Le compte"];

  const sections: Array<[string, (string | null)[]]> = [
    [heads[0], identity],
    [heads[1], schedule],
    [heads[2], carte],
    [heads[3], attendance],
    [heads[4], account],
  ];

  return sections
    .filter(([, rows]) => rows.length > 0)
    .map(([head, rows]) => `\n*${head}*\n${rows.join("\n")}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
//  Les modèles
// ---------------------------------------------------------------------------

export const WHATSAPP_TEMPLATES: TemplateDefinition[] = [
  {
    id: "situation",
    labelFr: "Situation détaillée",
    hintFr:
      "Tout ce qui concerne le chevalier : semestre, catégorie, groupe, emploi du temps, carte, présences, absences, versements et reste à payer.",
    build: (ctx, lang) => {
      const debt = Math.max(0, ctx.debt);
      const detail = detailBlock(ctx, lang);
      if (lang === "ar") {
        const head =
          debt > 0
            ? `نعلمكم أن حساب الفارس ${ctx.studentName} يسجل مبلغاً متبقياً قدره *${money(debt)}*.`
            : `إليكم الوضعية المفصلة للفارس ${ctx.studentName}.`;
        const foot =
          debt > 0
            ? `\n\nنرجو تسوية المبلغ لدى الاستقبال في أقرب وقت لضمان مواصلة الحصص.`
            : "";
        return `${opening(ctx, lang)}\n\n${head}\n${detail}${foot}${signature(ctx, lang)}`;
      }
      const head =
        debt > 0
          ? `Voici la situation détaillée de ${ctx.studentName}. Son compte présente actuellement un reste à payer de *${money(debt)}*.`
          : `Voici la situation détaillée de ${ctx.studentName}.`;
      const foot =
        debt > 0
          ? `\n\nMerci de bien vouloir régulariser cette somme auprès de la réception afin que les séances puissent se poursuivre normalement.`
          : "";
      return `${opening(ctx, lang)}\n\n${head}\n${detail}${foot}${signature(ctx, lang)}`;
    },
  },
  {
    id: "debt",
    labelFr: "Rappel de dette",
    hintFr: "Court : le montant à régulariser, sans le détail.",
    build: (ctx, lang) => {
      const debt = Math.max(0, ctx.debt);
      if (lang === "ar") {
        return (
          `${opening(ctx, lang)}\n\n` +
          `نعلمكم أن حساب الفارس ${ctx.studentName} يسجل ديناً قدره *${money(debt)}*.\n` +
          `نرجو تسوية المبلغ لدى الاستقبال في أقرب وقت لضمان مواصلة حضور الحصص.` +
          signature(ctx, lang)
        );
      }
      return (
        `${opening(ctx, lang)}\n\n` +
        `Le compte de ${ctx.studentName} présente actuellement une dette de *${money(debt)}*.\n` +
        `Merci de bien vouloir régulariser cette somme auprès de la réception afin que les séances puissent se poursuivre normalement.` +
        signature(ctx, lang)
      );
    },
  },
  {
    id: "balance_empty",
    labelFr: "Séances épuisées",
    hintFr: "Il ne reste aucune séance : un nouveau paiement est nécessaire.",
    build: (ctx, lang) => {
      if (lang === "ar") {
        return (
          `${opening(ctx, lang)}\n\n` +
          `لم تعد للفارس ${ctx.studentName} أي حصة متبقية.\n` +
          `يرجى دفع حصص جديدة قبل الحصة القادمة لضمان مواصلة الحضور.` +
          signature(ctx, lang)
        );
      }
      return (
        `${opening(ctx, lang)}\n\n` +
        `${ctx.studentName} n'a plus aucune séance restante.\n` +
        `Merci de régler de nouvelles séances avant le prochain entraînement afin d'éviter toute interruption.` +
        signature(ctx, lang)
      );
    },
  },
  {
    id: "balance_low",
    labelFr: "Séances bientôt épuisées",
    hintFr: "Il ne reste qu'une ou deux séances : rappel préventif.",
    build: (ctx, lang) => {
      if (lang === "ar") {
        return (
          `${opening(ctx, lang)}\n\n` +
          `حصص الفارس ${ctx.studentName} أوشكت على النفاد: ${ctx.remainingSeances} حصة متبقية.\n` +
          `ننصح بدفع حصص جديدة لتفادي انقطاع الحضور.` +
          signature(ctx, lang)
        );
      }
      return (
        `${opening(ctx, lang)}\n\n` +
        `Les séances de ${ctx.studentName} arrivent à leur fin : il en reste ${ctx.remainingSeances}.\n` +
        `Nous vous invitons à en régler de nouvelles afin d'éviter toute interruption.` +
        signature(ctx, lang)
      );
    },
  },
  {
    id: "registration",
    labelFr: "Frais d'inscription",
    hintFr: "Les frais d'inscription n'ont pas été réglés entièrement.",
    build: (ctx, lang) => {
      const due = Math.max(0, ctx.registrationDue ?? 0);
      if (lang === "ar") {
        return (
          `${opening(ctx, lang)}\n\n` +
          `لا يزال مبلغ *${money(due)}* من رسوم تسجيل الفارس ${ctx.studentName} غير مدفوع.\n` +
          `نرجو تسويته لدى الاستقبال.` +
          signature(ctx, lang)
        );
      }
      return (
        `${opening(ctx, lang)}\n\n` +
        `Les frais d'inscription de ${ctx.studentName} restent dus à hauteur de *${money(due)}*.\n` +
        `Merci de bien vouloir les régler auprès de la réception.` +
        signature(ctx, lang)
      );
    },
  },
  {
    id: "custom",
    labelFr: "Message libre",
    hintFr: "Vous écrivez le message vous-même ; il part tel quel.",
    build: (ctx, lang) => `${opening(ctx, lang)}\n\n${signature(ctx, lang)}`,
  },
];

export function getTemplate(id: WhatsAppTemplateId): TemplateDefinition {
  return WHATSAPP_TEMPLATES.find((t) => t.id === id) ?? WHATSAPP_TEMPLATES[0];
}

export function isAlertTemplate(id: WhatsAppTemplateId): id is AlertTemplateId {
  return id !== "custom";
}

/**
 * LE MODÈLE QUE LA SITUATION APPELLE.
 *
 * Une dette prime sur tout — c'est la seule chose qu'on écrit spontanément à
 * une famille. Vient ensuite la réserve de séances, puis les frais
 * d'inscription. Sans rien à signaler, on ne propose RIEN : le message libre
 * reste, pour qui a autre chose à dire.
 */
export function suggestTemplate(student: {
  remainingSeances: number;
  debt: number;
  registrationDue?: number;
}): WhatsAppTemplateId {
  if (student.debt > 0) return "situation";
  if (student.remainingSeances === 0) return "balance_empty";
  if (student.remainingSeances <= 2) return "balance_low";
  if ((student.registrationDue ?? 0) > 0) return "registration";
  return "custom";
}

export { MAX_MESSAGE_LENGTH } from "./core";
