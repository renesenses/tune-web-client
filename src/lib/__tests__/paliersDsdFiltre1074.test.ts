/**
 * #1074 — les paliers DSD dans le filtre des fréquences (Cyrille, fil 1792).
 *
 * Le défaut n'était pas un libellé mal écrit : la liste était FIGÉE dans
 * `LibraryV2` et ne portait que huit valeurs PCM. Un album DSD64
 * (2 822 400 Hz) ne correspondait à AUCUNE entrée — il ne se comptait nulle
 * part et ne se filtrait pas.
 *
 * Le serveur les nomme depuis tune-server-rust#4171 (livré en v0.9.155).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  paliersDeFrequence,
  nommerFrequence,
  localiserDecimale,
  PALIERS_DE_SECOURS,
} from '../libellesFrequence';

const SERVIS = [
  { value: 44100, label: '44.1 kHz', dsd: false },
  { value: 96000, label: '96 kHz', dsd: false },
  { value: 2822400, label: 'DSD64', dsd: true },
  { value: 5644800, label: 'DSD128', dsd: true },
  { value: 3072000, label: 'DSD64 (48k)', dsd: true },
];

describe('#1074 — les paliers', () => {
  it('🔴 le DSD entre dans la liste — il n\'y était pas du tout', () => {
    const p = paliersDeFrequence(SERVIS, 'fr');
    expect(p.map((x) => x.v)).toContain(2822400);
    expect(p.find((x) => x.v === 2822400)?.l).toBe('DSD64');
    expect(p.find((x) => x.v === 2822400)?.dsd).toBe(true);
    // Contre-épreuve : la liste figée d'avant ne connaît AUCUNE de ces valeurs.
    expect(PALIERS_DE_SECOURS.some((r) => r.v === 2822400)).toBe(false);
    expect(PALIERS_DE_SECOURS.every((r) => r.v <= 384000)).toBe(true);
  });

  it('l\'ordre du serveur est conservé tel quel', () => {
    expect(paliersDeFrequence(SERVIS, 'fr').map((x) => x.v))
      .toEqual([44100, 96000, 2822400, 5644800, 3072000]);
  });

  it('la famille 48 k garde son suffixe', () => {
    expect(paliersDeFrequence(SERVIS, 'fr').find((x) => x.v === 3072000)?.l).toBe('DSD64 (48k)');
  });

  it('un serveur qui ne nomme rien retombe sur la liste figée, intacte', () => {
    for (const vide of [undefined, null, [], [{ value: NaN, label: 'x' }]] as any[]) {
      const p = paliersDeFrequence(vide, 'fr');
      expect(p).toHaveLength(PALIERS_DE_SECOURS.length);
      expect(p[0]).toEqual({ v: 44100, l: '44,1 kHz', court: '44,1k', dsd: false });
      expect(p.at(-1)?.v).toBe(384000);
    }
  });
});

describe('#1074 — le séparateur décimal', () => {
  it('le serveur envoie le point, le français lit la virgule', () => {
    expect(localiserDecimale('44.1 kHz', 'fr')).toBe('44,1 kHz');
    expect(paliersDeFrequence(SERVIS, 'fr')[0].l).toBe('44,1 kHz');
  });

  it('l\'anglais garde le point', () => {
    expect(localiserDecimale('44.1 kHz', 'en')).toBe('44.1 kHz');
    expect(paliersDeFrequence(SERVIS, 'en')[0].l).toBe('44.1 kHz');
  });

  it('seul un point ENTRE DEUX CHIFFRES bouge', () => {
    expect(localiserDecimale('DSD64. Voilà.', 'fr')).toBe('DSD64. Voilà.');
  });
});

describe('#1074 — le libellé court des pastilles', () => {
  it('le PCM perd son « kHz », le DSD garde son nom entier', () => {
    const p = paliersDeFrequence(SERVIS, 'fr');
    expect(p.find((x) => x.v === 96000)?.court).toBe('96k');
    expect(p.find((x) => x.v === 44100)?.court).toBe('44,1k');
    expect(p.find((x) => x.v === 2822400)?.court).toBe('DSD64');
  });
});

describe('#1074 — nommer une fréquence isolée (ancienne interface)', () => {
  const p = paliersDeFrequence(SERVIS, 'fr');

  it('le palier connu gagne', () => {
    expect(nommerFrequence(2822400, p)).toBe('DSD64');
  });

  it('🔴 sans palier servi, la forme arithmétique d\'avant est conservée', () => {
    expect(nommerFrequence(44100, [])).toBe('44.1kHz');
    expect(nommerFrequence(48000, [])).toBe('48kHz');
    expect(nommerFrequence(176400, [])).toBe('176.4kHz');
    expect(nommerFrequence(800, [])).toBe('800Hz');
    // …y compris pour le DSD, qui restait illisible : c'est ce que le serveur
    // vient corriger, et non le client.
    expect(nommerFrequence(2822400, [])).toBe('2822.4kHz');
  });
});

describe('#1074 — le branchement', () => {
  it('LibraryV2 ne porte plus de liste figée, et lit le serveur', () => {
    const vue = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');
    expect(vue).toContain('paliersDeFrequence(libellesServis, $locale)');
    expect(vue).toContain('api.getSampleRateLabels()');
    // 🔴 l'ancienne liste figée a quitté la vue.
    expect(vue).not.toContain("{ v: 44100, l: '44,1' }");
    // Le menu affiche le libellé COMPLET : « DSD64 kHz » n'aurait aucun sens.
    expect(vue).not.toContain('{r.l} kHz');
  });

  it('l\'ancienne interface passe par le même nommage', () => {
    const vue = readFileSync('src/components/LibraryView.svelte', 'utf8');
    expect(vue).toContain('nommerFrequence(sr, paliersFrequence)');
  });

  it('l\'appel serveur retombe en silence sur un serveur antérieur', () => {
    const api = readFileSync('src/lib/api.ts', 'utf8');
    const i = api.indexOf('export async function getSampleRateLabels(');
    expect(i).toBeGreaterThan(0);
    const bloc = api.slice(i, api.indexOf('\n}', i));
    expect(bloc).toContain('sample_rate_labels');
    expect(bloc).toContain('return [];');
  });
});
