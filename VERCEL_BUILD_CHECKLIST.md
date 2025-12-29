# Vercel Build Checklist - Common Issues to Avoid

This document lists common TypeScript/compilation errors that have caused Vercel build failures. Check these before committing:

## 1. TypeScript Type Errors

### Missing Properties in Interfaces
- **Issue**: Using a property in code but not declaring it in the interface
- **Example**: `affiliate_title` used in code but missing from `AddTeamMemberRequest` interface
- **Fix**: Always add properties to interfaces when using them

### Array vs Object Type Mismatches
- **Issue**: Supabase relations can return arrays, but code expects single object
- **Example**: `arena?.projects` could be array, but accessed as `project.name`
- **Fix**: Use `Array.isArray()` check: `Array.isArray(data) ? data[0] : data`

### Variable Name Mismatches
- **Issue**: Using wrong variable name (camelCase vs snake_case)
- **Example**: Variable `followVerified` but using `follow_verified` in object
- **Fix**: Use explicit mapping: `follow_verified: followVerified`

## 2. Variable Scope Issues

### Variables Declared in Wrong Scope
- **Issue**: Variable declared inside `if` block but used in `else` block
- **Example**: `userProfileId` declared inside `if (campaign)` but used in `else` for programs
- **Fix**: Declare variables outside if/else blocks when needed in both

## 3. Next.js Route Conflicts

### Inconsistent Dynamic Route Names
- **Issue**: Using different dynamic segment names at same level
- **Example**: `/api/portal/projects/[id]/...` and `/api/portal/projects/[projectId]/...`
- **Fix**: Use consistent naming (prefer `[id]` for single resource)

## 4. Supabase API Usage

### Invalid Order Parameters
- **Issue**: Using unsupported Supabase `.order()` parameters
- **Example**: `nullsLast: true` (not supported)
- **Fix**: Use `nullsFirst: false` instead (to put nulls last)

## 5. JSX Syntax Errors

### Missing Closing Tags
- **Issue**: Unclosed JSX elements or mismatched tags
- **Example**: Missing `</div>` for member card wrapper
- **Fix**: Always verify JSX structure matches opening/closing tags

### Incorrect Ternary Operator Structure
- **Issue**: Missing else clause or incorrect parentheses
- **Example**: `condition ? value :` (missing else)
- **Fix**: Always provide both branches: `condition ? value : null`

## 6. Missing Data Fetching

### State Declared But Never Fetched
- **Issue**: UI components exist but no `useEffect` to fetch data
- **Example**: `teamMembers` state exists but no fetch call
- **Fix**: Always add `useEffect` hooks to fetch data for displayed components

## 7. Form State Reset

### Incomplete State Reset
- **Issue**: Resetting form but missing required fields
- **Example**: Resetting `questForm` but missing `quest_type` and `crm_program_id`
- **Fix**: Include ALL fields from the state interface when resetting

## Pre-Build Checklist

Before pushing to Vercel, verify:

- [ ] All interfaces include all properties used in code
- [ ] Array/object type checks for Supabase relations
- [ ] Variable names match (camelCase vs snake_case)
- [ ] Variables declared in correct scope (outside if/else if needed)
- [ ] Dynamic routes use consistent naming (`[id]` not `[projectId]`)
- [ ] Supabase `.order()` uses `nullsFirst` not `nullsLast`
- [ ] All JSX elements properly closed
- [ ] Ternary operators have both branches
- [ ] All displayed data has corresponding `useEffect` fetch hooks
- [ ] Form resets include all required fields

## Quick Commands

```bash
# Check TypeScript errors locally
cd src/web && pnpm build

# Check for route conflicts
find src/web/pages/api -type d -name "\[*\]" | sort

# Check for common patterns
grep -r "nullsLast" src/web/pages/api
grep -r "\[projectId\]" src/web/pages/api
```

