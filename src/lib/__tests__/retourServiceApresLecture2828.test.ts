// @vitest-environment jsdom
//
// web#2828 — Ronin22 (ASR, fil « Mozaiklabs Tune player », p. 9, rc11) :
// Qobuz › Genres › un genre › un album › Lecture, puis « Lecture en cours »,
// puis retour sur Qobuz → l'écran repartait de l'accueil du service.
//
// Ces témoins MONTENT le vrai `StreamingV2`, le DÉMONTENT comme le fait la
// coquille en passant sur « Lecture en cours », puis le remontent par la barre
// latérale (le service est posé avant la vue, comme `allerService`). Même
// défaut, même écran pour TIDAL : il est rejoué aussi.
//
// Contre-épreuve : `StreamingV2.svelte` d'`origin/main` (sans
// `reprendrePageQuittee`) rend, au retour, l'onglet Éditorial sans fil de
// genres ni fiche : les deux premiers témoins rougissent. Le troisième
// (#3843 : depuis un autre écran, la barre latérale repart de la racine) est
// vert dans les deux cas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { activeStreamingService } from '../stores/streaming';
import { activeView } from '../stores/navigation';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { oublierMemoireStreaming } from '../memoireStreaming';
import { t } from '../i18n';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

const SERVICES = {
  qobuz: { enabled: true, authenticated: true, username: 'Ronin22' },
  tidal: { enabled: true, authenticated: true, username: 'Ronin22' },
} as any;

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const album = (svc: string, id: string, titre: string) => ({
  source: svc, source_id: id, title: titre, artist_name: 'Artiste', cover_path: null,
});

function corpsPour(u: string): unknown {
  if (/\/streaming\/services/.test(u)) return SERVICES;
  // Qobuz : deux niveaux de genres.
  if (/\/streaming\/qobuz\/genres\?parent_id=/.test(u)) return [{ id: '113', name: 'Hard Rock' }];
  if (/\/streaming\/qobuz\/genres\/113\/albums/.test(u)) return [album('qobuz', 'q1', 'Album Qobuz')];
  if (/\/streaming\/qobuz\/genres(\?|$)/.test(u)) return [{ id: '112', name: 'Rock', has_children: true }, { id: '80', name: 'Jazz' }];
  // TIDAL : un seul niveau.
  if (/\/streaming\/tidal\/genres\/pop\/albums/.test(u)) return [album('tidal', 't1', 'Album Tidal')];
  if (/\/streaming\/tidal\/genres(\?|$)/.test(u)) return [{ id: 'pop', name: 'Pop' }, { id: 'rock', name: 'Rock' }];
  if (/\/config/.test(u)) return {};
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserFaire(n = 60, jusqua?: () => boolean) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (jusqua?.()) return;
  }
}

const boutons = (sel: string) => Array.from(hote!.querySelectorAll<HTMLButtonElement>(sel));
const bouton = (sel: string, texte: string) => boutons(sel).find((b) => (b.textContent ?? '').trim() === texte) ?? null;
const filDeGenre = () => (hote!.querySelector('.crumb .cur')?.textContent ?? '').trim();
const ficheOuverte = () => document.body.querySelector('.v2-detail');

/** La barre latérale : le service est posé AVANT la vue (`allerService`). */
async function entrerPar(service: string) {
  activeStreamingService.set(service);
  activeView.set('streaming');
  monte = mount(StreamingV2 as any, { target: hote! });
  await laisserFaire(80, () => boutons('nav.subs > button').length > 1 && !!bouton('nav.subs > button', get(t)('common.genres' as any)));
}

/** La coquille démonte l'écran en changeant de vue. */
async function quitterVers(vue: 'nowplaying' | 'library') {
  activeView.set(vue);
  flushSync();
  unmount(monte!);
  monte = null;
  await laisserFaire(5);
}

async function cliquer(sel: string, texte: string) {
  await laisserFaire(80, () => !!bouton(sel, texte));
  const b = bouton(sel, texte);
  expect(b, `bouton « ${texte} » absent`).not.toBeNull();
  b!.click();
  await laisserFaire(10);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension absente');
    return reponse(corpsPour(u));
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* hors sujet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  activeStreamingService.set(null as any);
  activeView.set('home');
  detailOuvert.set(null);
  ongletCourant.set(null);
  oublierMemoireStreaming();
  vi.unstubAllGlobals();
});

describe('web#2828 — retour sur le service après « Lecture en cours »', () => {
  it('Qobuz : genre, sous-genre et fiche d\'album sont retrouvés', async () => {
    await entrerPar('qobuz');
    await cliquer('nav.subs > button', get(t)('common.genres' as any));
    await cliquer('.chips .chip', 'Rock');
    await cliquer('.chips.sous .chip', 'Hard Rock');
    await cliquer('button.ct', 'Album Qobuz');
    await laisserFaire(20, () => !!ficheOuverte());
    expect(ficheOuverte(), 'la fiche d\'album ne s\'est pas ouverte').not.toBeNull();

    await quitterVers('nowplaying');
    expect(ficheOuverte()).toBeNull();
    // La coquille remet onglet et fiche à zéro au changement de vue.
    ongletCourant.set(null);
    detailOuvert.set(null);

    await entrerPar('qobuz');
    await laisserFaire(80, () => filDeGenre() === 'Rock' && !!ficheOuverte());
    expect(filDeGenre(), 'le fil de genres est perdu').toBe('Rock');
    expect(bouton('.chips.sous .chip.active', 'Hard Rock'), 'le sous-genre est perdu').not.toBeNull();
    expect(ficheOuverte(), 'la fiche d\'album est perdue').not.toBeNull();
    expect(get(detailOuvert), 'la fiche rouverte n\'a pas sa clé d\'historique').not.toBeNull();
  });

  it('TIDAL : même défaut, même correctif', async () => {
    await entrerPar('tidal');
    await cliquer('nav.subs > button', get(t)('common.genres' as any));
    await cliquer('.chips .chip', 'Pop');
    await laisserFaire(80, () => !!bouton('button.ct', 'Album Tidal'));

    await quitterVers('nowplaying');
    ongletCourant.set(null);
    detailOuvert.set(null);

    await entrerPar('tidal');
    await laisserFaire(80, () => filDeGenre() === 'Pop' && !!bouton('button.ct', 'Album Tidal'));
    expect(filDeGenre(), 'le fil de genres est perdu').toBe('Pop');
    expect(bouton('button.ct', 'Album Tidal'), 'les albums du genre ne sont pas rechargés').not.toBeNull();
  });

  it('#3843 tient : venu d\'un autre écran, la barre latérale repart de la racine', async () => {
    await entrerPar('qobuz');
    await cliquer('nav.subs > button', get(t)('common.genres' as any));
    await cliquer('.chips .chip', 'Jazz');
    await quitterVers('library');
    ongletCourant.set(null);
    detailOuvert.set(null);

    await entrerPar('qobuz');
    await laisserFaire(30);
    expect(filDeGenre()).toBe('');
    expect(ficheOuverte()).toBeNull();
  });

  it('un autre service demandé au retour ne reprend pas la page de Qobuz', async () => {
    await entrerPar('qobuz');
    await cliquer('nav.subs > button', get(t)('common.genres' as any));
    await cliquer('.chips .chip', 'Jazz');
    await quitterVers('nowplaying');
    ongletCourant.set(null);
    detailOuvert.set(null);

    await entrerPar('tidal');
    await laisserFaire(30);
    expect(filDeGenre()).toBe('');
  });

  it('relecture : passé par un autre écran entre-temps, la page n\'est plus reprise', async () => {
    await entrerPar('qobuz');
    await cliquer('nav.subs > button', get(t)('common.genres' as any));
    await cliquer('.chips .chip', 'Jazz');
    await quitterVers('nowplaying');
    activeView.set('library');
    activeView.set('nowplaying');
    ongletCourant.set(null);
    detailOuvert.set(null);

    await entrerPar('qobuz');
    await laisserFaire(30);
    expect(filDeGenre()).toBe('');
  });
});
