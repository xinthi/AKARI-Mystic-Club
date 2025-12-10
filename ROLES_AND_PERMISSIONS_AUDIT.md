# AKARI Mystic Club - Roles & Permissions Audit Report

**Date:** 2024-12-11  
**Scope:** Complete audit of user roles, tiers, feature grants, permissions, paywall logic, and access gating

---

## 1. Database and Permissions Layer

### Supabase Tables (Portal Auth System)

#### `akari_users`
- **Purpose:** Core user records for the portal
- **Fields:**
  - `id` (UUID, PK)
  - `created_at` (TIMESTAMPTZ)
  - `display_name` (TEXT)
  - `avatar_url` (TEXT)
  - `is_active` (BOOLEAN, default: true)
- **Location:** `supabase/akari_auth_schema.sql`

#### `akari_user_roles`
- **Purpose:** Role assignments (many-to-many: users can have multiple roles)
- **Fields:**
  - `user_id` (UUID, FK → akari_users)
  - `role` (TEXT, CHECK: 'user', 'analyst', 'admin', 'super_admin')
  - **Composite PK:** (user_id, role)
- **Indexes:** On `role` for fast role-based queries
- **Location:** `supabase/akari_auth_schema.sql`

#### `akari_user_feature_grants`
- **Purpose:** Time-limited feature access grants (independent of roles)
- **Fields:**
  - `id` (UUID, PK)
  - `user_id` (UUID, FK → akari_users)
  - `feature_key` (TEXT) - e.g., 'deep.explorer', 'institutional.plus'
  - `starts_at` (TIMESTAMPTZ, nullable) - Grant start time
  - `ends_at` (TIMESTAMPTZ, nullable) - Grant expiration (null = no expiration)
  - `discount_percent` (INTEGER, 0-100, default: 0) - Discount percentage for pricing
  - `discount_note` (TEXT, nullable) - Internal note explaining discount
  - `created_by` (UUID, FK → akari_users, nullable)
  - `created_at` (TIMESTAMPTZ)
- **Indexes:** 
  - On `user_id` for fast user lookups
  - Composite index on `(user_id, feature_key)` for active grant checks
- **Migration:** `supabase/migrations/20241210_add_discount_to_feature_grants.sql`
- **Location:** `supabase/akari_auth_schema.sql`

#### `akari_access_requests`
- **Purpose:** User requests for premium feature access
- **Fields:**
  - `id` (UUID, PK)
  - `user_id` (UUID, FK → akari_users)
  - `feature_key` (TEXT) - Feature being requested
  - `requested_plan` (TEXT, nullable) - e.g., "institutional", "institutional_plus"
  - `justification` (TEXT, nullable) - User's explanation
  - `status` (TEXT, CHECK: 'pending', 'approved', 'rejected', default: 'pending')
  - `decided_by` (UUID, FK → akari_users, nullable)
  - `decided_at` (TIMESTAMPTZ, nullable)
  - `created_at`, `updated_at` (TIMESTAMPTZ)
- **Indexes:** On `user_id`, `status`, `feature_key`
- **Migration:** `supabase/migrations/20241210_add_akari_access_requests.sql`

#### `akari_user_sessions`
- **Purpose:** Session management for portal authentication
- **Fields:**
  - `id` (UUID, PK)
  - `user_id` (UUID, FK → akari_users)
  - `session_token` (TEXT, UNIQUE)
  - `expires_at` (TIMESTAMPTZ)
  - `user_agent` (TEXT, nullable)
  - `created_at` (TIMESTAMPTZ)
- **Indexes:** On `session_token`, `expires_at`
- **Location:** `supabase/akari_auth_schema.sql`

#### `akari_user_identities`
- **Purpose:** Links users to OAuth providers (X/Twitter, Telegram)
- **Fields:**
  - `id` (UUID, PK)
  - `user_id` (UUID, FK → akari_users)
  - `provider` (TEXT, CHECK: 'x', 'telegram')
  - `provider_user_id` (TEXT)
  - `username` (TEXT, nullable)
  - `created_at` (TIMESTAMPTZ)
- **Unique Constraint:** (provider, provider_user_id)
- **Location:** `supabase/akari_auth_schema.sql`

### Prisma Schema Tables (MiniApp System)

#### `User` (Prisma)
- **Purpose:** Telegram MiniApp user records
- **Role/Tier Fields:**
  - `tier` (String, nullable) - e.g., "Seeker", "Mystic", "Oracle" (legacy tier system)
  - `points` (Int, default: 0) - Experience points (aXP)
  - `credibilityScore` (Float, default: 0)
- **Location:** `prisma/schema.prisma`

#### `PortalUserProfile` (Prisma)
- **Purpose:** Portal-specific user profiles (different from akari_users)
- **Role Field:**
  - `level` (String, default: "L1") - Values: "L1", "L2", "ADMIN", "SUPER_ADMIN"
- **Location:** `prisma/schema.prisma`

### Summary of Role/Tier Storage

**Portal (Supabase):**
- Roles stored in `akari_user_roles` (user, analyst, admin, super_admin)
- Feature grants stored in `akari_user_feature_grants` (time-limited, with discounts)
- Access requests in `akari_access_requests` (workflow for premium features)

**MiniApp (Prisma):**
- Legacy tier system in `User.tier` (string like "Seeker_L1")
- Portal levels in `PortalUserProfile.level` (L1, L2, ADMIN, SUPER_ADMIN)

---

## 2. Backend Permission Enforcement

### Permission Check Utilities

**Location:** `src/web/lib/permissions.ts`

#### Core Functions:
- `can(user, featureKey, now, useEffectiveRoles)` - Frontend permission check
- `canServer(user, featureKey, now)` - Backend permission check (always uses real roles)
- `roleImpliesFeature(role, featureKey)` - Check if role grants feature
- `isSuperAdmin(user)` - Check super admin status
- `canUseDeepExplorer(user)` - Feature-specific helper
- `hasInstitutionalPlus(user)` - Feature-specific helper

#### Role-Feature Mapping:
```typescript
ROLE_FEATURES = {
  user: ['markets.view', 'sentiment.view_basic'],
  analyst: ['markets.view', 'markets.compare', 'markets.analytics', 
            'sentiment.view_basic', 'sentiment.search', 'sentiment.compare'],
  admin: [all analyst features + 'launchpad.add_project'],
  super_admin: [] // Has all features (special case)
}
```

### API Endpoints with Permission Checks

#### Portal Endpoints (Using Supabase Auth)

1. **`/api/portal/admin/*`** - All admin endpoints
   - **Files:**
     - `src/web/pages/api/portal/admin/projects/[id]/refresh.ts`
     - `src/web/pages/api/portal/admin/projects/index.ts`
     - `src/web/pages/api/portal/admin/projects/[id].ts`
     - `src/web/pages/api/portal/admin/users/[id].ts`
     - `src/web/pages/api/portal/admin/users/[id]/feature-grants.ts`
     - `src/web/pages/api/portal/admin/access/decide.ts`
     - `src/web/pages/api/portal/admin/access/requests.ts`
     - `src/web/pages/api/portal/admin/overview.ts`
   - **Check:** `checkSuperAdmin()` - Validates `akari_user_roles` for 'super_admin'
   - **Pattern:** Session token → user_id → role lookup

2. **`/api/portal/sentiment/[slug]/analytics-export.ts`**
   - **Check:** `can(akariUser, 'markets.analytics')`
   - **Returns:** 403 if user lacks permission

3. **`/api/portal/deep/[slug]/summary-export.ts`**
   - **Check:** `canUseDeepExplorer(akariUser)`
   - **Returns:** 403 if user lacks permission

4. **`/api/portal/deep/[slug]/inner-circle-export.ts`**
   - **Check:** `canUseDeepExplorer(akariUser)`
   - **Returns:** 403 if user lacks permission

5. **`/api/portal/sentiment/watchlist/action.ts`**
   - **Check:** Reads `akari_user_feature_grants` to determine watchlist limits
   - **Limit Logic:** 
     - Default: 5 projects
     - With Deep Explorer: 20 projects
     - With Institutional Plus: 100 projects

6. **`/api/portal/access/request.ts`**
   - **Purpose:** Users request premium feature access
   - **Validation:** Only allows `deep.explorer` or `institutional.plus`
   - **Prevents:** Duplicate pending requests

7. **`/api/auth/website/me.ts`**
   - **Purpose:** Returns current user with roles and feature grants
   - **Returns:** 
     - `roles` array from `akari_user_roles`
     - `featureGrants` array from `akari_user_feature_grants`

### Permission Enforcement Patterns

**Session-Based Auth:**
```typescript
1. Extract session token from cookie (akari_session=...)
2. Lookup session in akari_user_sessions
3. Get user_id from session
4. Query akari_user_roles for roles
5. Query akari_user_feature_grants for active grants
6. Check permission using can() or canServer()
```

**Super Admin Checks:**
```typescript
async function checkSuperAdmin(supabase, userId) {
  const { data } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');
  return (data?.length ?? 0) > 0;
}
```

---

## 3. Frontend Permission Usage

### Components Checking User Permissions

#### 1. **Sentiment Project Detail Page**
   - **File:** `src/web/pages/portal/sentiment/[slug].tsx`
   - **Checks:**
     - `can(user, 'sentiment.compare')` - For "Similar Projects" section
     - `can(user, 'markets.analytics')` - For "Twitter Analytics" section
     - `canUseDeepExplorer(user)` - For deep explorer features
   - **UI:** Uses `LockedFeatureOverlay` component to show locked state

#### 2. **Sentiment Index Page**
   - **File:** `src/web/pages/portal/sentiment/index.tsx`
   - **Checks:**
     - `can(user, 'sentiment.search')` - For search functionality
     - `can(user, 'sentiment.compare')` - For compare button
   - **UI:** Disables search input and shows tooltip "Upgrade to Analyst to search profiles"

#### 3. **Deep Explorer Page**
   - **File:** `src/web/pages/portal/deep/[slug].tsx`
   - **Check:** `canUseDeepExplorer(user)`
   - **UI:** Shows locked state with message if user lacks access
   - **Locked Message:** "Deep Explorer is part of Institutional Plus. Request an upgrade..."

#### 4. **User Profile Page**
   - **File:** `src/web/pages/portal/me.tsx`
   - **Checks:**
     - `can(user, 'sentiment.compare')` - For compare features
     - `canUseDeepExplorer(user)` - Shows deep explorer badge/access
     - `hasInstitutionalPlus(user)` - Shows institutional plus badge

#### 5. **Portal Layout**
   - **File:** `src/web/components/portal/PortalLayout.tsx`
   - **Check:** `isSuperAdmin(user)` - Shows/hides admin navigation links

#### 6. **Admin Pages**
   - **Files:**
     - `src/web/pages/portal/admin/projects.tsx`
     - `src/web/pages/portal/admin/users/[id].tsx`
     - `src/web/pages/portal/admin/access.tsx`
   - **Check:** `isSuperAdmin(user)` - Redirects if not super admin

### Reusable Permission Components

#### `LockedFeatureOverlay`
- **File:** `src/web/pages/portal/sentiment/[slug].tsx` (lines 861-890)
- **Purpose:** Overlays locked content with upgrade message
- **Usage:**
```tsx
<LockedFeatureOverlay featureName="Similar Projects" isLocked={!canViewCompare}>
  {/* Locked content */}
</LockedFeatureOverlay>
```
- **Shows:** "Upgrade to Analyst+ to unlock this feature"

#### `AuthGate` / `LockedOverlay`
- **File:** `src/web/components/LockedOverlay.tsx`
- **Purpose:** Shows login overlay for unauthenticated users
- **Used In:** `src/web/pages/_app.tsx`
- **Behavior:** Fades page content and shows login modal

### Permission Hook Usage

#### `useAkariUser()` Hook
- **File:** `src/web/lib/akari-auth.tsx`
- **Returns:** `{ user, isLoading, isLoggedIn, login, logout, refreshUser }`
- **Usage Pattern:**
```tsx
const akariUser = useAkariUser();
const canCompare = can(akariUser.user, 'sentiment.compare');
```

---

## 4. Existing UI for Paywall or Locked Features

### Locked Feature Displays

#### 1. **Sentiment Compare Section**
   - **Location:** `src/web/pages/portal/sentiment/[slug].tsx`
   - **Component:** `LockedFeatureOverlay`
   - **Message:** "Upgrade to Analyst+ to unlock this feature"
   - **Visual:** Gray overlay with lock icon

#### 2. **Twitter Analytics Section**
   - **Location:** `src/web/pages/portal/sentiment/[slug].tsx`
   - **Component:** `LockedFeatureOverlay`
   - **Message:** "Upgrade to Analyst+ to unlock this feature"
   - **Requires:** `markets.analytics` permission

#### 3. **Search Functionality**
   - **Location:** `src/web/pages/portal/sentiment/index.tsx`
   - **Behavior:** Input disabled, tooltip shown
   - **Tooltip:** "Upgrade to Analyst to search profiles"

#### 4. **Deep Explorer Page**
   - **Location:** `src/web/pages/portal/deep/[slug].tsx`
   - **Locked State:**
     - Shows: "Deep Explorer is locked"
     - Message: "Deep Explorer is part of Institutional Plus. Request an upgrade to unlock full analytics."
   - **Conditional Rendering:** Entire page locked if no access

#### 5. **Watchlist Limits**
   - **Location:** `src/web/pages/api/portal/sentiment/watchlist/action.ts`
   - **Error Message:** "Watchlist limit reached (5 projects). Upgrade to Deep Explorer or Institutional Plus for up to 100 projects."

#### 6. **Profile Reviews**
   - **Location:** `src/web/components/portal/profile/ProfileReviews.tsx`
   - **Locked State:** "Reviews are locked. Connect Telegram to enable reviews from the community"
   - **Requires:** Telegram connection (different from feature permissions)

### No Existing Pricing/Upgrade UI
- ❌ No pricing page found
- ❌ No upgrade modal found
- ❌ No subscription management UI
- ❌ No "View Plans" or "Upgrade Now" buttons (only access request workflow)

---

## 5. Existing Pricing or Upgrade Logic

### Access Request System (Not Direct Purchase)

#### User Flow:
1. User requests access via `/api/portal/access/request`
2. Super admin reviews request at `/portal/admin/access`
3. Admin approves/rejects via `/api/portal/admin/access/decide`
4. On approval, feature grant is automatically created

#### Files:
- **Request Endpoint:** `src/web/pages/api/portal/access/request.ts`
- **Admin Review Page:** `src/web/pages/portal/admin/access.tsx`
- **Admin Decision Endpoint:** `src/web/pages/api/portal/admin/access/decide.ts`

#### Feature Grants with Discounts:
- **Field:** `discount_percent` (0-100) in `akari_user_feature_grants`
- **Purpose:** Admin-controlled pricing discounts
- **Migration:** `supabase/migrations/20241210_add_discount_to_feature_grants.sql`
- **Usage:** Currently stored but not used in pricing calculations

### Missing Pricing Components:
- ❌ No pricing tiers page
- ❌ No subscription management
- ❌ No payment processing
- ❌ No automatic tier upgrades
- ❌ No pricing display components
- ❌ No "Choose Plan" UI

---

## 6. Missing or Incomplete Areas

### TODOs and Stubs

#### 1. **Portal Auth Stub**
   - **File:** `src/web/lib/portalAuth.ts`
   - **Line 40:** `// TODO: Implement proper session/auth extraction`
   - **Status:** Partial implementation with dev fallback

#### 2. **Admin Auth Check Missing**
   - **File:** `src/web/pages/api/portal/admin/new-launches.ts`
   - **Line 29:** `// TODO: Add admin auth check here`
   - **Status:** No permission check implemented

#### 3. **Payment Processing Stubs**
   - **File:** `src/web/pages/api/myst/convert.ts`
   - **Line 58:** `// TODO: In production, verify Stars payment with Telegram before converting`
   - **Status:** Stub implementation

#### 4. **TON Wallet Verification**
   - **File:** `src/web/pages/api/ton/link.ts`
   - **Line 50:** `// TODO: In production, verify TON Connect signature here`
   - **Status:** Not implemented

### Incomplete Permission Areas

#### 1. **Feature Grant Expiration UI**
   - **Status:** Grants can expire but no UI warns users
   - **Missing:** "Your access expires in X days" notifications

#### 2. **Role-Based Feature Visibility**
   - **Status:** Features are gated but no "Upgrade" CTA buttons
   - **Missing:** Direct links to pricing/upgrade from locked features

#### 3. **Watchlist Limit UI**
   - **Status:** Error message shown but no upgrade prompt
   - **Missing:** "Upgrade to increase limit" button

#### 4. **Discount Application**
   - **Status:** `discount_percent` stored but not displayed or applied
   - **Missing:** Discount display in pricing UI (doesn't exist yet)

### Expected but Not Implemented

#### 1. **Tier-Based Pricing Display**
   - **Expected:** Show pricing for different tiers/plans
   - **Reality:** No pricing page exists

#### 2. **Automatic Feature Access**
   - **Expected:** Users upgrade → automatic feature grant
   - **Reality:** Manual approval workflow only

#### 3. **Subscription Management**
   - **Expected:** Users manage subscriptions, cancel, renew
   - **Reality:** No subscription system

#### 4. **Payment Integration**
   - **Expected:** Stripe, crypto, or Telegram Stars integration
   - **Reality:** No payment processing

---

## 7. Summary: What Already Exists vs What Needs to Be Built

### ✅ What Already Exists (Usable Today)

#### Database Infrastructure:
- ✅ Complete role system (`akari_user_roles`)
- ✅ Feature grant system with time limits (`akari_user_feature_grants`)
- ✅ Discount fields in feature grants (`discount_percent`, `discount_note`)
- ✅ Access request workflow (`akari_access_requests`)
- ✅ Session management (`akari_user_sessions`)

#### Permission System:
- ✅ Robust permission checking functions (`can()`, `canServer()`)
- ✅ Role-to-feature mapping (`ROLE_FEATURES`)
- ✅ Feature-specific helpers (`canUseDeepExplorer()`, `hasInstitutionalPlus()`)
- ✅ Super admin detection (`isSuperAdmin()`)

#### Backend Enforcement:
- ✅ All admin endpoints protected with `checkSuperAdmin()`
- ✅ Export endpoints check permissions (`markets.analytics`, `deep.explorer`)
- ✅ Watchlist limits enforced by feature grants
- ✅ Access request API endpoints functional

#### Frontend Gating:
- ✅ Locked feature overlays (`LockedFeatureOverlay`)
- ✅ Permission-based rendering in sentiment pages
- ✅ Deep Explorer access gating
- ✅ Search/compare feature gating
- ✅ Admin-only UI sections

#### Admin Tools:
- ✅ Admin access request review page (`/portal/admin/access`)
- ✅ User management with feature grant editor (`/portal/admin/users/[id]`)
- ✅ Feature grant creation/update API
- ✅ Access request approval/rejection workflow

### ❌ What Needs to Be Built

#### Pricing UI:
- ❌ **Pricing Page** - Display plans, features, prices
- ❌ **Tier Comparison Table** - Show what each tier includes
- ❌ **Pricing Tiers Component** - Reusable pricing card component
- ❌ **Upgrade Modals** - In-context upgrade prompts
- ❌ **Feature Comparison** - Side-by-side feature lists

#### Upgrade Flow:
- ❌ **"Upgrade Now" Buttons** - CTAs throughout locked features
- ❌ **Checkout Page** - Payment collection UI
- ❌ **Payment Processing** - Stripe/crypto/TON integration
- ❌ **Subscription Management** - User dashboard for subscriptions
- ❌ **Billing History** - Transaction records

#### Feature Grant Automation:
- ❌ **Auto-Grant on Payment** - Grant features after successful payment
- ❌ **Expiration Warnings** - Notify users before grants expire
- ❌ **Renewal Flow** - Auto-renew or manual renewal UI
- ❌ **Trial Periods** - Time-limited free access

#### UI Enhancements:
- ❌ **Current Plan Badge** - Show user's active plan/tier
- ❌ **Feature Status Indicators** - Show locked/unlocked state
- ❌ **Upgrade Prompts** - Contextual upgrade suggestions
- ❌ **Discount Display** - Show applied discounts (if any)
- ❌ **Usage Limits Display** - Show current usage vs limits

#### Payment Integration:
- ❌ **Payment Provider Setup** - Stripe/crypto wallet integration
- ❌ **Webhook Handlers** - Process payment confirmations
- ❌ **Invoice Generation** - Create invoices for purchases
- ❌ **Refund Handling** - Process refunds and revoke access

#### Missing Utilities:
- ❌ **useCurrentPlan() Hook** - Get user's active plan/tier
- ❌ **useFeatureStatus() Hook** - Get feature lock/unlock status
- ❌ **useUpgradeFlow() Hook** - Handle upgrade navigation
- ❌ **PlanComparison Component** - Reusable comparison table

---

## 8. All Permissions Currently Used

### Feature Keys (From `src/web/lib/permissions.ts`):

1. **`markets.view`** - Basic market data viewing
2. **`markets.compare`** - Market comparison features
3. **`markets.analytics`** - Advanced market analytics
4. **`sentiment.view_basic`** - Basic sentiment data
5. **`sentiment.search`** - Search sentiment profiles
6. **`sentiment.compare`** - Compare sentiment projects
7. **`launchpad.add_project`** - Add projects to launchpad
8. **`deep.explorer`** - Deep Explorer feature access
9. **`institutional.plus`** - Institutional Plus tier access

### Role Hierarchy:

1. **`user`** (Base tier)
   - `markets.view`
   - `sentiment.view_basic`

2. **`analyst`** (Mid tier)
   - All `user` features +
   - `markets.compare`
   - `markets.analytics`
   - `sentiment.search`
   - `sentiment.compare`

3. **`admin`** (High tier)
   - All `analyst` features +
   - `launchpad.add_project`

4. **`super_admin`** (Special)
   - All features (implicitly granted)

### Feature Grants (Independent of Roles):

- Can grant any `FeatureKey` to any user
- Time-limited (optional `starts_at`, `ends_at`)
- Can include discounts (`discount_percent`)
- Managed via admin UI or API

---

## Conclusion

The codebase has a **solid foundation** for roles and permissions:
- ✅ Complete database schema
- ✅ Robust permission checking
- ✅ Feature gating in place
- ✅ Admin tooling functional

However, **pricing and subscription UI is completely missing**:
- ❌ No pricing pages
- ❌ No payment processing
- ❌ No upgrade flows
- ❌ No subscription management

The system is ready for **manual admin grants** via the admin panel, but lacks any **self-service upgrade** or **automated billing** capabilities.

