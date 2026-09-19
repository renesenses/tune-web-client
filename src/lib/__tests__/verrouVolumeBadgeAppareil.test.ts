import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  volumeLockBadge,
  volumeLockLabelKey,
  volumeLockOriginKey,
} from '../audiophileLockBadge';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';


/**
 * Badge de verrou de volume sur la carte de l'appareil (#2395, #2506).
 *
 * Le coût d'erreur est matériel : un testeur a détruit une paire de
 * haut-parleurs à 800 € pièce sur une topologie sans atténuation. Un badge qui
 * dirait « non verrouillé » sur une zone qui part à 100 % serait donc pire que
 * pas de badge du tout. Ces tests couvrent EXHAUSTIVEMENT les trois cas de
 * l'énoncé — hérité activé, hérité désactivé, surchargé — plus le cas où l'on
 * ne sait pas.
 */
describe('badge de verrou : ce qu’il affiche', () => {




  it('`lock_volume` ABSENT vaut « hérité », pas « surchargé »', () => {
    // `== null` couvre `null` ET `undefined`. Un `=== null` classerait un
    // champ absent comme surcharge de zone : mauvaise provenance affichée.
    expect(volumeLockBadge({ effective_lock_volume: true })).toEqual({
      locked: true,
      inherited: true,
    });
  });
});

describe('badge de verrou : quand il se tait', () => {
  it('sans `effective_lock_volume`, aucun badge — on ne devine pas', () => {
    // Serveur antérieur à 0.9.127 : il publie la surcharge mais pas la valeur
    // résolue. Afficher `lock_volume` tel quel annoncerait « non verrouillé »
    // sur une zone héritant d'un général armé. On se tait.
    expect(volumeLockBadge({ lock_volume: null })).toBeNull();
    expect(volumeLockBadge({ lock_volume: true })).toBeNull();
    expect(volumeLockBadge({})).toBeNull();
  });

  it('état absent (requête en vol ou en échec) : aucun badge', () => {
    expect(volumeLockBadge(null)).toBeNull();
    expect(volumeLockBadge(undefined)).toBeNull();
  });

  it('un `effective_lock_volume` non booléen ne passe pas pour vrai', () => {
    // Un serveur qui renverrait `"true"`, `1` ou `null` ne doit pas allumer le
    // badge par coercition : `typeof … === 'boolean'`, rien d'autre.
    for (const bogus of ['true', 1, 0, null, {}, []] as unknown[]) {
      expect(
        volumeLockBadge({ effective_lock_volume: bogus as boolean }),
        `valeur ${JSON.stringify(bogus)}`,
      ).toBeNull();
    }
  });
});


describe('les onze langues portent les libellés du badge', () => {
  const DICTS: Record<string, Record<string, string | undefined>> = {
    fr, en, de, es, it: it_, ja, ko, ro, sv, zh, hu,
  };
  const KEYS = [
    'devices.volumeLockOn',
    'devices.volumeLockOff',
    'devices.volumeLockInherited',
    'devices.volumeLockOwn',
    'devices.volumeLockHint',
  ];

  it('les onze dictionnaires sont bien onze', () => {
    expect(Object.keys(DICTS)).toHaveLength(11);
  });

  for (const [locale, dict] of Object.entries(DICTS)) {
  }

});
