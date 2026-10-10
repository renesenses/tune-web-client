// @vitest-environment jsdom
//
// renesenses/tune-web-client#2053 — FabienM, fil 2199 point 4, 1.0.0-rc3 :
//
//   « je sélectionne un artiste, puis sur un titre je clique sur l'action
//     "aller vers l'album", je suis sur la page de l'album, je fais back du
//     navigateur et ça me renvoie à la lecture en cours, pas à la page de
//     l'artiste. »
//
// Les titres phares d'une page artiste viennent des SERVICES
// (`titresPharesArtiste`). « Aller à l'album » y passe donc par le geste de
// la coquille `ouvrirAlbum` (ShellV2.ouvrirAlbumService), qui posait
// `vueDeRetour = 'nowplaying'` EN DUR — juste pour son premier appelant
// (Lecture en cours), faux pour tous les autres.
//
// 🔴 CES TÉMOINS EXÉCUTENT : la VRAIE coquille est montée (ses gestes, son
// historique, ses vues `streamingartist` et `streamingalbum`), on CLIQUE
// l'entrée du vrai menu d'une piste, puis le Retour de la fiche ou le
// Précédent du navigateur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheAlbumDeRetour, ficheAlbumService, ficheArtisteService } from '../stores/streaming';
import { detailOuvert } from '../historiqueCoquille';
import { ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { locale } from '../i18n';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

/** Un titre phare Qobuz, tel que la page artiste le reçoit du service. */
const TITRE_PHARE = {
  id: null,
  title: 'Harvest Moon',
  source: 'qobuz',
  source_id: 'trk-5551',
  artist_name: 'Neil Young',
  artist_id: '37616',
  album_id: 'alb-0093624512',
  album_title: 'Harvest Moon',
  cover_path: 'https://static.qobuz.com/hm.jpg',
  duration_ms: 303000,
};

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|featured|new-releases)(\?|\/|$)/;

function reponsePour(url: string) {
  const corps: unknown = COLLECTIONS.test(url) ? [] : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hotes: HTMLDivElement[] = [];
let montes: Record<string, any>[] = [];

function monter(composant: any, props: Record<string, any> = {}): HTMLDivElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(composant, { target: hote, props }));
  flushSync();
  return hote;
}

async function reposer(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 10));
  }
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  activeView.set('home');
  vueDeRetour.set(null);
  detailOuvert.set(null);
  ficheArtisteService.set(null);
  ficheAlbumService.set(null);
  ficheAlbumDeRetour.set(null);
});

afterEach(() => {
  for (const m of montes.reverse()) unmount(m);
  montes = [];
  for (const h of hotes) h.remove();
  hotes = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Le parcours de Fabien jusqu'à la fiche : page artiste → menu d'un titre → « Aller à l'album ». */
async function allerALAlbumDepuisLaPageArtiste(): Promise<HTMLDivElement> {
  const coquille = monter(ShellV2);
  activeView.set('library');
  await reposer();
  await ouvrirArtisteDepuis({ name: 'Neil Young', source: 'qobuz', source_id: '37616' }, 'library');
  await reposer();
  expect(get(activeView)).toBe('streamingartist');

  // Le menu « … » d'un titre phare : la ligne de `ListePistesV2` porte ce
  // composant, monté ici seul pour ne pas dépendre du service distant.
  const menu = monter(PisteActions, { piste: TITRE_PHARE });
  await reposer();
  menu.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
  await reposer();
  const entree = [...document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')]
    .find((b) => (b.textContent ?? '').includes(fr['library.goToAlbum']));
  expect(entree, "« Aller à l'album » est offert sur un titre phare").toBeTruthy();
  entree!.click();
  await reposer();

  expect(get(activeView)).toBe('streamingalbum');
  expect(get(ficheAlbumService)).toMatchObject({ service: 'qobuz', id: 'alb-0093624512' });
  return coquille;
}

describe('#2053 — « Aller à l’album » depuis la page artiste : le retour ramène à l’artiste', () => {
  it('🔴 le Retour de la fiche album ramène à la page artiste, pas à Lecture en cours', async () => {
    const coquille = await allerALAlbumDepuisLaPageArtiste();
    const fermer = coquille.querySelector<HTMLButtonElement>('.v2-detail .close');
    expect(fermer, 'la fiche album porte un bouton Retour').toBeTruthy();
    fermer!.click();
    await reposer();

    expect(get(activeView), 'fil 2199 point 4 : renvoyé à Lecture en cours').toBe('streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ service: 'qobuz', id: '37616' });
  });

  it('le Précédent du navigateur ramène à la page artiste (garde : déjà vrai en rc3)', async () => {
    await allerALAlbumDepuisLaPageArtiste();
    window.history.back();
    await reposer(10);

    expect(get(activeView), 'fil 2199 point 4 : le Précédent quitte la page artiste').toBe('streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ service: 'qobuz', id: '37616' });
  });

  it('le Retour de la page artiste, revenue, ramène encore à l’écran d’où elle était ouverte', async () => {
    const coquille = await allerALAlbumDepuisLaPageArtiste();
    coquille.querySelector<HTMLButtonElement>('.v2-detail .close')!.click();
    await reposer();
    expect(get(activeView)).toBe('streamingartist');

    const retour = coquille.querySelector<HTMLButtonElement>('.v2-fas .retour');
    expect(retour, 'la page artiste porte un bouton Retour').toBeTruthy();
    retour!.click();
    await reposer();
    expect(get(activeView), 'la page artiste a perdu son propre retour').toBe('library');
  });

  it('après le Précédent du navigateur, le « < » de la page artiste ramène encore à son écran d’origine', async () => {
    const coquille = await allerALAlbumDepuisLaPageArtiste();
    window.history.back();
    await reposer(10);
    expect(get(activeView)).toBe('streamingartist');

    coquille.querySelector<HTMLButtonElement>('.v2-fas .retour')!.click();
    await reposer();
    expect(get(activeView), 'le « < » de la page artiste lit le retour de la fiche quittée').toBe('library');
  });

  it('Lecture en cours garde son retour (le premier appelant du geste)', async () => {
    const coquille = monter(ShellV2);
    activeView.set('nowplaying');
    await reposer();
    const menu = monter(PisteActions, { piste: TITRE_PHARE });
    await reposer();
    menu.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    await reposer();
    [...document.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')]
      .find((b) => (b.textContent ?? '').includes(fr['library.goToAlbum']))!.click();
    await reposer();
    expect(get(activeView)).toBe('streamingalbum');
    coquille.querySelector<HTMLButtonElement>('.v2-detail .close')!.click();
    await reposer();
    expect(get(activeView)).toBe('nowplaying');
  });
});
