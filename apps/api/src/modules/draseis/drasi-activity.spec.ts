import { describe, expect, it } from 'vitest';
import { activityOfDocument, activityOfRoom, sameLine } from './drasi-activity';

const D = '3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b';
const I = '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';
const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 10, minute));

describe('ροή δραστηριότητας της δράσης', () => {
  it('οι συνεχόμενες αλλαγές του ίδιου ατόμου στο ίδιο σημείο γίνονται μία γραμμή', () => {
    const last = { actorId: 'u-1', topic: 'schedule', verb: 'change', updatedAt: at(0) };
    expect(sameLine(last, { actorId: 'u-1', topic: 'schedule', verb: 'change', at: at(10) })).toBe(true);
  });

  it('άλλο άτομο, άλλο σημείο, άλλη πράξη ή μεγάλη παύση: νέα γραμμή', () => {
    const last = { actorId: 'u-1', topic: 'schedule', verb: 'change', updatedAt: at(0) };
    expect(sameLine(last, { actorId: 'u-2', topic: 'schedule', verb: 'change', at: at(1) })).toBe(false);
    expect(sameLine(last, { actorId: 'u-1', topic: 'groups', verb: 'change', at: at(1) })).toBe(false);
    expect(sameLine(last, { actorId: 'u-1', topic: 'schedule', verb: 'remove', at: at(1) })).toBe(false);
    expect(sameLine(last, { actorId: 'u-1', topic: 'schedule', verb: 'change', at: at(16) })).toBe(false);
    expect(sameLine(null, { actorId: 'u-1', topic: 'schedule', verb: 'change', at: at(1) })).toBe(false);
  });

  it('τα κοινά έγγραφα της δράσης γίνονται θέματα «doc:…»', () => {
    expect(activityOfDocument(`drasi:${D}:item:${I}`)).toEqual({ drasiId: D, topic: 'doc:item' });
    expect(activityOfDocument(`drasi:${D}:meal:${I}`)).toEqual({ drasiId: D, topic: 'doc:meal' });
    expect(activityOfDocument(`drasi:${D}:mythos`)).toEqual({ drasiId: D, topic: 'doc:mythos' });
    expect(activityOfDocument(`drasi:${D}:room`)).toBeNull();
    expect(activityOfDocument(`symvoulio:${D}`)).toBeNull();
  });

  it('μόνο το δωμάτιο της δράσης γράφει στη ροή της — όχι η ίδια η ροή', () => {
    expect(activityOfRoom(`drasi:${D}:room`, 'schedule')).toEqual({ drasiId: D, topic: 'schedule' });
    expect(activityOfRoom(`drasi:${D}:room`, 'activity')).toBeNull();
    expect(activityOfRoom(`syggentrwsh:${D}`, 'header')).toBeNull();
  });
});
