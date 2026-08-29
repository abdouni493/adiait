-- =============================================================================
--  L'ACTIVATION AUTOMATIQUE — LE NUMÉRO DE TÉLÉPHONE RECONNAÎT LES SIENS
--  MISE À JOUR D'UNE BASE DÉJÀ INSTALLÉE
-- =============================================================================
--
--  À exécuter UNE fois, dans : Supabase Dashboard -> SQL Editor -> New query.
--
--  Ce script est IDEMPOTENT : le relancer ne casse rien et ne double rien. Il
--  n'efface AUCUNE donnée métier — il AJOUTE une colonne et deux fonctions, et
--  il réécrit `request_account` pour qu'elle sache reconnaître un membre du
--  club.
--
--  SI VOUS PARTEZ D'UNE BASE NEUVE, n'exécutez pas ce fichier : lancez
--  `supabase/schema.sql`, qui contient déjà tout ce qui suit.
--
-- -----------------------------------------------------------------------------
--  CE QU'IL FAIT, ET POURQUOI
--
--   LE PROBLÈME. Un chevalier inscrit au club depuis deux ans se crée un compte
--   depuis la page de connexion. Il existe déjà : sa fiche, ses cartes, ses
--   présences et ses paiements sont en base. Et pourtant l'application lui
--   répondait « votre compte attend son activation », et il attendait qu'un
--   humain rapproche à la main deux lignes que le NUMÉRO DE TÉLÉPHONE désignait
--   comme une seule et même personne — un rapprochement que l'écran
--   d'activation faisait DÉJÀ tout seul, mais seulement pour le proposer.
--
--   CE QUI CHANGE. `request_account` fait ce rapprochement AU MOMENT MÊME de la
--   création du compte, et va au bout : si le numéro désigne une fiche, et une
--   seule, le compte est rattaché à cette fiche et ACTIVÉ. La famille se
--   connecte et voit tout, sans attendre personne.
--
--   QUAND ON NE TRANCHE PAS. Trois cas, et dans les trois la demande part en
--   attente sur le tableau de bord, exactement comme avant :
--
--     • AUCUNE fiche ne porte ce numéro — la personne est nouvelle, ou son
--       numéro a changé ;
--     • DEUX fiches ou plus le portent — deux frères sous le numéro du père :
--       la base ne peut pas deviner lequel des deux demande un accès ;
--     • la fiche trouvée est DÉJÀ PILOTÉE par un compte — on ne prend jamais à
--       quelqu'un ce qu'il pilote déjà.
--
--   CE QUE L'ACTIVATION AUTOMATIQUE NE FERME PAS. Activer un compte et TRAITER
--   une demande sont deux choses. Une demande qui porte du travail en plus reste
--   en attente MÊME quand le compte a été activé :
--
--     • une FORMATION du site — il y a un prix à porter au compte, et cela ne se
--       décide pas sans un humain ;
--     • des FILS DÉCLARÉS par un parent — leurs fiches sont à créer, avec leur
--       catégorie et leur groupe.
--
--     L'écran d'activation les montre alors comme « compte déjà actif », et il
--     ne reste à poser que le geste qui manque.
--
--  CE QU'IL FAUT SAVOIR AVANT DE L'INSTALLER : le numéro de téléphone devient
--  une preuve d'identité. Qui connaît le numéro d'un membre peut se créer un
--  compte qui voit sa fiche. C'est le prix de l'automatisme, et c'est le même
--  qu'au guichet quand on y annonce un numéro. Pour revenir en arrière, il
--  suffit de reposer `request_account` sans son paragraphe de détection.
-- =============================================================================

begin;


-- =============================================================================
--  1. DEUX NUMÉROS SONT-ILS LE MÊME NUMÉRO ?
-- =============================================================================
--
--  « 0555 12 34 56 », « +213 555 123 456 » et « 00213555123456 » sont un seul
--  et même téléphone. Les comparer caractère par caractère, c'est ne reconnaître
--  personne — chaque écran de saisie ayant ses habitudes.
--
--  Cette fonction ramène tout à la même forme internationale en chiffres nus
--  (« 213555123456 »), et rend NULL quand ce qu'on lui donne ne peut pas être un
--  numéro. Elle traduit, ligne pour ligne, `toInternational()` de
--  `lib/whatsapp/phone.ts` : l'application et la base doivent reconnaître les
--  mêmes numéros, sans quoi l'écran proposerait un rapprochement que la base
--  aurait refusé.
-- =============================================================================

create or replace function public.phone_msisdn(p_raw text)
returns text
language plpgsql
immutable
as $fn$
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
$fn$;

comment on function public.phone_msisdn(text) is
  'Ramène un numéro saisi librement à sa forme internationale en chiffres (213555123456), ou NULL. Jumelle SQL de toInternational() côté application.';


-- =============================================================================
--  2. LE NUMÉRO DÉSIGNE-T-IL QUELQU'UN — ET UNE SEULE PERSONNE ?
-- =============================================================================
--
--  Elle rend l'identifiant de la fiche trouvée, ou NULL. NULL veut dire « je ne
--  tranche pas » — aussi bien « personne » que « plusieurs ». Dans les deux cas
--  la demande part en attente, et c'est l'intendance qui regarde.
--
--  LES DEUX NUMÉROS DE LA DEMANDE sont comparés aux DEUX numéros de chaque
--  fiche : la mère qui inscrit son fils sous son propre numéro est retrouvée
--  quand même.
--
--  POUR UN PARENT, DEUX CHEMINS, dans cet ordre : sa propre fiche de parent
--  d'abord ; à défaut, la fiche de son fils — un père n'est souvent connu du
--  club que par le numéro porté sur le dossier de son enfant.
--
--  ELLE N'EST OUVERTE À PERSONNE. `security definer` lui donne de lire des
--  tables que la RLS ferme, et c'est bien pour cela qu'elle est RÉVOQUÉE plus
--  bas : ouverte au dehors, elle répondrait « oui, ce numéro est au club » à
--  quiconque poserait la question, ce qui est exactement le genre de réponse
--  qu'on ne donne pas.
-- =============================================================================

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
as $fn$
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
$fn$;

comment on function public.match_family_entity(text, text, text) is
  'La fiche (chevalier ou parent) que ce numéro désigne SANS AMBIGUÏTÉ, ou NULL. Usage interne : jamais ouverte au dehors.';


-- =============================================================================
--  3. LA DEMANDE DIT SI ELLE S'EST RATTACHÉE TOUTE SEULE
-- =============================================================================
--
--  Sans cette colonne, une demande activée par la machine et une demande
--  activée par un humain seraient indistinguables — et l'écran d'activation
--  n'aurait aucun moyen de dire « ce compte est déjà actif, il ne reste que
--  l'inscription ». Toutes les demandes déjà en base valent `false` : elles ont
--  bien été traitées à la main.
-- =============================================================================

alter table public.account_requests
  add column if not exists auto_linked boolean not null default false;

comment on column public.account_requests.auto_linked is
  'true = le numéro de téléphone a désigné la fiche tout seul, et le compte a été activé sans qu''un humain intervienne.';


-- =============================================================================
--  4. `request_account` — ELLE RECONNAÎT LES SIENS
-- =============================================================================
--
--  L'ANCIENNE SIGNATURE EST RETIRÉE AVANT LA NOUVELLE : la fonction ne rend plus
--  un identifiant nu mais un OBJET (`jsonb`), qui dit ce qui s'est passé — le
--  compte a-t-il été rattaché, à quelle fiche, sous quel nom. PostgreSQL ne
--  remplace pas une fonction dont le type de retour change, il faut la déposer.
--
--  UNE APPLICATION PAS ENCORE MISE À JOUR NE TOMBE PAS : elle lisait une chaîne,
--  elle recevra un objet, et son seul usage en était l'écran de confirmation. Le
--  compte, lui, est créé dans les deux cas.
-- =============================================================================

drop function if exists public.request_account(
  text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text, text
);
drop function if exists public.request_account(
  text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb
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
  -- La formation du site sur laquelle la demande porte, le cas échéant.
  p_formation_id         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
  -- compte : la demande arrive simplement sans formation.
  v_formation := (select f.id from public.website_formations f where f.id = p_formation_id);

  v_id := public.raw_create_auth_user(v_email, p_password, v_role, v_name);

  -- --------------------------------------------------------------------------
  --  LA DÉTECTION — le numéro de téléphone reconnaît un membre du club
  -- --------------------------------------------------------------------------
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
  -- chevalier, ni paiement, ni présence, et l'application lui montre un écran
  -- d'attente.
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
$fn$;

comment on function public.request_account(text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text, text) is
  'La famille crée son propre compte. Le rôle est forcé ; le compte est activé d''office quand son numéro de téléphone désigne une fiche du club, et une seule.';


-- =============================================================================
--  5. QUI PEUT APPELER QUOI
-- =============================================================================
--
--  Les droits d'exécution tombent avec la fonction déposée : ils sont reposés
--  ici. `match_family_entity`, elle, est FERMÉE À TOUS — voir le paragraphe 2.
-- =============================================================================

grant execute on function public.phone_msisdn(text) to anon, authenticated;

revoke all on function public.match_family_entity(text, text, text) from public;
revoke all on function public.match_family_entity(text, text, text) from anon, authenticated;

grant execute on function public.request_account(
  text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text, text
) to anon, authenticated;


commit;

-- PostgREST garde en mémoire la liste des fonctions : sans ce réveil, il
-- continuerait d'annoncer celle qu'on vient de remplacer.
notify pgrst, 'reload schema';


-- =============================================================================
--  VÉRIFICATION — ce que la mise à jour doit avoir produit
-- =============================================================================
--
--  -- Les trois fonctions, et ce que `request_account` rend désormais
--  select proname, pg_get_function_result(oid) from pg_proc
--   where proname in ('phone_msisdn','match_family_entity','request_account');
--
--  -- La normalisation reconnaît les trois écritures d'un même numéro
--  select public.phone_msisdn('0555 12 34 56'),
--         public.phone_msisdn('+213 555 123 456'),
--         public.phone_msisdn('00213555123456');
--
--  -- La colonne de la détection
--  select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'account_requests'
--     and column_name = 'auto_linked';
--
--  -- Ce que le numéro d'un membre donnerait (remplacez le numéro)
--  select public.match_family_entity('student', '0555123456', null);
-- =============================================================================
