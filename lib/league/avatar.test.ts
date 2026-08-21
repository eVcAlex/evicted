import { describe, expect, it, vi } from 'vitest';

vi.mock('./avatarManifest', () => ({ AVAILABLE_AVATARS: new Set(['charlie']) }));

import { colorForTeam, initialsFor, photoUrlFor } from './avatar';

describe('initialsFor', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsFor('Borussia Teeth')).toBe('BT');
  });

  it('ignores punctuation attached to a word', () => {
    expect(initialsFor('Høgh are you?')).toBe('HA');
  });

  it('falls back to the first two characters of a single-word name', () => {
    expect(initialsFor('DEFCON')).toBe('DE');
  });

  it('collapses repeated whitespace', () => {
    expect(initialsFor('  Borussia   Teeth  ')).toBe('BT');
  });
});

describe('colorForTeam', () => {
  it('is stable across calls for the same name', () => {
    expect(colorForTeam('Borussia Teeth')).toBe(colorForTeam('Borussia Teeth'));
  });

  it('is not the same for every name', () => {
    const colors = new Set(
      ['Borussia Teeth', 'DEFCON Merchant', 'Høgh are you?'].map(colorForTeam),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('photoUrlFor', () => {
  it('matches a manager whose first name is in the manifest', () => {
    expect(photoUrlFor('Charlie Robinson')).toBe('/avatars/charlie.png');
  });

  it('matches case-insensitively', () => {
    expect(photoUrlFor('CHARLIE Robinson')).toBe('/avatars/charlie.png');
  });

  it('returns null for a manager with no generated photo', () => {
    expect(photoUrlFor('Alex McGuiness')).toBeNull();
  });
});
