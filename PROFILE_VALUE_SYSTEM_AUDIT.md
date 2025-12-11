# AKARI Mystic Club - Profile Value System Audit

**Date**: December 11, 2025  
**Scope**: User Location, CT Activity Tracking, Value Scoring, Traffic Attribution, Profile Display

---

## Overview

This audit evaluates whether the existing AKARI Mystic Club stack can support a new feature set:
1. User location inference (country-level)
2. User → CT activity → projects mapping (last 90 days)
3. "Value score" calculation per user→project relationship
4. Referral/traffic tracking from user activity to project profiles
5. Displaying "Top 5 Value Projects" on user profile pages

**Executive Summary**: The current architecture is **project-centric**, not **user-centric**. While we have the building blocks (X OAuth, TwitterAPI.io, project_tweets), significant additions are needed to track and score user activity per project.

---

## 1. Existing Capabilities

### 1.1 User Identity & Authentication

| Component | Status | Details |
|-----------|--------|---------|
| X OAuth 2.0 | ✅ Exists | `/api/auth/website/x/start` and `/callback` |
| Telegram WebApp Auth | ✅ Exists | Via `x-telegram-init-data` header |
| User Table (Supabase) | ✅ Exists | `akari_users` with persona fields |
| Identity Mapping | ✅ Exists | `akari_user_identities` links X/Telegram to user |
| X Username Storage | ✅ Exists | Stored in `akari_user_identities.username` |
| Session Management | ✅ Exists | `akari_user_sessions` with tokens |

**Code Location**: 
- `src/web/lib/akari-auth.tsx` - Auth context and hooks
- `src/web/pages/api/auth/website/x/` - X OAuth flow
- `supabase/create_akari_auth_tables.sql` - Auth schema

**Key Finding**: We **CAN** identify users and their linked X handles.

### 1.2 Twitter API Integration

| Capability | Status | Details |
|------------|--------|---------|
| TwitterAPI.io Client | ✅ Exists | `src/server/twitterapiio.ts` |
| Fetch User Tweets | ✅ Exists | `taioGetUserLastTweets(username)` |
| Fetch User Mentions | ✅ Exists | `taioGetUserMentions(username)` |
| Advanced Tweet Search | ✅ Exists | `taioAdvancedSearchTweets(query)` |
| User Profile Info | ✅ Exists | `taioGetUserInfo(username)` |

**Key Finding**: We **CAN** fetch a user's tweets programmatically via TwitterAPI.io.

### 1.3 Project & Sentiment Data

| Table | Purpose | Relevant Fields |
|-------|---------|-----------------|
| `projects` | Tracked crypto projects | slug, x_handle, name, inner_circle_count |
| `project_tweets` | Tweets mentioning projects | author_handle, text, likes, replies, retweets, sentiment_score, engagement_score |
| `metrics_daily` | Daily project metrics | sentiment_score, ct_heat_score, followers |
| `profiles` | CT profiles (influencers) | username, akari_profile_score, influence_score |
| `project_inner_circle` | Profile→Project relationships | weight, is_follower, is_author |
| `akari_user_watchlist` | User's starred projects | user_id, project_id |

**Key Finding**: Data is stored **PROJECT-CENTRIC** - we track tweets **about** projects, not tweets **by** users.

### 1.4 Profile Page Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| My Profile Page | `/portal/me.tsx` | ✅ Exists |
| Profile Header | `ProfileHeader.tsx` | ✅ Exists |
| Stats Row | `ProfileStatsRow.tsx` | ✅ Exists |
| Zone of Expertise | `ProfileZoneOfExpertise.tsx` | ✅ Exists |
| Club Orbit | `ProfileClubOrbit.tsx` | ✅ Exists |
| Inner Circle List | `ProfileInnerCircleList.tsx` | ✅ Exists |

**Key Finding**: Profile page infrastructure exists with modular components. Adding a "Top Projects" section is straightforward.

---

## 2. Gaps / Missing Pieces

### 2.1 User Location Tracking

| Item | Current State |
|------|---------------|
| IP Logging | ❌ Not implemented |
| Geo/Country Inference | ❌ Not implemented |
| Device Fingerprinting | ❌ Not implemented |
| Analytics Library | ❌ None integrated (no GA, Mixpanel, PostHog) |
| Telegram Location | ❌ Not available from WebApp API |
| X Location | ⚠️ Optional field in X profile, unreliable |

**Conclusion**: No location data is currently captured or stored.

### 2.2 User-Centric Tweet Storage

| What's Missing | Why It Matters |
|----------------|----------------|
| User tweets table | No place to store tweets BY a specific user |
| User→Project mapping | Can't map which projects a user talked about |
| Engagement aggregation per user | Can't calculate "value driven" per user→project |
| 90-day historical data | Would need to fetch and store on first access |

**Current Data Flow**:
```
project_tweets: project_id → tweet_id → author_handle
```

**Needed Data Flow**:
```
user_tweets: user_id → tweet_id → mentioned_project_ids → engagement
```

### 2.3 Event/Analytics Tracking

| Event Type | Current State |
|------------|---------------|
| Page views | ❌ Not tracked |
| Project profile opens | ❌ Not tracked |
| Referral source | ❌ Not tracked |
| UTM parameters | ❌ Not handled |
| Session replay | ❌ Not implemented |

**Missing Infrastructure**:
- No `akari_portal_events` table
- No event ingestion API
- No ref parameter handling

### 2.4 Value Score Computation

| Component | Status |
|-----------|--------|
| Formula definition | ❌ Not defined |
| Cron job for computation | ❌ Not exists |
| Cache/materialized view | ❌ Not exists |

---

## 3. Recommended Minimal Additions

### 3.1 User Location (Country-Level)

**Recommended Approach**: Server-side IP geolocation on auth/session

```sql
-- Add to akari_users
ALTER TABLE akari_users ADD COLUMN country_code TEXT;
ALTER TABLE akari_users ADD COLUMN country_inferred_at TIMESTAMPTZ;
```

**Implementation**:
1. On login/session creation, capture IP from `req.socket.remoteAddress` or `x-forwarded-for`
2. Use free geo-IP service (MaxMind GeoLite2 or ip-api.com)
3. Store country code (ISO 3166-1 alpha-2)

**Complexity**: 🟢 Low  
**Privacy**: Minimal - only country code, not precise location

### 3.2 User Activity Table

**New Table**: `user_ct_activity`

```sql
CREATE TABLE user_ct_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  tweet_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,  -- Tweet creation time
  text TEXT,
  likes INT DEFAULT 0,
  replies INT DEFAULT 0,
  retweets INT DEFAULT 0,
  engagement_score NUMERIC(12,2),
  activity_type TEXT CHECK (activity_type IN ('tweet', 'reply', 'retweet', 'quote')),
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, tweet_id)
);

CREATE INDEX idx_user_ct_activity_user ON user_ct_activity(user_id, created_at DESC);
CREATE INDEX idx_user_ct_activity_project ON user_ct_activity(project_id);
```

**Data Population Strategy**:
1. **On-demand fetch**: When user visits `/portal/me`, fetch their last 90 days of tweets
2. **Match projects**: For each tweet, check if it mentions any tracked project (by @handle or keyword)
3. **Store engagement**: Record likes/replies/retweets at fetch time
4. **Periodic refresh**: Update engagement metrics daily via cron

**Complexity**: 🟡 Medium (API calls, matching logic, storage)

### 3.3 User→Project Value Score

**New Materialized View or Table**: `user_project_value_scores`

```sql
CREATE TABLE user_project_value_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Raw metrics (90d rolling)
  tweet_count INT DEFAULT 0,
  total_likes INT DEFAULT 0,
  total_replies INT DEFAULT 0,
  total_retweets INT DEFAULT 0,
  avg_sentiment NUMERIC(5,2),
  
  -- Computed score
  value_score NUMERIC(10,2) DEFAULT 0,
  
  -- Metadata
  last_mention_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, project_id)
);

CREATE INDEX idx_user_project_value_user ON user_project_value_scores(user_id, value_score DESC);
```

**Proposed Value Score Formulas**:

**Formula A: Engagement-Weighted**
```
value_score = (tweet_count * 10) + (total_likes * 1) + (total_replies * 3) + (total_retweets * 2)
```

**Formula B: Reach-Normalized**
```
value_score = log10(total_engagement + 1) * tweet_count * sentiment_multiplier
where sentiment_multiplier = avg_sentiment / 50 (neutral = 1x)
```

**Complexity**: 🟡 Medium (cron job, formula tuning)

### 3.4 Event Tracking (Traffic Attribution)

**New Table**: `akari_portal_events`

```sql
CREATE TABLE akari_portal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES akari_users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,  -- 'page_view', 'project_profile_view', 'cta_click'
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ref_user_id UUID REFERENCES akari_users(id) ON DELETE SET NULL,
  ref_source TEXT,  -- 'twitter', 'telegram', 'direct', etc.
  page_path TEXT,
  user_agent TEXT,
  ip_hash TEXT,  -- Hashed IP for deduplication, not tracking
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portal_events_user ON akari_portal_events(user_id, created_at DESC);
CREATE INDEX idx_portal_events_project ON akari_portal_events(project_id, created_at DESC);
CREATE INDEX idx_portal_events_ref ON akari_portal_events(ref_user_id, created_at DESC);
```

**Implementation**:
1. Add `?ref=USER_ID` or `?ref=handle` to shareable links
2. Create `/api/portal/events/track` endpoint
3. Call on page load via `useEffect` in Next.js pages
4. Parse ref param and store attribution

**Complexity**: 🟢 Low (simple API, client-side hook)

### 3.5 Top Projects API & UI

**New API**: `GET /api/portal/profile/[userId]/top-projects`

```typescript
interface TopProjectResponse {
  ok: boolean;
  projects: Array<{
    project: {
      id: string;
      slug: string;
      name: string;
      x_handle: string;
      avatar_url: string | null;
    };
    valueScore: number;
    tweetCount: number;
    totalEngagement: number;
    lastMentionAt: string | null;
  }>;
}
```

**UI Component**: `ProfileTopProjects.tsx`

```tsx
// Add to /portal/me.tsx after ProfileStatsRow
<ProfileTopProjects userId={user.id} />
```

**Complexity**: 🟢 Low (straightforward query, standard component)

---

## 4. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NEW COMPONENTS                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │   GeoIP      │    │   TwitterAPI.io  │    │   Event Track    │   │
│  │   Service    │    │   (existing)     │    │   API            │   │
│  └──────┬───────┘    └────────┬─────────┘    └────────┬─────────┘   │
│         │                     │                       │              │
│         ▼                     ▼                       ▼              │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │ akari_users  │    │ user_ct_activity │    │ akari_portal_    │   │
│  │ +country_code│    │                  │    │ events           │   │
│  └──────────────┘    └────────┬─────────┘    └──────────────────┘   │
│                               │                                      │
│                               ▼                                      │
│                      ┌──────────────────┐                           │
│                      │ user_project_    │                           │
│                      │ value_scores     │                           │
│                      └────────┬─────────┘                           │
│                               │                                      │
│                               ▼                                      │
│                      ┌──────────────────┐                           │
│                      │ /api/portal/     │                           │
│                      │ profile/[id]/    │                           │
│                      │ top-projects     │                           │
│                      └────────┬─────────┘                           │
│                               │                                      │
│                               ▼                                      │
│                      ┌──────────────────┐                           │
│                      │ ProfileTopProjects│                          │
│                      │ Component         │                          │
│                      └──────────────────┘                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Risk / Complexity Assessment

| Feature | Complexity | Risk | Notes |
|---------|------------|------|-------|
| **User Location** | 🟢 Low | 🟢 Low | Simple IP lookup, no PII stored |
| **User Activity Fetching** | 🟡 Medium | 🟡 Medium | API rate limits, cost per call |
| **Project Matching** | 🟡 Medium | 🟢 Low | Keyword/handle matching is deterministic |
| **Value Score Computation** | 🟡 Medium | 🟢 Low | Formula can be tuned iteratively |
| **Event Tracking** | 🟢 Low | 🟢 Low | Standard pattern, minimal data |
| **Traffic Attribution** | 🟢 Low | 🟢 Low | Simple ref param handling |
| **Top Projects API** | 🟢 Low | 🟢 Low | Straightforward DB query |
| **Profile UI Component** | 🟢 Low | 🟢 Low | Follows existing patterns |

### API Cost Considerations

| Operation | Estimated Calls/User | Notes |
|-----------|---------------------|-------|
| Initial 90d fetch | ~3-5 pages | One-time on first profile load |
| Daily refresh | 1-2 calls | Only for active users |
| Monthly estimate | ~50-100 calls/active user | Depends on tweet volume |

**Recommendation**: Implement with lazy loading and caching to minimize API costs.

---

## 6. Implementation Phases

### Phase 1: Foundation (1-2 days)
- [ ] Create `user_ct_activity` table
- [ ] Create `user_project_value_scores` table
- [ ] Create `akari_portal_events` table
- [ ] Add `country_code` to `akari_users`

### Phase 2: Data Pipeline (2-3 days)
- [ ] Implement user tweet fetching service
- [ ] Implement project matching logic
- [ ] Create value score computation cron job

### Phase 3: Event Tracking (1 day)
- [ ] Create `/api/portal/events/track` endpoint
- [ ] Add event tracking hook to portal pages
- [ ] Implement ref param handling

### Phase 4: API & UI (1-2 days)
- [ ] Create `/api/portal/profile/[userId]/top-projects` endpoint
- [ ] Build `ProfileTopProjects` component
- [ ] Integrate into `/portal/me.tsx`

### Phase 5: Location (0.5 day)
- [ ] Integrate GeoIP service
- [ ] Update auth flow to capture country

**Total Estimated Effort**: 6-9 days

---

## 7. Open Questions

1. **API Budget**: What's the acceptable TwitterAPI.io cost per month for this feature?
2. **Refresh Frequency**: How often should user activity be refreshed? (Daily? Weekly?)
3. **Historical Depth**: Should we backfill >90 days for power users?
4. **Privacy**: Should users be able to opt-out of activity tracking?
5. **Value Score Tuning**: Who will validate/tune the value score formula?

---

## 8. Conclusion

The feature set is **feasible** with the current architecture, requiring:

1. **3 new database tables** (user_ct_activity, user_project_value_scores, akari_portal_events)
2. **1 column addition** (country_code)
3. **New cron job** for value score computation
4. **TwitterAPI.io calls** for user tweet fetching (cost-sensitive)
5. **1 new API endpoint** and **1 new UI component**

The existing infrastructure (TwitterAPI.io client, auth system, profile page) provides a solid foundation. The main gaps are around **user-centric data storage** and **event tracking**, both of which are standard patterns with low implementation risk.

**Recommendation**: Proceed with Phase 1-4 first (skip location initially), validate the value score formula with real data, then add location tracking in a later iteration.

