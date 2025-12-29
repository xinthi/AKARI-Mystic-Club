-- =============================================================================
-- Migration: Add proof_url column to arc_quest_completions
-- Purpose: Store optional proof links (tweet URLs) for quest completions
-- Date: 2025-01-23
-- =============================================================================

-- Add proof_url column to arc_quest_completions
ALTER TABLE arc_quest_completions
ADD COLUMN IF NOT EXISTS proof_url TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN arc_quest_completions.proof_url IS 'Optional URL to proof of completion (e.g., tweet link). Prefers x.com or twitter.com domains.';

