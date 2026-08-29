"use client";

import { useMemo, useState } from "react";
import { useData, uid } from "@/lib/store/data";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/SearchInput";
import { PageHeader } from "@/components/layout/PageHeader";
import { Bus, Calendar as CalendarIcon, CalendarDays, CircleDollarSign, Clock, Edit, Eye, Filter, LayoutGrid, MapPin, Plus, Printer, Search, ShieldCheck, Sparkles, Trash2, User, Users, X } from "lucide-react";
import type {
  DayTime,
  ScheduleSession,
  Day,
  Subscription,
  Teacher,
  TeacherPaymentType,
} from "@/lib/types";
import {
  activeSessions,
  clashingDays,
  formatDays,
  isFreeSub,
  minutesOf,
  monthlyPriceOf,
  schoolMonthShareOf,
  schoolPerSeanceOf,
  groupsOfClass,
  isMultiLevelSession,
  sessionClassIds,
  sessionGroupIds,
  sessionGroupsOfClass,
  sessionSalleIds,
  sessionSalleOn,
  sessionSlotsOn,
  sessionTimeLabel,
  sessionTimesOn,
  slotLabel,
  soldFor,
  unassignedGroups,
  teacherMonthShareOf,
  teacherPerSeanceOf,
  transportMonthShareOf,
  transportPerSeanceOf,
  weeklySeanceCount,
} from "@/lib/helpers";
import { formatDA, money, positiveMoney } from "@/lib/utils";
import { formatDateFr } from "@/lib/helpers";
import { printHtmlDocument } from "@/lib/print";
import {
  bannerHtml,
  letterheadHtml,
  metaFooterHtml,
  printDocument,
  signaturesHtml,
} from "@/lib/printTemplates";
import { useSettings } from "@/lib/store/settings";
import { useT } from "@/lib/i18n/useT";

import { useCan } from "@/lib/usePermissions";
const PRINT_LABELS = {
  fr: {
    docTitle: "Emploi du Temps — Fiche de Séance",
    printedOn: (d: string) => `Imprimé le ${d}`,
    infoTitle: "Informations de la Séance",
    tableTitle: "Horaires Détaillés",
    day: "Jour",
    time: "Horaire (début – fin)",
    module: "Module / Matière",
    group: "Groupe",
    classLevel: "Catégorie / Niveau",
    teacher: "Entraîneur",
    salle: "Arène",
    enrolled: "Chevaliers inscrits",
    signDirection: "La Direction",
    signTeacher: "L'Entraîneur",
    days: {
      saturday: "Samedi", sunday: "Dimanche", monday: "Lundi", tuesday: "Mardi",
      wednesday: "Mercredi", thursday: "Jeudi", friday: "Vendredi",
    } as Record<Day, string>,
  },
  ar: {
    docTitle: "جدول التوقيت — بطاقة الحصة",
    printedOn: (d: string) => `طُبع بتاريخ ${d}`,
    infoTitle: "معلومات الحصة",
    tableTitle: "التوقيت المفصّل",
    day: "اليوم",
    time: "التوقيت (البداية – النهاية)",
    module: "المادة",
    group: "الفوج",
    classLevel: "القسم / المستوى",
    teacher: "الأستاذ",
    salle: "القاعة",
    enrolled: "التلاميذ المسجلون",
    signDirection: "الإدارة",
    signTeacher: "الأستاذ",
    days: {
      saturday: "السبت", sunday: "الأحد", monday: "الإثنين", tuesday: "الثلاثاء",
      wednesday: "الأربعاء", thursday: "الخميس", friday: "الجمعة",
    } as Record<Day, string>,
  },
} as const;

const WEEKDAYS: { key: Day; label: string }[] = [
  { key: "saturday", label: "Samedi" },
  { key: "sunday", label: "Dimanche" },
  { key: "monday", label: "Lundi" },
  { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" },
  { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" },
];

export function PlannerPage() {
  const can = useCan("planner");
  const db = useData();
  const {
    school,
    classes,
    modules,
    groups,
    salles,
    teachers,
    students,
    subscriptions,
    push,
    updateItem,
    setSubscriptionPrice,
    archiveSession,
  } = db;
  /**
   * La grille ne montre QUE les emplois du temps vivants. Un emploi supprimé est
   * archivé, pas effacé : sa ligne reste en base pour que les présences, les
   * soldes, les paiements et les parts d'entraîneur qu'il porte gardent un nom
   * sur les écrans d'historique — mais il n'a plus rien à faire sur un
   * calendrier qui sert à organiser la semaine à venir.
   */
  const sessions = useMemo(() => activeSessions(db), [db.sessions]);
  const { language } = useSettings();
  // Les libellés de cet écran sont écrits en français : ils passent par le
  // dictionnaire, comme partout ailleurs dans l'application.
  const { tr } = useT();

  // View mode toggle
  const [viewMode, setViewMode] = useState<"calendar" | "cards">("calendar");

  // Filters
  const [filterSessionId, setFilterSessionId] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState("");
  const [filterSalleId, setFilterSalleId] = useState("");
  const [filterClassId, setFilterClassId] = useState("");

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ScheduleSession | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [moduleId, setModuleId] = useState("");
  /**
   * LES GROUPES DE L'EMPLOI DU TEMPS — plusieurs, pas un seul.
   *
   * Un même créneau réunit souvent deux demi-groupes : même module, même
   * entraîneur, même arène, même heure. `groupIds` porte la liste complète et
   * `groupId` (la colonne historique) garde le PREMIER, pour que le scan, la
   * feuille de présence et la base continuent de lire un groupe sans rien
   * savoir de la nouveauté.
   */
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  /**
   * UN EMPLOI DU TEMPS SUR PLUSIEURS NIVEAUX.
   *
   * Le même créneau réunit parfois deux catégories qui n'ont rien à voir — la 4e
   * année moyenne et la 3e année secondaire — chacune avec SES groupes. Le
   * formulaire bascule alors : au lieu d'une catégorie et d'une liste de groupes,
   * il demande les catégories, puis les groupes DE CHAQUE catégorie.
   *
   * `classGroupMap` porte cette association, et c'est elle qui est enregistrée.
   * Le reste de l'application n'a rien à savoir de la nouveauté : `classId`
   * garde la première catégorie, `groupIds` l'union de tous les groupes.
   */
  const [multiLevel, setMultiLevel] = useState(false);
  const [classGroupMap, setClassGroupMap] = useState<Record<string, string[]>>({});
  /** Les catégories du créneau, dans l'ordre où elles ont été cochées. */
  const [multiClassIds, setMultiClassIds] = useState<string[]>([]);
  /** Tous les groupes du créneau : ceux des catégories en multi-niveaux, sinon la
   *  liste simple. C'est ce que la base enregistre en `group_ids`. */
  const effectiveGroupIds = multiLevel
    ? [...new Set(multiClassIds.flatMap((cid) => classGroupMap[cid] ?? []))]
    : groupIds;
  const groupId = effectiveGroupIds[0] ?? "";
  /** Les catégories du créneau — une seule hors multi-niveaux. */
  const effectiveClassIds = multiLevel ? multiClassIds : classId ? [classId] : [];
  const [salleId, setSalleId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [selectedDays, setSelectedDays] = useState<Day[]>([]);
  /**
   * LES SÉANCES DE CHAQUE JOUR — une liste, et non un seul horaire.
   *
   * Un emploi peut tourner Samedi 08:00–10:00 et Mardi 14:00–16:00 : la
   * réception pose donc un horaire PAR JOUR dès qu'elle en coche plusieurs.
   * Mais un groupe s'entraîne aussi parfois DEUX FOIS le même jour — le matin
   * et le soir — et ce sont bien deux séances : elles se pointent séparément,
   * se décomptent séparément sur la carte, et se paient séparément à
   * l'entraîneur. Chaque jour porte donc la LISTE de ses séances.
   */
  const [daySeances, setDaySeances] = useState<Partial<Record<Day, DayTime[]>>>({});
  /**
   * The arène of EACH selected day. One day = one room, chosen in the ordinary
   * list. Several days = one room PER day, because a group is rarely given the
   * same room Samedi matin and Mardi après-midi.
   */
  const [daySalles, setDaySalles] = useState<Partial<Record<Day, string>>>({});
  /** Recherche de l'entraîneur par son nom, plutôt qu'une liste déroulante. */
  const [teacherSearch, setTeacherSearch] = useState("");
  /**
   * CRÉER L'ENTRAÎNEUR SANS QUITTER L'EMPLOI DU TEMPS.
   *
   * On ouvrait un emploi du temps, on cherchait l'entraîneur… et il n'existait
   * pas encore : il fallait tout abandonner, aller sur l'écran Entraîneurs, le
   * créer, revenir, et tout ressaisir. Le formulaire le crée donc ICI — nom,
   * téléphone, et la façon dont il est payé — puis le choisit aussitôt.
   *
   * La fiche créée est une fiche d'entraîneur ordinaire : elle apparaît sur
   * l'écran Entraîneurs, sa paie et son historique s'y tiennent comme pour
   * n'importe quel autre. Elle n'ouvre simplement aucun compte de connexion —
   * cela se décide sur sa fiche, le jour où on le veut.
   */
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [newTeacherFirst, setNewTeacherFirst] = useState("");
  const [newTeacherLast, setNewTeacherLast] = useState("");
  const [newTeacherPhone, setNewTeacherPhone] = useState("");
  const [newTeacherPay, setNewTeacherPay] = useState<TeacherPaymentType>("per_group");
  const [newTeacherMonthly, setNewTeacherMonthly] = useState<number>(0);
  const [newTeacherPercent, setNewTeacherPercent] = useState<number>(0);

  // ---- Tarification par carte de l'emploi du temps ------------------------
  // The desk gives TWO figures — the séances a month contains and what that
  // month costs — and everything else falls out of them: the price of one
  // séance, what the school keeps, what is left for the teacher, and what the
  // teacher earns per séance.
  const [monthSeances, setMonthSeances] = useState<number>(0);
  const [monthPrice, setMonthPrice] = useState<number>(0);
  /**
   * LE TRANSPORT — prélevé sur le prix de la carte AVANT tout partage.
   *
   * Le prix d'une carte se coupe désormais en TROIS : le bus d'abord, puis la
   * part du club, et ce qui reste appartient à l'entraîneur. Le transport n'est
   * ni un revenu du club ni une part de l'entraîneur : c'est un coût que la
   * carte porte, suivi à part pour que les rapports puissent dire ce que le
   * ramassage coûte, groupe par groupe.
   *
   * 0 = ce créneau n'a pas de transport, et la carte se coupe en deux comme
   * avant.
   */
  const [transportShare, setTransportShare] = useState<number>(0);
  const [schoolShare, setSchoolShare] = useState<number>(0);

  /**
   * L'ENGAGEMENT — ce qu'on verse pour REJOINDRE ce créneau.
   *
   * Ce n'est ni la cotisation (qui se paie carte après carte) ni les droits
   * d'entrée du club (qui se règlent une fois pour toutes, tous emplois
   * confondus) : c'est le frais propre à CET emploi du temps — la tenue,
   * l'équipement, l'assurance du groupe. Il est porté au compte du chevalier
   * le jour de son inscription, sous la forme d'un frais ordinaire qu'il
   * règle en une ou plusieurs fois.
   *
   * 0 = ce créneau ne demande aucun engagement, et rien n'est écrit.
   */
  const [engagementFee, setEngagementFee] = useState<number>(0);
  const [engagementDescription, setEngagementDescription] = useState<string>("");

  /**
   * LE PRIX D'UNE SÉANCE GARDE SES DÉCIMALES.
   *
   * Une carte à 4 000 DA sur 3 séances vaut 1 333,33 DA la séance — pas 1 333. Et
   * si le club en garde 2 200, il reste 1 800 DA à l'entraîneur, soit 600 DA
   * par séance sur 3, mais 257,14 DA sur 7. Arrondir chaque division à l'entier
   * faisait perdre ou gagner quelques dinars à chaque présence, et l'écart se
   * voyait sur la paie de la carte.
   */
  const pricePerSeance = monthSeances > 0 ? money(monthPrice / monthSeances) : 0;
  /** Le transport, jamais plus que le prix de la carte. */
  const transportPart = positiveMoney(Math.min(transportShare, monthPrice));
  /** Ce qui reste à partager une fois le bus payé. */
  const shareable = positiveMoney(monthPrice - transportPart);
  /** La part du club, jamais plus que ce qui reste après le transport. */
  const schoolPart = positiveMoney(Math.min(schoolShare, shareable));
  const teacherShare = positiveMoney(shareable - schoolPart);
  const teacherPerSeance = monthSeances > 0 ? money(teacherShare / monthSeances) : 0;
  const schoolPerSeance = monthSeances > 0 ? money(schoolPart / monthSeances) : 0;
  const transportPerSeance = monthSeances > 0 ? money(transportPart / monthSeances) : 0;

  const resetPricing = () => {
    setMonthSeances(0);
    setMonthPrice(0);
    setTransportShare(0);
    setSchoolShare(0);
    setEngagementFee(0);
    setEngagementDescription("");
  };

  /** Un montant saisi à la main : les décimales sont acceptées (1 333,33). */
  const readMoney = (value: string) => positiveMoney(Number(value.replace(",", ".")) || 0);

  /** Writes the tariff of the emploi du temps (and of every group of the same
   *  cours) once the créneau itself is saved. */
  const savePricing = (sessionId: string) => {
    /**
     * L'ENGAGEMENT SEUL NE FABRIQUE PAS DE TARIF.
     *
     * Un emploi du temps sans tarif n'entre pas au catalogue d'inscription —
     * c'est ce qui empêche d'y inscrire quelqu'un à un prix que personne n'a
     * fixé. Lui écrire un tarif à 0 DA pour loger l'engagement l'y ferait
     * entrer par la bande, à zéro dinar la séance. On ne modifie donc
     * l'engagement seul que sur un emploi qui a DÉJÀ son tarif.
     */
    if (monthSeances <= 0 || monthPrice <= 0) {
      const existing = subscriptions.find((su) => su.sessionId === sessionId);
      if (existing) {
        void setSubscriptionPrice(sessionId, existing.pricePerSession, {
          monthlySeances: existing.monthlySeances,
          monthlyPrice: existing.monthlyPrice,
          transportMonthShare: existing.transportMonthShare,
          schoolMonthShare: existing.schoolMonthShare,
          teacherPerSeance: existing.teacherPerSeance,
          engagementFee,
          engagementDescription: engagementDescription.trim(),
        });
      }
      return;
    }
    void setSubscriptionPrice(sessionId, pricePerSeance, {
      monthlySeances: monthSeances,
      monthlyPrice: monthPrice,
      transportMonthShare: transportPart,
      schoolMonthShare: schoolPart,
      teacherPerSeance,
      engagementFee,
      engagementDescription: engagementDescription.trim(),
    });
  };

  /**
   * L'ATELIER DES GROUPES — ouvert sans créer le moindre emploi du temps.
   *
   * On y choisit une catégorie, on lit les groupes qu'elle possède déjà, on en
   * ajoute, on en renomme, on en retire. Rien d'autre : ni horaire, ni arène,
   * ni entraîneur. C'est le travail de début de saison, et il n'a aucune raison
   * d'exiger qu'on invente un créneau pour se faire.
   */
  const [isGroupsOpen, setIsGroupsOpen] = useState(false);
  const [manageClassId, setManageClassId] = useState("");
  const [manageGroupName, setManageGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState("");
  const [renameGroupName, setRenameGroupName] = useState("");

  // Inline creations
  const [newModuleName, setNewModuleName] = useState("");
  const [showAddModule, setShowAddModule] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newSalleName, setNewSalleName] = useState("");
  const [showAddSalle, setShowAddSalle] = useState(false);

  // ---- Séance libre (créneau ouvert) --------------------------------------
  const [isOpenSeanceModalOpen, setIsOpenSeanceModalOpen] = useState(false);
  const [editingOpenSession, setEditingOpenSession] = useState<ScheduleSession | null>(null);
  const [openModuleId, setOpenModuleId] = useState("");
  const [openClassIds, setOpenClassIds] = useState<string[]>([]);
  const [openGroupIds, setOpenGroupIds] = useState<string[]>([]);
  const [openSalleIds, setOpenSalleIds] = useState<string[]>([]);
  const [openPeriodStart, setOpenPeriodStart] = useState("");
  const [openPeriodEnd, setOpenPeriodEnd] = useState("");
  const [openDays, setOpenDays] = useState<Day[]>([]);
  const [openStartHour, setOpenStartHour] = useState("08");
  const [openStartMin, setOpenStartMin] = useState("00");
  const [openEndHour, setOpenEndHour] = useState("10");
  const [openEndMin, setOpenEndMin] = useState("00");
  const [openPrice, setOpenPrice] = useState<number>(0);
  // teacher: pick an existing one, or type a "passager" who has no account
  const [openTeacherMode, setOpenTeacherMode] = useState<"existing" | "passager">("existing");
  const [openTeacherSearch, setOpenTeacherSearch] = useState("");
  const [openTeacherId, setOpenTeacherId] = useState("");
  const [openPassagerName, setOpenPassagerName] = useState("");
  const [openPassagerPhone, setOpenPassagerPhone] = useState("");
  const [openTitleOverride, setOpenTitleOverride] = useState("");
  const [savingOpenSeance, setSavingOpenSeance] = useState(false);
  // "Vue" filter: all timings / regular courses only / séances libres only
  const [kindFilter, setKindFilter] = useState<"all" | "cours" | "open">("all");

  /**
   * LA COULEUR D'UN CRÉNEAU.
   *
   * Elle se tirait du MODULE, qui n'est plus demandé : tous les nouveaux
   * emplois se seraient donc peints de la même couleur. Elle se tire désormais
   * de l'identifiant de l'emploi lui-même — stable d'un rendu à l'autre et
   * d'un jour à l'autre, ce qui est tout ce qu'on lui demande.
   */
  const getSessionColor = (modId: string) => {
    let hash = 0;
    for (let i = 0; i < modId.length; i++) {
      hash = modId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      "border-s-4 border-s-blue-500 bg-blue-50/70 text-blue-900 dark:bg-blue-950/20 dark:text-blue-200 border-blue-100",
      "border-s-4 border-s-emerald-500 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200 border-emerald-100",
      "border-s-4 border-s-amber-500 bg-amber-50/70 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200 border-amber-100",
      "border-s-4 border-s-rose-500 bg-rose-50/70 text-rose-900 dark:bg-rose-950/20 dark:text-rose-200 border-rose-100",
      "border-s-4 border-s-purple-500 bg-purple-50/70 text-purple-900 dark:bg-purple-950/20 dark:text-purple-200 border-purple-100",
      "border-s-4 border-s-cyan-500 bg-cyan-50/70 text-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-200 border-cyan-100",
      "border-s-4 border-s-indigo-500 bg-indigo-50/70 text-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200 border-indigo-100",
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  // Helpers
  const getClassName = (cid: string) => {
    const cls = classes.find((c) => c.id === cid);
    if (!cls) return "-";
    const lvl = cls.type === "cours" ? cls.coursLevel : cls.formationLevel;
    return `${cls.name} (${lvl})`;
  };

  const getModuleName = (mid: string) => modules.find((m) => m.id === mid)?.name ?? "-";
  const getGroupName = (gid: string) => groups.find((g) => g.id === gid)?.name ?? "-";
  const getSalleName = (sid: string) => salles.find((s) => s.id === sid)?.name ?? "-";
  const getTeacherName = (tid: string) => {
    const t = teachers.find((te) => te.id === tid);
    return t ? `${t.firstName} ${t.lastName}` : "-";
  };

  /**
   * LE NOM D'UN CRÉNEAU, quand personne ne lui en a donné.
   *
   * Le nom saisi l'emporte toujours. À défaut, le créneau se nomme par ce qui
   * le définit vraiment maintenant que le module a disparu du formulaire : sa
   * ou ses CATÉGORIES, et ses GROUPES. Les emplois d'avant gardent leur module
   * comme repli, pour qu'aucune grille déjà remplie ne se vide de ses noms.
   */
  const autoTitle = (s: ScheduleSession) => {
    const cats = sessionClassIds(s)
      .map((cid) => classes.find((c) => c.id === cid)?.name)
      .filter(Boolean)
      .join(" + ");
    const grps = sessionGroupIds(s).map(getGroupName).filter((n) => n !== "-").join(" · ");
    const legacy = s.moduleId ? getModuleName(s.moduleId) : "";
    return (
      [cats, grps].filter(Boolean).join(" — ") ||
      (legacy !== "-" ? legacy : "") ||
      "Emploi du temps"
    );
  };

  const sessionTitle = (s: ScheduleSession) =>
    s.isOpen ? s.title || `Séance Libre — ${autoTitle(s)}` : s.title || autoTitle(s);


  const DEFAULT_DAY_TIME: DayTime = { startTime: "08:00", endTime: "10:00" };
  /** La deuxième séance d'une journée : l'après-midi, par défaut. */
  const SECOND_DAY_TIME: DayTime = { startTime: "17:00", endTime: "19:00" };

  /** Les séances d'un jour, toujours une liste — jamais `undefined`. */
  const seancesOf = (day: Day): DayTime[] => daySeances[day] ?? [{ ...DEFAULT_DAY_TIME }];

  /**
   * Picking a day opens its own séance; unpicking it takes them away.
   * A new day starts from the hours already set (the previous day's, or the
   * default), so a week of identical créneaux is one click per day — et un jour
   * copié d'un jour à DEUX séances en reçoit deux, lui aussi.
   */
  const toggleDay = (day: Day) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
      setDaySeances((prev) => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
      setDaySalles((prev) => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
      return;
    }
    const template = selectedDays.length
      ? daySeances[selectedDays[selectedDays.length - 1]] ?? [DEFAULT_DAY_TIME]
      : [DEFAULT_DAY_TIME];
    setSelectedDays([...selectedDays, day]);
    setDaySeances((prev) => ({ ...prev, [day]: template.map((t) => ({ ...t })) }));
  };

  /** Sets one end of ONE séance of one day. */
  const setDayTime = (day: Day, index: number, key: keyof DayTime, value: string) =>
    setDaySeances((prev) => {
      const list = (prev[day] ?? [{ ...DEFAULT_DAY_TIME }]).map((t) => ({ ...t }));
      if (!list[index]) list[index] = { ...DEFAULT_DAY_TIME };
      list[index] = { ...list[index], [key]: value };
      return { ...prev, [day]: list };
    });

  /**
   * AJOUTER UNE SECONDE SÉANCE À UNE JOURNÉE.
   *
   * La nouvelle s'ouvre APRÈS la précédente — une séance de deux heures qui
   * commence là où l'autre s'est arrêtée, plus tard dans la journée — pour que
   * la réception n'ait presque jamais à corriger les heures proposées.
   */
  const addSeance = (day: Day) =>
    setDaySeances((prev) => {
      const list = (prev[day] ?? [{ ...DEFAULT_DAY_TIME }]).map((t) => ({ ...t }));
      const last = list[list.length - 1];
      const gap = last ? minutesOf(last.endTime) + 60 : minutesOf(SECOND_DAY_TIME.startTime);
      const span = last ? Math.max(60, minutesOf(last.endTime) - minutesOf(last.startTime)) : 120;
      const fmt = (m: number) =>
        `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const start = gap < 1380 ? gap : minutesOf(SECOND_DAY_TIME.startTime);
      list.push({ startTime: fmt(start), endTime: fmt(Math.min(start + span, 1439)) });
      return { ...prev, [day]: list };
    });

  /** Retire une séance d'une journée — jamais la dernière, un jour coché en a
   *  forcément une. */
  const removeSeance = (day: Day, index: number) =>
    setDaySeances((prev) => {
      const list = (prev[day] ?? [{ ...DEFAULT_DAY_TIME }]).filter((_, i) => i !== index);
      return { ...prev, [day]: list.length > 0 ? list : [{ ...DEFAULT_DAY_TIME }] };
    });

  /** Copies the first day's séances onto every other selected day. */
  const applyFirstDayToAll = () => {
    const first = selectedDays[0];
    if (!first) return;
    const model = seancesOf(first);
    setDaySeances(
      Object.fromEntries(selectedDays.map((d) => [d, model.map((t) => ({ ...t }))])),
    );
  };

  /** The selected days, in the school's week order rather than the click order. */
  const orderedDays = useMemo(
    () => WEEKDAYS.map((w) => w.key).filter((d) => selectedDays.includes(d)),
    [selectedDays],
  );

  /** Une séance est réglée quand ses deux heures existent et que la fin suit le
   *  début. */
  const seanceValid = (t?: DayTime) =>
    !!t?.startTime && !!t?.endTime && minutesOf(t.endTime) > minutesOf(t.startTime);

  /** Deux séances de la MÊME journée ne peuvent pas se chevaucher : on ne peut
   *  pas être au matin et au soir en même temps. */
  const daySeancesOverlap = (day: Day) => {
    const list = seancesOf(day).filter(seanceValid);
    return list.some((a, i) =>
      list.some(
        (b, j) =>
          i !== j &&
          minutesOf(a.startTime) < minutesOf(b.endTime) &&
          minutesOf(b.startTime) < minutesOf(a.endTime),
      ),
    );
  };

  /** A day is settled once every one of its séances holds. */
  const dayTimeValid = (day: Day) =>
    seancesOf(day).every(seanceValid) && !daySeancesOverlap(day);

  /** Every selected day carries a coherent créneau — what unlocks the arène. */
  const timingReady = selectedDays.length > 0 && orderedDays.every(dayTimeValid);

  /** The days whose séances do not hold — flagged inline. */
  const invalidDays = orderedDays.filter((d) => daySeances[d] && !dayTimeValid(d));

  /** Combien de séances la semaine du formulaire contient en tout. */
  const draftSeanceCount = orderedDays.reduce((n, d) => n + seancesOf(d).length, 0);

  /** What the form currently describes, in the shape the clash check expects. */
  const draftTiming = useMemo(() => {
    const first = orderedDays[0];
    const base = (first && seancesOf(first)[0]) || DEFAULT_DAY_TIME;
    return {
      days: orderedDays,
      startTime: base.startTime,
      endTime: base.endTime,
      dayTimes: Object.fromEntries(
        orderedDays.map((d) => [d, seancesOf(d)[0]]),
      ) as Partial<Record<Day, DayTime>>,
      daySlots: Object.fromEntries(orderedDays.map((d) => [d, seancesOf(d)])) as Partial<
        Record<Day, DayTime[]>
      >,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedDays, daySeances]);

  /**
   * Arène availability for the créneaux currently on screen.
   *
   * A arène is taken when another emploi du temps already occupies it on one of
   * the selected days at an overlapping hour. Ends that merely touch (10:00 /
   * 10:00) do not clash — the room frees exactly as the next cours starts.
   */
  interface SalleAvailability {
    id: string;
    name: string;
    free: boolean;
    /** the emplois already in that arène on those créneaux */
    clashes: { sessionId: string; label: string; days: Day[]; timeLabel: string }[];
  }

  /**
   * Availability of every arène, for ONE day or for the whole draft.
   *
   * Passing a day narrows the check twice over: only that day's créneau is
   * compared, and only against the emplois that hold that arène THAT day — an
   * emploi in Arène A on Samedi leaves Arène A free on Mardi.
   */
  const availabilityFor = (day?: Day): SalleAvailability[] => {
    const editingId = selectedSession?.id;
    const draft = day
      ? { ...draftTiming, days: draftTiming.days.filter((d) => d === day) }
      : draftTiming;
    return salles.map((salle) => {
      const clashes = sessions
        .filter((other) => other.id !== editingId)
        .filter((other) => sessionSalleIds(other).includes(salle.id))
        .map((other) => ({ other, days: clashingDays(draft, other, salle.id) }))
        .filter(({ days }) => days.length > 0)
        .map(({ other, days }) => ({
          sessionId: other.id,
          label: sessionTitle(other),
          days,
          timeLabel: days
            .map((d) => {
              const { startTime, endTime } = sessionTimesOn(other, d);
              return `${startTime}–${endTime}`;
            })
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(" · "),
        }));
      return { id: salle.id, name: salle.name, free: clashes.length === 0, clashes };
    });
  };

  const salleAvailability = useMemo<SalleAvailability[]>(
    () => availabilityFor(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salles, sessions, draftTiming, selectedSession],
  );

  const freeSalleCount = salleAvailability.filter((s) => s.free).length;

  /** Sets the room of ONE day; a single-day emploi keeps `salleId` in step. */
  const setDaySalle = (day: Day, id: string) =>
    setDaySalles((prev) => ({ ...prev, [day]: id }));

  /** Copies the first day's room onto every other selected day. */
  const applyFirstSalleToAll = () => {
    const first = orderedDays[0];
    if (!first) return;
    const model = daySalles[first] ?? salleId;
    if (!model) return;
    setDaySalles(Object.fromEntries(orderedDays.map((d) => [d, model])));
  };

  /** The days still waiting for a room — what the save button warns about. */
  const daysWithoutSalle = orderedDays.filter((d) => !(daySalles[d] || salleId));

  /**
   * LE CHOIX DES GROUPES — CEUX DE LA CATÉGORIE, et d'elle seule.
   *
   * Un groupe appartient désormais à une catégorie : « Groupe A » des 8-10 ans
   * n'est pas « Groupe A » des 15-18 ans. Le champ ne propose donc plus la
   * liste entière du club — qui mélangeait des groupes n'ayant rien à faire
   * ensemble — mais uniquement ceux de la catégorie choisie, et il en crée de
   * nouveaux DANS cette catégorie.
   *
   * Tant qu'aucune catégorie n'est choisie, il n'y a rien à proposer : le champ
   * le dit, au lieu d'afficher une liste vide qu'on croirait cassée.
   */
  const renderGroupField = () => {
    const q = groupSearch.trim().toLowerCase();
    const available = classId ? groupsOfClass(db, classId) : [];
    const shown = q ? available.filter((g) => g.name.toLowerCase().includes(q)) : available;
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-semibold text-muted font-sans">
            Groupe(s){" "}
            <span className="text-[10px] font-normal text-muted">
              — ceux de la catégorie choisie
            </span>
          </label>
          <button
            onClick={() => setShowAddGroup(!showAddGroup)}
            disabled={!classId}
            className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
          >
            + Nouveau groupe
          </button>
        </div>

        {!classId ? (
          <p className="rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[10px] leading-relaxed text-warning">
            Choisissez d&apos;abord une catégorie : les groupes lui appartiennent, et c&apos;est
            elle qui décide lesquels sont proposés ici.
          </p>
        ) : (
          <>
            {showAddGroup && (
              <div className="mb-2 flex gap-2">
                <Input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Nom du groupe (ex: Groupe C)"
                  className="flex-1"
                />
                <Button size="sm" onClick={handleCreateGroup}>
                  Créer
                </Button>
              </div>
            )}

            {available.length > 6 && (
              <div className="relative mb-2">
                <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <Input
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="Rechercher un groupe…"
                  className="ps-9"
                />
              </div>
            )}

            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-line bg-canvas/30 p-2">
              {shown.length === 0 ? (
                <p className="p-1.5 text-[11px] italic text-muted">
                  Aucun groupe dans cette catégorie — créez-en un avec « + Nouveau groupe ».
                </p>
              ) : (
                shown.map((g) => {
                  const picked = groupIds.includes(g.id);
                  const first = groupIds[0] === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                        picked
                          ? "border-primary bg-primary text-white"
                          : "border-line bg-surface text-ink hover:bg-primary-50"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> {g.name}
                        {first && groupIds.length > 1 && (
                          <span className="rounded bg-white/25 px-1 py-0.5 text-[8px] font-bold">
                            principal
                          </span>
                        )}
                      </span>
                      <input type="checkbox" checked={picked} readOnly className="h-3.5 w-3.5" />
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}

        <p className="mt-1 text-[10px] text-muted">
          {groupIds.length === 0
            ? "Aucun groupe coché — l'emploi du temps peut être créé et complété plus tard."
            : `${groupIds.length} groupe(s) : ${groupIds.map(getGroupName).join(" · ")}.`}
        </p>
      </div>
    );
  };

  /**
   * LE CHOIX DES NIVEAUX ET DE LEURS GROUPES.
   *
   * Un emploi du temps ordinaire porte une catégorie et ses groupes. Celui-ci peut
   * en porter plusieurs : on coche « 4e année moyenne » et « 3e année
   * secondaire », et chaque niveau ouvre SA propre liste de groupes. Les deux
   * niveaux partagent l'heure, l'arène et l'entraîneur — c'est bien un seul
   * créneau — mais chacun amène les siens.
   */
  const toggleMultiClass = (id: string) =>
    setMultiClassIds((prev) => {
      if (prev.includes(id)) {
        setClassGroupMap((map) => {
          const next = { ...map };
          delete next[id];
          return next;
        });
        return prev.filter((c) => c !== id);
      }
      return [...prev, id];
    });

  /** Coche / décoche un groupe SUR UNE CATÉGORIE précise. */
  const toggleClassGroup = (cid: string, gid: string) =>
    setClassGroupMap((prev) => {
      const current = prev[cid] ?? [];
      return {
        ...prev,
        [cid]: current.includes(gid)
          ? current.filter((g) => g !== gid)
          : [...current, gid],
      };
    });

  /** Crée un groupe DANS une catégorie précise, et l'y coche aussitôt. */
  const handleCreateGroupForClass = (cid: string) => {
    if (!newGroupName.trim() || !cid) return;
    const newId = uid("grp");
    push("groups", {
      id: newId,
      name: newGroupName.trim(),
      classId: cid,
      createdAt: new Date().toISOString(),
    });
    toggleClassGroup(cid, newId);
    setNewGroupName("");
    setShowAddGroup(false);
  };

  const renderLevelsField = () => {
    const q = groupSearch.trim().toLowerCase();
    /** Les groupes d'UNE catégorie, filtrés par la recherche en cours. */
    const groupsFor = (cid: string) => {
      const own = groupsOfClass(db, cid);
      return q ? own.filter((g) => g.name.toLowerCase().includes(q)) : own;
    };
    return (
      <div className="space-y-3 rounded-xl border border-primary/25 bg-primary-50/25 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            🎓 Niveaux &amp; groupes du créneau
          </span>
          <button
            type="button"
            onClick={() => setShowAddGroup(!showAddGroup)}
            className="text-xs text-primary hover:underline"
          >
            + Nouveau groupe
          </button>
        </div>

        <p className="text-[10px] leading-relaxed text-muted">
          Cochez chaque niveau réuni sur ce créneau, puis les groupes que ce niveau amène. Ils
          partagent l&apos;heure, la salle et l&apos;entraîneur — c&apos;est un seul emploi du
          temps — mais chacun garde ses propres groupes.
        </p>

        {classes.length === 0 ? (
          <p className="text-[11px] italic text-muted">
            Aucune classe — créez-en depuis l&apos;écran Classes.
          </p>
        ) : (
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface p-2">
            {classes.map((c) => {
              const picked = multiClassIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleMultiClass(c.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    picked
                      ? "border-primary bg-primary text-white"
                      : "border-line bg-surface text-ink hover:bg-primary-50"
                  }`}
                >
                  <span>
                    {c.name}{" "}
                    <span className="opacity-70">
                      ({c.type === "cours" ? c.coursLevel : c.formationLevel})
                    </span>
                  </span>
                  <input type="checkbox" checked={picked} readOnly className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        )}

        {showAddGroup && multiClassIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nom du groupe (ex: Groupe C)"
              className="min-w-[160px] flex-1"
            />
            <Select
              value=""
              onChange={(e) => e.target.value && handleCreateGroupForClass(e.target.value)}
              className="w-44"
            >
              <option value="">Créer pour le niveau…</option>
              {multiClassIds.map((cid) => (
                <option key={cid} value={cid}>
                  {getClassName(cid)}
                </option>
              ))}
            </Select>
          </div>
        )}

        {multiClassIds.length > 0 && (
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Rechercher un groupe…"
              className="ps-9"
            />
          </div>
        )}

        {multiClassIds.length === 0 ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-[10px] text-warning">
            Aucun niveau coché — cochez-en au moins un, sinon le créneau ne concerne personne.
          </p>
        ) : (
          <div className="space-y-2">
            {multiClassIds.map((cid) => {
              const picked = classGroupMap[cid] ?? [];
              return (
                <div key={cid} className="rounded-xl border border-line bg-surface p-2.5">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
                    <strong className="text-[11px] text-ink">{getClassName(cid)}</strong>
                    <Badge tone={picked.length > 0 ? "primary" : "warning"} className="text-[9px]">
                      {picked.length} groupe(s)
                    </Badge>
                  </div>
                  {groupsFor(cid).length === 0 ? (
                    <p className="text-[10px] italic text-muted">
                      Aucun groupe dans cette catégorie — créez-en un avec « + Nouveau groupe ».
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {groupsFor(cid).map((g) => {
                        const on = picked.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => toggleClassGroup(cid, g.id)}
                            className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${
                              on
                                ? "border-primary bg-primary text-white"
                                : "border-line bg-canvas text-ink hover:bg-primary-50"
                            }`}
                          >
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-muted">
          {effectiveGroupIds.length === 0
            ? "Aucun groupe coché — l'emploi du temps peut être créé et complété plus tard."
            : `${multiClassIds.length} niveau(x) · ${effectiveGroupIds.length} groupe(s) : ${effectiveGroupIds
                .map(getGroupName)
                .join(" · ")}.`}
        </p>
      </div>
    );
  };

  /** Le bandeau qui bascule entre « un seul niveau » et « plusieurs niveaux ». */
  const renderLevelModeSwitch = () => (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-canvas/40 p-1.5">
      <button
        type="button"
        onClick={() => setMultiLevel(false)}
        className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
          !multiLevel ? "bg-primary text-white" : "text-muted hover:bg-primary-50"
        }`}
      >
        Un seul niveau
      </button>
      <button
        type="button"
        onClick={() => {
          setMultiLevel(true);
          // On repart de ce qui est déjà saisi : la catégorie choisie devient le
          // premier niveau, avec ses groupes.
          setMultiClassIds((prev) => (prev.length > 0 ? prev : classId ? [classId] : []));
          setClassGroupMap((prev) =>
            Object.keys(prev).length > 0 || !classId ? prev : { [classId]: groupIds },
          );
        }}
        className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
          multiLevel ? "bg-primary text-white" : "text-muted hover:bg-primary-50"
        }`}
      >
        Plusieurs niveaux
      </button>
    </div>
  );

  /** Crée un groupe DANS la catégorie choisie, et le coche aussitôt. */
  const handleCreateGroup = () => {
    if (!newGroupName.trim() || !classId) return;
    const newId = uid("grp");
    push("groups", {
      id: newId,
      name: newGroupName.trim(),
      classId,
      createdAt: new Date().toISOString(),
    });
    setGroupIds((prev) => [...prev, newId]);
    setNewGroupName("");
    setShowAddGroup(false);
  };

  // ---- L'atelier des groupes ----------------------------------------------

  /** Crée un groupe dans la catégorie ouverte dans l'atelier. */
  const handleManageCreateGroup = () => {
    const name = manageGroupName.trim();
    if (!name || !manageClassId) return;
    if (groupsOfClass(db, manageClassId).some((g) => g.name.trim().toLowerCase() === name.toLowerCase())) {
      alert(`Le groupe « ${name} » existe déjà dans cette catégorie.`);
      return;
    }
    push("groups", {
      id: uid("grp"),
      name,
      classId: manageClassId,
      createdAt: new Date().toISOString(),
    });
    setManageGroupName("");
  };

  /**
   * SUPPRIMER UN GROUPE, mais jamais sous les pieds d'un emploi du temps.
   *
   * Un groupe qu'un créneau amène porte des présences, des inscriptions et des
   * soldes : l'effacer laisserait tout cela sans nom. On refuse donc, et on dit
   * lesquels le retiennent — c'est là qu'il faut agir d'abord.
   */
  const handleDeleteGroup = (groupId: string) => {
    const holders = sessions.filter((se) => sessionGroupIds(se).includes(groupId));
    if (holders.length > 0) {
      alert(
        `Ce groupe est utilisé par ${holders.length} emploi(s) du temps :\n` +
          holders.map((se) => `• ${sessionTitle(se)}`).join("\n") +
          "\n\nRetirez-le d'abord de ces créneaux.",
      );
      return;
    }
    if (!confirm("Supprimer ce groupe ?")) return;
    db.deleteFrom("groups", groupId);
  };

  /** Renomme un groupe — son nom seul change, tout ce qui s'y accroche reste. */
  const handleRenameGroup = () => {
    const name = renameGroupName.trim();
    if (!renamingGroupId || !name) return;
    updateItem("groups", renamingGroupId, { name });
    setRenamingGroupId("");
    setRenameGroupName("");
  };

  /** Range un groupe orphelin dans une catégorie. */
  const handleAssignGroup = (groupId: string, cid: string) => {
    if (!cid) return;
    updateItem("groups", groupId, { classId: cid });
  };

  /**
   * CRÉE L'ENTRAÎNEUR ET LE CHOISIT AUSSITÔT.
   *
   * Seul le prénom est exigé : au comptoir on connaît souvent « Karim » avant
   * de connaître son nom de famille, et refuser la fiche pour cela obligerait
   * à ressortir de l'emploi du temps — précisément ce que ce bouton évite.
   * Un homonyme exact est réutilisé plutôt que dupliqué.
   */
  const handleCreateTeacher = () => {
    const first = newTeacherFirst.trim();
    const last = newTeacherLast.trim();
    if (!first) {
      alert("Le prénom de l'entraîneur est obligatoire.");
      return;
    }
    const full = `${first} ${last}`.trim().toLowerCase();
    const twin = teachers.find(
      (t) => `${t.firstName} ${t.lastName}`.trim().toLowerCase() === full,
    );
    if (twin) {
      if (
        !confirm(
          `« ${first} ${last} » existe déjà dans les entraîneurs.\n\nVoulez-vous le choisir plutôt que d'en créer un second du même nom ?`,
        )
      ) {
        return;
      }
      setTeacherId(twin.id);
      setShowAddTeacher(false);
      return;
    }
    const newTeacher: Teacher = {
      id: uid("tch"),
      firstName: first,
      lastName: last,
      phone: newTeacherPhone.trim(),
      email: "",
      paymentType: newTeacherPay,
      monthlyAmount: newTeacherPay === "monthly" ? newTeacherMonthly : undefined,
      percentage: newTeacherPay === "percentage" ? newTeacherPercent : undefined,
      createdAt: new Date().toISOString(),
    };
    push("teachers", newTeacher);
    setTeacherId(newTeacher.id);
    setNewTeacherFirst("");
    setNewTeacherLast("");
    setNewTeacherPhone("");
    setNewTeacherMonthly(0);
    setNewTeacherPercent(0);
    setShowAddTeacher(false);
  };

  /** Cocher / décocher un groupe de l'emploi du temps. */
  const toggleGroup = (id: string) =>
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

  /**
   * Deux arènes ne peuvent pas porter le même nom : l'écran choisit une arène
   * PAR SON NOM, et deux « Arène 3 » rendraient ce choix indécidable — la
   * disponibilité afficherait deux lignes identiques dont une seule est libre.
   * La comparaison ignore la casse et les espaces de bord.
   */
  const salleNameTaken = (name: string, exceptId?: string) => {
    const key = name.trim().toLowerCase();
    return salles.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === key);
  };

  const handleCreateSalle = (day?: Day) => {
    const name = newSalleName.trim();
    if (!name) return;
    if (salleNameTaken(name)) {
      alert(`L'arène « ${name} » existe déjà — choisissez-la dans la liste ou donnez un autre nom.`);
      return;
    }
    const newId = uid("salle");
    push("salles", { id: newId, name });
    if (day) setDaySalle(day, newId);
    else {
      setSalleId(newId);
      if (orderedDays.length === 1) setDaySalle(orderedDays[0], newId);
    }
    setNewSalleName("");
    setShowAddSalle(false);
  };

  // ---- Séance libre helpers ------------------------------------------------

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const DOW_KEYS: Day[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  /** Weekdays that actually occur at least once inside the selected period —
   *  the user can only pick study days that exist in that range. */
  const daysAvailableInPeriod = useMemo<Day[]>(() => {
    if (!openPeriodStart || !openPeriodEnd || openPeriodStart > openPeriodEnd) return [];
    const start = new Date(`${openPeriodStart}T12:00:00`);
    const end = new Date(`${openPeriodEnd}T12:00:00`);
    const found = new Set<Day>();
    const cursor = new Date(start);
    // A full week covers every weekday; stop early instead of walking months.
    while (cursor <= end && found.size < 7) {
      found.add(DOW_KEYS[cursor.getDay()]);
      cursor.setDate(cursor.getDate() + 1);
    }
    return WEEKDAYS.filter((w) => found.has(w.key)).map((w) => w.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPeriodStart, openPeriodEnd]);

  /** How many actual séances the period will contain (period × selected days). */
  const openSeanceCount = useMemo(() => {
    if (!openPeriodStart || !openPeriodEnd || openDays.length === 0) return 0;
    const start = new Date(`${openPeriodStart}T12:00:00`);
    const end = new Date(`${openPeriodEnd}T12:00:00`);
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (openDays.includes(DOW_KEYS[cursor.getDay()])) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPeriodStart, openPeriodEnd, openDays]);

  /** Readable, self-describing name for a séance libre timing — the format the
   *  Abonnements / Séances Libres screens display. */
  const buildOpenTitle = () => {
    const mod = openModuleId ? getModuleName(openModuleId) : "Module";
    const salleLabel = openSalleIds.length
      ? openSalleIds.map(getSalleName).join(" + ")
      : "Arène ?";
    const time = `${openStartHour}:${openStartMin}-${openEndHour}:${openEndMin}`;
    const period =
      openPeriodStart && openPeriodEnd
        ? ` · du ${formatDateFr(openPeriodStart)} au ${formatDateFr(openPeriodEnd)}`
        : "";
    return `Séance Libre — ${mod} · ${salleLabel} · ${time}${period}`;
  };

  const resetOpenForm = () => {
    setEditingOpenSession(null);
    setOpenModuleId("");
    setOpenClassIds([]);
    setOpenGroupIds([]);
    setOpenSalleIds([]);
    setOpenPeriodStart("");
    setOpenPeriodEnd("");
    setOpenDays([]);
    setOpenStartHour("08");
    setOpenStartMin("00");
    setOpenEndHour("10");
    setOpenEndMin("00");
    setOpenPrice(0);
    setOpenTeacherMode("existing");
    setOpenTeacherSearch("");
    setOpenTeacherId("");
    setOpenPassagerName("");
    setOpenPassagerPhone("");
    setOpenTitleOverride("");
  };

  const openEditOpenSeance = (s: ScheduleSession) => {
    setEditingOpenSession(s);
    setOpenModuleId(s.moduleId);
    setOpenClassIds(s.classIds?.length ? s.classIds : [s.classId]);
    setOpenGroupIds(s.groupIds?.length ? s.groupIds : [s.groupId]);
    setOpenSalleIds(s.salleIds?.length ? s.salleIds : [s.salleId]);
    setOpenPeriodStart(s.periodStart ?? "");
    setOpenPeriodEnd(s.periodEnd ?? "");
    setOpenDays(s.days);
    const [sh, sm] = s.startTime.split(":");
    const [eh, em] = s.endTime.split(":");
    setOpenStartHour(sh);
    setOpenStartMin(sm);
    setOpenEndHour(eh);
    setOpenEndMin(em);
    setOpenPrice(subscriptions.find((su) => su.sessionId === s.id)?.pricePerSession ?? s.openPrice ?? 0);
    const t = teachers.find((te) => te.id === s.teacherId);
    setOpenTeacherMode(t?.isPassager ? "passager" : "existing");
    setOpenTeacherId(s.teacherId ?? "");
    setOpenTeacherSearch(t ? `${t.firstName} ${t.lastName}` : "");
    setOpenPassagerName(t?.isPassager ? `${t.firstName} ${t.lastName}`.trim() : "");
    setOpenPassagerPhone(t?.isPassager ? t.phone : "");
    setOpenTitleOverride(s.title ?? "");
    setIsOpenSeanceModalOpen(true);
    setIsDetailsOpen(false);
  };

  /**
   * Creates (or updates) a séance libre timing.
   *
   * A timing is stored as a normal `sessions` row flagged `isOpen`, so the scan,
   * the présences and the teacher payout keep working unchanged. The single
   * class/group/arène columns hold the FIRST selection (the one the scanner
   * matches on) while the `*_ids` arrays hold the complete multi-selection.
   * A matching `subscriptions` row is created at the same time, which is what
   * makes the timing show up on the Abonnements screen exactly like a
   * hand-made subscription.
   */
  const handleSaveOpenSeance = async () => {
    // A séance libre only needs the period it runs over and the days inside it —
    // that is what makes it exist in the calendar. Module, catégories, groupes,
    // arènes, entraîneur and prix can all be completed afterwards.
    if (!openPeriodStart || !openPeriodEnd) {
      return alert("Indiquez la période : une séance libre existe entre deux dates.");
    }
    if (openPeriodStart > openPeriodEnd) return alert("La date de début doit précéder la date de fin.");
    if (openDays.length === 0) {
      return alert("Sélectionnez au moins un jour d'étude dans cette période.");
    }

    setSavingOpenSeance(true);
    try {
      let teacherId = openTeacherId;

      // Teacher passager: no login, saved straight into the teachers table so
      // the Entraîneurs screen can pay him and show his history.
      if (openTeacherMode === "passager") {
        const existingPassager = teachers.find(
          (t) => t.isPassager && `${t.firstName} ${t.lastName}`.trim().toLowerCase() === openPassagerName.trim().toLowerCase(),
        );
        if (existingPassager) {
          teacherId = existingPassager.id;
          if (openPassagerPhone && openPassagerPhone !== existingPassager.phone) {
            updateItem("teachers", existingPassager.id, { phone: openPassagerPhone });
          }
        } else {
          const parts = openPassagerName.trim().split(/\s+/);
          const newTeacher: Teacher = {
            id: uid("tch"),
            firstName: parts[0] ?? openPassagerName.trim(),
            lastName: parts.slice(1).join(" "),
            phone: openPassagerPhone,
            email: "",
            paymentType: "percentage",
            isPassager: true,
            createdAt: new Date().toISOString(),
          };
          // A passager has no login: the row is simply added to the store.
          push("teachers", newTeacher);
          teacherId = newTeacher.id;
        }
      }

      const title = openTitleOverride.trim() || buildOpenTitle();
      const payload = {
        // The single-value columns mirror the first of each list. Those lists
        // may now be empty — the séance libre only needs its période and its
        // jours — so they fall back on "" rather than undefined, which the
        // database would refuse on these not-null columns.
        classId: openClassIds[0] ?? "",
        moduleId: openModuleId,
        groupId: openGroupIds[0] ?? "",
        salleId: openSalleIds[0] ?? "",
        teacherId: teacherId || "",
        days: openDays,
        startTime: `${openStartHour}:${openStartMin}`,
        endTime: `${openEndHour}:${openEndMin}`,
        isOpen: true,
        title,
        periodStart: openPeriodStart,
        periodEnd: openPeriodEnd,
        classIds: openClassIds,
        groupIds: openGroupIds,
        salleIds: openSalleIds,
        openPrice,
      };

      if (editingOpenSession) {
        updateItem("sessions", editingOpenSession.id, payload);
        const sub = subscriptions.find((su) => su.sessionId === editingOpenSession.id);
        if (sub) updateItem("subscriptions", sub.id, { pricePerSession: openPrice });
        else push("subscriptions", { id: uid("sub"), sessionId: editingOpenSession.id, pricePerSession: openPrice });
      } else {
        const sessionId = uid("ses");
        push("sessions", { id: sessionId, ...payload });
        // Auto-created subscription: this is what makes the timing appear on
        // the Abonnements page as if it had been created there by hand.
        push("subscriptions", { id: uid("sub"), sessionId, pricePerSession: openPrice } as Subscription);
      }

      setIsOpenSeanceModalOpen(false);
      resetOpenForm();
    } finally {
      setSavingOpenSeance(false);
    }
  };

  /**
   * What the form writes on the emploi du temps. `startTime`/`endTime` keep the
   * first day's hours as the default — everything that only needs "roughly
   * when" reads them — and `dayTimes` carries the per-day créneaux. A timing
   * that runs identical hours all week stores no override at all.
   */
  const timingPayload = () => {
    const first = orderedDays[0];
    /** Les séances de chaque jour, telles que le formulaire les tient. */
    const perDaySlots = Object.fromEntries(
      orderedDays.map((d) => [d, seancesOf(d).map((t) => ({ ...t }))]),
    ) as Partial<Record<Day, DayTime[]>>;
    const base = (first && perDaySlots[first]?.[0]) || DEFAULT_DAY_TIME;
    // `dayTimes` garde la PREMIÈRE séance de chaque jour : tout ce qui ne lit
    // qu'un horaire — la grille, l'impression, le scan — continue de la lire.
    const perDay = Object.fromEntries(
      orderedDays.map((d) => [d, perDaySlots[d]?.[0] ?? base]),
    ) as Partial<Record<Day, DayTime>>;
    /**
     * LES DEUX CARTES SONT TOUJOURS ÉCRITES, MÊME QUAND ELLES NE DISENT RIEN DE
     * NEUF.
     *
     * Les envoyer « seulement si elles diffèrent » laissait l'ANCIENNE valeur en
     * base le jour où on repassait de deux séances à une : un champ absent ne
     * remplace rien. Elles partent donc telles quelles à chaque enregistrement,
     * et ce qui est affiché est exactement ce qui est stocké.
     */
    return {
      days: orderedDays,
      startTime: base.startTime,
      endTime: base.endTime,
      dayTimes: perDay,
      daySlots: perDaySlots,
    };
  };

  /**
   * CE QUE LE FORMULAIRE ÉCRIT SUR LES NIVEAUX ET LES GROUPES.
   *
   * Un emploi du temps à un seul niveau écrit ce qu'il a toujours écrit :
   * `classId`, `groupId` et `groupIds`. Un emploi MULTI-NIVEAUX écrit en plus
   * `classIds` (tous ses niveaux) et `classGroups` (les groupes de chacun) — et
   * garde `classId`/`groupId` sur le premier de chaque liste, pour que le scan,
   * la feuille de présence et la base continuent de lire un emploi du temps
   * sans rien savoir de la nouveauté.
   */
  const levelPayload = () => {
    if (!multiLevel) {
      return {
        classId,
        classIds: undefined,
        classGroups: undefined,
        groupId: groupIds[0] ?? "",
        groupIds,
      };
    }
    // Un niveau coché sans aucun groupe est conservé tel quel : la réception
    // complètera plus tard, exactement comme un emploi sans groupe.
    const map = Object.fromEntries(
      multiClassIds.map((cid) => [cid, classGroupMap[cid] ?? []]),
    );
    return {
      classId: multiClassIds[0] ?? "",
      classIds: multiClassIds,
      classGroups: map,
      groupId: effectiveGroupIds[0] ?? "",
      groupIds: effectiveGroupIds,
    };
  };

  /**
   * What the form writes about the ROOMS. `salleId` keeps the first day's room —
   * everything that only needs "roughly where" reads it — and `daySalles`
   * carries the per-day override. An emploi that keeps the same room all week
   * stores no override at all.
   */
  const sallePayload = () => {
    const first = orderedDays[0];
    const base = (first && daySalles[first]) || salleId || "";
    const perDay = Object.fromEntries(
      orderedDays.map((d) => [d, daySalles[d] || base]),
    ) as Partial<Record<Day, string>>;
    const uniform = orderedDays.every((d) => perDay[d] === base);
    return { salleId: base, daySalles: uniform ? undefined : perDay };
  };

  /**
   * Only the days are required — an emploi du temps that runs on no day never
   * occurs, and the arène availability has nothing to check against. Catégorie,
   * module, groupe, arène and entraîneur can all be filled in later.
   */
  const handleCreateSession = () => {
    if (selectedDays.length === 0) {
      alert("Sélectionnez au moins un jour : c'est ce qui fait exister l'emploi du temps.");
      return;
    }
    if (invalidDays.length > 0) {
      alert(`L'heure de fin doit suivre l'heure de début : ${formatDays(invalidDays)}.`);
      return;
    }
    const newSession: ScheduleSession = {
      id: uid("ses"),
      moduleId,
      teacherId,
      ...levelPayload(),
      ...sallePayload(),
      ...timingPayload(),
      title: title.trim() || undefined,
    };
    push("sessions", newSession);
    savePricing(newSession.id);
    setIsCreateOpen(false);
    resetForm();
  };

  const handleEditSession = () => {
    if (!selectedSession) return;
    if (selectedDays.length === 0) {
      alert("Sélectionnez au moins un jour : c'est ce qui fait exister l'emploi du temps.");
      return;
    }
    if (invalidDays.length > 0) {
      alert(`L'heure de fin doit suivre l'heure de début : ${formatDays(invalidDays)}.`);
      return;
    }
    const updated: Partial<ScheduleSession> = {
      moduleId,
      teacherId,
      ...levelPayload(),
      ...sallePayload(),
      ...timingPayload(),
      title: title.trim() || undefined,
    };
    updateItem("sessions", selectedSession.id, updated);
    savePricing(selectedSession.id);
    setIsEditOpen(false);
    resetForm();
  };

  /**
   * SUPPRIMER UN EMPLOI DU TEMPS SANS PERDRE SON HISTOIRE.
   *
   * Effacer la ligne effacerait aussi son tarif, et avec lui les inscriptions
   * qui s'y accrochent : les présences pointées, les soldes et les paiements des
   * chevaliers, les parts déjà dues à l'entraîneur deviendraient orphelins et
   * s'afficheraient en tirets partout où on les relit. On l'ARCHIVE donc : il
   * sort de la grille, de la feuille de présence et du catalogue d'inscription,
   * ses chevaliers en sont désinscrits à la date du jour — et tout le reste demeure,
   * lisible et nommé, dans les historiques.
   */
  const handleDelete = async (id: string) => {
    const enrolled = subscriptions
      .filter((su) => su.sessionId === id)
      .reduce(
        (n, su) => n + students.filter((st) => st.subscriptionIds.includes(su.id)).length,
        0,
      );
    const warning =
      `Supprimer cet emploi du temps ?

${enrolled > 0 ? `${enrolled} chevalier(s) en seront désinscrits à la date du jour.
` : ""}Rien n'est perdu : les présences déjà pointées, les paiements et les soldes des chevaliers, ainsi que les parts dues à l'entraîneur, restent visibles dans les historiques avec le nom de cet emploi du temps.`;
    if (!confirm(warning)) {
      return;
    }
    await archiveSession(id);
    setIsDetailsOpen(false);
  };

  const resetForm = () => {
    setTitle("");
    setClassId("");
    setModuleId("");
    setGroupIds([]);
    setGroupSearch("");
    setMultiLevel(false);
    setMultiClassIds([]);
    setClassGroupMap({});
    setSalleId("");
    setTeacherId("");
    setTeacherSearch("");
    setShowAddTeacher(false);
    setNewTeacherFirst("");
    setNewTeacherLast("");
    setNewTeacherPhone("");
    setNewTeacherPay("per_group");
    setNewTeacherMonthly(0);
    setNewTeacherPercent(0);
    setSelectedDays([]);
    setDaySeances({});
    setDaySalles({});
    setShowAddSalle(false);
    setNewSalleName("");
    setSelectedSession(null);
    resetPricing();
  };

  const openEdit = (s: ScheduleSession) => {
    setSelectedSession(s);
    setTitle(s.title || "");
    setClassId(s.classId);
    setModuleId(s.moduleId);
    setGroupIds(sessionGroupIds(s));
    setGroupSearch("");
    // Un emploi multi-niveaux rouvre en multi-niveaux, avec les groupes de
    // chaque catégorie là où la réception les avait mis.
    const levels = sessionClassIds(s);
    const multi = levels.length > 1 || !!s.classGroups;
    setMultiLevel(multi);
    setMultiClassIds(multi ? levels : []);
    setClassGroupMap(
      multi
        ? Object.fromEntries(levels.map((cid) => [cid, sessionGroupsOfClass(s, cid)]))
        : {},
    );
    setSalleId(s.salleId);
    setTeacherId(s.teacherId);
    setTeacherSearch("");
    setShowAddTeacher(false);
    setSelectedDays(s.days);
    // Un jour sans arène propre retombe sur celle de l'emploi : le formulaire
    // s'ouvre donc toujours avec une arène en face de chaque jour coché.
    setDaySalles(
      Object.fromEntries(s.days.map((d) => [d, sessionSalleOn(s, d)])) as Partial<
        Record<Day, string>
      >,
    );
    // Days that carry no override fall back on the emploi's default hours, so
    // the form always opens with a real séance in front of every selected day —
    // et un jour qui en tient deux rouvre avec ses deux.
    setDaySeances(
      Object.fromEntries(s.days.map((d) => [d, sessionSlotsOn(s, d).map((t) => ({ ...t }))])) as Partial<
        Record<Day, DayTime[]>
      >,
    );
    const sub = subscriptions.find((x) => x.sessionId === s.id);
    setMonthSeances(sub?.monthlySeances ?? 0);
    setMonthPrice(monthlyPriceOf(sub));
    setTransportShare(sub ? transportMonthShareOf(sub) : 0);
    setSchoolShare(sub ? schoolMonthShareOf(sub) : 0);
    setEngagementFee(sub?.engagementFee ?? 0);
    setEngagementDescription(sub?.engagementDescription ?? "");
    setIsEditOpen(true);
    setIsDetailsOpen(false);
  };

  const openDetails = (s: ScheduleSession) => {
    setSelectedSession(s);
    setIsDetailsOpen(true);
  };

  // Print one timing card: school letterhead + a detailed table (one row per
  // scheduled weekday) with module, group, class level, teacher and arène.
  const handlePrintSession = (s: ScheduleSession) => {
    const L = PRINT_LABELS[language];
    const enrolledCount = getSessionStudents(s.id).length;
    const orderedDays = WEEKDAYS.filter((wd) => s.days.includes(wd.key)).map((wd) => wd.key);
    const printDate = new Date().toLocaleDateString(language === "ar" ? "ar-DZ" : "fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // UNE LIGNE PAR SÉANCE, et non par jour : une journée qui en tient deux
    // s'imprime sur deux lignes, chacune avec son horaire.
    const rows = orderedDays
      .flatMap((day) =>
        sessionSlotsOn(s, day).map(
          (t, i, all) => `
          <tr>
            <td style="font-weight:bold;">${L.days[day]}${all.length > 1 ? ` <span style="font-weight:400;">(${slotLabel(i)})</span>` : ""}</td>
            <td style="font-family:monospace; font-weight:700;">${t.startTime} – ${t.endTime}</td>
            <td>${sessionTitle(s)}</td>
            <td>${sessionGroupIds(s).map(getGroupName).join(" · ")}</td>
            <td>${getClassName(s.classId)}</td>
            <td>${getTeacherName(s.teacherId)}</td>
            <td>${getSalleName(sessionSalleOn(s, day))}</td>
          </tr>`,
        ),
      )
      .join("");

    const bodyHtml = `
      ${letterheadHtml(school)}
      ${bannerHtml(L.docTitle, L.printedOn(printDate))}

      <div class="frame frame-info" style="margin-bottom:20px;">
        <h3>${L.infoTitle}</h3>
        <table style="margin-top:0;">
          <tr>
            <td style="width:18%; font-weight:bold; color:#59637a;">${L.module} :</td>
            <td style="width:32%; font-weight:bold; font-size:1.1em;">${sessionTitle(s)}</td>
            <td style="width:18%; font-weight:bold; color:#59637a;">${L.group} :</td>
            <td style="width:32%;">${sessionGroupIds(s).map(getGroupName).join(" · ")}</td>
          </tr>
          <tr>
            <td style="font-weight:bold; color:#59637a;">${L.classLevel} :</td>
            <td>${getClassName(s.classId)}</td>
            <td style="font-weight:bold; color:#59637a;">${L.teacher} :</td>
            <td>${getTeacherName(s.teacherId)}</td>
          </tr>
          <tr>
            <td style="font-weight:bold; color:#59637a;">${L.salle} :</td>
            <td>${getSalleName(s.salleId)}</td>
            <td style="font-weight:bold; color:#59637a;">${L.enrolled} :</td>
            <td><span class="badge badge-primary">${enrolledCount}</span></td>
          </tr>
        </table>
      </div>

      <div class="frame">
        <h3>${L.tableTitle}</h3>
        <table>
          <thead>
            <tr>
              <th>${L.day}</th>
              <th>${L.time}</th>
              <th>${L.module}</th>
              <th>${L.group}</th>
              <th>${L.classLevel}</th>
              <th>${L.teacher}</th>
              <th>${L.salle}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      ${signaturesHtml(L.signTeacher, L.signDirection)}
      ${metaFooterHtml(school.name, language)}
    `;

    printHtmlDocument(
      printDocument({
        title: `${L.docTitle} - ${sessionTitle(s)} ${getGroupName(s.groupId)}`,
        lang: language,
        bodyHtml,
      }),
    );
  };

  const getSessionStudents = (sessionId: string) => {
    const sub = subscriptions.find((su) => su.sessionId === sessionId);
    if (!sub) return [];
    return students.filter((stu) => stu.subscriptionIds.includes(sub.id));
  };

  const getHours = () => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const getMinutes = () => ["00", "15", "30", "45"];

  /** One "HH:mm" picker, split into an hour and a minute select. */
  const renderTimePicker = (value: string, onChange: (next: string) => void) => {
    const [h = "08", m = "00"] = (value || "").split(":");
    return (
      <div className="flex gap-1.5">
        <Select value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)} className="flex-1 !px-2">
          {getHours().map((x) => (
            <option key={x} value={x}>{x} H</option>
          ))}
        </Select>
        <Select value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)} className="flex-1 !px-2">
          {getMinutes().map((x) => (
            <option key={x} value={x}>{x} Min</option>
          ))}
        </Select>
      </div>
    );
  };

  /**
   * Days, then the SÉANCES of EACH of them.
   *
   * One day reads as a single créneau. As soon as a second is picked, every day
   * gets its own start and end — an emploi that runs Samedi matin and Mardi
   * après-midi is one emploi, not two — with a shortcut to copy the first day's
   * hours onto the rest when they are in fact identical.
   *
   * ET UN JOUR PEUT EN TENIR DEUX. Un groupe qui s'entraîne le matin PUIS le
   * soir tient deux séances ce jour-là : « + Ajouter une séance » les ouvre, et
   * elles comptent partout pour deux — deux pointages sur la feuille de
   * présence, deux séances décomptées de la carte, deux parts pour
   * l'entraîneur.
   */
  const renderDaysAndHours = () => (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <label className="block text-xs font-semibold text-muted font-sans">Jours de cours</label>
          <div className="flex items-center gap-1.5">
            <Badge tone={selectedDays.length ? "primary" : "warning"} className="text-[9px] font-bold">
              {selectedDays.length ? `${selectedDays.length} jour(s)` : "Aucun jour"}
            </Badge>
            {draftSeanceCount > selectedDays.length && (
              <Badge tone="success" className="text-[9px] font-bold">
                {draftSeanceCount} séance(s) / semaine
              </Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {WEEKDAYS.map((day) => {
            const active = selectedDays.includes(day.key);
            return (
              <Button
                key={day.key}
                variant={active ? "primary" : "outline"}
                onClick={() => toggleDay(day.key)}
                size="sm"
                className="w-full text-start py-2 justify-between"
              >
                <span>{day.label}</span>
                {active && <span className="text-[10px] bg-white/25 px-1.5 rounded">✔</span>}
              </Button>
            );
          })}
        </div>
      </div>

      {selectedDays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-canvas/40 p-3 text-[11px] leading-relaxed text-muted">
          Choisissez d&apos;abord les jours. Vous fixerez ensuite l&apos;heure de début et de fin
          <strong className="text-ink"> de chaque séance</strong> — un jour peut en tenir deux —
          et les arènes libres sur ces créneaux vous seront proposées.
        </div>
      ) : (
        <div className="rounded-2xl border border-primary/25 bg-primary-50/30 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              {selectedDays.length > 1 ? "Séances de chaque jour" : "Séances du jour"}
            </span>
            {selectedDays.length > 1 && (
              <button
                type="button"
                onClick={applyFirstDayToAll}
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                Appliquer les séances du {WEEKDAYS.find((w) => w.key === orderedDays[0])?.label} à tous
              </button>
            )}
          </div>

          {orderedDays.map((day) => {
            const list = seancesOf(day);
            const overlap = daySeancesOverlap(day);
            const bad = !dayTimeValid(day);
            return (
              <div
                key={day}
                className={`rounded-xl border p-2.5 ${bad ? "border-danger/40 bg-danger/5" : "border-line bg-surface"}`}
              >
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[11px] font-bold text-ink">
                    {WEEKDAYS.find((w) => w.key === day)?.label}
                    {list.length > 1 && (
                      <Badge tone="success" className="ms-1.5 text-[9px]">
                        {list.length} séances
                      </Badge>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => addSeance(day)}
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    + Ajouter une séance
                  </button>
                </div>

                {list.map((t, index) => {
                  const wrong = !seanceValid(t);
                  return (
                    <div
                      key={index}
                      className={`mb-1.5 rounded-lg border p-2 last:mb-0 ${
                        wrong ? "border-danger/40 bg-danger/5" : "border-line/70 bg-canvas/40"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
                          {list.length > 1 ? `Séance ${slotLabel(index)}` : "Horaire"}
                        </span>
                        <div className="flex items-center gap-2">
                          {wrong && (
                            <span className="text-[9px] font-semibold text-danger">
                              La fin doit suivre le début
                            </span>
                          )}
                          {list.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSeance(day, index)}
                              className="rounded p-0.5 text-danger hover:bg-danger/10"
                              title="Retirer cette séance"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="block text-[9px] uppercase font-semibold text-muted mb-1">
                            Début
                          </span>
                          {renderTimePicker(t.startTime, (v) =>
                            setDayTime(day, index, "startTime", v),
                          )}
                        </div>
                        <div>
                          <span className="block text-[9px] uppercase font-semibold text-muted mb-1">
                            Fin
                          </span>
                          {renderTimePicker(t.endTime, (v) => setDayTime(day, index, "endTime", v))}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {overlap && (
                  <p className="mt-1.5 rounded-lg border border-danger/40 bg-danger/10 p-1.5 text-[9px] font-semibold text-danger">
                    Deux séances de cette journée se chevauchent — on ne peut pas être au matin et
                    au soir en même temps.
                  </p>
                )}
              </div>
            );
          })}

          {draftSeanceCount > orderedDays.length && (
            <p className="rounded-xl border border-success/40 bg-success/10 p-2.5 text-[10px] leading-relaxed text-success">
              Cet emploi du temps tient{" "}
              <strong>{draftSeanceCount} séances par semaine</strong> sur {orderedDays.length}{" "}
              journée(s). Chaque séance se pointe séparément sur la feuille de présence et le
              tableau de bord, décompte UNE séance de la carte du chevalier, et rapporte SA part à
              l&apos;entraîneur : deux séances le même jour sont payées deux fois.
            </p>
          )}
        </div>
      )}
    </div>
  );

  /**
   * UNE ÉTAPE DU FORMULAIRE, dans son cadre.
   *
   * L'ancien formulaire était deux colonnes de champs empilés : on ne savait
   * jamais où on en était, ni ce qu'il restait à remplir. Chaque bloc porte
   * désormais SON NUMÉRO, son titre, ce à quoi il sert en une ligne, et une
   * pastille d'état — vert quand il est réglé, orange quand il attend encore
   * quelque chose. On lit l'écran comme une liste de courses.
   */
  const renderStep = (opts: {
    step: number;
    title: string;
    hint: string;
    icon: React.ReactNode;
    /** ce que la pastille annonce — vide = pas de pastille */
    status?: { label: string; done: boolean };
    className?: string;
    children: React.ReactNode;
  }) => (
    <section
      className={`flex flex-col rounded-2xl border border-line bg-surface shadow-sm ${opts.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line/70 bg-canvas/40 px-3.5 py-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-black text-white">
            {opts.step}
          </span>
          <span className="min-w-0">
            <strong className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
              {opts.icon} {tr(opts.title)}
            </strong>
            <span className="block text-[10px] leading-snug text-muted">{tr(opts.hint)}</span>
          </span>
        </div>
        {opts.status && (
          <Badge tone={opts.status.done ? "success" : "warning"} className="text-[9px] font-bold">
            {tr(opts.status.label)}
          </Badge>
        )}
      </header>
      <div className="flex-1 space-y-3 p-3.5">{opts.children}</div>
    </section>
  );

  /**
   * LE BANDEAU DE TÊTE — ce que l'emploi du temps est en train de devenir.
   *
   * Il tient en haut du formulaire et ne bouge pas : le nom composé, les jours,
   * les séances, l'arène, l'entraîneur et le tarif. On voit d'un coup d'œil ce
   * qu'on est en train d'écrire, sans remonter cinq blocs pour vérifier.
   */
  const renderRecap = () => {
    const composed =
      title.trim() ||
      [
        effectiveClassIds
          .map((cid) => classes.find((c) => c.id === cid)?.name ?? "?")
          .join(" + "),
        effectiveGroupIds.map(getGroupName).join(" · "),
      ]
        .filter(Boolean)
        .join(" — ") ||
      "Nouvel emploi du temps";
    const chips: { label: string; value: string; ok: boolean }[] = [
      {
        label: "Niveau(x)",
        value: effectiveClassIds.length
          ? effectiveClassIds.map((cid) => classes.find((c) => c.id === cid)?.name ?? "?").join(" + ")
          : "à choisir",
        ok: effectiveClassIds.length > 0,
      },
      {
        label: "Groupe(s)",
        value: effectiveGroupIds.length
          ? effectiveGroupIds.map(getGroupName).join(" · ")
          : "à choisir",
        ok: effectiveGroupIds.length > 0,
      },
      {
        label: "Séances",
        value: orderedDays.length
          ? `${draftSeanceCount} / semaine · ${formatDays(orderedDays)}`
          : "aucun jour",
        ok: orderedDays.length > 0 && invalidDays.length === 0,
      },
      {
        label: "Arène",
        value: daysWithoutSalle.length
          ? `${orderedDays.length - daysWithoutSalle.length}/${orderedDays.length} jour(s)`
          : orderedDays.length
            ? [...new Set(orderedDays.map((d) => getSalleName(daySalles[d] || salleId)))].join(" · ")
            : "à choisir",
        ok: orderedDays.length > 0 && daysWithoutSalle.length === 0,
      },
      {
        label: "Entraîneur",
        value: teacherId ? getTeacherName(teacherId) : "à choisir",
        ok: !!teacherId,
      },
      {
        label: "Carte",
        value:
          monthSeances > 0 && monthPrice > 0
            ? `${monthSeances} séances · ${formatDA(monthPrice)}`
            : "sans tarif",
        ok: monthSeances > 0 && monthPrice > 0,
      },
    ];
    return (
      <div className="sticky top-0 z-20 -mx-3 mb-4 border-b border-line bg-surface/95 px-3 pb-3 pt-1 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="rounded-2xl border border-primary/25 bg-primary-50/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-primary">
                {tr("Nom enregistré")}
              </span>
              <strong className="block truncate text-sm font-black text-ink">{composed}</strong>
            </div>
            <Badge tone={timingReady ? "success" : "warning"} className="text-[10px] font-bold">
              {timingReady
                ? `${draftSeanceCount} séance(s) / semaine`
                : "Choisissez au moins un jour"}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className={`flex max-w-full items-center gap-1 truncate rounded-lg border px-2 py-1 text-[10px] ${
                  c.ok
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-line bg-surface text-muted"
                }`}
                title={`${c.label} : ${c.value}`}
              >
                <span className="font-bold uppercase tracking-wider opacity-70">{tr(c.label)}</span>
                <span className="truncate font-semibold">{tr(c.value)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /**
   * L'ENGAGEMENT — le frais d'entrée propre à CE créneau.
   *
   * Ce n'est ni la cotisation (qui se paie carte après carte) ni les droits
   * d'entrée du club (qui se règlent une fois pour toutes) : c'est ce que le
   * chevalier verse pour REJOINDRE ce créneau — la tenue, l'équipement,
   * l'assurance du groupe.
   */
  const renderEngagementBlock = () => (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
          Montant de l&apos;engagement (DA)
        </label>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={engagementFee || ""}
          onChange={(e) => setEngagementFee(readMoney(e.target.value))}
          placeholder="Ex: 3000 — laisser 0 s'il n'y en a pas"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
          Description de l&apos;engagement
        </label>
        <Input
          value={engagementDescription}
          onChange={(e) => setEngagementDescription(e.target.value)}
          placeholder="Ex: tenue, protections et assurance de la saison"
        />
      </div>

      {engagementFee > 0 ? (
        <p className="rounded-xl border border-accent/35 bg-accent-wash/50 p-2.5 text-[10px] leading-relaxed text-muted">
          Chaque chevalier inscrit sur cet emploi du temps se verra porter un frais «{" "}
          <strong className="text-ink">Engagement</strong> » de{" "}
          <strong className="text-accent-ink">{formatDA(engagementFee)}</strong>, réglable en une ou
          plusieurs fois depuis sa fiche ou la feuille de présence de son groupe. Il n&apos;entre
          PAS dans son solde de séances et ne retient la part d&apos;aucun entraîneur.
        </p>
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-canvas/40 p-2.5 text-[10px] text-muted">
          Aucun engagement : rejoindre ce créneau ne coûte que la cotisation.
        </p>
      )}
    </div>
  );

  /** Le champ « catégorie » du mode à un seul niveau. */
  const renderSingleClassField = () => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-muted font-sans">Catégorie</label>
      <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full">
        <option value="">Sélectionner une catégorie</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.type === "cours" ? c.coursLevel : c.formationLevel})
          </option>
        ))}
      </Select>
    </div>
  );

  /**
   * LE FORMULAIRE D'UN EMPLOI DU TEMPS, EN CINQ ÉTAPES NUMÉROTÉES.
   *
   * Le même corps sert à créer et à modifier : ce sont exactement les mêmes
   * décisions, et les tenir en double laissait fatalement l'une des deux
   * dériver. Il s'étale sur toute la largeur de l'écran — trois cadres côte à
   * côte sur un grand moniteur, l'un sous l'autre sur un téléphone — pour que
   * TOUT soit lisible sans dérouler cinq fois.
   */
  const renderSessionForm = () => (
    <div className="space-y-4">
      {renderRecap()}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {renderStep({
          step: 1,
          title: "Le groupe",
          hint: "Qui s'entraîne : la ou les catégories, et leurs groupes.",
          icon: <Users className="h-3.5 w-3.5 text-primary" />,
          status: {
            label: effectiveGroupIds.length
              ? `${effectiveGroupIds.length} groupe(s)`
              : "à compléter",
            done: effectiveGroupIds.length > 0,
          },
          children: (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted font-sans">
                  Nom de l&apos;emploi du temps (optionnel)
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Poussins — Groupe A (Samedi matin)"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-muted">
                  Laissez vide pour composer le nom à partir de la catégorie et du groupe.
                </p>
              </div>
              {renderLevelModeSwitch()}
              {!multiLevel && renderSingleClassField()}
              {multiLevel ? renderLevelsField() : renderGroupField()}
            </>
          ),
        })}

        {renderStep({
          step: 2,
          title: "Les séances",
          hint: "Quand : les jours, et l'horaire de chaque séance — un jour peut en tenir deux.",
          icon: <Clock className="h-3.5 w-3.5 text-primary" />,
          status: {
            label: timingReady ? `${draftSeanceCount} séance(s)` : "à compléter",
            done: timingReady,
          },
          children: renderDaysAndHours(),
        })}

        {renderStep({
          step: 3,
          title: "L'arène & l'entraîneur",
          hint: "Où, et avec qui. L'entraîneur se crée ici s'il n'existe pas encore.",
          icon: <MapPin className="h-3.5 w-3.5 text-primary" />,
          status: {
            label: teacherId && daysWithoutSalle.length === 0 ? "réglé" : "à compléter",
            done: !!teacherId && orderedDays.length > 0 && daysWithoutSalle.length === 0,
          },
          className: "lg:col-span-2 2xl:col-span-1",
          children: (
            <>
              {renderSalleField()}
              {renderTeacherField()}
            </>
          ),
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
        {renderStep({
          step: 4,
          title: "Le tarif de la carte",
          hint: "Combien coûte une carte, et comment son prix se coupe : transport, club, entraîneur.",
          icon: <CircleDollarSign className="h-3.5 w-3.5 text-primary" />,
          status: {
            label: monthSeances > 0 && monthPrice > 0 ? "tarifé" : "sans tarif",
            done: monthSeances > 0 && monthPrice > 0,
          },
          className: "2xl:col-span-2",
          children: renderPricingBlock(),
        })}

        {renderStep({
          step: 5,
          title: "L'engagement",
          hint: "Le frais d'entrée de CE créneau : tenue, équipement, assurance du groupe.",
          icon: <ShieldCheck className="h-3.5 w-3.5 text-accent-ink" />,
          status: {
            label: engagementFee > 0 ? formatDA(engagementFee) : "aucun",
            done: true,
          },
          children: renderEngagementBlock(),
        })}
      </div>
    </div>
  );

  /**
   * LE TARIF DE LA CARTE, COUPÉ EN TROIS.
   *
   * La réception donne DEUX nombres — les séances qu'une carte contient et ce
   * que cette carte coûte — puis dit ce que le TRANSPORT prend dessus, puis ce
   * que le CLUB garde. Tout le reste se déduit : le prix d'une séance, ce qui
   * revient à l'entraîneur, et ce qu'il touche par séance assurée — le seul
   * chiffre que ses règlements paient.
   *
   * L'ORDRE COMPTE. Le bus est payé d'abord : il ne se prend ni sur la part du
   * club ni sur celle de l'entraîneur, il se prend sur la carte. Le club et
   * l'entraîneur se partagent ensuite ce qui reste — et c'est pour cela que la
   * part du club est plafonnée à ce reste, jamais au prix entier.
   */
  const renderPricingBlock = () => (
    <div className="space-y-3">
      <p className="rounded-xl border border-primary/25 bg-primary-50/40 p-2 text-[10px] leading-relaxed text-muted">
        La carte d&apos;un chevalier s&apos;ouvre à sa 1<sup>re</sup> présence et se ferme à la
        dernière séance du pack.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
            Nombre de séances de la carte *
          </label>
          <Input
            type="number"
            min={0}
            value={monthSeances || ""}
            onChange={(e) => setMonthSeances(Math.max(0, Number(e.target.value) || 0))}
            placeholder="Ex: 8"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
            Prix total de la carte (DA) *
          </label>
          <Input
            type="number"
            min={0}
            value={monthPrice || ""}
            onChange={(e) => setMonthPrice(readMoney(e.target.value))}
            step="0.01"
            placeholder="Ex: 4000"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
            Prix d&apos;une séance (calculé)
          </label>
          <div className="flex h-10 items-center rounded-xl border border-primary/40 bg-primary-50/60 px-3 text-sm font-black text-primary">
            {formatDA(pricePerSeance)}
          </div>
        </div>
      </div>

      {/* ---- LA COUPE EN TROIS : le bus, le club, l'entraîneur ------------ */}
      <div className="rounded-xl border border-line bg-surface/70 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink">
            <Bus className="h-3.5 w-3.5 text-accent-ink" /> Répartition du prix de la carte
          </span>
          <span className="text-[10px] text-muted">
            Le transport se prélève d&apos;abord, puis le club, et le reste revient à
            l&apos;entraîneur.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
              1 · Part du transport sur la carte (DA)
            </label>
            <Input
              type="number"
              min={0}
              max={monthPrice || undefined}
              value={transportShare || ""}
              onChange={(e) => setTransportShare(readMoney(e.target.value))}
              step="0.01"
              placeholder="Ex: 800 — laisser 0 sans ramassage"
            />
            <p className="mt-1 text-[9px] leading-relaxed text-muted">
              {transportPart > 0 ? (
                <>
                  Soit{" "}
                  <strong className="text-accent-ink">{formatDA(transportPerSeance)}</strong> par
                  séance. Ce montant est suivi à part dans les{" "}
                  <strong className="text-ink">Rapports</strong>, groupe par groupe.
                </>
              ) : (
                "Aucun transport sur ce créneau : la carte se partage entre le club et l'entraîneur."
              )}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
              2 · Part du club sur le reste (DA)
            </label>
            <Input
              type="number"
              min={0}
              max={shareable || undefined}
              value={schoolShare || ""}
              onChange={(e) => setSchoolShare(readMoney(e.target.value))}
              step="0.01"
              placeholder="Ex: 2200"
            />
            <p className="mt-1 text-[9px] leading-relaxed text-muted">
              Reste à partager après le transport&nbsp;:{" "}
              <strong className="text-ink">{formatDA(shareable)}</strong>
              {schoolShare > shareable && shareable > 0 && (
                <>
                  {" "}
                  — <span className="font-bold text-warning">ramené à ce reste</span>.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
              Transport (calculé)
            </label>
            <div className="flex h-10 items-center rounded-xl border border-accent/40 bg-accent-wash/60 px-3 text-sm font-black text-accent-ink">
              {formatDA(transportPart)}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
              3 · Reste pour l&apos;entraîneur (calculé)
            </label>
            <div className="flex h-10 items-center rounded-xl border border-success/40 bg-success/10 px-3 text-sm font-black text-success">
              {formatDA(teacherShare)}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
              Séance payée à l&apos;entraîneur (calculé)
            </label>
            <div className="flex h-10 items-center rounded-xl border border-success/40 bg-success/10 px-3 text-sm font-black text-success">
              {formatDA(teacherPerSeance)}
            </div>
          </div>
        </div>
      </div>

      {monthSeances > 0 && monthPrice > 0 ? (
        <p className="rounded-xl border border-line bg-surface p-2.5 text-[10px] leading-relaxed text-muted">
          Une carte = <strong className="text-ink">{monthSeances} séances</strong> à{" "}
          <strong className="text-ink">{formatDA(monthPrice)}</strong> →{" "}
          <strong className="text-primary">{formatDA(pricePerSeance)} la séance</strong>. Le
          transport prend{" "}
          <strong className="text-accent-ink">{formatDA(transportPart)}</strong>, le club garde{" "}
          <strong className="text-ink">{formatDA(schoolPart)}</strong>, et l&apos;entraîneur reçoit{" "}
          <strong className="text-success">{formatDA(teacherShare)}</strong> — soit,{" "}
          <em>par séance assurée</em>&nbsp;:{" "}
          <strong className="text-accent-ink">{formatDA(transportPerSeance)}</strong> de transport,{" "}
          <strong className="text-primary">{formatDA(schoolPerSeance)}</strong> pour le club et{" "}
          <strong className="text-success">{formatDA(teacherPerSeance)}</strong> pour
          l&apos;entraîneur. Les divisions gardent leurs décimales : une carte qui ne tombe pas
          juste se répartit au centime, jamais arrondi au dinar.
        </p>
      ) : (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-[10px] text-warning">
          Sans nombre de séances ni prix de la carte, l&apos;emploi du temps est créé sans tarif :
          aucun chevalier ne pourra y être inscrit tant qu&apos;il n&apos;en a pas un — et
          l&apos;engagement ci-dessous ne sera enregistré qu&apos;une fois le tarif posé.
        </p>
      )}
    </div>
  );

  /**
   * L'entraîneur, CHERCHÉ PAR SON NOM.
   *
   * Un club qui compte quarante entraîneurs ne les retrouve pas dans une
   * liste déroulante : on tape deux lettres du nom (ou du téléphone) et on
   * clique. Celui qui est déjà choisi reste affiché en tête, avec de quoi le
   * retirer d'un clic.
   */
  const renderTeacherField = () => {
    const q = teacherSearch.trim().toLowerCase();
    const picked = teachers.find((t) => t.id === teacherId);
    const matches = teachers
      .filter((t) =>
        q ? `${t.firstName} ${t.lastName} ${t.phone ?? ""}`.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
      .slice(0, 40);

    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <label className="block text-xs font-semibold text-muted font-sans">Entraîneur</label>
          <div className="flex items-center gap-2">
            <Badge tone="neutral" className="text-[9px] font-bold">
              {teachers.length} entraîneur(s)
            </Badge>
            <button
              type="button"
              onClick={() => setShowAddTeacher(!showAddTeacher)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {showAddTeacher ? "Annuler" : "+ Nouvel entraîneur"}
            </button>
          </div>
        </div>

        {/* ---- L'ENTRAÎNEUR CRÉÉ SUR PLACE ------------------------------
            Plus besoin de quitter l'emploi du temps à moitié rempli pour aller
            créer une fiche sur un autre écran : on la crée ici, elle est
            aussitôt choisie, et elle vit ensuite sur l'écran Entraîneurs comme
            n'importe quelle autre. */}
        {showAddTeacher && (
          <div className="mb-2 space-y-2 rounded-xl border border-primary/30 bg-primary-50/30 p-3">
            <p className="text-[10px] leading-relaxed text-muted">
              La fiche est créée immédiatement et rejoint l&apos;écran{" "}
              <strong className="text-ink">Entraîneurs</strong>, où sa paie et son historique se
              tiennent. Elle n&apos;ouvre aucun compte de connexion — cela se décide sur sa fiche.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={newTeacherFirst}
                onChange={(e) => setNewTeacherFirst(e.target.value)}
                placeholder="Prénom *"
              />
              <Input
                value={newTeacherLast}
                onChange={(e) => setNewTeacherLast(e.target.value)}
                placeholder="Nom"
              />
            </div>
            <Input
              value={newTeacherPhone}
              onChange={(e) => setNewTeacherPhone(e.target.value)}
              placeholder="Téléphone"
            />
            <div>
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted">
                Comment il est payé
              </span>
              <Select
                value={newTeacherPay}
                onChange={(e) => setNewTeacherPay(e.target.value as TeacherPaymentType)}
              >
                <option value="per_group">Par emploi du temps (part de la carte)</option>
                <option value="monthly">Salaire fixe par carte</option>
                <option value="percentage">Pourcentage des présences</option>
              </Select>
            </div>
            {newTeacherPay === "monthly" && (
              <Input
                type="number"
                min={0}
                value={newTeacherMonthly || ""}
                onChange={(e) => setNewTeacherMonthly(Math.max(0, Number(e.target.value) || 0))}
                placeholder="Montant par carte (DA)"
              />
            )}
            {newTeacherPay === "percentage" && (
              <Input
                type="number"
                min={0}
                max={100}
                value={newTeacherPercent || ""}
                onChange={(e) =>
                  setNewTeacherPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                }
                placeholder="Pourcentage (ex: 60)"
              />
            )}
            <Button size="sm" className="w-full" onClick={handleCreateTeacher}>
              Créer et choisir cet entraîneur
            </Button>
          </div>
        )}

        {picked && (
          <div className="mb-1.5 flex items-center justify-between gap-2 rounded-xl border border-primary bg-primary/10 p-2.5">
            <span className="min-w-0">
              <strong className="block text-xs text-ink truncate">
                {picked.firstName} {picked.lastName}
                {picked.isPassager && (
                  <Badge tone="warning" className="ms-1.5 text-[9px]">
                    passager
                  </Badge>
                )}
              </strong>
              <span className="block text-[10px] text-muted">{picked.phone || "—"}</span>
            </span>
            <button
              type="button"
              onClick={() => setTeacherId("")}
              className="shrink-0 rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-danger hover:bg-danger/10"
            >
              Retirer
            </button>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={teacherSearch}
            onChange={(e) => setTeacherSearch(e.target.value)}
            placeholder="Rechercher un entraîneur par son nom…"
            className="ps-9"
          />
        </div>

        {teachers.length === 0 ? (
          <p className="mt-1.5 rounded-xl border border-dashed border-line bg-canvas/40 p-3 text-[11px] text-muted">
            Aucun entraîneur enregistré — créez-en un avec «&nbsp;+ Nouvel entraîneur&nbsp;»,
            sans quitter cet écran.
          </p>
        ) : (
          <div className="mt-1.5 max-h-44 space-y-1 overflow-y-auto pe-0.5">
            {matches.length === 0 ? (
              <p className="p-2 text-[11px] italic text-muted">Aucun entraîneur ne correspond.</p>
            ) : (
              matches.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTeacherId(teacherId === t.id ? "" : t.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border p-2 text-start transition-colors ${
                    teacherId === t.id
                      ? "border-primary bg-primary/10 ring-2 ring-primary/25"
                      : "border-line bg-surface hover:bg-primary-50/40"
                  }`}
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-xs text-ink">
                      {t.firstName} {t.lastName}
                    </strong>
                    <span className="block text-[10px] text-muted">{t.phone || "—"}</span>
                  </span>
                  {t.isPassager && (
                    <Badge tone="warning" className="shrink-0 text-[9px]">
                      passager
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  /** Une arène dans la liste : son nom, son état et ce qui l'occupe déjà. */
  const renderSalleOption = (
    sa: SalleAvailability,
    picked: boolean,
    onPick: () => void,
  ) => (
    <button
      key={sa.id}
      type="button"
      onClick={onPick}
      className={`w-full text-start rounded-xl border p-2.5 transition-all ${
        picked
          ? "border-primary bg-primary/10 ring-2 ring-primary/25"
          : sa.free
            ? "border-line bg-surface hover:bg-primary-50/40"
            : "border-danger/30 bg-danger/5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-ink truncate">{sa.name}</span>
        <Badge tone={sa.free ? "success" : "danger"} className="text-[9px] font-bold shrink-0">
          {sa.free ? "Disponible" : "Occupée"}
        </Badge>
      </div>
      {!sa.free && (
        <div className="mt-1 space-y-0.5">
          {sa.clashes.map((c) => (
            <span key={c.sessionId} className="block text-[10px] leading-snug text-danger">
              {c.label} · {formatDays(c.days)} · {c.timeLabel}
            </span>
          ))}
        </div>
      )}
    </button>
  );

  /** Le formulaire « + Nouvell'arène », partagé par les deux modes. */
  const renderAddSalle = (day?: Day) => (
    <div className="flex gap-2">
      <Input
        value={newSalleName}
        onChange={(e) => setNewSalleName(e.target.value)}
        placeholder="Nom de l'arène"
        className="flex-1"
      />
      <Button size="sm" onClick={() => handleCreateSalle(day)}>Créer</Button>
      <Button size="sm" variant="outline" onClick={() => { setShowAddSalle(false); setNewSalleName(""); }}>
        Annuler
      </Button>
    </div>
  );

  /**
   * L'arène, choisie EN DERNIER.
   *
   * Elle reste verrouillée tant que chaque jour coché ne porte pas un créneau
   * cohérent — sans cela il n'y a rien à confronter à une arène. Puis :
   *
   *  - UN seul jour  : la liste habituelle, chaque arène disant si elle est
   *    libre sur ce créneau ou quel emploi l'occupe déjà ;
   *  - PLUSIEURS jours : une arène PAR JOUR, chacune vérifiée sur le créneau de
   *    CE jour-là. Samedi en Arène A et Mardi en Arène B est un seul emploi du
   *    temps, et une arène occupée le samedi reste libre le mardi.
   */
  const renderSalleField = () => (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <label className="block text-xs font-semibold text-muted font-sans">
          {orderedDays.length > 1 ? "Arène de chaque jour" : "Arène"}
        </label>
        {timingReady && (
          <div className="flex items-center gap-2">
            {daysWithoutSalle.length > 0 && (
              <Badge tone="warning" className="text-[9px] font-bold">
                {formatDays(daysWithoutSalle)} sans arène
              </Badge>
            )}
            {orderedDays.length <= 1 && (
              <Badge tone={freeSalleCount ? "success" : "danger"} className="text-[9px] font-bold">
                {freeSalleCount} / {salles.length} libre(s)
              </Badge>
            )}
            {orderedDays.length > 1 && (
              <button
                type="button"
                onClick={applyFirstSalleToAll}
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                Même arène tous les jours
              </button>
            )}
            <button
              onClick={() => setShowAddSalle(!showAddSalle)}
              className="text-xs text-primary hover:underline"
            >
              + Nouvelle arène
            </button>
          </div>
        )}
      </div>

      {!timingReady ? (
        <div className="rounded-xl border border-dashed border-line bg-canvas/40 p-3 text-[11px] leading-relaxed text-muted">
          🔒 Fixez d&apos;abord les <strong className="text-ink">jours</strong> et
          l&apos;<strong className="text-ink">heure de début et de fin de chaque jour</strong>. Les
          salles disponibles sur ces créneaux s&apos;afficheront ici.
        </div>
      ) : salles.length === 0 && !showAddSalle ? (
        <div className="rounded-xl border border-dashed border-line bg-canvas/40 p-3 text-[11px] text-muted">
          Aucune arène enregistrée — créez-en une avec « + Nouvelle arène ».
        </div>
      ) : showAddSalle && orderedDays.length <= 1 ? (
        renderAddSalle(orderedDays[0])
      ) : orderedDays.length <= 1 ? (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pe-0.5">
          {salleAvailability.map((sa) =>
            renderSalleOption(sa, salleId === sa.id, () => {
              const next = salleId === sa.id ? "" : sa.id;
              setSalleId(next);
              if (orderedDays[0]) setDaySalle(orderedDays[0], next);
            }),
          )}
          <p className="pt-1 text-[10px] leading-relaxed text-muted">
            Une salle occupée reste sélectionnable — le club peut vouloir doubler un créneau —
            mais le conflit est affiché avant l&apos;enregistrement.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {showAddSalle && renderAddSalle()}
          {orderedDays.map((day) => {
            const rows = availabilityFor(day);
            const free = rows.filter((r) => r.free).length;
            const chosen = daySalles[day] || "";
            // L'arène se choisit PAR JOUR, pas par séance : un groupe qui
            // s'entraîne matin et soir occupe la même arène les deux fois. Les
            // horaires des deux séances sont rappelés côte à côte.
            const times = seancesOf(day);
            return (
              <div key={day} className="rounded-xl border border-line bg-surface p-2.5">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-ink">
                    {WEEKDAYS.find((w) => w.key === day)?.label}{" "}
                    <span className="font-mono font-normal text-muted">
                      {times.map((t) => `${t.startTime}–${t.endTime}`).join(" · ")}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={free ? "success" : "danger"} className="text-[9px] font-bold">
                      {free} / {salles.length} libre(s)
                    </Badge>
                    <Badge tone={chosen ? "primary" : "warning"} className="text-[9px] font-bold">
                      {chosen ? getSalleName(chosen) : "Aucune arène"}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pe-0.5">
                  {rows.map((sa) =>
                    renderSalleOption(sa, chosen === sa.id, () =>
                      setDaySalle(day, chosen === sa.id ? "" : sa.id),
                    ),
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[10px] leading-relaxed text-muted">
            Chaque jour porte sa propre salle, vérifiée sur SON créneau : une salle prise le samedi
            reste proposée le mardi. Une salle occupée reste sélectionnable — le conflit est
            simplement affiché avant l&apos;enregistrement.
          </p>
        </div>
      )}
    </div>
  );

  const clearFilters = () => {
    setFilterSessionId("");
    setFilterTeacherId("");
    setFilterSalleId("");
    setFilterClassId("");
    setKindFilter("all");
  };

  /** A séance libre also "belongs" to every class / group / arène of its
   *  multi-selection, not only to the primary one stored in the columns. */
  const sessionCovers = (s: ScheduleSession, kind: "class" | "salle", id: string) => {
    if (kind === "class") return sessionClassIds(s).includes(id);
    return s.salleId === id || (s.salleIds ?? []).includes(id);
  };

  // Filter sessions
  const filteredSessions = sessions.filter((s) => {
    if (kindFilter === "cours" && s.isOpen) return false;
    if (kindFilter === "open" && !s.isOpen) return false;
    if (filterSessionId && s.id !== filterSessionId) return false;
    if (filterTeacherId && s.teacherId !== filterTeacherId) return false;
    if (filterSalleId && !sessionCovers(s, "salle", filterSalleId)) return false;
    if (filterClassId && !sessionCovers(s, "class", filterClassId)) return false;
    return true;
  });

  const openSessionPrice = (s: ScheduleSession) =>
    subscriptions.find((su) => su.sessionId === s.id)?.pricePerSession ?? s.openPrice ?? 0;

  /** Is a séance libre still inside its date period? */
  const openSessionActive = (s: ScheduleSession) => {
    const today = new Date().toLocaleDateString("fr-CA");
    if (s.periodStart && today < s.periodStart) return false;
    if (s.periodEnd && today > s.periodEnd) return false;
    return true;
  };

  return (
    <div className="space-y-6 text-xs">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader icon={CalendarDays} title="Emploi du Temps" subtitle="Visualisation du calendrier hebdomadaire et planification" />
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          {can("create_open") && (
            <Button
              variant="outline"
              onClick={() => { resetOpenForm(); setIsOpenSeanceModalOpen(true); }}
              className="flex items-center gap-2 border-primary/30 text-primary hover:bg-primary-50"
            >
              <Sparkles className="h-4 w-4" /> Créneau Séance Libre
            </Button>
          )}
          {/* LES GROUPES SE CRÉENT SANS EMPLOI DU TEMPS.
              Un club prépare ses groupes en début de saison — « 8-10 ans :
              Groupe A, Groupe B » — bien avant de savoir qui les entraînera et
              à quelle heure. Les enfermer dans le formulaire de création d'un
              créneau obligeait à inventer un emploi du temps pour poser un
              simple nom. */}
          {can("create") && (
            <Button
              variant="outline"
              onClick={() => setIsGroupsOpen(true)}
              className="flex items-center gap-2"
            >
              <LayoutGrid className="h-4 w-4 text-primary" /> Groupes des catégories
            </Button>
          )}
          {can("create") && (
            <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Créer un emploi du temps
            </Button>
          )}
        </div>
      </div>

      {/* Advanced Filter Toolbar */}
      <Card className="border border-line shadow-sm">
        <CardBody className="p-4 space-y-3.5">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <span className="font-bold text-ink uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-primary" /> Filtrer le Calendrier
            </span>
            {(filterSessionId || filterTeacherId || filterClassId || filterSalleId || kindFilter !== "all") && (
              <button onClick={clearFilters} className="text-primary hover:underline font-bold text-[10px] flex items-center gap-1">
                <X className="h-3 w-3" /> Réinitialiser
              </button>
            )}
          </div>

          {/* Type of timing: regular courses vs séances libres */}
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "all", label: `Tous (${sessions.length})` },
              { key: "cours", label: `Cours (${sessions.filter((s) => !s.isOpen).length})` },
              { key: "open", label: `Séances Libres (${sessions.filter((s) => s.isOpen).length})` },
            ] as const).map((k) => (
              <button
                key={k.key}
                onClick={() => setKindFilter(k.key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  kindFilter === k.key ? "bg-primary text-white shadow-sm" : "bg-canvas text-muted hover:text-ink"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filter by specific emploi du temps */}
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase mb-1 font-sans">Séance Spécifique</label>
              <Select value={filterSessionId} onChange={(e) => setFilterSessionId(e.target.value)} className="w-full">
                <option value="">Tous les cours</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.isOpen
                      ? `🎯 ${sessionTitle(s)}`
                      : `${sessionTitle(s)} - ${sessionGroupIds(s).map(getGroupName).join(" · ")}`}
                  </option>
                ))}
              </Select>
            </div>

            {/* Filter by Teacher */}
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase mb-1 font-sans">Entraîneur</label>
              <Select value={filterTeacherId} onChange={(e) => setFilterTeacherId(e.target.value)} className="w-full">
                <option value="">Tous les entraîneurs</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </Select>
            </div>

            {/* Filter by Classroom */}
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase mb-1 font-sans">Arène de Cours</label>
              <Select value={filterSalleId} onChange={(e) => setFilterSalleId(e.target.value)} className="w-full">
                <option value="">Toutes les arènes</option>
                {salles.map((sa) => (
                  <option key={sa.id} value={sa.id}>
                    {sa.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Filter by Class */}
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase mb-1 font-sans">Catégorie & Niveau</label>
              <Select value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)} className="w-full">
                <option value="">Toutes les catégories</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type === "cours" ? c.coursLevel : c.formationLevel})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Layout View Toggle */}
      <div className="flex justify-end items-center gap-2">
        <span className="text-[10px] uppercase font-bold text-muted font-sans me-1">Affichage :</span>
        <div className="bg-canvas border border-line p-1 rounded-xl flex gap-1">
          <button
            onClick={() => setViewMode("calendar")}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              viewMode === "calendar"
                ? "bg-primary text-white shadow-sm"
                : "text-muted hover:text-ink hover:bg-canvas/50"
            }`}
          >
            Vue Calendrier
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              viewMode === "cards"
                ? "bg-primary text-white shadow-sm"
                : "text-muted hover:text-ink hover:bg-canvas/50"
            }`}
          >
            Vue Cartes
          </button>
        </div>
      </div>

      {viewMode === "calendar" ? (
        /* TIMETABLE BOARD COLUMN GRID */
        <div className="overflow-x-auto pb-4">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 min-w-[900px] md:min-w-0">
            {WEEKDAYS.map((day) => {
              /**
               * UNE CARTE PAR SÉANCE, et non par emploi du temps.
               *
               * Un groupe qui s'entraîne le matin PUIS le soir occupe deux
               * cases de la colonne : les fondre en une seule cacherait
               * l'entraînement du soir à qui lit la semaine.
               */
              const daySessions = filteredSessions
                .filter((s) => s.days.includes(day.key))
                .flatMap((s) =>
                  sessionSlotsOn(s, day.key).map((times, slot, all) => ({
                    session: s,
                    slot,
                    times,
                    slotCount: all.length,
                  })),
                )
                .sort((a, b) => minutesOf(a.times.startTime) - minutesOf(b.times.startTime));

              return (
                <div key={day.key} className="flex flex-col bg-canvas/30 rounded-2xl border border-line p-3 min-h-[420px] space-y-3.5">
                  {/* Column Header */}
                  <div className="border-b border-line pb-2.5 text-center flex justify-between items-center px-1">
                    <span className="font-extrabold text-ink uppercase text-[10px] tracking-wider block capitalize">
                      {day.label}
                    </span>
                    <Badge tone={daySessions.length > 0 ? "primary" : "neutral"} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      {daySessions.length}
                    </Badge>
                  </div>

                  {/* Day Timetable Cards list */}
                  <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[500px] pe-0.5">
                    {daySessions.length === 0 ? (
                      <div className="h-full flex items-center justify-center py-16 text-center text-muted font-medium italic text-[10px]">
                        Libre
                      </div>
                    ) : (
                      daySessions.map(({ session: s, slot, times, slotCount }) => {
                        const enrolledCount = getSessionStudents(s.id).length;
                        return (
                          <div
                            key={`${s.id}#${slot}`}
                            onClick={() => openDetails(s)}
                            className={`p-3 rounded-xl border cursor-pointer hover:shadow-sm hover:scale-[1.01] transition-all duration-200 space-y-2 ${getSessionColor(
                              s.id
                            )}`}
                          >
                            {/* Timings */}
                            <div className="flex items-center justify-between gap-1 text-[9px] font-bold font-mono">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span>
                                  {times.startTime} - {times.endTime}
                                </span>
                              </span>
                              {slotCount > 1 && (
                                <span className="rounded bg-black/10 px-1 py-0.5 text-[8px] font-black dark:bg-white/15">
                                  {slotLabel(slot)} / {slotCount}
                                </span>
                              )}
                            </div>

                            {/* Module & Class Info */}
                            <div className="space-y-0.5">
                              <strong className="block text-[11px] font-black leading-tight line-clamp-2">
                                {s.isOpen && <span className="me-1">🎯</span>}
                                {sessionTitle(s)}
                              </strong>
                              <span className="block text-[9px] opacity-80 font-bold truncate">
                                {s.isOpen
                                  ? `Séance libre · ${formatDA(openSessionPrice(s))}`
                                  : getClassName(s.classId)}
                              </span>
                            </div>

                            {/* Room & Teacher */}
                            <div className="text-[9px] opacity-90 space-y-1 pt-1.5 border-t border-black/5 dark:border-white/5">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 shrink-0" />
                                <span className="truncate">{getTeacherName(s.teacherId)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 truncate max-w-[65%]">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">
                                    {getSalleName(sessionSalleOn(s, day.key))}
                                  </span>
                                </span>
                                <Badge tone="success" className="text-[8px] px-1 py-0 font-bold">
                                  {enrolledCount} él.
                                </Badge>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* DETAILED CARDS VIEW */
        <div>
          {filteredSessions.length === 0 ? (
            <div className="text-center p-12 bg-canvas/30 border border-line border-dashed rounded-2xl text-muted text-xs">
              Aucun emploi du temps ne correspond aux filtres actuels.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSessions.map((s) => {
                const enrolledCount = getSessionStudents(s.id).length;
                return (
                  <Card key={s.id} className={`hover:shadow-md transition-all duration-200 ${getSessionColor(s.id)}`}>
                    <CardBody className="p-4 space-y-3 flex flex-col justify-between h-full">
                      <div className="space-y-2">
                        {/* Header: Module + Group Badge */}
                        <div className="flex justify-between items-start">
                          <div className="min-w-0">
                            <strong className="block text-sm font-black text-ink leading-tight line-clamp-2">
                              {sessionTitle(s)}
                            </strong>
                            <span className="text-[10px] font-bold opacity-80 mt-0.5 block truncate">
                              {s.isOpen
                                ? (s.classIds ?? [s.classId]).map(getClassName).join(" · ")
                                : getClassName(s.classId)}
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {s.isOpen && (
                              <Badge tone={openSessionActive(s) ? "success" : "neutral"} className="font-bold text-[9px]">
                                {openSessionActive(s) ? "Séance Libre" : "Période terminée"}
                              </Badge>
                            )}
                            <Badge tone="primary" className="font-bold">
                              {s.isOpen
                                ? `${sessionGroupIds(s).length} groupe(s)`
                                : sessionGroupIds(s).map(getGroupName).join(" · ") || "—"}
                            </Badge>
                          </div>
                        </div>

                        {/* Room & Teacher & Schedule info */}
                        <div className="space-y-1.5 pt-2 border-t border-black/5 dark:border-white/5 text-[11px] text-ink/90">
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>
                              Entraîneur: <strong>{getTeacherName(s.teacherId)}</strong>
                              {teachers.find((t) => t.id === s.teacherId)?.isPassager && (
                                <span className="ms-1 text-[9px] font-bold px-1 py-0.5 rounded bg-warning/15 text-warning">
                                  Passager
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>
                              Arène:{" "}
                              <strong>
                                {s.isOpen
                                  ? (s.salleIds ?? [s.salleId]).map(getSalleName).join(" + ")
                                  : getSalleName(s.salleId)}
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>Horaires: <strong className="font-mono">{sessionTimeLabel(s)}</strong></span>
                          </div>
                          {s.isOpen && (
                            <>
                              <div className="flex items-center gap-2">
                                <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>
                                  Période:{" "}
                                  <strong className="font-mono">
                                    {formatDateFr(s.periodStart)} → {formatDateFr(s.periodEnd)}
                                  </strong>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>Tarif séance: <strong className="text-primary">{formatDA(openSessionPrice(s))}</strong></span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Days list */}
                        <div className="pt-1 flex flex-wrap gap-1">
                          {s.days.map((dayKey) => (
                            <Badge key={dayKey} tone="neutral" className="text-[9px] font-bold uppercase">
                              {WEEKDAYS.find((wd) => wd.key === dayKey)?.label || dayKey}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Footer Actions & Count */}
                      <div className="flex justify-between items-center pt-3 border-t border-black/5 dark:border-white/5 mt-auto">
                        <Badge tone="success" className="text-[10px] font-bold flex items-center gap-1">
                          <Users className="h-3 w-3" /> {enrolledCount} chevalier(s)
                        </Badge>

                        <div className="flex gap-1.5">
                          {can("view") && (
<button
                              onClick={() => openDetails(s)}
                              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-ink/80 transition-colors"
                              title="Consulter les détails"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
                          {can("print") && (
<button
                              onClick={() => handlePrintSession(s)}
                              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-ink/80 transition-colors"
                              title="Imprimer cet horaire"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                          )}
                          {can("edit") && (
<button
                              onClick={() => (s.isOpen ? openEditOpenSeance(s) : openEdit(s))}
                              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-primary transition-colors"
                              title="Modifier"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                          {can("delete") && (
<button
                              onClick={() => handleDelete(s.id)}
                              className="p-1.5 rounded-lg hover:bg-danger/10 text-danger transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* ---- L'ATELIER DES GROUPES ------------------------------------
           On y prépare les groupes de chaque catégorie SANS créer le moindre
           emploi du temps : c'est le travail de début de saison, et il n'a
           aucune raison d'exiger un créneau pour poser un nom.            */}
      <Modal
        open={isGroupsOpen}
        onClose={() => {
          setIsGroupsOpen(false);
          setRenamingGroupId("");
        }}
        title="Groupes des catégories"
        wide
      >
        <div className="space-y-4">
          <p className="rounded-xl border border-line bg-canvas/40 p-3 text-[11px] leading-relaxed text-muted">
            Un groupe appartient à UNE catégorie : « Groupe A » des 8-10 ans n&apos;est pas
            « Groupe A » des 15-18 ans. Préparez-les ici, en début de saison, et
            l&apos;écran de création d&apos;un emploi du temps — comme celui d&apos;inscription
            d&apos;un chevalier — ne proposera plus que les groupes de la catégorie choisie.
          </p>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Catégorie</label>
            <Select
              value={manageClassId}
              onChange={(e) => {
                setManageClassId(e.target.value);
                setRenamingGroupId("");
              }}
              className="w-full"
            >
              <option value="">Choisir une catégorie…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {getClassName(c.id)} — {groupsOfClass(db, c.id).length} groupe(s)
                </option>
              ))}
            </Select>
          </div>

          {!manageClassId ? (
            <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning">
              Choisissez une catégorie pour voir ses groupes et en ajouter.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={manageGroupName}
                  onChange={(e) => setManageGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleManageCreateGroup();
                  }}
                  placeholder="Nom du nouveau groupe (ex: Groupe A)"
                  className="min-w-[200px] flex-1"
                />
                <Button onClick={handleManageCreateGroup} className="gap-2">
                  <Plus className="h-4 w-4" /> Ajouter à cette catégorie
                </Button>
              </div>

              <div className="space-y-1.5 rounded-xl border border-line bg-canvas/30 p-2">
                {groupsOfClass(db, manageClassId).length === 0 ? (
                  <p className="p-2 text-[11px] italic text-muted">
                    Cette catégorie n&apos;a encore aucun groupe.
                  </p>
                ) : (
                  groupsOfClass(db, manageClassId).map((g) => {
                    const used = sessions.filter((se) => sessionGroupIds(se).includes(g.id)).length;
                    const members = students.filter((st) =>
                      st.subscriptionIds.some((subId) => {
                        const sub = subscriptions.find((x) => x.id === subId);
                        const se = sub && sessions.find((x) => x.id === sub.sessionId);
                        return !!se && sessionGroupIds(se).includes(g.id);
                      }),
                    ).length;
                    return (
                      <div
                        key={g.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-2"
                      >
                        {renamingGroupId === g.id ? (
                          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                            <Input
                              value={renameGroupName}
                              onChange={(e) => setRenameGroupName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameGroup();
                              }}
                              className="min-w-[160px] flex-1"
                            />
                            <Button size="sm" onClick={handleRenameGroup}>
                              Renommer
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRenamingGroupId("")}>
                              Annuler
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-ink">
                              <Users className="h-3.5 w-3.5 text-primary" /> {g.name}
                              <Badge tone={used > 0 ? "primary" : "neutral"} className="text-[9px]">
                                {used} emploi(s)
                              </Badge>
                              <Badge tone={members > 0 ? "success" : "neutral"} className="text-[9px]">
                                {members} chevalier(s)
                              </Badge>
                              {!g.classId && (
                                <Badge tone="warning" className="text-[9px]">
                                  rattaché par ses créneaux
                                </Badge>
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <button
                                onClick={() => {
                                  setRenamingGroupId(g.id);
                                  setRenameGroupName(g.name);
                                }}
                                className="rounded-lg p-1.5 text-primary transition-colors hover:bg-primary-50"
                                title="Renommer"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteGroup(g.id)}
                                className="rounded-lg p-1.5 text-danger transition-colors hover:bg-danger/10"
                                title="Supprimer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* LES GROUPES QUE PERSONNE NE RÉCLAME.
              Ce sont ceux d'avant que les groupes appartiennent à une
              catégorie, qu'aucun créneau n'utilise. Les cacher les rendrait
              introuvables : on les range d'ici, ou on les supprime. */}
          {unassignedGroups(db).length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
                Groupes sans catégorie ({unassignedGroups(db).length})
              </span>
              <p className="text-[10px] leading-relaxed text-muted">
                Ils datent d&apos;avant que les groupes appartiennent à une catégorie et
                aucun emploi du temps ne les utilise. Rangez-les, ou supprimez-les.
              </p>
              {unassignedGroups(db).map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-2"
                >
                  <span className="text-[11px] font-semibold text-ink">{g.name}</span>
                  <span className="flex items-center gap-1.5">
                    <Select
                      value=""
                      onChange={(e) => handleAssignGroup(g.id, e.target.value)}
                      className="text-[11px]"
                    >
                      <option value="">Ranger dans…</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {getClassName(c.id)}
                        </option>
                      ))}
                    </Select>
                    <button
                      onClick={() => handleDeleteGroup(g.id)}
                      className="rounded-lg p-1.5 text-danger transition-colors hover:bg-danger/10"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end border-t border-line pt-4">
          <Button onClick={() => setIsGroupsOpen(false)}>Fermer</Button>
        </div>
      </Modal>

      {/* Séance libre: create / edit a timing                             */}
      {/* ---------------------------------------------------------------- */}
      <Modal
        open={isOpenSeanceModalOpen}
        onClose={() => setIsOpenSeanceModalOpen(false)}
        title={editingOpenSession ? "Modifier le créneau de séance libre" : "Créer un créneau de séance libre"}
        wide
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ---- Left: what & who -------------------------------------- */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-muted font-sans">Module</label>
                <button onClick={() => setShowAddModule(!showAddModule)} className="text-xs text-primary hover:underline">
                  + Nouveau module
                </button>
              </div>
              {showAddModule ? (
                <div className="flex gap-2">
                  <Input
                    value={newModuleName}
                    onChange={(e) => setNewModuleName(e.target.value)}
                    placeholder="Nom du module"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newModuleName.trim()) return;
                      const newId = uid("mod");
                      push("modules", { id: newId, name: newModuleName });
                      setOpenModuleId(newId);
                      setNewModuleName("");
                      setShowAddModule(false);
                    }}
                  >
                    Créer
                  </Button>
                </div>
              ) : (
                <Select value={openModuleId} onChange={(e) => setOpenModuleId(e.target.value)} className="w-full">
                  <option value="">Sélectionner un module</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              )}
            </div>

            {/* Multi-selects: catégories / groupes / arènes */}
            {([
              { label: "Catégories concernées", items: classes.map((c) => ({ id: c.id, name: `${c.name} (${c.type === "cours" ? c.coursLevel : c.formationLevel})` })), selected: openClassIds, set: setOpenClassIds },
              { label: "Groupes concernés", items: groups, selected: openGroupIds, set: setOpenGroupIds },
              { label: "Arènes", items: salles, selected: openSalleIds, set: setOpenSalleIds },
            ] as const).map((block) => (
              <div key={block.label}>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-muted font-sans">{block.label}</label>
                  <span className="text-[10px] font-bold text-primary">{block.selected.length} sélectionné(s)</span>
                </div>
                <div className="border border-line rounded-xl max-h-32 overflow-y-auto p-1.5 bg-canvas/30 space-y-1">
                  {block.items.length === 0 ? (
                    <p className="text-[10px] text-muted italic p-2">Aucun élément disponible.</p>
                  ) : (
                    block.items.map((it) => {
                      const active = block.selected.includes(it.id);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => block.set(toggleIn(block.selected, it.id))}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            active ? "bg-primary text-white font-bold" : "hover:bg-primary-50 text-ink"
                          }`}
                        >
                          <span className="truncate">{it.name}</span>
                          <input type="checkbox" checked={active} readOnly className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ))}

            {/* Teacher: existing or passager */}
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5 font-sans">Entraîneur</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setOpenTeacherMode("existing")}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                    openTeacherMode === "existing" ? "border-primary bg-primary/10 text-primary" : "border-line bg-surface text-muted"
                  }`}
                >
                  Entraîneur existant
                </button>
                <button
                  type="button"
                  onClick={() => setOpenTeacherMode("passager")}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                    openTeacherMode === "passager" ? "border-primary bg-primary/10 text-primary" : "border-line bg-surface text-muted"
                  }`}
                >
                  Entraîneur passager
                </button>
              </div>

              {openTeacherMode === "existing" ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <Input
                      value={openTeacherSearch}
                      onChange={(e) => setOpenTeacherSearch(e.target.value)}
                      placeholder="Rechercher un entraîneur par nom..."
                      className="ps-9"
                    />
                  </div>
                  <div className="border border-line rounded-xl max-h-32 overflow-y-auto p-1.5 bg-canvas/30 space-y-1">
                    {teachers
                      .filter((t) =>
                        !openTeacherSearch ||
                        `${t.firstName} ${t.lastName} ${t.phone}`.toLowerCase().includes(openTeacherSearch.toLowerCase()),
                      )
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => { setOpenTeacherId(t.id); setOpenTeacherSearch(`${t.firstName} ${t.lastName}`); }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            openTeacherId === t.id ? "bg-primary text-white font-bold" : "hover:bg-primary-50 text-ink"
                          }`}
                        >
                          <span className="truncate">
                            {t.firstName} {t.lastName}
                            {t.isPassager && <span className="ms-1 opacity-70">(passager)</span>}
                          </span>
                          <span className={openTeacherId === t.id ? "text-white/80" : "text-muted"}>
                            {t.paymentType === "monthly"
                              ? "Par carte"
                              : t.paymentType === "per_group"
                                ? "Par groupe"
                                : `${t.percentage ?? 0}%`}
                          </span>
                        </button>
                      ))}
                  </div>
                  <p className="text-[10px] text-muted leading-relaxed">
                    L&apos;entraîneur est rémunéré sur cette séance libre exactement comme sur ses autres
                    séances (sa part est calculée à chaque présence selon son contrat).
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={openPassagerName}
                    onChange={(e) => setOpenPassagerName(e.target.value)}
                    placeholder="Nom complet de l'entraîneur passager"
                  />
                  <Input
                    value={openPassagerPhone}
                    onChange={(e) => setOpenPassagerPhone(e.target.value)}
                    placeholder="Téléphone (optionnel)"
                  />
                  <p className="text-[10px] text-muted leading-relaxed">
                    Il sera enregistré dans l&apos;interface <strong>Entraîneurs</strong> sans compte de connexion,
                    avec uniquement les actions <strong>Payer</strong> et <strong>Détails</strong>.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ---- Right: when & how much -------------------------------- */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1 font-sans">Début de la période *</label>
                <Input type="date" value={openPeriodStart} onChange={(e) => setOpenPeriodStart(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1 font-sans">Fin de la période *</label>
                <Input type="date" value={openPeriodEnd} onChange={(e) => setOpenPeriodEnd(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-2 font-sans">
                Jours d&apos;étude dans cette période *
              </label>
              {daysAvailableInPeriod.length === 0 ? (
                <p className="text-[10px] text-muted italic border border-dashed border-line rounded-xl p-3">
                  Choisissez d&apos;abord la période : seuls les jours réellement présents dans cet
                  intervalle seront proposés.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {WEEKDAYS.filter((d) => daysAvailableInPeriod.includes(d.key)).map((day) => {
                    const active = openDays.includes(day.key);
                    return (
                      <Button
                        key={day.key}
                        variant={active ? "primary" : "outline"}
                        onClick={() => setOpenDays(active ? openDays.filter((d) => d !== day.key) : [...openDays, day.key])}
                        size="sm"
                        className="w-full text-start py-2 justify-between"
                      >
                        <span>{day.label}</span>
                        {active && <span className="text-[10px] bg-white/25 px-1.5 rounded">✔</span>}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1 font-sans">Heure de début</label>
                <div className="flex gap-1.5">
                  <Select value={openStartHour} onChange={(e) => setOpenStartHour(e.target.value)} className="flex-1">
                    {getHours().map((h) => <option key={h} value={h}>{h} H</option>)}
                  </Select>
                  <Select value={openStartMin} onChange={(e) => setOpenStartMin(e.target.value)} className="flex-1">
                    {getMinutes().map((m) => <option key={m} value={m}>{m} Min</option>)}
                  </Select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1 font-sans">Heure de fin</label>
                <div className="flex gap-1.5">
                  <Select value={openEndHour} onChange={(e) => setOpenEndHour(e.target.value)} className="flex-1">
                    {getHours().map((h) => <option key={h} value={h}>{h} H</option>)}
                  </Select>
                  <Select value={openEndMin} onChange={(e) => setOpenEndMin(e.target.value)} className="flex-1">
                    {getMinutes().map((m) => <option key={m} value={m}>{m} Min</option>)}
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1 font-sans">Prix d&apos;une séance (DA)</label>
              <Input
                type="number"
                min={0}
                value={openPrice || ""}
                onChange={(e) => setOpenPrice(Number(e.target.value))}
                placeholder="Ex: 800"
              />
              <p className="text-[10px] text-muted mt-1 leading-relaxed">
                Un abonnement est créé automatiquement à ce tarif : le créneau apparaîtra dans
                l&apos;interface <strong>Abonnements</strong> comme s&apos;il y avait été saisi à la main.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1 font-sans">Nom du créneau</label>
              <Input
                value={openTitleOverride}
                onChange={(e) => setOpenTitleOverride(e.target.value)}
                placeholder={buildOpenTitle()}
              />
              <div className="bg-canvas/50 border border-line rounded-xl p-3 text-xs mt-2">
                <span className="text-[10px] text-muted block font-semibold mb-1 font-sans">Nom enregistré</span>
                <div className="font-bold text-ink break-words">{openTitleOverride.trim() || buildOpenTitle()}</div>
                {openSeanceCount > 0 && (
                  <div className="text-[10px] text-muted mt-1.5">
                    {openSeanceCount} séance(s) sur la période · {openClassIds.length} catégorie(s) ·{" "}
                    {openGroupIds.length} groupe(s) · {openSalleIds.length} arène(s)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-6 mt-4 border-t border-line">
          <Button variant="outline" onClick={() => setIsOpenSeanceModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSaveOpenSeance} disabled={savingOpenSeance}>
            {savingOpenSeance ? "Enregistrement..." : editingOpenSession ? "Enregistrer" : "Créer le créneau"}
          </Button>
        </div>
      </Modal>

      {/* ---- CRÉER UN EMPLOI DU TEMPS ------------------------------------
           Un écran plein, et cinq cadres numérotés : le groupe, les séances,
           l'arène et l'entraîneur, le tarif, l'engagement. Le bandeau du haut
           ne bouge pas et dit, à tout instant, ce que le créneau est en train
           de devenir — nom composé, jours, séances, arène, entraîneur, carte.
           Les boutons vivent en bas du cadre, toujours à portée. */}
      <Modal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Créer un nouvel emploi du temps"
        full
        footer={
          <>
            <span className="me-auto hidden text-[10px] leading-snug text-muted sm:block">
              Seuls les JOURS sont obligatoires — tout le reste se complète plus tard.
            </span>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateSession} className="gap-1.5">
              <Plus className="h-4 w-4" /> Créer l&apos;emploi du temps
            </Button>
          </>
        }
      >
        {renderSessionForm()}
      </Modal>

      {/* ---- MODIFIER UN EMPLOI DU TEMPS ----------------------------------
           Exactement le même formulaire : ce sont les mêmes décisions, et les
           tenir en double laissait fatalement l'une des deux dériver. */}
      <Modal
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Modifier l'emploi du temps"
        full
        footer={
          <>
            <span className="me-auto hidden text-[10px] leading-snug text-muted sm:block">
              Les présences déjà pointées ne bougent pas : seul le créneau à venir change.
            </span>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleEditSession} className="gap-1.5">
              <Edit className="h-4 w-4" /> Enregistrer
            </Button>
          </>
        }
      >
        {renderSessionForm()}
      </Modal>

      {/* Details Modal */}
      <Modal open={isDetailsOpen} onClose={() => setIsDetailsOpen(false)} title="Détails de l'emploi du temps" wide>
        {selectedSession && (
          <div className="space-y-6">
            {selectedSession.isOpen && (
              <div className="rounded-xl border border-primary/25 bg-primary-50/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] text-primary block uppercase font-bold tracking-wider">
                      🎯 Créneau Séance Libre
                    </span>
                    <strong className="text-ink block text-sm break-words">{sessionTitle(selectedSession)}</strong>
                  </div>
                  <Badge tone={openSessionActive(selectedSession) ? "success" : "neutral"} className="font-bold">
                    {formatDateFr(selectedSession.periodStart)} → {formatDateFr(selectedSession.periodEnd)}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-muted block uppercase">Tarif séance</span>
                    <strong className="text-primary">{formatDA(openSessionPrice(selectedSession))}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block uppercase">Catégories</span>
                    <strong className="text-ink">
                      {(selectedSession.classIds ?? [selectedSession.classId]).map(getClassName).join(" · ")}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block uppercase">Groupes</span>
                    <strong className="text-ink">
                      {sessionGroupIds(selectedSession).map(getGroupName).join(" · ")}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted block uppercase">Arènes</span>
                    <strong className="text-ink">
                      {(selectedSession.salleIds ?? [selectedSession.salleId]).map(getSalleName).join(" · ")}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-primary-50/50 rounded-xl p-4 border border-line">
              {selectedSession.title && (
                <div className="col-span-2 md:col-span-4">
                  <span className="text-[10px] text-muted block uppercase font-sans">Nom du créneau</span>
                  <span className="font-bold text-ink">{selectedSession.title}</span>
                </div>
              )}
              {/* Le module n'est plus demandé à la création : il ne s'affiche
                  donc que sur les emplois qui en portent encore un. */}
              {selectedSession.moduleId && (
                <div>
                  <span className="text-[10px] text-muted block uppercase font-sans">Module / Matière</span>
                  <span className="font-bold text-ink">{getModuleName(selectedSession.moduleId)}</span>
                </div>
              )}
              <div>
                <span className="text-[10px] text-muted block uppercase font-sans">Catégorie & Niveau</span>
                <span className="font-semibold text-ink">
                  {sessionClassIds(selectedSession).map(getClassName).join(" + ") || "—"}
                </span>
                {isMultiLevelSession(selectedSession) && (
                  <Badge tone="primary" className="mt-1 text-[9px]">
                    {sessionClassIds(selectedSession).length} niveaux réunis
                  </Badge>
                )}
              </div>
              <div>
                <span className="text-[10px] text-muted block uppercase font-sans">
                  Groupe(s) / Arène
                </span>
                <span className="font-semibold text-ink">
                  {sessionGroupIds(selectedSession).map(getGroupName).join(" · ") || "—"} -{" "}
                  {getSalleName(selectedSession.salleId)}
                </span>
                {/* Multi-niveaux : chaque niveau amène SES groupes, et c'est ce
                    découpage-là qu'il faut pouvoir relire. */}
                {isMultiLevelSession(selectedSession) && (
                  <span className="mt-1 block space-y-0.5">
                    {sessionClassIds(selectedSession).map((cid) => (
                      <span key={cid} className="block text-[10px] text-muted">
                        <strong className="text-ink">{getClassName(cid)}</strong> :{" "}
                        {sessionGroupsOfClass(selectedSession, cid).map(getGroupName).join(" · ") ||
                          "aucun groupe"}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] text-muted block uppercase font-sans">Entraîneur</span>
                <span className="font-semibold text-ink">
                  {getTeacherName(selectedSession.teacherId)}
                  {teachers.find((t) => t.id === selectedSession.teacherId)?.isPassager && (
                    <Badge tone="warning" className="ms-1.5 text-[9px]">Passager</Badge>
                  )}
                </span>
              </div>
            </div>

            {/* Tarif — what the emploi costs, and how it is split. */}
            {(() => {
              const sub = subscriptions.find((x) => x.sessionId === selectedSession.id);
              if (!sub) {
                return (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning">
                    Aucun tarif défini pour cet emploi du temps — modifiez-le pour en fixer un.
                  </div>
                );
              }
              return (
                <div className="rounded-xl border border-primary/25 bg-primary-50/30 p-4">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-primary">
                    💰 Tarif de l&apos;emploi du temps
                  </span>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                    <div>
                      <span className="block text-[10px] uppercase text-muted">Séances / carte</span>
                      <strong className="text-ink">{sub.monthlySeances ?? 0}</strong>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-muted">Prix de la carte</span>
                      <strong className="text-ink">{formatDA(monthlyPriceOf(sub))}</strong>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-muted">Prix / séance</span>
                      <strong className="text-primary">{formatDA(sub.pricePerSession)}</strong>
                    </div>
                    {/* LE TRANSPORT : prélevé avant le partage, et suivi à part
                        dans les rapports. Il ne s'affiche que s'il existe — un
                        créneau sans ramassage n'a pas de ligne à zéro. */}
                    {transportMonthShareOf(sub) > 0 && (
                      <div>
                        <span className="block text-[10px] uppercase text-muted">
                          Transport (carte / séance)
                        </span>
                        <strong className="text-accent-ink">
                          {formatDA(transportMonthShareOf(sub))} ·{" "}
                          {formatDA(transportPerSeanceOf(sub))}
                        </strong>
                      </div>
                    )}
                    <div>
                      <span className="block text-[10px] uppercase text-muted">Part club</span>
                      <strong className="text-ink">
                        {formatDA(schoolMonthShareOf(sub))} · {formatDA(schoolPerSeanceOf(sub))}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-muted">
                        Entraîneur (carte / séance)
                      </span>
                      <strong className="text-success">
                        {formatDA(teacherMonthShareOf(sub))} · {formatDA(teacherPerSeanceOf(sub))}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-bold text-ink mb-2.5 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" /> Jours & Horaires
                </h4>
                <div className="bg-surface border border-line p-4 rounded-xl space-y-3">
                  {/* One line per day: an emploi may run at different hours
                      depending on the weekday. */}
                  <div>
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
                      <span className="text-[10px] text-muted font-sans">
                        Jours programmés et horaires:
                      </span>
                      <Badge tone="neutral" className="text-[9px] font-bold">
                        {weeklySeanceCount(selectedSession)} séance(s) / semaine
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {WEEKDAYS.filter((wd) => selectedSession.days.includes(wd.key)).map((wd) => {
                        // Une journée peut tenir DEUX séances : elles se lisent
                        // l'une sous l'autre, numérotées, plutôt qu'écrasées en
                        // un seul horaire.
                        const slots = sessionSlotsOn(selectedSession, wd.key);
                        return (
                          <div
                            key={wd.key}
                            className="border-b border-line/60 pb-1.5 last:border-0 last:pb-0"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <Badge tone="primary" className="uppercase text-[9px] font-bold">
                                {wd.label}
                              </Badge>
                              {slots.length === 1 && (
                                <strong className="text-primary font-bold font-mono">
                                  {slots[0].startTime} – {slots[0].endTime}
                                </strong>
                              )}
                            </div>
                            {slots.length > 1 && (
                              <div className="mt-1 space-y-0.5 ps-1">
                                {slots.map((t, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between gap-2 text-[11px]"
                                  >
                                    <span className="font-semibold text-muted">
                                      Séance {slotLabel(i)}
                                    </span>
                                    <strong className="text-primary font-bold font-mono">
                                      {t.startTime} – {t.endTime}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {selectedSession.days.length === 0 && (
                        <span className="text-xs text-muted">Aucun jour programmé.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-ink mb-2.5 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" /> Chevaliers Inscrits ({getSessionStudents(selectedSession.id).length})
                </h4>
                <div className="bg-surface border border-line p-3 rounded-xl max-h-48 overflow-y-auto space-y-2">
                  {getSessionStudents(selectedSession.id).length === 0 ? (
                    <p className="text-xs text-muted italic p-4 text-center">Aucun chevalier inscrit à cet emploi du temps.</p>
                  ) : (
                    getSessionStudents(selectedSession.id).map((stu) => (
                      <div key={stu.id} className="flex justify-between items-center text-xs bg-canvas/30 p-2.5 rounded-lg border border-line/50">
                        <div>
                          <span className="font-bold text-ink block">{stu.firstName} {stu.lastName}</span>
                          <span className="text-[10px] text-muted">{stu.phone}</span>
                        </div>
                        {(() => {
                          const sub = subscriptions.find((x) => x.sessionId === selectedSession.id);
                          const sold = sub ? soldFor(db, stu.id, sub.id) : 0;
                          // La gratuité se coche emploi par emploi : c'est CET
                          // emploi-là qui est offert, ou non.
                          const offered = isFreeSub(stu, sub?.id);
                          return (
                            <Badge
                              tone={offered ? "success" : sold < 0 ? "danger" : sold === 0 ? "warning" : "primary"}
                              className="font-bold"
                            >
                              {offered ? "Gratuit" : `Solde ${formatDA(sold)}`}
                            </Badge>
                          );
                        })()}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Admin actions block */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-line">
              <div className="flex gap-2">
                <Button variant="outline" className="flex items-center gap-1 text-xs text-ink" onClick={() => handlePrintSession(selectedSession)}>
                  <Printer className="h-4 w-4" /> Imprimer
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-1 text-xs text-ink"
                  onClick={() => (selectedSession.isOpen ? openEditOpenSeance(selectedSession) : openEdit(selectedSession))}
                >
                  <Edit className="h-4 w-4" /> Modifier
                </Button>
                <Button variant="outline" className="flex items-center gap-1 text-xs text-danger border-danger/20 hover:bg-danger/5" onClick={() => handleDelete(selectedSession.id)}>
                  <Trash2 className="h-4 w-4 text-danger" /> Supprimer l&apos;emploi du temps
                </Button>
              </div>
              <Button onClick={() => setIsDetailsOpen(false)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
