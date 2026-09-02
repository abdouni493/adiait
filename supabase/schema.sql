-- =============================================================================
--  ORDRE DES CHEVALIERS — SCHÉMA COMPLET SUPABASE
-- =============================================================================
--
--  Ce fichier est le SEUL script à exécuter sur un projet Supabase neuf.
--  Il est IDEMPOTENT : le relancer sur une base déjà installée ne casse rien.
--
--  À exécuter dans : Supabase Dashboard -> SQL Editor -> New query -> Run.
--
--  CE QU'IL INSTALLE, DANS L'ORDRE
--
--   1. Les extensions (pgcrypto : c'est lui qui chiffre les mots de passe).
--   2. `public.profiles` — le pont entre `auth.users` et les fiches métier.
--   3. LE CATALOGUE DES DROITS : `app_pages` (les 18 écrans) et
--      `app_page_actions` (les 101 boutons), recopiés de `lib/permissions.ts`.
--      C'est la table de vérité que l'écran « Droits d'accès » présente.
--   4. Les 42 tables métier — une par collection du magasin (`lib/store/data.ts`),
--      avec TOUTES leurs relations. Deux d'entre elles servent LE SITE PUBLIC :
--      `website_formations` (lisible sans compte) et `formation_enrollments`.
--   5. Les fonctions de garde (qui suis-je, qu'ai-je le droit d'écrire).
--   6. La RLS : une politique de lecture et une d'écriture par table.
--   7. LES COMPTES : créer l'administrateur, créer un travailleur, changer un
--      mot de passe — le tout DIRECTEMENT dans `auth.users`, pour que la
--      connexion Supabase normale (email + mot de passe) fonctionne.
--   8. Le bucket de stockage `logos` et ses politiques.
--
--  UNE CONVENTION IMPORTANTE : LES DATES SONT DU TEXTE.
--
--  L'application manipule partout des chaînes — « 2026-08-28 », « 14:30 »,
--  « 2026-08-28T13:05:00.000Z ». Les stocker en `date`/`timestamptz` les
--  reformaterait au retour ("+00:00" au lieu de "Z"), et la réplication
--  croirait à une modification à chaque lecture. Elles sont donc en `text`,
--  et reviennent à l'octet près telles qu'elles sont parties.
--
--  LES IDENTIFIANTS SONT DU TEXTE AUSSI : une fiche créée sans compte porte un
--  identifiant fabriqué par l'application (« stu-mf3k2a-9c1b »), tandis qu'une
--  fiche créée AVEC un compte porte l'UUID de son compte `auth.users`. Les deux
--  doivent tenir dans la même colonne.
-- =============================================================================


-- =============================================================================
--  1. EXTENSIONS
-- =============================================================================

-- pgcrypto chiffre les mots de passe (`crypt`, `gen_salt`). Supabase l'installe
-- déjà dans le schéma `extensions` ; la ligne ne sert qu'aux projets où il
-- manquerait. Les fonctions qui s'en servent portent `extensions` dans leur
-- `search_path`, et ne le qualifient donc pas : d'un projet à l'autre il n'est
-- pas toujours dans le même schéma.
create extension if not exists pgcrypto with schema extensions;


-- =============================================================================
--  2. LES COMPTES — `public.profiles`
-- =============================================================================
--
--  `auth.users` appartient à Supabase et ne se lit pas depuis le navigateur.
--  `profiles` en est le reflet lisible : le rôle du compte, la fiche qu'il
--  pilote, et son nom d'utilisateur.
--
--  `id`        = l'identifiant du COMPTE (`auth.users.id`).
--  `entity_id` = l'identifiant de la FICHE (élève, enseignant, parent,
--                travailleur). Égal à `id` pour un compte créé en même temps
--                que sa fiche ; DIFFÉRENT pour un travailleur à qui l'accès a
--                été ouvert après coup — sa fiche existait déjà.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'reception', 'teacher', 'student', 'parent');
  end if;
end $$;

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  entity_id   text not null,
  role        public.app_role not null,
  email       text not null,
  username    text not null,
  full_name   text not null default '',
  -- LE COMPTE EST-IL ACTIVÉ ?
  --
  -- Un compte créé au comptoir l'est d'office. Un compte que la famille a créé
  -- ELLE-MÊME depuis la page de connexion ne l'est PAS : il se connecte, mais
  -- il ne pilote encore aucune fiche, donc il n'a rien à lire. L'application
  -- lui affiche « votre compte attend son activation », et l'intendance le
  -- rattache à une fiche depuis l'écran des demandes.
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists profiles_username_key on public.profiles (lower(username));
create unique index if not exists profiles_email_key    on public.profiles (lower(email));
create index        if not exists profiles_entity_idx   on public.profiles (entity_id);
create index        if not exists profiles_role_idx     on public.profiles (role);

comment on table  public.profiles is 'Le reflet lisible de auth.users : rôle, fiche pilotée, nom d''utilisateur.';
comment on column public.profiles.entity_id is 'La fiche métier que ce compte pilote (students.id, teachers.id, …).';
comment on column public.profiles.active is
  'false = compte créé depuis la page de connexion, en attente d''être rattaché à une fiche.';


-- =============================================================================
--  3. LE CATALOGUE DES DROITS — LES ÉCRANS ET LEURS BOUTONS
-- =============================================================================
--
--  CE QUE CES DEUX TABLES SONT : la liste complète de ce qu'un travailleur peut
--  se voir ouvrir. 15 écrans, 84 boutons. C'est exactement le contenu de
--  `lib/permissions.ts` — l'application le lit depuis son code (pour ne pas
--  faire un aller-retour réseau avant de dessiner un bouton), et la base le
--  garde ici pour que les droits stockés soient VÉRIFIABLES et que la RLS
--  puisse s'y référer.
--
--  COMMENT UN DROIT EST STOCKÉ, sur la fiche du travailleur :
--
--    reception_staff.nav_keys    = ['students', 'attendance']
--    reception_staff.action_keys = ['students:create', 'students:pay', …]
--
--  Un écran coché n'ouvre AUCUN bouton : les deux listes sont indépendantes,
--  et un bouton n'est utilisable que si SON écran est coché aussi.
--
--  `nav_keys` À NULL A UN SENS PRÉCIS : les droits de cette fiche n'ont JAMAIS
--  été réglés. Elle garde alors l'ancien menu de la réception plutôt que de se
--  retrouver devant un écran vide. Une liste VIDE (`[]`), elle, veut bien dire
--  « aucun écran » — c'est une décision, pas un oubli.
-- =============================================================================

create table if not exists public.app_pages (
  key        text primary key,
  position   integer not null,
  emoji      text not null default '',
  label      text not null,
  href       text not null,
  hint       text not null default ''
);

create table if not exists public.app_page_actions (
  page_key   text not null references public.app_pages (key) on delete cascade,
  action_id  text not null,
  position   integer not null,
  label      text not null,
  hint       text,
  primary key (page_key, action_id)
);

comment on table public.app_pages is 'Les 18 écrans de l''application, dans l''ordre de la barre latérale.';
comment on table public.app_page_actions is 'Les 101 boutons, écran par écran. Clé stockée : « écran:action ».';

-- ---- Les écrans -------------------------------------------------------------
insert into public.app_pages (key, position, emoji, label, href, hint) values
  ('dashboard', 1, '📊', 'Tableau de bord', '/dashboard', 'Les emplois du temps du jour, les feuilles de présence et la caisse.'),
  ('semesters', 2, '🗓️', 'Semestres', '/semesters', 'Les saisons du club : leurs categories, leurs emplois du temps, leurs cartes et leur argent.'),
  ('classes', 3, '🛡️', 'Catégories', '/classes', 'Les catégories de l''Ordre et la tranche d''âge de chacune.'),
  ('planner', 4, '📅', 'Emplois du temps', '/planner', 'La grille des créneaux, les séances libres et les arènes.'),
  ('students', 6, '⚔️', 'Chevaliers', '/students', 'Les fiches des chevaliers, leurs inscriptions, leurs paiements et leurs dettes.'),
  ('attendance', 7, '✅', 'Présences', '/attendance', 'Les feuilles de présence et l''historique des pointages.'),
  ('teachers', 8, '🏅', 'Entraîneurs', '/teachers', 'Les fiches des entraîneurs, leurs parts et leur paie.'),
  ('workers', 10, '💼', 'Personnel', '/workers', 'Le personnel : métiers, comptes, droits, acomptes, absences et paie.'),
  ('independent', 11, '🚩', 'Séances libres', '/independent', 'Les séances vendues à l''unité et les sorties libres de groupe.'),
  ('parents', 12, '👨‍👩‍👧', 'Parents', '/parents', 'Les fiches des parents et leurs comptes.'),
  ('announcements', 13, '📢', 'Annonces', '/announcements', 'Les annonces publiées aux chevaliers et aux parents.'),
  ('expenses', 14, '🧾', 'Dépenses', '/expenses', 'Les dépenses du club et leurs catégories.'),
  ('analytics', 15, '📈', 'Statistiques', '/analytics', 'L''affluence des chevaliers par catégorie et par entraîneur.'),
  ('cash', 16, '💵', 'Caisse', '/cash', 'Les mouvements de caisse : dépôts, retraits, dépenses — et leurs rubriques.'),
  ('reports', 17, '💰', 'Rapports', '/reports', 'Le bilan du club sur une période. Cet écran se consulte ; il n''écrit rien.'),
  ('website', 18, '🌐', 'Site web', '/website', 'La vitrine du club : les formations et les évènements publiés, les coordonnées et l''habillage de la page d''accueil.'),
  ('website-inscriptions', 19, '📥', 'Inscriptions du site', '/website-inscriptions', 'Les inscriptions venues du site public, en attente d''être vérifiées et rattachées à une fiche.'),
  ('settings', 20, '⚙️', 'Paramètres', '/settings', 'Le club, la sécurité, WhatsApp et les sauvegardes.')
on conflict (key) do update set
  position = excluded.position,
  emoji    = excluded.emoji,
  label    = excluded.label,
  href     = excluded.href,
  hint     = excluded.hint;

-- L'ÉCRAN « CARTES & TARIFS » A ÉTÉ RETIRÉ DE L'APPLICATION. Le tarif d'un
-- emploi du temps se fixe désormais SUR l'emploi du temps, au moment où on le
-- crée, et les périodes offertes ont rejoint les Paramètres. Le laisser au
-- catalogue proposerait un écran qui n'existe plus.
delete from public.app_page_actions where page_key = 'subscriptions';
delete from public.app_pages        where key      = 'subscriptions';

-- ---- Les boutons ------------------------------------------------------------
insert into public.app_page_actions (page_key, action_id, position, label, hint) values
  ('dashboard', 'open_presence', 1, 'Ouvrir une feuille de présence', 'Cliquer un créneau du jour pour l''ouvrir.'),
  ('dashboard', 'mark_presence', 2, 'Pointer les présences', 'Présent / absent / annulé, et corriger un pointage.'),
  ('dashboard', 'collect_payment', 3, 'Encaisser un paiement d''élève', 'Recharger un solde depuis la feuille de présence.'),
  ('dashboard', 'create_student', 4, 'Créer un élève', 'Le bouton « Nouvel élève ».'),
  ('dashboard', 'student_situation', 5, 'Situation d''un élève', 'Le tableau récapitulatif d''un élève.'),
  ('dashboard', 'cash_deposit', 6, 'Dépôt en caisse', null),
  ('dashboard', 'cash_expense', 7, 'Saisir une dépense', null),
  ('dashboard', 'cash_withdraw', 8, 'Retrait de caisse', null),
  ('semesters', 'create', 1, 'Creer un semestre', null),
  ('semesters', 'view',   2, 'Ouvrir le detail d''un semestre', 'Categories, emplois du temps, cartes et chevaliers.'),
  ('semesters', 'edit',   3, 'Modifier un semestre', null),
  ('semesters', 'delete', 4, 'Supprimer un semestre', null),
  ('semesters', 'close',  5, 'Clore un semestre', 'Ferme la saison -- et le pointage avec elle.'),
  ('semesters', 'pay',    6, 'Encaisser la dette d''un chevalier', 'Depuis la liste des chevaliers d''un emploi du temps.'),
  ('classes', 'create', 1, 'Créer une classe', null),
  ('classes', 'view', 2, 'Voir le détail d''une classe', null),
  ('classes', 'edit', 3, 'Modifier une classe', null),
  ('classes', 'delete', 4, 'Supprimer une classe', null),
  ('planner', 'create', 1, 'Créer un emploi du temps', null),
  ('planner', 'create_open', 2, 'Créer un créneau de séance libre', null),
  ('planner', 'view', 3, 'Voir le détail d''un emploi du temps', null),
  ('planner', 'edit', 4, 'Modifier un emploi du temps', null),
  ('planner', 'delete', 5, 'Archiver un emploi du temps', null),
  ('planner', 'print', 6, 'Imprimer un horaire', null),
  ('planner', 'groups', 7, 'Créer / renommer les groupes d''une catégorie', 'Sans avoir à créer le moindre créneau.'),
  ('students', 'create', 1, 'Créer un élève', null),
  ('students', 'view', 2, 'Voir la fiche d''un élève', null),
  ('students', 'edit', 3, 'Modifier un élève', null),
  ('students', 'delete', 4, 'Supprimer un élève', null),
  ('students', 'pay', 5, 'Payer & recharger les soldes', null),
  ('students', 'charges', 6, 'Frais & dettes (créer, encaisser)', null),
  ('students', 'edit_payment', 7, 'Corriger un paiement', null),
  ('students', 'delete_payment', 8, 'Supprimer un paiement', null),
  ('students', 'print_receipt', 9, 'Réimprimer le reçu d''un paiement', null),
  ('students', 'print_file', 10, 'Imprimer la fiche de l''élève', null),
  ('students', 'print_payments', 11, 'Imprimer le relevé des paiements', null),
  ('students', 'scan', 12, 'Scanner une carte RFID', null),
  ('students', 'situation', 13, 'Situation d''un élève', null),
  ('students', 'whatsapp', 14, 'Envoyer un message WhatsApp', null),
  ('attendance', 'mark', 1, 'Pointer les présences', 'Sans ce droit, l''écran se consulte sans s''écrire.'),
  ('attendance', 'collect_payment', 2, 'Encaisser un paiement d''élève', 'Recharger un solde depuis la feuille de présence.'),
  ('teachers', 'create', 1, 'Créer un enseignant', null),
  ('teachers', 'create_passager', 2, 'Créer un enseignant de passage', null),
  ('teachers', 'view', 3, 'Voir la fiche d''un enseignant', null),
  ('teachers', 'edit', 4, 'Modifier un enseignant', null),
  ('teachers', 'delete', 5, 'Supprimer un enseignant', null),
  ('teachers', 'pay', 6, 'Régler la paie', null),
  ('teachers', 'acompte', 7, 'Verser un acompte', null),
  ('teachers', 'absence', 8, 'Enregistrer une absence', null),
  ('teachers', 'expense', 9, 'Porter une dépense', null),
  ('teachers', 'print', 10, 'Imprimer un rapport de paie', null),
  ('workers', 'create', 1, 'Créer un travailleur', null),
  ('workers', 'view', 2, 'Voir la fiche d''un travailleur', null),
  ('workers', 'edit', 3, 'Modifier un travailleur', null),
  ('workers', 'delete', 4, 'Supprimer un travailleur', null),
  ('workers', 'roles', 5, 'Créer / supprimer un métier', null),
  ('workers', 'account', 6, 'Activer un compte de connexion', null),
  ('workers', 'permissions', 7, 'Attribuer les droits d''accès', null),
  ('workers', 'acompte', 8, 'Verser un acompte', null),
  ('workers', 'absence', 9, 'Enregistrer une absence', null),
  ('workers', 'pay', 10, 'Régler la rémunération', null),
  ('workers', 'history', 11, 'Consulter l''historique de travail', null),
  ('workers', 'print', 12, 'Imprimer un reçu ou une fiche de paie', null),
  ('workers', 'scan', 13, 'Pointage par badge', null),
  ('independent', 'create', 1, 'Créer une séance libre', null),
  ('independent', 'view', 2, 'Voir le détail d''une séance', null),
  ('independent', 'edit', 3, 'Modifier une séance', null),
  ('independent', 'delete', 4, 'Supprimer une séance', null),
  ('independent', 'print', 5, 'Réimprimer le reçu', null),
  ('parents', 'create', 1, 'Créer un parent', null),
  ('parents', 'view', 2, 'Voir la fiche d''un parent', null),
  ('parents', 'edit', 3, 'Modifier un parent', null),
  ('parents', 'delete', 4, 'Supprimer un parent', null),
  ('parents', 'message', 5, 'Envoyer un message (WhatsApp, notification)', null),
  ('announcements', 'create', 1, 'Publier une annonce', null),
  ('announcements', 'edit', 2, 'Modifier une annonce', null),
  ('announcements', 'delete', 3, 'Supprimer une annonce', null),
  ('expenses', 'create', 1, 'Saisir une dépense', null),
  ('expenses', 'edit', 2, 'Modifier une dépense', null),
  ('expenses', 'delete', 3, 'Supprimer une dépense', null),
  ('analytics', 'print', 1, 'Imprimer la vue', null),
  ('cash', 'deposit', 1, 'Dépôt en caisse', null),
  ('cash', 'withdraw', 2, 'Retrait de caisse', null),
  ('cash', 'edit', 3, 'Modifier un mouvement', null),
  ('cash', 'delete', 4, 'Supprimer un mouvement', null),
  ('settings', 'school', 1, 'Établissement', 'Nom, logo, coordonnées, identifiants fiscaux.'),
  ('settings', 'security', 2, 'Identifiants & sécurité', 'Son propre mot de passe.'),
  ('settings', 'whatsapp', 3, 'Paramètres WhatsApp', null),
  ('settings', 'free_periods', 4, 'Périodes offertes', 'Les fenêtres de gratuité, venues de l''ancien écran « Cartes & tarifs ».'),
  ('settings', 'backup', 5, 'Sauvegarde & données', null),
  ('website', 'create', 1, 'Publier une formation ou un évènement', null),
  ('website', 'view', 2, 'Voir le détail d''une formation', null),
  ('website', 'edit', 3, 'Modifier une formation', null),
  ('website', 'delete', 4, 'Supprimer une formation', null),
  ('website', 'hide', 5, 'Retirer une formation du site', 'Elle disparaît de la vitrine sans être supprimée.'),
  ('website', 'contacts', 6, 'Coordonnées & réseaux sociaux', null),
  ('website', 'appearance', 7, 'Habillage du site', 'Favicon, présentations, image de fond et vidéo d''accueil.'),
  ('website-inscriptions', 'view', 1, 'Ouvrir une inscription', null),
  ('website-inscriptions', 'verify', 2, 'Vérifier & accepter une inscription', 'Rattacher le compte à une fiche, ou la créer depuis la demande.'),
  ('website-inscriptions', 'edit', 3, 'Corriger une inscription', null),
  ('website-inscriptions', 'delete', 4, 'Supprimer une inscription', null)
on conflict (page_key, action_id) do update set
  position = excluded.position,
  label    = excluded.label,
  hint     = excluded.hint;

-- « students:create » — la forme sous laquelle un droit d'action est stocké.
create or replace function public.action_key(p_page text, p_action text)
returns text language sql immutable as $$
  select p_page || ':' || p_action;
$$;

-- Le catalogue en une seule ligne par bouton, prêt à être lu par un écran
-- d'administration ou vérifié à la main.
create or replace view public.app_permission_catalog as
  select p.position       as page_position,
         p.key            as page_key,
         p.emoji          as page_emoji,
         p.label          as page_label,
         p.href           as page_href,
         p.hint           as page_hint,
         a.action_id,
         a.position       as action_position,
         a.label          as action_label,
         a.hint           as action_hint,
         public.action_key(p.key, a.action_id) as permission_key
    from public.app_pages p
    left join public.app_page_actions a on a.page_key = p.key
   order by p.position, a.position;


-- =============================================================================
--  4. LES TABLES MÉTIER
-- =============================================================================
--
--  Une table par collection du magasin (`Database`, dans `lib/store/data.ts`),
--  déclarées dans l'ordre des dépendances : une table n'apparaît qu'après
--  celles auxquelles elle se réfère.
--
--  LES NOMS DE COLONNES SONT LE `snake_case` DES CHAMPS TYPESCRIPT
--  (`firstName` -> `first_name`, `pricePerSession` -> `price_per_session`).
--  C'est ce qui permet à `lib/supabase/mapping.ts` de traduire dans les deux
--  sens sans table de correspondance à tenir à jour.
--
--  LES CHAMPS COMPOSÉS (listes, dictionnaires, objets imbriqués) sont en
--  `jsonb` et reviennent tels quels côté JavaScript.
--
--  LA SIGNATURE — `created_by`, `created_by_name`, `created_by_role` — dit QUI a
--  écrit la ligne. Le nom est recopié à l'instant de l'écriture : un travailleur
--  qui quitte l'école laisse quand même un historique lisible.
-- =============================================================================

-- ---- L'établissement --------------------------------------------------------
create table if not exists public.schools (
  id                            text primary key default 'school',
  name                          text not null default 'École',
  description                   text not null default '',
  phone                         text not null default '',
  email                         text not null default '',
  logo                          text,
  address                       text not null default '',
  article_fiscal                text,
  registre_commerce             text,
  nif                           text,
  nis                           text,
  registration_fee              numeric,
  registration_fee_scope        text check (registration_fee_scope in ('all','levels','classes','sessions')),
  registration_fee_levels       jsonb,
  registration_fee_class_ids    jsonb,
  registration_fee_session_ids  jsonb,
  absence_penalty_enabled       boolean,
  absence_penalty_since         text,
  absence_week_start_day        integer,

  -- ---- LA VITRINE PUBLIQUE --------------------------------------------------
  --
  -- LE SITE DU CLUB VIT SUR CETTE LIGNE-LÀ, ET C'EST VOULU.
  --
  -- `schools` est la seule table que ce schéma laisse déjà lire à un visiteur
  -- NON CONNECTÉ (politique `schools_public_read`, section 6). Ranger ici le
  -- favicon, les textes de présentation, l'image et la vidéo d'accueil ainsi que
  -- les coordonnées, c'est permettre au site de s'afficher avant que quiconque
  -- ait un compte — sans ouvrir une seule table de plus au dehors.
  --
  -- Les coordonnées du site sont DISTINCTES de `phone` et `address` : celles-là
  -- sont celles de l'administration (le fixe du bureau, le siège fiscal), et ce
  -- n'est pas toujours ce qu'on donne au public.
  site_favicon                  text,
  site_description              text,
  site_description2             text,
  site_hero_image               text,
  site_video_url                text,
  site_facebook                 text,
  site_instagram                text,
  site_tiktok                   text,
  site_snapchat                 text,
  site_whatsapp                 text,
  site_maps_url                 text,
  site_phone                    text,
  site_phone2                   text,

  updated_at                    timestamptz not null default now()
);

-- La ligne unique de l'établissement. Elle existe toujours : la page de
-- connexion affiche son nom et son logo avant que quiconque soit connecté.
insert into public.schools (id, name) values ('school', 'École')
on conflict (id) do nothing;

-- ---- Le référentiel ---------------------------------------------------------
create table if not exists public.class_categories (
  id               text primary key,
  name             text not null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

create table if not exists public.modules (
  id               text primary key,
  name             text not null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

-- UN GROUPE APPARTIENT À UNE CATÉGORIE.
--
-- « Groupe A » des 8-10 ans n'est pas « Groupe A » des 15-18 ans : un groupe
-- flottant, valable pour tout le club, mélangeait à l'écran d'inscription des
-- groupes n'ayant rien à faire ensemble. `class_id` tranche.
--
-- La colonne est NULLABLE : les groupes créés avant elle n'en portent pas, et
-- l'application les rattache alors par les emplois du temps qui les utilisent.
create table if not exists public.groups (
  id               text primary key,
  name             text not null,
  class_id         text,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists groups_class_idx on public.groups (class_id);

create table if not exists public.salles (
  id               text primary key,
  name             text not null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

-- UNE CATÉGORIE DE L'ORDRE — ce que l'application appelait « une classe ».
--
-- Elle porte un nom, une description et la TRANCHE D'ÂGE qu'elle accueille.
-- Les colonnes d'avant (`type`, `cours_level`, `year`, `formation_level`) sont
-- GARDÉES et rendues facultatives : des fiches les portent déjà, et le
-- périmètre des droits d'entrée réglé par niveau les lit encore. Elles ne sont
-- simplement plus DEMANDÉES à la création.
create table if not exists public.classes (
  id               text primary key,
  type             text check (type in ('cours','formation')),
  name             text not null,
  description      text not null default '',
  age_from         integer check (age_from is null or age_from between 0 and 120),
  age_to           integer check (age_to is null or age_to between 0 and 120),
  cours_level      text check (cours_level in ('maternelle','primaire','moyen','lycee')),
  year             text,
  category_id      text references public.class_categories (id) on delete set null,
  formation_level  text check (formation_level in ('A1','A2','B1','B2','C1','C2')),
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists classes_category_idx on public.classes (category_id);

-- La clé étrangère des groupes se pose ICI, et non à la création de la table :
-- `groups` est déclarée avant `classes`, faute de quoi la référence pointerait
-- une table qui n'existe pas encore.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.groups'::regclass and conname = 'groups_class_id_fkey'
  ) then
    alter table public.groups
      add constraint groups_class_id_fkey
      foreign key (class_id) references public.classes (id) on delete set null;
  end if;
end $$;

-- ---- Le personnel -----------------------------------------------------------
create table if not exists public.teachers (
  id               text primary key,
  first_name       text not null default '',
  last_name        text not null default '',
  phone            text not null default '',
  email            text not null default '',
  payment_type     text not null default 'percentage' check (payment_type in ('monthly','percentage','per_group')),
  monthly_amount   numeric,
  start_date       text,
  percentage       numeric,
  is_passager      boolean,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

create table if not exists public.worker_job_roles (
  id               text primary key,
  name             text not null,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

-- LE TRAVAILLEUR ET SES DROITS.
--   `nav_keys`    : les écrans qu'il voit          (clés de `app_pages`)
--   `action_keys` : les boutons qu'il peut cliquer (clés « écran:action »)
-- `nav_keys` à NULL = droits jamais réglés (voir la section 3).
create table if not exists public.reception_staff (
  id               text primary key,
  first_name       text not null default '',
  last_name        text not null default '',
  phone            text not null default '',
  email            text not null default '',
  payment_type     text not null default 'monthly' check (payment_type in ('daily','monthly','half_day','hourly')),
  start_date       text not null default '',
  salary           numeric not null default 0,
  role             text references public.worker_job_roles (id) on delete set null,
  rfid             text,
  hourly_rate      numeric,
  has_account      boolean,
  username         text,
  nav_keys         jsonb,
  action_keys      jsonb,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists reception_staff_role_idx on public.reception_staff (role);
create index if not exists reception_staff_rfid_idx on public.reception_staff (rfid);

comment on column public.reception_staff.nav_keys is
  'Les écrans ouverts à ce travailleur. NULL = droits jamais réglés (ancien menu réception).';
comment on column public.reception_staff.action_keys is
  'Les boutons ouverts, sous la forme « écran:action » (cf. app_permission_catalog).';

create table if not exists public.parents (
  id               text primary key,
  first_name       text not null default '',
  last_name        text not null default '',
  phone            text not null default '',
  phone2           text,
  birth_date       text,
  address          text,
  email            text not null default '',
  child_ids        jsonb not null default '[]'::jsonb,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

-- ---- Les emplois du temps ---------------------------------------------------
-- ---- Les saisons du club ----------------------------------------------------
-- Un semestre porte un nom, deux dates, et tout ce qui se joue entre elles.
-- SA FIN N'EST PAS UNE DATE, C'EST UN TRAVAIL FINI : une seance annulee pour
-- tout un groupe se rejoue la semaine suivante, la carte qu'elle devait clore
-- deborde, et `end_date` est REPOUSSEE jusqu'au jour de la derniere presence.
-- `planned_end_date` garde ce qui avait ete annonce, pour que l'ecart se lise.
-- Une fois CLOS (`closed_at`), le semestre ferme le pointage : plus aucune
-- presence ne s'ecrit tant que le suivant n'a pas ete cree.
create table if not exists public.semesters (
  id                text primary key,
  name              text not null default '',
  start_date        text not null default '',
  end_date          text not null default '',
  planned_end_date  text,
  description       text,
  closed_at         text,
  extension_seen_at text,
  created_at        text,
  created_by        text,
  created_by_name   text,
  created_by_role   text
);
create index if not exists semesters_dates_idx on public.semesters (start_date, end_date);

create table if not exists public.schedule_sessions (
  id               text primary key,
  class_id         text references public.classes (id) on delete set null,
  module_id        text references public.modules (id) on delete set null,
  group_id         text references public.groups (id) on delete set null,
  salle_id         text references public.salles (id) on delete set null,
  teacher_id       text references public.teachers (id) on delete set null,
  days             jsonb not null default '[]'::jsonb,
  start_time       text not null default '',
  end_time         text not null default '',
  day_times        jsonb,
  -- PLUSIEURS SÉANCES LE MÊME JOUR : { "saturday": [{"startTime":"08:00",
  -- "endTime":"10:00"}, {"startTime":"17:00","endTime":"19:00"}] }. `day_times`
  -- garde toujours la PREMIÈRE séance de chaque jour, de sorte que tout ce qui
  -- ne lit qu'un horaire continue de fonctionner sans rien savoir.
  day_slots        jsonb,
  day_salles       jsonb,
  class_groups     jsonb,
  is_open          boolean,
  title            text,
  period_start     text,
  period_end       text,
  class_ids        jsonb,
  group_ids        jsonb,
  salle_ids        jsonb,
  open_price       numeric,
  archived_at      text,
  -- LE SEMESTRE de ce creneau : il decide jusqu'a quand ses cartes continuent
  -- de se creer. La derniere ouverte avant la date de fin va jusqu'au bout, et
  -- aucune ne s'ouvre apres. NULL = emploi du temps hors saison, qui fonctionne
  -- exactement comme avant les semestres.
  semester_id      text references public.semesters (id) on delete set null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists sessions_teacher_idx  on public.schedule_sessions (teacher_id);
create index if not exists sessions_class_idx    on public.schedule_sessions (class_id);
create index if not exists sessions_semester_idx on public.schedule_sessions (semester_id);

-- ---- Les cartes de chaque emploi du temps -----------------------------------
-- Une carte n'est pas une case du calendrier : c'est un PACK DE SEANCES que le
-- groupe vit. La premiere nait avec l'emploi du temps, a la date que la
-- reception fixe (`planned_start_date`) -- mais cette date n'est qu'une
-- INTENTION : la carte commence vraiment au premier pointage, et `start_date`
-- prend ce jour-la. Elle se ferme sur la seance qui complete `size`, et la
-- SUIVANTE N'EXISTE PAS AVANT. Une seance annulee pour tout le groupe ne compte
-- pas : elle est listee dans `postponed`, le groupe la rejoue la semaine
-- d'apres, et la carte finit simplement plus tard.
create table if not exists public.emploi_cartes (
  id                  text primary key,
  semester_id         text references public.semesters (id) on delete cascade,
  session_id          text references public.schedule_sessions (id) on delete cascade,
  "index"             integer not null default 1,
  -- « M1 », « M2 » ... -- le code historique que la paie et les paiements
  -- ecrivent deja partout. Seul l'affichage dit « Carte 1 ».
  code                text not null default 'M1',
  size                integer not null default 4,
  planned_start_date  text not null default '',
  start_date          text,
  end_date            text,
  held                integer not null default 0,
  postponed           jsonb,
  status              text not null default 'planned'
                      check (status in ('planned','running','complete')),
  created_at          text,
  created_by          text,
  created_by_name     text,
  created_by_role     text
);
create index if not exists emploi_cartes_session_idx  on public.emploi_cartes (session_id);
create index if not exists emploi_cartes_semester_idx on public.emploi_cartes (semester_id);
-- Une carte par rang et par emploi du temps : le moteur est idempotent, la base
-- le garantit.
create unique index if not exists emploi_cartes_session_index_uniq
  on public.emploi_cartes (session_id, "index");

create table if not exists public.subscriptions (
  id                  text primary key,
  session_id          text references public.schedule_sessions (id) on delete cascade,
  price_per_session   numeric not null default 0,
  level_price         numeric,
  period_months       integer,
  monthly_seances     integer,
  monthly_price       numeric,
  school_month_share  numeric,
  -- LE TRANSPORT : la part du prix de la carte qui paie le ramassage. Elle est
  -- prélevée AVANT le partage — ce qui reste se divise entre le club
  -- (`school_month_share`) et l'entraîneur. 0 / null = pas de transport.
  transport_month_share numeric,
  teacher_per_seance  numeric,
  -- L'ENGAGEMENT : le frais d'entrée propre à CE créneau (tenue, équipement,
  -- assurance du groupe). Ni la cotisation, ni les droits d'entrée du club : il
  -- est porté au compte du chevalier le jour où il rejoint l'emploi du temps,
  -- sous la forme d'un `student_charges` d'origine « engagement ».
  engagement_fee          numeric,
  engagement_description  text,
  archived_at         text,
  created_by          text,
  created_by_name     text,
  created_by_role     text
);
create index if not exists subscriptions_session_idx on public.subscriptions (session_id);

-- ---- Les élèves -------------------------------------------------------------
create table if not exists public.students (
  id                           text primary key,
  registration_number          text,
  first_name                   text not null default '',
  last_name                    text not null default '',
  birth_date                   text not null default '',
  phone                        text not null default '',
  phone2                       text,
  email                        text not null default '',
  address                      text,
  rfid                         text not null default '',
  is_free                      boolean not null default false,
  student_case                 text check (student_case in ('normal','special','teacher_child','reduction','school_only')),
  free_subscription_ids        jsonb,
  teacher_father_id            text references public.teachers (id) on delete set null,
  case_reduction               jsonb,
  unpaid_teacher_ids           jsonb,
  school_only_subscription_ids jsonb,
  enrollment_level             text,
  enrollment_year              text,
  parent_id                    text references public.parents (id) on delete set null,
  subscription_ids             jsonb not null default '[]'::jsonb,
  subscription_dates           jsonb,
  subscription_discounts       jsonb,
  registration_due             numeric,
  created_by                   text,
  created_by_name              text,
  created_by_role              text
);
create index if not exists students_parent_idx  on public.students (parent_id);
create index if not exists students_rfid_idx    on public.students (rfid);
create index if not exists students_father_idx  on public.students (teacher_father_id);

-- Le mot de passe que la réception a noté pour un élève, pour pouvoir le lui
-- redonner au comptoir. Ce n'est PAS le mot de passe de connexion : celui-là
-- vit chiffré dans `auth.users`, et personne ne peut le relire.
create table if not exists public.student_credentials (
  student_id  text primary key references public.students (id) on delete cascade,
  password    text not null default '',
  updated_at  text not null default ''
);

create table if not exists public.enrollments (
  id                text primary key,
  student_id        text not null references public.students (id) on delete cascade,
  subscription_id   text not null references public.subscriptions (id) on delete cascade,
  paid_seances      numeric not null default 0,
  consumed_seances  numeric not null default 0,
  discount          jsonb,
  start_date        text,
  expiry_date       text,
  plan              text check (plan in ('seance','month')),
  month_seances     numeric,
  balance           numeric,
  created_at        text not null default '',
  created_by        text,
  created_by_name   text,
  created_by_role   text
);
create index if not exists enrollments_student_idx on public.enrollments (student_id);
create index if not exists enrollments_sub_idx     on public.enrollments (subscription_id);

-- ---- L'argent des élèves ----------------------------------------------------
create table if not exists public.payments (
  id                 text primary key,
  student_id         text not null references public.students (id) on delete cascade,
  enrollment_id      text references public.enrollments (id) on delete set null,
  subscription_id    text references public.subscriptions (id) on delete set null,
  month_code         text,
  seances_purchased  numeric not null default 0,
  unit_price         numeric not null default 0,
  gross_total        numeric not null default 0,
  plan               text check (plan in ('seance','month')),
  discount_type      text check (discount_type in ('percent','amount')),
  discount_value     numeric,
  net_total          numeric not null default 0,
  amount_paid        numeric not null default 0,
  rest               numeric not null default 0,
  type               text not null default 'subscription_payment'
                     check (type in ('subscription_payment','debt_payment')),
  -- `transfer` : le solde d'un AUTRE emploi du temps, deplace avec le chevalier
  -- qu'on mute d'un groupe a un autre. Un retrait (montant negatif) sur
  -- l'ancien, un versement sur le nouveau, et AUCUN mouvement de caisse :
  -- l'argent n'entre ni ne sort, il change de case.
  paid_from          text check (paid_from in ('cash','teacher_salary','teacher_debt','school_cash','transfer')),
  charge_id          text,
  date               text not null default '',
  description        text,
  alert_read         boolean,
  created_by         text,
  created_by_name    text,
  created_by_role    text
);
create index if not exists payments_student_idx on public.payments (student_id);
create index if not exists payments_sub_idx     on public.payments (subscription_id);
create index if not exists payments_date_idx    on public.payments (date);

-- Tout ce qu'un élève doit à l'école SANS que ce soit de la scolarité : un
-- livre, une tenue, une sortie — ou la dette que la caisse a avancée pour
-- débloquer la part d'un enseignant (`origin = 'school_advance'`).
create table if not exists public.student_charges (
  id                 text primary key,
  student_id         text not null references public.students (id) on delete cascade,
  name               text not null default '',
  amount             numeric not null default 0,
  description        text,
  date               text not null default '',
  origin             text check (origin in ('manual','school_advance','engagement','formation')),
  source_payment_id  text,
  subscription_id    text references public.subscriptions (id) on delete set null,
  month_code         text,
  paid_amount        numeric,
  paid               boolean,
  payment_id         text,
  created_at         text,
  created_by         text,
  created_by_name    text,
  created_by_role    text
);
create index if not exists student_charges_student_idx on public.student_charges (student_id);

create table if not exists public.attendance_records (
  id                text primary key,
  student_id        text not null references public.students (id) on delete cascade,
  session_id        text not null references public.schedule_sessions (id) on delete cascade,
  "timestamp"       text not null default '',
  amount_deducted   numeric not null default 0,
  status            text not null default 'present'
                    check (status in ('present','late','absent','cancelled')),
  -- LAQUELLE DES SÉANCES DU JOUR : un emploi du temps peut en tenir deux (le
  -- matin et le soir). 0 / null = l'unique séance, ou la première.
  slot              integer,
  substitute_group  boolean,
  free_period_id    text,
  pre_start         boolean,
  waived_amount     numeric,
  no_charge         boolean,
  created_by        text,
  created_by_name   text,
  created_by_role   text
);
create index if not exists attendance_student_idx on public.attendance_records (student_id);
create index if not exists attendance_session_idx on public.attendance_records (session_id);
-- Un emploi du temps à deux séances écrit deux lignes par jour et par chevalier :
-- l'index les distingue, sinon la feuille de présence balaie toute la table.
create index if not exists attendance_session_slot_idx on public.attendance_records (session_id, slot);
create index if not exists attendance_ts_idx      on public.attendance_records ("timestamp");

create table if not exists public.absence_penalties (
  id               text primary key,
  student_id       text not null references public.students (id) on delete cascade,
  subscription_id  text references public.subscriptions (id) on delete set null,
  session_id       text references public.schedule_sessions (id) on delete set null,
  module_id        text references public.modules (id) on delete set null,
  period_start     text not null default '',
  period_end       text not null default '',
  amount           numeric not null default 0,
  remaining_after  numeric not null default 0,
  created_at       text not null default '',
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists absence_penalties_student_idx on public.absence_penalties (student_id);

-- ---- La paie des enseignants ------------------------------------------------
create table if not exists public.teacher_payments (
  id               text primary key,
  teacher_id       text not null references public.teachers (id) on delete cascade,
  amount           numeric not null default 0,
  method           text not null default 'percent' check (method in ('fixed','percent','group')),
  percentage       numeric,
  students_count   integer not null default 0,
  sessions_count   integer not null default 0,
  description      text not null default '',
  details          jsonb not null default '[]'::jsonb,
  gross            numeric,
  expenses         jsonb,
  acomptes         jsonb,
  child_charges    jsonb,
  child_debts      jsonb,
  months           jsonb,
  arrears          jsonb,
  cash_id          text,
  board            jsonb,
  paid_at          text not null default '',
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists teacher_payments_teacher_idx on public.teacher_payments (teacher_id);

create table if not exists public.teacher_acomptes (
  id               text primary key,
  teacher_id       text not null references public.teachers (id) on delete cascade,
  amount           numeric not null default 0,
  description      text not null default '',
  date             text not null default '',
  paid             boolean,
  payment_id       text references public.teacher_payments (id) on delete set null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists teacher_acomptes_teacher_idx on public.teacher_acomptes (teacher_id);

create table if not exists public.teacher_expenses (
  id               text primary key,
  teacher_id       text not null references public.teachers (id) on delete cascade,
  name             text not null default '',
  amount           numeric not null default 0,
  description      text,
  date             text not null default '',
  paid             boolean,
  payment_id       text references public.teacher_payments (id) on delete set null,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists teacher_expenses_teacher_idx on public.teacher_expenses (teacher_id);

-- La scolarité d'un enfant d'enseignant, créditée d'avance par l'école et
-- portée sur le salaire du père.
create table if not exists public.teacher_child_debts (
  id               text primary key,
  teacher_id       text not null references public.teachers (id) on delete cascade,
  student_id       text not null references public.students (id) on delete cascade,
  subscription_id  text references public.subscriptions (id) on delete set null,
  month_code       text,
  label            text not null default '',
  amount           numeric not null default 0,
  date             text not null default '',
  paid             boolean,
  payment_id       text references public.teacher_payments (id) on delete set null,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists teacher_child_debts_teacher_idx on public.teacher_child_debts (teacher_id);
create index if not exists teacher_child_debts_student_idx on public.teacher_child_debts (student_id);

create table if not exists public.teacher_absences (
  id               text primary key,
  teacher_id       text not null references public.teachers (id) on delete cascade,
  cost             numeric not null default 0,
  description      text not null default '',
  date             text not null default '',
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists teacher_absences_teacher_idx on public.teacher_absences (teacher_id);

-- La part d'enseignant qu'un élève n'a pas réglée : elle reste due, et la
-- retenue tombe sur le prochain règlement.
create table if not exists public.unpaid_teacher_sessions (
  id               text primary key,
  teacher_id       text not null references public.teachers (id) on delete cascade,
  session_id       text references public.schedule_sessions (id) on delete set null,
  student_id       text references public.students (id) on delete cascade,
  amount           numeric not null default 0,
  date             text not null default '',
  -- la séance du jour qui a produit cette part (0 = la première)
  slot             integer,
  paid             boolean not null default false,
  payment_id       text references public.teacher_payments (id) on delete set null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists unpaid_teacher_teacher_idx on public.unpaid_teacher_sessions (teacher_id);

-- ---- La paie des travailleurs -----------------------------------------------
create table if not exists public.worker_payments (
  id               text primary key,
  worker_id        text not null references public.reception_staff (id) on delete cascade,
  kind             text not null default 'monthly' check (kind in ('daily','monthly','half_day','hourly')),
  period_keys      jsonb not null default '[]'::jsonb,
  shift_ids        jsonb,
  gross            numeric not null default 0,
  acomptes         numeric not null default 0,
  absences         numeric not null default 0,
  net              numeric not null default 0,
  amount           numeric not null default 0,
  date             text not null default '',
  description      text,
  cash_id          text,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists worker_payments_worker_idx on public.worker_payments (worker_id);

create table if not exists public.worker_shifts (
  id               text primary key,
  worker_id        text not null references public.reception_staff (id) on delete cascade,
  work_date        text not null default '',
  start_at         text,
  end_at           text,
  minutes          numeric not null default 0,
  frozen           boolean not null default false,
  paid             boolean not null default false,
  payment_id       text references public.worker_payments (id) on delete set null,
  created_at       text not null default '',
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists worker_shifts_worker_idx on public.worker_shifts (worker_id);
create index if not exists worker_shifts_date_idx   on public.worker_shifts (work_date);

create table if not exists public.worker_acomptes (
  id               text primary key,
  worker_id        text not null references public.reception_staff (id) on delete cascade,
  amount           numeric not null default 0,
  description      text not null default '',
  date             text not null default '',
  paid             boolean,
  payment_id       text references public.worker_payments (id) on delete set null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists worker_acomptes_worker_idx on public.worker_acomptes (worker_id);

create table if not exists public.worker_absences (
  id               text primary key,
  worker_id        text not null references public.reception_staff (id) on delete cascade,
  cost             numeric not null default 0,
  description      text not null default '',
  date             text not null default '',
  paid             boolean,
  payment_id       text references public.worker_payments (id) on delete set null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists worker_absences_worker_idx on public.worker_absences (worker_id);

-- ---- Les règles de facturation ----------------------------------------------
create table if not exists public.free_periods (
  id               text primary key,
  name             text not null default '',
  description      text not null default '',
  start_date       text not null default '',
  end_date         text not null default '',
  all_classes      boolean not null default false,
  class_ids        jsonb not null default '[]'::jsonb,
  pay_teachers     boolean not null default false,
  active           boolean not null default true,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

create table if not exists public.module_absence_rules (
  module_id    text primary key references public.modules (id) on delete cascade,
  enabled      boolean not null default false,
  days_window  integer not null default 0
);

-- ---- La vie de l'école ------------------------------------------------------

create table if not exists public.announcements (
  id                text primary key,
  title             text not null default '',
  description       text not null default '',
  audience          text not null default 'all' check (audience in ('students','teachers','parents','all')),
  end_date          text not null default '',
  date              text not null default '',
  target_group_ids  jsonb,
  include_parents   boolean,
  created_by        text,
  created_by_name   text,
  created_by_role   text
);

create table if not exists public.coursework (
  id                 text primary key,
  name               text not null default '',
  type               text not null default 'single' check (type in ('single','period')),
  dates              jsonb not null default '[]'::jsonb,
  price_per_session  numeric not null default 0,
  total              numeric not null default 0,
  teacher_id         text references public.teachers (id) on delete cascade,
  created_by         text,
  created_by_name    text,
  created_by_role    text
);

-- ---- La caisse et les dépenses ----------------------------------------------
create table if not exists public.expense_categories (
  id               text primary key,
  name             text not null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

create table if not exists public.expenses (
  id               text primary key,
  name             text not null default '',
  category_id      text references public.expense_categories (id) on delete set null,
  amount           numeric not null default 0,
  date             text not null default '',
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_date_idx     on public.expenses (date);

-- `amount` est SIGNÉ : un retrait, une dépense ou une paie sont négatifs.
-- LES RUBRIQUES DE CAISSE — « Équipement », « Entretien des arènes ».
--
-- Elles rangent les dépôts et les retraits manuels pour que la Caisse et les
-- Rapports puissent en donner le total rubrique par rubrique. Elles se créent
-- et se suppriment depuis le formulaire de saisie lui-même.
create table if not exists public.cash_categories (
  id               text primary key,
  name             text not null,
  color            text,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create unique index if not exists cash_categories_name_key
  on public.cash_categories (lower(name));

create table if not exists public.cash_transactions (
  id               text primary key,
  type             text not null check (type in (
                     'deposit','withdraw','expense','student_payment',
                     'teacher_payment','acompte','student_debt')),
  amount           numeric not null default 0,
  date             text not null default '',
  description      text not null default '',
  -- `on delete set null` : supprimer une rubrique ne doit jamais faire
  -- disparaître un mouvement de caisse. Il redevient « non classé ».
  category_id      text references public.cash_categories (id) on delete set null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists cash_date_idx     on public.cash_transactions (date);
create index if not exists cash_category_idx on public.cash_transactions (category_id);

create table if not exists public.notifications (
  id               text primary key,
  parent_id        text not null references public.parents (id) on delete cascade,
  title            text not null default '',
  description      text not null default '',
  date             text not null default '',
  read             boolean not null default false,
  auto             boolean not null default false,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists notifications_parent_idx on public.notifications (parent_id);

-- ---- Les séances vendues à l'unité ------------------------------------------
create table if not exists public.independent_sessions (
  id               text primary key,
  student_id       text references public.students (id) on delete set null,
  passager_name    text,
  item_label       text not null default '',
  price            numeric not null default 0,
  date             text not null default '',
  session_id       text references public.schedule_sessions (id) on delete set null,
  start_time       text,
  end_time         text,
  created_at       text,
  teacher_paid     boolean,
  school_share     numeric,
  teacher_id       text references public.teachers (id) on delete set null,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists independent_student_idx on public.independent_sessions (student_id);
create index if not exists independent_date_idx    on public.independent_sessions (date);

-- Une séance vendue à un GROUPE d'élèves, sans nommer personne.
create table if not exists public.group_seances (
  id                 text primary key,
  teacher_id         text not null references public.teachers (id) on delete cascade,
  title              text not null default '',
  description        text,
  date               text not null default '',
  start_time         text not null default '',
  end_time           text not null default '',
  students_count     integer not null default 0,
  price_per_student  numeric not null default 0,
  school_per_student numeric not null default 0,
  cash_in_id         text,
  cash_out_id        text,
  created_at         text not null default '',
  created_by         text,
  created_by_name    text,
  created_by_role    text
);
create index if not exists group_seances_teacher_idx on public.group_seances (teacher_id);

-- ---- Les demandes de compte -------------------------------------------------
--
-- CE QUE C'EST : un compte que la FAMILLE a créé elle-même depuis la page de
-- connexion. Il existe vraiment dans `auth.users` et se connecte tout de suite,
-- mais son profil est INACTIF et ne pointe aucune fiche : l'application ne lui
-- montre qu'un écran d'attente.
--
-- L'intendance ouvre la demande depuis le tableau de bord, l'écran des
-- chevaliers ou celui des parents, et la referme de deux façons :
--   • en RATTACHANT le compte à une fiche qui existe déjà (le numéro de
--     téléphone la désigne le plus souvent tout seul) ;
--   • en CRÉANT cette fiche depuis la demande — avec, pour un parent, celles de
--     ses fils, et la catégorie et le groupe de chacun.
create table if not exists public.account_requests (
  id                   text primary key,
  account_id           uuid not null references auth.users (id) on delete cascade,
  kind                 text not null check (kind in ('student','parent')),
  -- D'OÙ LA DEMANDE VIENT : « login » = la page de connexion de l'application,
  -- « website » = le site public, au bas d'une formation. Les deux créent le
  -- même compte inactif ; elles ne s'affichent simplement pas dans la même file
  -- d'attente. Vide = « login », ce que sont toutes les demandes d'avant la
  -- vitrine.
  source               text check (source in ('login','website')),
  -- La formation d'où la demande est partie. Ce n'est qu'une INTENTION : elle ne
  -- réserve rien et n'engage aucun argent tant que l'intendance n'a pas vérifié
  -- la demande.
  formation_id         text,
  first_name           text not null default '',
  last_name            text not null default '',
  phone                text not null default '',
  phone2               text,
  birth_date           text,
  address              text,
  email                text not null default '',
  -- « je suis déjà inscrit au club, je veux seulement mon accès »
  existing_member      boolean not null default false,
  -- parent : ses fils sont-ils déjà inscrits au club ?
  children_subscribed  boolean,
  -- parent : les fils déclarés, quand ils ne le sont pas encore
  children             jsonb not null default '[]'::jsonb,
  status               text not null default 'pending'
                       check (status in ('pending','linked','rejected')),
  linked_entity_id     text,
  linked_child_ids     jsonb,
  -- LA DEMANDE S'EST-ELLE RATTACHÉE TOUTE SEULE ? true = le numéro de téléphone
  -- a désigné une fiche du club, et une seule, au moment même de la création du
  -- compte : il est actif sans qu'un humain soit intervenu.
  auto_linked          boolean not null default false,
  reviewed_at          text,
  reviewed_by          text,
  reviewed_by_name     text,
  created_at           text not null default '',
  created_by           text,
  created_by_name      text,
  created_by_role      text
);
create index if not exists account_requests_status_idx  on public.account_requests (status);
create index if not exists account_requests_account_idx on public.account_requests (account_id);

comment on table public.account_requests is
  'Les comptes créés depuis la page de connexion OU depuis le site public, en attente d''être rattachés à une fiche.';
comment on column public.account_requests.source is
  '« login » = la page de connexion · « website » = le site public. Vide = login.';
create index if not exists account_requests_source_idx on public.account_requests (source);


-- ---- LA VITRINE : LES FORMATIONS ET LES ÉVÈNEMENTS --------------------------
--
-- C'est la SEULE chose que le site publie en propre — tout le reste de la
-- vitrine (le fond, la vidéo, les textes, les coordonnées) tient sur la fiche de
-- l'établissement. Une formation est donc lisible SANS COMPTE : c'est ce qui
-- permet à quelqu'un qui passe de la découvrir et de s'y inscrire avant même
-- d'exister au club.
--
-- LES JOURS SONT DES DATES, PAS DES JOURS DE SEMAINE (`days`). Une formation ne
-- « tient pas tous les mardis » : elle tient LES 4, 11 et 18 mars. L'écran de
-- création déplie le calendrier de la période et l'on coche les journées
-- réelles, ce qui permet de sauter une fête ou une semaine de vacances sans
-- inventer une règle de récurrence que personne ne saurait relire. Une liste
-- VIDE veut dire « toute la période » — le cas d'un évènement d'un seul tenant.
--
-- `trainer_name` EST UNE COPIE, et pas un oubli de normalisation : le site est
-- lu par des visiteurs à qui la RLS ne rend PAS `teachers`. Sans cette copie, la
-- carte publique afficherait « tea-mf3k2a-9c1b ».
create table if not exists public.website_formations (
  id               text primary key,
  kind             text not null default 'formation' check (kind in ('formation','event')),
  name             text not null default '',
  description      text not null default '',
  start_date       text not null default '',
  start_time       text not null default '',
  end_date         text not null default '',
  end_time         text not null default '',
  days             jsonb not null default '[]'::jsonb,
  trainer_id       text references public.teachers (id) on delete set null,
  trainer_name     text,
  trainer_note     text,
  price            numeric not null default 0,
  seances          integer not null default 0,
  images           jsonb not null default '[]'::jsonb,
  -- Retirée de la vitrine, mais pas supprimée : une formation complète,
  -- reportée ou terminée n'a plus à s'afficher sans pour autant emporter les
  -- inscriptions qu'elle a produites.
  hidden           boolean not null default false,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists website_formations_hidden_idx on public.website_formations (hidden);
create index if not exists website_formations_start_idx  on public.website_formations (start_date);

comment on table public.website_formations is
  'Les formations et les évènements publiés sur le site du club. Lisibles sans compte tant que `hidden` est faux.';


-- ---- QUI EST INSCRIT SUR QUOI -----------------------------------------------
--
-- L'INSCRIPTION ET L'ARGENT SONT SÉPARÉS, et c'est tout l'intérêt : quelqu'un
-- qui s'inscrit depuis le site n'a rien payé — il paiera au comptoir, parfois
-- des semaines plus tard. La ligne naît donc TOUJOURS, et le prix est porté au
-- compte du chevalier sous la forme d'un frais ordinaire (`student_charges`,
-- origine « formation »), qui se règle en une ou plusieurs fois comme n'importe
-- quelle autre dette et s'affiche déjà partout où le chevalier apparaît.
--
-- `charge_id` est le lien vers ce frais : c'est lui qui dit si l'inscription est
-- payée, et de combien. Une inscription offerte (prix nul) n'en porte aucun.
create table if not exists public.formation_enrollments (
  id               text primary key,
  formation_id     text not null references public.website_formations (id) on delete cascade,
  student_id       text not null references public.students (id) on delete cascade,
  price            numeric not null default 0,
  charge_id        text references public.student_charges (id) on delete set null,
  date             text not null default '',
  source           text check (source in ('login','website')),
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);
create index if not exists formation_enrollments_formation_idx on public.formation_enrollments (formation_id);
create index if not exists formation_enrollments_student_idx   on public.formation_enrollments (student_id);

comment on table public.formation_enrollments is
  'Les chevaliers inscrits sur une formation. Le prix vit dans student_charges (origine « formation »), jamais ici.';


-- =============================================================================
--  5. QUI SUIS-JE, ET QU'AI-JE LE DROIT D'ÉCRIRE
-- =============================================================================
--
--  Ces fonctions sont le seul endroit où la question est tranchée ; toutes les
--  politiques de la section 6 les appellent. Elles sont `stable` et lisent
--  `public.profiles` en `security definer` — autrement une politique posée SUR
--  `profiles` se rappellerait elle-même à l'infini.
-- =============================================================================

create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- L'identifiant de la FICHE que le compte connecté pilote.
create or replace function public.my_entity_id()
returns text
language sql stable security definer set search_path = public
as $$
  select entity_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$ select public.my_role() = 'admin'; $$;

create or replace function public.is_teacher()
returns boolean language sql stable as $$ select public.my_role() = 'teacher'; $$;

create or replace function public.is_student()
returns boolean language sql stable as $$ select public.my_role() = 'student'; $$;

create or replace function public.is_parent()
returns boolean language sql stable as $$ select public.my_role() = 'parent'; $$;

-- L'administration et les travailleurs : ceux qui tiennent le comptoir.
create or replace function public.is_staff()
returns boolean language sql stable as $$
  select public.my_role() in ('admin', 'reception');
$$;

-- Les écrans ouverts au compte connecté. L'administration les a tous.
-- `nav_keys` à NULL = droits jamais réglés : la fiche garde l'ancien menu de la
-- réception, exactement comme `lib/permissions.ts` le fait côté écran.
create or replace function public.my_pages()
returns text[]
language sql stable security definer set search_path = public
as $$
  select case
    when public.my_role() = 'admin' then (select array_agg(key) from public.app_pages)
    when public.my_role() = 'reception' then coalesce(
      (select array(select jsonb_array_elements_text(w.nav_keys))
         from public.reception_staff w
        where w.id = public.my_entity_id() and w.nav_keys is not null),
      array['dashboard','semesters','classes','planner','subscriptions','students','attendance',
            'independent','parents','announcements','expenses','settings']
    )
    else array[]::text[]
  end;
$$;

-- Les boutons ouverts, sous la forme « écran:action ».
create or replace function public.my_actions()
returns text[]
language sql stable security definer set search_path = public
as $$
  select case
    when public.my_role() = 'admin' then
      (select array_agg(public.action_key(page_key, action_id)) from public.app_page_actions)
    when public.my_role() = 'reception' then coalesce(
      (select array(select jsonb_array_elements_text(w.action_keys))
         from public.reception_staff w
        where w.id = public.my_entity_id() and w.nav_keys is not null),
      (select array_agg(public.action_key(page_key, action_id)) from public.app_page_actions)
    )
    else array[]::text[]
  end;
$$;

-- Cet écran est-il ouvert ?
create or replace function public.can_page(p_page text)
returns boolean language sql stable as $$
  select p_page = any (public.my_pages());
$$;

-- Ce bouton est-il ouvert ? Un écran fermé ferme tous ses boutons.
create or replace function public.can_action(p_page text, p_action text)
returns boolean language sql stable as $$
  select public.can_page(p_page)
     and public.action_key(p_page, p_action) = any (public.my_actions());
$$;

-- LE DROIT D'ÉCRIRE DANS UNE TABLE.
--
-- Une même table est alimentée par PLUSIEURS écrans : un encaissement part de
-- la fiche de l'élève, du tableau de bord ou de la feuille de présence. La
-- politique reçoit donc la LISTE des écrans qui écrivent là, et il suffit d'en
-- avoir un seul pour que la ligne passe.
create or replace function public.can_write(p_pages text[])
returns boolean language sql stable as $$
  select public.is_admin()
      or (public.my_role() = 'reception' and public.my_pages() && p_pages);
$$;

-- LES ÉLÈVES QU'UN COMPTE A LE DROIT DE VOIR.
--   un élève  -> lui-même
--   un parent -> ses enfants
--   les autres (administration, travailleur, enseignant) passent par
--   `is_staff()` / `is_teacher()` et n'ont pas besoin de cette liste.
create or replace function public.my_student_ids()
returns text[]
language sql stable security definer set search_path = public
as $$
  select case public.my_role()
    when 'student' then array[public.my_entity_id()]
    when 'parent'  then coalesce(
      (select array(select jsonb_array_elements_text(p.child_ids))
         from public.parents p where p.id = public.my_entity_id()),
      array[]::text[]
    ) || coalesce(
      (select array_agg(s.id) from public.students s where s.parent_id = public.my_entity_id()),
      array[]::text[]
    )
    else array[]::text[]
  end;
$$;


-- =============================================================================
--  6. LA RLS — QUI LIT QUOI, QUI ÉCRIT QUOI
-- =============================================================================
--
--  DEUX POLITIQUES PAR TABLE : une pour la lecture, une pour l'écriture
--  (`for all`, qui couvre INSERT, UPDATE et DELETE d'un seul tenant).
--
--  LA LECTURE EST LARGE POUR LE COMPTOIR, ET ÉTROITE POUR LES FAMILLES.
--  L'application charge la base ENTIÈRE en un appel puis calcule tout côté
--  écran : un travailleur autorisé aux seuls « Élèves » a quand même besoin des
--  emplois du temps, des tarifs et des présences pour que cet écran affiche
--  quoi que ce soit. C'est donc l'ÉCRITURE que les droits d'écran filtrent —
--  et, pour les portails élève / parent, la lecture ligne à ligne.
--
--  L'ENSEIGNANT est un cas à part : son tableau de paie recalcule sa part à
--  partir des présences ET des paiements de ses élèves, et il peut pointer une
--  feuille de présence. Il lit donc les tables de scolarité, et écrit celles
--  que le pointage touche.
--
--  CE QUE LA RLS N'EST PAS : le filtre des BOUTONS. Un bouton caché l'est par
--  `lib/permissions.ts`, écran par écran. La RLS est le filet en dessous : même
--  en forgeant un appel à la main, un travailleur n'écrit pas dans une table
--  dont aucun de ses écrans ne dépend.
-- =============================================================================

do $$
declare
  r record;
  staff_read constant text := 'public.is_staff()';
  any_signed constant text := 'auth.uid() is not null';
begin
  for r in
    select * from (values
      -- table                        lecture                               écriture
      ('schools',                     any_signed,                           $w$public.can_write(array['settings'])$w$),
      ('class_categories',            any_signed,                           $w$public.can_write(array['classes'])$w$),
      ('classes',                     any_signed,                           $w$public.can_write(array['classes','planner'])$w$),
      ('modules',                     any_signed,                           $w$public.can_write(array['classes','planner','subscriptions'])$w$),
      ('groups',                      any_signed,                           $w$public.can_write(array['classes','planner'])$w$),
      ('salles',                      any_signed,                           $w$public.can_write(array['classes','planner'])$w$),
      -- LA SAISON ET SES CARTES. Tout compte connecte les lit -- un entraineur
      -- doit voir ou en sont les cartes de ses groupes, une famille ou en est
      -- la saison. Les cartes sont ecrites par le MOTEUR, qui tourne partout ou
      -- l'on pointe : leur droit d'ecriture suit ces ecrans-la.
      ('semesters',                   any_signed,                           $w$public.can_write(array['semesters','planner'])$w$),
      ('emploi_cartes',               any_signed,                           $w$public.can_write(array['semesters','planner','attendance','dashboard'])$w$),
      ('schedule_sessions',           any_signed,                           $w$public.can_write(array['planner','classes'])$w$),
      ('subscriptions',               any_signed,                           $w$public.can_write(array['subscriptions','planner'])$w$),
      ('free_periods',                any_signed,                           $w$public.can_write(array['subscriptions','planner','settings'])$w$),
      ('module_absence_rules',        any_signed,                           $w$public.can_write(array['subscriptions','settings','planner'])$w$),
      ('worker_job_roles',            any_signed,                           $w$public.can_write(array['workers'])$w$),
      ('teachers',                    any_signed,                           $w$public.can_write(array['teachers'])$w$),
      ('announcements',               any_signed,                           $w$public.can_write(array['announcements'])$w$),
      ('coursework',                  any_signed,                           $w$public.can_write(array['teachers','planner'])$w$),

      -- Les élèves et leur scolarité : le comptoir et l'enseignant voient tout,
      -- une famille ne voit qu'elle-même.
      ('students',
        $r$public.is_staff() or public.is_teacher() or id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['students','dashboard','attendance','parents','website-inscriptions']) or public.is_teacher()$w$),
      ('student_credentials',
        $r$public.is_staff() or student_id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['students','dashboard'])$w$),
      ('enrollments',
        $r$public.is_staff() or public.is_teacher() or student_id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['students','dashboard','attendance']) or public.is_teacher()$w$),
      ('payments',
        $r$public.is_staff() or public.is_teacher() or student_id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['students','dashboard','attendance']) or public.is_teacher()$w$),
      ('student_charges',
        $r$public.is_staff() or public.is_teacher() or student_id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['students','dashboard','attendance','teachers','website','website-inscriptions']) or public.is_teacher()$w$),
      ('attendance_records',
        $r$public.is_staff() or public.is_teacher() or student_id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['attendance','dashboard','students']) or public.is_teacher()$w$),
      ('absence_penalties',
        $r$public.is_staff() or public.is_teacher() or student_id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['attendance','dashboard','students']) or public.is_teacher()$w$),

      -- La paie des enseignants : le comptoir, et l'enseignant sur SES lignes.
      ('teacher_payments',
        $r$public.is_staff() or (public.is_teacher() and teacher_id = public.my_entity_id())$r$,
        $w$public.can_write(array['teachers'])$w$),
      ('teacher_acomptes',
        $r$public.is_staff() or (public.is_teacher() and teacher_id = public.my_entity_id())$r$,
        $w$public.can_write(array['teachers'])$w$),
      ('teacher_expenses',
        $r$public.is_staff() or (public.is_teacher() and teacher_id = public.my_entity_id())$r$,
        $w$public.can_write(array['teachers'])$w$),
      ('teacher_absences',
        $r$public.is_staff() or (public.is_teacher() and teacher_id = public.my_entity_id())$r$,
        $w$public.can_write(array['teachers'])$w$),
      ('teacher_child_debts',
        $r$public.is_staff() or (public.is_teacher() and teacher_id = public.my_entity_id())
           or student_id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['teachers','students','dashboard','attendance']) or public.is_teacher()$w$),
      ('unpaid_teacher_sessions',
        $r$public.is_staff() or (public.is_teacher() and teacher_id = public.my_entity_id())$r$,
        $w$public.can_write(array['teachers','students','dashboard','attendance']) or public.is_teacher()$w$),

      -- Le personnel : rien n'en sort vers les portails des familles.
      ('reception_staff',             staff_read,                           $w$public.can_write(array['workers'])$w$),
      ('worker_shifts',               staff_read,                           $w$public.can_write(array['workers'])$w$),
      ('worker_acomptes',             staff_read,                           $w$public.can_write(array['workers'])$w$),
      ('worker_absences',             staff_read,                           $w$public.can_write(array['workers'])$w$),
      ('worker_payments',             staff_read,                           $w$public.can_write(array['workers'])$w$),

      -- Les parents et leurs notifications.
      ('parents',
        $r$public.is_staff() or (public.is_parent() and id = public.my_entity_id())
           or (public.is_student() and exists (
                 select 1 from public.students s
                  where s.id = public.my_entity_id() and s.parent_id = parents.id))$r$,
        $w$public.can_write(array['parents','students','website-inscriptions'])$w$),
      ('notifications',
        $r$public.is_staff() or (public.is_parent() and parent_id = public.my_entity_id())$r$,
        $w$public.can_write(array['parents','students','announcements'])$w$),

      -- La caisse et les dépenses : le comptoir seul.
      ('expense_categories',          staff_read,                           $w$public.can_write(array['expenses'])$w$),
      ('cash_categories',             staff_read,                           $w$public.can_write(array['cash','dashboard','expenses'])$w$),
      ('expenses',                    staff_read,                           $w$public.can_write(array['expenses','dashboard'])$w$),
      -- La caisse est alimentée par presque tous les écrans qui encaissent.
      ('cash_transactions',           staff_read,
        $w$public.can_write(array['cash','dashboard','students','teachers','workers','expenses','independent','attendance'])$w$),

      -- Les séances vendues à l'unité.
      ('independent_sessions',
        $r$public.is_staff() or (public.is_teacher() and teacher_id = public.my_entity_id())
           or student_id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['independent','dashboard'])$w$),
      ('group_seances',
        $r$public.is_staff() or (public.is_teacher() and teacher_id = public.my_entity_id())$r$,
        $w$public.can_write(array['independent','teachers'])$w$),

      -- Les demandes de compte : le comptoir les traite, et chacun voit la
      -- sienne — c'est ce qui permet à un compte en attente de savoir où il en
      -- est. PERSONNE ne les INSÈRE d'ici : elles naissent de
      -- `request_account()`, qui vérifie tout elle-même.
      ('account_requests',
        $r$public.is_staff() or account_id = auth.uid()$r$,
        $w$public.can_write(array['dashboard','students','parents','website-inscriptions'])$w$),

      -- LA VITRINE. Tout compte connecté lit les formations — la gestion doit
      -- voir jusqu'aux masquées — et le VISITEUR, lui, passe par la politique
      -- `anon` posée plus bas, qui ne lui rend que les formations affichées.
      ('website_formations',          any_signed,
        $w$public.can_write(array['website'])$w$),
      ('formation_enrollments',
        $r$public.is_staff() or public.is_teacher() or student_id = any (public.my_student_ids())$r$,
        $w$public.can_write(array['website','website-inscriptions','students','dashboard'])$w$)
    ) as t(tbl, read_using, write_using)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_read', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_write', r.tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      r.tbl || '_read', r.tbl, r.read_using);
    execute format(
      'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
      r.tbl || '_write', r.tbl, r.write_using, r.write_using);
  end loop;
end $$;

-- ---- Le catalogue des droits ------------------------------------------------
-- Tout compte connecté le lit (l'écran « Droits d'accès » l'affiche) ; seule
-- l'administration le modifie — et en pratique, c'est ce script qui l'écrit.
alter table public.app_pages        enable row level security;
alter table public.app_page_actions enable row level security;

drop policy if exists app_pages_read         on public.app_pages;
drop policy if exists app_pages_write        on public.app_pages;
drop policy if exists app_page_actions_read  on public.app_page_actions;
drop policy if exists app_page_actions_write on public.app_page_actions;

create policy app_pages_read  on public.app_pages
  for select to authenticated using (true);
create policy app_pages_write on public.app_pages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy app_page_actions_read  on public.app_page_actions
  for select to authenticated using (true);
create policy app_page_actions_write on public.app_page_actions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- Les comptes ------------------------------------------------------------
-- Chacun lit le sien ; le comptoir les lit tous (il faut bien retrouver le
-- compte d'une fiche pour changer son mot de passe). PERSONNE n'écrit ici
-- directement : tout passe par les fonctions de la section 7, qui vérifient
-- qui appelle avant de toucher à `auth.users`.
alter table public.profiles enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- La page de connexion doit pouvoir afficher le nom et le logo de l'école
-- AVANT que quiconque soit connecté. C'est aussi cette ligne-là qui porte toute
-- la vitrine du site public : ses textes, son image de fond, sa vidéo et ses
-- coordonnées (colonnes `site_*`).
drop policy if exists schools_public_read on public.schools;
create policy schools_public_read on public.schools
  for select to anon using (true);

-- LE SITE PUBLIC LIT SES FORMATIONS SANS COMPTE.
--
-- C'est la deuxième et DERNIÈRE porte ouverte à un visiteur anonyme. Elle ne
-- rend que les formations AFFICHÉES : une annonce qu'on a masquée depuis la
-- gestion ne sort pas, même si l'on devine son adresse. Le filtre est posé ici,
-- dans la politique — l'appliquer seulement côté navigateur reviendrait à le
-- laisser au bon vouloir de celui qui écrit la requête.
--
-- La lecture ne donne rien d'autre : ni les inscrits, ni les fiches des
-- entraîneurs. C'est pour cela que le nom de l'encadrant est RECOPIÉ sur la
-- formation.
drop policy if exists website_formations_public_read on public.website_formations;
create policy website_formations_public_read on public.website_formations
  for select to anon using (hidden is not true);


-- =============================================================================
--  7. LES COMPTES — CRÉER, RENOMMER, SUPPRIMER
-- =============================================================================
--
--  POURQUOI DES FONCTIONS, ET PAS L'API D'ADMINISTRATION SUPABASE.
--
--  Créer un compte pour QUELQU'UN D'AUTRE demande normalement la clé de service
--  (`service_role`), qui donne tous les droits sur le projet. Une application
--  qui tourne dans un navigateur ne peut pas la porter : elle serait lisible
--  par n'importe qui ouvrant les outils de développement.
--
--  Ces fonctions font le travail à sa place. Elles écrivent DIRECTEMENT dans
--  `auth.users` — la vraie table d'authentification de Supabase, pas une copie
--  — avec le mot de passe chiffré par `crypt()`, exactement comme Supabase le
--  fait lui-même. Un compte ainsi créé se connecte donc par
--  `signInWithPassword()` normal, et rien ne le distingue d'un autre.
--
--  Elles sont `security definer` (elles s'exécutent avec les droits du
--  propriétaire du schéma) et VÉRIFIENT ELLES-MÊMES qui appelle : sans cela,
--  n'importe quel visiteur se fabriquerait un compte d'administration.
-- =============================================================================

-- ---- L'écriture dans `auth.users` -------------------------------------------
--
-- Le cœur de la mécanique, appelé par toutes les fonctions publiques
-- ci-dessous. Il n'est PAS exposé au navigateur (aucun `grant execute` à
-- `anon` / `authenticated`) : on n'y arrive qu'en passant par une fonction qui
-- a vérifié les droits de l'appelant.
create or replace function public.raw_create_auth_user(
  p_email     text,
  p_password  text,
  p_role      public.app_role,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_id     uuid := gen_random_uuid();
  v_email  text := lower(trim(p_email));
  v_has_provider_id boolean;
begin
  if v_email is null or v_email = '' then
    raise exception 'L''email est obligatoire.' using errcode = '22023';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Le mot de passe doit contenir au moins 6 caractères.' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Cet email est déjà utilisé par un autre compte.' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('role', p_role::text, 'full_name', coalesce(p_full_name, '')),
    now(), now(),
    '', '', '', ''
  );

  -- `auth.identities` a changé de forme selon les versions de Supabase : la
  -- colonne `provider_id` est apparue en cours de route. On s'adapte plutôt que
  -- d'exiger une version précise.
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
  ) into v_has_provider_id;

  if v_has_provider_id then
    execute
      'insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                                    last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, $3, ''email'', now(), now(), now())'
      using v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email);
  else
    execute
      'insert into auth.identities (id, user_id, identity_data, provider,
                                    last_sign_in_at, created_at, updated_at)
       values ($1, $2, $3, ''email'', now(), now(), now())'
      using v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email);
  end if;

  return v_id;
end;
$$;

revoke all on function public.raw_create_auth_user(text, text, public.app_role, text) from public, anon, authenticated;


-- ---- Y a-t-il déjà un administrateur ? --------------------------------------
--
-- La page de connexion pose cette question AVANT que quiconque soit connecté :
-- c'est elle qui décide d'afficher — ou de ne plus afficher — le bouton
-- « Créer le compte administrateur ».
create or replace function public.admin_exists()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;


-- ---- LE PREMIER ADMINISTRATEUR ----------------------------------------------
--
-- La seule fonction que quelqu'un de NON connecté peut appeler pour créer un
-- compte, et elle ne sert qu'une fois : dès qu'un administrateur existe, elle
-- refuse. C'est ce qui rend le bouton de la page de connexion sûr — il ne peut
-- pas amorcer une école qui tourne déjà.
create or replace function public.bootstrap_admin(
  p_email     text,
  p_password  text,
  p_full_name text default 'Administration'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_email text := lower(trim(p_email));
begin
  if public.admin_exists() then
    raise exception 'Un administrateur existe déjà pour cette école.' using errcode = '42501';
  end if;

  v_id := public.raw_create_auth_user(v_email, p_password, 'admin', p_full_name);

  insert into public.profiles (id, entity_id, role, email, username, full_name)
  values (v_id, v_id::text, 'admin', v_email, v_email, coalesce(nullif(trim(p_full_name), ''), 'Administration'));

  return v_id::text;
end;
$$;


-- ---- Créer le compte de quelqu'un d'autre -----------------------------------
--
-- Appelée par « Nouvel enseignant », « Nouvel élève », « Nouveau parent » et
-- « Activer un compte de connexion » sur la fiche d'un travailleur.
--
-- `p_entity_id` À NULL VEUT DIRE : la fiche naît en même temps que le compte,
-- et prend son identifiant. Renseigné, il désigne une fiche qui EXISTE DÉJÀ —
-- le cas du travailleur à qui l'accès est ouvert après coup : sa fiche, ses
-- pointages et ses acomptes ne bougent pas, c'est le compte qui pointe vers eux.
create or replace function public.create_app_user(
  p_email     text,
  p_password  text,
  p_role      text,
  p_full_name text default '',
  p_username  text default null,
  p_entity_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_email  text := lower(trim(p_email));
  v_user   text;
  v_role   public.app_role := p_role::public.app_role;
begin
  if not (public.is_admin()
          or public.can_write(array['workers','teachers','students','parents','dashboard'])) then
    raise exception 'Vous n''avez pas le droit de créer un compte.' using errcode = '42501';
  end if;

  -- Seule l'administration fabrique une autre administration.
  if v_role = 'admin' and not public.is_admin() then
    raise exception 'Seule l''administration peut créer un compte administrateur.' using errcode = '42501';
  end if;

  v_user := lower(coalesce(nullif(trim(p_username), ''), v_email));
  if exists (select 1 from public.profiles p where lower(p.username) = v_user) then
    raise exception 'Ce nom d''utilisateur est déjà pris.' using errcode = '23505';
  end if;

  v_id := public.raw_create_auth_user(v_email, p_password, v_role, p_full_name);

  insert into public.profiles (id, entity_id, role, email, username, full_name)
  values (v_id, coalesce(nullif(trim(p_entity_id), ''), v_id::text), v_role, v_email, v_user, coalesce(p_full_name, ''));

  return v_id::text;
end;
$$;


-- ---- Le compte qui pilote une fiche -----------------------------------------
--
-- L'identifiant d'une fiche n'est pas toujours celui de son compte. Pour
-- changer un mot de passe depuis l'écran des enseignants ou des travailleurs,
-- il faut d'abord retrouver le compte.
create or replace function public.account_id_for_entity(p_entity_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.id::text
    from public.profiles p
   where public.is_staff()
     and (p.entity_id = p_entity_id or p.id::text = p_entity_id)
   order by (p.entity_id = p_entity_id) desc
   limit 1;
$$;


-- ---- Retrouver un compte, quel que soit l'identifiant qu'on présente -------
--
-- LES ÉCRANS N'ONT PAS TOUJOURS L'IDENTIFIANT DU COMPTE SOUS LA MAIN. La fiche
-- d'un enseignant appelle `resetUserPassword(teacher.id)` : c'est l'identifiant
-- de la FICHE. Il se trouve être aussi celui du compte quand les deux sont nés
-- ensemble — mais pas pour un travailleur à qui l'accès a été ouvert après coup.
--
-- Cette fonction accepte les deux, et rend NULL — sans lever — quand la fiche
-- n'a pas de compte du tout : une personne créée sans identifiants, ce qui est
-- un cas parfaitement normal. Elle encaisse aussi un identifiant qui n'est pas
-- un UUID, plutôt que de faire échouer la conversion.
create or replace function public.resolve_account(p_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
   where p.id::text = p_id or p.entity_id = p_id
   order by (p.id::text = p_id) desc
   limit 1;
$$;


-- ---- Changer le mot de passe de quelqu'un d'autre ---------------------------
create or replace function public.set_app_user_password(p_id text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uuid uuid := public.resolve_account(p_id);
begin
  if not (public.is_staff() or v_uuid = auth.uid()) then
    raise exception 'Vous n''avez pas le droit de changer ce mot de passe.' using errcode = '42501';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Le mot de passe doit contenir au moins 6 caractères.' using errcode = '22023';
  end if;
  if v_uuid is null then
    raise exception 'Cette fiche n''a pas de compte de connexion.' using errcode = 'P0002';
  end if;

  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at = now()
   where id = v_uuid;
end;
$$;


-- ---- Changer l'email de connexion -------------------------------------------
--
-- Modifier une fiche doit garder son email de connexion en phase, sinon la
-- personne se retrouve à taper une adresse qui ne la reconnaît plus.
create or replace function public.set_app_user_email(p_id text, p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
  v_uuid  uuid := public.resolve_account(p_id);
  v_old   text;
begin
  if not (public.is_staff() or v_uuid = auth.uid()) then
    raise exception 'Vous n''avez pas le droit de changer cet email.' using errcode = '42501';
  end if;
  if v_email is null or v_email = '' or v_uuid is null then
    return; -- une fiche sans compte n'a pas d'email de connexion à suivre
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email and u.id <> v_uuid) then
    raise exception 'Cet email est déjà utilisé par un autre compte.' using errcode = '23505';
  end if;

  select p.email into v_old from public.profiles p where p.id = v_uuid;

  update auth.users set email = v_email, updated_at = now() where id = v_uuid;
  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', v_email),
         updated_at = now()
   where user_id = v_uuid and provider = 'email';

  -- Le nom d'utilisateur suivait l'email tant qu'on ne l'a pas personnalisé.
  update public.profiles
     set email = v_email,
         username = case when lower(username) = lower(coalesce(v_old, '')) then v_email else username end,
         updated_at = now()
   where id = v_uuid;
end;
$$;


-- ---- Changer le nom d'utilisateur -------------------------------------------
create or replace function public.set_app_user_username(p_id text, p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text := lower(trim(p_username));
  v_uuid uuid := public.resolve_account(p_id);
begin
  if not (public.is_staff() or v_uuid = auth.uid()) then
    raise exception 'Vous n''avez pas le droit de changer ce nom d''utilisateur.' using errcode = '42501';
  end if;
  if v_user is null or v_user = '' or v_uuid is null then
    return;
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = v_user and p.id <> v_uuid) then
    raise exception 'Ce nom d''utilisateur est déjà pris.' using errcode = '23505';
  end if;

  update public.profiles set username = v_user, updated_at = now() where id = v_uuid;
end;
$$;


-- ---- Le nom affiché ---------------------------------------------------------
create or replace function public.set_app_user_name(p_id text, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uuid uuid := public.resolve_account(p_id);
begin
  if not (public.is_staff() or v_uuid = auth.uid()) then
    raise exception 'Vous n''avez pas le droit de renommer ce compte.' using errcode = '42501';
  end if;
  if v_uuid is null then
    return;
  end if;
  update public.profiles set full_name = coalesce(p_full_name, ''), updated_at = now()
   where id = v_uuid;
end;
$$;


-- ---- Supprimer un compte ----------------------------------------------------
--
-- Ne lève jamais quand le compte n'existe pas : une fiche créée sans
-- identifiants n'en a tout simplement pas, et elle s'en va quand même.
create or replace function public.delete_app_user(p_id text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uuid uuid;
begin
  if not public.is_staff() then
    raise exception 'Vous n''avez pas le droit de supprimer un compte.' using errcode = '42501';
  end if;

  v_uuid := public.resolve_account(p_id);

  if v_uuid is null then
    return;
  end if;

  -- Le dernier administrateur ne se supprime pas : plus personne ne pourrait
  -- ouvrir l'école.
  if (select role from public.profiles where id = v_uuid) = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'C''est le dernier compte administrateur : il ne peut pas être supprimé.'
      using errcode = '42501';
  end if;

  delete from auth.users where id = v_uuid; -- `profiles` suit en cascade
end;
$$;


-- ---- SE CONNECTER AVEC UN NOM D'UTILISATEUR ---------------------------------
--
-- Supabase ne connaît que les emails. Au comptoir, on tape « yasmine ». Cette
-- fonction traduit l'un en l'autre, et l'application enchaîne sur une connexion
-- Supabase tout à fait ordinaire.
--
-- Elle rend NULL quand personne ne répond à cet identifiant — la page de
-- connexion affiche alors le même message que pour un mot de passe faux, et
-- rien ne se déduit de la différence.

-- ---- LA FAMILLE QUI CRÉE SON PROPRE COMPTE ----------------------------------
--
-- La page de connexion propose « créer mon compte » à un chevalier ou à un
-- parent. Personne au comptoir n'a rien saisi : c'est la famille qui remplit le
-- formulaire, depuis son téléphone, et elle n'est par définition PAS connectée.
-- La fonction est donc ouverte à `anon` — mais elle ne donne aucun pouvoir :
--
--   • le rôle est FORCÉ à 'student' ou 'parent'. Aucun paramètre ne permet de
--     se fabriquer une intendance, encore moins une administration ;
--   • le profil naît INACTIF (`active = false`) et pointe son propre
--     identifiant, donc AUCUNE fiche : la RLS ne lui rend rien, et
--     l'application lui montre un écran d'attente ;
--   • la demande est enregistrée pour que l'intendance la traite.
--
-- Autrement dit : le compte existe et se connecte, mais il ne voit rien tant
-- qu'un humain du club ne l'a pas rattaché à une fiche.
-- ---- DEUX NUMÉROS SONT-ILS LE MÊME NUMÉRO ? ---------------------------------
--
-- « 0555 12 34 56 », « +213 555 123 456 » et « 00213555123456 » sont un seul et
-- même téléphone. Les comparer caractère par caractère, c'est ne reconnaître
-- personne — chaque écran de saisie ayant ses habitudes.
--
-- Cette fonction ramène tout à la même forme internationale en chiffres nus, et
-- rend NULL quand ce qu'on lui donne ne peut pas être un numéro. Elle traduit,
-- ligne pour ligne, `toInternational()` de `lib/whatsapp/phone.ts` :
-- l'application et la base doivent reconnaître les mêmes numéros, sans quoi
-- l'écran proposerait un rapprochement que la base aurait refusé.
create or replace function public.phone_msisdn(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  -- L'indicatif appliqué à un numéro saisi en format national.
  c    text := '213';
  d    text;
  rest text;
begin
  if p_raw is null then
    return null;
  end if;

  d := regexp_replace(p_raw, '\D', '', 'g');
  if d = '' then
    return null;
  end if;

  -- Préfixe international composé : 00213… → 213…
  if left(d, 2) = '00' then
    d := substr(d, 3);
  end if;

  -- Déjà international. Un 0 national qui traîne derrière l'indicatif
  -- (« 213 0555… ») s'enlève.
  if left(d, length(c)) = c and length(d) > length(c) then
    rest := substr(d, length(c) + 1);
    if left(rest, 1) = '0' then
      rest := substr(rest, 2);
    end if;
    return c || rest;
  end if;

  -- Format national : 0555123456 → 213555123456
  if left(d, 1) = '0' then
    rest := substr(d, 2);
    if length(rest) < 8 then
      return null;
    end if;
    return c || rest;
  end if;

  -- Numéro nu, sans indicatif ni 0 : 555123456 → 213555123456
  if length(d) = 9 then
    return c || d;
  end if;

  -- Un autre indicatif pays saisi tel quel (une famille à l'étranger) : on le
  -- garde, à condition que cela ressemble encore à un numéro.
  if length(d) between 10 and 15 then
    return d;
  end if;

  return null;
end;
$$;


-- ---- LE NUMÉRO DÉSIGNE-T-IL QUELQU'UN — ET UNE SEULE PERSONNE ? -------------
--
-- Elle rend l'identifiant de la fiche trouvée, ou NULL. NULL veut dire « je ne
-- tranche pas » — aussi bien « personne » que « plusieurs ». Dans les deux cas
-- la demande part en attente, et c'est l'intendance qui regarde.
--
-- LES DEUX NUMÉROS DE LA DEMANDE sont comparés aux DEUX numéros de chaque
-- fiche : la mère qui inscrit son fils sous son propre numéro est retrouvée
-- quand même.
--
-- POUR UN PARENT, DEUX CHEMINS, dans cet ordre : sa propre fiche de parent
-- d'abord ; à défaut, la fiche de son fils — un père n'est souvent connu du
-- club que par le numéro porté sur le dossier de son enfant.
--
-- ELLE N'EST OUVERTE À PERSONNE. `security definer` lui donne de lire des
-- tables que la RLS ferme, et c'est bien pour cela qu'elle est RÉVOQUÉE plus
-- bas : ouverte au dehors, elle répondrait « oui, ce numéro est au club » à
-- quiconque poserait la question, ce qui est exactement le genre de réponse
-- qu'on ne donne pas.
create or replace function public.match_family_entity(
  p_kind   text,
  p_phone  text,
  p_phone2 text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nums  text[];
  v_id    text;
  v_count integer;
begin
  v_nums := array_remove(
    array[public.phone_msisdn(p_phone), public.phone_msisdn(p_phone2)],
    null
  );
  if array_length(v_nums, 1) is null then
    return null;
  end if;

  if p_kind = 'parent' then
    select count(*), min(p.id)
      into v_count, v_id
      from public.parents p
     where public.phone_msisdn(p.phone)  = any (v_nums)
        or public.phone_msisdn(p.phone2) = any (v_nums);

    if v_count = 1 then
      return v_id;
    end if;
    -- Plusieurs parents portent ce numéro : on ne devine pas lequel.
    if v_count > 1 then
      return null;
    end if;

    -- Le père que le club ne connaît que par la fiche de son fils.
    select count(distinct s.parent_id), min(s.parent_id)
      into v_count, v_id
      from public.students s
     where s.parent_id is not null
       and (public.phone_msisdn(s.phone)  = any (v_nums)
         or public.phone_msisdn(s.phone2) = any (v_nums));

    if v_count = 1 then
      return v_id;
    end if;
    return null;
  end if;

  select count(*), min(s.id)
    into v_count, v_id
    from public.students s
   where public.phone_msisdn(s.phone)  = any (v_nums)
      or public.phone_msisdn(s.phone2) = any (v_nums);

  if v_count = 1 then
    return v_id;
  end if;
  return null;
end;
$$;

revoke all on function public.match_family_entity(text, text, text) from public, anon, authenticated;


-- L'ANCIENNE SIGNATURE EST RETIRÉE AVANT LA NOUVELLE.
--
-- La fonction ne rend plus un identifiant nu mais un OBJET (`jsonb`) qui dit ce
-- qui s'est passé — le compte a-t-il été rattaché, à quelle fiche, sous quel
-- nom. PostgreSQL ne remplace pas une fonction dont le type de retour change, et
-- PostgREST — qui choisit par les noms d'arguments reçus — refuserait l'appel
-- avec « could not choose the best candidate function » si les deux restaient.
drop function if exists public.request_account(
  text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb
);
drop function if exists public.request_account(
  text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text, text
);

create function public.request_account(
  p_email                text,
  p_password             text,
  p_kind                 text,
  p_first_name           text default '',
  p_last_name            text default '',
  p_phone                text default '',
  p_phone2               text default null,
  p_birth_date           text default null,
  p_address              text default null,
  p_existing_member      boolean default false,
  p_children_subscribed  boolean default null,
  p_children             jsonb default '[]'::jsonb,
  -- « login » (la page de connexion) ou « website » (le site public).
  p_source               text default 'login',
  -- La formation du site sur laquelle la demande porte, le cas échéant. Elle
  -- n'inscrit RIEN et ne facture RIEN : c'est une intention, que l'intendance
  -- transforme en inscription réelle quand elle vérifie la demande.
  p_formation_id         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid;
  v_email     text := lower(trim(p_email));
  v_role      public.app_role;
  v_name      text := nullif(trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), '');
  v_formation text;
  v_entity    text;
  v_entity_nm text;
  -- La demande porte-t-elle du travail que l'activation ne fait pas ?
  v_extra     boolean;
  v_status    text;
begin
  -- LE RÔLE EST FORCÉ. C'est la garantie de tout le reste : quoi qu'on envoie,
  -- on ne peut sortir d'ici qu'avec un compte de chevalier ou de parent.
  if p_kind = 'student' then
    v_role := 'student';
  elsif p_kind = 'parent' then
    v_role := 'parent';
  else
    raise exception 'Type de compte invalide.' using errcode = '22023';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'L''email est obligatoire.' using errcode = '22023';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Le mot de passe doit contenir au moins 6 caractères.' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Indiquez au moins un nom ou un prénom.' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = v_email) then
    raise exception 'Cet email est déjà utilisé par un autre compte.' using errcode = '23505';
  end if;

  -- Une formation qui n'existe pas (ou plus) ne bloque pas la création du
  -- compte : la demande arrive simplement sans formation, et l'intendance la
  -- traite comme n'importe quelle autre.
  v_formation := (select f.id from public.website_formations f where f.id = p_formation_id);

  v_id := public.raw_create_auth_user(v_email, p_password, v_role, v_name);

  -- LA DÉTECTION — le numéro de téléphone reconnaît un membre du club.
  --
  -- Un chevalier inscrit depuis deux ans n'a aucune raison d'attendre qu'un
  -- humain rapproche à la main deux lignes que son numéro désigne comme une
  -- seule et même personne. Quand il le désigne SANS AMBIGUÏTÉ, le compte est
  -- rattaché à la fiche et actif d'emblée.
  v_entity := public.match_family_entity(p_kind, p_phone, p_phone2);

  -- UNE FICHE DÉJÀ PILOTÉE NE SE REPREND PAS. Deux comptes sur une même fiche,
  -- ce serait donner à l'un ce qui appartient à l'autre : au moindre doute, la
  -- demande repart en attente et c'est l'intendance qui tranche.
  if v_entity is not null
     and exists (select 1 from public.profiles p where p.entity_id = v_entity) then
    v_entity := null;
  end if;

  if v_entity is not null then
    if p_kind = 'parent' then
      select nullif(trim(pa.first_name || ' ' || pa.last_name), '')
        into v_entity_nm
        from public.parents pa
       where pa.id = v_entity;
      -- La fiche gagne l'email de connexion : c'est par lui qu'on la retrouvera,
      -- et l'écran de la fiche l'affiche comme n'importe quel autre.
      update public.parents set email = v_email where id = v_entity;
    else
      select nullif(trim(st.first_name || ' ' || st.last_name), '')
        into v_entity_nm
        from public.students st
       where st.id = v_entity;
      update public.students set email = v_email where id = v_entity;
    end if;
  end if;

  -- LE PROFIL. Rattaché et ACTIF quand le numéro a reconnu quelqu'un ; sinon
  -- pointant son propre identifiant, donc AUCUNE fiche — la RLS ne lui rend ni
  -- chevalier, ni paiement, ni présence, et l'application lui montre l'écran
  -- d'attente. C'est exactement ce qu'on veut tant que personne n'a vérifié.
  insert into public.profiles (id, entity_id, role, email, username, full_name, active)
  values (
    v_id,
    coalesce(v_entity, v_id::text),
    v_role,
    v_email,
    v_email,
    v_name,
    v_entity is not null
  );

  -- LA DEMANDE RESTE OUVERTE TANT QU'IL RESTE À FAIRE. Activer un compte n'est
  -- pas traiter une demande : une formation à facturer, des fils à créer,
  -- attendent toujours un humain — même quand la porte est déjà ouverte.
  v_extra := v_formation is not null
             or (p_kind = 'parent'
                 and coalesce(jsonb_array_length(coalesce(p_children, '[]'::jsonb)), 0) > 0);

  v_status := case when v_entity is not null and not v_extra then 'linked' else 'pending' end;

  insert into public.account_requests (
    id, account_id, kind, source, formation_id,
    first_name, last_name, phone, phone2, birth_date, address,
    email, existing_member, children_subscribed, children,
    status, linked_entity_id, auto_linked, reviewed_at, reviewed_by_name, created_at
  ) values (
    'req-' || replace(v_id::text, '-', ''),
    v_id,
    p_kind,
    case when p_source = 'website' then 'website' else 'login' end,
    v_formation,
    coalesce(trim(p_first_name), ''),
    coalesce(trim(p_last_name), ''),
    coalesce(trim(p_phone), ''),
    nullif(trim(coalesce(p_phone2, '')), ''),
    nullif(trim(coalesce(p_birth_date, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    v_email,
    coalesce(p_existing_member, false),
    p_children_subscribed,
    coalesce(p_children, '[]'::jsonb),
    v_status,
    v_entity,
    v_entity is not null,
    case when v_status = 'linked' then to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF') end,
    case when v_status = 'linked' then 'Détection automatique' end,
    to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
  );

  return jsonb_build_object(
    'account_id',  v_id::text,
    'kind',        p_kind,
    'linked',      v_entity is not null,
    'entity_id',   v_entity,
    'entity_name', v_entity_nm,
    'pending',     v_status = 'pending'
  );
end;
$$;


-- ---- RATTACHER UN COMPTE EN ATTENTE À SA FICHE, ET L'ACTIVER ---------------
--
-- Le geste que l'intendance pose au bout du traitement d'une demande : le
-- profil pointe désormais la fiche (chevalier ou parent) et devient ACTIF. À sa
-- prochaine ouverture, la famille voit exactement ce qu'elle verrait si le
-- comptoir avait tout saisi lui-même.
--
-- Elle refuse tout ce qui n'est pas ce geste-là : seul un compte du comptoir
-- peut l'appeler, et seul un profil de chevalier ou de parent peut en être la
-- cible. On ne se sert pas de cette porte pour déplacer une administration.
create or replace function public.link_account_entity(
  p_account_id text,
  p_entity_id  text,
  p_role       text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_role    public.app_role;
begin
  if not (
    public.is_admin()
    or public.can_write(array['dashboard','students','parents','website-inscriptions'])
  ) then
    raise exception 'Vous n''avez pas le droit d''activer un compte.' using errcode = '42501';
  end if;

  if p_role = 'student' then
    v_role := 'student';
  elsif p_role = 'parent' then
    v_role := 'parent';
  else
    raise exception 'Type de compte invalide.' using errcode = '22023';
  end if;

  begin
    v_account := p_account_id::uuid;
  exception when others then
    raise exception 'Compte introuvable.' using errcode = '22023';
  end;

  if nullif(trim(coalesce(p_entity_id, '')), '') is null then
    raise exception 'La fiche à rattacher est obligatoire.' using errcode = '22023';
  end if;

  -- On ne touche qu'aux comptes de familles : une intendance ou une
  -- administration ne se rattache pas à une fiche de chevalier.
  update public.profiles
     set entity_id  = p_entity_id,
         role       = v_role,
         active     = true,
         updated_at = now()
   where id = v_account
     and role in ('student', 'parent');

  if not found then
    raise exception 'Ce compte n''existe pas, ou n''est pas un compte de famille.'
      using errcode = '42501';
  end if;

  return true;
end;
$$;


create or replace function public.login_email(p_login text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.email
    from public.profiles p
   where lower(p.username) = lower(trim(p_login))
      or lower(p.email) = lower(trim(p_login))
   limit 1;
$$;


-- ---- Qui peut appeler quoi --------------------------------------------------
grant execute on function public.admin_exists()                       to anon, authenticated;
grant execute on function public.bootstrap_admin(text, text, text)    to anon, authenticated;
grant execute on function public.login_email(text)                    to anon, authenticated;
-- La création de compte par la famille elle-même : ouverte à qui n'est pas
-- encore connecté, puisque c'est précisément son cas. Le rôle y est FORCÉ et le
-- profil naît inactif — voir la fonction.
grant execute on function public.request_account(text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text, text) to anon, authenticated;
grant execute on function public.phone_msisdn(text)                   to anon, authenticated;
grant execute on function public.link_account_entity(text, text, text)  to authenticated;


grant execute on function public.create_app_user(text, text, text, text, text, text) to authenticated;
grant execute on function public.account_id_for_entity(text)          to authenticated;
grant execute on function public.resolve_account(text)                to authenticated;
grant execute on function public.set_app_user_password(text, text)    to authenticated;
grant execute on function public.set_app_user_email(text, text)       to authenticated;
grant execute on function public.set_app_user_username(text, text)    to authenticated;
grant execute on function public.set_app_user_name(text, text)        to authenticated;
grant execute on function public.delete_app_user(text)                to authenticated;

grant execute on function public.my_role()          to authenticated;
grant execute on function public.my_entity_id()     to authenticated;
grant execute on function public.my_pages()         to authenticated;
grant execute on function public.my_actions()       to authenticated;
grant execute on function public.my_student_ids()   to authenticated;
grant execute on function public.can_page(text)     to authenticated;
grant execute on function public.can_action(text, text) to authenticated;


-- =============================================================================
--  8. LE STOCKAGE DES IMAGES
-- =============================================================================
--
--  UN SEUL DÉPÔT :
--
--    `logos` — l'écusson du club, affiché sur la page de connexion, dans la
--              barre latérale et en tête de chaque document imprimé.
--
--  (`subjects` a disparu avec l'écran « Sujets & exercices ».)
--
--  IL EST PUBLIC EN LECTURE, et c'est voulu : l'application range l'URL
--  publique du fichier dans la ligne (`schools.logo`) et la rend telle quelle
--  dans un `<img>`. Une page de connexion doit pouvoir
--  afficher le logo AVANT que quiconque soit connecté, et un document imprimé
--  doit pouvoir l'afficher sans jeton.
--
--  L'ÉCRITURE, elle, est réservée : seuls l'administration et les travailleurs
--  autorisés déposent, remplacent ou effacent un fichier.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos',    'logos',    true, 5242880,
   array['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---- Qui lit, qui dépose ----------------------------------------------------
--
-- `storage.objects` n'appartient pas toujours au rôle qui exécute ce script :
-- sur certains projets, seul `supabase_storage_admin` peut y poser une
-- politique. On essaie, et si le projet refuse on le DIT plutôt que de faire
-- tomber tout le reste du schéma — les buckets, eux, sont déjà créés, et les
-- politiques se posent alors depuis Storage -> Policies dans le tableau de bord.
do $storage$
begin
  drop policy if exists "app images are publicly readable" on storage.objects;
  drop policy if exists "staff upload app images"          on storage.objects;
  drop policy if exists "staff update app images"          on storage.objects;
  drop policy if exists "staff delete app images"          on storage.objects;

  create policy "app images are publicly readable" on storage.objects
    for select to public
    using (bucket_id = 'logos');

  create policy "staff upload app images" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'logos'
      and public.can_write(array['settings','website'])
    );

  create policy "staff update app images" on storage.objects
    for update to authenticated
    using (
      bucket_id = 'logos'
      and public.can_write(array['settings','website'])
    );

  create policy "staff delete app images" on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'logos'
      and public.can_write(array['settings','website'])
    );
exception
  when insufficient_privilege then
    raise notice
      'Les politiques de storage.objects n''ont pas pu être posées depuis ce script. '
      'Les deux buckets existent : ouvrez Storage -> Policies et autorisez '
      'l''envoi de fichiers aux comptes connectes.';
end
$storage$;


-- =============================================================================
--  8 bis. LES PRIVILÈGES
-- =============================================================================
--
--  La RLS dit quelles LIGNES un compte voit ; les privilèges disent quelles
--  TABLES il peut seulement adresser. Supabase les accorde d'office aux tables
--  créées dans `public`, mais un projet dont les privilèges par défaut ont été
--  resserrés rendrait « permission denied » là où la RLS aurait suffi. On les
--  repose donc explicitement — ils n'ouvrent rien : sans politique qui
--  l'autorise, la ligne reste invisible.
-- =============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.schools to anon;
-- Le site public lit les formations sans compte : la politique `anon` ci-dessus
-- ne suffit pas, il faut aussi le privilège sur la table.
grant select on public.website_formations to anon;


-- =============================================================================
--  9. CE QUI RESTE À FAIRE, ET COMMENT VÉRIFIER
-- =============================================================================
--
--  1. Ce script une fois passé, la base est prête MAIS VIDE : aucune école
--     n'a encore de compte.
--
--  2. Ouvrez l'application. La page de connexion propose
--     « Créer le compte administrateur » — c'est `bootstrap_admin()` qui
--     répond. Le bouton DISPARAÎT dès que ce compte existe, ici comme pour
--     tout autre visiteur : `admin_exists()` est interrogée à chaque
--     chargement, et la fonction elle-même refuse un second amorçage.
--
--  3. Connectez-vous, puis créez les travailleurs depuis « Travailleurs ».
--     Cochez « Activer un compte de connexion », puis ouvrez « Droits d'accès »
--     pour choisir ses écrans et ses boutons. Il se connectera avec son email
--     OU son nom d'utilisateur.
--
--  4. LE SITE PUBLIC est servi par l'application elle-même, sur `/site`. Il ne
--     demande aucune installation de plus : il s'habille depuis « Site web »
--     (l'image d'accueil, la vidéo, les deux présentations, les coordonnées) et
--     se remplit avec les formations qu'on y publie. Ce que le visiteur y dépose
--     — une inscription — arrive dans « Inscriptions du site ».
--
--  LES REQUÊTES DE CONTRÔLE
--
--    -- Les 42 tables métier sont-elles là, et toutes protégées ?
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' order by tablename;
--
--    -- Le catalogue des droits (18 écrans, 101 boutons)
--    select page_key, action_id, permission_key from public.app_permission_catalog;
--
--    -- CE QUE LE DEHORS PEUT LIRE. Deux tables, et pas une de plus :
--    -- l'établissement (nom, logo, vitrine) et les formations affichées.
--    select schemaname, tablename, policyname from pg_policies
--     where schemaname = 'public' and 'anon' = any (roles);
--
--    -- Les comptes existants, et la fiche que chacun pilote
--    select role, email, username, entity_id from public.profiles order by role, email;
--
--    -- Les droits réellement accordés à un travailleur
--    select first_name, last_name, nav_keys, action_keys from public.reception_staff;
-- =============================================================================

select
  (select count(*) from public.app_pages)        as ecrans,
  (select count(*) from public.app_page_actions) as boutons,
  (select count(*) from pg_tables where schemaname = 'public') as tables,
  (select count(*) from storage.buckets where id = 'logos') as buckets,
  public.admin_exists() as administrateur_existe;
