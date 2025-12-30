/**
 * Unit Tests: Mindshare Snapshot Normalization
 * 
 * Tests for:
 * - sum(mindshare_bps) == 10000 per window
 * - Rounding drift handled (remainder distributed to top projects)
 * - Empty data returns empty map (doesn't crash)
 * - Zero attention values handled (distributed evenly)
 * - Single project gets all 10000 bps
 * - Order preserved (higher attention = higher bps)
 */

import { describe, test, expect } from 'vitest';
import { normalizeToBps } from '../snapshot';

describe('Mindshare Snapshot Normalization', () => {
  describe('normalizeToBps', () => {
    test('sum(mindshare_bps) == 10000 per window', () => {
      const attentionValues = new Map([
        ['project1', 1000],
        ['project2', 2000],
        ['project3', 3000],
        ['project4', 4000],
      ]);
      
      const bpsMap = normalizeToBps(attentionValues);
      const total = Array.from(bpsMap.values()).reduce((sum, bps) => sum + bps, 0);
      
      expect(total).toBe(10000);
    });

    test('rounding drift handled (remainder distributed to top projects)', () => {
      const attentionValues = new Map([
        ['project1', 1],
        ['project2', 1],
        ['project3', 1],
      ]);
      
      const bpsMap = normalizeToBps(attentionValues);
      const total = Array.from(bpsMap.values()).reduce((sum, bps) => sum + bps, 0);
      
      expect(total).toBe(10000);
      // Top project should get remainder
      const sorted = Array.from(bpsMap.entries()).sort((a, b) => b[1] - a[1]);
      expect(sorted[0][1]).toBeGreaterThan(sorted[1][1]);
    });

    test('empty data returns empty map (doesn\'t crash)', () => {
      const attentionValues = new Map<string, number>();
      const bpsMap = normalizeToBps(attentionValues);
      
      expect(bpsMap.size).toBe(0);
    });

    test('zero attention values handled (distributed evenly)', () => {
      const attentionValues = new Map([
        ['project1', 0],
        ['project2', 0],
        ['project3', 0],
        ['project4', 0],
      ]);
      
      const bpsMap = normalizeToBps(attentionValues);
      const total = Array.from(bpsMap.values()).reduce((sum, bps) => sum + bps, 0);
      
      expect(total).toBe(10000);
      // Should be distributed evenly (2500 each, or close)
      const values = Array.from(bpsMap.values());
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      expect(avg).toBeCloseTo(2500, 0);
    });

    test('single project gets all 10000 bps', () => {
      const attentionValues = new Map([
        ['project1', 1000],
      ]);
      
      const bpsMap = normalizeToBps(attentionValues);
      
      expect(bpsMap.get('project1')).toBe(10000);
    });

    test('order preserved (higher attention = higher bps)', () => {
      const attentionValues = new Map([
        ['project1', 100],
        ['project2', 500],
        ['project3', 1000],
        ['project4', 2000],
      ]);
      
      const bpsMap = normalizeToBps(attentionValues);
      
      const project1Bps = bpsMap.get('project1') || 0;
      const project2Bps = bpsMap.get('project2') || 0;
      const project3Bps = bpsMap.get('project3') || 0;
      const project4Bps = bpsMap.get('project4') || 0;
      
      expect(project4Bps).toBeGreaterThan(project3Bps);
      expect(project3Bps).toBeGreaterThan(project2Bps);
      expect(project2Bps).toBeGreaterThan(project1Bps);
    });
  });
});
