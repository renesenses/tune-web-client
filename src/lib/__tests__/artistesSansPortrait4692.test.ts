// @vitest-environment jsdom
//
// « 12 artistes encore sans portrait » : lesquels ? — renesenses/tune-server-rust#4692
// (Bilou, fil forum 1887).
//
// Le serveur nomme ces artistes depuis la .163 :
// `GET /library/artwork/artists-without-image` rend `artists` (id, name,
// musicbrainz_id, image_path, nature), `total`, `artists_without_image`,
// `detail`, `limit`, `offset`. La liste sort de la MÊME fonction que le nombre
// de la carte « Pochettes d'artistes » ; le web n'affichait que ce nombre.
//
// 🔴 Ce témoin MONTE l'écran État du serveur avec un `fetch` simulé : il lit ce
// qui est affiché et la requête qui part vraiment. Contre-épreuve : sans
// artiste manquant, ni bouton ni requête vers la liste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import { tachesDeFond } from '../stores/tachesDeFond';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let requetes: string[] = [];
let manquants: number;
const LISTE = {
  artists: [
    { id: 41, name: 'Abbey Lincoln', musicbrainz_id: 'a-mbid', image_path: null, nature: 'sans_image_avec_mbid' },
    { id: 7, name: 'Zbigniew Preisner', musicbrainz_id: null, image_path: 'x.jpg', nature: 'cache_perdu_sans_mbid' },
  ],
  total: 3,
  artists_without_image: 3,
  detail: {},
  limit: 200,
  offset: 0,
};

const VIDE = /\/(zones|devices|profiles|shortcuts|collections|service-tokens)(\?|\/|$)/;

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function repondre(chemin: string): Response {
  if (chemin.endsWith('/library/artwork/enrich-artists/status')) {
    return json({ result: { phase: 'done', total: 1288, processed: 1288, enriched: 4 }, artists_without_image: manquants });
  }
  if (chemin.endsWith('/library/artwork/artists-without-image')) return json(LISTE);
  if (chemin.endsWith('/system/background-tasks')) {
    return json({ tasks: [], pausable: [], all_paused: false, scan_pausable: false });
  }
  if (chemin.includes('/system/scan/status')) return json({ scanning: false });
  if (VIDE.test(chemin)) return json([]);
  return json({});
}

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  manquants = 3;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const brut = String(typeof url === 'string' ? url : (url?.url ?? ''));
    const chemin = brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    requetes.push(chemin);
    return repondre(chemin);
  }));
  tachesDeFond.set([]);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monterSante() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TuneHealthV2, { target: hote });
  flushSync();
  await new Promise((r) => setTimeout(r, 120));
  await attendre();
}

function carteCouvertures(): HTMLElement | null {
  const cartes = Array.from(hote!.querySelectorAll('article.card')) as HTMLElement[];
  return cartes.find((c) => c.querySelector('h2')?.textContent?.trim() === fr['v2.health.cardCovers']) ?? null;
}

function boutonListe(c: HTMLElement): HTMLButtonElement | null {
  return (Array.from(c.querySelectorAll('button')) as HTMLButtonElement[])
    .find((b) => b.textContent?.trim() === fr['v2.health.coversShowList']) ?? null;
}

describe('État du serveur — les artistes sans portrait, nommés (#4692)', () => {
  it('le bouton déplie la liste servie par le serveur, avec la nature de chaque manque', async () => {
    await monterSante();
    const c = carteCouvertures();
    expect(c, 'aucune carte Pochettes d’artistes').not.toBeNull();
    expect(requetes.some((r) => r.endsWith('/artists-without-image')), 'liste chargée avant le geste').toBe(false);

    const b = boutonListe(c!);
    expect(b, 'aucun bouton pour voir les artistes').not.toBeNull();
    b!.click();
    await attendre();

    expect(requetes.some((r) => r.endsWith('/library/artwork/artists-without-image'))).toBe(true);
    const texte = carteCouvertures()!.textContent ?? '';
    expect(texte).toContain('Abbey Lincoln');
    expect(texte).toContain('Zbigniew Preisner');
    expect(texte).toContain(fr['v2.health.coversNature.sans_image_avec_mbid']);
    expect(texte).toContain(fr['v2.health.coversNature.cache_perdu_sans_mbid']);
    // total = 3, deux noms rendus : le reste est annoncé, pas tu.
    expect(texte).toContain(fr['v2.health.coversListMore'].replace('{n}', '1'));
  });

  it('un nom ouvre la fiche de l’artiste et la referme vers l’État du serveur', async () => {
    await monterSante();
    boutonListe(carteCouvertures()!)!.click();
    await attendre();
    const nom = (Array.from(carteCouvertures()!.querySelectorAll('button')) as HTMLButtonElement[])
      .find((x) => x.textContent?.trim() === 'Abbey Lincoln');
    expect(nom, 'le nom n’est pas cliquable').toBeTruthy();
    nom!.click();
    flushSync();
    expect(get(activeView)).toBe('streamingartist');
    expect(get(vueDeRetour)).toBe('diagnostics');
    expect(get(ficheArtisteService)).toMatchObject({ service: null, id: '41', nom: 'Abbey Lincoln' });
  });

  it('contre-épreuve : aucun artiste manquant, ni bouton ni requête', async () => {
    manquants = 0;
    await monterSante();
    const c = carteCouvertures()!;
    expect(boutonListe(c)).toBeNull();
    expect(requetes.some((r) => r.endsWith('/artists-without-image'))).toBe(false);
  });
});
