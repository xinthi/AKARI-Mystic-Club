/**
 * ARC Route Audit Script
 * 
 * Scans ARC pages directories to detect:
 * - Canonical pages
 * - Legacy pages that should be redirects
 * - Duplicate admin pages
 * - Unused/legacy routes
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// CONFIGURATION
// =============================================================================

const ARC_PAGES_DIR = path.join(__dirname, '../src/web/pages/portal/arc');
const ADMIN_ARC_PAGES_DIR = path.join(__dirname, '../src/web/pages/portal/admin/arc');
const R_PAGES_DIR = path.join(__dirname, '../src/web/pages/r');

// Canonical route patterns (from ARC_ROUTES.md)
const CANONICAL_ROUTES = {
  // Public routes
  '/portal/arc': 'index.tsx',
  '/portal/arc/[projectSlug]': '[projectSlug].tsx',
  '/portal/arc/[projectSlug]/arena/[arenaSlug]': '[projectSlug]/arena/[arenaSlug].tsx',
  
  // Project admin routes
  '/portal/arc/admin/[projectSlug]': 'admin/[projectSlug].tsx',
  
  // SuperAdmin routes
  '/portal/admin/arc': 'portal/admin/arc/index.tsx',
  '/portal/admin/arc/leaderboard-requests': 'portal/admin/arc/leaderboard-requests.tsx',
  '/portal/admin/arc/activity': 'portal/admin/arc/activity.tsx',
  '/portal/admin/arc/billing': 'portal/admin/arc/billing.tsx',
  '/portal/admin/arc/reports': 'portal/admin/arc/reports/index.tsx',
  '/portal/admin/arc/smoke-test': 'portal/admin/arc/smoke-test.tsx',
  
  // UTM redirect route
  '/r/[code]': 'r/[code].tsx',
  
  // Legacy but still used
  '/portal/arc/requests': 'requests.tsx',
};

// Valid routes that are not in canonical list but are legitimate (not legacy)
const VALID_ROUTES = [
  '/portal/arc/index',
  '/portal/arc/admin/profiles',
  '/portal/arc/creator/[twitterUsername]',
  '/portal/arc/creator-manager',
  '/portal/arc/creator-manager/index',
  '/portal/arc/creator-manager/create',
  '/portal/arc/creator-manager/[programId]',
  '/portal/arc/creator-manager/[programId]/creators/[creatorProfileId]',
  '/portal/arc/gamified/[projectId]',
  '/portal/arc/leaderboard/[projectId]',
  '/portal/arc/leaderboards',
  '/portal/arc/leaderboards/index',
  '/portal/arc/my-creator-programs',
  '/portal/arc/my-creator-programs/index',
  '/portal/arc/my-creator-programs/[programId]',
  '/portal/arc/project/[projectId]',
  '/portal/arc/report',
  '/portal/admin/arc/comprehensive-reports',
  '/portal/admin/arc/reports/index',
  '/portal/admin/arc/reports/[kind]/[id]',
];

// Legacy patterns that should be redirects
const LEGACY_PATTERNS = [
  {
    pattern: /\[slug\]/,
    description: 'Legacy [slug] parameter (should use [projectSlug])',
    canonical: '[projectSlug]',
  },
  {
    pattern: /portal\/arc\/admin$/,
    description: 'Legacy /portal/arc/admin (should redirect to /portal/admin/arc)',
    canonical: '/portal/admin/arc',
  },
];

// =============================================================================
// TYPES
// =============================================================================

interface PageFile {
  filePath: string;
  route: string;
  isCanonical: boolean;
  isLegacy: boolean;
  legacyReason?: string;
  shouldRedirect?: boolean;
  redirectTo?: string;
}

interface AuditResult {
  canonicalPages: PageFile[];
  legacyPages: PageFile[];
  duplicatePages: PageFile[];
  unusedPages: PageFile[];
  suggestions: string[];
}

// =============================================================================
// HELPERS
// =============================================================================

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function getRouteFromFilePath(filePath: string): string {
  // Convert file path to route
  // e.g., src/web/pages/portal/arc/[projectSlug].tsx -> /portal/arc/[projectSlug]
  // e.g., src/web/pages/portal/arc/index.tsx -> /portal/arc
  // e.g., src/web/pages/portal/admin/arc/index.tsx -> /portal/admin/arc
  const relativePath = filePath
    .replace(path.join(__dirname, '../src/web/pages'), '')
    .replace(/\\/g, '/')
    .replace(/\.tsx?$/, '')
    .replace(/\/index$/, ''); // Remove trailing /index
  
  return relativePath;
}

function isLegacyRoute(filePath: string, route: string): { isLegacy: boolean; reason?: string; redirectTo?: string } {
  // Check for [slug] pattern
  if (route.includes('[slug]') && !route.includes('[projectSlug]')) {
    return {
      isLegacy: true,
      reason: 'Uses legacy [slug] parameter instead of [projectSlug]',
      redirectTo: route.replace('[slug]', '[projectSlug]'),
    };
  }
  
  // Check for /portal/arc/admin (without projectSlug)
  if (route === '/portal/arc/admin' || route === '/portal/arc/admin/index') {
    return {
      isLegacy: true,
      reason: 'Legacy superadmin route (should redirect to /portal/admin/arc)',
      redirectTo: '/portal/admin/arc',
    };
  }
  
  // Check if it's a duplicate admin page
  if (route.startsWith('/portal/arc/admin/') && route !== '/portal/arc/admin/[projectSlug]') {
    const adminRoute = route.replace('/portal/arc/admin/', '/portal/admin/arc/');
    if (CANONICAL_ROUTES[adminRoute as keyof typeof CANONICAL_ROUTES]) {
      return {
        isLegacy: true,
        reason: 'Duplicate admin page (should be in /portal/admin/arc)',
        redirectTo: adminRoute,
      };
    }
  }
  
  return { isLegacy: false };
}

function isCanonicalRoute(route: string): boolean {
  return Object.keys(CANONICAL_ROUTES).includes(route);
}

function isValidRoute(route: string): boolean {
  if (isCanonicalRoute(route)) return true;
  // Check if route matches any valid pattern
  return VALID_ROUTES.some((validRoute) => {
    // Convert dynamic segments to regex
    const pattern = validRoute
      .replace(/\[.*?\]/g, '[^/]+')
      .replace(/\//g, '\\/');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(route);
  });
}

function checkIfRedirectOnly(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Check if file only contains redirect logic
    const hasRedirect = content.includes('redirect:') || content.includes('redirect');
    const hasComponent = content.includes('export default') && !content.includes('return null');
    return hasRedirect && !hasComponent;
  } catch {
    return false;
  }
}

// =============================================================================
// MAIN AUDIT FUNCTION
// =============================================================================

function auditRoutes(): AuditResult {
  const result: AuditResult = {
    canonicalPages: [],
    legacyPages: [],
    duplicatePages: [],
    unusedPages: [],
    suggestions: [],
  };
  
  // Get all page files
  const allFiles: PageFile[] = [];
  
  // Scan /portal/arc directory
  if (fs.existsSync(ARC_PAGES_DIR)) {
    const arcFiles = getAllFiles(ARC_PAGES_DIR);
    arcFiles.forEach((filePath) => {
      const route = getRouteFromFilePath(filePath);
      const legacyCheck = isLegacyRoute(filePath, route);
      const isCanonical = isCanonicalRoute(route);
      
      const isValid = isValidRoute(route);
      
      allFiles.push({
        filePath,
        route,
        isCanonical,
        isLegacy: legacyCheck.isLegacy,
        legacyReason: legacyCheck.reason,
        shouldRedirect: legacyCheck.isLegacy && !checkIfRedirectOnly(filePath),
        redirectTo: legacyCheck.redirectTo,
      });
    });
  }
  
  // Scan /portal/admin/arc directory
  if (fs.existsSync(ADMIN_ARC_PAGES_DIR)) {
    const adminFiles = getAllFiles(ADMIN_ARC_PAGES_DIR);
    adminFiles.forEach((filePath) => {
      const route = getRouteFromFilePath(filePath);
      const isCanonical = isCanonicalRoute(route);
      
      allFiles.push({
        filePath,
        route,
        isCanonical,
        isLegacy: false,
      });
    });
  }
  
  // Scan /r directory (UTM redirects)
  if (fs.existsSync(R_PAGES_DIR)) {
    const rFiles = getAllFiles(R_PAGES_DIR);
    rFiles.forEach((filePath) => {
      const route = getRouteFromFilePath(filePath);
      const isCanonical = isCanonicalRoute(route);
      
      allFiles.push({
        filePath,
        route,
        isCanonical,
        isLegacy: false,
      });
    });
  }
  
  // Categorize files
  allFiles.forEach((file) => {
    if (file.isCanonical) {
      result.canonicalPages.push(file);
    } else if (file.isLegacy) {
      result.legacyPages.push(file);
    } else if (isValidRoute(file.route)) {
      // Valid route, not canonical but legitimate - don't mark as unused
      // (e.g., creator-manager, gamified, etc.)
    } else {
      // Check if it's a duplicate
      const duplicate = allFiles.find(
        (f) => f.route !== file.route && f.route.replace('[projectSlug]', 'X') === file.route.replace('[slug]', 'X')
      );
      if (duplicate) {
        result.duplicatePages.push(file);
      } else {
        result.unusedPages.push(file);
      }
    }
  });
  
  // Generate suggestions
  result.legacyPages.forEach((file) => {
    if (file.shouldRedirect && file.redirectTo) {
      result.suggestions.push(
        `Convert ${file.route} (${file.filePath}) to redirect to ${file.redirectTo}`
      );
    }
  });
  
  result.duplicatePages.forEach((file) => {
    result.suggestions.push(
      `Remove duplicate route ${file.route} (${file.filePath}) - canonical route exists`
    );
  });
  
  return result;
}

// =============================================================================
// OUTPUT
// =============================================================================

function printReport(result: AuditResult): void {
  console.log('='.repeat(80));
  console.log('ARC Route Audit Report');
  console.log('='.repeat(80));
  console.log();
  
  console.log(`📋 Canonical Pages (${result.canonicalPages.length}):`);
  result.canonicalPages.forEach((file) => {
    console.log(`  ✅ ${file.route}`);
    console.log(`     ${file.filePath}`);
  });
  console.log();
  
  console.log(`⚠️  Legacy Pages (${result.legacyPages.length}):`);
  result.legacyPages.forEach((file) => {
    console.log(`  ⚠️  ${file.route}`);
    console.log(`     ${file.filePath}`);
    console.log(`     Reason: ${file.legacyReason}`);
    if (file.shouldRedirect) {
      console.log(`     → Should redirect to: ${file.redirectTo}`);
    }
  });
  console.log();
  
  console.log(`🔄 Duplicate Pages (${result.duplicatePages.length}):`);
  result.duplicatePages.forEach((file) => {
    console.log(`  🔄 ${file.route}`);
    console.log(`     ${file.filePath}`);
  });
  console.log();
  
  console.log(`❓ Unused Pages (${result.unusedPages.length}):`);
  result.unusedPages.forEach((file) => {
    console.log(`  ❓ ${file.route}`);
    console.log(`     ${file.filePath}`);
  });
  console.log();
  
  console.log(`💡 Suggestions (${result.suggestions.length}):`);
  result.suggestions.forEach((suggestion, idx) => {
    console.log(`  ${idx + 1}. ${suggestion}`);
  });
  console.log();
  
  console.log('='.repeat(80));
}

// =============================================================================
// RUN
// =============================================================================

if (require.main === module) {
  try {
    const result = auditRoutes();
    printReport(result);
    process.exit(0);
  } catch (error) {
    console.error('Error running audit:', error);
    process.exit(1);
  }
}

export { auditRoutes, printReport };
