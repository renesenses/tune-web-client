// @vitest-environment jsdom
//
// tune-server-rust#6001 — l'écran de l'arbre des genres tiré de MusicBrainz et
// Wikidata (CC0). La route `GET /library/genre-tree/musicbrainz` est publiée
// depuis la rc7 (#6628, #6671) ; aucun écran ne l'appelait.
//
// On monte le VRAI panneau contre un serveur simulé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import Panneau from '../../components/v2/ArbreGenresMusicBrainzV2.svelte';
import ArbreDesGenres from '../../components/v2-heritage/GenreTreeView.svelte';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';
import { lireReponseArbreMb, filtrerNoeuds } from '../arbreGenresMb';

vi.setConfig({ testTimeout: 30_000 });

const PRET = {
  statut: 'ok', source: 'MusicBrainz (genres), Wikidata (P8052, P279)', licence: 'CC0',
  noeuds: [
    { genre: 'Rock Progressif', mbid: 'b', nom_musicbrainz: 'progressive rock', parents: ['rock'], sous_genres: ['symphonic prog'] },
    { genre: 'Rock', mbid: 'a', nom_musicbrainz: 'rock', parents: [], sous_genres: ['progressive rock', 'hard rock'] },
  ],
  non_reconnus: ['Variété FR'],
};
let reponses: Array<{ status: number; corps: unknown }> = [];
let appels = 0;

function repondre(url: string) {
  const p = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
  let r = { status: 200, corps: {} as unknown };
  if (p === '/library/genre-tree/musicbrainz') { appels++; r = reponses.shift() ?? { status: 200, corps: PRET }; }
  return {
    ok: r.status < 400, status: r.status, statusText: String(r.status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => r.corps, text: async () => JSON.stringify(r.corps),
    clone() { return this; },
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(cond: () => boolean, quoi: string, ms = 4_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
}
const q = (s: string) => hote!.querySelector(s);
const bouton = (texte: string) =>
  [...hote!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(texte));

beforeEach(() => {
  reponses = []; appels = 0;
  locale.set('fr');
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => repondre(String(url))));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Panneau, { target: hote, props: {} });
  flushSync();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#6001 — le panneau de l\'arbre MusicBrainz', () => {
  it('ne lit rien à l\'ouverture : la lecture se demande', async () => {
    await new Promise((r) => setTimeout(r, 30));
    expect(appels).toBe(0);
    expect(bouton('Voir l\'arbre proposé')).toBeDefined();
  });

  it('🔴 montre chaque genre avec ses parents et sous-genres, la source et la licence', async () => {
    bouton('Voir l\'arbre proposé')!.click();
    await attendreQue(() => !!q('[data-noeud]'), 'les genres');
    const noeuds = [...hote!.querySelectorAll('[data-noeud]')].map((n) => n.getAttribute('data-noeud'));
    expect(noeuds).toEqual(['Rock', 'Rock Progressif']);
    const prog = q('[data-noeud="Rock Progressif"]')!.textContent!;
    expect(prog).toContain('progressive rock');
    expect(prog).toContain('symphonic prog');
    const [lParents, lSous] = [...q('[data-noeud="Rock Progressif"]')!.querySelectorAll('.rel')]
      .map((r) => [...r.querySelectorAll('.chip')].map((c) => c.textContent));
    expect(lParents).toEqual(['rock']);
    expect(lSous).toEqual(['symphonic prog']);
    expect(q('[data-noeud="Rock"]')!.textContent).toContain('aucun (genre racine)');
    expect(q('[data-source]')!.textContent).toContain('CC0');
    expect(q('[data-partiel]')).toBeNull();
    bouton('inconnus de MusicBrainz')!.click();
    flushSync();
    expect(q('[data-non-reconnus]')!.textContent).toContain('Variété FR');
  });

  it('la recherche filtre, accents et casse ignorés', async () => {
    bouton('Voir l\'arbre proposé')!.click();
    await attendreQue(() => !!q('[data-noeud]'), 'les genres');
    const champ = q('input[type=search]') as HTMLInputElement;
    champ.value = 'SYMPHONIC';
    champ.dispatchEvent(new Event('input'));
    flushSync();
    expect([...hote!.querySelectorAll('[data-noeud]')].map((n) => n.getAttribute('data-noeud'))).toEqual(['Rock Progressif']);
  });

  it('202 en_preparation : le dit, puis redemande seul', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    try {
      reponses = [{ status: 202, corps: { statut: 'en_preparation' } }];
      bouton('Voir l\'arbre proposé')!.click();
      await attendreQue(() => !!q('[data-en-preparation]'), 'le message d\'attente');
      await vi.advanceTimersByTimeAsync(5_100);
      await attendreQue(() => !!q('[data-noeud]'), 'les genres après l\'attente');
      expect(appels).toBe(2);
    } finally { vi.useRealTimers(); }
  });

  it('404 (serveur antérieur) : le dit, sans bandeau d\'erreur', async () => {
    reponses = [{ status: 404, corps: { error: 'not found' } }];
    bouton('Voir l\'arbre proposé')!.click();
    await attendreQue(() => !!q('[data-absent]'), 'le message serveur antérieur');
    expect(get(notifications).filter((n) => n.level === 'error')).toEqual([]);
  });

  it('statut partiel : le dit', async () => {
    reponses = [{ status: 200, corps: { ...PRET, statut: 'partiel' } }];
    bouton('Voir l\'arbre proposé')!.click();
    await attendreQue(() => !!q('[data-partiel]'), 'la mention partielle');
  });
});

describe('#6001 — l\'écran « Arbre des genres » porte le panneau', () => {
  it('🔴 le panneau est monté sous l\'arbre de l\'auditeur', async () => {
    const h = document.createElement('div');
    document.body.appendChild(h);
    const m = mount(ArbreDesGenres, { target: h, props: {} });
    flushSync();
    try {
      await attendreQue(() => !!h.querySelector('.gt-view [data-arbre-mb]'), 'le panneau MusicBrainz');
    } finally { unmount(m); h.remove(); }
  });
});

describe('#6001 — lecture de la réponse', () => {
  it('se méfie des champs manquants', () => {
    const e = lireReponseArbreMb({ statut: 'ok', noeuds: [{ genre: 'Jazz' }, null, { mbid: 'x' }] });
    expect(e.etat).toBe('pret');
    if (e.etat !== 'pret') return;
    expect(e.noeuds).toEqual([{ genre: 'Jazz', mbid: '', nom_musicbrainz: 'Jazz', parents: [], sous_genres: [] }]);
    expect(e.nonReconnus).toEqual([]);
    expect(lireReponseArbreMb({ statut: 'en_preparation' })).toEqual({ etat: 'en_preparation' });
  });

  it('filtre sur le nom, le nom MusicBrainz, les parents et les sous-genres', () => {
    const e = lireReponseArbreMb(PRET);
    if (e.etat !== 'pret') throw new Error('pret attendu');
    expect(filtrerNoeuds(e.noeuds, 'hard').map((n) => n.genre)).toEqual(['Rock']);
    expect(filtrerNoeuds(e.noeuds, 'progressif').map((n) => n.genre)).toEqual(['Rock Progressif']);
    expect(filtrerNoeuds(e.noeuds, '  ').length).toBe(2);
  });
});
