// Fil 3009 (FabienM, 1.0.0-rc13), point 17 — « Menu bibliothèque : page
// artiste, toutes les sources activées : regrouper les albums qui ont
// plusieurs sources et afficher toutes les sources sous la vignette ».
//
// Les cas viennent de la mesure du 23/11/2026 sur le .18 (bibliothèque,
// Qobuz et TIDAL réunis sur la page artiste) : le même album en deux
// vignettes, parce qu'une parenthèse finale ne nommait PAS une autre édition.
import { describe, expect, it } from 'vitest';
import type { Album } from '../types';
import { cleRegroupement, fusionnerDiscographie, versionsEntree } from '../discographieCommune';

const album = (title: string, extra: Partial<Album> = {}) => ({ id: null, title, ...extra }) as unknown as Album;
const local = (title: string, extra: Partial<Album> = {}) => album(title, { id: Math.floor(Math.random() * 1e6), source: 'local', ...extra } as Partial<Album>);
const titresParVignette = (entrees: ReturnType<typeof fusionnerDiscographie>) =>
  entrees.map((e) => [e.principal.album.title, e.sources]);

describe('fil 3009 point 17 — une même édition sur plusieurs sources = une vignette', () => {
  it('🔴 la résolution du fichier dans le titre local ne sépare pas l’album de Qobuz et de TIDAL', () => {
    const entrees = fusionnerDiscographie(
      [local('Wish You Were Here (192kHz/24bit)', { bit_depth: 24, sample_rate: 192000, format: 'flac' } as Partial<Album>)],
      [
        { service: 'qobuz', albums: [album('Wish You Were Here')] },
        { service: 'tidal', albums: [album('Wish You Were Here')] },
      ],
    );
    expect(titresParVignette(entrees)).toEqual([['Wish You Were Here (192kHz/24bit)', ['local', 'qobuz', 'tidal']]]);
    // Et la vignette dit la résolution de la bibliothèque sous la pochette.
    expect(versionsEntree(entrees[0]).find((v) => v.source === 'local')?.resolution).toBe('24/192');
  });

  it('🔴 une parenthèse qui répète le titre (Qobuz) ne sépare pas l’album de TIDAL', () => {
    const entrees = fusionnerDiscographie([], [
      { service: 'qobuz', albums: [album('Live at the Map Room (Live)'), album('Live at Knebworth 1990 (Live at Knebworth 1990)'), album('Standards, Vol. 2 (Vol. 2)')] },
      { service: 'tidal', albums: [album('Live at the Map Room'), album('Live at Knebworth 1990'), album('Standards, Vol. 2')] },
    ]);
    expect(entrees).toHaveLength(3);
    for (const e of entrees) expect(e.sources).toEqual(['qobuz', 'tidal']);
  });

  it('les formes de résolution des boutiques', () => {
    for (const t of ['Meddle (96kHz/24bit)', 'Meddle (88.2kHz/24bit)', 'Meddle [24bit-96kHz]', 'Meddle (24-bit/192kHz)', 'Meddle (44.1 kHz / 16 bit)']) {
      expect(cleRegroupement(t), t).toBe('meddle');
    }
  });

  it('une AUTRE édition garde sa vignette (règle 1 de FabienM, 17/09)', () => {
    const entrees = fusionnerDiscographie([local('The Wall'), local('Pulse')], [
      { service: 'qobuz', albums: [
        album('The Wall (Remastered 2011 Version)'), album('Pulse (Live)'),
        album('Kind of Blue'), album('Kind of Blue (Mono) (Mono Version)'), album('Tutu (Deluxe)'),
      ] },
      { service: 'tidal', albums: [album('Tutu')] },
    ]);
    expect(entrees.map((e) => e.principal.album.title).sort()).toEqual([
      'Kind of Blue', 'Kind of Blue (Mono) (Mono Version)', 'Pulse', 'Pulse (Live)',
      'The Wall', 'The Wall (Remastered 2011 Version)', 'Tutu', 'Tutu (Deluxe)',
    ].sort());
  });

  it('deux albums de la bibliothèque restent deux vignettes, même de clé égale', () => {
    const entrees = fusionnerDiscographie([local('Meddle'), local('Meddle (192kHz/24bit)')], [
      { service: 'qobuz', albums: [album('Meddle')] },
    ]);
    expect(entrees).toHaveLength(2);
    expect(entrees.filter((e) => e.sources.includes('qobuz'))).toHaveLength(1);
  });

  it('un titre fait seulement d’une parenthèse n’est pas vidé', () => {
    expect(cleRegroupement('(What’s the Story) Morning Glory?')).toBe('whats the story morning glory');
    expect(cleRegroupement('(192kHz/24bit)')).toBe('192khz 24bit');
  });
});
