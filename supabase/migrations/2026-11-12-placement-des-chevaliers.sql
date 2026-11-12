-- =============================================================================
--  LE PLACEMENT D'UN NOUVEAU CHEVALIER — carte et séance de départ
-- =============================================================================
--
--  AUCUNE NOUVELLE TABLE NI COLONNE N'EST NÉCESSAIRE.
--
--  Le placement est écrit dans la colonne JSONB EXISTANTE
--  `students.subscription_dates`, sous la clé de chaque emploi du temps :
--
--    "placementCarteCode": "M1",          -- la carte du groupe choisie
--    "placementSeance":    2,             -- la séance de cette carte (0-based)
--    "placementDate":      "2026-10-12",  -- le jour de cette séance
--    "placementSlot":      1,             -- la séance du jour (absent = 0)
--    "placementSeances":   [ { "date": "2026-10-12", "carteCode": "M1",
--                              "seanceIndex": 2 }, ... ]
--
--  Les séances « à régulariser » se DÉDUISENT de cette liste et des présences
--  du chevalier : rien d'autre n'est stocké.
--
--  Ce script est idempotent : il ne fait que garantir que la colonne existe
--  (elle existe déjà sur toute base installée avec supabase/schema.sql).
-- =============================================================================

alter table public.students
  add column if not exists subscription_dates jsonb;

-- Lecture (optionnelle) : les chevaliers placés sur une séance passée.
-- select s.id, s.first_name, s.last_name, d.key as subscription_id,
--        d.value->>'placementCarteCode' as carte,
--        (d.value->>'placementSeance')::int + 1 as seance,
--        d.value->>'placementDate' as depuis
--   from public.students s
--   cross join lateral jsonb_each(coalesce(s.subscription_dates, '{}'::jsonb)) d
--  where d.value ? 'placementDate';
