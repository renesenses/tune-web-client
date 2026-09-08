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

const devices = readFileSync(
  resolve(__dirname, '../../components/DevicesSettings.svelte'),
  'utf-8',
);

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
  it('hérité ACTIVÉ : la zone n’a pas de réglage, le général verrouille', () => {
    // `lock_volume: null` = pas de surcharge ; le serveur a déjà résolu
    // l'héritage et renvoie `effective_lock_volume: true`.
    const badge = volumeLockBadge({ lock_volume: null, effective_lock_volume: true });
    expect(badge).toEqual({ locked: true, inherited: true });
    expect(volumeLockLabelKey(badge!)).toBe('devices.volumeLockOn');
    expect(volumeLockOriginKey(badge!)).toBe('devices.volumeLockInherited');
  });

  it('hérité DÉSACTIVÉ : pas de surcharge, le général ne verrouille pas', () => {
    const badge = volumeLockBadge({ lock_volume: null, effective_lock_volume: false });
    expect(badge).toEqual({ locked: false, inherited: true });
    expect(volumeLockLabelKey(badge!)).toBe('devices.volumeLockOff');
    expect(volumeLockOriginKey(badge!)).toBe('devices.volumeLockInherited');
  });

  it('SURCHARGÉ à « activé » : la zone décide, contre un général à l’arrêt', () => {
    const badge = volumeLockBadge({ lock_volume: true, effective_lock_volume: true });
    expect(badge).toEqual({ locked: true, inherited: false });
    expect(volumeLockLabelKey(badge!)).toBe('devices.volumeLockOn');
    expect(volumeLockOriginKey(badge!)).toBe('devices.volumeLockOwn');
  });

  it('SURCHARGÉ à « désactivé » : la zone échappe à un général qui verrouille', () => {
    // Le cas qui compte le plus : la valeur globale dit « verrouillé », la
    // zone dit non. Un badge lu sur le réglage global mentirait ici.
    const badge = volumeLockBadge({ lock_volume: false, effective_lock_volume: false });
    expect(badge).toEqual({ locked: false, inherited: false });
    expect(volumeLockLabelKey(badge!)).toBe('devices.volumeLockOff');
    expect(volumeLockOriginKey(badge!)).toBe('devices.volumeLockOwn');
  });

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

describe('la carte de l’appareil ne fabrique pas son propre héritage', () => {
  it('elle passe par le module de décision, pas par un calcul local', () => {
    expect(devices).toContain("from '../lib/audiophileLockBadge'");
    expect(devices).toContain('volumeLockBadge(state)');
  });

  it('elle ne rejoue jamais l’héritage `surcharge ?? global` côté client', () => {
    // Le seul usage autorisé du store global est de RELANCER la requête ;
    // il ne doit jamais servir à composer l'état affiché.
    expect(devices).not.toMatch(/lock_volume\s*\?\?/);
    expect(devices).not.toMatch(/\$audiophileGlobalLockVolume\s*[?:&|]/);
    expect(devices).toContain('void $audiophileGlobalLockVolume;');
  });

  it('le badge reste en LECTURE SEULE : aucun contrôle sur la carte', () => {
    const from = devices.indexOf('<p\n          class="vol-lock"');
    const to = devices.indexOf('</p>', from);
    expect(from, 'le badge doit exister').toBeGreaterThanOrEqual(0);
    const markup = devices.slice(from, to);
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('onclick');
    expect(markup).not.toContain('onchange');
    // Et aucune écriture ne part de ce composant.
    expect(devices).not.toContain('setAudiophileVolumeLock');
    expect(devices).not.toContain('setZoneVolumeLock');
  });

  it('un état inconnu n’affiche rien du tout dans le gabarit', () => {
    // `{#if … && lockBadges[z.id]}` : `null` ne rend rien.
    expect(devices).toContain('{#if z.id != null && lockBadges[z.id]}');
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
    it(`${locale} : les cinq clés existent et ne sont pas vides`, () => {
      for (const key of KEYS) {
        expect(dict[key], `${locale} / ${key}`).toBeTruthy();
      }
    });
  }

  it('la formulation dit « verrouillé » et « libre », pas la même chose deux fois', () => {
    for (const [locale, dict] of Object.entries(DICTS)) {
      expect(
        dict['devices.volumeLockOn'],
        `${locale} : les deux états doivent se distinguer`,
      ).not.toBe(dict['devices.volumeLockOff']);
      expect(dict['devices.volumeLockInherited']).not.toBe(dict['devices.volumeLockOwn']);
    }
  });
});
