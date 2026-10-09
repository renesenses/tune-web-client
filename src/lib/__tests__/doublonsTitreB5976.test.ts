/**
 * tune-server-rust#5976 (Dominique Pamingle, fil 2183) — la carte d'une paire
 * de pistes en double ne nommait que A. « Nightfall » et « Nightfall
 * (Instrumental) » s'y présentaient sous le seul titre « Nightfall », et
 * « Garder A » retirait l'instrumental sans que l'utilisateur l'ait vu.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { titreDeCopie, titresDifferent } from '../doublonsCarte';

const vue = readFileSync('src/components/v2/MetadataV2.svelte', 'utf8');

/** Le bloc des paires de pistes SEUL, de `dblPaires.length` à son `{/each}`. */
function blocDesPaires(): string {
  const debut = vue.indexOf('{#if dblPaires.length}');
  expect(debut, 'bloc des paires introuvable').toBeGreaterThan(-1);
  return vue.slice(debut, vue.indexOf('{/each}', debut));
}

describe('carte de doublon de pistes : A et B sont nommés (#5976)', () => {
  it('la carte montre le titre de B, pas seulement sa qualité', () => {
    const bloc = blocDesPaires();
    expect(bloc).toContain('titreDeCopie(p.a)');
    expect(bloc).toContain('titreDeCopie(p.b)');
    // L'écart de titre se voit sur la ligne de B.
    expect(bloc).toContain('class:ecart={titresDifferent(p.a, p.b)}');
  });

  it('titreDeCopie rend le titre, à défaut le fichier (Unix ou Windows), à défaut l’id', () => {
    expect(titreDeCopie({ id: 7, title: 'Nightfall (Instrumental)' })).toBe('Nightfall (Instrumental)');
    expect(titreDeCopie({ id: 7, title: '  ', file_path: '/m/CD2/04 Nightfall.flac' })).toBe('04 Nightfall.flac');
    expect(titreDeCopie({ id: 7, file_path: 'D:\\Musique\\Xandria\\CD2\\04 Nightfall.flac' })).toBe('04 Nightfall.flac');
    expect(titreDeCopie({ id: 7 })).toBe('7');
  });

  it("titresDifferent voit l'instrumental, pas la casse ni la ponctuation", () => {
    const a = { id: 1, title: 'Nightfall' };
    expect(titresDifferent(a, { id: 2, title: 'Nightfall (Instrumental)' })).toBe(true);
    expect(titresDifferent(a, { id: 2, title: 'Stardust' })).toBe(true);
    expect(titresDifferent(a, { id: 2, title: 'NIGHTFALL !' })).toBe(false);
    expect(titresDifferent({ id: 1, title: 'Été' }, { id: 2, title: 'ete' })).toBe(false);
    expect(titresDifferent(a, { id: 2 })).toBe(false);
  });
});
