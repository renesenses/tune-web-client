// renesenses/tune-web-client#2735 — la recherche d'un réglage est tolérante :
// accents, casse, débuts de mots, petites fautes, synonymes de chaque langue.
// Un résultat par RÉGLAGE, avec son chemin.
import { describe, expect, it } from 'vitest';
import { searchReglages, distance, correspondance, normaliser, masqueAuNiveau, REGLAGES } from '../reglagesIndex';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const fr = lFr as unknown as Record<string, string>;
const en = lEn as unknown as Record<string, string>;
const enFr = (k: string) => fr[k] ?? k;
const enAnglais = (k: string) => en[k] ?? fr[k] ?? k;
const ids = (q: string, resolve = enFr, n = 10) => searchReglages(q, resolve, n).map((h) => h.reglage.id);

describe('#2735 — normalisation et distance', () => {
  it('ignore accents, casse et ponctuation', () => {
    expect(normaliser('Égaliseur — BANDES')).toBe('egaliseur bandes');
    expect(normaliser("l'écran")).toBe('l ecran');
  });
  it('compte une transposition pour une seule faute', () => {
    expect(distance('replaygian', 'replaygain', 2)).toBe(1);
    expect(distance('wasapi', 'wasapi', 1)).toBe(0);
    expect(distance('abc', 'xyzuvw', 1)).toBe(2); // bornée : max + 1
  });
  it('préfixe > contenu > faute', () => {
    const mots = ['bandes', 'egaliseur'];
    expect(correspondance('egaliseur', 'bandes egaliseur', mots)).toBe(1);
    expect(correspondance('egal', 'bandes egaliseur', mots)).toBe(0.9);
    expect(correspondance('aliseur', 'bandes egaliseur', mots)).toBe(0.7);
    expect(correspondance('egaliseru', 'bandes egaliseur', mots)).toBeGreaterThan(0);
    expect(correspondance('xyz', 'bandes egaliseur', mots)).toBe(0);
  });
});

describe('#2735 — trouver UN réglage', () => {
  it('trop court : rien (deux caractères au moins)', () => {
    expect(searchReglages('a', enFr)).toEqual([]);
    expect(searchReglages('   ', enFr)).toEqual([]);
  });

  it('sans accents ni majuscules', () => {
    expect(ids('EGALISEUR')).toContain('bandes-egaliseur');
    expect(ids('ecran de demarrage')).toContain('ecran-demarrage');
  });

  it('par le début d’un mot', () => {
    expect(ids('wasa')).toContain('mode-wasapi');
    expect(ids('repla')[0]).toMatch(/^replaygain/);
  });

  it('malgré une petite faute de frappe', () => {
    expect(ids('replaygian')).toContain('replaygain');
    expect(ids('telemetire')).toContain('telemetrie');
    expect(ids('egalisuer')).toContain('bandes-egaliseur');
  });

  it('par un synonyme des fichiers de langue (« bit-perfect », « exclusif »)', () => {
    expect(ids('exclusif')).toContain('mode-wasapi');
    expect(ids('bit-perfect')).toEqual(expect.arrayContaining(['mode-wasapi', 'zone-bitperfect-strict']));
    expect(ids('normalisation')).toContain('replaygain');
    expect(ids('surround')).toContain('zone-canaux');
  });

  it('dans la langue de l’interface : l’anglais trouve « room correction »', () => {
    expect(ids('room correction', enAnglais)[0]).toBe('zone-correction-piece');
    expect(ids('exclusive', enAnglais)).toContain('mode-wasapi');
  });

  it('par un terme technique qui ne se traduit pas', () => {
    expect(ids('dop')).toEqual(expect.arrayContaining(['dsd-reseau', 'zone-dsd']));
    expect(ids('lrclib')[0]).toBe('paroles-lrclib');
    expect(ids('hqplayer')).toEqual(expect.arrayContaining(['hqplayer-actif', 'hqplayer-adresse']));
  });

  it('tous les mots doivent trouver (ET), et l’ordre de l’écran départage', () => {
    const hits = searchReglages('volume zone', enFr, 50);
    expect(hits.length).toBeGreaterThan(0);
    expect(searchReglages('wasapi xylophone', enFr)).toEqual([]);
  });

  it('un résultat porte son chemin onglet › section › réglage, traduit', () => {
    const h = searchReglages('wasapi', enFr)[0];
    expect(h.reglage.id).toBe('mode-wasapi');
    expect(h.chemin).toEqual([fr['settings.tabAudio'], fr['settings.localAudio'], fr['settings.wasapiMode']]);
    expect(h.niveau).toBe('expert');
  });

  it('un réglage masqué par le niveau est RENDU, et dit masqué', () => {
    const h = searchReglages('commande vocale', enFr)[0];
    expect(h.reglage.id).toBe('commande-vocale');
    expect(masqueAuNiveau(h.reglage, 'beginner')).toBe(true);
  });

  it('chaque libellé de l’index se retrouve par lui-même, dans chaque langue', { timeout: 60_000 }, () => {
    const rates: string[] = [];
    for (const lg of ONZE_LANGUES) {
      const dict = dictionnaire(lg);
      const resolve = (k: string) => dict[k] ?? fr[k] ?? k;
      for (const r of REGLAGES) {
        if (!r.labelKey) continue;
        const libelle = resolve(r.labelKey).replace(/\{[^}]*\}/g, ' ');
        if (normaliser(libelle).replace(/ /g, '').length < 2) continue;
        if (!searchReglages(libelle, resolve, 200).some((h) => h.reglage.id === r.id)) rates.push(`${lg}:${r.id}`);
      }
    }
    expect(rates).toEqual([]);
  });
});
