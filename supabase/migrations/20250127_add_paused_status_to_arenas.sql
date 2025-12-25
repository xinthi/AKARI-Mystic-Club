-- Migration: Add 'paused' status to arenas table
-- Date: 2025-01-27
-- Purpose: Support proper pause functionality for arenas (separate from cancelled/ended)

-- Drop the existing check constraint
ALTER TABLE arenas DROP CONSTRAINT IF EXISTS arenas_status_check;

-- Add the new check constraint with 'paused' status
ALTER TABLE arenas ADD CONSTRAINT arenas_status_check 
  CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'ended', 'cancelled'));

-- Note: 'cancelled' remains in the enum but should be treated as ended (cannot be re-instated)
-- 'paused' is the new status for pausing (can be re-instated)

