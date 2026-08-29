-- =============================================================================
--  LA VITRINE DU CLUB — LE SITE PUBLIC, SES FORMATIONS ET SES INSCRIPTIONS
--  MISE À JOUR D'UNE BASE DÉJÀ INSTALLÉE
-- =============================================================================
--
--  À exécuter UNE fois, dans : Supabase Dashboard -> SQL Editor -> New query.
--
--  Ce script est IDEMPOTENT : le relancer ne casse rien et ne double rien.
--  Il n'efface AUCUNE donnée métier et ne réécrit aucune ligne existante — il
--  AJOUTE deux tables, quinze colonnes facultatives, deux écrans au catalogue
--  des droits, et il élargit quelques politiques de sécurité.
--
--  SI VOUS PARTEZ D'UNE BASE NEUVE, n'exécutez pas ce fichier : lancez
--  `supabase/schema.sql`, qui contient déjà tout ce qui suit.
--
-- -----------------------------------------------------------------------------
--  CE QU'IL FAIT, ET POURQUOI
--
--   1. LE CLUB A UN SITE PUBLIC.
--
--      Jusqu'ici, l'application était fermée : pour savoir ce que le club
--      proposait, il fallait déjà un compte — donc être déjà venu au club. Le
--      site renverse cela. Il s'affiche SANS COMPTE, et n'ouvre pour cela que
--      DEUX portes au visiteur anonyme, pas une de plus :
--
--        • `schools`, qui portait déjà le nom et le logo (la page de connexion
--          les affiche), et qui gagne ici toute la vitrine : le favicon, les
--          deux présentations, l'image de fond, la vidéo, les réseaux sociaux,
--          le plan et les deux numéros (colonnes `site_*`) ;
--        • `website_formations`, les formations et les évènements PUBLIÉS.
--
--      Rien d'autre ne sort. C'est pourquoi le nom de l'encadrant est RECOPIÉ
--      sur la formation (`trainer_name`) : la table des entraîneurs, elle,
--      reste fermée, et sans cette copie la carte publique afficherait un
--      identifiant.
--
--   2. UNE FORMATION SE COMPTE EN DATES, PAS EN JOURS DE SEMAINE
--      (`website_formations.days`).
--
--      Une formation ne « tient pas tous les mardis » : elle tient LES 4, 11 et
--      18 mars. L'écran de création déplie le calendrier de la période et l'on
--      coche les journées réelles — ce qui permet de sauter une fête ou une
--      semaine de vacances sans inventer une règle de récurrence que personne
--      ne saurait relire. Une liste VIDE veut dire « toute la période », ce
--      qu'est un évènement d'un seul tenant.
--
--   3. L'INSCRIPTION ET L'ARGENT SONT SÉPARÉS
--      (`formation_enrollments`, et `student_charges.origin = 'formation'`).
--
--      Quelqu'un qui s'inscrit depuis le site n'a rien payé : il paiera au
--      comptoir, parfois des semaines plus tard. L'inscription naît donc
--      TOUJOURS, et le prix est porté au compte du chevalier sous la forme d'un
--      frais ORDINAIRE — celui-là même qui sert pour un livre ou une tenue. Il
--      s'affiche dès lors sur sa fiche, sur la feuille de présence de son
--      groupe et dans les rapports, et se règle en une ou plusieurs fois, sans
--      qu'une seule ligne de comptabilité ait été inventée pour l'occasion.
--
--   4. LES DEMANDES DE COMPTE SAVENT D'OÙ ELLES VIENNENT
--      (`account_requests.source`, `account_requests.formation_id`).
--
--      La page de connexion et le site public créent le MÊME compte inactif,
--      par la MÊME fonction. Ils ne s'affichent simplement pas dans la même
--      file d'attente : le tableau de bord garde les siennes, le site a son
--      écran. Une demande SANS origine est une demande d'avant la vitrine :
--      elle vient de la page de connexion, et compte comme telle.
--
--   5. DEUX ÉCRANS DE PLUS AU CATALOGUE DES DROITS : « Site web » et
--      « Inscriptions du site », avec leurs onze boutons.
--
--  CE QU'IL NE FAIT PAS, DÉLIBÉRÉMENT : toucher aux tarifs, aux abonnements,
--  aux présences, aux paiements ou aux droits déjà accordés. Un travailleur qui
--  n'a pas les deux nouveaux écrans cochés ne les verra pas — c'est
--  l'administration qui les lui ouvrira, fiche par fiche.
-- =============================================================================

begin;


-- =============================================================================
--  1. LA VITRINE, SUR LA FICHE DE L'ÉTABLISSEMENT
-- =============================================================================
--
--  `schools` est la SEULE ligne que le schéma laisse déjà lire à un visiteur non
--  connecté (politique `schools_public_read`). Y ranger la vitrine, c'est
--  permettre au site de s'afficher sans ouvrir une table de plus au dehors.
--
--  Les coordonnées du SITE sont distinctes de `phone` et `address` : celles-là
--  sont celles de l'administration, et ce n'est pas toujours ce qu'on donne au
--  public.
-- =============================================================================

alter table public.schools
  add column if not exists site_favicon      text,
  add column if not exists site_description  text,
  add column if not exists site_description2 text,
  add column if not exists site_hero_image   text,
  add column if not exists site_video_url    text,
  add column if not exists site_facebook     text,
  add column if not exists site_instagram    text,
  add column if not exists site_tiktok       text,
  add column if not exists site_snapchat     text,
  add column if not exists site_whatsapp     text,
  add column if not exists site_maps_url     text,
  add column if not exists site_phone        text,
  add column if not exists site_phone2       text;

comment on column public.schools.site_description is
  'La présentation courte, affichée sous le nom du club sur la page d''accueil du site.';
comment on column public.schools.site_description2 is
  'La présentation longue, affichée plus bas : l''histoire du club, ses valeurs.';
comment on column public.schools.site_hero_image is
  'La photographie de fond de la page d''accueil du site public.';
comment on column public.schools.site_video_url is
  'La vidéo de la page d''accueil : un fichier (MP4) ou une adresse YouTube/Vimeo.';


-- =============================================================================
--  2. LES FORMATIONS ET LES ÉVÈNEMENTS DU SITE
-- =============================================================================

create table if not exists public.website_formations (
  id               text primary key,
  kind             text not null default 'formation' check (kind in ('formation','event')),
  name             text not null default '',
  description      text not null default '',
  start_date       text not null default '',
  start_time       text not null default '',
  end_date         text not null default '',
  end_time         text not null default '',
  -- LES JOURNÉES RÉELLEMENT TENUES, cochées dans le calendrier de la période.
  -- Une liste vide = toute la période.
  days             jsonb not null default '[]'::jsonb,
  trainer_id       text references public.teachers (id) on delete set null,
  -- RECOPIÉ, et pas seulement désigné : le site est lu sans compte, et la RLS ne
  -- rend pas `teachers` à un visiteur. Sans cette copie, la carte publique
  -- afficherait « tea-mf3k2a-9c1b ».
  trainer_name     text,
  trainer_note     text,
  price            numeric not null default 0,
  seances          integer not null default 0,
  images           jsonb not null default '[]'::jsonb,
  -- Retirée de la vitrine, mais pas supprimée.
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


-- =============================================================================
--  3. QUI EST INSCRIT SUR QUOI
-- =============================================================================
--
--  Le PRIX ne vit pas ici : il est porté au compte du chevalier sous la forme
--  d'un frais ordinaire (`student_charges`, origine « formation »), et
--  `charge_id` est le lien vers lui. C'est ce frais qui dit si l'inscription est
--  payée, et de combien. Une inscription offerte n'en porte aucun.
-- =============================================================================

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
--  4. UN FRAIS PEUT DÉSORMAIS VENIR D'UNE FORMATION
-- =============================================================================
--
--  La contrainte énumère les origines possibles d'un frais. Elle est REPOSÉE en
--  entier — PostgreSQL ne sait pas « ajouter une valeur » à un `check` — mais
--  aucune ligne n'est touchée : les trois origines d'avant restent valides, et
--  « formation » vient s'ajouter à côté.
-- =============================================================================

alter table public.student_charges
  drop constraint if exists student_charges_origin_check;

alter table public.student_charges
  add constraint student_charges_origin_check
  check (origin in ('manual','school_advance','engagement','formation'));

comment on column public.student_charges.origin is
  '« manual » = saisi au comptoir · « school_advance » = la caisse a avancé · « engagement » = le frais d''entrée d''un créneau · « formation » = le prix d''une formation de la vitrine.';


-- =============================================================================
--  5. LES DEMANDES DE COMPTE SAVENT D'OÙ ELLES VIENNENT
-- =============================================================================
--
--  `source` VIDE = « login ». Toutes les demandes déjà en base sont, par
--  définition, venues de la page de connexion : elles restent donc exactement
--  là où elles étaient, dans la file du tableau de bord.
-- =============================================================================

alter table public.account_requests
  add column if not exists source       text,
  add column if not exists formation_id text;

alter table public.account_requests
  drop constraint if exists account_requests_source_check;

alter table public.account_requests
  add constraint account_requests_source_check
  check (source is null or source in ('login','website'));

create index if not exists account_requests_source_idx on public.account_requests (source);

comment on column public.account_requests.source is
  '« login » = la page de connexion · « website » = le site public. Vide = login.';
comment on column public.account_requests.formation_id is
  'La formation du site sur laquelle la demande porte. Une INTENTION : elle n''inscrit rien et ne facture rien tant que l''intendance n''a pas vérifié.';


-- =============================================================================
--  6. LA SÉCURITÉ — QUI LIT, QUI ÉCRIT
-- =============================================================================

-- ---- Les deux nouvelles tables ---------------------------------------------
--
-- Tout compte connecté LIT les formations, y compris les masquées : la gestion
-- doit les voir pour les remettre en ligne. Le VISITEUR, lui, passe par la
-- politique `anon` posée juste après, qui ne lui rend que les affichées.
alter table public.website_formations   enable row level security;
alter table public.formation_enrollments enable row level security;

drop policy if exists website_formations_read        on public.website_formations;
drop policy if exists website_formations_write       on public.website_formations;
drop policy if exists website_formations_public_read on public.website_formations;

create policy website_formations_read on public.website_formations
  for select to authenticated using (auth.uid() is not null);

create policy website_formations_write on public.website_formations
  for all to authenticated
  using (public.can_write(array['website']))
  with check (public.can_write(array['website']));

-- LE SITE PUBLIC LIT SES FORMATIONS SANS COMPTE.
--
-- Le filtre sur `hidden` est posé ICI, dans la politique : une annonce retirée
-- de la vitrine ne sort pas, même si l'on devine son adresse. L'appliquer
-- seulement côté navigateur reviendrait à le laisser au bon vouloir de celui
-- qui écrit la requête.
create policy website_formations_public_read on public.website_formations
  for select to anon using (hidden is not true);

drop policy if exists formation_enrollments_read  on public.formation_enrollments;
drop policy if exists formation_enrollments_write on public.formation_enrollments;

create policy formation_enrollments_read on public.formation_enrollments
  for select to authenticated
  using (
    public.is_staff()
    or public.is_teacher()
    or student_id = any (public.my_student_ids())
  );

create policy formation_enrollments_write on public.formation_enrollments
  for all to authenticated
  using (public.can_write(array['website','website-inscriptions','students','dashboard']))
  with check (public.can_write(array['website','website-inscriptions','students','dashboard']));


-- ---- Les politiques élargies ------------------------------------------------
--
-- Vérifier une inscription du site CRÉE une fiche de chevalier (ou de parent),
-- et lui porte le prix de la formation. L'écran « Inscriptions du site » doit
-- donc pouvoir écrire là où le tableau de bord écrivait déjà — et « Site web »
-- doit pouvoir porter un frais quand il inscrit quelqu'un.
--
-- Les listes sont REPOSÉES EN ENTIER : une politique ne s'élargit pas, elle se
-- réécrit. Aucun droit n'est retiré au passage.

drop policy if exists students_write on public.students;
create policy students_write on public.students
  for all to authenticated
  using (
    public.can_write(array['students','dashboard','attendance','parents','website-inscriptions'])
    or public.is_teacher()
  )
  with check (
    public.can_write(array['students','dashboard','attendance','parents','website-inscriptions'])
    or public.is_teacher()
  );

drop policy if exists student_charges_write on public.student_charges;
create policy student_charges_write on public.student_charges
  for all to authenticated
  using (
    public.can_write(array['students','dashboard','attendance','teachers','website','website-inscriptions'])
    or public.is_teacher()
  )
  with check (
    public.can_write(array['students','dashboard','attendance','teachers','website','website-inscriptions'])
    or public.is_teacher()
  );

drop policy if exists parents_write on public.parents;
create policy parents_write on public.parents
  for all to authenticated
  using (public.can_write(array['parents','students','website-inscriptions']))
  with check (public.can_write(array['parents','students','website-inscriptions']));

drop policy if exists account_requests_write on public.account_requests;
create policy account_requests_write on public.account_requests
  for all to authenticated
  using (public.can_write(array['dashboard','students','parents','website-inscriptions']))
  with check (public.can_write(array['dashboard','students','parents','website-inscriptions']));


-- =============================================================================
--  7. LE CATALOGUE DES DROITS — DEUX ÉCRANS DE PLUS
-- =============================================================================

insert into public.app_pages (key, position, emoji, label, href, hint) values
  ('website', 17, '🌐', 'Site web', '/website', 'La vitrine du club : les formations et les évènements publiés, les coordonnées et l''habillage de la page d''accueil.'),
  ('website-inscriptions', 18, '📥', 'Inscriptions du site', '/website-inscriptions', 'Les inscriptions venues du site public, en attente d''être vérifiées et rattachées à une fiche.'),
  ('settings', 19, '⚙️', 'Paramètres', '/settings', 'Le club, la sécurité, WhatsApp et les sauvegardes.')
on conflict (key) do update set
  position = excluded.position,
  emoji    = excluded.emoji,
  label    = excluded.label,
  href     = excluded.href,
  hint     = excluded.hint;

insert into public.app_page_actions (page_key, action_id, position, label, hint) values
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


-- =============================================================================
--  8. `request_account` — L'ORIGINE DE LA DEMANDE, ET LA FORMATION VISÉE
-- =============================================================================
--
--  L'ANCIENNE SIGNATURE EST RETIRÉE AVANT LA NOUVELLE, et ce n'est pas un
--  détail : deux paramètres s'ajoutent, PostgreSQL garderait alors DEUX
--  fonctions du même nom, et PostgREST — qui choisit par les noms d'arguments
--  reçus — refuserait l'appel avec « could not choose the best candidate
--  function ». La création de compte tomberait en panne sans que rien, dans le
--  code de l'application, ait changé.
-- =============================================================================

drop function if exists public.request_account(
  text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb
);

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
  p_children             jsonb default '[]'::jsonb,
  -- « login » (la page de connexion) ou « website » (le site public).
  p_source               text default 'login',
  -- La formation du site sur laquelle la demande porte, le cas échéant.
  p_formation_id         text default null
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
    id, account_id, kind, source, formation_id,
    first_name, last_name, phone, phone2, birth_date, address,
    email, existing_member, children_subscribed, children, status, created_at
  ) values (
    'req-' || replace(v_id::text, '-', ''),
    v_id,
    p_kind,
    case when p_source = 'website' then 'website' else 'login' end,
    -- Une formation qui n'existe pas (ou plus) ne bloque pas la création du
    -- compte : la demande arrive simplement sans formation, et l'intendance la
    -- traite comme n'importe quelle autre.
    (select f.id from public.website_formations f where f.id = p_formation_id),
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


-- =============================================================================
--  9. `link_account_entity` — L'ÉCRAN DES INSCRIPTIONS DU SITE L'APPELLE AUSSI
-- =============================================================================
--
--  Seule la ligne des droits change : un compte à qui l'on a ouvert
--  « Inscriptions du site » doit pouvoir activer ce qu'il vérifie, faute de quoi
--  l'écran lui montrerait un bouton qui échoue.
-- =============================================================================

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


-- =============================================================================
--  10. LES PRIVILÈGES
-- =============================================================================
--
--  La RLS dit quelles LIGNES un compte voit ; les privilèges disent quelles
--  TABLES il peut seulement adresser. Il faut les deux.
-- =============================================================================

grant select, insert, update, delete on public.website_formations   to authenticated;
grant select, insert, update, delete on public.formation_enrollments to authenticated;

-- Le site public lit les formations sans compte.
grant select on public.website_formations to anon;

grant execute on function public.request_account(text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text, text) to anon, authenticated;
grant execute on function public.link_account_entity(text, text, text) to authenticated;


commit;


-- =============================================================================
--  11. LE DÉPÔT D'IMAGES — la vitrine y dépose aussi
-- =============================================================================
--
--  Les illustrations d'une formation, le favicon et l'image d'accueil passent
--  par le MÊME bucket que le logo (`logos`) : l'écran « Site web » doit donc
--  pouvoir y écrire, alors que seul « Paramètres » le pouvait.
--
--  HORS TRANSACTION, ET AVEC UN FILET : `storage.objects` n'appartient pas
--  toujours au rôle qui exécute ce script. Sur un projet qui refuse, on le DIT
--  plutôt que de faire échouer tout ce qui précède — les politiques se posent
--  alors à la main depuis Storage -> Policies.
-- =============================================================================

do $storage$
begin
  drop policy if exists "staff upload app images" on storage.objects;
  drop policy if exists "staff update app images" on storage.objects;
  drop policy if exists "staff delete app images" on storage.objects;

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
      'Ouvrez Storage -> Policies et autorisez l''envoi de fichiers dans le bucket '
      '« logos » aux comptes qui gèrent le site.';
end
$storage$;


-- =============================================================================
--  VÉRIFICATION — ce que la mise à jour doit avoir produit
-- =============================================================================
--
--  -- Les deux nouvelles tables, et leur RLS
--  select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('website_formations','formation_enrollments');
--
--  -- Les treize colonnes de la vitrine
--  select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'schools'
--     and column_name like 'site\_%' order by column_name;
--
--  -- L'origine et la formation d'une demande de compte
--  select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'account_requests'
--     and column_name in ('source','formation_id');
--
--  -- Les deux écrans, et leurs onze boutons
--  select page_key, action_id, permission_key from public.app_permission_catalog
--   where page_key in ('website','website-inscriptions') order by page_key, action_position;
--
--  -- UNE SEULE `request_account`, celle à quatorze arguments
--  select pg_get_function_identity_arguments(oid) from pg_proc
--   where proname = 'request_account';
-- =============================================================================
