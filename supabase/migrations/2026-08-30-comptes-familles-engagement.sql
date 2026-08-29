-- =============================================================================
--  LES COMPTES DES FAMILLES, L'ENGAGEMENT, LES GROUPES PAR CATÉGORIE
--  MISE À JOUR D'UNE BASE DÉJÀ INSTALLÉE
-- =============================================================================
--
--  À exécuter UNE fois, dans : Supabase Dashboard -> SQL Editor -> New query.
--
--  Ce script est IDEMPOTENT : le relancer ne casse rien et ne double rien.
--  Il ne détruit AUCUNE donnée métier. La seule suppression qu'il opère est
--  celle d'un écran du catalogue des droits — « Cartes & tarifs » — qui n'existe
--  plus dans l'application.
--
--  SI VOUS PARTEZ D'UNE BASE NEUVE, n'exécutez pas ce fichier : lancez
--  `supabase/schema.sql`, qui contient déjà tout ce qui suit.
--
-- -----------------------------------------------------------------------------
--  CE QU'IL FAIT, ET POURQUOI
--
--   1. LES COMPTES QUE LES FAMILLES CRÉENT ELLES-MÊMES.
--      `profiles.active` apparaît, et la table `account_requests` avec elle. Un
--      chevalier ou un parent peut désormais créer son compte depuis la page de
--      connexion : le compte existe et se connecte, mais il est INACTIF et ne
--      pilote aucune fiche — l'application ne lui montre qu'un écran d'attente
--      jusqu'à ce que l'intendance le rattache.
--
--   2. UN GROUPE APPARTIENT À UNE CATÉGORIE (`groups.class_id`).
--      « Groupe A » des 8-10 ans n'est plus « Groupe A » des 15-18 ans. Les
--      groupes déjà en base gardent leur `class_id` VIDE : l'application les
--      rattache alors par les emplois du temps qui les utilisent, donc rien ne
--      disparaît d'aucun écran.
--
--   3. L'ENGAGEMENT (`subscriptions.engagement_fee`).
--      Le frais d'entrée propre à UN créneau — la tenue, l'équipement,
--      l'assurance du groupe. Il est porté au compte du chevalier le jour où il
--      rejoint l'emploi du temps, sous la forme d'un frais ordinaire
--      (`student_charges`, origine « engagement »).
--
--   4. LES FICHES GAGNENT LEUR ADRESSE, et les PARENTS leur second numéro,
--      leur date de naissance et leur adresse.
--
--   5. L'ÉCRAN « CARTES & TARIFS » S'EN VA du catalogue des droits. Le tarif se
--      fixe désormais SUR l'emploi du temps, au moment où on le crée ; les
--      périodes offertes ont rejoint les Paramètres.
--
--  CE QU'IL NE FAIT PAS, DÉLIBÉRÉMENT : toucher aux tarifs, aux abonnements,
--  aux présences ou aux paiements déjà enregistrés. Aucune ligne existante
--  n'est réécrite — seules des colonnes s'ajoutent, toutes facultatives.
-- =============================================================================


-- =============================================================================
--  1. LES COMPTES EN ATTENTE D'ACTIVATION
-- =============================================================================
--
--  `active` vaut TRUE par défaut : tous les comptes déjà en base sont, par
--  définition, des comptes que le comptoir a créés lui-même — ils sont actifs,
--  et le restent. Seuls les comptes nés de la page de connexion arriveront à
--  FALSE.
-- =============================================================================

alter table public.profiles
  add column if not exists active boolean not null default true;

comment on column public.profiles.active is
  'false = compte créé depuis la page de connexion, en attente d''être rattaché à une fiche.';

-- ---- La table des demandes --------------------------------------------------
create table if not exists public.account_requests (
  id                   text primary key,
  account_id           uuid not null references auth.users (id) on delete cascade,
  kind                 text not null check (kind in ('student','parent')),
  first_name           text not null default '',
  last_name            text not null default '',
  phone                text not null default '',
  phone2               text,
  birth_date           text,
  address              text,
  email                text not null default '',
  existing_member      boolean not null default false,
  children_subscribed  boolean,
  children             jsonb not null default '[]'::jsonb,
  status               text not null default 'pending'
                       check (status in ('pending','linked','rejected')),
  linked_entity_id     text,
  linked_child_ids     jsonb,
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
  'Les comptes créés depuis la page de connexion, en attente d''être rattachés à une fiche.';

-- ---- Sa RLS -----------------------------------------------------------------
-- Le comptoir traite les demandes ; chacun voit la sienne, ce qui permet à un
-- compte en attente de savoir où il en est. PERSONNE ne les insère d'ici :
-- elles naissent de `request_account()`, qui vérifie tout elle-même.
alter table public.account_requests enable row level security;

drop policy if exists account_requests_read  on public.account_requests;
drop policy if exists account_requests_write on public.account_requests;

create policy account_requests_read on public.account_requests
  for select to authenticated
  using (public.is_staff() or account_id = auth.uid());

create policy account_requests_write on public.account_requests
  for all to authenticated
  using (public.can_write(array['dashboard','students','parents']))
  with check (public.can_write(array['dashboard','students','parents']));

grant select, insert, update, delete on public.account_requests to authenticated;


-- =============================================================================
--  2. UN GROUPE APPARTIENT À UNE CATÉGORIE
-- =============================================================================
--
--  La colonne est NULLABLE, et elle le reste : les groupes créés avant elle
--  n'en portent pas, et l'application les rattache par les emplois du temps qui
--  les utilisent. Les vider de force aurait fait disparaître des groupes bel et
--  bien vivants de l'écran d'inscription.
-- =============================================================================

alter table public.groups add column if not exists class_id   text;
alter table public.groups add column if not exists created_at text;

create index if not exists groups_class_idx on public.groups (class_id);

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

comment on column public.groups.class_id is
  'La catégorie à laquelle ce groupe appartient. NULL = groupe d''avant la colonne.';


-- =============================================================================
--  3. L'ENGAGEMENT — le frais d'entrée d'UN emploi du temps
-- =============================================================================
--
--  Ce n'est ni la cotisation (qui se paie carte après carte) ni les droits
--  d'entrée du club (qui se règlent une fois pour toutes, tous emplois
--  confondus) : c'est ce qu'on verse pour REJOINDRE ce créneau — la tenue,
--  l'équipement, l'assurance du groupe.
--
--  Absent ou 0 = ce créneau ne demande aucun engagement, ce qui est le cas de
--  tous les emplois du temps déjà en base.
-- =============================================================================

alter table public.subscriptions add column if not exists engagement_fee         numeric;
alter table public.subscriptions add column if not exists engagement_description text;

comment on column public.subscriptions.engagement_fee is
  'Le frais d''entrée de cet emploi du temps, porté au compte du chevalier à son inscription.';

-- Le frais qui en naît porte une origine à lui : c'est ce qui l'empêche d'être
-- porté deux fois au même chevalier pour le même créneau.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.student_charges'::regclass
       and conname = 'student_charges_origin_check'
  ) then
    alter table public.student_charges drop constraint student_charges_origin_check;
  end if;

  alter table public.student_charges
    add constraint student_charges_origin_check
    check (origin is null or origin in ('manual','school_advance','engagement'));
end $$;


-- =============================================================================
--  4. LES ADRESSES, ET CE QUI MANQUAIT AUX PARENTS
-- =============================================================================
--
--  Une adresse ne commande rien : ni tarif, ni groupe, ni document. Elle sert à
--  retrouver une famille, et c'est déjà beaucoup. Un parent, lui, est une
--  personne : sa fiche porte désormais sa date de naissance et son second
--  numéro, comme celle d'un chevalier.
-- =============================================================================

alter table public.students add column if not exists address    text;

alter table public.parents  add column if not exists phone2     text;
alter table public.parents  add column if not exists birth_date text;
alter table public.parents  add column if not exists address    text;


-- =============================================================================
--  5. LE CATALOGUE DES DROITS
-- =============================================================================
--
--  « Cartes & tarifs » n'existe plus : le tarif se fixe SUR l'emploi du temps,
--  au moment où on le crée, et les périodes offertes ont rejoint les
--  Paramètres. Le laisser au catalogue proposerait un écran mort.
--
--  Les travailleurs qui portaient ses droits les perdent — c'est le but : un
--  droit vers un écran supprimé n'ouvre rien.
-- =============================================================================

delete from public.app_page_actions where page_key = 'subscriptions';
delete from public.app_pages        where key      = 'subscriptions';

-- Les deux boutons qui apparaissent avec cette mise à jour.
insert into public.app_page_actions (page_key, action_id, position, label, hint) values
  ('planner', 'groups', 7, 'Créer / renommer les groupes d''une catégorie', 'Sans avoir à créer le moindre créneau.'),
  ('settings', 'free_periods', 4, 'Périodes offertes', 'Les fenêtres de gratuité, venues de l''ancien écran « Cartes & tarifs ».')
on conflict (page_key, action_id) do update set
  position = excluded.position,
  label    = excluded.label,
  hint     = excluded.hint;

update public.app_page_actions set position = 5
 where page_key = 'settings' and action_id = 'backup';

-- Les droits stockés sur les fiches des travailleurs sont nettoyés du même
-- coup : `nav_keys` perd l'écran, `action_keys` perd ses trois boutons.
update public.reception_staff
   set nav_keys = (
     select coalesce(jsonb_agg(k), '[]'::jsonb)
       from jsonb_array_elements_text(nav_keys) as k
      where k <> 'subscriptions'
   )
 where nav_keys is not null
   and nav_keys @> '["subscriptions"]'::jsonb;

update public.reception_staff
   set action_keys = (
     select coalesce(jsonb_agg(k), '[]'::jsonb)
       from jsonb_array_elements_text(action_keys) as k
      where k not like 'subscriptions:%'
   )
 where action_keys is not null;


-- =============================================================================
--  6. LES DEUX FONCTIONS QUI FONT VIVRE TOUT CELA
-- =============================================================================

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
create or replace function public.request_account(
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
  p_children             jsonb default '[]'::jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_email text := lower(trim(p_email));
  v_role  public.app_role;
  v_name  text := nullif(trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')), '');
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

  v_id := public.raw_create_auth_user(v_email, p_password, v_role, v_name);

  -- LE PROFIL NAÎT INACTIF, et pointe son propre identifiant : il ne pilote
  -- donc AUCUNE fiche, et la RLS ne lui rend ni chevalier, ni paiement, ni
  -- présence. C'est exactement ce qu'on veut avant qu'un humain ait vérifié.
  insert into public.profiles (id, entity_id, role, email, username, full_name, active)
  values (v_id, v_id::text, v_role, v_email, v_email, v_name, false);

  insert into public.account_requests (
    id, account_id, kind, first_name, last_name, phone, phone2, birth_date, address,
    email, existing_member, children_subscribed, children, status, created_at
  ) values (
    'req-' || replace(v_id::text, '-', ''),
    v_id,
    p_kind,
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
    'pending',
    to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
  );

  return v_id::text;
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
  if not (public.is_admin() or public.can_write(array['dashboard','students','parents'])) then
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

-- ---- Qui peut appeler quoi --------------------------------------------------
-- `request_account` est ouverte à qui n'est PAS connecté : c'est précisément
-- son cas. Elle ne donne aucun pouvoir pour autant — le rôle y est FORCÉ à
-- « chevalier » ou « parent », et le profil naît inactif.
grant execute on function public.request_account(text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb) to anon, authenticated;
grant execute on function public.link_account_entity(text, text, text) to authenticated;


-- =============================================================================
--  7. VÉRIFICATION — à lancer après coup, elle n'écrit rien
-- =============================================================================
--
--  Les valeurs attendues :
--    profiles.active            -> 1
--    account_requests           -> 1
--    groups.class_id            -> 1
--    engagement (2 colonnes)    -> 2
--    students.address           -> 1
--    parents (3 colonnes)       -> 3
--    écran « cartes & tarifs »  -> 0
--    request_account            -> 1
--    link_account_entity        -> 1
-- =============================================================================

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'active')                                   as colonne_active,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'account_requests') as table_demandes,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'groups'
      and column_name = 'class_id')                                 as groupe_categorie,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions'
      and column_name in ('engagement_fee','engagement_description')) as colonnes_engagement,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'students'
      and column_name = 'address')                                  as adresse_chevalier,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'parents'
      and column_name in ('phone2','birth_date','address'))         as colonnes_parent,
  (select count(*) from public.app_pages where key = 'subscriptions') as ecran_tarifs_restant,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'request_account')   as fonction_demande,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'link_account_entity') as fonction_activation;
