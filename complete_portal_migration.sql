-- Complete SQL Migration for Portal Tables
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CREATE ENUM
-- ============================================
CREATE TYPE "LaunchPlatformKind" AS ENUM ('LAUNCHPAD', 'CEX', 'DEX', 'OTHER');

-- ============================================
-- 2. CREATE TABLES
-- ============================================

-- PortalUserProfile
CREATE TABLE IF NOT EXISTS "PortalUserProfile" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "avatarUrl" TEXT,
    "level" TEXT NOT NULL DEFAULT 'L1',
    "positiveReviews" INTEGER NOT NULL DEFAULT 0,
    "negativeReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortalUserProfile_pkey" PRIMARY KEY ("id")
);

-- LaunchPlatform
CREATE TABLE IF NOT EXISTS "LaunchPlatform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "kind" "LaunchPlatformKind" NOT NULL DEFAULT 'LAUNCHPAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "LaunchPlatform_pkey" PRIMARY KEY ("id")
);

-- LeadInvestor
CREATE TABLE IF NOT EXISTS "LeadInvestor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "tier" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "LeadInvestor_pkey" PRIMARY KEY ("id")
);

-- NewLaunch
CREATE TABLE IF NOT EXISTS "NewLaunch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "tokenName" TEXT,
    "chain" TEXT,
    "category" TEXT,
    "status" TEXT,
    "platformId" TEXT,
    "primaryPlatformId" TEXT,
    "listingPlatformId" TEXT,
    "leadInvestorId" TEXT,
    "salePriceUsd" DOUBLE PRECISION,
    "tokensForSale" DOUBLE PRECISION,
    "totalRaiseUsd" DOUBLE PRECISION,
    "airdropPercent" DOUBLE PRECISION,
    "airdropValueUsd" DOUBLE PRECISION,
    "vestingInfo" JSONB,
    "tokenAddress" TEXT,
    "priceSource" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewLaunch_pkey" PRIMARY KEY ("id")
);

-- DexSnapshot
CREATE TABLE IF NOT EXISTS "DexSnapshot" (
    "id" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "volume24h" DOUBLE PRECISION,
    "liquidity" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DexSnapshot_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- 3. CREATE UNIQUE CONSTRAINTS
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS "PortalUserProfile_telegramId_key" ON "PortalUserProfile"("telegramId");
CREATE UNIQUE INDEX IF NOT EXISTS "LaunchPlatform_slug_key" ON "LaunchPlatform"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadInvestor_slug_key" ON "LeadInvestor"("slug");

-- ============================================
-- 4. CREATE FOREIGN KEYS
-- ============================================

-- Foreign keys will be added in section 7 using DO blocks

-- ============================================
-- 5. CREATE INDEXES
-- ============================================

-- NewLaunch indexes
CREATE INDEX IF NOT EXISTS "NewLaunch_platformId_idx" ON "NewLaunch"("platformId");
CREATE INDEX IF NOT EXISTS "NewLaunch_primaryPlatformId_idx" ON "NewLaunch"("primaryPlatformId");
CREATE INDEX IF NOT EXISTS "NewLaunch_listingPlatformId_idx" ON "NewLaunch"("listingPlatformId");
CREATE INDEX IF NOT EXISTS "NewLaunch_leadInvestorId_idx" ON "NewLaunch"("leadInvestorId");
CREATE INDEX IF NOT EXISTS "NewLaunch_status_idx" ON "NewLaunch"("status");
CREATE INDEX IF NOT EXISTS "NewLaunch_createdById_idx" ON "NewLaunch"("createdById");

-- LeadInvestor indexes
CREATE INDEX IF NOT EXISTS "LeadInvestor_createdById_idx" ON "LeadInvestor"("createdById");

-- DexSnapshot indexes
CREATE INDEX IF NOT EXISTS "DexSnapshot_launchId_idx" ON "DexSnapshot"("launchId");
CREATE INDEX IF NOT EXISTS "DexSnapshot_fetchedAt_idx" ON "DexSnapshot"("fetchedAt");

-- ============================================
-- 6. ALTER EXISTING TABLES (if they exist)
-- ============================================

-- Add avatarUrl to PortalUserProfile if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'PortalUserProfile' AND column_name = 'avatarUrl'
    ) THEN
        ALTER TABLE "PortalUserProfile" ADD COLUMN "avatarUrl" TEXT;
    END IF;
END $$;

-- Add primaryPlatformId to NewLaunch if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'NewLaunch' AND column_name = 'primaryPlatformId'
    ) THEN
        ALTER TABLE "NewLaunch" ADD COLUMN "primaryPlatformId" TEXT;
    END IF;
END $$;

-- Add listingPlatformId to NewLaunch if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'NewLaunch' AND column_name = 'listingPlatformId'
    ) THEN
        ALTER TABLE "NewLaunch" ADD COLUMN "listingPlatformId" TEXT;
    END IF;
END $$;

-- Add leadInvestorId to NewLaunch if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'NewLaunch' AND column_name = 'leadInvestorId'
    ) THEN
        ALTER TABLE "NewLaunch" ADD COLUMN "leadInvestorId" TEXT;
    END IF;
END $$;

-- Add category to NewLaunch if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'NewLaunch' AND column_name = 'category'
    ) THEN
        ALTER TABLE "NewLaunch" ADD COLUMN "category" TEXT;
    END IF;
END $$;

-- Add website to LaunchPlatform if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'LaunchPlatform' AND column_name = 'website'
    ) THEN
        ALTER TABLE "LaunchPlatform" ADD COLUMN "website" TEXT;
    END IF;
END $$;

-- Add kind to LaunchPlatform if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'LaunchPlatform' AND column_name = 'kind'
    ) THEN
        ALTER TABLE "LaunchPlatform" ADD COLUMN "kind" "LaunchPlatformKind" NOT NULL DEFAULT 'LAUNCHPAD';
    END IF;
END $$;

-- Add createdById to LaunchPlatform if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'LaunchPlatform' AND column_name = 'createdById'
    ) THEN
        ALTER TABLE "LaunchPlatform" ADD COLUMN "createdById" TEXT;
    END IF;
END $$;

-- Add createdById to LeadInvestor if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'LeadInvestor' AND column_name = 'createdById'
    ) THEN
        ALTER TABLE "LeadInvestor" ADD COLUMN "createdById" TEXT;
    END IF;
END $$;

-- ============================================
-- 7. CREATE FOREIGN KEYS (safe to run multiple times)
-- ============================================

DO $$ 
BEGIN
    -- LaunchPlatform.createdById -> PortalUserProfile.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'LaunchPlatform_createdById_fkey'
    ) THEN
        ALTER TABLE "LaunchPlatform" 
        ADD CONSTRAINT "LaunchPlatform_createdById_fkey" 
        FOREIGN KEY ("createdById") REFERENCES "PortalUserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- LeadInvestor.createdById -> PortalUserProfile.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'LeadInvestor_createdById_fkey'
    ) THEN
        ALTER TABLE "LeadInvestor" 
        ADD CONSTRAINT "LeadInvestor_createdById_fkey" 
        FOREIGN KEY ("createdById") REFERENCES "PortalUserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- NewLaunch.platformId -> LaunchPlatform.id (legacy)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'NewLaunch_platformId_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" 
        ADD CONSTRAINT "NewLaunch_platformId_fkey" 
        FOREIGN KEY ("platformId") REFERENCES "LaunchPlatform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- NewLaunch.primaryPlatformId -> LaunchPlatform.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'NewLaunch_primaryPlatformId_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" 
        ADD CONSTRAINT "NewLaunch_primaryPlatformId_fkey" 
        FOREIGN KEY ("primaryPlatformId") REFERENCES "LaunchPlatform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- NewLaunch.listingPlatformId -> LaunchPlatform.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'NewLaunch_listingPlatformId_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" 
        ADD CONSTRAINT "NewLaunch_listingPlatformId_fkey" 
        FOREIGN KEY ("listingPlatformId") REFERENCES "LaunchPlatform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- NewLaunch.leadInvestorId -> LeadInvestor.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'NewLaunch_leadInvestorId_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" 
        ADD CONSTRAINT "NewLaunch_leadInvestorId_fkey" 
        FOREIGN KEY ("leadInvestorId") REFERENCES "LeadInvestor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- NewLaunch.createdById -> PortalUserProfile.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'NewLaunch_createdById_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" 
        ADD CONSTRAINT "NewLaunch_createdById_fkey" 
        FOREIGN KEY ("createdById") REFERENCES "PortalUserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- DexSnapshot.launchId -> NewLaunch.id
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'DexSnapshot_launchId_fkey'
    ) THEN
        ALTER TABLE "DexSnapshot" 
        ADD CONSTRAINT "DexSnapshot_launchId_fkey" 
        FOREIGN KEY ("launchId") REFERENCES "NewLaunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

