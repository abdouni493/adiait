/**
 * L'ARABE DE L'APPLICATION — indexé par la phrase FRANÇAISE elle-même.
 *
 * POURQUOI PAS DES CLÉS ? Parce que l'application a été écrite en français
 * directement dans les écrans : « Présences », « Ajouter un chevalier »,
 * « Aucun résultat » sont des littéraux, pas des identifiants. Les remplacer un
 * par un par des clés inventées aurait demandé de réécrire des milliers de
 * lignes, et chaque oubli aurait laissé un `nav.students` cru à l'écran.
 *
 * Ici, LA CLÉ EST LA PHRASE. Un texte que ce dictionnaire ne connaît pas
 * revient tel quel, en français : rien ne casse, rien n'affiche de code, et la
 * couverture s'étend simplement en ajoutant des lignes ci-dessous.
 *
 * OÙ CELA S'APPLIQUE : dans les composants PARTAGÉS — l'en-tête d'écran, les
 * boîtes de dialogue, les boutons, les champs, les onglets, les cartes de
 * chiffres, les états vides. C'est le goulot par lequel passe presque tout le
 * texte de l'application, si bien qu'une seule traduction sert partout.
 *
 * La comparaison ignore les espaces de bord et les apostrophes typographiques,
 * parce que le même mot s'écrit « l'Ordre » ici et « l'Ordre » là.
 */

/** Normalise une phrase pour la recherche : espaces, apostrophes, insécables. */
export function phraseKey(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * LE DICTIONNAIRE FRANÇAIS → ARABE.
 *
 * Il couvre le vocabulaire de l'Ordre — les écrans, les actions, les états, les
 * colonnes de tableaux, les phrases d'attente — et grandit ligne à ligne.
 */
const AR: Record<string, string> = {
  // ---- Écrans (titres et sous-titres d'en-tête) ---------------------------
  "Tableau de bord": "لوحة التحكم",
  "Emplois du temps du jour, fiches de présence et caisse":
    "جداول اليوم، أوراق الحضور والصندوق",
  "Emploi du Temps": "جدول التوقيت",
  "Visualisation du calendrier hebdomadaire et planification":
    "عرض الرزنامة الأسبوعية والتخطيط",
  "Présences": "الحضور",
  "Pointage des emplois du temps, carte par carte": "تسجيل الحضور، بطاقة ببطاقة",
  "Chevaliers": "الفرسان",
  "Gérer les inscriptions et les cartes des chevaliers": "إدارة التسجيلات وبطاقات الفرسان",
  "Entraîneurs": "المدرّبون",
  "Gérer les entraîneurs, leurs parts et leur paie": "إدارة المدرّبين وحصصهم وأجورهم",
  "Catégories": "الفئات",
  "Les catégories de l'Ordre et la tranche d'âge que chacune accueille":
    "فئات الوسام والفئة العمرية التي تستقبلها كل واحدة",
  "Parents": "أولياء الأمور",
  "Gérer les comptes des tuteurs de chevaliers": "إدارة حسابات أولياء الفرسان",
  "Travailleurs": "الموظفون",
  "Le personnel : métiers, comptes, droits d'accès, acomptes, absences et paie":
    "الموظفون: المهن، الحسابات، الصلاحيات، التسبيقات، الغيابات والأجور",
  "Séances libres": "الحصص الحرة",
  "Enregistrer les séances ponctuelles des chevaliers inscrits et des passagers":
    "تسجيل الحصص الظرفية للفرسان المسجلين والعابرين",
  "Annonces": "الإعلانات",
  "Publier des annonces ciblées par groupe, rôle ou club entier":
    "نشر إعلانات موجّهة حسب الفوج أو الدور أو النادي كاملاً",
  "Dépenses": "المصاريف",
  "Suivi des frais de fonctionnement du club": "متابعة مصاريف تسيير النادي",
  "Caisse": "الصندوق",
  "Suivi des flux de trésorerie en temps réel": "متابعة حركة الأموال في الوقت الحقيقي",
  "Statistiques": "الإحصائيات",
  "Suivi de l'affluence des chevaliers par catégorie et par entraîneur":
    "متابعة إقبال الفرسان حسب الفئة وحسب المدرّب",
  "Rapports financiers": "التقارير المالية",
  "Chaque interface de l'application, dans le détail : les chiffres, leur calcul, et la liste derrière chaque chiffre":
    "كل واجهة من التطبيق بالتفصيل: الأرقام، طريقة حسابها، والقائمة وراء كل رقم",
  "Paramètres": "الإعدادات",
  "Configuration générale, sécurité et maintenance du système":
    "الإعدادات العامة والأمان وصيانة النظام",
  "Mon emploi du temps": "جدولي",
  "Mon Emploi du Temps": "جدولي",
  "Mes présences": "حضوري",
  "Mes chevaliers": "فرساني",
  "Mon Profil Parent": "ملفي كولي أمر",
  "Mon Profil Chevalier": "ملفي كفارس",
  "Mon Profil Entraîneur": "ملفي كمدرّب",
  "Notifications & Alertes": "الإشعارات والتنبيهات",
  "Annonces Administratives": "إعلانات الإدارة",
  "Historique des paiements": "سجل المدفوعات",
  "Historique de mes paiements": "سجل مدفوعاتي",
  "Appel & Présences": "المناداة والحضور",
  "Mes catégories & groupes": "فئاتي وأفواجي",
  "Planning des Cours": "برنامج الحصص",

  // ---- Actions ------------------------------------------------------------
  "Créer": "إنشاء",
  "Modifier": "تعديل",
  "Supprimer": "حذف",
  "Voir": "عرض",
  "Enregistrer": "حفظ",
  "Annuler": "إلغاء",
  "Confirmer": "تأكيد",
  "Fermer": "إغلاق",
  "Ajouter": "إضافة",
  "Imprimer": "طباعة",
  "Rechercher": "بحث",
  "Retirer": "إزالة",
  "Retour": "رجوع",
  "Valider": "تأكيد",
  "Payer": "دفع",
  "Encaisser": "تحصيل",
  "Envoyer": "إرسال",
  "Générer": "إنشاء",
  "Actualiser": "تحديث",
  "Aujourd'hui": "اليوم",
  "Tout sélectionner": "تحديد الكل",
  "Tout désélectionner": "إلغاء تحديد الكل",
  "Nouveau chevalier": "فارس جديد",
  "Chevalier existant": "فارس مسجّل",
  "Chevalier passager": "فارس عابر",
  "Tout présent": "الكل حاضر",
  "Séance annulée pour tous": "الحصة ملغاة للجميع",
  "Feuille de présence": "ورقة الحضور",
  "Historique": "السجل",
  "Détails": "التفاصيل",
  "Actions": "الإجراءات",

  // ---- Emploi du temps ----------------------------------------------------
  "Créer un nouvel emploi du temps": "إنشاء جدول توقيت جديد",
  "Modifier l'emploi du temps": "تعديل جدول التوقيت",
  "Détails de l'emploi du temps": "تفاصيل جدول التوقيت",
  "Créer l'emploi du temps": "إنشاء الجدول",
  "Le groupe": "الفوج",
  "Les séances": "الحصص",
  "L'arène & l'entraîneur": "الحلبة والمدرّب",
  "Le tarif de la carte": "سعر البطاقة",
  "L'engagement": "الانخراط",
  "Qui s'entraîne : la ou les catégories, et leurs groupes.":
    "من يتدرّب: الفئة أو الفئات، وأفواجها.",
  "Quand : les jours, et l'horaire de chaque séance — un jour peut en tenir deux.":
    "متى: الأيام، وتوقيت كل حصة — يمكن لليوم أن يحتوي حصتين.",
  "Où, et avec qui. L'entraîneur se crée ici s'il n'existe pas encore.":
    "أين ومع من. يُنشأ المدرّب هنا إن لم يكن موجوداً بعد.",
  "Combien coûte une carte, et comment son prix se coupe : transport, club, entraîneur.":
    "كم تكلّف البطاقة، وكيف يُقسَّم سعرها: النقل، النادي، المدرّب.",
  "Le frais d'entrée de CE créneau : tenue, équipement, assurance du groupe.":
    "رسوم الالتحاق بهذا التوقيت: اللباس، التجهيزات، تأمين الفوج.",
  "Nom enregistré": "الاسم المسجَّل",
  "Niveau(x)": "المستوى/المستويات",
  "Groupe(s)": "الفوج/الأفواج",
  "Séances": "الحصص",
  "Arène": "الحلبة",
  "Entraîneur": "المدرّب",
  "Carte": "البطاقة",
  "à choisir": "للاختيار",
  "sans tarif": "بدون سعر",
  "aucun jour": "لا يوجد يوم",
  "aucun": "لا شيء",
  "réglé": "مضبوط",
  "tarifé": "مسعَّر",
  "à compléter": "للإكمال",
  "Jours de cours": "أيام التدريب",
  "Séances de chaque jour": "حصص كل يوم",
  "Séances du jour": "حصص اليوم",
  "Début": "البداية",
  "Fin": "النهاية",
  "Horaire": "التوقيت",
  "+ Ajouter une séance": "+ إضافة حصة",
  "+ Nouvel entraîneur": "+ مدرّب جديد",
  "+ Nouveau groupe": "+ فوج جديد",
  "+ Nouvelle arène": "+ حلبة جديدة",
  "Créer et choisir cet entraîneur": "إنشاء واختيار هذا المدرّب",
  "Comment il est payé": "كيف يُدفع له",
  "Un seul niveau": "مستوى واحد",
  "Plusieurs niveaux": "عدة مستويات",
  "Catégorie": "الفئة",
  "Sélectionner une catégorie": "اختر فئة",
  "Nom de l'emploi du temps (optionnel)": "اسم الجدول (اختياري)",
  "Nombre de séances de la carte *": "عدد حصص البطاقة *",
  "Prix total de la carte (DA) *": "السعر الإجمالي للبطاقة (دج) *",
  "Prix d'une séance (calculé)": "سعر الحصة (محسوب)",
  "Répartition du prix de la carte": "توزيع سعر البطاقة",
  "1 · Part du transport sur la carte (DA)": "1 · حصة النقل من البطاقة (دج)",
  "2 · Part du club sur le reste (DA)": "2 · حصة النادي من الباقي (دج)",
  "3 · Reste pour l'entraîneur (calculé)": "3 · الباقي للمدرّب (محسوب)",
  "Transport (calculé)": "النقل (محسوب)",
  "Séance payée à l'entraîneur (calculé)": "الحصة المدفوعة للمدرّب (محسوبة)",
  "Montant de l'engagement (DA)": "مبلغ الانخراط (دج)",
  "Description de l'engagement": "وصف الانخراط",

  // ---- Transport ----------------------------------------------------------
  "Transport": "النقل",
  "Ce que le ramassage prend sur chaque carte, groupe par groupe — et ce qu'il coûte en tout.":
    "ما يأخذه النقل من كل بطاقة، فوجاً بفوج — وكم يكلّف إجمالاً.",
  "Transport sur la période": "النقل خلال الفترة",
  "Transport d'une carte complète": "نقل بطاقة كاملة",
  "Coût total des groupes transportés": "التكلفة الإجمالية للأفواج المنقولة",
  "Poids du transport": "وزن النقل",
  "Le transport, groupe par groupe": "النقل، فوجاً بفوج",
  "Groupe / emploi du temps": "الفوج / الجدول",
  "Prix de la carte": "سعر البطاقة",
  "Transport / carte": "النقل / البطاقة",
  "Coût total du groupe": "التكلفة الإجمالية للفوج",
  "Transport du groupe": "نقل الفوج",
  "Sur la période": "خلال الفترة",

  // ---- Champs -------------------------------------------------------------
  "Prénom": "الاسم",
  "Nom": "اللقب",
  "Nom complet": "الاسم الكامل",
  "Téléphone": "الهاتف",
  "Email": "البريد الإلكتروني",
  "Adresse": "العنوان",
  "Date de naissance": "تاريخ الميلاد",
  "Date": "التاريخ",
  "Du": "من",
  "Au": "إلى",
  "Montant": "المبلغ",
  "Description": "الوصف",
  "Prix": "السعر",
  "Statut": "الحالة",
  "Groupe": "الفوج",
  "Module": "المادة",
  "Solde": "الرصيد",
  "Mot de passe": "كلمة المرور",
  "Heure de début": "وقت البداية",
  "Heure de fin": "وقت النهاية",

  // ---- États --------------------------------------------------------------
  "Présent": "حاضر",
  "Absent": "غائب",
  "Retard": "متأخر",
  "Annulée": "ملغاة",
  "Payé": "مدفوع",
  "Impayé": "غير مدفوع",
  "Dette": "دَين",
  "À jour": "محدَّث",
  "Gratuit": "مجاني",
  "Actif": "نشط",
  "En attente": "قيد الانتظار",
  "Disponible": "متاحة",
  "Occupée": "مشغولة",
  "Aucun résultat": "لا توجد نتائج",
  "Aucune donnée": "لا توجد بيانات",
  "Chargement…": "جارٍ التحميل…",
  "Total": "المجموع",

  // ---- Connexion ----------------------------------------------------------
  "Créer mon compte": "إنشاء حسابي",
  "Vous n'avez pas encore de compte ?": "ليس لديك حساب بعد؟",
  "Retour à la connexion": "العودة لتسجيل الدخول",
  "Créer le compte administrateur": "إنشاء حساب المدير",
  "Compte administrateur": "حساب المدير",
  "Créer le compte": "إنشاء الحساب",
  "Création…": "جارٍ الإنشاء…",
  "Vérification du club…": "جارٍ التحقق من النادي…",
  "Nom affiché (Direction)": "الاسم المعروض (الإدارة)",
  "Email de connexion": "بريد تسجيل الدخول",
  "Mot de passe (6 caractères minimum)": "كلمة المرور (6 أحرف على الأقل)",
  "Confirmer le mot de passe": "تأكيد كلمة المرور",
  "L'email est obligatoire.": "البريد الإلكتروني إجباري.",
  "Le mot de passe doit contenir au moins 6 caractères.":
    "يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل.",
  "Les deux mots de passe ne sont pas identiques.": "كلمتا المرور غير متطابقتين.",
  "La création du compte a échoué.": "فشل إنشاء الحساب.",

  // ---- « Créer mon compte » — la porte des familles ----------------------
  "Votre compte est créé": "تم إنشاء حسابك",
  "Aller à la connexion": "الذهاب إلى تسجيل الدخول",
  "Un compte vous donne accès, depuis votre téléphone, à tout ce que le comptoir sait de vous. Dites-nous d'abord qui vous êtes.":
    "يمنحك الحساب اطّلاعاً، من هاتفك، على كل ما يعرفه النادي عنك. أخبرنا أولاً من أنت.",
  "Connectez-vous dès maintenant avec cet email et le mot de passe que vous venez de choisir. Vous verrez d'abord un écran d'attente : l'intendance du club doit rattacher votre compte à votre fiche avant que vos séances, vos présences et vos paiements s'affichent.":
    "سجّل الدخول الآن بهذا البريد وكلمة المرور التي اخترتها. ستظهر لك أولاً شاشة انتظار: على إدارة النادي ربط حسابك بملفك قبل أن تُعرض حصصك وحضورك ومدفوعاتك.",
  "Je suis chevalier": "أنا فارس",
  "Voir mes abonnements, mes présences, mes absences, mes paiements et les annonces du club.":
    "الاطّلاع على بطاقاتي وحضوري وغياباتي ومدفوعاتي وإعلانات النادي.",
  "Je suis parent": "أنا ولي أمر",
  "Inscrire mes fils et suivre leurs présences, leurs absences, leurs paiements et les annonces.":
    "تسجيل أبنائي ومتابعة حضورهم وغياباتهم ومدفوعاتهم والإعلانات.",
  "Revenir au choix": "العودة إلى الاختيار",
  "Compte parent": "حساب ولي الأمر",
  "Compte chevalier": "حساب الفارس",
  "Informations personnelles": "المعلومات الشخصية",
  "Identifiants de connexion": "بيانات تسجيل الدخول",
  "Deuxième téléphone (optionnel)": "هاتف ثانٍ (اختياري)",
  "Adresse (optionnel)": "العنوان (اختياري)",
  "Téléphone (optionnel)": "الهاتف (اختياري)",
  "6 caractères minimum": "6 أحرف على الأقل",
  "Le même, une seconde fois": "نفسها، مرة ثانية",
  "Cité, rue, ville": "الحي، الشارع، المدينة",
  "Êtes-vous déjà connu du club ?": "هل النادي يعرفك مسبقاً؟",
  "Je suis déjà connu du club — je veux seulement mon accès":
    "النادي يعرفني مسبقاً — أريد فقط فتح حسابي",
  "Je suis déjà inscrit — je veux seulement activer mon accès":
    "أنا مسجّل مسبقاً — أريد فقط تفعيل حسابي",
  "Votre fiche existe déjà au club. L'intendance retrouvera votre dossier grâce à votre numéro de téléphone et y rattachera ce compte.":
    "ملفك موجود سلفاً في النادي. ستعثر الإدارة على ملفك برقم هاتفك وتربط به هذا الحساب.",
  "C'est ma première inscription": "هذا أول تسجيل لي",
  "Vous n'êtes pas encore inscrit au club. L'intendance créera votre fiche à partir de cette demande et vous placera dans une catégorie.":
    "أنت غير مسجّل بعد في النادي. ستُنشئ الإدارة ملفك انطلاقاً من هذا الطلب وتضعك في فئة.",
  "Vos fils sont-ils déjà inscrits au club ?": "هل أبناؤك مسجّلون في النادي؟",
  "Oui, ils le sont": "نعم، مسجّلون",
  "Non, pas encore": "لا، ليس بعد",
  "Parfait — inutile de les ressaisir. L'intendance retrouvera leurs fiches et les rattachera à votre compte.":
    "ممتاز — لا داعي لإعادة إدخالهم. ستعثر الإدارة على ملفاتهم وتربطها بحسابك.",
  "Décrivez chacun de vos fils. Ils n'ont ni email ni mot de passe : c'est votre compte qui les suit.":
    "صِف كل واحد من أبنائك. ليس لهم بريد ولا كلمة مرور: حسابك أنت هو الذي يتابعهم.",
  "Fils": "الابن",
  "Ajouter un autre fils": "إضافة ابن آخر",
  "Votre compte sera créé tout de suite et vous pourrez vous connecter — mais il n'affichera vos données qu'une fois ACTIVÉ PAR L'INTENDANCE du club.":
    "سيُنشأ حسابك فوراً وستتمكّن من تسجيل الدخول — لكنه لن يعرض بياناتك إلا بعد أن تُفعّله إدارة النادي.",
  "Indiquez au moins un nom ou un prénom.": "أدخل على الأقل اسماً أو لقباً.",
  "Le téléphone est obligatoire : c'est lui qui permet de vous retrouver au club.":
    "الهاتف إجباري: به يُعثر عليك في النادي.",
  "L'email est obligatoire — c'est votre identifiant de connexion.":
    "البريد الإلكتروني إجباري — وهو معرّف دخولك.",
  "Dites-nous si vous êtes déjà inscrit au club, ou si c'est votre première inscription.":
    "أخبرنا إن كنت مسجّلاً مسبقاً في النادي، أو إن كان هذا أول تسجيل لك.",
  "Dites-nous si vous êtes déjà connu du club, ou si c'est votre première venue.":
    "أخبرنا إن كان النادي يعرفك مسبقاً، أو إن كانت هذه زيارتك الأولى.",
  "Dites-nous si vos fils sont déjà inscrits au club.":
    "أخبرنا إن كان أبناؤك مسجّلين في النادي.",
  "Indiquez au moins un fils, ou dites qu'ils sont déjà inscrits au club.":
    "أدخل ابناً واحداً على الأقل، أو أخبرنا أنهم مسجّلون مسبقاً في النادي.",
};

/**
 * La phrase, dans la langue demandée.
 *
 * Le français est rendu tel quel — c'est la langue SOURCE de l'application, et
 * la traverser par un dictionnaire ne ferait que coûter une recherche. En
 * arabe, une phrase inconnue revient elle aussi telle quelle : mieux vaut un
 * mot en français qu'un identifiant cru à l'écran.
 */
export function phrase(language: "fr" | "ar", text: string): string {
  if (language !== "ar") return text;
  return AR[phraseKey(text)] ?? text;
}

/** Combien de phrases le dictionnaire arabe couvre — lu par les tests. */
export const AR_PHRASE_COUNT = Object.keys(AR).length;
