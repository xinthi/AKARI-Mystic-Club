#!/usr/bin/env node

/**
 * Guard Script: Prevent Forbidden Patterns
 * 
 * Checks for:
 * - Competitor keywords (case-insensitive): xeet, kaito, wallchain, yaps.kaito, app.wallchain, katana
 * - Em dash character: —
 * - Markdown horizontal rule lines: lines matching ^\s*---\s*$
 * 
 * Exits with code 1 if any matches found, 0 if clean.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const FORBIDDEN_KEYWORDS = [
  'xeet',
  'kaito',
  'wallchain',
  'yaps.kaito',
  'app.wallchain',
  'katana',
];

const EMDASH_CHAR = '\u2014'; // Unicode em dash

const ROOT_DIR = join(process.cwd());
const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.cache',
  '.turbo',
  'coverage',
]);

const IGNORE_FILES = new Set([
  '.gitignore',
  '.gitattributes',
]);

function shouldIgnore(path) {
  const parts = path.split(/[/\\]/);
  return parts.some(part => IGNORE_DIRS.has(part) || part.startsWith('.'));
}

function getAllFiles(dir, fileList = []) {
  try {
    const files = readdirSync(dir);

    for (const file of files) {
      const filePath = join(dir, file);
      
      if (shouldIgnore(filePath)) {
        continue;
      }

      try {
        const stat = statSync(filePath);
        
        if (stat.isDirectory()) {
          getAllFiles(filePath, fileList);
        } else if (stat.isFile() && !IGNORE_FILES.has(file)) {
          fileList.push(filePath);
        }
      } catch (err) {
        // Skip files we can't read (permissions, etc.)
        continue;
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }

  return fileList;
}

function checkForbiddenKeywords(content, filePath) {
  const issues = [];
  const lowerContent = content.toLowerCase();
  
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const index = lowerContent.indexOf(keyword.toLowerCase());
    if (index !== -1) {
      // Find line number
      const lineNum = content.substring(0, index).split('\n').length;
      issues.push({
        type: 'forbidden_keyword',
        keyword,
        file: filePath,
        line: lineNum,
      });
    }
  }
  
  return issues;
}

function checkEmDash(content, filePath) {
  const issues = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(EMDASH_CHAR)) {
      issues.push({
        type: 'em_dash',
        file: filePath,
        line: i + 1,
      });
    }
  }
  
  return issues;
}

function checkHorizontalRule(content, filePath) {
  const issues = [];
  const lines = content.split('\n');
  const hrRegex = /^\s*---\s*$/;
  
  for (let i = 0; i < lines.length; i++) {
    if (hrRegex.test(lines[i])) {
      issues.push({
        type: 'horizontal_rule',
        file: filePath,
        line: i + 1,
      });
    }
  }
  
  return issues;
}

function main() {
  console.log('🔍 Scanning repository for forbidden patterns...\n');
  
  const allFiles = getAllFiles(ROOT_DIR);
  const allIssues = [];
  
  for (const filePath of allFiles) {
    try {
      const relPath = relative(ROOT_DIR, filePath).replace(/\\/g, '/');
      
      // Skip guard script itself (contains keywords in comments)
      if (relPath === 'scripts/guard-forbidden.mjs') {
        continue;
      }
      
      const content = readFileSync(filePath, 'utf8');
      
      // Check for forbidden keywords
      const keywordIssues = checkForbiddenKeywords(content, relPath);
      allIssues.push(...keywordIssues);
      
      // Check for em dash
      const emDashIssues = checkEmDash(content, relPath);
      allIssues.push(...emDashIssues);
      
      // Check for horizontal rules (all files)
      const hrIssues = checkHorizontalRule(content, relPath);
      allIssues.push(...hrIssues);
    } catch (err) {
      // Skip binary files or files we can't read as UTF-8
      continue;
    }
  }
  
  if (allIssues.length === 0) {
    console.log('✅ No forbidden patterns found. Repository is clean.\n');
    process.exit(0);
  }
  
  console.error('❌ Forbidden patterns detected:\n');
  
  // Group by type
  const byType = {
    forbidden_keyword: [],
    em_dash: [],
    horizontal_rule: [],
  };
  
  for (const issue of allIssues) {
    byType[issue.type].push(issue);
  }
  
  // Print forbidden keywords
  if (byType.forbidden_keyword.length > 0) {
    console.error('Forbidden Keywords:');
    for (const issue of byType.forbidden_keyword) {
      console.error(`  ${issue.file}:${issue.line} - found "${issue.keyword}"`);
    }
    console.error('');
  }
  
  // Print em dashes
  if (byType.em_dash.length > 0) {
    console.error('Em Dash Characters:');
    for (const issue of byType.em_dash) {
      console.error(`  ${issue.file}:${issue.line} - found em dash (—)`);
    }
    console.error('');
  }
  
  // Print horizontal rules
  if (byType.horizontal_rule.length > 0) {
    console.error('Markdown Horizontal Rules:');
    for (const issue of byType.horizontal_rule) {
      console.error(`  ${issue.file}:${issue.line} - found horizontal rule (---)`);
    }
    console.error('');
  }
  
  console.error(`Total issues: ${allIssues.length}\n`);
  console.error('Please remove these patterns before committing.\n');
  process.exit(1);
}

main();
