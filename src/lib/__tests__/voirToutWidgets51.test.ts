// @vitest-environment jsdom
//
// « Voir tout » sur chaque bande de l'accueil — renesenses/tune-remote-flutter#51
// (Fabien, 11/10/2026), aligné sur le web avec le go de Bertrand du 11/10.
//
// À côté du titre de chaque rangée défilante, une icône ouvre une page qui
// montre TOUT le contenu du widget, en grille ou en liste.
//
// Ce banc garde trois portes :
//  1. le chargeur d'une bande accepte une limite (`ctx.limite`), et la DEMANDE
//     au serveur — sans elle, « tout » ne serait que les cinquante de la bande ;
//  2. la page monte l'icône sur les bandes, et elle ouvre la vue qui recharge
//     le widget avec la grande limite ;
//  3. la bascule grille / liste est retenue comme les autres écrans
//     (`lib/preferencesEcran`), et le retour ramène à l'accueil.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getRecentAlbums: vi.fn(async (_limit?: number) => [] as any[]),
  getArtistReleases: vi.fn(async (_limit?: number) => [] as any[]),
  getStreamingFeatured: vi.fn(async (_s: string, _sec: string, _l?: number) => [] as any[]),
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { LIMITE, LIMITE_VOIR_TOUT, limiteDe, widgetParId, type Contexte } from '../accueilWidgets';
import { widgetsCategoriesPlaylists } from '../widgetsService';
import lFr from '../locales/fr';
import { dictionnaire } from './onzeDictionnaires';

const fr = lFr as unknown as Record<string, string>;
const ctx = (limite?: number): Contexte => ({ profileId: 1, albums: [], zones: [], limite });

describe('#51 — un chargeur de bande accepte une limite', () => {
  it('cinquante par défaut, la grande limite sur demande', () => {
    expect(LIMITE).toBe(50);
    expect(LIMITE_VOIR_TOUT).toBe(200);
    expect(limiteDe(ctx())).toBe(50);
    expect(limiteDe(ctx(200))).toBe(200);
  });

  it('« Récemment ajoutés » demande la limite au serveur', async () => {
    await widgetParId('recemment-ajoutes')!.charger(ctx());
    expect(mocks.getRecentAlbums).toHaveBeenLastCalledWith(50);
    await widgetParId('recemment-ajoutes')!.charger(ctx(200));
    expect(mocks.getRecentAlbums).toHaveBeenLastCalledWith(200);
  });

  it('« Nouveautés de vos artistes » aussi, et ne coupe plus à cinquante', async () => {
    const sorties = Array.from({ length: 80 }, (_, i) => ({
      source: 'qobuz', source_id: `s${i}`, title: `Disque ${i}`, artist_name: 'X',
    }));
    mocks.getArtistReleases.mockResolvedValue([{ artist_name: 'X', releases: sorties }] as any);
    const bande = await widgetParId('nouveautes-artistes')!.charger(ctx());
    expect(mocks.getArtistReleases).toHaveBeenLastCalledWith(50);
    const tout = await widgetParId('nouveautes-artistes')!.charger(ctx(200));
    expect(mocks.getArtistReleases).toHaveBeenLastCalledWith(200);
    expect(tout.length).toBeGreaterThan(bande.length);
  });

  it('une bande Qobuz éditoriale passe la limite à sa section', async () => {
    await widgetParId('qobuz-nouveautes')!.charger(ctx(200));
    expect(mocks.getStreamingFeatured).toHaveBeenLastCalledWith('qobuz', 'new-releases', 200);
  });

  it('une catégorie de playlists (« Humeurs ») rend toute la catégorie', async () => {
    const playlists = Array.from({ length: 70 }, (_, i) => ({ id: `p${i}`, name: `Liste ${i}` }));
    const [w] = widgetsCategoriesPlaylists('qobuz', [{ id: 'humeurs', name: 'Humeurs', playlists }]);
    expect((await w.charger(ctx())).length).toBe(50);
    expect((await w.charger(ctx(200))).length).toBe(70);
  });
});

// ── La page ────────────────────────────────────────────────────────────────

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  currentProfileId.set(1);
  try { localStorage.clear(); } catch { /* */ }
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

/** Un widget de témoin : il rend autant d'éléments que la limite demandée. */
function temoin() {
  const limites: (number | undefined)[] = [];
  return {
    limites,
    widget: {
      id: 'temoin',
      cleTitre: 'v2.home.wRecentlyAdded',
      forme: 'bande' as const,
      charger: async (c: Contexte) => {
        limites.push(c.limite);
        const n = c.limite ?? 3;
        return Array.from({ length: Math.min(n, 7) }, (_, i) => ({ id: `e${i}`, titre: `Élément ${i}` }));
      },
    },
  };
}

async function poser(widget: any) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [widget], dispositionDefaut: ['temoin'], cle: 'temoin_widgets' },
  });
  flushSync();
  await souffler(80);
  flushSync();
  return hote;
}

describe('#51 — l’icône « Voir tout » et sa page', () => {
  it('la bande porte l’icône, nommée dans la langue', async () => {
    const { widget } = temoin();
    const page = await poser(widget);
    const btn = page.querySelector<HTMLButtonElement>('.tete button.voir-tout');
    expect(btn, 'aucune icône « Voir tout » à côté du titre').toBeTruthy();
    expect(btn!.getAttribute('aria-label')).toContain(fr['v2.home.seeAll']);
  });

  it('elle ouvre la page, qui recharge le widget avec la grande limite', async () => {
    const { widget, limites } = temoin();
    const page = await poser(widget);
    expect(page.querySelectorAll('.bande .carte').length).toBe(3);
    page.querySelector<HTMLButtonElement>('button.voir-tout')!.click();
    await souffler(80);
    flushSync();
    expect(limites.at(-1)).toBe(LIMITE_VOIR_TOUT);
    const vue = page.querySelector('.voir-tout-page');
    expect(vue, 'la page « Voir tout » ne s’ouvre pas').toBeTruthy();
    expect(vue!.querySelectorAll('.carte').length).toBe(7);
    // La pile de l'accueil laisse la place.
    expect(page.querySelector('.pile')).toBeNull();
  });

  it('deux boutons grille / liste, le choix retenu, et le retour', async () => {
    const { widget } = temoin();
    const page = await poser(widget);
    page.querySelector<HTMLButtonElement>('button.voir-tout')!.click();
    await souffler(80);
    flushSync();
    const grille = page.querySelector<HTMLButtonElement>('[data-mode="grid"]')!;
    const liste = page.querySelector<HTMLButtonElement>('[data-mode="list"]')!;
    expect(grille && liste, 'les deux boutons de bascule manquent').toBeTruthy();
    expect(grille.getAttribute('aria-pressed')).toBe('true');
    expect(liste.getAttribute('aria-pressed')).toBe('false');
    liste.click();
    flushSync();
    expect(page.querySelector('.voir-tout-page .contenu')!.classList.contains('liste')).toBe(true);
    expect(liste.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('tune_v2_ecran_voir_tout_vue')).toBe('list');

    page.querySelector<HTMLButtonElement>('.voir-tout-page button.retour')!.click();
    flushSync();
    expect(page.querySelector('.voir-tout-page')).toBeNull();
    expect(page.querySelector('.pile')).toBeTruthy();
  });

  it('le choix de la veille revient à l’ouverture', async () => {
    localStorage.setItem('tune_v2_ecran_voir_tout_vue', 'list');
    const { widget } = temoin();
    const page = await poser(widget);
    page.querySelector<HTMLButtonElement>('button.voir-tout')!.click();
    await souffler(80);
    flushSync();
    expect(page.querySelector('[data-mode="list"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('les clés existent dans les onze langues', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const table = dictionnaire(l);
      for (const k of ['v2.home.seeAll', 'v2.home.seeAllCount']) {
        expect(table[k], `${l} : ${k}`).toBeTruthy();
      }
    }
  });
});
