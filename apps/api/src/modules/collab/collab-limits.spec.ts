import { describe, expect, it } from 'vitest';
import { MessageBudget } from './collab-limits';

describe('ρυθμός μηνυμάτων ανά σύνδεση', () => {
  it('γράψιμο ανθρώπου (ακόμη και γρήγορο) περνά', () => {
    let now = 0;
    const budget = new MessageBudget({ burst: 200, perSecond: 50 }, () => now);
    // 30 μηνύματα το δευτερόλεπτο για ένα λεπτό: πλήκτρα + παρουσία.
    for (let second = 0; second < 60; second += 1) {
      now = second * 1000;
      for (let i = 0; i < 30; i += 1) expect(budget.take()).toBe(true);
    }
  });

  it('πλημμύρα μηνυμάτων κόβεται, και μετά από λίγο ξαναγεμίζει', () => {
    let now = 0;
    const budget = new MessageBudget({ burst: 200, perSecond: 50 }, () => now);
    let accepted = 0;
    for (let i = 0; i < 1000; i += 1) if (budget.take()) accepted += 1;
    expect(accepted).toBe(200);
    now = 2000;
    expect(budget.take()).toBe(true);
  });
});
