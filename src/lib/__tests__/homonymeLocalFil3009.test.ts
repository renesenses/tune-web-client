// Fil 3009, points 7 et 16 — relecture du 23/11 : quand l'artiste local de
// même nom est-il CONFIRMÉ comme celui de la fiche de service ?
import { describe, expect, it } from 'vitest';
import { homonymeLocalConfirme, titreProbant } from '../homonymeLocal';

const UN = [{ id: 42, name: 'Moonchild' }];

describe('homonymeLocalConfirme', () => {
  it('deux titres probants en commun : confirmé', () => {
    expect(homonymeLocalConfirme(UN, 'Moonchild', ['Voyager', 'Little Ghost', 'Be Free'], ['Voyager', 'Little Ghost'])).toBe(42);
  });
  it('🔴 un seul titre commun alors que l’artiste local a plusieurs albums : rien', () => {
    expect(homonymeLocalConfirme(UN, 'Moonchild', ['Voyager', 'Be Free'], ['Voyager', 'Autre'])).toBeNull();
  });
  it('un seul titre commun, probant, et un seul album local : confirmé', () => {
    expect(homonymeLocalConfirme(UN, 'Moonchild', ['Voyager'], ['Voyager', 'Autre'])).toBe(42);
  });
  it('🔴 seul album commun éponyme (#9071) : rien', () => {
    expect(homonymeLocalConfirme(UN, 'Moonchild', ['Moonchild'], ['Moonchild', 'Autre'])).toBeNull();
  });
  it('🔴 seul titre commun générique, ou trop court : rien', () => {
    for (const t of ['Greatest Hits', 'Live', 'Best Of', 'Demo', 'Untitled', 'I', 'II', 'Ode']) {
      expect(homonymeLocalConfirme(UN, 'Moonchild', [t], [t]), t).toBeNull();
    }
  });
  it('les titres non probants ne comptent pas pour atteindre deux', () => {
    expect(homonymeLocalConfirme(UN, 'Moonchild', ['Moonchild', 'Live', 'Voyager'], ['Moonchild', 'Live', 'Voyager'])).toBeNull();
  });
  it('deux homonymes locaux : rien', () => {
    expect(homonymeLocalConfirme([...UN, { id: 43, name: 'Moonchild' }], 'Moonchild', ['Voyager', 'Be Free'], ['Voyager', 'Be Free'])).toBeNull();
  });
  it('titreProbant', () => {
    expect(titreProbant('voyager', 'moonchild')).toBe(true);
    expect(titreProbant('moonchild', 'moonchild')).toBe(false);
    expect(titreProbant('greatest hits', 'moonchild')).toBe(false);
    expect(titreProbant('ode', 'moonchild')).toBe(false);
  });
});
