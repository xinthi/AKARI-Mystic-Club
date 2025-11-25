-- Database Cleanup Script for Supabase
-- 
-- WARNING: This will DELETE all data from the specified tables.
-- Use with caution! Only run in development/test environments.
--
-- To run in Supabase SQL Editor:
-- 1. Open Supabase Dashboard
-- 2. Go to SQL Editor
-- 3. Paste this script
-- 4. Review carefully
-- 5. Execute
--
-- For partial cleanup (e.g., only old data), modify the WHERE clauses.

-- Disable foreign key checks temporarily (PostgreSQL doesn't support this directly,
-- but we use CASCADE to handle dependencies)

-- Clean up in order to respect foreign key constraints
TRUNCATE TABLE "bets" CASCADE;
TRUNCATE TABLE "predictions" CASCADE;
TRUNCATE TABLE "campaigns" CASCADE;
TRUNCATE TABLE "surveys" CASCADE;
TRUNCATE TABLE "reviews" CASCADE;
TRUNCATE TABLE "users" CASCADE;

-- Note: Tiers are not truncated as they are seed data
-- If you want to reset tiers too, run:
-- TRUNCATE TABLE "tiers" CASCADE;
-- Then re-run: pnpm prisma:seed

-- Alternative: Partial cleanup (only data older than 30 days)
-- DELETE FROM "bets" WHERE "createdAt" < NOW() - INTERVAL '30 days';
-- DELETE FROM "predictions" WHERE "createdAt" < NOW() - INTERVAL '30 days';
-- DELETE FROM "campaigns" WHERE "createdAt" < NOW() - INTERVAL '30 days';
-- DELETE FROM "surveys" WHERE "createdAt" < NOW() - INTERVAL '30 days';
-- DELETE FROM "reviews" WHERE "createdAt" < NOW() - INTERVAL '30 days';
-- DELETE FROM "users" WHERE "joinedAt" < NOW() - INTERVAL '30 days' AND "points" = 0;

