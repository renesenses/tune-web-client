// @vitest-environment jsdom
// #3167 — fil 2880 : la lecture des playlists intelligentes échoue (« timed
// out », bibliothèque de 47 489 pistes, accès à distance) et l'onglet disait
// « Aucune playlist intelligente » à un testeur qui en a plusieurs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
});
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import { activeView } from '../stores/navigation';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { locale } from '../i18n';
import fr from '../locales/fr';

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
/** Ce que rend `GET /library/smart-playlists` : une liste, ou une panne. */
let repondreSmart: () => Promise<Response>;
let lecturesSmart = 0;

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});
async function stabiliser() {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function ouvrirOngletSmart() {
  activeView.set('playlists');
  composant = mount(PlaylistsV2, { target: hote });
  flushSync(); await stabiliser();
  const onglet = [...hote.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .find((b) => b.textContent?.trim() === fr['v2.pl.tabSmart']);
  expect(onglet).toBeDefined();
  onglet!.click(); flushSync(); await stabiliser();
}
const texte = () => hote.textContent ?? '';

beforeEach(() => {
  lecturesSmart = 0; localStorage.clear(); locale.set('fr');
  detailOuvert.set(null); ongletCourant.set(null);
  hote = document.createElement('div'); document.body.append(hote);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    if (chemin === '/api/v1/library/smart-playlists') { lecturesSmart++; return repondreSmart(); }
    if (chemin.endsWith('/streaming/services')) return json({});
    return json([]);
  }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); detailOuvert.set(null); ongletCourant.set(null);
  vi.unstubAllGlobals();
});

describe('#3167 — un échec de lecture n’est pas « aucune playlist intelligente »', () => {
  it('la lecture échoue (délai dépassé) : message d’échec, jamais « aucune »', async () => {
    repondreSmart = async () => { throw new TypeError('timed out'); };
    await ouvrirOngletSmart();

    expect(lecturesSmart).toBe(1);
    expect(hote.querySelector('[data-smart-echec]')?.textContent).toContain(fr['v2.pl.smartLoadFailed']);
    expect(texte()).not.toContain(fr['v2.pl.noSmart']);
  });

  it('« Réessayer » relit la liste, et les playlists apparaissent', async () => {
    repondreSmart = async () => json({ error: 'délai dépassé' }, 504);
    await ouvrirOngletSmart();
    expect(hote.querySelector('[data-smart-echec]')).not.toBeNull();

    repondreSmart = async () => json([{ id: 7, name: 'Jazz des années 60', rules: [] }]);
    const bouton = [...hote.querySelectorAll<HTMLButtonElement>('[data-smart-echec] button')]
      .find((b) => b.textContent?.trim() === fr['v2.pl.smartRetry']);
    expect(bouton).toBeDefined();
    bouton!.click(); await stabiliser();

    expect(lecturesSmart).toBe(2);
    await vi.waitFor(() => expect(texte()).toContain('Jazz des années 60'));
    expect(hote.querySelector('[data-smart-echec]')).toBeNull();
  });

  it('une liste réellement vide dit toujours « aucune playlist intelligente »', async () => {
    repondreSmart = async () => json([]);
    await ouvrirOngletSmart();

    expect(texte()).toContain(fr['v2.pl.noSmart']);
    expect(hote.querySelector('[data-smart-echec]')).toBeNull();
  });

  it('pendant la lecture, « chargement » et non « aucune »', async () => {
    repondreSmart = () => new Promise<Response>(() => {});
    await ouvrirOngletSmart();

    expect(texte()).toContain(fr['v2.pl.loading']);
    expect(texte()).not.toContain(fr['v2.pl.noSmart']);
  });
});
