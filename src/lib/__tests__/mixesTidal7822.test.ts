/**
 * tune-server-rust#7822 — la rangée « Vos mixes » de Streaming › TIDAL.
 *
 * Le serveur sert les mixes du compte sous `/streaming/tidal/mixes`, comme des
 * playlists de service (`source_id` = `mix:<id>`). La rangée les montre, les
 * lit et les ajoute à la file par le chemin des playlists ; un compte sans mix
 * ou une route absente ne montrent rien, sans erreur.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chargerMixes, estUnMix, proposeDesMixes, sousTitreDeMix } from '../mixesTidal';
import type { StreamingPlaylist } from '../types';

const mix = (source_id: string, name: string): StreamingPlaylist =>
  ({ source_id, name, description: null, track_count: 0, duration_ms: 0, cover_path: null }) as StreamingPlaylist;

describe('#7822 — les mixes du compte TIDAL', () => {
  it('🔴 rend les mixes servis par le serveur, dans leur ordre', async () => {
    const lire = vi.fn(async () => [
      mix('mix:0011aa', 'My Daily Discovery'),
      mix('mix:0022bb', 'My Mix 1'),
      mix('mix:0033cc', 'My New Arrivals'),
    ]);
    const mixes = await chargerMixes('tidal', lire);
    expect(lire).toHaveBeenCalledWith('tidal');
    expect(mixes.map((m) => m.name)).toEqual(['My Daily Discovery', 'My Mix 1', 'My New Arrivals']);
  });

  it('un compte sans mix donne une liste vide', async () => {
    expect(await chargerMixes('tidal', async () => [])).toEqual([]);
    expect(await chargerMixes('tidal', async () => null)).toEqual([]);
  });

  it('une route absente ou en panne donne une liste vide, sans erreur', async () => {
    await expect(chargerMixes('tidal', async () => { throw new Error('HTTP 404'); })).resolves.toEqual([]);
  });

  it('écarte une entrée sans identifiant, qui ne se lirait pas', async () => {
    const mixes = await chargerMixes('tidal', async () => [mix('', 'Sans id'), mix('mix:0011aa', 'My Mix 1')]);
    expect(mixes.map((m) => m.source_id)).toEqual(['mix:0011aa']);
  });

  it('les autres services ne demandent rien au serveur', async () => {
    const lire = vi.fn(async () => [mix('mix:x', 'x')]);
    expect(await chargerMixes('qobuz', lire)).toEqual([]);
    expect(await chargerMixes(null, lire)).toEqual([]);
    expect(lire).not.toHaveBeenCalled();
    expect(proposeDesMixes('tidal')).toBe(true);
  });
});

describe('#7822 — la rangée « Vos mixes » de l’écran Streaming', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'), 'utf-8')
    .replace(/<!--[\s\S]*?-->/g, '');

  it('🔴 la rangée se dessine dans l’onglet éditorial, avec les tuiles de playlist', () => {
    const debut = source.indexOf("{:else if sub === 'editorial'}");
    expect(debut, 'onglet éditorial introuvable').toBeGreaterThan(-1);
    const bloc = source.slice(debut, source.indexOf('{#if isBc}', debut));
    expect(bloc).toContain('{#if !isBc && mixes.length}');
    expect(bloc).toContain("$t('v2.stream.yourMixes' as any)");
    // Lire et ouvrir comme une playlist : `streaming_playlist_id` = `mix:<id>`.
    expect(bloc).toMatch(/\{#each mixes as p \(p\.source_id\)\}\{@render tile\(p, \(\) => playPlaylist\(p\), 'playlist', \(\) => ouvrirCalquePlaylist\(p\)\)\}/);
  });

  it('🔴 les mixes viennent de la route du serveur', () => {
    expect(source).toContain('chargerMixes(svc, api.getStreamingMixes)');
    const api = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf-8');
    expect(api).toMatch(/export function getStreamingMixes\(service: string\)[\s\S]{0,200}\/streaming\/\$\{encodeURIComponent\(service\)\}\/mixes`/);
  });
});

describe('#7822 — la tuile d’un mix (renvoi de revue : « 0 titres »)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'), 'utf-8')
    .replace(/<!--[\s\S]*?-->/g, '');

  it('reconnaît un mix à son identifiant `mix:`, pas une playlist', () => {
    expect(estUnMix(mix('mix:0011aa', 'My Mix 1'))).toBe(true);
    expect(estUnMix({ source_id: '1a2b-uuid' })).toBe(false);
    expect(estUnMix(null)).toBe(false);
  });

  it('🔴 la deuxième ligne d’un mix donne ses artistes, ou rien, jamais un nombre', () => {
    expect(sousTitreDeMix({ ...mix('mix:a', 'My Mix 1'), description: 'GoGo Penguin, Nils Frahm, Hania Rani' }))
      .toBe('GoGo Penguin, Nils Frahm, Hania Rani');
    expect(sousTitreDeMix(mix('mix:a', 'My Mix 1'))).toBe('');
  });

  /**
   * Rejoue la `pSub` de l'écran, telle qu'écrite dans le composant, sur un
   * mix servi avec `track_count: 0` : la tuile ne doit PAS écrire « 0 titres ».
   */
  it('🔴 la tuile d’un mix n’affiche pas « 0 titres »', () => {
    const m = source.match(/const pSub = \(p: any\) =>([\s\S]*?);\n/);
    expect(m, 'pSub introuvable').not.toBeNull();
    const t = (k: string) => (k === 'v2.lib.trackCount' ? '{count} titres' : k);
    const pSub = new Function('p', '$t', 'estUnMix', 'sousTitreDeMix', `return (${m![1].replace(/ as any/g, "")});`) as
      (p: any, $t: typeof t, e: typeof estUnMix, s: typeof sousTitreDeMix) => string;
    const sans = mix('mix:0011aa', 'My Daily Discovery');
    const avec = { ...sans, description: 'GoGo Penguin, Nils Frahm' };
    expect(pSub(sans, t, estUnMix, sousTitreDeMix), 'un mix sans artistes montrait « 0 titres »').toBe('');
    expect(pSub(avec, t, estUnMix, sousTitreDeMix)).toBe('GoGo Penguin, Nils Frahm');
    // Une vraie playlist garde son nombre de titres.
    expect(pSub({ source_id: 'uuid-1', track_count: 12 }, t, estUnMix, sousTitreDeMix)).toBe('12 titres');
  });

  it('🔴 la tuile d’un mix n’offre pas de cœur de favori', () => {
    expect(source).toContain('favoriExterne={type && !estUnMix(p)');
  });
});
