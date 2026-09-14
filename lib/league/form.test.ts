import { describe, expect, it } from 'vitest';
import type { GridResult } from '@/lib/gameweekResult';
import { recentForm } from './form';

function result(scores: Record<number, number>): GridResult {
  return { losers: [], scores };
}

describe('recentForm', () => {
  it('returns net scores strictly before the given gameweek, oldest first', () => {
    const results = new Map([
      [1, result({ 1: 40 })],
      [2, result({ 1: 30 })],
      [3, result({ 1: 55 })],
    ]);

    expect(recentForm(results, 1, 4)).toEqual([
      { gameweek: 1, net: 40 },
      { gameweek: 2, net: 30 },
      { gameweek: 3, net: 55 },
    ]);
  });

  it('excludes the gameweek passed as the boundary and anything after it', () => {
    const results = new Map([
      [1, result({ 1: 40 })],
      [2, result({ 1: 30 })],
    ]);

    expect(recentForm(results, 1, 2)).toEqual([{ gameweek: 1, net: 40 }]);
  });

  it('skips gameweeks the entry has no score for', () => {
    const results = new Map([
      [1, result({ 1: 40 })],
      [2, result({ 2: 30 })],
      [3, result({ 1: 55 })],
    ]);

    expect(recentForm(results, 1, 4)).toEqual([
      { gameweek: 1, net: 40 },
      { gameweek: 3, net: 55 },
    ]);
  });

  it('caps to the most recent `limit` points', () => {
    const results = new Map([
      [1, result({ 1: 10 })],
      [2, result({ 1: 20 })],
      [3, result({ 1: 30 })],
      [4, result({ 1: 40 })],
    ]);

    expect(recentForm(results, 1, 5, 2)).toEqual([
      { gameweek: 3, net: 30 },
      { gameweek: 4, net: 40 },
    ]);
  });

  it('returns an empty array when the entry has never recorded a score', () => {
    const results = new Map([[1, result({ 2: 40 })]]);
    expect(recentForm(results, 1, 5)).toEqual([]);
  });
});
