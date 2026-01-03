-- =============================================================================
-- Migration: ARC Admin Approve Leaderboard Request RPC Function
-- Purpose: Transaction-safe approval function for leaderboard requests
-- Date: 2025-01-31
-- 
-- This migration creates a Postgres RPC function that handles the entire
-- approval flow in a single transaction, ensuring atomicity.
-- 
-- Safe to re-run: Uses CREATE OR REPLACE
-- =============================================================================

-- =============================================================================
-- FUNCTION: arc_admin_approve_leaderboard_request
-- =============================================================================

CREATE OR REPLACE FUNCTION arc_admin_approve_leaderboard_request(
  p_request_id UUID,
  p_admin_profile_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_project RECORD;
  v_arena_id UUID;
  v_existing_arena_id UUID;
  v_arena_slug TEXT;
  v_base_slug TEXT;
  v_suffix INTEGER := 2;
  v_access_level TEXT;
  v_base_price NUMERIC(10, 2) := 0;
  v_discount_percent INTEGER := 0;
  v_final_price NUMERIC(10, 2) := 0;
  v_currency TEXT := 'USD';
  v_billing_inserted BOOLEAN := false;
  v_arena_mode TEXT; -- 'updated_existing' or 'inserted_new'
  v_result JSONB;
BEGIN
  -- Step 1: Load request row FOR UPDATE (lock row for transaction)
  SELECT 
    id,
    project_id,
    product_type,
    start_at,
    end_at,
    status
  INTO v_request
  FROM arc_leaderboard_requests
  WHERE id = p_request_id
  FOR UPDATE;

  -- Validate request exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  -- Validate request is pending
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'request_not_pending';
  END IF;

  -- Validate product_type
  IF v_request.product_type IS NULL OR v_request.product_type NOT IN ('ms', 'gamefi', 'crm') THEN
    RAISE EXCEPTION 'invalid_product_type';
  END IF;

  -- Step 2: Update request status to "approved"
  UPDATE arc_leaderboard_requests
  SET 
    status = 'approved',
    decided_at = NOW(),
    decided_by = p_admin_profile_id
  WHERE id = p_request_id;

  -- Step 3: Fetch project info (for arena name/slug)
  SELECT id, name, slug, is_arc_company
  INTO v_project
  FROM projects
  WHERE id = v_request.project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found';
  END IF;

  -- Step 3.5: Automatically set is_arc_company = true when approving
  -- If a project is approved for ARC, it should be marked as an ARC company
  -- This ensures approved projects appear in /api/portal/arc/projects
  UPDATE projects
  SET is_arc_company = true
  WHERE id = v_request.project_id
    AND (is_arc_company IS NULL OR is_arc_company = false);

  -- Step 4: Upsert arc_project_access
  -- Use ON CONFLICT with unique index (arc_project_access_project_id_unique)
  INSERT INTO arc_project_access (
    project_id,
    application_status,
    approved_at,
    approved_by_profile_id
  )
  VALUES (
    v_request.project_id,
    'approved',
    NOW(),
    p_admin_profile_id
  )
  ON CONFLICT (project_id) 
  DO UPDATE SET
    application_status = 'approved',
    approved_at = NOW(),
    approved_by_profile_id = p_admin_profile_id;

  -- Step 5: Upsert arc_project_features based on product_type
  -- Note: arc_project_features has UNIQUE constraint on project_id (auto-named arc_project_features_project_id_key)
  -- Use ON CONFLICT ON CONSTRAINT for explicit constraint reference
  IF v_request.product_type = 'ms' THEN
    INSERT INTO arc_project_features (
      project_id,
      leaderboard_enabled,
      leaderboard_start_at,
      leaderboard_end_at,
      option2_normal_unlocked
    )
    VALUES (
      v_request.project_id,
      true,
      v_request.start_at,
      v_request.end_at,
      true
    )
    ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key
    DO UPDATE SET
      leaderboard_enabled = true,
      leaderboard_start_at = v_request.start_at,
      leaderboard_end_at = v_request.end_at,
      option2_normal_unlocked = true,
      updated_at = NOW();

  ELSIF v_request.product_type = 'gamefi' THEN
    INSERT INTO arc_project_features (
      project_id,
      gamefi_enabled,
      gamefi_start_at,
      gamefi_end_at,
      leaderboard_enabled,
      leaderboard_start_at,
      leaderboard_end_at,
      option2_normal_unlocked,
      option3_gamified_unlocked
    )
    VALUES (
      v_request.project_id,
      true,
      v_request.start_at,
      v_request.end_at,
      true,
      v_request.start_at,
      v_request.end_at,
      true,
      true
    )
    ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key
    DO UPDATE SET
      gamefi_enabled = true,
      gamefi_start_at = v_request.start_at,
      gamefi_end_at = v_request.end_at,
      leaderboard_enabled = true,
      leaderboard_start_at = v_request.start_at,
      leaderboard_end_at = v_request.end_at,
      option2_normal_unlocked = true,
      option3_gamified_unlocked = true,
      updated_at = NOW();

  ELSIF v_request.product_type = 'crm' THEN
    INSERT INTO arc_project_features (
      project_id,
      crm_enabled,
      crm_start_at,
      crm_end_at,
      crm_visibility,
      option1_crm_unlocked
    )
    VALUES (
      v_request.project_id,
      true,
      v_request.start_at,
      v_request.end_at,
      'private',
      true
    )
    ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key
    DO UPDATE SET
      crm_enabled = true,
      crm_start_at = v_request.start_at,
      crm_end_at = v_request.end_at,
      crm_visibility = COALESCE(arc_project_features.crm_visibility, 'private'),
      option1_crm_unlocked = true,
      updated_at = NOW();
  END IF;

  -- Step 6: Entity creation (for ms and gamefi)
  -- Concurrency-safe: Use advisory lock + FOR UPDATE to prevent race conditions
  v_arena_id := NULL;
  v_arena_mode := NULL;
  IF v_request.product_type IN ('ms', 'gamefi') THEN
    -- Acquire advisory lock on project_id to prevent concurrent arena operations
    PERFORM pg_advisory_xact_lock(hashtext(v_request.project_id::text));
    
    -- Select existing arena FOR UPDATE (locks row for this transaction)
    -- Check for ANY arena with kind IN ('ms', 'legacy_ms') OR kind IS NULL (legacy arenas)
    -- This prevents unique constraint violations
    -- Note: NULL kind means legacy arena (before kind column was added)
    SELECT id INTO v_existing_arena_id
    FROM arenas
    WHERE project_id = v_request.project_id
      AND (kind IN ('ms', 'legacy_ms') OR kind IS NULL)
    ORDER BY 
      CASE WHEN status = 'active' THEN 0 ELSE 1 END, -- Prefer active arenas
      created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_existing_arena_id IS NOT NULL THEN
      -- Update existing arena (reuse locked row)
      UPDATE arenas
      SET
        kind = 'ms',
        status = 'active',
        name = COALESCE(v_project.name, 'Project') || ' Mindshare',
        starts_at = v_request.start_at,
        ends_at = v_request.end_at,
        updated_at = NOW()
      WHERE id = v_existing_arena_id
      RETURNING id INTO v_arena_id;
      
      v_arena_mode := 'updated_existing';
      
      -- End any other active MS/legacy_ms arenas for this project (after reactivating chosen one)
      UPDATE arenas
      SET 
        status = 'ended',
        ends_at = NOW(),
        updated_at = NOW()
      WHERE project_id = v_request.project_id
        AND status = 'active'
        AND (kind IN ('ms', 'legacy_ms') OR kind IS NULL)
        AND id <> v_existing_arena_id;
    ELSE
      -- No existing ms/legacy arena found - double-check before INSERT
      -- This is a safety check to prevent constraint violations
      -- Check again without FOR UPDATE to see if any arena exists (even if locked by another transaction)
      -- Note: NULL kind means legacy arena (before kind column was added)
      SELECT id INTO v_existing_arena_id
      FROM arenas
      WHERE project_id = v_request.project_id
        AND (kind IN ('ms', 'legacy_ms') OR kind IS NULL)
      ORDER BY 
        CASE WHEN status = 'active' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1;
      
      -- If we found one now, update it instead
      IF v_existing_arena_id IS NOT NULL THEN
        -- Lock it and update
        UPDATE arenas
        SET
          kind = 'ms',
          status = 'active',
          name = COALESCE(v_project.name, 'Project') || ' Mindshare',
          starts_at = v_request.start_at,
          ends_at = v_request.end_at,
          updated_at = NOW()
        WHERE id = v_existing_arena_id
        RETURNING id INTO v_arena_id;
        
        v_arena_mode := 'updated_existing';
        
        -- End any other active MS/legacy_ms arenas for this project
        UPDATE arenas
        SET 
          status = 'ended',
          ends_at = NOW(),
          updated_at = NOW()
        WHERE project_id = v_request.project_id
          AND status = 'active'
          AND (kind IN ('ms', 'legacy_ms') OR kind IS NULL)
          AND id <> v_existing_arena_id;
      ELSE
        -- Truly no arena exists - safe to INSERT
        -- End any existing active MS/legacy_ms arenas for this project (safety check)
        UPDATE arenas
        SET 
          status = 'ended',
          ends_at = NOW(),
          updated_at = NOW()
        WHERE project_id = v_request.project_id
          AND status = 'active'
          AND (kind IN ('ms', 'legacy_ms') OR kind IS NULL);

        -- Generate unique arena slug
        v_base_slug := COALESCE(v_project.slug, SUBSTRING(v_project.id::text, 1, 8)) || '-leaderboard';
        v_arena_slug := v_base_slug || '-' || SUBSTRING(gen_random_uuid()::text, 1, 8);

        -- Create new arena (only if no ms/legacy arena exists)
        INSERT INTO arenas (
          project_id,
          kind,
          status,
          name,
          slug,
          starts_at,
          ends_at,
          created_by
        )
        VALUES (
          v_request.project_id,
          'ms',
          'active',
          COALESCE(v_project.name, 'Project') || ' Mindshare',
          v_arena_slug,
          v_request.start_at,
          v_request.end_at,
          p_admin_profile_id
        )
        RETURNING id INTO v_arena_id;
        
        v_arena_mode := 'inserted_new';
      END IF;
    END IF;
  END IF;

  -- Step 7: Insert billing record (if table exists)
  BEGIN
    -- Map product_type to access_level
    IF v_request.product_type = 'ms' THEN
      v_access_level := 'leaderboard';
    ELSIF v_request.product_type = 'gamefi' THEN
      v_access_level := 'gamified';
    ELSE
      v_access_level := 'creator_manager';
    END IF;

    -- Try to get pricing (optional - defaults to 0 if not found)
    BEGIN
      SELECT base_price_usd, currency
      INTO v_base_price, v_currency
      FROM arc_pricing
      WHERE access_level = v_access_level
        AND is_active = true
      LIMIT 1;
    EXCEPTION
      WHEN OTHERS THEN
        -- Pricing table might not exist or no pricing found - use defaults
        v_base_price := 0;
        v_currency := 'USD';
    END;

    v_final_price := v_base_price * (1 - (v_discount_percent::NUMERIC / 100));

    -- Insert billing record
    INSERT INTO arc_billing_records (
      request_id,
      project_id,
      access_level,
      base_price_usd,
      discount_percent,
      final_price_usd,
      currency,
      payment_status,
      created_by
    )
    VALUES (
      p_request_id,
      v_request.project_id,
      v_access_level,
      v_base_price,
      v_discount_percent,
      v_final_price,
      v_currency,
      'pending',
      p_admin_profile_id
    );

    v_billing_inserted := true;
  EXCEPTION
    WHEN undefined_table THEN
      -- arc_billing_records table doesn't exist - skip billing
      v_billing_inserted := false;
    WHEN OTHERS THEN
      -- Other errors - log but don't fail the transaction
      v_billing_inserted := false;
  END;

  -- Step 8: Build and return result
  v_result := jsonb_build_object(
    'ok', true,
    'requestId', p_request_id,
    'projectId', v_request.project_id,
    'productType', v_request.product_type,
    'created', jsonb_build_object(
      'arenaId', v_arena_id,
      'arenaMode', v_arena_mode
    ),
    'updatedFeatures', true,
    'billingInserted', v_billing_inserted
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise with error message
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

-- =============================================================================
-- NOTES
-- =============================================================================

-- Function Summary:
-- 
-- arc_admin_approve_leaderboard_request(p_request_id, p_admin_profile_id)
-- 
-- This function performs the entire approval flow in a single transaction:
-- 1. Locks and validates the request (must be 'pending')
-- 2. Updates request status to 'approved'
-- 3. Upserts arc_project_access
-- 4. Upserts arc_project_features with product-specific flags
-- 5. For ms/gamefi: Ends existing arenas and creates new arena
-- 6. Optionally inserts billing record (if table exists)
-- 
-- Returns JSONB:
-- {
--   "ok": true,
--   "requestId": "...",
--   "projectId": "...",
--   "productType": "ms|gamefi|crm",
--   "created": { "arenaId": "..." },
--   "updatedFeatures": true,
--   "billingInserted": true/false
-- }
-- 
-- Error Handling:
-- - request_not_found: Request ID doesn't exist
-- - request_not_pending: Request status is not 'pending'
-- - invalid_product_type: product_type is missing or invalid
-- - project_not_found: Project doesn't exist
-- - Other errors: Re-raised with SQLERRM
-- 
-- Security:
-- - Uses SECURITY DEFINER to run with function owner privileges
-- - Should only be called from service role API routes
-- - All operations are atomic (single transaction)
