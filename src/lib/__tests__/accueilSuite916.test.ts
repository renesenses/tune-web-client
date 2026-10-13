// @vitest-environment jsdom
/**
 * web#916, go de Bertrand du 13/10/2026 — la raison et « Pas pour moi » sur
 * les AUTRES rangées de l'accueil, et l'ancienne route des recommandations
 * débranchée.
 *
 * Ce banc garde :
 *  1. la phrase des nouvelles raisons (`hasard`, `reprise`, `favori`), en
 *     français et en anglais ;
 *  2. « Continuer l'écoute » reprend la raison du serveur et devient
 *     écartable ;
 *  3. « Favoris » dit « Dans vos favoris » et devient écartable (la bande
 *     seulement : le cœur n'est pas touché) ;
 *  4. `RecommendationsSection` (l'ancien tableau de bord, `/dashboard`) lit
 *     `/home/recommendations` et affiche la raison en phrase — plus jamais
 *     `/library/recommendations` ;
 *  5. les RADIOS de l'accueil (décision du 13/10/2026) : leur raison, leur
 *     désignation, et un menu « … » réduit à « Pas pour moi ».
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { texteRaison } from '../raisonSuggestion';
import { widgetParId, type Contexte } from '../accueilWidgets';
import { cibleArtiste, cibleDeSuggestion } from '../suggestionsEcartees';
import { entreesPochette } from '../actionsPochette';
import { objetAUnMenu } from '../gestesObjet';
import RecommendationsSection from '../../components/v2-heritage/RecommendationsSection.svelte';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const fr = lFr as unknown as Record<string, string>;
const en = lEn as unknown as Record<string, string>;
const tFr = (k: string) => fr[k] ?? k;
const tEn = (k: string) => en[k] ?? k;

const ctx = { profileId: 1, albums: [], zones: [], limite: 20 } as unknown as Contexte;

/** Le serveur simulé : la première clé contenue dans l'URL gagne. */
function serveur(routes: [string, unknown][], journal: string[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      journal.push(u);
      const trouve = routes.find(([k]) => u.includes(k));
      const corps = trouve ? trouve[1] : [];
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
  return journal;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('1. les phrases des nouvelles raisons', () => {
  it('en français', () => {
    expect(texteRaison({ type: 'hasard' }, tFr)).toBe('Tiré au hasard dans votre bibliothèque');
    expect(texteRaison({ type: 'favori' }, tFr)).toBe('Dans vos favoris');
    expect(texteRaison({ type: 'reprise' }, tFr)).toBe('Écouté récemment');
    // 12/10/2026 à midi UTC.
    expect(texteRaison({ type: 'reprise', ecoute_le: 1791806400 }, tFr, 'fr')).toMatch(
      /^Écouté le 12 oct\.? 2026$/,
    );
  });

  it('en anglais, sans un mot de français', () => {
    expect(texteRaison({ type: 'hasard' }, tEn)).toBe('Picked at random from your library');
    expect(texteRaison({ type: 'reprise', ecoute_le: 1791806400 }, tEn, 'en')).toBe('Played on Oct 12, 2026');
    expect(texteRaison({ type: 'favori' }, tEn)).toBe('In your favorites');
  });
});

describe('2. « Continuer l’écoute » : la raison du serveur, et « Pas pour moi »', () => {
  it('reprend `raison: reprise` et désigne l’album et l’artiste', async () => {
    serveur([
      ['/home/continue-listening', [
        { id: 4, album_id: 4, context_type: 'album', context_id: '4', title: 'Kind of Blue',
          album_title: 'Kind of Blue', artist_name: 'Miles Davis', source: 'local',
          raison: { type: 'reprise', ecoute_le: 1791806400 } },
      ]],
    ]);
    const [el] = await widgetParId('reprendre')!.charger(ctx);
    expect(el.raison).toEqual({ type: 'reprise', ecoute_le: 1791806400 });
    expect(el.suggestion).toBe(true);
    expect(cibleDeSuggestion(el)).toMatchObject({ item_type: 'album', source: 'local', item_id: '4' });
    expect(cibleArtiste(el)).toMatchObject({ item_type: 'artist', item_id: 'Miles Davis' });
  });
});

describe('3. « Favoris » : « Dans vos favoris », écartable de la bande', () => {
  it('pose la raison favori sur chaque album, et le geste', async () => {
    serveur([
      ['/favorites/streaming', []],
      ['/profiles/1/favorites', [{ item_type: 'album', item_id: 5, created_at: null }]],
      ['/library/albums/5', { id: 5, title: 'Waltz for Debby', artist_name: 'Bill Evans', cover_path: null }],
    ]);
    const [el] = await widgetParId('favoris')!.charger(ctx);
    expect(el.titre).toBe('Waltz for Debby');
    expect(el.raison).toEqual({ type: 'favori' });
    expect(el.suggestion).toBe(true);
    expect(cibleDeSuggestion(el)).toMatchObject({ item_type: 'album', source: 'local', item_id: '5' });
  });
});

describe('4. RecommendationsSection lit /home/recommendations', () => {
  it('appelle la route qui recommande, et dit pourquoi en phrase', async () => {
    const journal = serveur([
      ['/home/recommendations', [
        { id: 2, title: 'Bitches Brew', artist_name: 'Miles Davis', reason: 'genre_match',
          raison: { type: 'genre_frequent', genre: 'Jazz' } },
        { id: 9, title: 'Au hasard', artist_name: 'X', reason: 'random', raison: { type: 'hasard' } },
      ]],
    ]);
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const comp = mount(RecommendationsSection, { target: hote });
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    flushSync();
    expect(journal.some((u) => u.includes('/home/recommendations?limit=12'))).toBe(true);
    expect(journal.some((u) => u.includes('/library/recommendations'))).toBe(false);
    const raisons = Array.from(hote.querySelectorAll('.rec-reason')).map((n) => n.textContent?.trim());
    expect(raisons).toHaveLength(2);
    expect(raisons.join(' | ')).not.toMatch(/genre_match|random/);
    unmount(comp);
    hote.remove();
  });
});

describe('5. les radios de l’accueil : raison et « Pas pour moi »', () => {
  it('disent pourquoi, en français et en anglais', () => {
    expect(texteRaison({ type: 'radio_favorite' }, tFr)).toBe('Dans vos radios favorites');
    expect(texteRaison({ type: 'radio_ecoutee' }, tFr)).toBe('Écoutée récemment');
    expect(texteRaison({ type: 'radio_ecoutee', ecoute_le: 1791806400 }, tEn, 'en')).toBe('Played on Oct 12, 2026');
  });

  it('la bande des radios reprend la raison et désigne la station', async () => {
    serveur([
      ['/home/radio-picks', [
        { id: 7, name: 'FIP', url: 'https://exemple.test/fip', is_favorite: true, raison: { type: 'radio_favorite' } },
      ]],
    ]);
    const [el] = await widgetParId('radios-artistes')!.charger(ctx);
    expect(el.raison).toEqual({ type: 'radio_favorite' });
    expect(el.suggestion).toBe(true);
    expect(cibleDeSuggestion(el)).toMatchObject({ item_type: 'radio', source: 'local', item_id: '7' });
    expect(cibleArtiste(el), 'une radio n’a pas d’artiste à écarter').toBeNull();
  });

  it('le menu d’une radio n’existe que pour « Pas pour moi », et ne porte que lui', () => {
    const radio = { type: 'radio' as const, nom: 'FIP' };
    expect(objetAUnMenu(radio), 'ailleurs, une radio garde ses propres boutons').toBe(false);
    const pasPourMoi = () => {};
    expect(objetAUnMenu(radio, { pasPourMoi })).toBe(true);
    const entrees = entreesPochette({ type: 'radio', idBibliotheque: null, service: null }, { pasPourMoi }, tFr);
    expect(entrees.map((e) => e.cle)).toEqual(['v2.dismiss.notForMe']);
    expect(entreesPochette({ type: 'podcast', idBibliotheque: null, service: null }, { pasPourMoi }, tFr)).toEqual([]);
  });
});
