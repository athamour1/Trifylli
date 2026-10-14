import { describe, expect, it } from 'vitest';
import { scheduleCaption } from '../src/components/drasi/types';

describe('scheduleCaption', () => {
  it('είδος, τόπος και υπεύθυνος, με τελείες ανάμεσα', () => {
    expect(scheduleCaption({ kindLabel: 'Δραστηριότητα', location: 'Αυλή', responsibles: ['Νταμόπουλος Θανάσης'] }, false)).toBe(
      'Δραστηριότητα · Αυλή · υπεύθυνος: Νταμόπουλος Θανάσης',
    );
  });

  it('πολλοί υπεύθυνοι: πληθυντικός, με κόμματα', () => {
    expect(scheduleCaption({ kindLabel: 'Γεύμα', location: null, responsibles: ['Α Β', 'Γ Δ'] }, false)).toBe('Γεύμα · υπεύθυνοι: Α Β, Γ Δ');
  });

  it('στο κινητό: χωρίς είδος και χωρίς «υπεύθυνος:» — μόνο τόπος και ονόματα', () => {
    expect(scheduleCaption({ kindLabel: 'Δραστηριότητα', location: 'Αυλή', responsibles: ['Νταμόπουλος Θανάσης'] }, true)).toBe('Αυλή · Νταμόπουλος Θανάσης');
    expect(scheduleCaption({ kindLabel: 'Δραστηριότητα', location: null, responsibles: ['Α Β', 'Γ Δ'] }, true)).toBe('Α Β, Γ Δ');
  });

  it('στο κινητό χωρίς τόπο και υπεύθυνο: κενή, όχι τελεία', () => {
    expect(scheduleCaption({ kindLabel: 'Δραστηριότητα', location: null, responsibles: [] }, true)).toBe('');
  });
});
