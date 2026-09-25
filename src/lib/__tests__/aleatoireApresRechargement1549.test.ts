// @vitest-environment jsdom
//
// #1549 (Didier, fil 1910) — « Aléatoire actif mais bouton éteint après
// rechargement de page ».
//
// « Je rafraîchis la page du navigateur, l'icône lecture aléatoire n'est plus
// illuminée par contre le mode aléatoire reste actif. »
//
// Le serveur porte `shuffle` et `repeat` dans `GET /zones` depuis
// tune-server-rust#2153 (`routes/zones/lecture.rs:276-277`). La coquille v2
// (`v2Live.ts`) ne les lisait QUE dans l'instantané WebSocket : un
// rechargement qui charge les zones par REST, sans instantané — ou avec un
// instantané arrivé avant la pose de la zone courante — laissait les deux
// boutons sur leur valeur de naissance (`false`, `'off'`).
//
// 🔴 CE FICHIER MONTE LA VRAIE BARRE ET LIT LE DOM, alimentée par le vrai
// `demarrerTransportV2` et le vrai amorçage `bootstrapV2` — seul le WebSocket
// est remplacé, et il ne pousse RIEN sauf là où le cas le dit.
//
// Refs #1549
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { flushSync, mount, unmount } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { shuffleEnabled, repeatMode } from '../stores/nowPlaying';
import { t } from '../i18n';
import { libelleRepetition } from '../etatTransport';

/** La zone telle que le serveur la rend : aléatoire ACTIF, répétition de la file. */
const SALON = {
  id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
  output_type: 'dlna', position_ms: 32_000, queue_length: 12,
  current_track: { id: 42, title: 'Lovely Day', artist_name: 'Bill Withers', source: 'local', duration_ms: 255_000 },
  shuffle: true,
  repeat: 'all',
};

let pousser: (e: unknown) => void = () => {};
vi.mock('../websocket', () => ({
  tuneWS: {
    connect: () => {},
    setCurrentZoneId: () => {},
    get isPolling() {
      return false;
    },
    onEvent: (h: (e: unknown) => void) => {
      pousser = h;
      return () => {};
    },
  },
}));

function reponse(url: string): unknown {
  if (/\/zones\/\d+\/queue/.test(url)) return { tracks: [], position: 0, length: 0 };
  if (/\/zones\/\d+(\?|$)/.test(url)) return SALON;
  if (/\/zones(\?|$)/.test(url)) return [SALON];
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let arreter: (() => void) | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

function poserLaBarre(): void {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TransportBar, { target: hote });
  flushSync();
}

function boutonAleatoire(): HTMLButtonElement {
  const b = hote!.querySelector<HTMLButtonElement>('.transport-controls button[aria-pressed]');
  if (!b) throw new Error('bouton Aléatoire introuvable dans la barre');
  return b;
}

function boutonRepeter(): HTMLButtonElement | null {
  const attendu = libelleRepetition(get(t), 'all');
  return (
    [...hote!.querySelectorAll<HTMLButtonElement>('.transport-controls button')].find(
      (b) => b.getAttribute('aria-label') === attendu,
    ) ?? null
  );
}

beforeEach(() => {
  // Un rechargement de page : magasins à leur valeur de naissance.
  shuffleEnabled.set(false);
  repeatMode.set('off');
  zones.set([]);
  currentZoneId.set(null);
  pousser = () => {};
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const u = typeof input === 'string' ? input : input.toString();
    return Promise.resolve(
      new Response(JSON.stringify(reponse(u)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  arreter?.();
  arreter = null;
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

async function rechargerLaPage(zoneMemorisee: number | null): Promise<void> {
  const { demarrerTransportV2 } = await import('../v2Live');
  const { bootstrapV2 } = await import('../v2Bootstrap');
  // `localStorage.tune_current_zone_id` relu au démarrage, ou rien.
  currentZoneId.set(zoneMemorisee);
  poserLaBarre();
  // Même ordre que `ShellV2` : amorçage, puis raccordement du vivant.
  const amorcage = bootstrapV2();
  arreter = demarrerTransportV2();
  await amorcage.catch(() => {});
  for (let i = 0; i < 5; i++) await respirer();
  flushSync();
}

describe('#1549 — après rechargement, les boutons suivent l’état serveur de la zone', () => {
  it('🔴 zone mémorisée, AUCUN événement WebSocket : l’aléatoire est allumé', async () => {
    await rechargerLaPage(1);
    const b = boutonAleatoire();
    expect(
      b.classList.contains('active') && b.getAttribute('aria-pressed') === 'true',
      'le serveur joue en aléatoire (GET /zones → shuffle: true) mais le bouton est éteint (#1549).',
    ).toBe(true);
  });

  it('🔴 même défaut pour la répétition : « répéter la file » est allumé', async () => {
    await rechargerLaPage(1);
    const b = boutonRepeter();
    expect(b, 'le bouton Répéter n’annonce pas « répéter la file » : l’état serveur est perdu.').not.toBeNull();
    expect(b!.classList.contains('active')).toBe(true);
  });

  it('🔴 appareil neuf (aucune zone mémorisée) : la zone choisie à l’amorçage porte son aléatoire', async () => {
    await rechargerLaPage(null);
    expect(get(currentZoneId)).toBe(1);
    expect(boutonAleatoire().classList.contains('active'),
      'la zone courante est posée APRÈS le chargement des zones : son aléatoire n’est jamais appliqué.').toBe(true);
  });

  it('🔴 instantané arrivé AVANT la pose de la zone courante : appliqué dès qu’elle est posée', async () => {
    const { demarrerTransportV2 } = await import('../v2Live');
    poserLaBarre();
    arreter = demarrerTransportV2();
    pousser({ type: 'snapshot', data: { zones: [{ id: 1, shuffle: true, repeat: 'all' }] } });
    currentZoneId.set(1);
    flushSync();
    expect(boutonAleatoire().classList.contains('active'),
      'l’état rangé par l’instantané n’est pas ré-appliqué quand la zone devient la courante.').toBe(true);
  });

  it('une charge MUETTE sur l’aléatoire n’éteint pas le bouton', async () => {
    await rechargerLaPage(1);
    const { shuffle: _s, repeat: _r, ...muette } = SALON;
    zones.set([muette] as never);
    flushSync();
    expect(boutonAleatoire().classList.contains('active')).toBe(true);
    expect(get(repeatMode)).toBe('all');
  });

  it('le serveur éteint l’aléatoire (bascule faite ailleurs) : le bouton s’éteint', async () => {
    await rechargerLaPage(1);
    zones.set([{ ...SALON, shuffle: false }] as never);
    flushSync();
    expect(boutonAleatoire().classList.contains('active')).toBe(false);
  });
});
