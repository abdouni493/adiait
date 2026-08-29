-- =============================================================================
--  DEUX SÉANCES LE MÊME JOUR, ET LA PART DU TRANSPORT
--  MISE À JOUR D'UNE BASE DÉJÀ INSTALLÉE
-- =============================================================================
--
--  À exécuter UNE fois, dans : Supabase Dashboard -> SQL Editor -> New query.
--
--  Ce script est IDEMPOTENT : le relancer ne casse rien et ne double rien.
--  Il n'efface AUCUNE donnée et ne modifie aucune ligne existante — il ne fait
--  qu'AJOUTER quatre colonnes, toutes facultatives.
--
--  SI VOUS PARTEZ D'UNE BASE NEUVE, n'exécutez pas ce fichier : lancez
--  `supabase/schema.sql`, qui contient déjà tout ce qui suit.
--
-- -----------------------------------------------------------------------------
--  CE QU'IL FAIT, ET POURQUOI
--
--   1. UN EMPLOI DU TEMPS PEUT TENIR DEUX SÉANCES LE MÊME JOUR
--      (`schedule_sessions.day_slots`).
--
--      Un groupe s'entraîne parfois le matin PUIS le soir. Ce n'étaient
--      jusqu'ici pas deux séances mais un seul créneau : on ne pouvait pointer
--      qu'une présence par jour, la carte n'avançait que d'une séance, et
--      l'entraîneur n'était payé qu'une fois pour deux entraînements donnés.
--
--      `day_slots` porte, jour par jour, la LISTE des séances :
--
--        { "saturday": [ {"startTime":"08:00","endTime":"10:00"},
--                        {"startTime":"17:00","endTime":"19:00"} ] }
--
--      `day_times` garde TOUJOURS la première séance de chaque jour, et
--      `start_time`/`end_time` celle du premier jour : tout ce qui ne lit qu'un
--      horaire — la grille, le scan de badge, les impressions — continue de
--      fonctionner sans rien savoir de la nouveauté. Une colonne VIDE = un
--      emploi du temps qui ne tient qu'une séance par jour, exactement comme
--      avant.
--
--   2. CHAQUE PRÉSENCE SAIT DE QUELLE SÉANCE DU JOUR ELLE PARLE
--      (`attendance_records.slot`).
--
--      C'est ce qui permet de pointer le matin et le soir séparément : deux
--      lignes le même jour, qui ne se confondent ni ne s'écrasent. 0 (ou vide)
--      = la séance unique du jour, ou la première — donc TOUTES les présences
--      déjà écrites restent exactement ce qu'elles étaient.
--
--   3. CHAQUE PART DUE À L'ENTRAÎNEUR AUSSI
--      (`unpaid_teacher_sessions.slot`).
--
--      Deux séances tenues le même jour rapportent DEUX parts. Sans cette
--      colonne, repointer celle du matin effaçait la dette née de celle du
--      soir : l'entraîneur perdait un entraînement à chaque correction.
--
--   4. LE TRANSPORT SE PRÉLÈVE SUR LA CARTE
--      (`subscriptions.transport_month_share`).
--
--      Le prix d'une carte se coupait en deux : la part du club, la part de
--      l'entraîneur. Il se coupe désormais en TROIS — le ramassage d'abord,
--      puis le club, puis ce qui reste pour l'entraîneur. Le transport n'est ni
--      un revenu du club ni une part de l'entraîneur : c'est un coût que la
--      carte porte, suivi À PART pour que les rapports puissent dire ce que le
--      bus coûte, groupe par groupe et en tout.
--
--      0 ou VIDE = ce créneau n'a pas de transport, et sa carte se partage
--      exactement comme avant. Aucun tarif existant ne change de valeur.
--
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
--  1. Les séances de chaque jour d'un emploi du temps
-- -----------------------------------------------------------------------------
alter table public.schedule_sessions
  add column if not exists day_slots jsonb;

comment on column public.schedule_sessions.day_slots is
  'Les séances de CHAQUE jour, dans l''ordre : { "saturday": [{"startTime":"08:00","endTime":"10:00"}, {"startTime":"17:00","endTime":"19:00"}] }. `day_times` garde la première séance de chaque jour. Vide = une seule séance par jour.';

-- -----------------------------------------------------------------------------
--  2. La séance du jour que chaque présence pointe
-- -----------------------------------------------------------------------------
alter table public.attendance_records
  add column if not exists slot integer;

comment on column public.attendance_records.slot is
  'Laquelle des séances du jour : 0 (ou vide) = la seule, ou la première. Un emploi du temps peut en tenir deux — le matin et le soir — et elles se pointent séparément.';

-- Un emploi du temps à deux séances écrit deux lignes par jour et par
-- chevalier : l''index de recherche les distingue, sinon la feuille de présence
-- balaie toute la table à chaque clic.
create index if not exists attendance_session_slot_idx
  on public.attendance_records (session_id, slot);

-- -----------------------------------------------------------------------------
--  3. La séance du jour qui a produit chaque part d'entraîneur
-- -----------------------------------------------------------------------------
alter table public.unpaid_teacher_sessions
  add column if not exists slot integer;

comment on column public.unpaid_teacher_sessions.slot is
  'La séance du jour qui a produit cette part (0 = la première). Deux séances tenues le même jour rapportent DEUX parts, et repointer l''une ne doit jamais effacer l''autre.';

-- -----------------------------------------------------------------------------
--  4. La part du transport sur le prix d'une carte
-- -----------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists transport_month_share numeric;

comment on column public.subscriptions.transport_month_share is
  'La part du prix de la carte qui paie le ramassage. Elle est prélevée AVANT le partage : ce qui reste se divise entre le club (`school_month_share`) et l''entraîneur. 0 ou vide = pas de transport sur ce créneau.';

commit;

-- =============================================================================
--  VÉRIFICATION — les quatre colonnes doivent apparaître.
-- =============================================================================
--  select table_name, column_name, data_type
--    from information_schema.columns
--   where table_schema = 'public'
--     and (   (table_name = 'schedule_sessions'        and column_name = 'day_slots')
--          or (table_name = 'attendance_records'       and column_name = 'slot')
--          or (table_name = 'unpaid_teacher_sessions'  and column_name = 'slot')
--          or (table_name = 'subscriptions'            and column_name = 'transport_month_share'))
--   order by table_name;
