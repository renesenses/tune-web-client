// @vitest-environment jsdom
//
// tune-server-rust#8578 — RUBRIQUES RETIRÉES PAR SPOTIFY.
//
// Spotify ne fournit plus aux applications personnelles la sélection
// éditoriale, les nouveautés, les genres ni les titres phares d'un artiste.
// Le serveur rend une liste vide ET `x-tune-rubrique-retiree: 1`.
// Décision de Bertrand (12/11/2026) : ni rubrique vide ni masquée, mais la
// phrase « Spotify ne fournit plus cette rubrique aux applications
// personnelles. » Une liste vide SANS l'en-tête reste une liste vide.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as api from '../api';
import { catalogueService } from '../widgetsService';
import {
  CLE_RUBRIQUE_RETIREE, ENTETE_RUBRIQUE_RETIREE, RubriqueRetiree, estRetiree, phraseRetrait, rubriquesRetirees,
} from '../rubriquesRetirees';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import zh from '../locales/zh';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';
import nbLocale from '../locales/nb';
import plLocale from '../locales/pl';

const LANGUES: Record<string, Record<string, string>> = {
  fr, en, de, es, it: it_, zh, ja, ko, ro, sv, hu, vi: viLocale, el: elLocale, nb: nbLocale, pl: plLocale,
} as any;

/** Un faux serveur : toutes les routes rendent `[]` ; celles de `retirees`
 *  portent l'en-tête. */
function serveur(retirees: string[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const chemin = String(url);
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (retirees.some((r) => chemin.includes(r))) h[ENTETE_RUBRIQUE_RETIREE] = '1';
    return new Response('[]', { status: 200, headers: h });
  }));
}

beforeEach(() => { rubriquesRetirees.set(new Set()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('#8578 — rubriques retirées par le service', () => {
  it('🔴 l’en-tête de la réponse marque la rubrique retirée, et son absence la démarque', async () => {
    serveur(['/new-releases', '/featured', '/genres', '/top-tracks']);
    await api.getStreamingNewReleases('spotify');
    await api.getStreamingFeaturedPlaylists('spotify');
    await api.getStreamingGenres('spotify');
    await api.getStreamingArtistTopTracks('spotify', 'a1');
    for (const r of ['nouveautes', 'selection', 'genres', 'titres-phares'] as const) {
      expect(estRetiree('spotify', r), r).toBe(true);
    }
    expect(estRetiree('qobuz', 'nouveautes')).toBe(false);
    serveur([]);
    await api.getStreamingNewReleases('spotify');
    expect(estRetiree('spotify', 'nouveautes')).toBe(false);
    expect(estRetiree('spotify', 'genres')).toBe(true);
  });

  it('🔴 le widget d’une rubrique retirée lève RubriqueRetiree (la phrase), pas une bande vide', async () => {
    serveur(['/new-releases', '/featured']);
    const widgets = await catalogueService('spotify');
    const nouveautes = widgets.find((w) => w.id === 'spotify-nouveautes')!;
    const selection = widgets.find((w) => w.id === 'spotify-playlists-editoriales')!;
    const ctx: any = { limite: 10 };
    await expect(nouveautes.charger(ctx)).rejects.toBeInstanceOf(RubriqueRetiree);
    await expect(selection.charger(ctx)).rejects.toMatchObject({ retiree: true, service: 'spotify' });
  });

  it('🔴 contre-épreuve : une rubrique vide SANS l’en-tête reste une liste vide', async () => {
    serveur([]);
    const widgets = await catalogueService('spotify');
    const nouveautes = widgets.find((w) => w.id === 'spotify-nouveautes')!;
    await expect(nouveautes.charger({ limite: 10 } as any)).resolves.toEqual([]);
  });

  it('🔴 la phrase existe dans les 15 langues et nomme le service', () => {
    for (const [lang, table] of Object.entries(LANGUES)) {
      expect(table[CLE_RUBRIQUE_RETIREE], lang).toBeTruthy();
      expect(phraseRetrait(table[CLE_RUBRIQUE_RETIREE], 'spotify'), lang).toContain('Spotify');
    }
    expect(phraseRetrait(fr[CLE_RUBRIQUE_RETIREE], 'spotify'))
      .toBe('Spotify ne fournit plus cette rubrique aux applications personnelles.');
  });

  it('🔴 les écrans disent la phrase : widgets, onglet Genres, titres phares', () => {
    const lire = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
    const widgets = lire('../../components/v2/PageWidgets.svelte');
    expect(widgets).toContain("err?.retiree === true");
    expect(widgets).toContain("et.phase === 'retiree'");
    const streaming = lire('../../components/v2/StreamingV2.svelte');
    expect(streaming).toContain("(!isBc && aUnOngletGenres(svcGenres)) || (!isBc && genresRetires)");
    expect(streaming).toContain('data-rubrique-retiree');
    const bloc = lire('../../components/v2/BioEtTitresPhares.svelte');
    expect(bloc).toContain('titresRetiresPar');
    expect(lire('../../components/v2/ArtisteServiceV2.svelte')).toContain("'titres-phares'");
  });
});
