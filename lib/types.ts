import type { Role } from "@/lib/store/session";

export type { Role };

/**
 * QUI A FAIT L'OPÉRATION.
 *
 * Chaque ligne que quelqu'un crée dans l'application — un encaissement, une
 * présence, un frais, une dépense, une fiche — porte désormais le compte qui
 * l'a écrite. Le nom est recopié à l'instant de l'écriture plutôt que relu plus
 * tard : un travailleur qui quitte le club, et dont la fiche disparaît, laisse
 * quand même un historique lisible.
 *
 * Absent = la ligne est antérieure à cette traçabilité (ou vient d'un
 * traitement automatique de l'application, comme la facturation des absences).
 */
export interface Authored {
  /** identifiant du compte qui a créé la ligne */
  createdBy?: string;
  /** son nom au moment de l'écriture */
  createdByName?: string;
  /** son rôle au moment de l'écriture ("admin", "reception", …) */
  createdByRole?: string;
}

export type Day =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export const DAYS: Day[] = [
  "saturday",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

export interface School {
  id: string;
  name: string;
  description: string;
  phone: string;
  email: string;
  logo?: string;
  address: string;
  articleFiscal?: string;
  registreCommerce?: string;
  nif?: string;
  nis?: string;
  /** one-time registration fee charged once per student on first enrollment */
  registrationFee?: number;
  /**
   * QUI DOIT LES FRAIS D'INSCRIPTION.
   *
   * Tout le monde ne les paie pas forcément : le club peut n'en réclamer qu'aux
   * catégories du secondaire, à trois catégories précises, ou seulement aux chevaliers
   * inscrits sur certains emplois du temps.
   *
   *  - `all`      : tous les chevaliers (le comportement d'origine),
   *  - `levels`   : tous les chevaliers des NIVEAUX listés (`registrationFeeLevels`),
   *  - `classes`  : uniquement les catégories listées (`registrationFeeClassIds`),
   *  - `sessions` : uniquement les emplois du temps listés
   *                 (`registrationFeeSessionIds`).
   *
   * Absent = `all`, pour que les clubs déjà en base ne changent pas de règle.
   */
  registrationFeeScope?: RegistrationFeeScope;
  /** `levels` : les niveaux concernés ("lycee", "moyen", …, "formation") */
  registrationFeeLevels?: string[];
  /** `classes` : les catégories concernées */
  registrationFeeClassIds?: string[];
  /** `sessions` : les emplois du temps concernés */
  registrationFeeSessionIds?: string[];
  /** master switch for the automatic weekly-absence billing */
  absencePenaltyEnabled?: boolean;
  /** floor date (YYYY-MM-DD): absences are only billed for weeks ending on/after
   *  this day, so enabling the feature never retro-bills old history */
  absencePenaltySince?: string;
  /** weekday the absence week opens on (0 = sunday … 5 = friday, the default):
   *  a week runs from that day to the same day of the next week */
  absenceWeekStartDay?: number;

  // ---- LA VITRINE PUBLIQUE ------------------------------------------------
  //
  // LE SITE DU CLUB VIT SUR CETTE LIGNE-LÀ, ET C'EST VOULU.
  //
  // `schools` est la SEULE table que le schéma laisse lire à un visiteur non
  // connecté (politique `schools_public_read`, section 6). Ranger ici le
  // favicon, les textes de présentation, l'image et la vidéo d'accueil ainsi
  // que les coordonnées, c'est permettre au site de s'afficher AVANT que
  // quiconque ait un compte — sans ouvrir la moindre autre table à `anon`.
  //
  // Tout est FACULTATIF : un club qui n'a rien réglé garde un site qui se
  // rabat sur son nom, son logo et sa description ordinaire.

  /** l'icône de l'onglet du site public */
  siteFavicon?: string;
  /** la présentation principale, affichée sous le titre de la page d'accueil */
  siteDescription?: string;
  /** une seconde présentation, plus longue, affichée en dessous */
  siteDescription2?: string;
  /** la photographie de fond de la page d'accueil */
  siteHeroImage?: string;
  /** la vidéo de la page d'accueil (fichier déposé ou adresse) */
  siteVideoUrl?: string;

  // Les coordonnées telles que le site les publie. Elles sont DISTINCTES de
  // `phone` / `address`, qui sont celles de l'administration : le numéro qu'on
  // donne au public n'est pas toujours celui du bureau.
  siteFacebook?: string;
  siteInstagram?: string;
  siteTiktok?: string;
  siteSnapchat?: string;
  siteWhatsapp?: string;
  /** le lien Google Maps du club */
  siteMapsUrl?: string;
  sitePhone?: string;
  sitePhone2?: string;
}

/** Sur QUI portent les frais d'inscription — voir `School.registrationFeeScope`. */
export type RegistrationFeeScope = "all" | "levels" | "classes" | "sessions";

export type ClassType = "cours" | "formation";
/** School levels — "maternelle" (kindergarten) is the newest one. In the UI
 *  they read: Maternelle, Primaire, Moyen, Secondaire (Lycée). */
export type CoursLevel = "maternelle" | "primaire" | "moyen" | "lycee";
export type FormationLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/**
 * UNE CATÉGORIE DE L'ORDRE.
 *
 * C'est ce que l'application appelait « une classe ». Une catégorie porte
 * maintenant TROIS choses, et rien d'autre : un nom, une description, et la
 * TRANCHE D'ÂGE qu'elle accueille — « de 18 à 25 ans ». Elle ne connaît plus
 * ni cours ni formation ni niveau : un club de chevalerie range ses membres
 * par âge, pas par année du du club.
 *
 * LES CHAMPS D'AVANT SONT GARDÉS, ET RESTENT FACULTATIFS. Les fiches déjà en
 * base portent un `type`, un `coursLevel`, une `year` : les effacer ferait
 * disparaître leur libellé et casserait le périmètre des droits d'entrée
 * réglé par niveau. Ils ne sont plus DEMANDÉS à la création — c'est là toute
 * la différence — mais ils sont toujours LUS quand ils sont là.
 */
export interface SchoolClass extends Authored {
  id: string;
  name: string;
  description: string;

  /** âge minimum admis, en années révolues */
  ageFrom?: number;
  /** âge maximum admis, en années révolues */
  ageTo?: number;

  // ---- hérité : renseigné sur les fiches d'avant les catégories ----------
  /** @deprecated la création ne le demande plus */
  type?: ClassType;
  /** @deprecated */
  coursLevel?: CoursLevel;
  /** @deprecated */
  year?: string;
  /** @deprecated regroupement facultatif hérité de la maternelle */
  categoryId?: string;
  /** @deprecated */
  formationLevel?: FormationLevel;
}

/** Optional grouping for kindergarten catégories (e.g. "Petite / Moyenne / Grande
 *  section"). Created inline from the class creation screen. */
export interface ClassCategory extends Authored {
  id: string;
  name: string;
}
export interface Module extends Authored {
  id: string;
  name: string;
}
/**
 * UN GROUPE DE L'ORDRE — et la CATÉGORIE à laquelle il appartient.
 *
 * Un groupe était jusqu'ici un simple nom flottant, valable pour toute
 * l'application. Il porte désormais SA catégorie : « Groupe A » des 8-10 ans
 * n'est plus le même objet que « Groupe A » des 15-18 ans, et l'écran
 * d'inscription peut enfin répondre à la seule question qui compte au
 * comptoir — « quels groupes cette catégorie propose-t-elle ? ».
 *
 * `classId` ABSENT = groupe d'avant cette colonne : il reste visible partout,
 * et se rattache à une catégorie le jour où quelqu'un l'y range.
 */
export interface Group extends Authored {
  id: string;
  name: string;
  /** la catégorie à laquelle ce groupe appartient */
  classId?: string;
  createdAt?: string;
}
export interface Salle extends Authored {
  id: string;
  name: string;
}

/**
 * How a teacher is paid:
 *  - `monthly`: a fixed salary, independent of the séances,
 *  - `percentage`: a % of what each présent student generated,
 *  - `per_group`: the pay is defined GROUPE PAR GROUPE on the emploi du temps
 *    itself (abonnement -> part du club / part de l'entraîneur), so each
 *    séance earns him that emploi's `teacherPerSeance` and nothing else.
 */
export type TeacherPaymentType = "monthly" | "percentage" | "per_group";
export interface Teacher extends Authored {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  paymentType: TeacherPaymentType;
  monthlyAmount?: number;
  startDate?: string;
  percentage?: number;
  /** "entraîneur passager": intervenant sans compte de connexion, réglé
   *  créneau par créneau depuis la fiche entraîneur */
  isPassager?: boolean;
  /** quand la fiche a été créée — c'est ce qui met les derniers arrivés en tête
   *  de la liste des entraîneurs. Absent sur les fiches d'avant la colonne. */
  createdAt?: string;
}

/** One settlement written for a teacher (fixed amount or percentage-based). */
export interface TeacherPayment extends Authored {
  id: string;
  teacherId: string;
  /** what he actually took home: gross − dépenses − acomptes − frais des enfants */
  amount: number;
  /** "group" = the emplois du temps priced the séances themselves */
  method: "fixed" | "percent" | "group";
  percentage?: number;
  studentsCount: number;
  sessionsCount: number;
  description: string;
  /** frozen snapshot of the settled timings, so the receipt can be reprinted */
  details: TeacherPaymentDetail[];
  /** what the séances earned him, BEFORE anything was taken off */
  gross?: number;
  /** the dépenses this settlement cleared — never deducted twice */
  expenses?: TeacherPaymentDeduction[];
  /** the acomptes it cleared */
  acomptes?: TeacherPaymentDeduction[];
  /** his children's inscriptions, settled out of his pay */
  childCharges?: TeacherChildCharge[];
  /** the child schoolings that had ALREADY been credited and booked on him
   *  (`TeacherChildDebt`), cleared by this settlement */
  childDebts?: TeacherPaymentDeduction[];
  /** the emploi-du-temps MONTHS this settlement closed (M1, M2 …) — frozen so
   *  the payslip and the month table still read right once the dues are paid */
  months?: TeacherPaymentMonth[];
  /**
   * LES ARRIÉRÉS DÉBLOQUÉS que ce règlement a payés.
   *
   * Une carte déjà réglée peut encore devoir quelque chose : le chevalier n'avait pas
   * payé, la part de l'entraîneur a donc été retenue. Quand le chevalier s'acquitte,
   * cette part revient — sur le règlement SUIVANT, jamais dans la carte en cours.
   * Elle est figée ici pour que la fiche de paie et l'historique la montrent
   * pour ce qu'elle est : un rattrapage, pas la carte du jour.
   */
  arrears?: TeacherPaymentArrear[];
  /** le mouvement de caisse que ce règlement a écrit — annulé avec lui */
  cashId?: string;
  /**
   * L'ÉCRAN DE PAIE, FIGÉ TEL QUEL.
   *
   * Le règlement se fait désormais CARTE PAR CARTE sur UN emploi du temps, et
   * l'écran qui le prépare montre trois tableaux : les chevaliers de la carte, les
   * arriérés rattrapés, et les retenues. `board` en garde la photographie
   * exacte, si bien que « voir le détail » d'un vieux règlement et la fiche de
   * paie réimprimée affichent les mêmes lignes qu'au moment du versement —
   * même si un chevalier a changé de groupe ou de tarif depuis.
   *
   * Absent = règlement enregistré avant cet écran (l'ancien détail suffit).
   */
  board?: TeacherPayBoard;
  paidAt: string;
}

/**
 * LA PHOTOGRAPHIE D'UN RÈGLEMENT DE CARTE, TABLEAU PAR TABLEAU.
 *
 * Elle est écrite au moment du versement et ne bouge plus : c'est ce que
 * l'écran de détail réaffiche et ce que la fiche de paie imprime.
 */
export interface TeacherPayBoard {
  sessionId: string;
  subscriptionId?: string;
  emploi: string;
  className: string;
  groupName: string;
  salleName: string;
  daysLabel: string;
  timeLabel: string;
  monthCode: string;
  /** séances que la carte contient */
  size: number;
  /** séances effectivement tenues */
  held: number;
  /** prix de la carte complète pour un chevalier */
  monthPrice: number;
  /** ce que la carte complète rapporte à l'entraîneur */
  teacherMonthShare: number;
  /** part entraîneur d'UNE séance (teacherMonthShare ÷ size) */
  perSeance: number;
  /** tableau 1 — les chevaliers de la carte */
  students: TeacherPayStudentLine[];
  /** tableau 2 — les chevaliers qui ont payé en retard (carte déjà réglés) */
  arrears: TeacherPayArrearLine[];
  /**
   * tableau 2 bis — LES SÉANCES LIBRES DU CARTE.
   *
   * Les chevaliers de passage n'ont pas de fiche, pas de solde et pas de carte : ils
   * paient la séance sur place. Ce que le club ne garde pas revient à
   * l'entraîneur et se règle avec la carte où la séance est tombée — d'où sa
   * place ici, à côté des retards, et jamais dans le tableau des chevaliers
   * inscrits.
   *
   * Absent = règlement enregistré avant les séances libres par passager.
   */
  passagers?: TeacherPayPassagerLine[];
  /** tableau 3 — ce qui est retenu sur la paie */
  deductions: TeacherPayDeductionLine[];
  studentsTotal: number;
  arrearsTotal: number;
  /** ce que les séances libres rapportent à l'entraîneur */
  passagersTotal?: number;
  deductionsTotal: number;
  /** studentsTotal + arrearsTotal + passagersTotal */
  gross: number;
  /** gross − deductionsTotal */
  net: number;
}

/** Une ligne du tableau des séances libres — un chevalier de passage, une séance. */
export interface TeacherPayPassagerLine {
  /** l'`IndependentSession` réglée */
  id: string;
  name: string;
  date: string;
  startTime?: string;
  endTime?: string;
  label?: string;
  /** ce que le passager a payé */
  price: number;
  /** ce que le club garde dessus */
  schoolShare: number;
  /** price − schoolShare : ce que l'entraîneur touche */
  teacherShare: number;
}

/** Une ligne du tableau des chevaliers d'une carte, sur la paie de l'entraîneur. */
export interface TeacherPayStudentLine {
  studentId: string;
  name: string;
  registrationNumber?: string;
  phone?: string;
  caseLabel?: string;
  /** payé · partiel · impayé · rien encore · gratuit */
  payState: string;
  presents: number;
  absents: number;
  cancelled: number;
  /** séances de cette carte qui rapportent quelque chose à l'entraîneur */
  seances: number;
  /**
   * LE CARTE SÉANCE PAR SÉANCE, comme la feuille de présence l'affiche :
   * `"present" | "late" | "absent" | "cancelled"`, `null` pour une séance pas
   * encore pointée, et `"before"` pour une séance tenue AVANT son inscription
   * — celle-là n'a jamais été la sienne, elle reste vide sur sa ligne.
   */
  slots?: (string | null)[];
  /** ce qu'une de ses séances rapporte à l'entraîneur */
  perSeance: number;
  /** ce que la carte lui coûte */
  expected: number;
  /** ce qu'il a versé sur cette carte */
  credited: number;
  /** ce qu'il doit encore */
  debt: number;
  /** ce que ses séances rapportent à l'entraîneur sur cette carte */
  amount: number;
  /** sa part est RETENUE : il doit encore de l'argent */
  withheld: boolean;
  /** le club a avancé sa dette de sa propre caisse pour débloquer la part */
  schoolCovered: boolean;
}

/** Une ligne du tableau des arriérés — une part d'une carte DÉJÀ réglé. */
export interface TeacherPayArrearLine extends TeacherPayStudentLine {
  /** la carte d'origine de la part */
  monthCode: string;
  emploi: string;
  /** les jours concernés */
  dates: string[];
}

/** Une ligne du tableau des retenues (dépenses, acomptes, enfants). */
export interface TeacherPayDeductionLine {
  id: string;
  /**
   *  - `expense`     : une dépense que le club a avancée pour lui,
   *  - `acompte`     : une avance sur salaire,
   *  - `child`       : la cotisation ENCORE DUE d'un de ses enfants,
   *  - `child_debt`  : une cotisation d'enfant déjà créditée au guichet et
   *                    portée sur ce salaire.
   */
  kind: "expense" | "acompte" | "child" | "child_debt";
  label: string;
  description?: string;
  date: string;
  amount: number;
  /** déjà réglée par ce versement (elle ne revient pas sur le suivant) */
  paid: boolean;
}

/** Un arriéré débloqué, réglé par un versement postérieur à la carte concerné. */
export interface TeacherPaymentArrear {
  studentId: string;
  studentName: string;
  registrationNumber?: string;
  sessionId: string;
  emploi: string;
  monthCode: string;
  seances: number;
  amount: number;
}

/** One emploi-du-temps month closed by a settlement. */
export interface TeacherPaymentMonth {
  sessionId: string;
  title: string;
  groupName: string;
  /** the emploi's own month code — "M2" means "the 2nd month OF THAT emploi" */
  monthCode: string;
  /** séances the month held */
  seances: number;
  presents: number;
  students: number;
  /** what those séances earned him */
  gross: number;
}

/** One line taken off a settlement: a dépense or an acompte. */
export interface TeacherPaymentDeduction {
  id: string;
  kind: "expense" | "acompte";
  label: string;
  description?: string;
  amount: number;
  date: string;
}

/**
 * A student whose schooling is settled from his teacher-father's pay
 * (`Student.studentCase === "teacher_child"`): what he owed, and on which
 * emplois du temps, at the moment the salary was paid.
 */
export interface TeacherChildCharge extends Authored {
  studentId: string;
  studentName: string;
  registrationNumber?: string;
  /** what he owes, emploi by emploi */
  lines: { subscriptionId: string; label: string; monthCode: string; amount: number }[];
  amount: number;
}

/**
 * UNE SCOLARITÉ D'ENFANT PORTÉE EN DETTE SUR SON PÈRE ENTRAÎNEUR.
 *
 * Un fils d'entraîneur n'a pas à attendre la paie de son père pour être en
 * règle : la réception peut solder son carte depuis la feuille de présence du
 * groupe, sans ouvrir le moindre écran de paie. Deux chemins s'offrent alors,
 * et l'un d'eux écrit cette ligne :
 *
 *  - « la famille paie maintenant » : l'argent entre en caisse comme n'importe
 *    quel versement, et RIEN n'est retenu au père (aucune ligne ici) ;
 *  - « à porter sur le salaire du père » : le solde de l'enfant est crédité
 *    tout de suite — ses carte cessent d'être en dette, la part que ses séances
 *    rapportent à l'entraîneur se débloque — et le montant est inscrit ICI, en
 *    attente. Le prochain règlement du père le lit, le retient sur son net et
 *    le passe à `paid` : il ne peut donc être retenu qu'UNE fois.
 */
export interface TeacherChildDebt extends Authored {
  id: string;
  /** l'entraîneur père sur qui la somme est portée */
  teacherId: string;
  studentId: string;
  /** l'emploi du temps crédité (absent = une dette hors emploi : restes, frais) */
  subscriptionId?: string;
  /** la carte de cet emploi qui a été soldé (M1, M2 …) */
  monthCode?: string;
  /** ce que la ligne dit sur la fiche de paie */
  label: string;
  amount: number;
  date: string; // YYYY-MM-DD
  /** déjà retenu sur un règlement — il ne revient jamais sur le suivant */
  paid?: boolean;
  paymentId?: string;
  createdAt?: string;
}

export interface TeacherPaymentDetail {
  dateKey: string;
  sessionId: string;
  title: string;
  moduleName: string;
  groupName: string;
  startTime: string;
  endTime: string;
  presents: number;
  passagers: number;
  gross: number;
  share: number;
}

export type ReceptionPaymentType = "daily" | "monthly" | "half_day" | "hourly";

/**
 * UN MÉTIER DE TRAVAILLEUR, tel que le club le nomme elle-même.
 *
 * Les trois métiers d'origine — réception, agent de sécurité, ménage — n'étaient
 * pas les seuls que le club emploie : il y a le chauffeur, le cuisinier, le
 * surveillant, le comptable. Ils se créent et se suppriment désormais depuis
 * l'écran de création d'un travailleur, sans passer par le code.
 *
 * Les trois métiers d'origine gardent leur identifiant historique
 * (`reception`, `security`, `menage`) : les fiches déjà en base continuent donc
 * de pointer le bon métier.
 */
export interface WorkerJobRole extends Authored {
  id: string;
  name: string;
  createdAt?: string;
}

/** L'identifiant d'un `WorkerJobRole`. C'était une énumération figée. */
export type WorkerRole = string;

export interface ReceptionStaff extends Authored {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  paymentType: ReceptionPaymentType;
  startDate: string;
  salary: number;
  /** le métier — l'identifiant d'un `WorkerJobRole` */
  role?: WorkerRole;
  /** badge used by the worker check-in scanner */
  rfid?: string;
  /** paymentType === "hourly": price of one worked hour */
  hourlyRate?: number;
  /**
   * CE TRAVAILLEUR PEUT-IL SE CONNECTER ?
   *
   * Un travailleur n'a pas de compte par défaut : il est une fiche, un salaire
   * et un badge. L'administration l'active explicitement, saisit un email, un
   * nom d'utilisateur et un mot de passe, et le compte existe alors vraiment
   * dans la table d'authentification.
   */
  hasAccount?: boolean;
  /** le nom d'utilisateur affiché sur son compte */
  username?: string;
  /**
   * LES ÉCRANS QU'IL VOIT DANS SA BARRE LATÉRALE (clés de `PERMISSION_PAGES`).
   *
   * Un travailleur créé aujourd'hui arrive avec une liste VIDE : il ne voit
   * rien tant que l'administration n'a pas coché ses écrans depuis « Droits
   * d'accès ». Absent (et non vide) veut dire « fiche antérieure aux droits » :
   * elle garde l'ancien menu de la réception, pour ne verrouiller personne du
   * jour au lendemain.
   */
  navKeys?: string[];
  /**
   * LES BOUTONS QU'IL VOIT SUR CES ÉCRANS, sous la forme « écran:action »
   * (« students:create », « cash:withdraw » …). Une action absente de la liste
   * n'est simplement pas affichée.
   */
  actionKeys?: string[];
  createdAt?: string;
}

/** One worked day of an hourly worker (clock-in / clock-out). */
export interface WorkerShift extends Authored {
  id: string;
  workerId: string;
  workDate: string; // YYYY-MM-DD
  startAt?: string;
  endAt?: string;
  minutes: number;
  /** the day ended without a clock-out: hours frozen until reception fixes it */
  frozen: boolean;
  paid: boolean;
  paymentId?: string;
  createdAt: string;
}

/**
 * UN RÈGLEMENT VERSÉ À UN TRAVAILLEUR.
 *
 * L'écran des travailleurs devinait autrefois ce qui avait déjà été payé en
 * relisant la DESCRIPTION des mouvements de caisse (« le libellé contient le
 * nom de famille et « 08/2026 » »). Deux homonymes, un nom mal tapé, une
 * description modifiée à la main, et une carte payée repassait pour impayé.
 *
 * Un règlement est désormais une ligne à part entière : elle nomme les périodes
 * qu'elle solde (`periodKeys`), ce qu'elles valaient (`gross`), les acomptes et
 * les absences qui en ont été retranchés, le net calculé, et le montant
 * RÉELLEMENT versé — que l'administration peut corriger à la main.
 */
export interface WorkerPayment extends Authored {
  id: string;
  workerId: string;
  /** le type de contrat au moment du règlement */
  kind: ReceptionPaymentType;
  /**
   * CE QUE CE RÈGLEMENT SOLDE : « 08/2026 » pour une carte, « 2026-08-14 » pour
   * une journée, l'identifiant d'une journée pointée pour un contrat horaire.
   */
  periodKeys: string[];
  /** contrat horaire : les journées pointées qui viennent d'être réglées */
  shiftIds?: string[];
  /** ce que les périodes valent, avant retenues */
  gross: number;
  /** les acomptes retenus sur ce règlement */
  acomptes: number;
  /** les absences retenues sur ce règlement */
  absences: number;
  /** gross − acomptes − absences */
  net: number;
  /** ce qui a été réellement versé (le net, sauf correction manuelle) */
  amount: number;
  /** le jour du versement (YYYY-MM-DD) — corrigeable */
  date: string;
  /** facultative */
  description?: string;
  /** le mouvement de caisse qui porte la sortie */
  cashId?: string;
  createdAt?: string;
}

/**
 * UNE AVANCE SUR SALAIRE VERSÉE À UN TRAVAILLEUR.
 *
 * Elle sort de la caisse le jour où elle est versée, puis elle est RETENUE sur
 * son prochain règlement — une fois, et une seule : `paid` porte le règlement
 * qui l'a prise, et elle ne revient jamais sur le suivant.
 *
 * Les acomptes des travailleurs vivaient autrefois dans la table des acomptes
 * d'ENTRAÎNEURS, dont la clé étrangère exige pourtant un entraîneur : la base
 * refusait la ligne, et l'avance n'était jamais enregistrée. Ils ont désormais
 * leur table.
 */
export interface WorkerAcompte extends Authored {
  id: string;
  workerId: string;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  /** déjà retenu sur un règlement — il ne revient pas sur le suivant */
  paid?: boolean;
  paymentId?: string;
}

/**
 * UNE ABSENCE RETENUE SUR LA PAIE D'UN TRAVAILLEUR.
 *
 * Contrairement à l'acompte, elle ne sort AUCUN argent : elle dit ce qui sera
 * déduit le jour de la paie, et se solde comme lui, une fois et une seule.
 */
export interface WorkerAbsence extends Authored {
  id: string;
  workerId: string;
  cost: number;
  description: string;
  date: string; // YYYY-MM-DD
  paid?: boolean;
  paymentId?: string;
}

/** The hours ONE day of an emploi du temps runs on. */
export interface DayTime {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface ScheduleSession extends Authored {
  id: string;
  /**
   * LE SEMESTRE AUQUEL CET EMPLOI DU TEMPS APPARTIENT.
   *
   * C'est lui qui décide jusqu'à quand les cartes de ce créneau continuent de
   * se créer : la dernière carte ouverte avant la date de fin va jusqu'au bout,
   * et aucune ne s'ouvre après. Absent = emploi du temps d'avant les semestres,
   * qui continue de fonctionner comme il l'a toujours fait.
   */
  semesterId?: string;
  classId: string;
  moduleId: string;
  groupId: string;
  salleId: string;
  teacherId: string;
  days: Day[];
  /**
   * The emploi's DEFAULT hours — what every day runs on unless `dayTimes` says
   * otherwise. Always filled, so anything that only needs "roughly when" can
   * read them directly.
   */
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  /**
   * Per-day hours. An emploi that runs Samedi 08:00–10:00 and Mardi 14:00–16:00
   * carries both here; a day absent from the map simply runs on
   * `startTime`/`endTime`. Read it through `sessionTimesOn()` — never directly,
   * so the fallback stays in one place.
   */
  dayTimes?: Partial<Record<Day, DayTime>>;
  /**
   * PLUSIEURS SÉANCES LE MÊME JOUR.
   *
   * Un groupe s'entraîne parfois DEUX FOIS dans la même journée — 08:00–10:00
   * le matin, puis 17:00–19:00 le soir. Ce ne sont pas deux emplois du temps :
   * c'est le même groupe, le même entraîneur, la même carte — mais deux séances
   * distinctes, qui se pointent séparément et se paient deux fois.
   *
   * `daySlots` porte, jour par jour, la LISTE de ces séances dans l'ordre où
   * elles tombent. `dayTimes[day]` garde toujours la PREMIÈRE, et
   * `startTime`/`endTime` celle du premier jour : tout ce qui ne demande que
   * « à peu près quand » continue de les lire sans rien savoir de la nouveauté.
   *
   * Un jour absent de la carte n'a qu'une séance, exactement comme avant.
   * Lisez-la par `sessionSlotsOn()` — jamais directement — pour que le repli
   * reste à un seul endroit.
   */
  daySlots?: Partial<Record<Day, DayTime[]>>;
  /**
   * Per-day arène. An emploi that runs Samedi in Arène A and Mardi in Arène B is
   * still ONE emploi: each day simply carries the room it occupies. A day absent
   * from the map falls back on `salleId`, which always holds the first day's
   * room so anything that only needs "roughly where" can read it directly.
   * Read it through `sessionSalleOn()` — never directly, so the fallback stays
   * in one place.
   */
  daySalles?: Partial<Record<Day, string>>;
  /**
   * UN EMPLOI DU TEMPS SUR PLUSIEURS NIVEAUX À LA FOIS.
   *
   * Un même créneau réunit parfois deux catégories qui n'ont rien à voir : la 4e
   * année moyenne et la 3e année secondaire, chacune avec SES groupes. Ce
   * champ dit, catégorie par catégorie, quels groupes cette catégorie amène :
   *
   *     { "cls-4am": ["grp-a", "grp-b"], "cls-3as": ["grp-c"] }
   *
   * `classIds` porte la liste des catégories, `classId` la PREMIÈRE (la colonne
   * historique que le scan et la base lisent), et `groupIds` l'union de tous
   * les groupes — de sorte que rien de ce qui existait n'a besoin de savoir
   * qu'un emploi peut désormais couvrir plusieurs niveaux.
   *
   * Absent = emploi du temps à un seul niveau, exactement comme avant.
   */
  classGroups?: Record<string, string[]>;
  /** "séance libre" timing: several catégories/groups/arènes over a date period */
  isOpen?: boolean;
  /** explicit, readable name — only set for séance libre timings */
  title?: string;
  periodStart?: string;
  periodEnd?: string;
  classIds?: string[];
  groupIds?: string[];
  salleIds?: string[];
  /** price of one séance libre (mirrored into the auto-created subscription) */
  openPrice?: number;
  /**
   * Le jour où la réception a SUPPRIMÉ cet emploi du temps (YYYY-MM-DD).
   *
   * Un emploi du temps n'est jamais effacé : le supprimer l'ARCHIVE. La ligne
   * reste en base, donc les présences qui y ont été pointées, les soldes et les
   * paiements des chevaliers, et les parts déjà dues à l'entraîneur continuent de
   * s'afficher — avec le nom du module, du groupe et de l'arène. Il disparaît
   * simplement des écrans qui servent à travailler aujourd'hui (grille, feuille
   * de présence, catalogue d'inscription).
   *
   * Absent = emploi du temps vivant.
   */
  archivedAt?: string;
}

/**
 * =============================================================================
 *  LE SEMESTRE — la saison du club, et ce qui la ferme
 * =============================================================================
 *
 * Un semestre est la PÉRIODE pendant laquelle le club travaille : il porte un
 * nom, une date de début, une date de fin annoncée, et tout ce qui se joue
 * entre les deux — les emplois du temps, leurs cartes, les chevaliers, ce qui
 * rentre et ce qui reste dû.
 *
 * SA FIN N'EST PAS UNE DATE, C'EST UN TRAVAIL FINI. La date annoncée
 * (`endDate`) dit quand le club ESPÈRE fermer. Mais une séance annulée pour
 * tout un groupe se décale d'une semaine, et la carte qu'elle devait clore
 * déborde alors sur la date de fin. Le semestre ne se ferme donc PAS tant
 * qu'un emploi du temps n'a pas fini ses cartes : sa date de fin est REPOUSSÉE
 * jusqu'au jour de la dernière présence, et `plannedEndDate` garde ce qui avait
 * été annoncé pour que l'écart se lise.
 *
 * UNE FOIS FERMÉ, IL FERME AUSSI LE POINTAGE. Plus aucune présence ne s'écrit —
 * ni au tableau de bord, ni sur l'écran Présences — tant que le semestre
 * suivant n'a pas été créé. C'est ce qui empêche une séance de janvier de
 * tomber dans une saison terminée.
 */
export interface Semester extends Authored {
  id: string;
  /** ce que le club l'appelle : « Saison 2026-2027 — 1er semestre » */
  name: string;
  startDate: string; // YYYY-MM-DD
  /**
   * La fin RÉELLE : celle qui est annoncée, puis repoussée d'elle-même quand
   * une carte déborde. C'est cette date-là que les écrans affichent.
   */
  endDate: string; // YYYY-MM-DD
  /**
   * La fin ANNONCÉE à la création, gardée telle quelle. Elle n'existe que pour
   * dire « on avait dit le 15 janvier, on a fini le 20 » — absente tant que
   * rien n'a débordé.
   */
  plannedEndDate?: string;
  description?: string;
  /**
   * Le jour où le semestre a été DÉCLARÉ CLOS : toutes les cartes de tous ses
   * emplois du temps ont donné toutes leurs séances. Tant qu'il est absent, le
   * semestre vit — même passé sa date de fin.
   */
  closedAt?: string;
  /** l'alerte de prolongation a déjà été vue par le comptoir */
  extensionSeenAt?: string;
  createdAt?: string;
}

/**
 * =============================================================================
 *  UNE CARTE D'UN EMPLOI DU TEMPS — le pack de séances que le groupe vit
 * =============================================================================
 *
 * Jusqu'ici une carte était une DIVISION : on comptait les présences d'un
 * chevalier et on les découpait quatre par quatre. Cela suffisait pour la paie,
 * mais ne disait rien de ce que la réception veut savoir — quand la carte du
 * GROUPE a commencé, quand elle finira, et laquelle est en cours.
 *
 * Une carte est donc désormais une LIGNE, tenue par l'emploi du temps :
 *
 *  - LA PREMIÈRE naît avec l'emploi du temps, à la date que la réception fixe
 *    (« Date de début de la 1ʳᵉ carte »). Cette date n'est qu'une INTENTION :
 *    tant qu'aucune présence n'y est pointée, la carte n'a pas commencé.
 *  - ELLE COMMENCE VRAIMENT au premier pointage : `startDate` prend le jour de
 *    cette première séance, et l'intention est simplement décalée. Une carte
 *    prévue le 20 septembre mais pointée pour la première fois le 27 commence
 *    le 27.
 *  - ELLE SE FERME sur la séance qui complète le pack (`size`) : `endDate`
 *    prend ce jour-là et l'état passe à `complete`.
 *  - LA SUIVANTE N'EXISTE PAS AVANT. Aucune carte 2 tant que la carte 1 n'a pas
 *    donné ses quatre séances — c'est ce qui empêche l'écran de paie de
 *    proposer douze cartes dont onze n'ont jamais eu lieu.
 *
 * UNE SÉANCE ANNULÉE POUR TOUT LE GROUPE NE COMPTE PAS. Elle n'avance pas la
 * carte, ne coûte rien à personne, et la carte se termine simplement une
 * semaine plus tard : c'est le décalage, et il se lit sur `postponed`.
 */
export interface EmploiCarte extends Authored {
  id: string;
  /** le semestre dans lequel cette carte se joue */
  semesterId: string;
  /** l'emploi du temps dont elle est la carte */
  sessionId: string;
  /** 1, 2, 3 … — le rang de la carte sur CET emploi du temps */
  index: number;
  /** « M1 », « M2 » … — le code historique, celui que la paie et les paiements
   *  écrivent déjà partout. Il ne change pas ; seul l'affichage dit « Carte 1 ». */
  code: string;
  /** combien de séances cette carte contient (copié du tarif à sa naissance) */
  size: number;
  /** la date que la réception a fixée — une intention, jamais un fait */
  plannedStartDate: string;
  /** le jour de la PREMIÈRE présence réellement pointée sur cette carte */
  startDate?: string;
  /** le jour de la séance qui l'a complétée */
  endDate?: string;
  /** séances effectivement tenues (les annulations pour tout le groupe exclues) */
  held?: number;
  /** les jours où la séance a été annulée pour TOUT le groupe, donc décalée */
  postponed?: string[];
  /** `planned` : pas encore commencée · `running` : en cours · `complete` : close */
  status: "planned" | "running" | "complete";
  createdAt?: string;
}

/**
 * How ONE inscription is sold:
 *  - `seance`: the student buys séances one by one, they never expire,
 *  - `month`: he buys a whole month (a fixed pack of séances at a fixed price)
 *    which expires exactly one month after its start date — whatever is left
 *    unused on that day is lost.
 */
export type SubscriptionPlan = "seance" | "month";

export interface Subscription extends Authored {
  id: string;
  /** the schedule this subscription is priced against */
  sessionId: string;
  pricePerSession: number;
  /** formation catégories: fixed price for the whole level (pricePerSession stays 0) */
  levelPrice?: number;
  /** formation catégories: duration in months, drives the per-student expiry date */
  periodMonths?: number;
  /** monthly formula: how many séances one month of this cours includes.
   *  0 / undefined = the cours is only sold séance by séance. */
  monthlySeances?: number;
  /** what that month costs. Defaults to `monthlySeances × pricePerSession`, but
   *  the school may sell the pack for less than the sum of its séances. */
  monthlyPrice?: number;
  /** monthly formula: how much of `monthlyPrice` the SCHOOL keeps. What is left
   *  once the transport is taken out (monthlyPrice − transportMonthShare −
   *  schoolMonthShare) is the teacher's share for that month.
   *  Absent = the school keeps the whole month price. */
  schoolMonthShare?: number;
  /**
   * LE TRANSPORT — ce que la carte paie pour le bus, et rien d'autre.
   *
   * Le prix d'une carte se coupe désormais en TROIS et non plus en deux : le
   * transport d'abord, puis la part du club, et ce qui reste appartient à
   * l'entraîneur. Le transport n'est ni un revenu du club ni une part de
   * l'entraîneur : c'est un coût que la carte porte, suivi à part pour que les
   * rapports puissent dire ce que le ramassage coûte, groupe par groupe.
   *
   * 0 ou absent = ce créneau n'a pas de transport, et la carte se coupe en deux
   * exactement comme avant.
   */
  transportMonthShare?: number;
  /** monthly formula: the teacher's pay for ONE séance, derived at creation as
   *  teacherMonthShare / monthlySeances. Stored so every settlement reads it
   *  directly instead of recomputing. */
  teacherPerSeance?: number;
  /**
   * L'ENGAGEMENT — le frais d'entrée propre à CET emploi du temps.
   *
   * Ce n'est ni la cotisation (qui se paie carte après carte) ni les droits
   * d'entrée du club (qui se règlent une fois pour toutes, tous emplois
   * confondus) : c'est ce que le chevalier verse pour REJOINDRE ce créneau —
   * la tenue, l'équipement, l'assurance du groupe.
   *
   * Il est porté au compte du chevalier sous la forme d'un frais ordinaire
   * (`StudentCharge`) le jour de son inscription sur l'emploi, et se règle en
   * une ou plusieurs fois comme n'importe quel autre frais.
   *
   * 0 ou absent = cet emploi du temps ne demande aucun engagement.
   */
  engagementFee?: number;
  /** ce que l'engagement dit sur la fiche du chevalier et sur son reçu */
  engagementDescription?: string;
  /** l'emploi du temps de ce tarif a été supprimé : le tarif est archivé avec
   *  lui, pour que les soldes et les paiements qu'il porte restent lisibles */
  archivedAt?: string;
}

/**
 * Per-student enrollment dates (YYYY-MM-DD), kept for EVERY enrollment —
 * cours and formations alike:
 *  - `subscribedAt`: the day reception registered the student on that module
 *    (purely informative, it never drives a price),
 *  - `startDate`: the day billing starts. A séance attended BEFORE it is
 *    recorded as usual but never charged (see `AttendanceRecord.preStart`),
 *  - `expiryDate`: end of the enrollment — formations get one from the level's
 *    duration, monthly plans one month after their start date. Past it, the
 *    card is refused and the séances still on the counter are lost.
 */
export interface SubscriptionDates {
  subscribedAt?: string;
  startDate?: string;
  expiryDate?: string;
  /** how the module was sold to this student ("seance" when absent) */
  plan?: SubscriptionPlan;
  /**
   * WHERE on the emploi du temps the student came in. A child registered while
   * the group is living its 2nd month, on its 3rd séance, starts there and not
   * on M1 · séance 1: `joinMonthCode` is that month ("M2") and `joinSlotIndex`
   * that séance, 0-based (séance 3 -> 2).
   *
   * Every month calculation offsets his séances by that point, so his first
   * présence lands on M2 · séance 3, the séances held before him stay blank on
   * the sheet, and the months he was not part of never list him at all.
   *
   * Absent = M1 · séance 1, exactly how every inscription read before.
   */
  joinMonthCode?: string;
  joinSlotIndex?: number;
  /**
   * The day reception took the student OFF this emploi du temps. The block is
   * KEPT when he leaves — only `subscriptionIds` loses the module — so his
   * présences, ses paiements et son solde restent lisibles sur sa fiche, datés
   * de la sortie. Re-registering him clears it and rewrites the join point.
   */
  unsubscribedAt?: string;
}

/** Reduction granted to ONE student on ONE module, applied by every price
 *  calculation (scan, manual présence, weekly absence billing). */
export type DiscountType = "percent" | "amount";
export interface SubscriptionDiscount {
  type: DiscountType;
  value: number;
}

/**
 * "Période gratuite": a date window during which attending is offered. The card
 * is scanned and the presence is written exactly as usual, but the séance price
 * is NEVER taken off the student's balance — it is stored on the presence
 * (`waivedAmount`) so the school can see what the period cost it.
 */
export interface FreePeriod extends Authored {
  id: string;
  /** short label shown on the card, e.g. "Semaine portes ouvertes" */
  name: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  /** covers every class (the default); otherwise only `classIds` */
  allClasses: boolean;
  classIds: string[];
  /** teachers still earn their percentage on an offered séance */
  payTeachers: boolean;
  /** suspends the period without losing its history */
  active: boolean;
  createdAt?: string;
}

/** Server-side totals of one free period (never truncated by a row limit). */
export interface FreePeriodStat {
  id: string;
  /** presences recorded during the period */
  presences: number;
  /** distinct students who benefited from it */
  students: number;
  /** what those presences would have cost the students = cost of the period */
  waived: number;
}

/** Weekly-absence billing switch for a single module. */
export interface ModuleAbsenceRule {
  moduleId: string;
  enabled: boolean;
  /** length of the absence window in days (7 = the default weekly rule) */
  daysWindow: number;
}

/**
 * How a student is billed. `normal` is the default; the four other cases are
 * ticked at creation:
 *  - `special`: free education, EMPLOI DU TEMPS PAR EMPLOI DU TEMPS — the
 *     modules listed in `freeSubscriptionIds` cost nothing (neither the school
 *     nor the teacher is paid for them) and the others are billed as usual,
 *  - `teacher_child`: the school is paid from the teacher-father's salary, not
 *     from the student directly (see `teacherFatherId`),
 *  - `reduction`: a reduction split between the school and the teacher (see
 *     `caseReduction`),
 *  - `school_only`: the school is paid, but the listed teachers are NOT paid for
 *     this student's presences (see `unpaidTeacherIds`).
 */
export type StudentCase = "normal" | "special" | "teacher_child" | "reduction" | "school_only";

/** A reduction split between the school and the teacher — each grants its own
 *  part, as a percentage or a fixed amount. */
export interface CaseReduction {
  type: DiscountType;
  /** the school's part of the reduction */
  schoolValue: number;
  /** the teacher's part of the reduction */
  teacherValue: number;
}

export interface Student extends Authored {
  id: string;
  /** sequential registration number printed on the card and searchable from
   *  every roster ("00001", "00002" …). Assigned once, at creation. */
  registrationNumber?: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  /**
   * DEUXIÈME NUMÉRO DE LA FAMILLE — facultatif.
   *
   * Le premier numéro est celui qu'on compose, le second celui qu'on compose
   * quand le premier ne répond pas : la mère, l'oncle, le voisin. Il s'affiche
   * partout où le premier s'affiche (fiche, modification, listes) et n'est
   * jamais exigé — une fiche sans second numéro est une fiche complète.
   */
  phone2?: string;
  email: string;
  /**
   * L'ADRESSE DE LA FAMILLE — facultative.
   *
   * Elle ne commande rien : ni tarif, ni groupe, ni document obligatoire. Elle
   * sert à retrouver quelqu'un, et c'est déjà beaucoup. Une fiche sans adresse
   * est une fiche complète.
   */
  address?: string;
  rfid: string;
  isFree: boolean;
  /** billing case — absent/"normal" means an ordinary paying student */
  studentCase?: StudentCase;
  /**
   * « Cas spécial (gratuit) »: WHICH emplois du temps are offered.
   *
   * La gratuité se coche emploi par emploi : un chevalier peut suivre trois modules
   * dont deux offerts et un payant. Les emplois listés ici ne coûtent rien —
   * ni au chevalier, ni à la charge du club, ni en part entraîneur — et ceux
   * qui n'y sont pas sont facturés au tarif ordinaire.
   *
   * ABSENT = toute sa cotisation est offerte, exactement comme le cas se lisait
   * avant d'être détaillé : les fiches déjà en base ne changent pas de sens.
   */
  freeSubscriptionIds?: string[];
  /** teacher_child: the teacher whose salary settles this student */
  teacherFatherId?: string;
  /** reduction: how much the school and the teacher each knock off */
  caseReduction?: CaseReduction;
  /** school_only: teachers NOT paid for this student's presences */
  unpaidTeacherIds?: string[];
  /**
   * « Club seulement » : SUR QUELS EMPLOIS DU TEMPS l'option est ACTIVE.
   *
   * Exactement comme la gratuité, l'option se coche emploi par emploi. Un chevalier
   * peut suivre trois modules dont un « club seule » et deux ordinaires : sur
   * l'emploi activé, la famille ne verse que la part du club, l'entraîneur
   * n'est pas payé pour lui et il n'apparaît même pas sur l'écran de paie de cet
   * entraîneur ; sur les deux autres, tout se calcule normalement.
   *
   * ABSENT = les fiches d'avant, pilotées par `unpaidTeacherIds` seul.
   */
  schoolOnlySubscriptionIds?: string[];
  /**
   * OÙ LA RÉCEPTION EN ÉTAIT quand elle a créé la fiche : le niveau (« catégorie »)
   * et l'année choisis dans le catalogue d'inscription.
   *
   * Un chevalier peut très bien être créé avec sa catégorie et son année SANS emploi du
   * temps — le créneau n'est pas encore ouvert, la famille hésite. Sans ces deux
   * champs, l'écran de modification rouvrait sur un primaire/1AP qui ne le
   * concernait pas et la réception devait retrouver la catégorie à la main.
   */
  enrollmentLevel?: string;
  enrollmentYear?: string;
  parentId?: string;
  subscriptionIds: string[];
  /** formation enrollments: start/expiry per subscription id */
  subscriptionDates?: Record<string, SubscriptionDates>;
  /** per-module reduction, keyed by subscription id */
  subscriptionDiscounts?: Record<string, SubscriptionDiscount>;
  /** outstanding one-time registration cost not yet settled */
  registrationDue?: number;
}

/**
 * ONE inscription of ONE student on ONE subscription (module), counted in
 * SÉANCES — not in money. Buying séances raises `paidSeances`; attending one
 * raises `consumedSeances`. What is left is simply the difference.
 */
export interface Enrollment extends Authored {
  id: string;
  studentId: string;
  /** -> Subscription, which carries the price of one séance */
  subscriptionId: string;
  /** cumulative séances bought */
  paidSeances: number;
  /** séances used up by attendance */
  consumedSeances: number;
  // remaining = paidSeances - consumedSeances
  /** reduction granted on this module, applied by every price calculation */
  discount?: SubscriptionDiscount;
  startDate?: string;
  /** formations and monthly plans: past it, the card is refused and whatever is
   *  left on the counter is lost */
  expiryDate?: string;
  /** how the running period was sold ("seance" when absent) */
  plan?: SubscriptionPlan;
  /** monthly plan: séances the paid month includes. A renewal RESETS the
   *  counters to it — the unused séances of the previous month are not carried
   *  over, they expired with it. */
  monthSeances?: number;
  /**
   * MONEY left on this emploi du temps — the "solde" reception recharges and
   * every présence eats into. Credited by a payment, debited by the price of
   * one séance each time a présence (or a billable absence) is written. It may
   * go NEGATIVE: that is exactly the student's debt on this emploi.
   */
  balance?: number;
  createdAt: string;
}

export type PaymentType = "subscription_payment" | "debt_payment";

/**
 * WHERE the money of a movement came from:
 *  - `cash`: the family handed it over at the desk (the default),
 *  - `teacher_salary`: it was taken off a teacher-father's pay — no cash moved,
 *  - `teacher_debt`: the school credited a teacher-father's child NOW and
 *     booked what it cost ON THE FATHER, to be taken off his NEXT settlement
 *     (see `TeacherChildDebt`). No cash moved either: the school will simply
 *     hand him less. It is the deferred twin of `teacher_salary` — the child is
 *     settled today, the father pays for it on payday,
 *  - `school_cash`: the SCHOOL covered the student's debt out of its own
 *     caisse, so the teacher could be settled today. The caisse then carries
 *     both movements: the payment booked on the student, and the outflow that
 *     paid for it.
 */
export type PaymentSource =
  | "cash"
  | "teacher_salary"
  | "teacher_debt"
  | "school_cash"
  /**
   * LE SOLDE D'UN AUTRE EMPLOI DU TEMPS, TRANSPORTÉ ICI.
   *
   * Un chevalier qu'on mute d'un groupe à un autre n'abandonne pas ce qu'il a
   * déjà versé : ce qui restait sur l'ancien créneau est retiré de là et
   * recrédité sur le nouveau, au dinar près. Aucun argent n'entre ni ne sort du
   * tiroir — c'est le MÊME argent qui change de case — donc la caisse ne bouge
   * pas, et les deux lignes se lisent l'une en face de l'autre dans son
   * historique.
   */
  | "transfer";

/**
 * One cash movement of a student: either a purchase of séances (with its
 * remise and the part left unpaid) or a settlement of an earlier debt.
 */
export interface Payment extends Authored {
  id: string;
  studentId: string;
  enrollmentId?: string;
  /** the emploi du temps (subscription) this movement credits */
  subscriptionId?: string;
  /**
   * The emploi's OWN month cycle this movement belongs to ("M1", "M2" …).
   * Months are no longer calendar months: each emploi du temps counts its own,
   * opened by the first présence and closed by the last séance of the pack.
   */
  monthCode?: string;
  seancesPurchased: number;
  /** price of one séance at the time of the purchase */
  unitPrice: number;
  /** seancesPurchased × unitPrice — except on a monthly plan, where it is the
   *  price of the month pack (which may be cheaper than its séances) */
  grossTotal: number;
  /** the formula this purchase was made on ("seance" when absent) */
  plan?: SubscriptionPlan;
  discountType?: DiscountType;
  discountValue?: number;
  /** after the remise */
  netTotal: number;
  /** what the student actually handed over */
  amountPaid: number;
  /** netTotal − amountPaid: the debt this payment leaves behind */
  rest: number;
  type: PaymentType;
  /** where the money came from — "cash" (the family) when absent */
  paidFrom?: PaymentSource;
  /**
   * LE FRAIS QUE CE VERSEMENT RÈGLE (`StudentCharge`), quand c'en est un.
   *
   * Un règlement de frais ne touche AUCUN emploi du temps : il ne porte donc
   * ni `subscriptionId` ni `monthCode`, et son `rest` reste à 0 — ce qui
   * demeure dû se lit sur le frais lui-même. C'est ce qui l'empêche d'être
   * confondu avec une cotisation impayée et de retenir la part d'un entraîneur
   * qui n'a rien à voir avec un livre ou une tenue.
   */
  chargeId?: string;
  date: string;
  description?: string;
  /**
   * L'ALERTE DU TABLEAU DE BORD A-T-ELLE ÉTÉ LUE ?
   *
   * Un encaissement saisi par un TRAVAILLEUR remonte à la direction : il
   * apparaît dans la cloche du tableau de bord jusqu'à ce que l'administration
   * le marque comme lu (ou l'imprime, ce qui propose de le retirer). Les
   * versements saisis par l'administration elle-même ne remontent jamais.
   */
  alertRead?: boolean;
}

/**
 * D'OÙ VIENT UN FRAIS porté au compte d'un chevalier :
 *  - `manual` : la réception l'a saisi elle-même (livre, tenue, sortie,
 *    transport, dégât matériel…) ;
 *  - `school_advance` : le club a réglé une dette de cotisation DE SA PROPRE
 *    CAISSE pour débloquer la part de l'entraîneur. L'argent est sorti sans
 *    jamais entrer : la famille le doit désormais au club, et c'est ce frais
 *    qui le dit.
 */
export type StudentChargeOrigin =
  | "manual"
  | "school_advance"
  | "engagement"
  | "formation";
// `formation` : le prix d'une formation ou d'un évènement de la vitrine, porté
// au compte du chevalier le jour où on l'y inscrit. Il naît impayé — l'argent
// arrive au comptoir, parfois des semaines plus tard — et se règle comme
// n'importe quel autre frais.
// `engagement` : le frais d'entrée d'un emploi du temps (`Subscription.engagementFee`),
// porté automatiquement le jour où le chevalier s'inscrit sur ce créneau. Il ne
// naît jamais deux fois pour le même emploi : c'est ce qui le distingue d'une
// saisie manuelle, qu'on peut répéter autant qu'on veut.

/**
 * UNE DETTE DE LE CHEVALIER QUI N'EST PAS DE LA SCOLARITÉ.
 *
 * La réception tape un nom, un montant, une description facultative et une
 * date ; le frais s'inscrit au compte du chevalier et l'y suit jusqu'à ce qu'il
 * soit réglé — sur sa fiche, dans son historique, et sur la feuille de présence
 * du groupe, où il devient une alerte encaissable sur place.
 *
 * Il se règle en UNE ou PLUSIEURS FOIS : `paidAmount` cumule ce qui a déjà été
 * versé, et `amount − paidAmount` est ce qui reste dû. Un versement partiel
 * laisse donc le frais ouvert, exactement comme au comptoir.
 *
 * CE QU'IL NE FAIT PAS : retenir la paie d'un entraîneur. Un livre impayé ne
 * regarde pas l'entraîneur de mathématiques — seule la cotisation (les soldes
 * dans le rouge, les restes d'anciens paiements et les frais d'inscription)
 * bloque sa part.
 */
export interface StudentCharge extends Authored {
  id: string;
  studentId: string;
  /** ce que la réception a tapé : « Livre de maths », « Tenue de sport »… */
  name: string;
  /** ce que le frais coûte, en entier */
  amount: number;
  description?: string;
  /** le jour où le frais est né (YYYY-MM-DD) */
  date: string;
  /** `manual` quand absent — les fiches déjà en base sont des saisies */
  origin?: StudentChargeOrigin;
  /** avance du club : le versement qui l'a fait naître */
  sourcePaymentId?: string;
  /** l'emploi du temps concerné, quand le frais en désigne un (avances) */
  subscriptionId?: string;
  /** la carte de cet emploi, même remarque */
  monthCode?: string;
  /** ce qui a DÉJÀ été versé dessus, tous versements confondus */
  paidAmount?: number;
  /** entièrement réglé — `paidAmount` a rejoint `amount` */
  paid?: boolean;
  /** le dernier versement qui l'a soldé */
  paymentId?: string;
  createdAt?: string;
}

/** Portal password kept so the payment receipt can print the student's login.
 *  Stored in a staff-only table — never readable by the student/parent. */
export interface StudentCredential {
  studentId: string;
  password: string;
  updatedAt: string;
}

/** One automatic weekly-absence charge: a module the student was absent on for
 *  a full 7-day window. It costs ONE séance off that inscription — the same
 *  currency attendance is counted in. */
export interface AbsencePenalty extends Authored {
  id: string;
  studentId: string;
  subscriptionId?: string;
  sessionId?: string;
  moduleId?: string;
  /** first/last day of the absent 7-day window (YYYY-MM-DD) */
  periodStart: string;
  periodEnd: string;
  /** money value of the séance that was burnt — kept for the reports only */
  amount: number;
  /** séances left on that inscription once the penalty was applied */
  remainingAfter: number;
  createdAt: string;
}

/**
 * `cancelled` is the séance that did not happen for this student: it is written
 * on the sheet like the others, but nothing is consumed and nothing is taken
 * off his solde.
 */
export type AttendanceStatus = "present" | "late" | "absent" | "cancelled";
export interface AttendanceRecord extends Authored {
  id: string;
  studentId: string;
  sessionId: string;
  timestamp: string;
  amountDeducted: number;
  status: AttendanceStatus;
  /** the student attended ANOTHER group of the same course (same class + module)
   *  than the one he is enrolled in — a "rattrapage" */
  substituteGroup?: boolean;
  /** the séance was offered by this free period (nothing was deducted) */
  freePeriodId?: string;
  /** the séance happened BEFORE the enrollment's start date: presence kept,
   *  balance untouched (the price sits in `waivedAmount`) */
  preStart?: boolean;
  /** the price that was NOT charged (free period or pre-start séance) — 0 on
   *  every ordinary presence */
  waivedAmount?: number;
  /**
   * The row costs NOTHING: no séance consumed, no solde debited, and it does
   * NOT advance the emploi's month cycle. Set on a cancelled séance and on the
   * very first record of a student that happens to be an absence (he never
   * attended this emploi yet, so his month has not started).
   */
  noCharge?: boolean;
  /**
   * LAQUELLE DES SÉANCES DU JOUR.
   *
   * Un emploi du temps peut tenir DEUX séances le même jour (le matin et le
   * soir). Elles se pointent séparément, se décomptent séparément et se paient
   * séparément : la ligne porte donc le rang de la séance dans la journée,
   * 0 pour la première.
   *
   * Absent = 0, c'est-à-dire l'unique séance du jour — ce qu'était toute
   * présence écrite avant cette colonne.
   */
  slot?: number;
}

export interface UnpaidTeacherSession extends Authored {
  id: string;
  teacherId: string;
  sessionId: string;
  studentId: string;
  amount: number;
  date: string;
  paid: boolean;
  /** la séance du jour qui l'a produite (0 = la première) — voir
   *  `AttendanceRecord.slot` */
  slot?: number;
  /** le règlement qui l'a soldée — annuler ce règlement la rend à nouveau due */
  paymentId?: string;
}

export interface TeacherAcompte extends Authored {
  id: string;
  teacherId: string;
  amount: number;
  description: string;
  date: string;
  /** taken off a settlement already — it never comes back on the next one */
  paid?: boolean;
  paymentId?: string;
}

/**
 * A cost the school carries FOR one teacher (matériel, transport, avance de
 * frais …). It is deducted from his next settlement, exactly once: reception
 * types a name, an amount, an optional description and a date.
 */
export interface TeacherExpense extends Authored {
  id: string;
  teacherId: string;
  name: string;
  amount: number;
  description?: string;
  date: string; // YYYY-MM-DD
  /** already taken off a settlement — it never reappears on the next one */
  paid?: boolean;
  paymentId?: string;
  createdAt?: string;
}
export interface TeacherAbsence extends Authored {
  id: string;
  teacherId: string;
  cost: number;
  description: string;
  date: string;
}

export type Audience = "students" | "teachers" | "parents" | "all";
export interface Announcement extends Authored {
  id: string;
  title: string;
  description: string;
  audience: Audience;
  endDate: string;
  date: string;
  /** empty = whole school; otherwise only these groups (and, when
   *  includeParents is on, the parents of their students) */
  targetGroupIds?: string[];
  includeParents?: boolean;
}

export interface ExpenseCategory extends Authored {
  id: string;
  name: string;
}
export interface Expense extends Authored {
  id: string;
  name: string;
  /** absent = dépense non classée; the column is a foreign key, so it is left
   *  empty rather than pointing at a category that does not exist */
  categoryId?: string;
  amount: number;
  date: string;
}

export type CashTxType =
  | "deposit"
  | "withdraw"
  | "expense"
  | "student_payment"
  | "teacher_payment"
  | "acompte"
  /** the school covered a student's debt from its own money: the outflow that
   *  balances the `student_payment` booked on that student */
  | "student_debt";
/**
 * LA RUBRIQUE D'UN MOUVEMENT DE CAISSE.
 *
 * « Équipement », « Entretien des arènes », « Tournoi » : de quoi ranger les
 * dépôts et les retraits pour que la caisse et les rapports puissent en donner
 * le total, rubrique par rubrique, plutôt qu'une longue liste plate.
 *
 * Elle se crée depuis le formulaire de dépôt ou de retrait lui-même : personne
 * ne devrait avoir à quitter sa saisie pour aller déclarer une rubrique.
 */
export interface CashCategory extends Authored {
  id: string;
  name: string;
  /** repère visuel de la rubrique dans les tableaux (jeton hexadécimal) */
  color?: string;
  createdAt?: string;
}

export interface CashTransaction extends Authored {
  id: string;
  type: CashTxType;
  amount: number; // signed
  date: string;
  description: string;
  /**
   * La rubrique, quand il y en a une.
   *
   * Absente = mouvement non classé. La colonne est une clé étrangère : on la
   * laisse vide plutôt que de pointer une rubrique supprimée. Les mouvements
   * automatiques — paiements, salaires, acomptes — n'en portent pas : ils sont
   * déjà classés par leur `type`.
   */
  categoryId?: string;
}

export interface Parent extends Authored {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** le second numéro — celui qu'on compose quand le premier ne répond pas */
  phone2?: string;
  /** sa date de naissance (YYYY-MM-DD) — facultative */
  birthDate?: string;
  /** son adresse — facultative, elle ne commande rien */
  address?: string;
  email: string;
  childIds: string[];
}

export interface Notification extends Authored {
  id: string;
  parentId: string;
  title: string;
  description: string;
  date: string;
  read: boolean;
  auto: boolean;
}

export type CourseworkType = "single" | "period";
export interface Coursework extends Authored {
  id: string;
  name: string;
  type: CourseworkType;
  dates: string[];
  pricePerSession: number;
  total: number;
  teacherId: string;
}

export interface IndependentSession extends Authored {
  id: string;
  studentId?: string;
  passagerName?: string;
  itemLabel: string;
  price: number;
  date: string;
  /** séance libre timing this attendance belongs to (drives the teacher payout) */
  sessionId?: string;
  startTime?: string;
  endTime?: string;
  createdAt?: string;
  /** the teacher has already been settled for this passager's séance — a
   *  créneau attended only by passagers has no unpaid_teacher_sessions row */
  teacherPaid?: boolean;
  /**
   * CE QUE LE CLUB GARDE SUR `price`.
   *
   * Une séance libre se vend comme une carte d'emploi du temps : la réception
   * tape le prix TOTAL payé par le chevalier de passage, puis la part que le club
   * garde. Le reste — `price − schoolShare` — est la part de l'entraîneur, et
   * c'est elle que l'écran de paie de la carte lui règle, passager par passager.
   *
   * ABSENT = séance enregistrée avant ce découpage : le club gardait tout, donc
   * la part entraîneur vaut zéro et aucun ancien total ne bouge.
   */
  schoolShare?: number;
  /** l'entraîneur que cette séance paie — figé à la création, parce que
   *  l'emploi du temps peut changer de titulaire après coup */
  teacherId?: string;
}

/**
 * A "sortie libre de groupe": one ponctual séance sold to a WHOLE group of
 * students at once, without naming any of them.
 *
 * Reception picks the teacher, the day and the hours, names the séance, types
 * how many students came, what one of them pays and how much of that the
 * school keeps. Everything else is arithmetic:
 *
 *     part entraîneur d'un chevalier = prix chevalier − part club
 *     total encaissé  = chevaliers × prix chevalier
 *     total club     = chevaliers × part club
 *     total entraîneur= chevaliers × part entraîneur
 *
 * Creating one posts BOTH cash movements (the money in, the teacher's pay out),
 * so the caisse and the rapports read it like any other séance — and editing or
 * deleting the row moves those two movements with it. The teacher's fiche de
 * paie prints the séance WITHOUT ever showing the school's share.
 */
export interface GroupSeance extends Authored {
  id: string;
  teacherId: string;
  /** what the séance is called on every document */
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  /** how many students attended */
  studentsCount: number;
  /** what ONE student pays for the séance */
  pricePerStudent: number;
  /** how much of that ONE price the school keeps */
  schoolPerStudent: number;
  /** the cash movement that booked the money in — rewritten on every edit */
  cashInId?: string;
  /** the cash movement that paid the teacher */
  cashOutId?: string;
  createdAt: string;
}

// =============================================================================
//  LES DEMANDES DE COMPTE — ce qui arrive par la page de connexion
// =============================================================================

/**
 * QUI DEMANDE : un chevalier pour lui-même, ou un parent pour ses fils.
 */
export type AccountRequestKind = "student" | "parent";

/** D'où vient la demande — voir `AccountRequest.source`. */
export type AccountRequestSource = "login" | "website";

/**
 * OÙ EN EST LA DEMANDE.
 *
 *  - `pending` : le compte existe et se connecte, mais il ne voit RIEN tant que
 *    l'intendance ne l'a pas rattaché à une fiche ;
 *  - `linked`  : la demande a été traitée — le compte pilote désormais une
 *    fiche de chevalier ou de parent, et l'application s'ouvre entièrement ;
 *  - `rejected`: l'intendance l'a écartée. Le compte reste en attente, faute
 *    de fiche, et la demande sort de la liste de travail.
 */
export type AccountRequestStatus = "pending" | "linked" | "rejected";

/** Un fils déclaré par un parent au moment de créer son compte. */
export interface AccountRequestChild {
  firstName: string;
  lastName: string;
  phone?: string;
  phone2?: string;
  birthDate?: string;
}

/**
 * UNE DEMANDE DE COMPTE VENUE DE LA PAGE DE CONNEXION.
 *
 * Personne au comptoir n'a rien saisi : c'est la famille elle-même qui a rempli
 * le formulaire, depuis son téléphone. Le compte est bien créé dans
 * `auth.users` — il se connecte tout de suite — mais il n'est rattaché à AUCUNE
 * fiche, donc il n'a rien à lire : l'application lui affiche « votre compte
 * attend son activation », et rien d'autre.
 *
 * L'intendance ouvre alors la demande depuis le tableau de bord, l'écran des
 * chevaliers ou celui des parents. Trois chemins :
 *
 *   1. le NUMÉRO DE TÉLÉPHONE correspond à une fiche déjà en base : elle est
 *      proposée d'office, il ne reste qu'à confirmer le rattachement ;
 *   2. il ne correspond à rien, mais la personne existe sous un autre numéro :
 *      on la cherche par son nom ;
 *   3. elle n'existe nulle part : la fiche est CRÉÉE depuis la demande — avec,
 *      pour un parent, celles de ses fils, rattachées à lui — et la catégorie
 *      et le groupe se choisissent au passage, ce qui les inscrit vraiment.
 */
export interface AccountRequest extends Authored {
  id: string;
  /** le compte créé dans `auth.users` (= `profiles.id`) */
  accountId: string;
  kind: AccountRequestKind;
  /**
   * D'OÙ LA DEMANDE VIENT.
   *
   *  `login`   — de la page de connexion de l'application, comme depuis
   *              toujours. C'est la valeur par défaut, et celle que portent
   *              toutes les demandes déjà en base ;
   *  `website` — du SITE PUBLIC du club, au bas d'une formation ou d'un
   *              évènement. Elle porte alors `formationId`, et son traitement
   *              inscrit d'office la personne sur cette formation.
   *
   * Les deux se traitent avec le même geste — rattacher ou créer la fiche —
   * mais elles ne s'affichent pas au même endroit : les demandes du site ont
   * leur écran, pour que l'intendance sache d'un coup d'œil ce que la vitrine
   * a rapporté.
   */
  source?: AccountRequestSource;
  /** la formation ou l'évènement d'où la demande est partie (site public) */
  formationId?: string;
  firstName: string;
  lastName: string;
  phone: string;
  phone2?: string;
  birthDate?: string;
  address?: string;
  /** l'email de connexion choisi */
  email: string;
  /** « je suis déjà inscrit au club, je veux seulement mon accès » */
  existingMember: boolean;
  /** parent : « mes fils sont déjà inscrits au club » */
  childrenSubscribed?: boolean;
  /** parent : les fils déclarés, quand ils ne sont pas encore inscrits */
  children?: AccountRequestChild[];
  status: AccountRequestStatus;
  /**
   * LE NUMÉRO DE TÉLÉPHONE A-T-IL RECONNU LES SIENS TOUT SEUL ?
   *
   * `true` = au moment même de la création du compte, le numéro a désigné une
   * fiche du club — et une seule, encore pilotée par personne. Le compte a donc
   * été rattaché et ACTIVÉ sans qu'un humain intervienne : la famille se
   * connecte et voit tout, sans attendre.
   *
   * La demande peut malgré tout rester `pending` : activer un compte n'est pas
   * traiter une demande. Une formation à facturer ou des fils à créer attendent
   * toujours l'intendance — l'écran d'activation le dit alors en toutes lettres,
   * et il ne reste à poser que le geste qui manque.
   */
  autoLinked?: boolean;
  /** la fiche à laquelle le compte a fini par être rattaché */
  linkedEntityId?: string;
  /** les fiches de chevalier créées ou rattachées pour ses fils */
  linkedChildIds?: string[];
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  createdAt: string;
}


// =============================================================================
//  LA VITRINE — LES FORMATIONS ET LES ÉVÈNEMENTS DU SITE PUBLIC
// =============================================================================

/**
 * FORMATION OU ÉVÈNEMENT ?
 *
 * Les deux se créent, se publient et se remplissent EXACTEMENT de la même
 * façon : un titre, une période, des jours, un encadrant, un prix, des images.
 * Seul le mot change sur la carte du site — un stage de trois mois n'est pas
 * un tournoi d'un après-midi, et le visiteur doit le voir sans lire.
 */
export type FormationKind = "formation" | "event";

/**
 * UNE FORMATION OU UN ÉVÈNEMENT PUBLIÉ SUR LE SITE DU CLUB.
 *
 * C'est la seule chose que le site montre en propre — le reste de la vitrine
 * (le fond, la vidéo, les textes, les coordonnées) tient sur la fiche de
 * l'établissement. Une formation est donc lisible SANS COMPTE : c'est ce qui
 * permet à quelqu'un qui passe de la découvrir, d'en lire le détail et de s'y
 * inscrire avant même d'exister au club.
 *
 * LES JOURS SONT DES DATES, PAS DES JOURS DE SEMAINE. Une formation ne « tient
 * pas tous les mardis » : elle tient LES 4, 11 et 18 mars. L'écran de création
 * déplie le calendrier de la période et l'on coche les journées réelles, ce qui
 * permet de sauter une fête, une semaine de vacances ou un week-end sans
 * inventer une règle de récurrence que personne ne saurait relire.
 *
 * L'ENCADRANT EST RECOPIÉ (`trainerName`), et pas seulement désigné. Le site
 * est lu par des visiteurs non connectés, à qui la RLS ne rend PAS la table des
 * entraîneurs : sans cette copie, la carte afficherait un identifiant. Le nom
 * est donc figé au moment où on choisit l'encadrant, exactement comme la
 * signature d'une opération l'est.
 */
export interface Formation extends Authored {
  id: string;
  kind: FormationKind;
  name: string;
  description: string;

  /** le premier jour (YYYY-MM-DD) et l'heure d'ouverture (HH:mm) */
  startDate: string;
  startTime: string;
  /** le dernier jour et l'heure de fermeture */
  endDate: string;
  endTime: string;
  /**
   * LES JOURNÉES RÉELLEMENT TENUES, cochées dans le calendrier de la période.
   * Une liste vide veut dire « toute la période », ce qui est le cas d'un
   * évènement d'un seul tenant.
   */
  days: string[];

  /** l'entraîneur qui encadre — sa fiche, quand il en a une au club */
  trainerId?: string;
  /** son nom, RECOPIÉ : le site est lu sans compte, et sans accès aux fiches */
  trainerName?: string;
  /** ce que le club veut dire de lui en plus : titres, parcours, palmarès */
  trainerNote?: string;

  /** le prix demandé au participant */
  price: number;
  /** combien de séances la formation compte */
  seances: number;

  /** les illustrations, rangées dans le dépôt `logos` comme le reste */
  images: string[];

  /**
   * RETIRÉE DE LA VITRINE, MAIS PAS SUPPRIMÉE.
   *
   * Une formation complète, reportée ou terminée n'a plus à s'afficher — sans
   * pour autant emporter les inscriptions qu'elle a produites. `hidden` la
   * retire du site ; elle reste entière dans la gestion.
   */
  hidden?: boolean;

  createdAt: string;
}

/**
 * UN CHEVALIER INSCRIT SUR UNE FORMATION.
 *
 * L'inscription et L'ARGENT sont deux choses séparées, et c'est tout l'intérêt :
 * quelqu'un qui s'inscrit depuis le site n'a rien payé — il paiera au comptoir.
 * La ligne naît donc TOUJOURS, et le prix est porté au compte du chevalier sous
 * la forme d'un frais ordinaire (`StudentCharge`), qui se règle en une ou
 * plusieurs fois comme n'importe quelle autre dette, et qui s'affiche déjà
 * partout où le chevalier apparaît.
 *
 * `chargeId` est le lien vers ce frais : c'est lui qui dit si l'inscription est
 * payée, et de combien. Une inscription offerte (prix nul) n'en porte aucun.
 */
export interface FormationEnrollment extends Authored {
  id: string;
  formationId: string;
  studentId: string;
  /** le prix au moment de l'inscription — celui de la formation peut changer */
  price: number;
  /** le frais porté au compte du chevalier, quand le prix n'est pas nul */
  chargeId?: string;
  /** le jour de l'inscription (YYYY-MM-DD) */
  date: string;
  /** d'où elle vient : le comptoir, ou le site public */
  source?: AccountRequestSource;
  createdAt: string;
}
