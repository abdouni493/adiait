-- =============================================================================
--  LES CARTES S'AFFRANCHISSENT DE LA SAISON, LE RAPPORT DEVIENT UNE PÉRIODE,
--  ET LES SÉANCES LIBRES DEVIENNENT LE PROGRAMME DU CLUB
--  MISE À JOUR D'UNE BASE DÉJÀ INSTALLÉE
-- =============================================================================
--
--  À exécuter UNE fois, dans : Supabase Dashboard -> SQL Editor -> New query.
--
--  Ce script est IDEMPOTENT : le relancer ne casse rien et ne double rien.
--
--  SI VOUS PARTEZ D'UNE BASE NEUVE, n'exécutez pas ce fichier : lancez
--  `supabase/schema.sql`, qui contient déjà tout ce qui suit.
--
-- -----------------------------------------------------------------------------
--  CE QU'IL FAIT, ET POURQUOI
--
--   1. LA SAISON DISPARAÎT — et les cartes s'en portent mieux.
--
--      Une carte était rattachée à un SEMESTRE : elle ne pouvait naître que si
--      une saison avait été créée, elle cessait de s'ouvrir à sa date de fin, et
--      clore la saison FERMAIT LE POINTAGE. Trois dépendances pour un objet qui
--      n'en demandait aucune : une carte est un pack de séances que le groupe
--      vit, et elle n'a besoin de rien d'autre que de son emploi du temps.
--
--      Désormais elle naît avec le TARIF du créneau, commence à sa première
--      présence, se ferme sur la séance qui complète le pack, et la suivante
--      s'ouvre derrière elle — indéfiniment, tant que le groupe s'entraîne.
--      Personne ne crée rien, personne ne ferme rien, et LE POINTAGE N'EST PLUS
--      JAMAIS BLOQUÉ.
--
--      CE SCRIPT EFFACE DONC LA TABLE `semesters` ET SES LIGNES. C'est
--      volontaire et c'est sans perte : un semestre ne portait qu'un nom et deux
--      dates. Les présences, les paiements, les soldes, les cartes et les
--      emplois du temps ne bougent pas d'un iota — ils perdent seulement un
--      rattachement qui ne leur servait à rien.
--
--   2. LE RAPPORT N'EST PLUS UNE SAISON, C'EST UNE QUESTION.
--
--      L'écran « Semestres » ne demande plus de créer quoi que ce soit : on lui
--      donne DEUX DATES et il répond — les catégories que la période a fait
--      travailler, leurs emplois du temps, leurs cartes, leurs chevaliers.
--
--      `period_templates` ne sert qu'à ne pas retaper deux dates qu'on ouvre
--      chaque semaine (« Semestre 1 », « Stage d'été »). UN MODÈLE NE COMMANDE
--      RIEN : aucune carte n'en dépend, aucun pointage n'y est rattaché, et
--      l'effacer n'efface aucune donnée.
--
--   3. LES SÉANCES LIBRES DEVIENNENT LE PROGRAMME DU CLUB.
--
--      Deux gestes, et deux seulement : un PROGRAMME SOLO (une séance vendue à
--      un chevalier nommé) et un PROGRAMME GROUPE (une sortie vendue à un
--      groupe entier). Le programme de groupe gagne trois choses :
--
--        • `teacher_ids` — TOUS ses encadrants. Une sortie se mène rarement
--          seul. La part entraîneur se partage à parts égales entre eux ; le
--          club verse le même total, et `teacher_id` garde le principal pour
--          que la caisse, les fiches et les rapports continuent de le lire sans
--          rien savoir de la nouveauté.
--        • `worker_ids` — LES AUTRES QUI PARTENT : chauffeur, infirmier,
--          intendant. Ils ne touchent rien sur le prix payé par les chevaliers
--          — ils sont salariés par ailleurs — mais un programme doit dire qui
--          était là.
--        • `category_id` — LA NATURE de la sortie (`program_categories`) :
--          randonnée, stage, compétition. Le club nomme lui-même ce qu'il
--          organise. Effacer une catégorie n'efface pas les programmes qui la
--          portaient : ils se rangent sous « Sans catégorie ».
--
--  CE QU'IL FAUT SAVOIR AVANT DE L'INSTALLER : après ce script, plus aucun
--  écran ne peut bloquer le pointage. C'est le but. Les cartes, elles,
--  apparaîtront toutes seules sur chaque emploi du temps TARIFÉ dès la première
--  ouverture de l'application.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
--  1. LES CARTES S'AFFRANCHISSENT DE LA SAISON
-- -----------------------------------------------------------------------------
--  L'ordre compte : on détache AVANT de supprimer la table, sinon la contrainte
--  de clé étrangère refuserait de lâcher prise.

alter table if exists public.emploi_cartes      drop column if exists semester_id;
alter table if exists public.schedule_sessions  drop column if exists semester_id;

drop index if exists public.sessions_semester_idx;
drop index if exists public.emploi_cartes_semester_idx;

-- La table et ses lignes s'en vont. Un semestre ne portait qu'un nom et deux
-- dates : rien d'autre ne part avec lui.
drop table if exists public.semesters cascade;

-- -----------------------------------------------------------------------------
--  2. LES MODÈLES DE PÉRIODE — deux dates qu'on a nommées
-- -----------------------------------------------------------------------------

create table if not exists public.period_templates (
  id              text primary key,
  -- « Semestre 1 », « Stage d'été », « Mois de Ramadan »
  name            text not null default '',
  start_date      text not null default '',
  end_date        text not null default '',
  description     text,
  created_at      text,
  created_by      text,
  created_by_name text,
  created_by_role text
);

comment on table public.period_templates is
  'Deux dates nommées, pour ne pas les retaper. Un modèle ne commande rien : aucune carte n''en dépend, et l''effacer n''efface aucune donnée.';

create index if not exists period_templates_dates_idx
  on public.period_templates (start_date, end_date);

-- -----------------------------------------------------------------------------
--  3. LE PROGRAMME DU CLUB : catégories, encadrants, accompagnateurs
-- -----------------------------------------------------------------------------

create table if not exists public.program_categories (
  id              text primary key,
  -- « Randonnée », « Stage », « Compétition », « Démonstration »
  name            text not null default '',
  -- une couleur pour la reconnaître d'un coup d'œil (facultative)
  color           text,
  created_at      text,
  created_by      text,
  created_by_name text,
  created_by_role text
);

comment on table public.program_categories is
  'La nature d''un programme de groupe. Elle ne commande ni tarif ni paie : elle sert à retrouver.';

alter table public.group_seances
  -- TOUS les encadrants. `teacher_id` garde le principal, la colonne historique
  -- que la caisse, les fiches et les rapports lisent depuis toujours.
  add column if not exists teacher_ids jsonb,
  -- Les autres qui partent : chauffeur, infirmier, intendant. Ils ne touchent
  -- rien sur le prix payé par les chevaliers.
  add column if not exists worker_ids  jsonb,
  add column if not exists category_id text;

-- Effacer une catégorie n'efface pas ce qu'elle étiquetait : les programmes qui
-- la portaient se rangent sous « Sans catégorie ».
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'group_seances_category_id_fkey'
  ) then
    alter table public.group_seances
      add constraint group_seances_category_id_fkey
      foreign key (category_id) references public.program_categories (id) on delete set null;
  end if;
end $$;

create index if not exists group_seances_category_idx on public.group_seances (category_id);

-- -----------------------------------------------------------------------------
--  4. LES DROITS DE LECTURE ET D'ÉCRITURE
-- -----------------------------------------------------------------------------

alter table public.period_templates  enable row level security;
alter table public.program_categories enable row level security;

drop policy if exists semesters_read           on public.period_templates;
drop policy if exists period_templates_read    on public.period_templates;
drop policy if exists period_templates_write   on public.period_templates;
drop policy if exists program_categories_read  on public.program_categories;
drop policy if exists program_categories_write on public.program_categories;

create policy period_templates_read on public.period_templates
  for select to authenticated using (true);

create policy period_templates_write on public.period_templates
  for all to authenticated
  using (public.can_write(array['semesters']))
  with check (public.can_write(array['semesters']));

create policy program_categories_read on public.program_categories
  for select to authenticated using (true);

create policy program_categories_write on public.program_categories
  for all to authenticated
  using (public.can_write(array['independent','teachers']))
  with check (public.can_write(array['independent','teachers']));

-- LES CARTES ne dépendent plus d'aucune saison : leur droit d'écriture suit
-- désormais les écrans où l'on pointe, et celui où on les lit.
drop policy if exists emploi_cartes_write on public.emploi_cartes;
create policy emploi_cartes_write on public.emploi_cartes
  for all to authenticated
  using (public.can_write(array['semesters','planner','attendance','dashboard']))
  with check (public.can_write(array['semesters','planner','attendance','dashboard']));

-- -----------------------------------------------------------------------------
--  5. LE CATALOGUE DES DROITS
-- -----------------------------------------------------------------------------
--  L'écran « Semestres » garde sa clé (les droits déjà accordés survivent) mais
--  change de métier : il ne crée plus de saison, il sort un rapport.

update public.app_pages
   set hint = 'Le rapport d''une période : ses catégories, ses emplois du temps, ses cartes et son argent.'
 where key = 'semesters';

-- « Clore un semestre » n'existe plus : il n'y a plus rien à clore.
delete from public.app_page_actions where page_key = 'semesters' and action_id = 'close';

insert into public.app_page_actions (page_key, action_id, position, label, hint) values
  ('semesters', 'create', 1, 'Créer un modèle de période', 'Deux dates enregistrées sous un nom, pour ne plus les retaper.'),
  ('semesters', 'view',   2, 'Générer et lire un rapport', 'Catégories, emplois du temps, cartes et chevaliers.'),
  ('semesters', 'edit',   3, 'Modifier un modèle de période', null),
  ('semesters', 'delete', 4, 'Supprimer un modèle de période', null)
on conflict (page_key, action_id) do update set
  position = excluded.position,
  label    = excluded.label,
  hint     = excluded.hint;

--  « Séances libres » devient « Programme du club ».
update public.app_pages
   set label = 'Programme du club',
       hint  = 'Ce que le club organise hors des emplois du temps : les programmes solo (un chevalier) et les programmes de groupe (une sortie entière).'
 where key = 'independent';

insert into public.app_page_actions (page_key, action_id, position, label, hint) values
  ('independent', 'create', 1, 'Créer un programme', 'Solo (un chevalier) ou groupe (une sortie).'),
  ('independent', 'view',   2, 'Voir le détail d''un programme', null),
  ('independent', 'edit',   3, 'Modifier un programme', null),
  ('independent', 'delete', 4, 'Supprimer un programme', null),
  ('independent', 'print',  5, 'Réimprimer le reçu', null)
on conflict (page_key, action_id) do update set
  position = excluded.position,
  label    = excluded.label,
  hint     = excluded.hint;

commit;

-- =============================================================================
--  VÉRIFICATION — ce que la base doit répondre une fois le script passé
-- =============================================================================
--
--    select
--      (select count(*) from information_schema.tables
--        where table_schema='public' and table_name='semesters')          as semestres_restants,
--      (select count(*) from public.period_templates)                     as modeles,
--      (select count(*) from public.program_categories)                   as categories,
--      (select count(*) from public.emploi_cartes)                        as cartes;
--
--  `semestres_restants` doit valoir 0 : la table a bien disparu. `modeles` et
--  `categories` valent 0 sur une base qui vient d'être mise à jour — elles se
--  créent depuis les écrans. `cartes` garde exactement ce qu'elle avait : la
--  disparition de la saison ne leur a rien retiré.
-- =============================================================================
