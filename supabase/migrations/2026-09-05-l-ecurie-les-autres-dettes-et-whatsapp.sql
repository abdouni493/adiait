-- =============================================================================
--  L'ÉCURIE, LES AUTRES DETTES, LA CAISSE SECONDAIRE ET LA PASSERELLE WHATSAPP
--  MISE À JOUR D'UNE BASE DÉJÀ INSTALLÉE
-- =============================================================================
--
--  À exécuter UNE fois, dans : Supabase Dashboard -> SQL Editor -> New query.
--
--  Ce script est IDEMPOTENT : le relancer ne casse rien et ne double rien.
--  Il n'efface AUCUNE donnée métier — il AJOUTE dix tables, une colonne, cinq
--  valeurs autorisées de plus sur une contrainte, et cinq écrans au catalogue
--  des droits.
--
-- -----------------------------------------------------------------------------
--  CE QU'IL FAIT, ET POURQUOI
--
--   1. L'ÉCURIE — les chevaux, ce qu'ils coûtent, ce qu'ils rapportent.
--
--      Le club achète des chevaux, les entretient, en héberge d'autres pour le
--      compte de chevaliers ou de parents, et en revend. Rien de tout cela
--      n'avait d'endroit où vivre : les achats finissaient en « dépense
--      divers », les frais de vétérinaire d'un cheval en pension n'étaient
--      refacturés nulle part, et une vente à crédit se notait sur un papier.
--
--      LA RÈGLE QUI GOUVERNE TOUT LE RESTE EST LE PROPRIÉTAIRE :
--
--        • CHEVAL DU CLUB (`owner_kind = 'club'`) — ses dépenses SORTENT DE LA
--          CAISSE. Il n'a personne à facturer, donc pas de dette.
--        • CHEVAL EN PENSION — ses dépenses deviennent une DETTE de son
--          propriétaire (`horse_expenses.owner_debt = true`), et la caisse ne
--          bouge qu'au moment où il règle (`horse_owner_payments`).
--
--      Le rattachement à une FICHE du club (`owner_student_id`,
--      `owner_parent_id`) n'est pas décoratif : c'est lui, et lui seul, qui fait
--      remonter la dette sur le compte de l'intéressé — dans son espace, à côté
--      de ce qu'il doit pour ses cotisations. Un nom saisi à la main reste une
--      chaîne que rien ne relie à personne.
--
--      TOUT EST FACULTATIF SAUF LE NOM. Une écurie ne connaît pas la robe, la
--      taille, le pedigree et le carnet de vaccination de chaque cheval le jour
--      où il arrive. Exiger vingt champs ferait saisir vingt approximations, et
--      une approximation dans un carnet de vaccination est pire qu'une case
--      vide.
--
--   2. LES AUTRES DETTES — ce que l'on doit au club sans que ce soit une
--      cotisation : un fournisseur avancé, une casse à rembourser, du matériel
--      prêté non rendu. Ces sommes n'appartiennent à aucun emploi du temps et
--      n'ont leur place ni sur une carte, ni sur un frais de chevalier. Faute
--      d'un endroit à elles, elles finissaient au fond d'un tiroir.
--
--   3. LA CAISSE SECONDAIRE — `cash_transactions.caisse`.
--
--      Le club tient désormais deux postes de saisie : la caisse GÉNÉRALE, qui
--      voit tout, et une caisse SECONDAIRE — celle des travailleurs — qui ne
--      voit que ce qu'elle a elle-même saisi.
--
--      ⚠️ L'ARGENT, LUI, N'EST PAS SÉPARÉ : les deux alimentent la même
--      trésorerie, et la caisse générale affiche tous les mouvements en
--      indiquant lequel vient d'où. Deux caisses réellement distinctes auraient
--      demandé deux soldes, deux rapprochements et deux vérités — ce qui n'est
--      pas ce qu'on veut d'un poste de travail secondaire.
--
--      La colonne est NULLABLE, et c'est délibéré : `null` vaut « caisse
--      générale », ce qui est le cas de TOUT l'historique antérieur. Une valeur
--      par défaut écrite en base aurait réécrit des milliers de lignes pour
--      affirmer quelque chose que leur absence disait déjà.
--
--   4. LA PASSERELLE WHATSAPP — `whatsapp_messages` et `whatsapp_outbox`.
--
--      DEUX TABLES, ET ELLES NE SE CONFONDENT PAS :
--
--        • `whatsapp_messages` — LE JOURNAL : ce qui a été confié à la
--          passerelle, avec le TEXTE réellement envoyé et l'avancement de la
--          remise (`queued → sent → delivered → read → failed`). Sans lui, on ne
--          peut pas relire six mois plus tard ce qu'une famille a reçu.
--        • `whatsapp_outbox` — LA FILE : ce qui n'a PAS pu partir, avec son
--          texte, ses tentatives et sa dernière erreur.
--
--      LA FILE N'EST PAS UN RAFFINEMENT. La passerelle vit sur un poste de
--      l'écurie, et ce poste sera éteint un jour ou l'autre : sans elle, chaque
--      message émis pendant ce temps est PUREMENT PERDU, et un rappel
--      automatique ne laisse rien derrière lui — personne ne revient l'envoyer
--      à la main.
--
--      LES DEUX PARTAGENT LE MÊME IDENTIFIANT : un message rattrapé depuis la
--      file se retrouve dans le journal AU MÊME ENDROIT, jamais en double.
--
--      L'index `(status, created_at)` sur la file n'est pas cosmétique : le
--      vidage lit TOUJOURS « les plus anciens en attente d'abord ».
--
--   5. LES CINQ NOUVEAUX ÉCRANS au catalogue des droits, et deux boutons de
--      plus sur « Semestres » — dont « Voir l'argent encaissé », qui décide si
--      un travailleur lit les totaux du club ou seulement les dettes à relancer.
--
--  SI VOUS PARTEZ D'UNE BASE NEUVE, exécutez d'abord `supabase/schema.sql`,
--  puis ce fichier.
-- =============================================================================

begin;

-- =============================================================================
--  1. L'ÉCURIE
-- =============================================================================

-- ---- 1.1 Les chevaux --------------------------------------------------------

create table if not exists public.horses (
  id                   text primary key,
  -- LE SEUL CHAMP OBLIGATOIRE. Tout le reste se complète au fil du temps.
  name                 text not null default '',
  reference            text,
  breed                text,
  gender               text check (gender is null or gender in ('stallion','mare','gelding')),
  birth_date           text,
  -- L'âge saisi tel quel, quand la date de naissance est inconnue — ce qui est
  -- le cas le plus fréquent sur un cheval acheté sans papiers.
  age                  text,
  color                text,
  height               text,
  weight               text,

  -- La santé.
  vaccination          text,
  medical_history      text,
  vet_exam             text,

  -- Le travail.
  discipline           text,
  training_level       text,
  competition_history  text,
  awards               text,

  -- Les origines.
  sire                 text,
  dam                  text,
  pedigree_docs        text,

  -- L'achat. `purchase_price` sort de la caisse le jour indiqué ; le modifier
  -- AJUSTE ce mouvement au lieu d'en créer un second (voir `saveHorse`).
  purchase_price       numeric,
  seller_name          text,
  seller_phone         text,
  seller_note          text,
  purchase_date        text,

  -- La vente. `selling_price` est une INTENTION — le prix affiché tant que
  -- personne n'a acheté. La vente réelle porte son propre montant.
  selling_price        numeric,

  status               text not null default 'available'
                       check (status in ('available','sold')),
  -- D'où la fiche vient : de l'écran « Achat & vente », ou créée directement à
  -- l'écurie sans achat (un cheval né sur place, une mise en pension).
  origin               text not null default 'stable'
                       check (origin in ('purchase','stable')),

  -- LE PROPRIÉTAIRE — c'est lui qui décide où va l'argent des dépenses.
  owner_kind           text not null default 'club'
                       check (owner_kind in ('club','student','parent','external')),
  -- `on delete set null` : supprimer une fiche de chevalier ne doit jamais
  -- faire disparaître un cheval. Il devient simplement « propriétaire inconnu »,
  -- ce qui se corrige, là où une suppression en cascade ne se répare pas.
  owner_student_id     text references public.students (id) on delete set null,
  owner_parent_id      text references public.parents  (id) on delete set null,
  owner_name           text,
  owner_phone          text,
  owner_note           text,

  created_at           text,
  created_by           text,
  created_by_name      text,
  created_by_role      text
);

comment on table public.horses is
  'Les chevaux du club et ceux qu''il héberge. Le propriétaire décide de tout : cheval du club = dépenses sur la caisse ; cheval en pension = dépenses portées au compte du propriétaire.';

create index if not exists horses_status_idx  on public.horses (status);
create index if not exists horses_owner_idx   on public.horses (owner_kind);
create index if not exists horses_student_idx on public.horses (owner_student_id);
create index if not exists horses_parent_idx  on public.horses (owner_parent_id);

-- ---- 1.2 Les ventes ---------------------------------------------------------

create table if not exists public.horse_sales (
  id                text primary key,
  horse_id          text references public.horses (id) on delete cascade,
  -- Le nom du cheval, RECOPIÉ : une fiche supprimée ne doit pas effacer l'objet
  -- d'une vente encaissée. Un bon de vente sans nom de cheval ne prouve rien.
  horse_name        text not null default '',

  buyer_kind        text not null default 'external'
                    check (buyer_kind in ('student','parent','external')),
  buyer_student_id  text references public.students (id) on delete set null,
  buyer_parent_id   text references public.parents  (id) on delete set null,
  buyer_name        text not null default '',
  buyer_phone       text,
  buyer_note        text,

  date              text not null default '',
  -- Le prix de départ, avant remise.
  base_price        numeric not null default 0,
  discount_type     text check (discount_type is null or discount_type in ('percent','amount')),
  discount_value    numeric,
  -- Le net à payer, remise déduite.
  total             numeric not null default 0,
  -- Ce qui a été versé le jour de la vente. Les versements ULTÉRIEURS vivent
  -- dans `horse_sale_payments` et remontent ici en s'y ajoutant.
  paid              numeric not null default 0,
  rest              numeric not null default 0,
  status            text not null default 'completed'
                    check (status in ('completed','debt')),
  -- Le mouvement de caisse de l'encaissement initial.
  cash_id           text references public.cash_transactions (id) on delete set null,
  description       text,
  created_at        text,
  created_by        text,
  created_by_name   text,
  created_by_role   text
);

comment on table public.horse_sales is
  'La vente d''un cheval. Une vente dont `rest` est positif est une vente À CRÉDIT : l''écran principal la signale tant qu''elle n''est pas soldée.';

create index if not exists horse_sales_horse_idx   on public.horse_sales (horse_id);
create index if not exists horse_sales_student_idx on public.horse_sales (buyer_student_id);
create index if not exists horse_sales_parent_idx  on public.horse_sales (buyer_parent_id);
create index if not exists horse_sales_rest_idx    on public.horse_sales (rest);

create table if not exists public.horse_sale_payments (
  id               text primary key,
  sale_id          text references public.horse_sales (id) on delete cascade,
  amount           numeric not null default 0,
  date             text not null default '',
  description      text,
  cash_id          text references public.cash_transactions (id) on delete set null,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

create index if not exists horse_sale_payments_sale_idx on public.horse_sale_payments (sale_id);

-- ---- 1.3 Les dépenses -------------------------------------------------------

create table if not exists public.horse_expense_categories (
  id               text primary key,
  name             text not null default '',
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

comment on table public.horse_expense_categories is
  'Les rubriques de dépense de l''écurie : vétérinaire, fourrage, maréchal-ferrant… Elles se créent depuis le formulaire de dépense lui-même.';

create table if not exists public.horse_expenses (
  id               text primary key,
  horse_id         text references public.horses (id) on delete cascade,
  -- `on delete set null` : supprimer une rubrique ne doit pas rendre illisible
  -- un historique de dépenses vieux de deux ans.
  category_id      text references public.horse_expense_categories (id) on delete set null,
  -- Le nom de la rubrique, RECOPIÉ, pour la même raison.
  category_name    text,
  amount           numeric not null default 0,
  date             text not null default '',
  description      text,
  -- `true`  = portée au compte du propriétaire (cheval en pension) ;
  -- `false` = sortie de caisse (cheval du club). Ce n'est pas un réglage : la
  -- valeur est déduite du propriétaire au moment de la saisie.
  owner_debt       boolean not null default false,
  cash_id          text references public.cash_transactions (id) on delete set null,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

create index if not exists horse_expenses_horse_idx on public.horse_expenses (horse_id);
create index if not exists horse_expenses_date_idx  on public.horse_expenses (date);
create index if not exists horse_expenses_owner_idx on public.horse_expenses (owner_debt);

create table if not exists public.horse_owner_payments (
  id               text primary key,
  horse_id         text references public.horses (id) on delete cascade,
  amount           numeric not null default 0,
  date             text not null default '',
  description      text,
  cash_id          text references public.cash_transactions (id) on delete set null,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

comment on table public.horse_owner_payments is
  'Ce qu''un propriétaire de cheval en pension a versé sur les dépenses de son cheval. Sa dette vaut : somme des dépenses `owner_debt` moins somme de ces versements.';

create index if not exists horse_owner_payments_horse_idx on public.horse_owner_payments (horse_id);
create index if not exists horse_owner_payments_date_idx  on public.horse_owner_payments (date);

-- =============================================================================
--  2. LES AUTRES DETTES
-- =============================================================================

create table if not exists public.other_debts (
  id               text primary key,
  -- Le rattachement à une fiche du club, quand il y en a une : c'est lui qui
  -- fait remonter la dette sur le compte de l'intéressé.
  student_id       text references public.students (id) on delete set null,
  parent_id        text references public.parents  (id) on delete set null,
  person_name      text not null default '',
  phone            text,
  note             text,
  amount           numeric not null default 0,
  description      text,
  date             text not null default '',
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

comment on table public.other_debts is
  'Ce que l''on doit au club en dehors des cotisations : un fournisseur avancé, une casse à rembourser, du matériel prêté non rendu.';

create index if not exists other_debts_student_idx on public.other_debts (student_id);
create index if not exists other_debts_parent_idx  on public.other_debts (parent_id);
create index if not exists other_debts_date_idx    on public.other_debts (date);

create table if not exists public.other_debt_payments (
  id               text primary key,
  debt_id          text references public.other_debts (id) on delete cascade,
  amount           numeric not null default 0,
  date             text not null default '',
  description      text,
  cash_id          text references public.cash_transactions (id) on delete set null,
  created_at       text,
  created_by       text,
  created_by_name  text,
  created_by_role  text
);

create index if not exists other_debt_payments_debt_idx on public.other_debt_payments (debt_id);

-- =============================================================================
--  3. LA CAISSE : LA CAISSE D'ORIGINE, ET CINQ TYPES DE MOUVEMENT DE PLUS
-- =============================================================================

-- La caisse qui a saisi le mouvement. NULLABLE : `null` vaut « générale », ce
-- qui est le cas de tout l'historique antérieur — et le dire ainsi évite de
-- réécrire des milliers de lignes pour affirmer ce que leur absence disait déjà.
alter table public.cash_transactions
  add column if not exists caisse text
  check (caisse is null or caisse in ('general','secondary'));

comment on column public.cash_transactions.caisse is
  'La caisse de saisie. NULL = générale (tout l''historique antérieur). L''argent n''est PAS séparé : les deux alimentent la même trésorerie, seul l''écran filtre.';

create index if not exists cash_transactions_caisse_idx on public.cash_transactions (caisse);

-- Les cinq nouveaux types. On repose la contrainte plutôt que de l'altérer :
-- c'est la seule façon de rendre le script rejouable sans se soucier de ce
-- qu'elle contenait avant.
alter table public.cash_transactions drop constraint if exists cash_transactions_type_check;
alter table public.cash_transactions
  add constraint cash_transactions_type_check
  check (type in (
    'deposit','withdraw','expense','student_payment',
    'teacher_payment','acompte','student_debt',
    -- L'écurie : l'achat sort, la vente et ses versements entrent, l'entretien
    -- d'un cheval DU CLUB sort, le règlement d'un pensionnaire entre.
    'horse_purchase','horse_sale','horse_expense','horse_owner_payment',
    -- Le règlement d'une « autre dette ».
    'other_debt_payment'
  ));

-- =============================================================================
--  4. LA PASSERELLE WHATSAPP — le journal et la file
-- =============================================================================

create table if not exists public.whatsapp_messages (
  id               text primary key,
  recipient_name   text not null default '',
  -- Le numéro tel qu'il a été normalisé pour l'affichage (+213 555 123 456).
  recipient_phone  text not null default '',
  -- LE TEXTE RÉELLEMENT ENVOYÉ. Sans lui, on ne peut pas relire six mois plus
  -- tard ce qu'une famille a reçu — et c'est le jour d'un litige qu'on le
  -- découvre.
  body             text not null default '',
  status           text not null default 'queued'
                   check (status in ('queued','sent','delivered','read','failed')),
  -- L'identifiant du message côté passerelle, sur lequel le webhook fait
  -- avancer le statut.
  gateway_id       text,
  student_id       text references public.students (id) on delete set null,
  parent_id        text references public.parents  (id) on delete set null,
  -- D'où le message est parti : « semesters », « students », « scan »…
  origin           text,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);

comment on table public.whatsapp_messages is
  'Le JOURNAL des messages WhatsApp : destinataire, texte réellement envoyé, avancement de la remise. Écrit par le serveur avec la clé de service — le webhook n''a aucune session utilisateur.';

create index if not exists whatsapp_messages_gateway_idx on public.whatsapp_messages (gateway_id);
create index if not exists whatsapp_messages_created_idx on public.whatsapp_messages (created_at desc);
create index if not exists whatsapp_messages_student_idx on public.whatsapp_messages (student_id);

create table if not exists public.whatsapp_outbox (
  id               text primary key,
  recipient_name   text not null default '',
  -- Ici le MSISDN brut attendu par la passerelle (213555123456), et non le
  -- rendu lisible : c'est cette valeur-là que la reprise renvoie telle quelle.
  recipient_phone  text not null default '',
  -- LE TEXTE PART AVEC LE MESSAGE. Sans lui, la reprise devrait le recomposer,
  -- et une situation vieille d'un jour ne compose plus le même message.
  body             text not null default '',
  status           text not null default 'pending'
                   check (status in ('pending','abandoned')),
  attempts         integer not null default 0,
  last_error       text,
  student_id       text references public.students (id) on delete set null,
  parent_id        text references public.parents  (id) on delete set null,
  origin           text,
  created_at       timestamptz not null default now()
);

comment on table public.whatsapp_outbox is
  'La FILE : ce qui n''a pas pu partir, avec son texte. Même identifiant que le journal — un message rattrapé s''y retrouve au même endroit, jamais en double.';

-- LE VIDAGE LIT TOUJOURS « LES PLUS ANCIENS EN ATTENTE D'ABORD » : cet index
-- n'est pas cosmétique, c'est exactement la requête du rattrapage.
create index if not exists whatsapp_outbox_pending_idx
  on public.whatsapp_outbox (status, created_at);

-- =============================================================================
--  5. LES DROITS DE LECTURE ET D'ÉCRITURE
-- =============================================================================
--
--  CE QUE LA RLS N'EST PAS : le filtre des BOUTONS. Un bouton caché l'est par
--  `lib/permissions.ts`, écran par écran. La RLS est le filet en dessous : même
--  en forgeant un appel à la main, un travailleur n'écrit pas dans une table
--  dont aucun de ses écrans ne dépend.
--
--  LA LECTURE DES FAMILLES est le point délicat. Un parent doit voir SON cheval
--  et SA dette dans son espace — c'est toute la raison du rattachement à une
--  fiche. Il ne doit voir que les siens.

do $$
declare
  r record;
  staff_read constant text := 'public.is_staff()';
begin
  for r in
    select * from (values
      -- table                          lecture                                                      écriture
      ('horses',
        $r$public.is_staff()
           or owner_student_id = any (public.my_student_ids())
           or (public.is_parent() and owner_parent_id = public.my_entity_id())$r$,
        $w$public.can_write(array['horses','stable'])$w$),

      ('horse_sales',
        $r$public.is_staff()
           or buyer_student_id = any (public.my_student_ids())
           or (public.is_parent() and buyer_parent_id = public.my_entity_id())$r$,
        $w$public.can_write(array['horses'])$w$),

      ('horse_sale_payments',
        $r$public.is_staff()
           or exists (
                select 1 from public.horse_sales s
                 where s.id = horse_sale_payments.sale_id
                   and (s.buyer_student_id = any (public.my_student_ids())
                        or (public.is_parent() and s.buyer_parent_id = public.my_entity_id())))$r$,
        $w$public.can_write(array['horses'])$w$),

      -- Les rubriques sont un simple vocabulaire : tout compte connecté les lit,
      -- sans quoi l'historique d'un propriétaire afficherait des rubriques vides.
      ('horse_expense_categories',   'auth.uid() is not null',
        $w$public.can_write(array['stable','horses'])$w$),

      ('horse_expenses',
        $r$public.is_staff()
           or exists (
                select 1 from public.horses h
                 where h.id = horse_expenses.horse_id
                   and (h.owner_student_id = any (public.my_student_ids())
                        or (public.is_parent() and h.owner_parent_id = public.my_entity_id())))$r$,
        $w$public.can_write(array['stable','horses'])$w$),

      ('horse_owner_payments',
        $r$public.is_staff()
           or exists (
                select 1 from public.horses h
                 where h.id = horse_owner_payments.horse_id
                   and (h.owner_student_id = any (public.my_student_ids())
                        or (public.is_parent() and h.owner_parent_id = public.my_entity_id())))$r$,
        $w$public.can_write(array['stable','horses'])$w$),

      ('other_debts',
        $r$public.is_staff()
           or student_id = any (public.my_student_ids())
           or (public.is_parent() and parent_id = public.my_entity_id())$r$,
        $w$public.can_write(array['other-debts'])$w$),

      ('other_debt_payments',
        $r$public.is_staff()
           or exists (
                select 1 from public.other_debts d
                 where d.id = other_debt_payments.debt_id
                   and (d.student_id = any (public.my_student_ids())
                        or (public.is_parent() and d.parent_id = public.my_entity_id())))$r$,
        $w$public.can_write(array['other-debts'])$w$),

      -- LE JOURNAL WHATSAPP ne sort jamais vers les portails des familles : il
      -- porte le texte envoyé à TOUT LE MONDE. Il est ÉCRIT par le serveur avec
      -- la clé de service, qui contourne la RLS — la politique d'écriture ne
      -- concerne donc que le comptoir, qui n'en a pas besoin mais dont on ne
      -- veut pas qu'il soit bloqué s'il relit une ligne.
      ('whatsapp_messages',          staff_read,
        $w$public.can_write(array['students','parents','semesters','settings'])$w$),
      ('whatsapp_outbox',            staff_read,
        $w$public.can_write(array['students','parents','semesters','settings'])$w$)
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

-- LA CAISSE EST ALIMENTÉE PAR LES NOUVEAUX ÉCRANS AUSSI. Sans cela, un achat de
-- cheval ou un règlement d'autre dette serait refusé au moment d'écrire son
-- mouvement — et l'écran afficherait la ligne sans qu'elle existe en base.
drop policy if exists cash_transactions_write on public.cash_transactions;
create policy cash_transactions_write on public.cash_transactions
  for all to authenticated
  using (public.can_write(array[
    'cash','cash-secondary','dashboard','students','teachers','workers',
    'expenses','independent','attendance','horses','stable','other-debts'
  ]))
  with check (public.can_write(array[
    'cash','cash-secondary','dashboard','students','teachers','workers',
    'expenses','independent','attendance','horses','stable','other-debts'
  ]));

-- =============================================================================
--  6. LE CATALOGUE DES DROITS — cinq écrans de plus, et deux boutons
-- =============================================================================
--
--  Les positions sont TOUTES réécrites, dans l'ordre exact de la barre latérale.
--  Les repousser une à une d'un cran laisserait le catalogue dépendre de ce
--  qu'il contenait avant, et une base rejouée deux fois finirait décalée.

insert into public.app_pages (key, position, emoji, label, href, hint) values
  ('dashboard',            1,  '📊', 'Tableau de bord',       '/dashboard',            'Les emplois du temps du jour, les feuilles de présence et la caisse.'),
  ('semesters',            2,  '🗓️', 'Semestres',             '/semesters',            'Les saisons du club : leurs catégories, leurs emplois du temps, leurs cartes et leur argent.'),
  ('classes',              3,  '🛡️', 'Catégories',            '/classes',              'Les catégories de l''Ordre et la tranche d''âge de chacune.'),
  ('planner',              4,  '📅', 'Emplois du temps',      '/planner',              'La grille des créneaux, les séances libres et les arènes.'),
  ('students',             5,  '⚔️', 'Chevaliers',            '/students',             'Les fiches des chevaliers, leurs inscriptions, leurs paiements et leurs dettes.'),
  ('attendance',           6,  '✅', 'Présences',             '/attendance',           'Les feuilles de présence et l''historique des pointages.'),
  ('teachers',             7,  '🏅', 'Entraîneurs',           '/teachers',             'Les fiches des entraîneurs, leurs parts et leur paie.'),
  ('workers',              8,  '💼', 'Personnel',             '/workers',              'Le personnel : métiers, comptes, droits, acomptes, absences et paie.'),
  ('independent',          9,  '🚩', 'Séances libres',        '/independent',          'Les séances vendues à l''unité et les sorties libres de groupe.'),
  ('parents',              10, '👨‍👩‍👧', 'Parents',           '/parents',              'Les fiches des parents et leurs comptes.'),
  ('horses',               11, '🐎', 'Achat & vente des chevaux', '/horses',           'Ce que le club achète, ce qu''il revend, et les ventes à crédit qui restent dues.'),
  ('stable',               12, '🏇', 'L''écurie',             '/stable',               'Les chevaux présents — ceux du club et ceux en pension — leur suivi et leurs dépenses.'),
  ('stable-reports',       13, '📋', 'Gestion de l''écurie',   '/stable-reports',       'Le bilan des dépenses et des règlements sur une période, propriétaire par propriétaire.'),
  ('announcements',        14, '📢', 'Annonces',              '/announcements',        'Les annonces publiées aux chevaliers et aux parents.'),
  ('other-debts',          15, '🧮', 'Autres dettes',         '/other-debts',          'Ce que l''on doit au club en dehors des cotisations : un fournisseur avancé, une casse à rembourser, du matériel non rendu.'),
  ('expenses',             16, '🧾', 'Dépenses',              '/expenses',             'Les dépenses du club et leurs catégories.'),
  ('analytics',            17, '📈', 'Statistiques',          '/analytics',            'L''affluence des chevaliers par catégorie et par entraîneur.'),
  ('cash-secondary',       18, '🪙', 'Caisse secondaire',     '/cash-secondary',       'La caisse des travailleurs : elle n''affiche QUE ses propres mouvements. L''argent, lui, rejoint la même trésorerie.'),
  ('cash',                 19, '💵', 'Caisse',                '/cash',                 'Les mouvements de caisse : dépôts, retraits, dépenses — et leurs rubriques.'),
  ('reports',              20, '💰', 'Rapports',              '/reports',              'Le bilan du club sur une période. Cet écran se consulte ; il n''écrit rien.'),
  ('website',              21, '🌐', 'Site web',              '/website',              'La vitrine du club : les formations et les évènements publiés, les coordonnées et l''habillage de la page d''accueil.'),
  ('website-inscriptions', 22, '📥', 'Inscriptions du site',  '/website-inscriptions', 'Les inscriptions venues du site public, en attente d''être vérifiées et rattachées à une fiche.'),
  ('settings',             23, '⚙️', 'Paramètres',            '/settings',             'Le club, la sécurité, WhatsApp et les sauvegardes.')
on conflict (key) do update set
  position = excluded.position,
  emoji    = excluded.emoji,
  label    = excluded.label,
  href     = excluded.href,
  hint     = excluded.hint;

insert into public.app_page_actions (page_key, action_id, position, label, hint) values
  -- « Semestres » gagne deux boutons.
  ('semesters', 'totals',   7, 'Voir l''argent encaissé',
    'SANS ce droit, les cartes de semestre, de catégorie et d''emploi du temps n''affichent QUE les dettes. Le détail chevalier par chevalier, lui, reste lisible dans la liste d''un emploi du temps.'),
  ('semesters', 'whatsapp', 8, 'Envoyer un message WhatsApp',
    'Depuis la liste des chevaliers d''un emploi du temps : relance individuelle ou envoi groupé aux endettés.'),

  -- Achat & vente des chevaux.
  ('horses', 'create', 1, 'Enregistrer un achat', 'Le prix d''achat sort de la caisse.'),
  ('horses', 'view',   2, 'Voir le détail d''un cheval', null),
  ('horses', 'edit',   3, 'Modifier une fiche de cheval', null),
  ('horses', 'delete', 4, 'Supprimer un cheval', null),
  ('horses', 'sell',   5, 'Vendre un cheval', 'Au comptant ou à crédit, avec remise.'),
  ('horses', 'pay',    6, 'Encaisser une vente à crédit', null),
  ('horses', 'print',  7, 'Imprimer un bon de vente ou un reçu', null),

  -- L'écurie.
  ('stable', 'create',  1, 'Ajouter un cheval sans achat', null),
  ('stable', 'view',    2, 'Voir le détail et le suivi d''un cheval', null),
  ('stable', 'edit',    3, 'Modifier une fiche de cheval', null),
  ('stable', 'delete',  4, 'Supprimer un cheval', null),
  ('stable', 'expense', 5, 'Porter une dépense sur un cheval',
    'Cheval du club : sortie de caisse. Cheval en pension : dette du propriétaire.'),
  ('stable', 'pay',     6, 'Encaisser un propriétaire', null),
  ('stable', 'print',   7, 'Imprimer un relevé ou un reçu', null),

  -- Gestion de l'écurie.
  ('stable-reports', 'print', 1, 'Imprimer le rapport', null),

  -- Autres dettes.
  ('other-debts', 'create', 1, 'Créer une dette', null),
  ('other-debts', 'view',   2, 'Voir le détail et l''historique', null),
  ('other-debts', 'edit',   3, 'Modifier une dette', null),
  ('other-debts', 'delete', 4, 'Supprimer une dette', null),
  ('other-debts', 'pay',    5, 'Encaisser un règlement', null),
  ('other-debts', 'print',  6, 'Imprimer un relevé ou un reçu', null),

  -- Caisse secondaire.
  ('cash-secondary', 'deposit',  1, 'Dépôt en caisse secondaire', null),
  ('cash-secondary', 'withdraw', 2, 'Retrait de la caisse secondaire', null),
  ('cash-secondary', 'edit',     3, 'Modifier un mouvement', null),
  ('cash-secondary', 'delete',   4, 'Supprimer un mouvement', null)
on conflict (page_key, action_id) do update set
  position = excluded.position,
  label    = excluded.label,
  hint     = excluded.hint;

commit;

-- =============================================================================
--  7. LE TEMPS RÉEL — les statuts de remise avancent sans recharger la page
-- =============================================================================
--
--  Hors transaction : l'ajout à une publication échoue si la table y est déjà,
--  et cet échec ne doit pas annuler tout ce qui précède. Chaque instruction est
--  donc protégée par son propre bloc.

do $$
begin
  alter publication supabase_realtime add table public.whatsapp_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- =============================================================================
--  VÉRIFICATION — ce que la base doit répondre une fois le script passé
-- =============================================================================
--
--    select
--      (select count(*) from public.horses)                as chevaux,
--      (select count(*) from public.horse_sales)           as ventes,
--      (select count(*) from public.horse_expenses)        as depenses_ecurie,
--      (select count(*) from public.other_debts)           as autres_dettes,
--      (select count(*) from public.whatsapp_messages)     as messages,
--      (select count(*) from public.whatsapp_outbox)       as file_attente,
--      (select count(*) from public.app_pages)             as ecrans;
--
--  Tous les compteurs métier valent 0 sur une base qui vient d'être mise à
--  jour : c'est normal, et c'est la preuve que rien n'a été inventé. `ecrans`
--  doit valoir 23.
--
--  La colonne de caisse :
--
--    select caisse, count(*) from public.cash_transactions group by caisse;
--
--  Tout l'historique répond `null` — c'est-à-dire « caisse générale ».
--
--  Le journal WhatsApp, une fois quelques messages partis :
--
--    select created_at, recipient_name, recipient_phone, status, left(body, 60)
--      from public.whatsapp_messages order by created_at desc limit 20;
--
--    select created_at, recipient_phone, attempts, last_error
--      from public.whatsapp_outbox where status = 'pending' order by created_at;
-- =============================================================================
