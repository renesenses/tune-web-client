// tune-web-client#3173 (fil forum 2713, rc12) — Bibliothèque › Qualité :
// les choix de CANAUX (Stéréo, Multicanal) et de PALIERS (DSD, Hi-Res, CD…)
// s'additionnaient (OU). Règle : OU dans chaque groupe, ET entre les deux,
// sur la MÊME version. Décision de Bertrand (17/11) : sous un filtre de
// canaux, une carte regroupée s'affiche si l'une de ses versions répond, et
// présente la version qui répond.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { qualitesPourCompter, repondAuxQualites } from '../qualiteCanaux';
import { comptesProfondeur, comptesQualite, correspond, versionQuiCorrespond, type FiltresBibliotheque, type Outils } from '../facettesBibliotheque';
import { regrouperAlbums } from '../oeuvres';
import { estMulticanal, estStereo, getQualityTier } from '../utils';
import { filtrerFocus, fusionnerDiscographie } from '../discographieCommune';
import type { Album } from '../types';

const al = (o: Record<string, unknown>) => o as unknown as Album;

// Même lecture que `tierMatches` de LibraryV2.
function qualiteDe(a: Album, cle: string): boolean {
  if (cle === 'multichannel') return estMulticanal(a);
  if (cle === 'stereo') return estStereo(a);
  const t = getQualityTier(a);
  if (cle === 'hires') return t === 'hires' || t === 'hires_max';
  return t === cle;
}

const filtres = (qualite: string[]): FiltresBibliotheque => ({
  qualite, frequence: [], annee: null, format: [], profondeur: [], recherche: '',
  compilation: null, provenance: null,
});

const DSD_20 = al({ id: 1, title: 'DSD 2.0', format: 'dsf', sample_rate: 2822400, bit_depth: 1, min_channels: 2, max_channels: 2 });
const DSD_51 = al({ id: 2, title: 'DSD 5.1', format: 'dsf', sample_rate: 2822400, bit_depth: 1, min_channels: 6, max_channels: 6 });
const PCM_51 = al({ id: 3, title: 'PCM 5.1', format: 'flac', sample_rate: 96000, bit_depth: 24, min_channels: 6, max_channels: 6 });
const CD_20 = al({ id: 4, title: 'CD 2.0', format: 'flac', sample_rate: 44100, bit_depth: 16, min_channels: 2, max_channels: 2 });
const MP3_20 = al({ id: 5, title: 'MP3 2.0', format: 'mp3', sample_rate: 44100, bit_depth: 16, min_channels: 2, max_channels: 2 });
const BIBLIO = [DSD_20, DSD_51, PCM_51, CD_20, MP3_20];

describe('#3173 — repondAuxQualites : OU dans un groupe, ET entre les groupes', () => {
  const dsd51 = (c: string) => qualiteDe(DSD_51, c);
  const dsd20 = (c: string) => qualiteDe(DSD_20, c);
  it('aucun choix : tout passe', () => {
    expect(repondAuxQualites([], () => false)).toBe(true);
  });
  it('DSD + Multicanal : le DSD 5.1 oui, le DSD 2.0 non', () => {
    expect(repondAuxQualites(['dsd', 'multichannel'], dsd51)).toBe(true);
    expect(repondAuxQualites(['dsd', 'multichannel'], dsd20)).toBe(false);
  });
  it('DSD + Stéréo + Multicanal : les deux DSD', () => {
    expect(repondAuxQualites(['dsd', 'stereo', 'multichannel'], dsd51)).toBe(true);
    expect(repondAuxQualites(['dsd', 'stereo', 'multichannel'], dsd20)).toBe(true);
  });
  it('compter « Multicanal » sous « DSD » applique DSD ; compter « CD » sous « DSD » ne l’applique pas', () => {
    expect(qualitesPourCompter(['dsd'], 'multichannel')).toEqual(['dsd', 'multichannel']);
    expect(qualitesPourCompter(['dsd', 'stereo'], 'cd')).toEqual(['stereo', 'cd']);
    expect(qualitesPourCompter(['stereo'], 'multichannel')).toEqual(['multichannel']);
  });
});

describe('#3173 — la grille de la Bibliothèque (cartes simples)', () => {
  const o: Outils = { qualiteDe, anneeDe: () => null, plier: (s) => (s ?? '').toLowerCase(), provenanceDe: () => 'local' };
  const titres = (q: string[]) => BIBLIO.filter((a) => correspond(a, filtres(q), o)).map((a) => a.title);

  it('DSD seul : les deux DSD', () => {
    expect(titres(['dsd'])).toEqual(['DSD 2.0', 'DSD 5.1']);
  });
  it('Multicanal seul : les multicanaux, DSD ou non', () => {
    expect(titres(['multichannel'])).toEqual(['DSD 5.1', 'PCM 5.1']);
  });
  it('DSD + Multicanal : le DSD multicanal seulement (fil 2713)', () => {
    expect(titres(['dsd', 'multichannel'])).toEqual(['DSD 5.1']);
  });
  it('DSD + Stéréo : le DSD stéréo seulement', () => {
    expect(titres(['dsd', 'stereo'])).toEqual(['DSD 2.0']);
  });
  it('DSD + Stéréo + Multicanal : tous les DSD, pas toute la bibliothèque', () => {
    expect(titres(['dsd', 'stereo', 'multichannel'])).toEqual(['DSD 2.0', 'DSD 5.1']);
  });
  it('Stéréo + Multicanal : tout ce dont on connaît les canaux', () => {
    expect(titres(['stereo', 'multichannel'])).toEqual(BIBLIO.map((a) => a.title));
  });
  it('DSD + CD (même groupe) : toujours un OU', () => {
    expect(titres(['dsd', 'cd'])).toEqual(['DSD 2.0', 'DSD 5.1', 'CD 2.0']);
  });
  it('les compteurs suivent : sous « DSD », Multicanal = 1, Stéréo = 1, CD = 1', () => {
    const n = comptesQualite(BIBLIO, filtres(['dsd']), o, ['dsd', 'cd', 'stereo', 'multichannel']);
    expect(Object.fromEntries(n)).toEqual({ dsd: 2, cd: 1, stereo: 1, multichannel: 1 });
  });
  it('sous « Multicanal », DSD = 1 et Hi-Res = 1', () => {
    const n = comptesQualite(BIBLIO, filtres(['multichannel']), o, ['dsd', 'hires', 'cd', 'multichannel', 'stereo']);
    expect(Object.fromEntries(n)).toEqual({ dsd: 1, hires: 1, cd: 0, multichannel: 2, stereo: 3 });
  });
});

describe('#3173 — cartes regroupées (#7617) : la version qui répond', () => {
  // Œuvre « SACD » : DSD 2.0 préférée + DSD 5.1. Œuvre « Remaster » : 5.1 PCM
  // préférée + CD 2.0. Œuvre « Mixte » : DSD 2.0 préférée + PCM 5.1.
  const sacd20 = al({ id: 10, title: 'SACD (2.0)', format: 'dsf', sample_rate: 2822400, bit_depth: 1, min_channels: 2, max_channels: 2 });
  const sacd51 = al({ id: 11, title: 'SACD (5.1)', format: 'dsf', sample_rate: 2822400, bit_depth: 1, min_channels: 6, max_channels: 6 });
  const rem51 = al({ id: 20, title: 'Remaster (5.1)', format: 'flac', sample_rate: 96000, bit_depth: 24, min_channels: 6, max_channels: 6 });
  const rem20 = al({ id: 21, title: 'Remaster (2.0)', format: 'flac', sample_rate: 44100, bit_depth: 16, min_channels: 2, max_channels: 2 });
  const mix20 = al({ id: 30, title: 'Mixte (DSD 2.0)', format: 'dsf', sample_rate: 2822400, bit_depth: 1, min_channels: 2, max_channels: 2 });
  const mix51 = al({ id: 31, title: 'Mixte (PCM 5.1)', format: 'flac', sample_rate: 96000, bit_depth: 24, min_channels: 6, max_channels: 6 });
  const r = regrouperAlbums([sacd20, sacd51, rem51, rem20, mix20, mix51], [
    { work_id: 'sacd', preferred_id: 10, ids: [10, 11] },
    { work_id: 'rem', preferred_id: 20, ids: [20, 21] },
    { work_id: 'mix', preferred_id: 30, ids: [30, 31] },
  ]);
  const o: Outils = {
    qualiteDe, anneeDe: () => null, plier: (s) => (s ?? '').toLowerCase(), provenanceDe: () => 'local',
    versionsDe: (a) => (a.id != null ? r.membres.get(a.id) : undefined) ?? [a],
  };
  const presentees = (q: string[]) =>
    r.albums.map((a) => versionQuiCorrespond(a, filtres(q), o)).filter(Boolean).map((v) => v!.title);

  it('une carte par œuvre, la préférée sans filtre', () => {
    expect(r.albums.map((a) => a.id)).toEqual([10, 20, 30]);
    expect(presentees([])).toEqual(['SACD (2.0)', 'Remaster (5.1)', 'Mixte (DSD 2.0)']);
  });
  it('les versions de chaque carte, la gardée d’abord, et la carte de chaque version', () => {
    expect(r.membres.get(20)!.map((a) => a.id)).toEqual([20, 21]);
    expect(r.carteDe.get(21)).toBe(20);
    expect(r.carteDe.get(11)).toBe(10);
  });
  it('la carte porte le MINIMUM des canaux aussi : la 5.1 préférée sort sous « Stéréo »', () => {
    const carte = r.albums.find((a) => a.id === 20)!;
    expect(carte.min_channels).toBe(2);
    expect(carte.max_channels).toBe(6);
    expect(estStereo(carte)).toBe(true);
  });
  it('Multicanal : chaque carte présente sa version multicanale', () => {
    expect(presentees(['multichannel'])).toEqual(['SACD (5.1)', 'Remaster (5.1)', 'Mixte (PCM 5.1)']);
  });
  it('Stéréo : chaque carte présente sa version stéréo', () => {
    expect(presentees(['stereo'])).toEqual(['SACD (2.0)', 'Remaster (2.0)', 'Mixte (DSD 2.0)']);
  });
  it('DSD + Multicanal : la carte dont aucune version n’est DSD 5.1 sort', () => {
    expect(presentees(['dsd', 'multichannel'])).toEqual(['SACD (5.1)']);
  });
  it('Stéréo + Multicanal : toutes les cartes, sous leur préférée', () => {
    expect(presentees(['stereo', 'multichannel'])).toEqual(['SACD (2.0)', 'Remaster (5.1)', 'Mixte (DSD 2.0)']);
  });
  it('les compteurs comptent des CARTES : sous DSD, Multicanal = 1', () => {
    const n = comptesQualite(r.albums, filtres(['dsd']), o, ['multichannel', 'stereo', 'dsd']);
    expect(Object.fromEntries(n)).toEqual({ multichannel: 1, stereo: 2, dsd: 2 });
  });
  it('les autres facettes se comptent sur la version présentée', () => {
    // Sous « Stéréo », la carte Remaster présente son 2.0 en 16 bits, pas sa
    // préférée 5.1 en 24 bits.
    expect(comptesProfondeur(r.albums, filtres(['stereo']), o)).toEqual([[1, 2], [16, 1]]);
  });
});

describe('#3173 — Focus Qualité de la page d’un artiste', () => {
  const e = fusionnerDiscographie([DSD_20, DSD_51, PCM_51, CD_20], []);
  const titres = (q: any[]) =>
    filtrerFocus(e, { sources: new Set(), qualites: new Set(q) }).map((x) => x.principal.album.title);
  it('DSD seul, Multicanal seul : inchangés', () => {
    expect(titres(['dsd'])).toEqual(['DSD 2.0', 'DSD 5.1']);
    expect(titres(['multichannel'])).toEqual(['DSD 5.1', 'PCM 5.1']);
  });
  it('DSD + Multicanal : le DSD multicanal seulement', () => {
    expect(titres(['dsd', 'multichannel'])).toEqual(['DSD 5.1']);
  });
});

describe('#3173 — LibraryV2 est branchée sur la règle', () => {
  const src = readFileSync(resolve(__dirname, '../../components/v2/LibraryV2.svelte'), 'utf8');
  it('le filtre lit repondAuxQualites, plus fQuality.some(tierMatches)', () => {
    expect(src).toContain('repondAuxQualites(fQuality, (c) => tierMatches(v, c))');
    expect(src).not.toContain('fQuality.some((c) => tierMatches(a, c))');
  });
  it('la grille présente la version qui répond, et les compteurs cherchent dans les versions', () => {
    expect(src).toMatch(/sorted\.flatMap\(\(a\) => \{ const v = versionAffichee\(a, true, true\)/);
    expect(src).toMatch(/albumsParMot: idsParMotServeur, versionsDe,/);
  });
});
