-- =============================================================================
--  ORDRE DES CHEVALIERS — MISE À JOUR D'UNE BASE DÉJÀ INSTALLÉE
-- =============================================================================
--
--  À exécuter UNE fois, dans : Supabase Dashboard -> SQL Editor -> New query.
--
--  Ce script est IDEMPOTENT : le relancer ne casse rien et ne double rien.
--  Il ne détruit aucune donnée métier, à UNE exception près, annoncée en
--  section 5 et volontairement placée en dernier — la table `subjects`, dont
--  l'écran a été retiré de l'application.
--
--  SI VOUS PARTEZ D'UNE BASE NEUVE, n'exécutez pas ce fichier : lancez
--  `supabase/schema.sql`, qui contient déjà tout ce qui suit.
--
-- -----------------------------------------------------------------------------
--  CE QU'IL FAIT, ET POURQUOI
--
--   1. Les CATÉGORIES gagnent leur tranche d'âge (`age_from`, `age_to`), et les
--      colonnes de l'ancien modèle (cours / formation / niveau) deviennent
--      facultatives sans être effacées.
--   2. Les RUBRIQUES DE CAISSE apparaissent (`cash_categories`), et un
--      mouvement de caisse peut s'y rattacher.
--   3. Le CATALOGUE DES DROITS est réétiqueté dans le nouveau vocabulaire.
--   4. Les RÔLES ne changent pas — et la section explique pourquoi.
--   5. L'écran « Sujets & exercices » et sa table s'en vont.
--
--  CE QU'IL NE FAIT PAS, DÉLIBÉRÉMENT : renommer quoi que ce soit.
--
--  Les colonnes gardent leurs noms — `salle_id`, `month_code`, `classes` —
--  parce qu'ils sont le contrat entre l'application et la base. Le mot « mois »
--  est devenu « carte » À L'ÉCRAN seulement : `month_code` vaut toujours
--  « M1 », « M2 », et l'application affiche « Carte 1 » et « C1 » à partir de
--  cette même valeur. Réécrire ces codes aurait rendu illisibles les fiches de
--  paie déjà figées, les points d'entrée d'inscription et les crédits de solde,
--  pour un gain nul.
-- =============================================================================


-- =============================================================================
--  1. LES CATÉGORIES ET LEUR TRANCHE D'ÂGE
-- =============================================================================
--
--  Une catégorie ne porte plus que trois choses : un nom, une description et
--  les âges qu'elle accueille. Les colonnes de l'ancien modèle restent en
--  place : des fiches les portent déjà, et le périmètre des droits d'entrée
--  réglé par NIVEAU (`schools.registration_fee_levels`) les lit encore.
--
--  `type` perd son `not null` et sa valeur par défaut : une catégorie créée
--  aujourd'hui n'est ni un cours ni une formation, et lui en imposer un serait
--  écrire une donnée fausse.
-- =============================================================================

alter table public.classes add column if not exists age_from integer;
alter table public.classes add column if not exists age_to   integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.classes'::regclass and conname = 'classes_age_from_check'
  ) then
    alter table public.classes
      add constraint classes_age_from_check
      check (age_from is null or age_from between 0 and 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.classes'::regclass and conname = 'classes_age_to_check'
  ) then
    alter table public.classes
      add constraint classes_age_to_check
      check (age_to is null or age_to between 0 and 120);
  end if;

  -- Une tranche à l'envers n'a pas de sens et l'écran la refuse déjà ; la base
  -- le refuse aussi, pour que rien d'écrit ailleurs ne puisse la contourner.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.classes'::regclass and conname = 'classes_age_range_check'
  ) then
    alter table public.classes
      add constraint classes_age_range_check
      check (age_from is null or age_to is null or age_to >= age_from);
  end if;
end $$;

alter table public.classes alter column type drop not null;
alter table public.classes alter column type drop default;

comment on column public.classes.age_from is 'Âge minimum admis dans la catégorie, en années révolues.';
comment on column public.classes.age_to   is 'Âge maximum admis dans la catégorie, en années révolues.';
comment on column public.classes.type     is 'Hérité : « cours » ou « formation ». La création ne le demande plus.';


-- =============================================================================
--  2. LES RUBRIQUES DE CAISSE
-- =============================================================================
--
--  « Équipement & armement », « Entretien des arènes », « Tournois » : de quoi
--  ranger les dépôts et les retraits pour que la Caisse et les Rapports en
--  donnent le total rubrique par rubrique.
--
--  DEUX CHOIX QUI COMPTENT :
--
--   - l'index UNIQUE sur le nom en minuscules. Deux rubriques homonymes ne se
--     distinguent plus dans un total : autant les empêcher d'exister.
--   - `on delete set null` sur le mouvement. Supprimer une rubrique ne doit
--     JAMAIS faire disparaître de l'argent : le mouvement redevient simplement
--     « non classé ». (L'écran, lui, refuse déjà de supprimer une rubrique qui
--     porte encore des mouvements — ceci est le filet en dessous.)
-- =============================================================================

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

comment on table public.cash_categories is
  'Les rubriques des mouvements de caisse manuels : dépôts et retraits.';

alter table public.cash_transactions
  add column if not exists category_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cash_transactions'::regclass
      and conname = 'cash_transactions_category_id_fkey'
  ) then
    alter table public.cash_transactions
      add constraint cash_transactions_category_id_fkey
      foreign key (category_id) references public.cash_categories (id) on delete set null;
  end if;
end $$;

create index if not exists cash_category_idx
  on public.cash_transactions (category_id);

comment on column public.cash_transactions.category_id is
  'La rubrique du mouvement. Vide = non classé (les paiements et les salaires, déjà classés par leur type, n''en portent pas).';

-- ---- La RLS de la nouvelle table --------------------------------------------
--
-- Elle suit exactement le modèle des autres : lecture pour le comptoir,
-- écriture pour qui a l'un des écrans qui s'en servent.
alter table public.cash_categories enable row level security;

drop policy if exists cash_categories_read  on public.cash_categories;
drop policy if exists cash_categories_write on public.cash_categories;

create policy cash_categories_read on public.cash_categories
  for select to authenticated using (public.is_staff());

create policy cash_categories_write on public.cash_categories
  for all to authenticated
  using (public.can_write(array['cash','dashboard','expenses']))
  with check (public.can_write(array['cash','dashboard','expenses']));

-- ---- Quelques rubriques pour démarrer ---------------------------------------
--
-- `do nothing` : si vous avez déjà nommé les vôtres, elles ne sont pas touchées.
insert into public.cash_categories (id, name, color) values
  ('ccat-equipement', 'Équipement & armement',         '#b08328'),
  ('ccat-entretien',  'Entretien des arènes',          '#35506f'),
  ('ccat-tournoi',    'Tournois & déplacements',       '#15803d'),
  ('ccat-apport',     'Apports & fonds de roulement',  '#b45309')
on conflict (id) do nothing;


-- =============================================================================
--  3. LE CATALOGUE DES DROITS, DANS LE NOUVEAU VOCABULAIRE
-- =============================================================================
--
--  Les CLÉS ne bougent pas — « classes », « students », « teachers » sont
--  stockées sur la fiche de chaque travailleur (`reception_staff.nav_keys`), et
--  les renommer lui retirerait tous ses écrans d'un coup. Seuls les LIBELLÉS
--  changent : c'est ce que l'écran « Droits d'accès » donne à lire.
-- =============================================================================

insert into public.app_pages (key, position, emoji, label, href, hint) values
  ('dashboard', 1, '📊', 'Tableau de bord', '/dashboard', 'Les emplois du temps du jour, les feuilles de présence et la caisse.'),
  ('classes', 2, '🛡️', 'Catégories', '/classes', 'Les catégories de l''Ordre et la tranche d''âge de chacune.'),
  ('planner', 3, '📅', 'Emplois du temps', '/planner', 'La grille des créneaux, les séances libres et les arènes.'),
  ('subscriptions', 4, '🎫', 'Cartes & tarifs', '/subscriptions', 'Le prix de la séance et de la carte, emploi du temps par emploi du temps.'),
  ('students', 5, '⚔️', 'Chevaliers', '/students', 'Les fiches des chevaliers, leurs inscriptions, leurs paiements et leurs dettes.'),
  ('attendance', 6, '✅', 'Présences', '/attendance', 'Les feuilles de présence et l''historique des pointages.'),
  ('teachers', 7, '🏅', 'Entraîneurs', '/teachers', 'Les fiches des entraîneurs, leurs parts et leur paie.'),
  ('workers', 9, '💼', 'Personnel', '/workers', 'Le personnel : métiers, comptes, droits, acomptes, absences et paie.'),
  ('independent', 10, '🚩', 'Séances libres', '/independent', 'Les séances vendues à l''unité et les sorties libres de groupe.'),
  ('parents', 11, '👨‍👩‍👧', 'Parents', '/parents', 'Les fiches des parents et leurs comptes.'),
  ('announcements', 12, '📢', 'Annonces', '/announcements', 'Les annonces publiées aux chevaliers et aux parents.'),
  ('expenses', 13, '🧾', 'Dépenses', '/expenses', 'Les dépenses du club et leurs catégories.'),
  ('analytics', 14, '📈', 'Statistiques', '/analytics', 'L''affluence des chevaliers par catégorie et par entraîneur.'),
  ('cash', 15, '💵', 'Caisse', '/cash', 'Les mouvements de caisse : dépôts, retraits, dépenses — et leurs rubriques.'),
  ('reports', 16, '💰', 'Rapports', '/reports', 'Le bilan du club sur une période. Cet écran se consulte ; il n''écrit rien.'),
  ('settings', 17, '⚙️', 'Paramètres', '/settings', 'Le club, la sécurité, WhatsApp et les sauvegardes.')
on conflict (key) do update set
  position = excluded.position,
  emoji    = excluded.emoji,
  label    = excluded.label,
  href     = excluded.href,
  hint     = excluded.hint;

-- Les libellés de boutons qui nommaient un élève, un enseignant ou une classe.
update public.app_page_actions set label = 'Créer une catégorie'            where page_key = 'classes' and action_id = 'create';
update public.app_page_actions set label = 'Voir le détail d''une catégorie' where page_key = 'classes' and action_id = 'view';
update public.app_page_actions set label = 'Modifier une catégorie'         where page_key = 'classes' and action_id = 'edit';
update public.app_page_actions set label = 'Supprimer une catégorie'        where page_key = 'classes' and action_id = 'delete';

update public.app_page_actions
   set label = replace(replace(replace(replace(replace(replace(
         label,
         'un élève',      'un chevalier'),
         'l''élève',      'le chevalier'),
         'des élèves',    'des chevaliers'),
         'un enseignant', 'un entraîneur'),
         'l''enseignant', 'l''entraîneur'),
         'une classe',    'une catégorie')
 where label is not null;

update public.app_page_actions
   set hint = replace(replace(replace(
         hint,
         'élève',      'chevalier'),
         'enseignant', 'entraîneur'),
         'classe',     'catégorie')
 where hint is not null;


-- =============================================================================
--  4. LES RÔLES NE CHANGENT PAS — ET C'EST VOULU
-- =============================================================================
--
--  Le rôle d'un chevalier reste `'student'` dans `public.app_role`, et celui
--  d'un entraîneur reste `'teacher'`.
--
--  POURQUOI. Ces valeurs sont écrites dans `public.profiles.role`, lues par
--  `is_staff()`, `is_teacher()`, `my_student_ids()` et par toutes les politiques
--  de sécurité du schéma. Ajouter `'chevalier'` obligerait à réécrire chaque
--  politique, à migrer chaque ligne de `profiles`, et à garder les deux valeurs
--  en vie pour les comptes déjà créés — beaucoup de risque pour un mot que
--  personne ne voit : l'écran affiche « Chevalier » et « Entraîneur », traduits
--  depuis ces clés par `lib/i18n/fr.ts`.
--
--  UN COMPTE DE CHEVALIER CRÉÉ DEPUIS L'APPLICATION passe donc par la fonction
--  `create_app_user(..., p_role => 'student', ...)`, qui écrit dans `auth.users`
--  et dans `public.profiles`. Il se connecte ensuite par la porte normale de
--  Supabase — email et mot de passe — sans aucune étape supplémentaire.
--
--  Rien à exécuter ici. Cette section est une note, pas une opération.
-- =============================================================================


-- =============================================================================
--  5. « SUJETS & EXERCICES » S'EN VA
-- =============================================================================
--
--  ⚠️  C'EST LA SEULE PARTIE DESTRUCTRICE DE CE SCRIPT.
--
--  L'écran a été retiré de l'application : sa table, ses droits et son dépôt
--  d'images n'ont plus de lecteur. Elle est en DERNIER exprès — tout ce qui
--  précède est déjà appliqué et validé quand vous arrivez ici.
--
--  SI VOUS VOULEZ GARDER CES DONNÉES, arrêtez-vous avant et sauvegardez :
--
--      create table public.subjects_archive as select * from public.subjects;
--
--  puis reprenez ci-dessous.
-- =============================================================================

-- Les droits de l'écran (les lignes de `app_page_actions` partent en cascade).
delete from public.app_pages where key = 'subjects';

-- Le droit retiré des fiches de travailleurs qui l'avaient encore : sans cela,
-- leur `nav_keys` désignerait un écran qui n'existe plus.
--
-- `nav_keys` et `action_keys` sont des tableaux JSONB, pas des `text[]` : on
-- les déplie, on filtre, on les recompose. La distinction NULL / tableau vide
-- est préservée — NULL veut dire « ces droits n'ont jamais été réglés », ce qui
-- n'est pas du tout la même chose que « aucun écran ».
update public.reception_staff
   set nav_keys = (
         select coalesce(jsonb_agg(t.k), '[]'::jsonb)
           from jsonb_array_elements_text(nav_keys) as t(k)
          where t.k <> 'subjects'
       )
 where nav_keys is not null
   and jsonb_typeof(nav_keys) = 'array'
   and nav_keys ? 'subjects';

update public.reception_staff
   set action_keys = (
         select coalesce(jsonb_agg(t.k), '[]'::jsonb)
           from jsonb_array_elements_text(action_keys) as t(k)
          where t.k not like 'subjects:%'
       )
 where action_keys is not null
   and jsonb_typeof(action_keys) = 'array';

-- La table elle-même.
drop table if exists public.subjects;

-- Le dépôt d'images des supports de cours.
do $storage$
begin
  delete from storage.objects where bucket_id = 'subjects';
  delete from storage.buckets where id = 'subjects';
exception
  when insufficient_privilege then
    raise notice 'Le dépôt « subjects » n''a pas pu être supprimé depuis ce script : faites-le depuis Storage -> Buckets.';
end $storage$;

-- Les politiques de stockage ne mentionnent plus que `logos`.
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
    with check (bucket_id = 'logos' and public.can_write(array['settings']));

  create policy "staff update app images" on storage.objects
    for update to authenticated
    using (bucket_id = 'logos' and public.can_write(array['settings']))
    with check (bucket_id = 'logos' and public.can_write(array['settings']));

  create policy "staff delete app images" on storage.objects
    for delete to authenticated
    using (bucket_id = 'logos' and public.can_write(array['settings']));
exception
  when insufficient_privilege then
    raise notice 'Les politiques de stockage se posent depuis Storage -> Policies sur ce projet.';
end $storage$;


-- =============================================================================
--  6. VÉRIFICATION — à lancer après coup, elle n'écrit rien
-- =============================================================================
--
--  Les cinq lignes attendues :
--    age_from + age_to          -> 2
--    cash_categories            -> 1
--    cash_transactions.category -> 1
--    subjects (partie)          -> 0
--    écran subjects (parti)     -> 0
-- =============================================================================

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'classes'
      and column_name in ('age_from','age_to'))                       as colonnes_age,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'cash_categories') as table_rubriques,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'cash_transactions'
      and column_name = 'category_id')                                as colonne_rubrique,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'subjects')        as table_sujets_restante,
  (select count(*) from public.app_pages where key = 'subjects')      as ecran_sujets_restant,
  (select count(*) from public.cash_categories)                       as rubriques_disponibles;
