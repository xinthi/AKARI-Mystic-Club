# ARC API Smoke Tests

**Version:** 1.0  
**Date:** 2025-01-XX  
**Base URL:** `https://your-domain.com` (or `http://localhost:3000` for local)

**Authentication:** All requests require `akari_session` cookie from browser session.

---

## Setup

### Get Session Token

1. Log in via browser
2. Open DevTools → Application → Cookies
3. Copy value of `akari_session` cookie
4. Use in curl commands: `-H "Cookie: akari_session=YOUR_SESSION_TOKEN"`

### Example Project/Program IDs

Replace these placeholders in commands:
- `{PROJECT_ID}` - Valid project UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- `{PROJECT_SLUG}` - Valid project slug (e.g., `ton-blockchain`)
- `{PROGRAM_ID}` - Valid program UUID
- `{CREATOR_PROFILE_ID}` - Valid creator profile UUID
- `{REQUEST_ID}` - Valid leaderboard request UUID

---

## 1. ARC Top Projects API

### GET `/api/portal/arc/top-projects`

**Description:** Returns top projects by growth percentage for heatmap.

**Query Params:**
- `mode`: `gainers` | `losers` (default: `gainers`)
- `timeframe`: `24h` | `7d` | `30d` | `90d` (default: `7d`)
- `limit`: number (default: 20, max: 50)

**Test 1.1: Get Gainers (7d)**
```bash
curl -X GET "https://your-domain.com/api/portal/arc/top-projects?mode=gainers&timeframe=7d&limit=20" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "ok": true,
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "display_name": "TON",
      "twitter_username": "ton_blockchain",
      "slug": "ton-blockchain",
      "growth_pct": 15.5,
      "arc_active": true,
      "arc_access_level": "leaderboard"
    }
  ],
  "lastUpdated": "2025-01-XXT12:00:00.000Z"
}
```

**Test 1.2: Get Losers (24h)**
```bash
curl -X GET "https://your-domain.com/api/portal/arc/top-projects?mode=losers&timeframe=24h&limit=10" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

**Test 1.3: Missing Auth (Negative)**
```bash
curl -X GET "https://your-domain.com/api/portal/arc/top-projects" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "Not authenticated"
}
```

**Test 1.4: Invalid Timeframe (Negative)**
```bash
curl -X GET "https://your-domain.com/api/portal/arc/top-projects?timeframe=invalid" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "Invalid timeframe"
}
```

---

## 2. ARC Leaderboard Requests API

### POST `/api/portal/arc/leaderboard-requests`

**Description:** Submit a leaderboard access request.

**Test 2.1: Submit Request**
```bash
curl -X POST "https://your-domain.com/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "{PROJECT_ID}",
    "justification": "I want to participate in this project's ARC leaderboard"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "requestId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "pending"
}
```

**Test 2.2: Duplicate Request (Negative)**
```bash
# Submit same request twice
curl -X POST "https://your-domain.com/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "{PROJECT_ID}",
    "justification": "Duplicate test"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "requestId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "existing"
}
```

**Test 2.3: Missing projectId (Negative)**
```bash
curl -X POST "https://your-domain.com/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "justification": "Test"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "projectId is required"
}
```

**Test 2.4: Invalid Project ID (Negative)**
```bash
curl -X POST "https://your-domain.com/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "invalid-uuid",
    "justification": "Test"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "Project not found"
}
```

---

## 3. Admin Leaderboard Requests API

### GET `/api/portal/admin/arc/leaderboard-requests`

**Description:** List all leaderboard requests (SuperAdmin only).

**Test 3.1: Get All Requests (SuperAdmin)**
```bash
curl -X GET "https://your-domain.com/api/portal/admin/arc/leaderboard-requests" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": true,
  "requests": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "project_id": "{PROJECT_ID}",
      "requested_by": "{PROFILE_ID}",
      "justification": "I want to participate",
      "status": "pending",
      "decided_by": null,
      "decided_at": null,
      "created_at": "2025-01-XXT12:00:00.000Z",
      "updated_at": "2025-01-XXT12:00:00.000Z",
      "project": {
        "id": "{PROJECT_ID}",
        "name": "TON",
        "display_name": "TON Blockchain",
        "slug": "ton-blockchain",
        "twitter_username": "ton_blockchain"
      },
      "requester": {
        "id": "{PROFILE_ID}",
        "username": "creator_username",
        "display_name": "Creator Name"
      }
    }
  ]
}
```

**Test 3.2: Non-SuperAdmin (Negative)**
```bash
# Use session token from non-admin user
curl -X GET "https://your-domain.com/api/portal/admin/arc/leaderboard-requests" \
  -H "Cookie: akari_session=NON_ADMIN_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "SuperAdmin only"
}
```

---

### PATCH `/api/portal/admin/arc/leaderboard-requests/[id]`

**Description:** Approve or reject a leaderboard request (SuperAdmin only).

**Test 3.3: Approve Request**
```bash
curl -X PATCH "https://your-domain.com/api/portal/admin/arc/leaderboard-requests/{REQUEST_ID}" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "arc_access_level": "leaderboard"
  }'
```

**Expected Response:**
```json
{
  "ok": true
}
```

**Verify:** Check database - `projects.arc_active = true` and `projects.arc_access_level = 'leaderboard'` for the project.

**Test 3.4: Reject Request**
```bash
curl -X PATCH "https://your-domain.com/api/portal/admin/arc/leaderboard-requests/{REQUEST_ID}" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "rejected"
  }'
```

**Expected Response:**
```json
{
  "ok": true
}
```

**Test 3.5: Approve Without arc_access_level (Negative)**
```bash
curl -X PATCH "https://your-domain.com/api/portal/admin/arc/leaderboard-requests/{REQUEST_ID}" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "arc_access_level is required when approving (must be \"leaderboard\" or \"gamified\")"
}
```

**Test 3.6: Invalid Status (Negative)**
```bash
curl -X PATCH "https://your-domain.com/api/portal/admin/arc/leaderboard-requests/{REQUEST_ID}" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "invalid"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "status must be \"approved\" or \"rejected\""
}
```

---

## 4. Creator Manager Programs API

### GET `/api/portal/creator-manager/programs`

**Description:** List programs for projects user can manage.

**Test 4.1: Get Programs**
```bash
curl -X GET "https://your-domain.com/api/portal/creator-manager/programs?projectId={PROJECT_ID}" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": true,
  "programs": [
    {
      "id": "{PROGRAM_ID}",
      "project_id": "{PROJECT_ID}",
      "title": "Q1 Creator Program",
      "description": "Program description",
      "visibility": "public",
      "status": "active",
      "start_at": "2025-01-01T00:00:00.000Z",
      "end_at": "2025-01-31T23:59:59.999Z",
      "created_at": "2025-01-01T00:00:00.000Z",
      "stats": {
        "totalCreators": 10,
        "approvedCreators": 8,
        "totalArcPoints": 5000
      }
    }
  ]
}
```

**Test 4.2: Get Programs Without Permission (Negative)**
```bash
# Use session token from user who doesn't own the project
curl -X GET "https://your-domain.com/api/portal/creator-manager/programs?projectId={PROJECT_ID}" \
  -H "Cookie: akari_session=UNAUTHORIZED_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "You do not have permission to view programs for this project"
}
```

---

### POST `/api/portal/creator-manager/programs`

**Description:** Create a new Creator Manager program.

**Test 4.3: Create Program**
```bash
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "{PROJECT_ID}",
    "title": "Q1 Creator Program",
    "description": "Test program description",
    "visibility": "public",
    "startAt": "2025-01-01T00:00:00.000Z",
    "endAt": "2025-01-31T23:59:59.999Z"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "programs": [
    {
      "id": "{PROGRAM_ID}",
      "project_id": "{PROJECT_ID}",
      "title": "Q1 Creator Program",
      "description": "Test program description",
      "visibility": "public",
      "status": "active",
      "start_at": "2025-01-01T00:00:00.000Z",
      "end_at": "2025-01-31T23:59:59.999Z",
      "created_at": "2025-01-XXT12:00:00.000Z",
      "stats": {
        "totalCreators": 0,
        "approvedCreators": 0,
        "totalArcPoints": 0
      }
    }
  ]
}
```

**Test 4.4: Create Program Missing Required Fields (Negative)**
```bash
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Program"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "projectId and title are required"
}
```

**Test 4.5: Invalid Visibility (Negative)**
```bash
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "{PROJECT_ID}",
    "title": "Test Program",
    "visibility": "invalid"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "visibility must be private, public, or hybrid"
}
```

---

### GET `/api/portal/creator-manager/programs/[programId]`

**Description:** Get program details.

**Test 4.6: Get Program Details**
```bash
curl -X GET "https://your-domain.com/api/portal/creator-manager/programs/{PROGRAM_ID}" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": true,
  "program": {
    "id": "{PROGRAM_ID}",
    "project_id": "{PROJECT_ID}",
    "title": "Q1 Creator Program",
    "description": "Program description",
    "visibility": "public",
    "status": "active",
    "start_at": "2025-01-01T00:00:00.000Z",
    "end_at": "2025-01-31T23:59:59.999Z",
    "created_at": "2025-01-01T00:00:00.000Z",
    "stats": {
      "totalCreators": 10,
      "approvedCreators": 8,
      "pendingCreators": 2,
      "totalArcPoints": 5000,
      "totalXp": 10000
    }
  }
}
```

---

## 5. Creator Manager Creators API

### POST `/api/portal/creator-manager/programs/[programId]/creators/invite`

**Description:** Invite creators to a program (Admin/Moderator only).

**Test 5.1: Invite Creators by Twitter Username**
```bash
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs/{PROGRAM_ID}/creators/invite" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twitterUsernames": ["creator1", "creator2"]
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "invited": 2,
  "message": "2 creators invited successfully"
}
```

**Test 5.2: Invite Creators by Profile ID**
```bash
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs/{PROGRAM_ID}/creators/invite" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "profileIds": ["{CREATOR_PROFILE_ID}"]
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "invited": 1,
  "message": "1 creators invited successfully"
}
```

**Test 5.3: Invite Without Permission (Negative)**
```bash
# Use session token from non-admin user
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs/{PROGRAM_ID}/creators/invite" \
  -H "Cookie: akari_session=UNAUTHORIZED_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "twitterUsernames": ["creator1"]
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "You do not have permission to invite creators to this program"
}
```

---

### POST `/api/portal/creator-manager/programs/[programId]/creators/apply`

**Description:** Apply to a public/hybrid program (Creator only).

**Test 5.4: Apply to Program**
```bash
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs/{PROGRAM_ID}/creators/apply" \
  -H "Cookie: akari_session=CREATOR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Application submitted successfully"
}
```

**Test 5.5: Apply to Private Program (Negative)**
```bash
# Try to apply to a private program
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs/{PRIVATE_PROGRAM_ID}/creators/apply" \
  -H "Cookie: akari_session=CREATOR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "This program is not open for applications"
}
```

**Test 5.6: Apply Without Creator Role (Negative)**
```bash
# Use session token from non-creator user
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs/{PROGRAM_ID}/creators/apply" \
  -H "Cookie: akari_session=NON_CREATOR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "You must be a creator to apply to programs"
}
```

---

### POST `/api/portal/creator-manager/programs/[programId]/creators/[creatorProfileId]/status`

**Description:** Update creator status (Admin/Moderator only).

**Test 5.7: Approve Creator**
```bash
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs/{PROGRAM_ID}/creators/{CREATOR_PROFILE_ID}/status" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "dealId": "{DEAL_ID}"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Creator status updated to approved"
}
```

**Test 5.8: Reject Creator**
```bash
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs/{PROGRAM_ID}/creators/{CREATOR_PROFILE_ID}/status" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "rejected"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Creator status updated to rejected"
}
```

**Test 5.9: Invalid Status (Negative)**
```bash
curl -X POST "https://your-domain.com/api/portal/creator-manager/programs/{PROGRAM_ID}/creators/{CREATOR_PROFILE_ID}/status" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "invalid"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "status must be pending, approved, rejected, or removed"
}
```

---

## 6. ARC Project Leaderboard API

### GET `/api/portal/arc/projects/[projectId]/leaderboard`

**Description:** Get leaderboard for a project (requires `arc_access_level` in `['leaderboard', 'gamified']`).

**Test 6.1: Get Leaderboard**
```bash
curl -X GET "https://your-domain.com/api/portal/arc/projects/{PROJECT_ID}/leaderboard" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": true,
  "entries": [
    {
      "creator_profile_id": "{CREATOR_PROFILE_ID}",
      "twitter_username": "creator1",
      "avatar_url": "https://...",
      "total_arc_points": 1000,
      "xp": 5000,
      "level": 5,
      "class": "narrative_master"
    }
  ]
}
```

**Test 6.2: Project Without Leaderboard Access (Negative)**
```bash
# Use project with arc_access_level='none' or 'creator_manager'
curl -X GET "https://your-domain.com/api/portal/arc/projects/{PROJECT_ID_WITHOUT_LEADERBOARD}/leaderboard" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "Project does not have leaderboard access enabled"
}
```

**Test 6.3: Invalid Project ID (Negative)**
```bash
curl -X GET "https://your-domain.com/api/portal/arc/projects/invalid-uuid/leaderboard" \
  -H "Cookie: akari_session=YOUR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "Project not found"
}
```

---

## 7. Admin Projects Classification API

### POST `/api/portal/admin/projects/classify`

**Description:** Classify project and set ARC settings (SuperAdmin only).

**Test 7.1: Classify Project**
```bash
curl -X POST "https://your-domain.com/api/portal/admin/projects/classify" \
  -H "Cookie: akari_session=SUPERADMIN_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "{PROJECT_ID}",
    "profileType": "project",
    "isCompany": false,
    "arcAccessLevel": "leaderboard",
    "arcActive": true
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "project": {
    "id": "{PROJECT_ID}",
    "profile_type": "project",
    "is_company": false,
    "arc_access_level": "leaderboard",
    "arc_active": true
  }
}
```

**Test 7.2: Invalid arcAccessLevel (Negative)**
```bash
curl -X POST "https://your-domain.com/api/portal/admin/projects/classify" \
  -H "Cookie: akari_session=SUPERADMIN_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "{PROJECT_ID}",
    "profileType": "project",
    "arcAccessLevel": "invalid"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "arcAccessLevel must be \"none\", \"creator_manager\", \"leaderboard\", or \"gamified\""
}
```

**Test 7.3: Non-SuperAdmin (Negative)**
```bash
curl -X POST "https://your-domain.com/api/portal/admin/projects/classify" \
  -H "Cookie: akari_session=NON_ADMIN_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "{PROJECT_ID}",
    "profileType": "project"
  }'
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "SuperAdmin only"
}
```

---

## 8. My Creator Programs API

### GET `/api/portal/creator-manager/my-programs`

**Description:** Get programs where current user is a creator.

**Test 8.1: Get My Programs**
```bash
curl -X GET "https://your-domain.com/api/portal/creator-manager/my-programs" \
  -H "Cookie: akari_session=CREATOR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": true,
  "programs": [
    {
      "id": "{PROGRAM_ID}",
      "project_id": "{PROJECT_ID}",
      "title": "Q1 Creator Program",
      "status": "active",
      "creator_status": "approved",
      "arc_points": 500,
      "xp": 1000,
      "level": 3,
      "class": "narrative_master"
    }
  ]
}
```

**Test 8.2: Non-Creator (Negative)**
```bash
curl -X GET "https://your-domain.com/api/portal/creator-manager/my-programs" \
  -H "Cookie: akari_session=NON_CREATOR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "You must be a creator to view your programs"
}
```

---

## Test Summary

### Positive Tests (Happy Path)
- [ ] Test 1.1: Get Top Projects (Gainers)
- [ ] Test 1.2: Get Top Projects (Losers)
- [ ] Test 2.1: Submit Leaderboard Request
- [ ] Test 3.1: Get All Requests (SuperAdmin)
- [ ] Test 3.3: Approve Request
- [ ] Test 3.4: Reject Request
- [ ] Test 4.1: Get Programs
- [ ] Test 4.3: Create Program
- [ ] Test 4.6: Get Program Details
- [ ] Test 5.1: Invite Creators
- [ ] Test 5.4: Apply to Program
- [ ] Test 5.7: Approve Creator
- [ ] Test 6.1: Get Leaderboard
- [ ] Test 7.1: Classify Project
- [ ] Test 8.1: Get My Programs

### Negative Tests (Error Handling)
- [ ] Test 1.3: Missing Auth
- [ ] Test 1.4: Invalid Timeframe
- [ ] Test 2.2: Duplicate Request
- [ ] Test 2.3: Missing projectId
- [ ] Test 2.4: Invalid Project ID
- [ ] Test 3.2: Non-SuperAdmin Access
- [ ] Test 3.5: Approve Without arc_access_level
- [ ] Test 3.6: Invalid Status
- [ ] Test 4.2: Get Programs Without Permission
- [ ] Test 4.4: Create Program Missing Fields
- [ ] Test 4.5: Invalid Visibility
- [ ] Test 5.3: Invite Without Permission
- [ ] Test 5.5: Apply to Private Program
- [ ] Test 5.6: Apply Without Creator Role
- [ ] Test 5.9: Invalid Status
- [ ] Test 6.2: Project Without Leaderboard Access
- [ ] Test 6.3: Invalid Project ID
- [ ] Test 7.2: Invalid arcAccessLevel
- [ ] Test 7.3: Non-SuperAdmin Classification
- [ ] Test 8.2: Non-Creator Access

---

## Notes

- All API endpoints return `ok: true` on success, `ok: false` on failure
- Error messages are user-friendly and descriptive
- Authentication is required for all endpoints (except public read-only if applicable)
- Role-based access control is enforced server-side
- All UUIDs must be valid format
- All dates must be ISO 8601 format

---

## Sign-off

**Tester:** _________________  
**Date:** _________________  
**Status:** ☐ PASS  ☐ FAIL  ☐ BLOCKED

