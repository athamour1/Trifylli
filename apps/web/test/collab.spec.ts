import { describe, expect, it } from 'vitest';
import { collabColor } from '@trifylli/shared';
import { collabUrl } from '../src/lib/collab';
import { worstSaveState } from '../src/lib/save-state';

describe('collabUrl', () => {
  it('το WebSocket ζει στο host του API, κάτω από το πρόθεμά του', () => {
    expect(collabUrl('https://api.example.gr/api', 'https://app.example.gr/symvoulia/1')).toBe('wss://api.example.gr/api/collab');
    expect(collabUrl('http://localhost:3000/api/', 'http://localhost:8080/')).toBe('ws://localhost:3000/api/collab');
  });

  it('σχετικό API (ίδιο origin) → ίδιο host με τη σελίδα', () => {
    expect(collabUrl('/api', 'https://trifylli.example.gr/symvoulia/1')).toBe('wss://trifylli.example.gr/api/collab');
  });
});

describe('worstSaveState', () => {
  it('δείχνει ό,τι χρειάζεται προσοχή πρώτο', () => {
    expect(worstSaveState('saved', 'offline')).toBe('offline');
    expect(worstSaveState('clean', 'saving')).toBe('saving');
    expect(worstSaveState('error', 'saved')).toBe('error');
    expect(worstSaveState('clean', 'saved')).toBe('saved');
  });
});

describe('collabColor', () => {
  it('ίδιο άτομο, ίδιο χρώμα — σε κάθε συσκευή', () => {
    expect(collabColor('u-1')).toBe(collabColor('u-1'));
    expect(collabColor('u-1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
