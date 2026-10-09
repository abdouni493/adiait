-- =============================================================================
--  L'ARGENT SUIT L'EMPLOI DU TEMPS, L'ABSENCE SE PAIE, ET LA BASE RATTRAPE
--  CE QUE L'APPLICATION ÉCRIT
--  MISE À JOUR D'UNE BASE DÉJÀ INSTALLÉE
-- =============================================================================
--
--  À exécuter UNE fois, dans : Supabase Dashboard -> SQL Editor -> New query.
--
--  Ce script est IDEMPOTENT : le relancer ne casse rien et ne double rien.
--  IL NE MODIFIE AUCUNE DONNÉE : pas un UPDATE, pas un DELETE. Il ne fait
--  qu'AJOUTER les colonnes qui manqueraient à une base installée avant elles.
--
-- -----------------------------------------------------------------------------
--  CE QUI A CHANGÉ DANS L'APPLICATION (aucune colonne nouvelle n'est requise)
--
--   1. L'ARGENT SUIT L'EMPLOI DU TEMPS.
--
--      Un chevalier qui verse 40 000 DA sur la carte 1 d'un emploi à 5 000 DA
--      la carte a payé HUIT cartes. L'application rattachait l'argent au seul
--      code de carte écrit sur le versement (`payments.month_code`) : la carte
--      1 restait à +35 000 DA, et la carte 2 s'affichait en dette dès sa
--      première séance. Désormais tout ce qui est versé sur un emploi forme UNE
--      bourse qui paie les cartes dans l'ordre ; `month_code` n'est plus qu'une
--      étiquette (le reçu, l'historique). Rien à migrer : c'est un calcul.
--
--   2. UNE ABSENCE COÛTE LE PRIX DE LA SÉANCE, comme une présence — la toute
--      première aussi. Seule une séance ANNULÉE pour le groupe ne coûte rien.
--      Les anciennes absences « offertes » restent telles qu'elles ont été
--      écrites (`no_charge = true`) ; re-cliquer « Absent » sur l'une d'elles,
--      depuis la feuille de présence, la facture.
--
--   3. UN CHAMP VIDÉ À L'ÉCRAN SE VIDE EN BASE. L'enregistrement automatique
--      n'envoyait jamais une colonne devenue vide : la base gardait l'ancienne
--      valeur (une date de début de carte recalculée, l'archivage d'un tarif
--      remis en service). Elle reçoit maintenant `null`.
--
-- -----------------------------------------------------------------------------
--  CE QUE FAIT CE SCRIPT
--
--   A. LE GARDE-FOU DES COLONNES. Chaque colonne que l'application envoie est
--      ajoutée SI ELLE MANQUE (`add column if not exists`). Sur une base à jour,
--      chaque ligne est un « rien à faire » ; sur une base installée avant une
--      colonne (par exemple `attendance_records.no_charge` ou `.slot`), c'est
--      ce qui empêchait PostgreSQL d'accepter les présences : un seul champ
--      inconnu fait refuser tout l'envoi, et la présence pointée à l'écran
--      disparaissait au rechargement suivant.
--
--      Une colonne NOT NULL sans valeur par défaut est ajoutée nullable : on ne
--      peut pas exiger une valeur de lignes qui existent déjà.
--
--   B. Les index de lecture des présences, s'ils manquent.
--
--   C. PostgREST relit le schéma (`notify pgrst`), pour que l'API voie tout de
--      suite les colonnes ajoutées.
--
--  Puis, APRÈS le `commit`, des requêtes de VÉRIFICATION en lecture seule.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
--  A. LE GARDE-FOU DES COLONNES — tout ce que l'application écrit
-- -----------------------------------------------------------------------------
alter table if exists public.schools
  add column if not exists name text not null default 'École',
  add column if not exists description text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists logo text,
  add column if not exists address text not null default '',
  add column if not exists article_fiscal text,
  add column if not exists registre_commerce text,
  add column if not exists nif text,
  add column if not exists nis text,
  add column if not exists registration_fee numeric,
  add column if not exists registration_fee_scope text check (registration_fee_scope in ('all','levels','classes','sessions')),
  add column if not exists registration_fee_levels jsonb,
  add column if not exists registration_fee_class_ids jsonb,
  add column if not exists registration_fee_session_ids jsonb,
  add column if not exists absence_penalty_enabled boolean,
  add column if not exists absence_penalty_since text,
  add column if not exists absence_week_start_day integer,
  add column if not exists site_favicon text,
  add column if not exists site_description text,
  add column if not exists site_description2 text,
  add column if not exists site_hero_image text,
  add column if not exists site_video_url text,
  add column if not exists site_facebook text,
  add column if not exists site_instagram text,
  add column if not exists site_tiktok text,
  add column if not exists site_snapchat text,
  add column if not exists site_whatsapp text,
  add column if not exists site_maps_url text,
  add column if not exists site_phone text,
  add column if not exists site_phone2 text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.class_categories
  add column if not exists name text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.modules
  add column if not exists name text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.groups
  add column if not exists name text,
  add column if not exists class_id text,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.salles
  add column if not exists name text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.classes
  add column if not exists type text check (type in ('cours','formation')),
  add column if not exists name text,
  add column if not exists description text not null default '',
  add column if not exists age_from integer check (age_from is null or age_from between 0 and 120),
  add column if not exists age_to integer check (age_to is null or age_to between 0 and 120),
  add column if not exists cours_level text check (cours_level in ('maternelle','primaire','moyen','lycee')),
  add column if not exists year text,
  add column if not exists category_id text references public.class_categories (id) on delete set null,
  add column if not exists formation_level text check (formation_level in ('A1','A2','B1','B2','C1','C2')),
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.teachers
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists payment_type text not null default 'percentage' check (payment_type in ('monthly','percentage','per_group')),
  add column if not exists monthly_amount numeric,
  add column if not exists start_date text,
  add column if not exists percentage numeric,
  add column if not exists is_passager boolean,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.worker_job_roles
  add column if not exists name text,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.reception_staff
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists payment_type text not null default 'monthly' check (payment_type in ('daily','monthly','half_day','hourly')),
  add column if not exists start_date text not null default '',
  add column if not exists salary numeric not null default 0,
  add column if not exists role text references public.worker_job_roles (id) on delete set null,
  add column if not exists rfid text,
  add column if not exists hourly_rate numeric,
  add column if not exists has_account boolean,
  add column if not exists username text,
  add column if not exists nav_keys jsonb,
  add column if not exists action_keys jsonb,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.parents
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists phone2 text,
  add column if not exists birth_date text,
  add column if not exists address text,
  add column if not exists email text not null default '',
  add column if not exists child_ids jsonb not null default '[]'::jsonb,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.schedule_sessions
  add column if not exists class_id text references public.classes (id) on delete set null,
  add column if not exists module_id text references public.modules (id) on delete set null,
  add column if not exists group_id text references public.groups (id) on delete set null,
  add column if not exists salle_id text references public.salles (id) on delete set null,
  add column if not exists teacher_id text references public.teachers (id) on delete set null,
  add column if not exists days jsonb not null default '[]'::jsonb,
  add column if not exists start_time text not null default '',
  add column if not exists end_time text not null default '',
  add column if not exists day_times jsonb,
  add column if not exists day_slots jsonb,
  add column if not exists day_salles jsonb,
  add column if not exists class_groups jsonb,
  add column if not exists is_open boolean,
  add column if not exists title text,
  add column if not exists period_start text,
  add column if not exists period_end text,
  add column if not exists class_ids jsonb,
  add column if not exists group_ids jsonb,
  add column if not exists salle_ids jsonb,
  add column if not exists open_price numeric,
  add column if not exists archived_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.emploi_cartes
  add column if not exists session_id text references public.schedule_sessions (id) on delete cascade,
  add column if not exists "index" integer not null default 1,
  add column if not exists code text not null default 'M1',
  add column if not exists size integer not null default 4,
  add column if not exists planned_start_date text not null default '',
  add column if not exists start_date text,
  add column if not exists end_date text,
  add column if not exists held integer not null default 0,
  add column if not exists postponed jsonb,
  add column if not exists status text not null default 'planned' check (status in ('planned','running','complete')),
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.subscriptions
  add column if not exists session_id text references public.schedule_sessions (id) on delete cascade,
  add column if not exists price_per_session numeric not null default 0,
  add column if not exists level_price numeric,
  add column if not exists period_months integer,
  add column if not exists monthly_seances integer,
  add column if not exists monthly_price numeric,
  add column if not exists school_month_share numeric,
  add column if not exists transport_month_share numeric,
  add column if not exists teacher_per_seance numeric,
  add column if not exists engagement_fee numeric,
  add column if not exists engagement_description text,
  add column if not exists archived_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.students
  add column if not exists registration_number text,
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists birth_date text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists phone2 text,
  add column if not exists email text not null default '',
  add column if not exists address text,
  add column if not exists rfid text not null default '',
  add column if not exists is_free boolean not null default false,
  add column if not exists student_case text check (student_case in ('normal','special','teacher_child','reduction','school_only')),
  add column if not exists free_subscription_ids jsonb,
  add column if not exists teacher_father_id text references public.teachers (id) on delete set null,
  add column if not exists case_reduction jsonb,
  add column if not exists unpaid_teacher_ids jsonb,
  add column if not exists school_only_subscription_ids jsonb,
  add column if not exists enrollment_level text,
  add column if not exists enrollment_year text,
  add column if not exists parent_id text references public.parents (id) on delete set null,
  add column if not exists subscription_ids jsonb not null default '[]'::jsonb,
  add column if not exists subscription_dates jsonb,
  add column if not exists subscription_discounts jsonb,
  add column if not exists registration_due numeric,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.student_credentials
  add column if not exists password text not null default '',
  add column if not exists updated_at text not null default '';

alter table if exists public.enrollments
  add column if not exists student_id text references public.students (id) on delete cascade,
  add column if not exists subscription_id text references public.subscriptions (id) on delete cascade,
  add column if not exists paid_seances numeric not null default 0,
  add column if not exists consumed_seances numeric not null default 0,
  add column if not exists discount jsonb,
  add column if not exists start_date text,
  add column if not exists expiry_date text,
  add column if not exists plan text check (plan in ('seance','month')),
  add column if not exists month_seances numeric,
  add column if not exists balance numeric,
  add column if not exists created_at text not null default '',
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.payments
  add column if not exists student_id text references public.students (id) on delete cascade,
  add column if not exists enrollment_id text references public.enrollments (id) on delete set null,
  add column if not exists subscription_id text references public.subscriptions (id) on delete set null,
  add column if not exists month_code text,
  add column if not exists seances_purchased numeric not null default 0,
  add column if not exists unit_price numeric not null default 0,
  add column if not exists gross_total numeric not null default 0,
  add column if not exists plan text check (plan in ('seance','month')),
  add column if not exists discount_type text check (discount_type in ('percent','amount')),
  add column if not exists discount_value numeric,
  add column if not exists net_total numeric not null default 0,
  add column if not exists amount_paid numeric not null default 0,
  add column if not exists rest numeric not null default 0,
  add column if not exists type text not null default 'subscription_payment' check (type in ('subscription_payment','debt_payment')),
  add column if not exists paid_from text check (paid_from in ('cash','teacher_salary','teacher_debt','school_cash','transfer')),
  add column if not exists charge_id text,
  add column if not exists date text not null default '',
  add column if not exists description text,
  add column if not exists alert_read boolean,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.student_charges
  add column if not exists student_id text references public.students (id) on delete cascade,
  add column if not exists name text not null default '',
  add column if not exists amount numeric not null default 0,
  add column if not exists description text,
  add column if not exists date text not null default '',
  add column if not exists origin text check (origin in ('manual','school_advance','engagement','formation')),
  add column if not exists source_payment_id text,
  add column if not exists subscription_id text references public.subscriptions (id) on delete set null,
  add column if not exists month_code text,
  add column if not exists paid_amount numeric,
  add column if not exists paid boolean,
  add column if not exists payment_id text,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.attendance_records
  add column if not exists student_id text references public.students (id) on delete cascade,
  add column if not exists session_id text references public.schedule_sessions (id) on delete cascade,
  add column if not exists "timestamp" text not null default '',
  add column if not exists amount_deducted numeric not null default 0,
  add column if not exists status text not null default 'present' check (status in ('present','late','absent','cancelled')),
  add column if not exists slot integer,
  add column if not exists substitute_group boolean,
  add column if not exists free_period_id text,
  add column if not exists pre_start boolean,
  add column if not exists waived_amount numeric,
  add column if not exists no_charge boolean,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.absence_penalties
  add column if not exists student_id text references public.students (id) on delete cascade,
  add column if not exists subscription_id text references public.subscriptions (id) on delete set null,
  add column if not exists session_id text references public.schedule_sessions (id) on delete set null,
  add column if not exists module_id text references public.modules (id) on delete set null,
  add column if not exists period_start text not null default '',
  add column if not exists period_end text not null default '',
  add column if not exists amount numeric not null default 0,
  add column if not exists remaining_after numeric not null default 0,
  add column if not exists created_at text not null default '',
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.teacher_payments
  add column if not exists teacher_id text references public.teachers (id) on delete cascade,
  add column if not exists amount numeric not null default 0,
  add column if not exists method text not null default 'percent' check (method in ('fixed','percent','group')),
  add column if not exists percentage numeric,
  add column if not exists students_count integer not null default 0,
  add column if not exists sessions_count integer not null default 0,
  add column if not exists description text not null default '',
  add column if not exists details jsonb not null default '[]'::jsonb,
  add column if not exists gross numeric,
  add column if not exists expenses jsonb,
  add column if not exists acomptes jsonb,
  add column if not exists child_charges jsonb,
  add column if not exists child_debts jsonb,
  add column if not exists months jsonb,
  add column if not exists arrears jsonb,
  add column if not exists cash_id text,
  add column if not exists board jsonb,
  add column if not exists paid_at text not null default '',
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.teacher_acomptes
  add column if not exists teacher_id text references public.teachers (id) on delete cascade,
  add column if not exists amount numeric not null default 0,
  add column if not exists description text not null default '',
  add column if not exists date text not null default '',
  add column if not exists paid boolean,
  add column if not exists payment_id text references public.teacher_payments (id) on delete set null,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.teacher_expenses
  add column if not exists teacher_id text references public.teachers (id) on delete cascade,
  add column if not exists name text not null default '',
  add column if not exists amount numeric not null default 0,
  add column if not exists description text,
  add column if not exists date text not null default '',
  add column if not exists paid boolean,
  add column if not exists payment_id text references public.teacher_payments (id) on delete set null,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.teacher_child_debts
  add column if not exists teacher_id text references public.teachers (id) on delete cascade,
  add column if not exists student_id text references public.students (id) on delete cascade,
  add column if not exists subscription_id text references public.subscriptions (id) on delete set null,
  add column if not exists month_code text,
  add column if not exists label text not null default '',
  add column if not exists amount numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists paid boolean,
  add column if not exists payment_id text references public.teacher_payments (id) on delete set null,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.teacher_absences
  add column if not exists teacher_id text references public.teachers (id) on delete cascade,
  add column if not exists cost numeric not null default 0,
  add column if not exists description text not null default '',
  add column if not exists date text not null default '',
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.unpaid_teacher_sessions
  add column if not exists teacher_id text references public.teachers (id) on delete cascade,
  add column if not exists session_id text references public.schedule_sessions (id) on delete set null,
  add column if not exists student_id text references public.students (id) on delete cascade,
  add column if not exists amount numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists slot integer,
  add column if not exists paid boolean not null default false,
  add column if not exists payment_id text references public.teacher_payments (id) on delete set null,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.worker_payments
  add column if not exists worker_id text references public.reception_staff (id) on delete cascade,
  add column if not exists kind text not null default 'monthly' check (kind in ('daily','monthly','half_day','hourly')),
  add column if not exists period_keys jsonb not null default '[]'::jsonb,
  add column if not exists shift_ids jsonb,
  add column if not exists gross numeric not null default 0,
  add column if not exists acomptes numeric not null default 0,
  add column if not exists absences numeric not null default 0,
  add column if not exists net numeric not null default 0,
  add column if not exists amount numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists description text,
  add column if not exists cash_id text,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.worker_shifts
  add column if not exists worker_id text references public.reception_staff (id) on delete cascade,
  add column if not exists work_date text not null default '',
  add column if not exists start_at text,
  add column if not exists end_at text,
  add column if not exists minutes numeric not null default 0,
  add column if not exists frozen boolean not null default false,
  add column if not exists paid boolean not null default false,
  add column if not exists payment_id text references public.worker_payments (id) on delete set null,
  add column if not exists created_at text not null default '',
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.worker_acomptes
  add column if not exists worker_id text references public.reception_staff (id) on delete cascade,
  add column if not exists amount numeric not null default 0,
  add column if not exists description text not null default '',
  add column if not exists date text not null default '',
  add column if not exists paid boolean,
  add column if not exists payment_id text references public.worker_payments (id) on delete set null,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.worker_absences
  add column if not exists worker_id text references public.reception_staff (id) on delete cascade,
  add column if not exists cost numeric not null default 0,
  add column if not exists description text not null default '',
  add column if not exists date text not null default '',
  add column if not exists paid boolean,
  add column if not exists payment_id text references public.worker_payments (id) on delete set null,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.free_periods
  add column if not exists name text not null default '',
  add column if not exists description text not null default '',
  add column if not exists start_date text not null default '',
  add column if not exists end_date text not null default '',
  add column if not exists all_classes boolean not null default false,
  add column if not exists class_ids jsonb not null default '[]'::jsonb,
  add column if not exists pay_teachers boolean not null default false,
  add column if not exists active boolean not null default true,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.module_absence_rules
  add column if not exists enabled boolean not null default false,
  add column if not exists days_window integer not null default 0;

alter table if exists public.announcements
  add column if not exists title text not null default '',
  add column if not exists description text not null default '',
  add column if not exists audience text not null default 'all' check (audience in ('students','teachers','parents','all')),
  add column if not exists end_date text not null default '',
  add column if not exists date text not null default '',
  add column if not exists target_group_ids jsonb,
  add column if not exists include_parents boolean,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.expense_categories
  add column if not exists name text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.expenses
  add column if not exists name text not null default '',
  add column if not exists category_id text references public.expense_categories (id) on delete set null,
  add column if not exists amount numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.cash_categories
  add column if not exists name text,
  add column if not exists color text,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.cash_transactions
  add column if not exists type text check (type in ( 'deposit','withdraw','expense','student_payment', 'teacher_payment','acompte','student_debt', 'horse_purchase','horse_sale','horse_expense','horse_owner_payment', 'other_debt_payment')),
  add column if not exists amount numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists description text not null default '',
  add column if not exists category_id text references public.cash_categories (id) on delete set null,
  add column if not exists caisse text check (caisse is null or caisse in ('general','secondary')),
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.notifications
  add column if not exists parent_id text references public.parents (id) on delete cascade,
  add column if not exists title text not null default '',
  add column if not exists description text not null default '',
  add column if not exists date text not null default '',
  add column if not exists read boolean not null default false,
  add column if not exists auto boolean not null default false,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.coursework
  add column if not exists name text not null default '',
  add column if not exists type text not null default 'single' check (type in ('single','period')),
  add column if not exists dates jsonb not null default '[]'::jsonb,
  add column if not exists price_per_session numeric not null default 0,
  add column if not exists total numeric not null default 0,
  add column if not exists teacher_id text references public.teachers (id) on delete cascade,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.independent_sessions
  add column if not exists student_id text references public.students (id) on delete set null,
  add column if not exists passager_name text,
  add column if not exists item_label text not null default '',
  add column if not exists price numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists session_id text references public.schedule_sessions (id) on delete set null,
  add column if not exists start_time text,
  add column if not exists end_time text,
  add column if not exists created_at text,
  add column if not exists teacher_paid boolean,
  add column if not exists school_share numeric,
  add column if not exists teacher_id text references public.teachers (id) on delete set null,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.program_categories
  add column if not exists name text not null default '',
  add column if not exists color text,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.group_seances
  add column if not exists teacher_id text references public.teachers (id) on delete cascade,
  add column if not exists teacher_ids jsonb,
  add column if not exists worker_ids jsonb,
  add column if not exists category_id text references public.program_categories (id) on delete set null,
  add column if not exists title text not null default '',
  add column if not exists description text,
  add column if not exists date text not null default '',
  add column if not exists start_time text not null default '',
  add column if not exists end_time text not null default '',
  add column if not exists students_count integer not null default 0,
  add column if not exists price_per_student numeric not null default 0,
  add column if not exists school_per_student numeric not null default 0,
  add column if not exists cash_in_id text,
  add column if not exists cash_out_id text,
  add column if not exists created_at text not null default '',
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.account_requests
  add column if not exists account_id uuid references auth.users (id) on delete cascade,
  add column if not exists kind text check (kind in ('student','parent')),
  add column if not exists source text check (source in ('login','website')),
  add column if not exists formation_id text,
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists phone2 text,
  add column if not exists birth_date text,
  add column if not exists address text,
  add column if not exists email text not null default '',
  add column if not exists existing_member boolean not null default false,
  add column if not exists children_subscribed boolean,
  add column if not exists children jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'pending' check (status in ('pending','linked','rejected')),
  add column if not exists linked_entity_id text,
  add column if not exists linked_child_ids jsonb,
  add column if not exists auto_linked boolean not null default false,
  add column if not exists reviewed_at text,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_by_name text,
  add column if not exists created_at text not null default '',
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.website_formations
  add column if not exists kind text not null default 'formation' check (kind in ('formation','event')),
  add column if not exists name text not null default '',
  add column if not exists description text not null default '',
  add column if not exists start_date text not null default '',
  add column if not exists start_time text not null default '',
  add column if not exists end_date text not null default '',
  add column if not exists end_time text not null default '',
  add column if not exists days jsonb not null default '[]'::jsonb,
  add column if not exists trainer_id text references public.teachers (id) on delete set null,
  add column if not exists trainer_name text,
  add column if not exists trainer_note text,
  add column if not exists price numeric not null default 0,
  add column if not exists seances integer not null default 0,
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists hidden boolean not null default false,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.period_templates
  add column if not exists name text not null default '',
  add column if not exists start_date text not null default '',
  add column if not exists end_date text not null default '',
  add column if not exists description text,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.formation_enrollments
  add column if not exists formation_id text references public.website_formations (id) on delete cascade,
  add column if not exists student_id text references public.students (id) on delete cascade,
  add column if not exists price numeric not null default 0,
  add column if not exists charge_id text references public.student_charges (id) on delete set null,
  add column if not exists date text not null default '',
  add column if not exists source text check (source in ('login','website')),
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.horses
  add column if not exists name text not null default '',
  add column if not exists reference text,
  add column if not exists breed text,
  add column if not exists gender text check (gender is null or gender in ('stallion','mare','gelding')),
  add column if not exists birth_date text,
  add column if not exists age text,
  add column if not exists color text,
  add column if not exists height text,
  add column if not exists weight text,
  add column if not exists vaccination text,
  add column if not exists medical_history text,
  add column if not exists vet_exam text,
  add column if not exists discipline text,
  add column if not exists training_level text,
  add column if not exists competition_history text,
  add column if not exists awards text,
  add column if not exists sire text,
  add column if not exists dam text,
  add column if not exists pedigree_docs text,
  add column if not exists purchase_price numeric,
  add column if not exists seller_name text,
  add column if not exists seller_phone text,
  add column if not exists seller_note text,
  add column if not exists purchase_date text,
  add column if not exists selling_price numeric,
  add column if not exists status text not null default 'available' check (status in ('available','sold')),
  add column if not exists origin text not null default 'stable' check (origin in ('purchase','stable')),
  add column if not exists owner_kind text not null default 'club' check (owner_kind in ('club','student','parent','external')),
  add column if not exists owner_student_id text references public.students (id) on delete set null,
  add column if not exists owner_parent_id text references public.parents  (id) on delete set null,
  add column if not exists owner_name text,
  add column if not exists owner_phone text,
  add column if not exists owner_note text,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.horse_sales
  add column if not exists horse_id text references public.horses (id) on delete cascade,
  add column if not exists horse_name text not null default '',
  add column if not exists buyer_kind text not null default 'external' check (buyer_kind in ('student','parent','external')),
  add column if not exists buyer_student_id text references public.students (id) on delete set null,
  add column if not exists buyer_parent_id text references public.parents  (id) on delete set null,
  add column if not exists buyer_name text not null default '',
  add column if not exists buyer_phone text,
  add column if not exists buyer_note text,
  add column if not exists date text not null default '',
  add column if not exists base_price numeric not null default 0,
  add column if not exists discount_type text check (discount_type is null or discount_type in ('percent','amount')),
  add column if not exists discount_value numeric,
  add column if not exists total numeric not null default 0,
  add column if not exists paid numeric not null default 0,
  add column if not exists rest numeric not null default 0,
  add column if not exists status text not null default 'completed' check (status in ('completed','debt')),
  add column if not exists cash_id text references public.cash_transactions (id) on delete set null,
  add column if not exists description text,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.horse_sale_payments
  add column if not exists sale_id text references public.horse_sales (id) on delete cascade,
  add column if not exists amount numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists description text,
  add column if not exists cash_id text references public.cash_transactions (id) on delete set null,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.horse_expense_categories
  add column if not exists name text not null default '',
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.horse_expenses
  add column if not exists horse_id text references public.horses (id) on delete cascade,
  add column if not exists category_id text references public.horse_expense_categories (id) on delete set null,
  add column if not exists category_name text,
  add column if not exists amount numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists description text,
  add column if not exists owner_debt boolean not null default false,
  add column if not exists cash_id text references public.cash_transactions (id) on delete set null,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.horse_owner_payments
  add column if not exists horse_id text references public.horses (id) on delete cascade,
  add column if not exists amount numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists description text,
  add column if not exists cash_id text references public.cash_transactions (id) on delete set null,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.other_debts
  add column if not exists student_id text references public.students (id) on delete set null,
  add column if not exists parent_id text references public.parents  (id) on delete set null,
  add column if not exists person_name text not null default '',
  add column if not exists phone text,
  add column if not exists note text,
  add column if not exists amount numeric not null default 0,
  add column if not exists description text,
  add column if not exists date text not null default '',
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

alter table if exists public.other_debt_payments
  add column if not exists debt_id text references public.other_debts (id) on delete cascade,
  add column if not exists amount numeric not null default 0,
  add column if not exists date text not null default '',
  add column if not exists description text,
  add column if not exists cash_id text references public.cash_transactions (id) on delete set null,
  add column if not exists created_at text,
  add column if not exists created_by text,
  add column if not exists created_by_name text,
  add column if not exists created_by_role text;

-- -----------------------------------------------------------------------------
--  B. LES INDEX DE LECTURE DES PRÉSENCES
-- -----------------------------------------------------------------------------
create index if not exists attendance_student_idx      on public.attendance_records (student_id);
create index if not exists attendance_session_idx      on public.attendance_records (session_id);
create index if not exists attendance_session_slot_idx on public.attendance_records (session_id, slot);
create index if not exists attendance_ts_idx           on public.attendance_records ("timestamp");
create index if not exists enrollments_student_idx     on public.enrollments (student_id);
create index if not exists enrollments_sub_idx         on public.enrollments (subscription_id);
create index if not exists emploi_cartes_session_idx   on public.emploi_cartes (session_id);

-- -----------------------------------------------------------------------------
--  C. L'API RELIT LE SCHÉMA
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;

-- =============================================================================
--  VÉRIFICATIONS — LECTURE SEULE. Lancez-les une par une, après le script.
-- =============================================================================

-- 1. LES PRÉSENCES ARRIVENT-ELLES EN BASE ?
--    `presences` doit grandir à chaque pointage. S'il reste à 0 alors que la
--    feuille a été pointée, l'écran affiche « Enregistrement refusé » : le
--    message dit quelle colonne ou quel droit manque.
select count(*)                                   as presences,
       count(*) filter (where status = 'absent')  as absences,
       max("timestamp")                           as dernier_pointage
from public.attendance_records;

-- 2. LE SOLDE DE CHAQUE EMPLOI DU TEMPS EST-IL COHÉRENT ?
--    solde attendu = tout ce qui a été versé sur l'emploi
--                  − ce que les séances facturées ont débité.
--    Une base saine ne rend AUCUNE ligne.
with versements as (
  select student_id, subscription_id, sum(amount_paid) as verse
  from public.payments
  where subscription_id is not null
  group by student_id, subscription_id
), seances as (
  select a.student_id, s.id as subscription_id, sum(a.amount_deducted) as debite
  from public.attendance_records a
  join public.subscriptions s on s.session_id = a.session_id
  where a.status <> 'cancelled' and coalesce(a.no_charge, false) = false
  group by a.student_id, s.id
)
select st.registration_number                                        as numero,
       st.first_name || ' ' || st.last_name                          as chevalier,
       e.subscription_id,
       coalesce(e.balance, 0)                                        as solde_en_base,
       coalesce(v.verse, 0) - coalesce(se.debite, 0)                 as solde_attendu,
       coalesce(e.balance, 0) - (coalesce(v.verse, 0) - coalesce(se.debite, 0)) as ecart
from public.enrollments e
join public.students st on st.id = e.student_id
left join versements v on v.student_id = e.student_id and v.subscription_id = e.subscription_id
left join seances  se on se.student_id = e.student_id and se.subscription_id = e.subscription_id
where abs(coalesce(e.balance, 0) - (coalesce(v.verse, 0) - coalesce(se.debite, 0))) > 0.01
order by st.registration_number;

-- 3. UN CHEVALIER EN DÉTAIL (remplacez le numéro) : versé, débité, solde.
select st.registration_number as numero,
       st.first_name || ' ' || st.last_name as chevalier,
       e.subscription_id,
       e.balance                as solde,
       e.consumed_seances       as seances_consommees,
       (select coalesce(sum(p.amount_paid), 0) from public.payments p
         where p.student_id = st.id and p.subscription_id = e.subscription_id) as verse
from public.students st
join public.enrollments e on e.student_id = st.id
where st.registration_number = '00064';

-- 4. LES ANCIENNES ABSENCES « OFFERTES » (avant ce changement). Elles n'ont
--    rien débité. Pour les facturer : feuille de présence -> le jour concerné
--    -> « Absent » sur la ligne du chevalier.
select st.registration_number as numero,
       st.first_name || ' ' || st.last_name as chevalier,
       a.session_id, a."timestamp"
from public.attendance_records a
join public.students st on st.id = a.student_id
where a.status = 'absent' and coalesce(a.no_charge, false) = true
order by a."timestamp";

-- =============================================================================
--  RÉPARATION FACULTATIVE — NE LANCEZ CECI QUE SI LA VÉRIFICATION 2 RENVOIE DES
--  LIGNES, et après avoir téléchargé une sauvegarde (Paramètres -> Sauvegarde).
--  Elle réaligne le solde en base sur « versé − débité », pour ces lignes-là
--  seulement. Retirez les deux tirets en tête de chaque ligne pour l'activer.
-- =============================================================================
-- with versements as (
--   select student_id, subscription_id, sum(amount_paid) as verse
--   from public.payments where subscription_id is not null
--   group by student_id, subscription_id
-- ), seances as (
--   select a.student_id, s.id as subscription_id, sum(a.amount_deducted) as debite
--   from public.attendance_records a
--   join public.subscriptions s on s.session_id = a.session_id
--   where a.status <> 'cancelled' and coalesce(a.no_charge, false) = false
--   group by a.student_id, s.id
-- )
-- update public.enrollments e
--    set balance = round((coalesce(v.verse, 0) - coalesce(se.debite, 0))::numeric, 2)
--   from public.enrollments e2
--   left join versements v on v.student_id = e2.student_id and v.subscription_id = e2.subscription_id
--   left join seances  se on se.student_id = e2.student_id and se.subscription_id = e2.subscription_id
--  where e.id = e2.id
--    and abs(coalesce(e2.balance, 0) - (coalesce(v.verse, 0) - coalesce(se.debite, 0))) > 0.01;
