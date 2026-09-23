import { describe, expect, it } from 'vitest';
import { eseoTypeToMemberKind, isKnownEseoType, mapEseoTypeToKlados } from './member-type';

describe('mapEseoTypeToKlados', () => {
  it('αντιστοιχίζει τους τέσσερις κλάδους', () => {
    expect(mapEseoTypeToKlados('STAR')).toBe('ASTERIA');
    expect(mapEseoTypeToKlados('BIRD')).toBe('POULIA');
    expect(mapEseoTypeToKlados('GUIDE')).toBe('ODIGOI');
    expect(mapEseoTypeToKlados('BIG_GUIDE')).toBe('MEGALOI_ODIGOI');
  });

  it('ρίχνει τους ναυτικούς κλάδους στον αντίστοιχο στεριανό', () => {
    expect(mapEseoTypeToKlados('NAVY_GUIDE')).toBe('ODIGOI');
    expect(mapEseoTypeToKlados('BIG_NAVY_GUIDE')).toBe('MEGALOI_ODIGOI');
  });

  it('είναι ανεκτικό σε κενά/πεζά', () => {
    expect(mapEseoTypeToKlados(' guide ')).toBe('ODIGOI');
  });

  it('επιστρέφει null για ενήλικες, συμβούλια και άγνωστα', () => {
    expect(mapEseoTypeToKlados('ADULT_LEADER')).toBeNull();
    expect(mapEseoTypeToKlados('LOCAL_COUNCIL_MEMBER')).toBeNull();
    expect(mapEseoTypeToKlados('FRIEND_OF_GUIDING')).toBeNull();
    expect(mapEseoTypeToKlados('SOMETHING_NEW')).toBeNull();
    expect(mapEseoTypeToKlados(null)).toBeNull();
    expect(mapEseoTypeToKlados(undefined)).toBeNull();
  });
});

describe('eseoTypeToMemberKind', () => {
  it('τα παιδιά/έφηβοι των κλάδων είναι MELOS', () => {
    for (const t of ['STAR', 'BIRD', 'GUIDE', 'NAVY_GUIDE', 'BIG_GUIDE', 'BIG_NAVY_GUIDE']) {
      expect(eseoTypeToMemberKind(t)).toBe('MELOS');
    }
  });

  it('οι ενήλικες είναι STELEXOS', () => {
    expect(eseoTypeToMemberKind('ADULT_LEADER')).toBe('STELEXOS');
    expect(eseoTypeToMemberKind('LOCAL_COUNCIL_MEMBER')).toBe('STELEXOS');
    expect(eseoTypeToMemberKind('CONFERENCE_MEMBER')).toBe('STELEXOS');
  });

  it('τύπος που λείπει μετράει ως στέλεχος αντί να υποτεθεί παιδί', () => {
    expect(eseoTypeToMemberKind(null)).toBe('STELEXOS');
  });
});

describe('isKnownEseoType', () => {
  it('αναγνωρίζει τους γνωστούς τύπους και απορρίπτει τους υπόλοιπους', () => {
    expect(isKnownEseoType('STAR')).toBe(true);
    expect(isKnownEseoType('adult_leader')).toBe(true);
    expect(isKnownEseoType('MYSTERY')).toBe(false);
    expect(isKnownEseoType(undefined)).toBe(false);
  });
});
