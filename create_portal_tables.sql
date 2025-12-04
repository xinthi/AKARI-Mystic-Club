-- Create Portal Tables for AKARI Mystic Club
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. Create enum for LaunchPlatformKind
CREATE TYPE "LaunchPlatformKind" AS ENUM ('LAUNCHPAD', 'CEX', 'DEX', 'OTHER');

-- 2. Create PortalUserProfile table
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

CREATE UNIQUE INDEX IF NOT EXISTS "PortalUserProfile_telegramId_key" ON "PortalUserProfile"("telegramId");

-- 3. Create LaunchPlatform table
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

CREATE UNIQUE INDEX IF NOT EXISTS "LaunchPlatform_slug_key" ON "LaunchPlatform"("slug");
CREATE INDEX IF NOT EXISTS "LaunchPlatform_createdById_idx" ON "LaunchPlatform"("createdById");

-- 4. Create LeadInvestor table
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

CREATE UNIQUE INDEX IF NOT EXISTS "LeadInvestor_slug_key" ON "LeadInvestor"("slug");
CREATE INDEX IF NOT EXISTS "LeadInvestor_createdById_idx" ON "LeadInvestor"("createdById");

-- 5. Create NewLaunch table
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

CREATE INDEX IF NOT EXISTS "NewLaunch_platformId_idx" ON "NewLaunch"("platformId");
CREATE INDEX IF NOT EXISTS "NewLaunch_primaryPlatformId_idx" ON "NewLaunch"("primaryPlatformId");
CREATE INDEX IF NOT EXISTS "NewLaunch_listingPlatformId_idx" ON "NewLaunch"("listingPlatformId");
CREATE INDEX IF NOT EXISTS "NewLaunch_leadInvestorId_idx" ON "NewLaunch"("leadInvestorId");
CREATE INDEX IF NOT EXISTS "NewLaunch_status_idx" ON "NewLaunch"("status");
CREATE INDEX IF NOT EXISTS "NewLaunch_createdById_idx" ON "NewLaunch"("createdById");

-- 6. Create DexSnapshot table
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

CREATE INDEX IF NOT EXISTS "DexSnapshot_launchId_idx" ON "DexSnapshot"("launchId");
CREATE INDEX IF NOT EXISTS "DexSnapshot_fetchedAt_idx" ON "DexSnapshot"("fetchedAt");

-- 7. Add foreign key constraints (run these only if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'LaunchPlatform_createdById_fkey'
    ) THEN
        ALTER TABLE "LaunchPlatform" ADD CONSTRAINT "LaunchPlatform_createdById_fkey" 
            FOREIGN KEY ("createdById") REFERENCES "PortalUserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'LeadInvestor_createdById_fkey'
    ) THEN
        ALTER TABLE "LeadInvestor" ADD CONSTRAINT "LeadInvestor_createdById_fkey" 
            FOREIGN KEY ("createdById") REFERENCES "PortalUserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NewLaunch_platformId_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" ADD CONSTRAINT "NewLaunch_platformId_fkey" 
            FOREIGN KEY ("platformId") REFERENCES "LaunchPlatform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NewLaunch_primaryPlatformId_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" ADD CONSTRAINT "NewLaunch_primaryPlatformId_fkey" 
            FOREIGN KEY ("primaryPlatformId") REFERENCES "LaunchPlatform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NewLaunch_listingPlatformId_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" ADD CONSTRAINT "NewLaunch_listingPlatformId_fkey" 
            FOREIGN KEY ("listingPlatformId") REFERENCES "LaunchPlatform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NewLaunch_leadInvestorId_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" ADD CONSTRAINT "NewLaunch_leadInvestorId_fkey" 
            FOREIGN KEY ("leadInvestorId") REFERENCES "LeadInvestor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NewLaunch_createdById_fkey'
    ) THEN
        ALTER TABLE "NewLaunch" ADD CONSTRAINT "NewLaunch_createdById_fkey" 
            FOREIGN KEY ("createdById") REFERENCES "PortalUserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DexSnapshot_launchId_fkey'
    ) THEN
        ALTER TABLE "DexSnapshot" ADD CONSTRAINT "DexSnapshot_launchId_fkey" 
            FOREIGN KEY ("launchId") REFERENCES "NewLaunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Done! All portal tables should now exist.

