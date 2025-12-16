# Creator Manager UI Implementation Notes

## Pages Created

### Project Admin Side

1. **`/portal/arc/creator-manager`** - List projects with Creator Manager programs
   - Shows all projects where user is owner/admin/moderator
   - Lists programs for each project
   - "Create Program" button for each project

2. **`/portal/arc/creator-manager/create`** - Create new program (TODO: implement form)
   - Form fields: project, title, description, visibility, startAt, endAt
   - POST to `/api/portal/creator-manager/programs`

3. **`/portal/arc/creator-manager/[programId]`** - Program detail page (TODO: implement)
   - Tabs: Creators, Deals, Missions
   - Creators tab: Table with invite/status/deal assignment
   - Deals tab: List deals, add new deal
   - Missions tab: Placeholder for now

### Creator Side

4. **`/portal/arc/my-creator-programs`** - Creator's programs view (TODO: implement)
   - Shows programs where creator is a member
   - Shows public/hybrid programs they can apply to
   - Display ARC points, XP, status, deal label
   - Apply button for applicable programs

## Navigation

Add to PortalLayout or ARC menu:
- **For Project Admins**: "Creator Manager" link (if user has project admin access)
- **For Creators**: "My Creator Programs" link (if user has creator role)

## API Usage Examples

### Create Program
```typescript
const res = await fetch('/api/portal/creator-manager/programs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: '...',
    title: 'Q1 Creator Program',
    description: '...',
    visibility: 'private',
    startAt: '2024-01-01T00:00:00Z',
    endAt: '2024-03-31T23:59:59Z',
  }),
});
```

### Invite Creators
```typescript
const res = await fetch(`/api/portal/creator-manager/programs/${programId}/creators/invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    twitterUsernames: ['creator1', 'creator2'],
  }),
});
```

### Apply to Program
```typescript
const res = await fetch(`/api/portal/creator-manager/programs/${programId}/creators/apply`, {
  method: 'POST',
});
```

### Update Creator Status
```typescript
const res = await fetch(`/api/portal/creator-manager/programs/${programId}/creators/${creatorId}/status`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'approved',
    dealId: '...', // optional
  }),
});
```

## TODO Markers

- [ ] Mission completion logic
- [ ] XP path and gamification
- [ ] Badges and classes (Vanguard, Analyst, Amplifier, Explorer)
- [ ] Creator Manager analytics dashboard
- [ ] Notification system
- [ ] Program templates
- [ ] Bulk creator operations

