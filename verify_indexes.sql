-- Verify that all performance indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('Bet', 'Campaign', 'CampaignUserProgress', 'MystTransaction')
  AND indexname LIKE '%_idx'
ORDER BY tablename, indexname;

