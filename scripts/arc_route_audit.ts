/**
 * ARC Route Audit Script
 * 
 * Scans ARC pages directories and detects:
 * - Legacy patterns (e.g., [slug] instead of [projectSlug])
 * - Duplicate admin pages
 * - Unused/legacy routes
 * - Suggested deletions
 * 
 * Usage: npm run arc:audit
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

interface RouteInfo {
  filePath: string;
  route: string;
  isLegacy: boolean;
  isRedirect: boolean;
  isDuplicate: boolean;
  suggestedAction: 'keep' | 'redirect' | 'delete';
  notes: string[];
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const ARC_PAGES_DIR = path.join(__dirname, '../src/web/pages/portal/arc');
const ADMIN_ARC_PAGES_DIR = path.join(__dirname, '../src/web/pages/portal/admin/arc');

// Canonical routes
const CANONICAL_ROUTES = [
  '/portal/arc',
  '/portal/arc/[projectSlug]',
  '/portal/arc/[projectSlug]/arena/[arenaSlug]',
  '/portal/arc/admin/[projectSlug]', // Project-specific admin (canonical)
  '/portal/admin/arc',
  '/portal/admin/arc/leaderboard-requests',
  '/portal/admin/arc/activity',
  '/portal/admin/arc/billing',
  '/portal/admin/arc/reports',
  '/portal/admin/arc/reports/[kind]/[id]',
  '/portal/admin/arc/smoke-test',
  '/portal/admin/arc/comprehensive-reports',
  // Additional canonical routes
  '/portal/arc/requests',
  '/portal/arc/report',
  '/portal/arc/creator-manager',
  '/portal/arc/creator-manager/[programId]',
  '/portal/arc/creator-manager/[programId]/creators/[creatorProfileId]',
  '/portal/arc/creator-manager/create',
  '/portal/arc/creator/[twitterUsername]',
  '/portal/arc/gamified/[projectId]', // Note: uses projectId (not projectSlug) - acceptable for now
  '/portal/arc/leaderboard/[projectId]', // Legacy redirect (keep for now)
  '/portal/arc/leaderboards',
  '/portal/arc/my-creator-programs',
  '/portal/arc/my-creator-programs/[programId]',
];

// Legacy patterns to detect
const LEGACY_PATTERNS = [
  { pattern: /\[slug\]/g, replacement: '[projectSlug]', description: 'Uses [slug] instead of [projectSlug]' },
  { pattern: /\/portal\/arc\/admin\/index/, description: 'Legacy admin index (should redirect to /portal/admin/arc)' },
];

// =============================================================================
// HELPERS
// =============================================================================

function fileToRoute(filePath: string, baseDir: string): string {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedBase = baseDir.replace(/\\/g, '/');
  
  // Determine if this is an admin route
  const isAdminRoute = normalizedPath.includes('/portal/admin/arc') || normalizedBase.includes('/portal/admin/arc');
  
  // Remove base directory and file extension
  let relative = path.relative(normalizedBase, normalizedPath);
  relative = relative.replace(/\.tsx?$/, '');
  
  // Convert to route format
  let route = relative
    .replace(/\\/g, '/') // Windows path separators
    .replace(/^\.\//, '') // Remove leading ./
    .replace(/\/index$/, ''); // Remove trailing /index
  
  // Add /portal/arc or /portal/admin/arc prefix
  if (isAdminRoute) {
    route = `/portal/admin/arc${route ? '/' + route : ''}`;
  } else {
    route = `/portal/arc${route ? '/' + route : ''}`;
  }
  
  return route;
}

function isRedirectOnly(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check for explicit redirect patterns
    const hasServerSideRedirect = /redirect:\s*\{/.test(content) || /destination:\s*['"]/.test(content);
    const hasClientRedirect = /router\.replace\(/.test(content) || /router\.push\(/.test(content);
    const hasGetServerSideProps = /getServerSideProps/.test(content);
    
    // Check if file contains "Legacy" or "redirect" in comments/strings
    const hasLegacyComment = /legacy|redirect/i.test(content);
    
    // Count non-trivial content (excluding imports, comments, exports)
    const lines = content.split('\n');
    const nonTrivialLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return false;
      if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) return false;
      if (/^from\s+['"]/.test(trimmed)) return false;
      return true;
    });
    
    // If it has redirect logic and minimal content, it's likely a redirect-only page
    const hasMinimalContent = nonTrivialLines.length < 50; // More generous threshold
    
    // Redirect-only if:
    // - Has server-side redirect in getServerSideProps, OR
    // - Has client redirect with minimal content and legacy comment
    return (
      (hasServerSideRedirect && hasGetServerSideProps && hasMinimalContent) ||
      (hasClientRedirect && hasLegacyComment && hasMinimalContent)
    );
  } catch {
    return false;
  }
}

function isLegacyPattern(filePath: string, route: string, isRedirect: boolean): { isLegacy: boolean; reason: string } {
  // Check for [slug] pattern (not redirect-only)
  if ((route.includes('[slug]') && !route.includes('[projectSlug]')) || 
      (filePath.includes('[slug]') && !filePath.includes('[projectSlug]'))) {
    if (!isRedirect) {
      return { isLegacy: true, reason: 'Uses [slug] instead of [projectSlug] and is not redirect-only' };
    }
  }
  
  // Check for legacy admin routes under /portal/arc/admin (should be /portal/admin/arc)
  if (route.startsWith('/portal/arc/admin') && route !== '/portal/arc/admin/[projectSlug]') {
    // /portal/arc/admin/[projectSlug] is canonical (project-specific admin)
    // But /portal/arc/admin or /portal/arc/admin/index should redirect to /portal/admin/arc
    if (route === '/portal/arc/admin' || route === '/portal/arc/admin/index') {
      return { isLegacy: true, reason: 'Legacy admin route (should redirect to /portal/admin/arc)' };
    }
  }
  
  // Check for duplicate admin pages: /portal/arc/admin/* that duplicate /portal/admin/arc/*
  if (route.startsWith('/portal/arc/admin/') && 
      route !== '/portal/arc/admin' && 
      route !== '/portal/arc/admin/index' &&
      route !== '/portal/arc/admin/[projectSlug]') {
    const adminPath = route.replace('/portal/arc/admin/', '');
    // Check if equivalent exists in /portal/admin/arc
    const equivalentAdminRoute = `/portal/admin/arc/${adminPath}`;
    return { isLegacy: true, reason: `Duplicate admin route (should be ${equivalentAdminRoute})` };
  }
  
  // Check for arena routes that aren't redirect-only
  if (route.includes('/arena/') && !route.includes('/portal/arc/[projectSlug]/arena/[arenaSlug]')) {
    if (!isRedirect) {
      return { isLegacy: true, reason: 'Non-canonical arena route (should use /portal/arc/[projectSlug]/arena/[arenaSlug])' };
    }
  }
  
  // Check for [projectId] routes (should use [projectSlug])
  if (route.includes('[projectId]') && !isRedirect) {
    return { isLegacy: true, reason: 'Uses [projectId] instead of [projectSlug]' };
  }
  
  return { isLegacy: false, reason: '' };
}

function findDuplicateRoutes(routes: RouteInfo[]): Set<string> {
  const routeMap = new Map<string, RouteInfo[]>();
  
  for (const routeInfo of routes) {
    // Normalize route for comparison (remove dynamic params)
    // Special handling: /portal/arc/admin/[projectSlug] is NOT a duplicate of /portal/admin/arc
    let normalized = routeInfo.route.replace(/\[[^\]]+\]/g, '[param]');
    
    // Only normalize /portal/arc/admin/* to /portal/admin/arc/* if it's NOT [projectSlug]
    if (normalized.startsWith('/portal/arc/admin/') && 
        routeInfo.route !== '/portal/arc/admin/[projectSlug]') {
      normalized = normalized.replace('/portal/arc/admin/', '/portal/admin/arc/');
    }
    
    if (!routeMap.has(normalized)) {
      routeMap.set(normalized, []);
    }
    routeMap.get(normalized)!.push(routeInfo);
  }
  
  const duplicates = new Set<string>();
  for (const [normalized, infos] of routeMap.entries()) {
    if (infos.length > 1) {
      // Mark all but the first one as duplicates (prioritize /portal/admin/arc over /portal/arc/admin)
      const sorted = infos.sort((a, b) => {
        // Prioritize /portal/admin/arc over /portal/arc/admin
        if (a.route.startsWith('/portal/admin/arc') && b.route.startsWith('/portal/arc/admin')) {
          return -1;
        }
        if (b.route.startsWith('/portal/admin/arc') && a.route.startsWith('/portal/arc/admin')) {
          return 1;
        }
        return 0;
      });
      
      // Mark all except the first (canonical) as duplicates
      for (let i = 1; i < sorted.length; i++) {
        duplicates.add(sorted[i].filePath);
      }
    }
  }
  
  return duplicates;
}

function scanDirectory(dir: string, baseDir: string, results: RouteInfo[]): void {
  if (!fs.existsSync(dir)) {
    return;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      scanDirectory(fullPath, baseDir, results);
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const route = fileToRoute(fullPath, baseDir);
      const isRedirect = isRedirectOnly(fullPath);
      const legacyCheck = isLegacyPattern(fullPath, route, isRedirect);
      
      // Determine suggested action
      let suggestedAction: 'keep' | 'redirect' | 'delete' = 'keep';
      const notes: string[] = [];
      
      if (legacyCheck.isLegacy) {
        if (isRedirect) {
          suggestedAction = 'keep'; // Keep redirects
          notes.push('Legacy redirect - keep');
        } else {
          suggestedAction = 'redirect';
          notes.push(`Legacy pattern: ${legacyCheck.reason}`);
        }
      } else {
        // Check if route matches any canonical pattern
        const matchesCanonical = CANONICAL_ROUTES.some(canonical => {
          // Convert canonical route to regex pattern
          const canonicalPattern = canonical
            .replace(/\[[^\]]+\]/g, '[^/]+') // Replace dynamic params
            .replace(/\//g, '\\/') // Escape slashes
            .replace(/\$/g, '\\$'); // Escape end anchor
          const regex = new RegExp(`^${canonicalPattern}$`);
          return regex.test(route);
        });
        
        if (!matchesCanonical) {
          // Not a canonical route
          if (isRedirect) {
            suggestedAction = 'keep';
            notes.push('Non-canonical redirect - keep');
          } else {
            suggestedAction = 'delete';
            notes.push('Not in canonical route list');
          }
        }
      }
      
      results.push({
        filePath: fullPath,
        route,
        isLegacy: legacyCheck.isLegacy,
        isRedirect,
        isDuplicate: false, // Will be set later
        suggestedAction,
        notes,
      });
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log('🔍 ARC Route Audit\n');
  console.log('Scanning directories...\n');
  
  const results: RouteInfo[] = [];
  
  // Scan ARC pages
  if (fs.existsSync(ARC_PAGES_DIR)) {
    scanDirectory(ARC_PAGES_DIR, ARC_PAGES_DIR, results);
  }
  
  // Scan admin ARC pages
  if (fs.existsSync(ADMIN_ARC_PAGES_DIR)) {
    scanDirectory(ADMIN_ARC_PAGES_DIR, ADMIN_ARC_PAGES_DIR, results);
  }
  
  // Mark duplicates
  const duplicatePaths = findDuplicateRoutes(results);
  for (const routeInfo of results) {
    if (duplicatePaths.has(routeInfo.filePath)) {
      routeInfo.isDuplicate = true;
      routeInfo.notes.push('Duplicate route detected');
    }
  }
  
  // Categorize results
  const canonical = results.filter(r => !r.isLegacy && !r.isDuplicate && r.suggestedAction === 'keep');
  const legacy = results.filter(r => r.isLegacy);
  const duplicates = results.filter(r => r.isDuplicate);
  const toDelete = results.filter(r => r.suggestedAction === 'delete');
  const toRedirect = results.filter(r => r.suggestedAction === 'redirect');
  
  // Print report
  console.log('='.repeat(80));
  console.log('AUDIT REPORT');
  console.log('='.repeat(80));
  console.log();
  
  console.log(`📊 Summary:`);
  console.log(`   Total files scanned: ${results.length}`);
  console.log(`   Canonical pages: ${canonical.length}`);
  console.log(`   Legacy pages: ${legacy.length}`);
  console.log(`   Duplicates: ${duplicates.length}`);
  console.log(`   Suggested deletions: ${toDelete.length}`);
  console.log(`   Suggested redirects: ${toRedirect.length}`);
  console.log();
  
  if (canonical.length > 0) {
    console.log('✅ Canonical Pages Found:');
    canonical.forEach(r => {
      console.log(`   ${r.route}`);
      console.log(`      File: ${path.relative(process.cwd(), r.filePath)}`);
    });
    console.log();
  }
  
  if (legacy.length > 0) {
    console.log('⚠️  Legacy Pages Found:');
    legacy.forEach(r => {
      console.log(`   ${r.route}`);
      console.log(`      File: ${path.relative(process.cwd(), r.filePath)}`);
      console.log(`      Redirect only: ${r.isRedirect ? 'Yes' : 'No'}`);
      r.notes.forEach(note => console.log(`      Note: ${note}`));
    });
    console.log();
  }
  
  if (duplicates.length > 0) {
    console.log('🔄 Duplicates Found:');
    duplicates.forEach(r => {
      console.log(`   ${r.route}`);
      console.log(`      File: ${path.relative(process.cwd(), r.filePath)}`);
      r.notes.forEach(note => console.log(`      Note: ${note}`));
    });
    console.log();
  }
  
  if (toDelete.length > 0) {
    console.log('🗑️  Suggested Deletions:');
    toDelete.forEach(r => {
      console.log(`   ${r.route}`);
      console.log(`      File: ${path.relative(process.cwd(), r.filePath)}`);
      r.notes.forEach(note => console.log(`      Reason: ${note}`));
    });
    console.log();
  }
  
  if (toRedirect.length > 0) {
    console.log('↩️  Suggested Redirects:');
    toRedirect.forEach(r => {
      console.log(`   ${r.route}`);
      console.log(`      File: ${path.relative(process.cwd(), r.filePath)}`);
      r.notes.forEach(note => console.log(`      Reason: ${note}`));
    });
    console.log();
  }
  
  console.log('='.repeat(80));
  console.log('END OF REPORT');
  console.log('='.repeat(80));
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main };
