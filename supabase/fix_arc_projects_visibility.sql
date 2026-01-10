-- =============================================================================
-- Fix: Ensure MYSTIC CLUB project appears in ARC home page
-- =============================================================================
-- This script ensures a project with an active arena meets all requirements
-- to appear in the ARC home page (/portal/arc)
-- =============================================================================

-- Step 1: Find the project that has the MYSTIC CLUB arena
-- (using the arena ID from earlier: f16454be-b0fd-471e-8b84-fc2a8d615c26)
DO $$
DECLARE
  v_project_id UUID;
  v_project_name TEXT;
  v_arena_id UUID := 'f16454be-b0fd-471e-8b84-fc2a8d615c26';
  v_access_id UUID;
BEGIN
  -- Find the project_id for this arena
  SELECT project_id INTO v_project_id
  FROM arenas
  WHERE id = v_arena_id;
  
  IF v_project_id IS NULL THEN
    RAISE NOTICE 'Arena % not found. Searching for any MYSTIC CLUB project...', v_arena_id;
    
    -- Try to find by name or handle
    SELECT id, name INTO v_project_id, v_project_name
    FROM projects
    WHERE (
      LOWER(name) LIKE '%mystic%club%'
      OR LOWER(display_name) LIKE '%mystic%club%'
      OR LOWER(twitter_username) LIKE '%mysticheros%'
      OR LOWER(x_handle) LIKE '%mysticheros%'
    )
    AND is_active = true
    LIMIT 1;
    
    IF v_project_id IS NULL THEN
      RAISE EXCEPTION 'Project with MYSTIC CLUB arena not found. Please check the arena_id or project name.';
    END IF;
  ELSE
    SELECT name INTO v_project_name
    FROM projects
    WHERE id = v_project_id;
  END IF;
  
  RAISE NOTICE 'Found project: % (ID: %)', v_project_name, v_project_id;
  
  -- Step 2: Ensure project has is_arc_company = true (or NULL)
  UPDATE projects
  SET is_arc_company = COALESCE(is_arc_company, true)
  WHERE id = v_project_id
    AND (is_arc_company IS NULL OR is_arc_company = false);
  
  RAISE NOTICE '✓ Set is_arc_company = true';
  
  -- Step 3: Ensure project has an approved ARC access entry
  -- Check if an entry exists
  SELECT id INTO v_access_id
  FROM arc_project_access
  WHERE project_id = v_project_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_access_id IS NULL THEN
    -- Create a new approved access entry
    INSERT INTO arc_project_access (project_id, application_status, created_at, updated_at)
    VALUES (v_project_id, 'approved', NOW(), NOW())
    RETURNING id INTO v_access_id;
    
    RAISE NOTICE '✓ Created approved ARC access entry (ID: %)', v_access_id;
  ELSE
    -- Update existing entry to approved
    UPDATE arc_project_access
    SET application_status = 'approved',
        updated_at = NOW()
    WHERE id = v_access_id;
    
    RAISE NOTICE '✓ Updated ARC access entry to approved (ID: %)', v_access_id;
  END IF;
  
  -- Step 4: Ensure project has leaderboard_enabled OR has an active arena
  -- Check if arc_project_features row exists
  IF NOT EXISTS (
    SELECT 1 FROM arc_project_features WHERE project_id = v_project_id
  ) THEN
    -- Create a new features row with leaderboard_enabled = true
    INSERT INTO arc_project_features (
      project_id,
      leaderboard_enabled,
      option2_normal_unlocked,
      created_at,
      updated_at
    )
    VALUES (
      v_project_id,
      true,
      true,
      NOW(),
      NOW()
    );
    
    RAISE NOTICE '✓ Created arc_project_features row with leaderboard_enabled = true';
  ELSE
    -- Update existing row to enable leaderboard
    UPDATE arc_project_features
    SET leaderboard_enabled = true,
        option2_normal_unlocked = true,
        updated_at = NOW()
    WHERE project_id = v_project_id;
    
    RAISE NOTICE '✓ Updated arc_project_features to enable leaderboard';
  END IF;
  
  -- Step 5: Verify arena status is 'active' or 'live' and kind is 'ms' or 'legacy_ms'
  UPDATE arenas
  SET status = CASE 
    WHEN status NOT IN ('active', 'live') THEN 'active'
    ELSE status
  END,
  kind = CASE
    WHEN kind NOT IN ('ms', 'legacy_ms') THEN 'ms'
    ELSE kind
  END,
  updated_at = NOW()
  WHERE project_id = v_project_id
    AND id = v_arena_id;
  
  RAISE NOTICE '✓ Ensured arena status is active and kind is ms';
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ SUCCESS: Project % should now appear in ARC home page', v_project_name;
  RAISE NOTICE '';
  RAISE NOTICE 'Verification:';
  RAISE NOTICE '  - is_arc_company: %', (SELECT is_arc_company FROM projects WHERE id = v_project_id);
  RAISE NOTICE '  - is_active: %', (SELECT is_active FROM projects WHERE id = v_project_id);
  RAISE NOTICE '  - ARC access status: %', (SELECT application_status FROM arc_project_access WHERE project_id = v_project_id ORDER BY created_at DESC LIMIT 1);
  RAISE NOTICE '  - leaderboard_enabled: %', (SELECT leaderboard_enabled FROM arc_project_features WHERE project_id = v_project_id);
  RAISE NOTICE '  - Arena status: %', (SELECT status FROM arenas WHERE id = v_arena_id);
  RAISE NOTICE '  - Arena kind: %', (SELECT kind FROM arenas WHERE id = v_arena_id);
  
END $$;

-- =============================================================================
-- Alternative: Fix ALL projects with active arenas to appear in ARC home
-- =============================================================================
-- Uncomment this section if you want to enable ALL projects with active arenas
/*
DO $$
DECLARE
  v_project RECORD;
  v_access_id UUID;
BEGIN
  FOR v_project IN
    SELECT DISTINCT p.id, p.name, a.id as arena_id
    FROM projects p
    INNER JOIN arenas a ON a.project_id = p.id
    WHERE p.is_active = true
      AND a.status IN ('active', 'live')
      AND a.kind IN ('ms', 'legacy_ms')
      AND (
        a.starts_at IS NULL OR a.starts_at <= NOW()
      )
      AND (
        a.ends_at IS NULL OR a.ends_at >= NOW()
      )
  LOOP
    -- Ensure is_arc_company
    UPDATE projects
    SET is_arc_company = COALESCE(is_arc_company, true)
    WHERE id = v_project.id;
    
    -- Ensure approved ARC access
    SELECT id INTO v_access_id
    FROM arc_project_access
    WHERE project_id = v_project.id
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_access_id IS NULL THEN
      INSERT INTO arc_project_access (project_id, application_status, created_at, updated_at)
      VALUES (v_project.id, 'approved', NOW(), NOW());
    ELSE
      UPDATE arc_project_access
      SET application_status = 'approved', updated_at = NOW()
      WHERE id = v_access_id;
    END IF;
    
    -- Ensure leaderboard_enabled
    IF NOT EXISTS (SELECT 1 FROM arc_project_features WHERE project_id = v_project.id) THEN
      INSERT INTO arc_project_features (project_id, leaderboard_enabled, option2_normal_unlocked, created_at, updated_at)
      VALUES (v_project.id, true, true, NOW(), NOW());
    ELSE
      UPDATE arc_project_features
      SET leaderboard_enabled = true, option2_normal_unlocked = true, updated_at = NOW()
      WHERE project_id = v_project.id;
    END IF;
    
    RAISE NOTICE '✓ Fixed project: % (ID: %)', v_project.name, v_project.id;
  END LOOP;
END $$;
*/
