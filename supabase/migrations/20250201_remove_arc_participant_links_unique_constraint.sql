-- =============================================================================
-- Migration: Remove Unique Constraint from arc_participant_links
-- Purpose: Allow multiple links per participant per campaign (up to 5)
-- Date: 2025-02-01
-- =============================================================================

-- Drop the unique constraint that limits one link per participant per campaign
ALTER TABLE IF EXISTS arc_participant_links
  DROP CONSTRAINT IF EXISTS arc_participant_links_unique;

-- Note: The code column still has UNIQUE constraint, which is correct
-- as each link needs a unique redirect code.
