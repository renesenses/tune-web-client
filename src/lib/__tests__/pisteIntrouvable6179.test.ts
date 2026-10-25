// @vitest-environment jsdom
//
// tune-server-rust#6179 (FabienM, fil 2236 : « ma playlist locale est revenue
// mais sans les titres ») — une piste qui disparaît de la bibliothèque ne sort
// plus de la playlist : le serveur rend la ligne INTROUVABLE, à son rang,
// `id` nul, `missing: true`, avec le titre, l'artiste, l'album et le chemin de
// la piste disparue.
//
// Ce que l'écran doit en faire, et que ces témoins gardent :
//  1. la ligne est MONTRÉE, grisée, avec l'étiquette « Introuvable » ;
//  2. elle ne se lance pas (rien à jouer) et n'entre pas dans la file ;
//  3. « Retirer » reste à portée, hors du mode édition : c'est le seul geste
//     qui l'efface de la playlist.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { corpsDeFileListe } from '../pisteFile';
import { estIntrouvable } from '../pisteIntrouvable';
import fr from '../locales/fr';

/** La ligne telle que `GET /playlists/{id}/tracks` la rend (`MissingEntry::to_json`). */
const INTROUVABLE = {
  id: null,
  missing: true,
  title: 'Nobody',
  artist_name: 'Nina Simone',
  album_title: 'Pastel Blues',
  duration_ms: 250000,
  file_path: '/m/pb/02.flac',
  musicbrainz_recording_id: 'mbid-02',
  missing_since: 1_760_000_000,
  source: 'local',
  source_id: null,
};
const LOCALE = { id: 7, title: 'Sinnerman', artist_name: 'Nina Simone', source: 'local' };

describe('#6179 — la ligne introuvable', () => {
  it('se reconnaît à `missing`, et une piste ordinaire non', () => {
    expect(estIntrouvable(INTROUVABLE as any)).toBe(true);
    expect(estIntrouvable(LOCALE as any)).toBe(false);
    // Un serveur d'avant #6179 ne pose jamais la clé : rien ne change.
    expect(estIntrouvable({ id: null, source: 'qobuz' } as any)).toBe(false);
  });

  it('n’entre pas dans la file : seule la piste jouable part', () => {
    expect(corpsDeFileListe([INTROUVABLE, LOCALE] as any)).toEqual({ track_ids: [7] });
    expect(corpsDeFileListe([INTROUVABLE] as any)).toBeNull();
  });

  it('a son étiquette et son explication dans toutes les langues', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'vi', 'el']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      expect(src, l).toContain('"v2.pl.missingTrack":');
      expect(src, l).toContain('"v2.pl.missingTrackHint":');
    }
  });
});

describe('#6179 — ListePistesV2 montre la ligne introuvable, grisée, sans la jouer', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => [], text: async () => '[]',
    }) as unknown as Response));
    preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  it('🔴 la ligne est là, à son rang, grisée, étiquetée, et son titre ne lance rien', () => {
    const lire = vi.fn();
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ListePistesV2, {
      target: hote,
      props: { pistes: [LOCALE, INTROUVABLE], clef: (_p: any, i: number) => i, onLire: lire } as any,
    });
    flushSync();
    const lignes = hote.querySelectorAll('.tbl .trow');
    expect(lignes.length, 'la ligne introuvable doit être montrée').toBe(2);
    const ligne = lignes[1] as HTMLElement;
    expect(ligne.textContent).toContain('Nobody');
    expect(ligne.classList.contains('indispo'), 'la ligne introuvable doit être grisée').toBe(true);
    const etiquette = ligne.querySelector('.indispo-etiq');
    expect(etiquette?.textContent?.trim()).toBe(fr['v2.pl.missingTrack' as keyof typeof fr]);
    const titre = ligne.querySelector('button.titre') as HTMLButtonElement;
    expect(titre.disabled, 'le titre d’une ligne introuvable ne se lance pas').toBe(true);
    expect(etiquette?.getAttribute('title') ?? '', 'l’étiquette explique et donne le chemin')
      .toContain('/m/pb/02.flac');
    titre.click();
    expect(lire).not.toHaveBeenCalled();
    // La piste ordinaire, elle, reste jouable.
    expect((lignes[0] as HTMLElement).classList.contains('indispo')).toBe(false);
  });
});

describe('#6179 — PlaylistDetailV2 garde « Retirer » à portée de la ligne introuvable', () => {
  it('le bouton Retirer existe hors du mode édition pour une ligne introuvable', () => {
    const src = readFileSync('src/components/v2/PlaylistDetailV2.svelte', 'utf8');
    expect(src).toMatch(/\{#if !edition && isLocal && estIntrouvable\(_t\)\}\s*<button class="rm" onclick=\{\(\) => removeAt\(rangReel\(_t\)\)\}/);
  });
});
