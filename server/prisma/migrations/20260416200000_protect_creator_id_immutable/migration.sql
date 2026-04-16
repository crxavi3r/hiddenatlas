-- ── Protect creatorId immutability on Itinerary ──────────────────────────────
--
-- Business rule: creatorId is set ONCE at creation and must never change.
--
-- This migration installs a BEFORE UPDATE trigger that silently restores the
-- original creatorId if an UPDATE attempts to modify or clear it.
-- A WARNING is emitted to the Postgres log for observability.
--
-- The trigger is intentionally non-blocking (RAISE WARNING + restore, not
-- RAISE EXCEPTION) so that a misconfigured caller doesn't break saves —
-- the column is simply preserved and a warning is logged.
--
-- Column name detection: handles both 'creatorId' (camelCase, created by
-- Prisma migrations) and 'creator_id' (snake_case) in case the migration was
-- applied with a different naming convention.
--
-- Safe to re-run (CREATE OR REPLACE + DROP IF EXISTS).

DO $$
DECLARE
  v_col TEXT;
BEGIN
  -- Detect the actual column name used in this deployment.
  -- Normalise by lowercasing and removing underscores so both
  -- 'creatorId' and 'creator_id' resolve to 'creatorid'.
  SELECT column_name INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'Itinerary'
    AND lower(replace(column_name, '_', '')) = 'creatorid'
  LIMIT 1;

  IF v_col IS NULL THEN
    RAISE NOTICE '[creator-guard] creatorId column not found on Itinerary — skipping trigger installation';
    RETURN;
  END IF;

  RAISE NOTICE '[creator-guard] detected column: %', v_col;

  -- Build and install the trigger function using the discovered column name.
  -- format() with %%I produces a properly-quoted identifier.
  -- %% inside the format string becomes a literal % for RAISE's own formatter.
  EXECUTE format(
    $fmt$
      CREATE OR REPLACE FUNCTION protect_itinerary_creator_immutable()
      RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
      BEGIN
        -- Only act when the previously-assigned creator is being changed or cleared.
        -- Allows: first-time assignment (OLD.col IS NULL → any value).
        -- Blocks: change from non-null to anything else (including NULL).
        IF OLD.%1$I IS NOT NULL
           AND (NEW.%1$I IS NULL OR NEW.%1$I <> OLD.%1$I)
        THEN
          RAISE WARNING
            '[creator-guard] blocked attempt to change %1$s on itinerary %%, value restored (was: %%)',
            OLD.id,
            OLD.%1$I;
          NEW.%1$I := OLD.%1$I;
        END IF;
        RETURN NEW;
      END;
      $fn$;
    $fmt$,
    v_col
  );

  DROP TRIGGER IF EXISTS trg_itinerary_creator_immutable ON "Itinerary";

  CREATE TRIGGER trg_itinerary_creator_immutable
    BEFORE UPDATE ON "Itinerary"
    FOR EACH ROW
    EXECUTE FUNCTION protect_itinerary_creator_immutable();

  RAISE NOTICE '[creator-guard] trigger installed on "Itinerary".%', v_col;
END;
$$;
