-- Performance Indexes Migration
-- Run this directly in Supabase SQL Editor if Prisma migration fails
-- These indexes improve query performance for frequently accessed fields

-- Bet model indexes
CREATE INDEX IF NOT EXISTS "Bet_predictionId_idx" ON "Bet"("predictionId");
CREATE INDEX IF NOT EXISTS "Bet_userId_createdAt_idx" ON "Bet"("userId", "createdAt");

-- Campaign model indexes
CREATE INDEX IF NOT EXISTS "Campaign_status_idx" ON "Campaign"("status");
CREATE INDEX IF NOT EXISTS "Campaign_endsAt_idx" ON "Campaign"("endsAt");

-- CampaignUserProgress indexes
CREATE INDEX IF NOT EXISTS "CampaignUserProgress_campaignId_userId_idx" ON "CampaignUserProgress"("campaignId", "userId");
CREATE INDEX IF NOT EXISTS "CampaignUserProgress_userId_completed_idx" ON "CampaignUserProgress"("userId", "completed");

-- MystTransaction composite indexes (for better query performance)
CREATE INDEX IF NOT EXISTS "MystTransaction_userId_type_idx" ON "MystTransaction"("userId", "type");
CREATE INDEX IF NOT EXISTS "MystTransaction_userId_createdAt_idx" ON "MystTransaction"("userId", "createdAt");

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('Bet', 'Campaign', 'CampaignUserProgress', 'MystTransaction')
ORDER BY tablename, indexname;

