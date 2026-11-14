// @vitest-environment jsdom
/**
 * web#2985 — bibliothèque d'un contact : les pochettes mettaient trop de
 * temps à s'afficher (recette rc12 sur le .18, catalogue de Tades).
 *
 * Mesure du 13/11/2026 sur le .18 : `GET …/contacts/881/library/stats` met
 * 6,6 à 12,3 s (médiane 7,6 s sur les journaux de trois jours) — le cloud
 * compte 37 610 albums et 752 395 titres —, alors que la première page
 * d'albums répond en 0,4 s. Or `CatalogueContactV2` ne demandait la première
 * page qu'APRÈS les chiffres : aucune pochette ne pouvait partir avant 7 s.
 *
 * On monte le vrai écran avec des chiffres qui ne répondent jamais : la page
 * d'albums doit partir quand même, et ses vignettes être dans la grille. Les
 * chiffres arrivés ensuite s'affichent ; un 404 sur les chiffres ferme
 * toujours l'écran, une autre panne des chiffres n'empêche pas la grille.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CatalogueContactV2 from '../../components/v2/CatalogueContactV2.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

const SHA = '7dd7622944e688de7d6cde44858de18dd49d835d1c4146427c36153bd2610d7b';
const ALBUMS = {
  data: [
    { id: 7283, title: 'Follow', artist_name: 'Joël Grare', year: 2008, track_count: 40, musicbrainz_release_group_id: null, thumbnail: SHA },
    { id: 7284, title: 'Sans vignette', artist_name: 'X', year: null, track_count: 3, musicbrainz_release_group_id: null, thumbnail: null },
  ],
  current_page: 1, last_page: 1, per_page: 50, total: 2,
};

let demandes: string[] = [];
let libererStats: ((r: Response) => void) | null = null;
let statsEchoue: number | null = null;
let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

function reponse(statut: number, charge: unknown): Response {
  return {
    ok: statut >= 200 && statut < 300, status: statut,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(charge),
    json: async () => charge,
  } as unknown as Response;
}

beforeEach(() => {
  demandes = [];
  libererStats = null;
  statsEchoue = null;
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    demandes.push(url);
    if (/\/contacts\/881\/library\/stats/.test(url)) {
      if (statsEchoue != null) return reponse(statsEchoue, { error: 'x' });
      // Le cloud qui compte : la réponse ne vient que si le test la libère.
      return new Promise<Response>((r) => { libererStats = r; });
    }
    if (/\/contacts\/881\/library\/albums\?/.test(url)) return reponse(200, ALBUMS);
    if (/\/contacts\/881\/sets/.test(url)) return reponse(200, []);
    return reponse(200, {});
  }));
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  vi.unstubAllGlobals();
});

function monter(onFermer: (p: boolean) => void = () => {}) {
  monte = mount(CatalogueContactV2, { target: hote, props: { contact: { user_id: 881, name: 'Tades' }, onFermer } });
}

describe('web#2985 — les pochettes d’un contact n’attendent plus les chiffres', () => {
  it('la première page d’albums part sans attendre /stats, et ses vignettes sont dans la grille', async () => {
    monter();
    await souffler();
    expect(libererStats, '/stats a bien été demandé').not.toBeNull();
    expect(demandes.some((u) => /\/library\/albums\?.*page=1/.test(u))).toBe(true);
    const imgs = [...hote.querySelectorAll('ul.albums img')] as HTMLImageElement[];
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe(
      `/api/v1/ext/circle/contacts/881/library/albums/7283/thumbnail?v=${SHA.slice(0, 16)}`,
    );
    expect(imgs[0].getAttribute('loading')).toBe('lazy');
    expect(hote.querySelectorAll('ul.albums > li')).toHaveLength(2);
    // Pas encore de chiffres…
    expect(hote.querySelector('.stats')).toBeNull();
    // … qui s'affichent quand ils arrivent, sans toucher à la grille.
    libererStats!(reponse(200, { tracks: 752395, albums: 37610, artists: 16516, thumbnails: 25927 }));
    await souffler();
    expect(hote.querySelector('.stats')?.textContent).toMatch(/37/);
    expect(hote.querySelectorAll('ul.albums > li')).toHaveLength(2);
  });

  it('un 404 sur les chiffres ferme toujours l’écran (partage coupé)', async () => {
    statsEchoue = 404;
    const fermer = vi.fn();
    monter(fermer);
    await souffler();
    expect(fermer).toHaveBeenCalledTimes(1);
    expect(fermer).toHaveBeenCalledWith(true);
  });

  it('une autre panne des chiffres laisse la grille et n’affiche pas d’erreur', async () => {
    statsEchoue = 503;
    const fermer = vi.fn();
    monter(fermer);
    await souffler();
    expect(fermer).not.toHaveBeenCalled();
    expect(hote.querySelectorAll('ul.albums > li')).toHaveLength(2);
    expect(hote.querySelector('.stats')).toBeNull();
  });
});
