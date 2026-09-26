// @vitest-environment jsdom
//
// Fil forum 1952 — Didier, Windows 11, v0.9.165 :
//
//   « Dans la barre de gauche, zone Streaming, le choix Bandcamp n'apparaît
//     pas alors que la connexion Bandcamp est active. Mise à jour de la page
//     et redémarrage du serveur : rien n'y fait. »
//
// Sa capture : l'écran Streaming porte les onglets « Qobuz » et « Bandcamp
// didierv », la barre latérale la seule entrée « Qobuz ».
//
// ## La cause
//
// Deux règles pour une seule liste. L'écran range ses onglets par
// `ongletsStreaming(services, bandcampLive)` : l'onglet de l'extension entre
// dès que `/ext/bandcamp/tags` répond. La barre ne prenait que
// `servicesConnectes` — `enabled && authenticated`.
//
// Or le service Bandcamp du serveur naît `enabled: false`
// (`plugins/tune-bandcamp/src/service.rs`, `BandcampService::new`, opt-in) et
// ce drapeau ne garde aucune de ses routes. Lier son pseudo rend
// `authenticated: true, username: "didierv"` sans l'activer : c'est l'état
// que la capture trahit (le pseudo s'affiche, donc le compte est lié).
//
// ## La mesure
//
// La vraie barre est montée, puis le vrai écran, sur la même réponse du
// serveur. L'entrée doit exister, et cliquer dessus doit ouvrir l'écran SUR
// Bandcamp — une entrée qui ouvrirait Qobuz ne vaudrait rien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import Sidebar from '../../components/v2/Sidebar.svelte';

vi.setConfig({ testTimeout: 60_000 });

/** Le cas de Didier : Qobuz connecté, Bandcamp LIÉ mais jamais activé. */
const SERVICES_DIDIER = {
  qobuz: { enabled: true, authenticated: true, username: 'Virlogeux Didier' },
  bandcamp: { enabled: false, authenticated: true, username: 'didierv' },
  deezer: { enabled: true, authenticated: false, username: null },
} as any;

let services: any = SERVICES_DIDIER;
let extensionChargee = true;

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function demonter() {
  if (monte) {
    try { unmount(monte); } catch { /* le démontage n'est pas le sujet */ }
    monte = null;
  }
  hote!.innerHTML = '';
}

/** Les libellés des entrées de navigation de la barre. */
function entrees(): string[] {
  return Array.from(hote!.querySelectorAll('button.nav')).map((b) =>
    (b.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

function ongletsRendus(): string[] {
  return Array.from(hote!.querySelectorAll('nav.svcs > button')).map((b) =>
    (b.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

function ongletAllume(): string | null {
  const b = hote!.querySelector('nav.svcs > button.on');
  return b ? (b.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
}

async function monterBarre() {
  monte = mount(Sidebar as any, { target: hote! });
  await laisserTourner(40);
}

async function monterEcran() {
  monte = mount(StreamingV2 as any, { target: hote! });
  for (let i = 0; i < 60; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (ongletsRendus().length) break;
  }
  await laisserTourner(10);
}

beforeEach(() => {
  services = SERVICES_DIDIER;
  extensionChargee = true;
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) {
    vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/ext\/bandcamp\/tags/.test(u)) {
        if (!extensionChargee) throw new Error('extension non chargée');
        return reponse({ tags: ['rock'], genres: [{ slug: 'rock', label: 'rock', sous_genres: [] }] });
      }
      if (/\/streaming\/services/.test(u)) return reponse(services);
      if (/\/config/.test(u)) return reponse({});
      return reponse([]);
    }),
  );
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('home');
});

afterEach(() => {
  demonter();
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fil 1952 — la barre latérale liste les mêmes services que l’écran Streaming', () => {
  it('🔴 l’écran montre Bandcamp : la barre aussi, sous « Streaming »', async () => {
    // D'abord l'écran : c'est ce que Didier voit, et ce que la barre doit suivre.
    await monterEcran();
    expect(ongletsRendus().some((o) => /bandcamp/i.test(o)), `[${ongletsRendus().join(' | ')}]`).toBe(true);
    demonter();
    streamingServices.set({});
    await monterBarre();
    expect(
      entrees().some((l) => /^bandcamp$/i.test(l)),
      `entrées rendues : [${entrees().join(' | ')}]`,
    ).toBe(true);
  });

  it('🔴 cliquer « Bandcamp » ouvre l’écran Streaming SUR Bandcamp', async () => {
    await monterBarre();
    const b = Array.from(hote!.querySelectorAll('button.nav')).find((x) =>
      /^bandcamp$/i.test((x.textContent ?? '').trim()),
    ) as HTMLButtonElement | undefined;
    expect(b, `aucune entrée Bandcamp dans [${entrees().join(' | ')}]`).toBeDefined();
    b!.click();
    await laisserTourner(10);
    expect(get(activeView)).toBe('streaming');
    demonter();
    await monterEcran();
    expect(ongletAllume(), `rangée : [${ongletsRendus().join(' | ')}]`).toMatch(/bandcamp/i);
  });

  it('TÉMOIN — Qobuz reste là, Deezer non connecté n’y est pas', async () => {
    await monterBarre();
    const rendues = entrees();
    expect(rendues.some((l) => /^qobuz$/i.test(l)), `[${rendues.join(' | ')}]`).toBe(true);
    expect(rendues.some((l) => /deezer/i.test(l)), `[${rendues.join(' | ')}]`).toBe(false);
  });

  it('TÉMOIN — extension absente et service non activé : ni l’écran ni la barre ne montrent Bandcamp', async () => {
    extensionChargee = false;
    await monterBarre();
    expect(entrees().some((l) => /bandcamp/i.test(l)), `[${entrees().join(' | ')}]`).toBe(false);
  });

  it('TÉMOIN — une seule entrée Bandcamp quand le service est aussi activé', async () => {
    services = { ...SERVICES_DIDIER, bandcamp: { enabled: true, authenticated: true, username: 'didierv' } };
    await monterBarre();
    expect(entrees().filter((l) => /bandcamp/i.test(l)), `[${entrees().join(' | ')}]`).toHaveLength(1);
  });
});
