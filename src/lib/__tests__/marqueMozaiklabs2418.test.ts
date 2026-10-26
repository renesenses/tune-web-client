import { describe, expect, it } from 'vitest';
import * as LANGUES from './lesOnzeLangues';

// #2418 — Tune Circle affichait « Tune Circle uses your mozaiklabs account » et
// « Sign in to mozaiklabs » (testeur Alex, rc8). La marque s'écrit
// « Mozaiklabs » — jamais « mozaiklabs » en minuscules dans un texte visible,
// jamais « Mozaik Labs » ni « MozaikLabs ».
//
// Ce qui reste libre : les identifiants techniques. Un nom de domaine
// (`mozaiklabs.fr`), une URL, une adresse (`@mozaiklabs`), un chemin ou un nom
// de clé ne sont pas du texte lu : la garde ne regarde que les VALEURS, et y
// laisse passer `mozaiklabs` quand il est collé à un domaine ou à un chemin.

/** « mozaiklabs » en minuscules, hors domaine, URL, adresse ou identifiant. */
const MINUSCULE = /(?<![A-Za-z0-9_./@:-])mozaiklabs(?![A-Za-z0-9_]|\.[A-Za-z])/;
const AUTRES_GRAPHIES = /Mozaik Labs|MozaikLabs|Mozaik-Labs/;

const dicos = Object.entries(LANGUES) as [string, Record<string, string>][];

describe('#2418 — la marque s’écrit « Mozaiklabs » dans les textes visibles', () => {
  it('toutes les langues sont parcourues', () => {
    expect(dicos.length).toBeGreaterThanOrEqual(14);
  });

  for (const [langue, d] of dicos) {
    it(`🔴 ${langue} : aucun « mozaiklabs » en minuscules dans une valeur`, () => {
      const fautes = Object.entries(d)
        .filter(([, v]) => typeof v === 'string' && MINUSCULE.test(v))
        .map(([k, v]) => `${k} : ${v.slice(0, 90)}`);
      expect(fautes, `${langue} : ${fautes.length} texte(s) visible(s) en minuscules`).toEqual([]);
    });

    it(`${langue} : ni « Mozaik Labs » ni « MozaikLabs »`, () => {
      const fautes = Object.entries(d)
        .filter(([, v]) => typeof v === 'string' && AUTRES_GRAPHIES.test(v))
        .map(([k]) => k);
      expect(fautes).toEqual([]);
    });
  }

  it('l’écran Tune Circle dit « Mozaiklabs », et le domaine reste un domaine', () => {
    const en = LANGUES.en as Record<string, string>;
    expect(en['v2.circle.notConnected']).toContain('Tune Circle uses your Mozaiklabs account');
    expect(en['v2.circle.signIn']).toBe('Sign in to Mozaiklabs');
    expect(en['settings.cloudListensLink']).toContain('mozaiklabs.fr');
  });

  it('le motif sait distinguer un domaine d’un mot', () => {
    expect(MINUSCULE.test('connectez-vous à mozaiklabs')).toBe(true);
    expect(MINUSCULE.test('mozaiklabs.fr a refusé')).toBe(false);
    expect(MINUSCULE.test('https://mozaiklabs.fr/x')).toBe(false);
    expect(MINUSCULE.test('mozaiklabs에 로그인')).toBe(true);
    expect(MINUSCULE.test('Mozaiklabs')).toBe(false);
    // Les composés de l'allemand ou des langues nordiques sont du texte lu.
    expect(MINUSCULE.test('Ihr mozaiklabs-Konto')).toBe(true);
    expect(MINUSCULE.test('Ihr Mozaiklabs-Konto')).toBe(false);
  });
});
