#!/usr/bin/env node

/**
 * Guard Script: Prevent Exposure of Competitor Names
 * 
 * Prevents competitor names from appearing in the codebase to avoid discovery through:
 * - Browser devtools inspection
 * - GitHub code search/repository browsing
 * - Source code analysis
 * 
 * Checks git-tracked files for:
 * - Competitor names to hide (case-insensitive): xeet, kaito, wallchain, yaps.kaito, app.wallchain, katana
 * - Em dash character: —
 * - Markdown horizontal rule lines: lines matching ^\s*---\s*$
 * 
 * Exits with code 1 if any matches found, 0 if clean.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

// Competitor names that must NOT appear in codebase to prevent discovery via devtools/GitHub
const FORBIDDEN_KEYWORDS = [
  'xeet',
  'kaito',
  'wallchain',
  'yaps.kaito',
  'app.wallchain',
  'katana',
];

// Forbidden numeric constants in mindshare files (formula disclosure prevention)
const FORBIDDEN_MINDSHARE_CONSTANTS = [
  /0\.25\b/g,
  /0\.30\b/g,
  /0\.20\b/g,
  /0\.8\b/g,
  /1\.2\b/g,
  /1\.5\b/g,
  /0\.7\b/g,
  /1\.3\b/g,
  /0\.5\b/g,
];

const EMDASH_CHAR = '\u2014'; // Unicode em dash

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mov', '.mp3',
]);

// Paths/patterns to exclude from scanning (even if git-tracked)
const EXCLUDED_PATTERNS = [
  /node_modules[\/\\]/i,
  /\.next[\/\\]/i,
  /build[\/\\]/i,
  /dist[\/\\]/i,
  /\.cache[\/\\]/i,
  /coverage[\/\\]/i,
  /\.turbo[\/\\]/i,
  /\.vercel[\/\\]/i,
  /pnpm-lock\.yaml$/i,
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /\.lock$/i,
];

function getGitTrackedFiles() {
  try {
    const buffer = execSync('git ls-files -z', { encoding: 'buffer', cwd: process.cwd() });
    // Split buffer by NUL bytes (0x00)
    const files = [];
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0) {
        if (i > start) {
          const filePath = buffer.slice(start, i).toString('utf8');
          files.push(filePath);
        }
        start = i + 1;
      }
    }
    // Handle last file if buffer doesn't end with NUL
    if (start < buffer.length) {
      const filePath = buffer.slice(start).toString('utf8');
      files.push(filePath);
    }
    // Convert to absolute paths
    return files.map(f => join(process.cwd(), f));
  } catch (err) {
    console.error('❌ Error: Could not run git ls-files. Make sure you are in a git repository.');
    console.error(err.message);
    process.exit(1);
  }
}

function isBinaryFile(filePath) {
  // Check extension
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  if (BINARY_EXTENSIONS.has(ext)) {
    return true;
  }
  return false;
}

function shouldExcludeFile(filePath) {
  // Normalize path separators for pattern matching
  const normalizedPath = filePath.replace(/\\/g, '/');
  // Check against exclusion patterns
  return EXCLUDED_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

function readFileSafe(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    // Check for too many NUL bytes (indicator of binary file)
    const nulCount = (content.match(/\0/g) || []).length;
    if (nulCount > content.length * 0.01) { // More than 1% NUL bytes
      return null;
    }
    return content;
  } catch (err) {
    // Skip files we can't read as UTF-8 (likely binary)
    return null;
  }
}

function getSnippet(content, lineNum, contextLines = 1) {
  const lines = content.split('\n');
  const idx = lineNum - 1;
  const start = Math.max(0, idx - contextLines);
  const end = Math.min(lines.length, idx + contextLines + 1);
  return lines.slice(start, end).join('\n').trim();
}

function checkForbiddenKeywords(content, filePath, relPath) {
  const issues = [];
  const lowerContent = content.toLowerCase();
  
  for (const keyword of FORBIDDEN_KEYWORDS) {
    let searchIndex = 0;
    while (true) {
      const index = lowerContent.indexOf(keyword.toLowerCase(), searchIndex);
      if (index === -1) break;
      
      // Find line number
      const lineNum = content.substring(0, index).split('\n').length;
      const snippet = getSnippet(content, lineNum);
      
      issues.push({
        type: 'forbidden_keyword',
        keyword,
        file: relPath,
        line: lineNum,
        snippet,
      });
      
      searchIndex = index + 1;
    }
  }
  
  return issues;
}

function checkEmDash(content, filePath, relPath) {
  const issues = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(EMDASH_CHAR)) {
      const snippet = getSnippet(content, i + 1);
      issues.push({
        type: 'em_dash',
        file: relPath,
        line: i + 1,
        snippet,
      });
    }
  }
  
  return issues;
}

function checkHorizontalRule(content, filePath, relPath) {
  const issues = [];
  const lines = content.split('\n');
  const hrRegex = /^\s*---\s*$/;
  
  for (let i = 0; i < lines.length; i++) {
    if (hrRegex.test(lines[i])) {
      const snippet = getSnippet(content, i + 1);
      issues.push({
        type: 'horizontal_rule',
        file: relPath,
        line: i + 1,
        snippet,
      });
    }
  }
  
  return issues;
}

function checkMindshareConstants(content, filePath, relPath) {
  const issues = [];
  // Only check mindshare files
  if (!relPath.includes('mindshare') && !relPath.includes('MINDSHARE')) {
    return issues;
  }
  
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments that are just explaining neutral fallbacks
    if (line.includes('neutral') || line.includes('fallback') || line.includes('getEnvFloat')) {
      continue;
    }
    
    for (const pattern of FORBIDDEN_MINDSHARE_CONSTANTS) {
      if (pattern.test(line)) {
        const snippet = getSnippet(content, i + 1);
        issues.push({
          type: 'mindshare_constant',
          file: relPath,
          line: i + 1,
          snippet,
          constant: pattern.source,
        });
      }
    }
  }
  
  return issues;
}

function main() {
  console.log('🔍 Scanning git-tracked files for competitor names and forbidden patterns...\n');
  
  const allFiles = getGitTrackedFiles();
  const allIssues = [];
  let scannedCount = 0;
  
  for (const filePath of allFiles) {
    // Skip guard script itself (contains keywords in comments)
    if (filePath.replace(/\\/g, '/').endsWith('scripts/guard-forbidden.mjs')) {
      continue;
    }
    
    // Skip excluded paths (node_modules, build artifacts, lockfiles, etc.)
    if (shouldExcludeFile(filePath)) {
      continue;
    }
    
    // Skip binary files by extension
    if (isBinaryFile(filePath)) {
      continue;
    }
    
    // Try to read file as text
    const content = readFileSafe(filePath);
    if (content === null) {
      continue; // Skip binary or unreadable files
    }
    
    scannedCount++;
    // Get relative path from current working directory
    const relPath = filePath.startsWith(process.cwd())
      ? filePath.substring(process.cwd().length).replace(/^[/\\]/, '')
      : filePath;
    const normalizedRelPath = relPath.replace(/\\/g, '/');
    
    // Check for forbidden keywords
    const keywordIssues = checkForbiddenKeywords(content, filePath, normalizedRelPath);
    allIssues.push(...keywordIssues);
    
    // Check for em dash
    const emDashIssues = checkEmDash(content, filePath, normalizedRelPath);
    allIssues.push(...emDashIssues);
    
    // Check for horizontal rules (all files)
    const hrIssues = checkHorizontalRule(content, filePath, normalizedRelPath);
    allIssues.push(...hrIssues);
    
    // Check for mindshare constants (mindshare files only)
    const mindshareIssues = checkMindshareConstants(content, filePath, normalizedRelPath);
    allIssues.push(...mindshareIssues);
  }
  
  // Print summary
  console.log(`✅ Scanned ${scannedCount} git-tracked files (excluding node_modules, build artifacts, lockfiles)`);
  console.log(`📊 Found ${allIssues.length} violation${allIssues.length !== 1 ? 's' : ''}\n`);
  
  if (allIssues.length === 0) {
    console.log('✅ No competitor names or forbidden patterns found. Repository is clean.\n');
    process.exit(0);
  }
  
  console.error('❌ Competitor names or forbidden patterns detected:\n');
  
  // Show first 50 violations with snippets
  const displayIssues = allIssues.slice(0, 50);
  
  for (const issue of displayIssues) {
    if (issue.type === 'forbidden_keyword') {
      console.error(`${issue.file}:${issue.line}: found competitor name "${issue.keyword}" (must not be exposed)`);
      console.error(`  ${issue.snippet}`);
      console.error('');
    } else if (issue.type === 'em_dash') {
      console.error(`${issue.file}:${issue.line}: found em dash (—)`);
      console.error(`  ${issue.snippet}`);
      console.error('');
    } else if (issue.type === 'horizontal_rule') {
      console.error(`${issue.file}:${issue.line}: found horizontal rule (---)`);
      console.error(`  ${issue.snippet}`);
      console.error('');
    } else if (issue.type === 'mindshare_constant') {
      console.error(`${issue.file}:${issue.line}: found forbidden mindshare constant (formula disclosure)`);
      console.error(`  ${issue.snippet}`);
      console.error('');
    }
  }
  
  if (allIssues.length > 50) {
    console.error(`... and ${allIssues.length - 50} more violation(s)\n`);
  }
  
  console.error(`Total violations: ${allIssues.length}\n`);
  console.error('⚠️  These competitor names must be removed to prevent exposure via devtools/GitHub.\n');
  console.error('Please remove these patterns before committing.\n');
  process.exit(1);
}

main();
