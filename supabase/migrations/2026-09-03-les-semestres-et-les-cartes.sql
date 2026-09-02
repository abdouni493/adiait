-- =============================================================================
--  LES SEMESTRES, LES CARTES DE CHAQUE EMPLOI DU TEMPS, ET LA MUTATION
--  D'UN CHEVALIER D'UN GROUPE À UN AUTRE
--  MISE À JOUR D'UNE BASE DÉJÀ INSTALLÉE
-- =============================================================================
--
--  À exécuter UNE fois, dans : Supabase Dashboard -> SQL Editor -> New query.
--
--  Ce script est IDEMPOTENT : le relancer ne casse rien et ne double rien. Il
--  n'efface AUCUNE donnée métier — il AJOUTE deux tables, une colonne, une
--  valeur autorisée de plus sur une contrainte, et une entrée au catalogue des
--  droits.
--
--  SI VOUS PARTEZ D'UNE BASE NEUVE, n'exécutez pas ce fichier : lancez
--  `supabase/schema.sql`, qui contient déjà tout ce qui suit.
--
-- -----------------------------------------------------------------------------
--  CE QU'IL FAIT, ET POURQUOI
--
--   1. LE SEMESTRE — la saison du club.
--
--      L'application ne savait pas ce qu'était une SAISON. Les emplois du temps
--      tournaient indéfiniment, les cartes se comptaient à l'infini, et rien ne
--      disait jamais « c'est fini, on recommence ». Un semestre porte un nom,
--      une date de début, une date de fin annoncée, et tout ce qui se joue
--      entre les deux se range dessous : les emplois du temps, leurs cartes,
--      les chevaliers, ce qui rentre et ce qui reste dû.
--
--      SA FIN N'EST PAS UNE DATE, C'EST UN TRAVAIL FINI. La date annoncée dit
--      quand le club ESPÈRE fermer. Mais une séance annulée pour tout un groupe
--      se rejoue la semaine suivante, et la carte qu'elle devait clore déborde
--      alors sur cette date. Le semestre ne se ferme donc PAS tant qu'un emploi
--      du temps n'a pas fini ses cartes : `end_date` est REPOUSSÉE jusqu'au jour
--      de la dernière présence, et `planned_end_date` garde ce qui avait été
--      annoncé — pour que l'écart se lise, et se dise en alerte.
--
--      UNE FOIS CLOS (`closed_at`), IL FERME LE POINTAGE. Plus aucune présence
--      ne s'écrit — ni au comptoir, ni au badge — tant que le semestre suivant
--      n'a pas été créé. C'est ce qui empêche une séance de janvier de tomber
--      dans une saison terminée, où elle n'appartiendrait à aucune carte, à
--      aucune paie, à aucun compte.
--
--   2. LA CARTE — désormais une LIGNE, et non plus une division.
--
--      Une carte était un calcul : on comptait les présences d'un chevalier et
--      on les découpait quatre par quatre. Cela suffisait à la paie, mais ne
--      disait rien de ce que la réception demande — quand la carte du GROUPE a
--      commencé, quand elle finira, et laquelle est en cours. Pire : l'écran de
--      paie proposait douze cartes, de M1 à M12, dont onze n'avaient jamais eu
--      lieu.
--
--      `emploi_cartes` tient une ligne par carte et par emploi du temps :
--
--        • LA PREMIÈRE naît avec l'emploi du temps, à la date que la réception
--          fixe (`planned_start_date`). Cette date n'est qu'une INTENTION.
--        • ELLE COMMENCE VRAIMENT au premier pointage : `start_date` prend le
--          jour de cette première séance. Une carte prévue le 20 septembre mais
--          pointée pour la première fois le 27 commence le 27, et tout ce qui
--          suit se décale avec elle.
--        • ELLE SE FERME sur la séance qui complète le pack (`size`) :
--          `end_date` prend ce jour-là, `status` passe à `complete`.
--        • LA SUIVANTE N'EXISTE PAS AVANT. Aucune carte 2 tant que la carte 1
--          n'a pas donné ses quatre séances — et aucune ne s'ouvre une fois la
--          date de fin du semestre atteinte.
--
--      UNE SÉANCE ANNULÉE POUR TOUT LE GROUPE NE COMPTE PAS. Elle n'avance pas
--      la carte, ne coûte rien à personne, et le groupe la rejoue la semaine
--      suivante : c'est le DÉCALAGE, et les jours concernés sont listés dans
--      `postponed`.
--
--   3. LE TRANSFERT D'UN CHEVALIER — `payments.paid_from = 'transfer'`.
--
--      Muter un chevalier d'un groupe à un autre demandait deux gestes séparés
--      — le désinscrire, le réinscrire — et son solde restait bloqué sur un
--      créneau qu'il ne fréquentait plus. Il fait désormais le voyage avec lui :
--      un RETRAIT (montant négatif) sur l'ancien emploi, un VERSEMENT sur le
--      nouveau, les deux marqués `transfer`.
--
--      AUCUN MOUVEMENT DE CAISSE n'est écrit : l'argent n'entre ni ne sort, il
--      change de case. Le compter une seconde fois gonflerait la recette d'une
--      somme que personne n'a apportée. Son histoire, elle, ne bouge pas : les
--      présences pointées sur l'ancien emploi, les paiements qui y ont été
--      encaissés et les dettes qui y restent demeurent sur sa fiche, datés de sa
--      sortie. Une DETTE ne le suit jamais : elle reste due là où elle a été
--      creusée.
--
--   4. L'ÉCRAN « SEMESTRES » au catalogue des droits, avec ses six boutons.
--
--  CE QU'IL FAUT SAVOIR AVANT DE L'INSTALLER : tant qu'aucun semestre n'est
--  créé, RIEN NE CHANGE. Les emplois du temps tournent comme avant, aucune
--  carte n'est ouverte, le pointage n'est jamais bloqué, et l'écran de paie
--  garde ses douze pastilles. La nouveauté ne s'allume qu'au premier semestre.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
--  1. LES SEMESTRES
-- -----------------------------------------------------------------------------

create table if not exists public.semesters (
  id                text primary key,
  name              text not null default '',
  -- Le premier jour de la saison.
  start_date        text not null default '',
  -- La fin RÉELLE : celle qui est annoncée, puis repoussée d'elle-même quand
  -- une carte déborde. C'est cette date-là que les écrans affichent.
  end_date          text not null default '',
  -- La fin ANNONCÉE à la création, gardée telle quelle. Elle n'existe que pour
  -- dire « on avait dit le 15 janvier, on a fini le 20 ».
  planned_end_date  text,
  description       text,
  -- Le jour où le semestre a été DÉCLARÉ CLOS : toutes les cartes de tous ses
  -- emplois du temps ont donné toutes leurs séances. Tant qu'il est vide, le
  -- semestre vit — même passé sa date de fin.
  closed_at         text,
  -- L'alerte de prolongation a déjà été vue par le comptoir.
  extension_seen_at text,
  created_at        text,
  created_by        text,
  created_by_name   text,
  created_by_role   text
);

comment on table public.semesters is
  'Les saisons du club. Une saison ne se ferme pas à sa date de fin mais le jour où sa dernière carte a donné sa dernière séance.';

create index if not exists semesters_dates_idx on public.semesters (start_date, end_date);

-- -----------------------------------------------------------------------------
--  2. LE SEMESTRE D'UN EMPLOI DU TEMPS
-- -----------------------------------------------------------------------------
--  Il décide jusqu'à quand les cartes de ce créneau continuent de se créer : la
--  dernière ouverte avant la date de fin va jusqu'au bout, et aucune ne s'ouvre
--  après. NULL = emploi du temps d'avant les semestres, qui continue de
--  fonctionner exactement comme il l'a toujours fait.

alter table public.schedule_sessions
  add column if not exists semester_id text references public.semesters (id) on delete set null;

create index if not exists sessions_semester_idx on public.schedule_sessions (semester_id);

-- -----------------------------------------------------------------------------
--  3. LES CARTES DE CHAQUE EMPLOI DU TEMPS
-- -----------------------------------------------------------------------------

create table if not exists public.emploi_cartes (
  id                  text primary key,
  -- Le semestre dans lequel cette carte se joue. Supprimer un semestre emporte
  -- ses cartes : elles n'ont plus de saison où exister — mais les présences,
  -- les paiements et les soldes qu'elles recouvraient, eux, ne bougent pas.
  semester_id         text references public.semesters (id) on delete cascade,
  session_id          text references public.schedule_sessions (id) on delete cascade,
  -- 1, 2, 3 … — le rang de la carte sur CET emploi du temps.
  "index"             integer not null default 1,
  -- « M1 », « M2 » … — le code historique, celui que la paie et les paiements
  -- écrivent déjà partout. Il ne change pas ; seul l'affichage dit « Carte 1 ».
  code                text not null default 'M1',
  -- Combien de séances cette carte contient (copié du tarif à sa naissance).
  size                integer not null default 4,
  -- La date que la réception a fixée — une intention, jamais un fait.
  planned_start_date  text not null default '',
  -- Le jour de la PREMIÈRE présence réellement pointée sur cette carte.
  start_date          text,
  -- Le jour de la séance qui l'a complétée.
  end_date            text,
  -- Séances effectivement tenues (les annulations pour tout le groupe exclues).
  held                integer not null default 0,
  -- Les jours où la séance a été annulée pour TOUT le groupe, donc décalée
  -- d'une semaine : ["2026-09-27", …].
  postponed           jsonb,
  status              text not null default 'planned'
                      check (status in ('planned','running','complete')),
  created_at          text,
  created_by          text,
  created_by_name     text,
  created_by_role     text
);

comment on table public.emploi_cartes is
  'Une ligne par carte et par emploi du temps. Une carte commence à sa première présence pointée, se ferme sur la séance qui complète le pack, et la suivante n''existe pas avant.';

create index if not exists emploi_cartes_session_idx  on public.emploi_cartes (session_id);
create index if not exists emploi_cartes_semester_idx on public.emploi_cartes (semester_id);

-- Une carte par rang et par emploi du temps : le moteur est idempotent, la base
-- le garantit. Un doublon rendrait le partage des séances arbitraire.
create unique index if not exists emploi_cartes_session_index_uniq
  on public.emploi_cartes (session_id, "index");

-- -----------------------------------------------------------------------------
--  4. LE SOLDE QUI SUIT UN CHEVALIER MUTÉ — `paid_from = 'transfer'`
-- -----------------------------------------------------------------------------
--  La contrainte n'acceptait que quatre origines ; le transfert en est une
--  cinquième. On la repose plutôt que de l'altérer : c'est la seule façon de
--  rendre le script rejouable sans se soucier de ce qu'elle contenait avant.

alter table public.payments drop constraint if exists payments_paid_from_check;
alter table public.payments
  add constraint payments_paid_from_check
  check (paid_from is null or paid_from in ('cash','teacher_salary','teacher_debt','school_cash','transfer'));

-- -----------------------------------------------------------------------------
--  5. LES DROITS DE LECTURE ET D'ÉCRITURE
-- -----------------------------------------------------------------------------
--  Mêmes règles que les emplois du temps, dont les deux tables sont le
--  prolongement : TOUT COMPTE CONNECTÉ les lit — un entraîneur doit voir où en
--  sont les cartes de ses groupes, une famille où en est la saison — et seul
--  qui a le droit d'écrire sur « Semestres » ou « Emplois du temps » les
--  modifie.

alter table public.semesters     enable row level security;
alter table public.emploi_cartes enable row level security;

drop policy if exists semesters_read      on public.semesters;
drop policy if exists semesters_write     on public.semesters;
drop policy if exists emploi_cartes_read  on public.emploi_cartes;
drop policy if exists emploi_cartes_write on public.emploi_cartes;

create policy semesters_read on public.semesters
  for select to authenticated using (true);

create policy semesters_write on public.semesters
  for all to authenticated
  using (public.can_write(array['semesters','planner']))
  with check (public.can_write(array['semesters','planner']));

create policy emploi_cartes_read on public.emploi_cartes
  for select to authenticated using (true);

-- Les cartes sont écrites par le MOTEUR, qui tourne partout où l'on pointe :
-- au tableau de bord, sur l'écran Présences, et sur l'écran Semestres. Le droit
-- d'écriture suit donc ces écrans-là, et non le seul écran des semestres.
create policy emploi_cartes_write on public.emploi_cartes
  for all to authenticated
  using (public.can_write(array['semesters','planner','attendance','dashboard']))
  with check (public.can_write(array['semesters','planner','attendance','dashboard']));

-- -----------------------------------------------------------------------------
--  6. L'ÉCRAN « SEMESTRES » AU CATALOGUE DES DROITS
-- -----------------------------------------------------------------------------
--  Il se range juste après le tableau de bord — c'est la saison qui encadre
--  tout le reste. La position 2 est libérée en poussant les écrans suivants
--  d'un cran, pour que la barre latérale garde son ordre.

update public.app_pages set position = position + 1 where position >= 2;

insert into public.app_pages (key, position, emoji, label, href, hint) values
  ('semesters', 2, '🗓️', 'Semestres', '/semesters',
   'Les saisons du club : leurs catégories, leurs emplois du temps, leurs cartes et leur argent.')
on conflict (key) do update set
  position = excluded.position,
  emoji    = excluded.emoji,
  label    = excluded.label,
  href     = excluded.href,
  hint     = excluded.hint;

insert into public.app_page_actions (page_key, action_id, position, label, hint) values
  ('semesters', 'create', 1, 'Créer un semestre', null),
  ('semesters', 'view',   2, 'Ouvrir le détail d''un semestre', 'Catégories, emplois du temps, cartes et chevaliers.'),
  ('semesters', 'edit',   3, 'Modifier un semestre', null),
  ('semesters', 'delete', 4, 'Supprimer un semestre', null),
  ('semesters', 'close',  5, 'Clore un semestre', 'Ferme la saison — et le pointage avec elle.'),
  ('semesters', 'pay',    6, 'Encaisser la dette d''un chevalier', 'Depuis la liste des chevaliers d''un emploi du temps.')
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
--      (select count(*) from public.semesters)                       as semestres,
--      (select count(*) from public.emploi_cartes)                   as cartes,
--      (select count(*) from public.app_pages where key='semesters') as ecran;
--
--  `semestres` et `cartes` valent 0 sur une base qui vient d'être mise à jour :
--  c'est normal, et c'est la preuve que rien n'a été inventé. Le premier
--  semestre se crée depuis l'écran « Semestres », et la première carte naît
--  avec le premier emploi du temps qu'on lui rattache.
-- =============================================================================
