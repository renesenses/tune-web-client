// @vitest-environment jsdom
//
// Fil forum 1952 — Didier, Windows 11, v0.9.165 :
//
//   « Dans la barre de gauche, zone Streaming, le choix Bandcamp n'apparaît
//     pas alors que la connexion Bandcamp est active. »
//
// Son serveur : Bandcamp LIÉ (`authenticated: true`) mais case « Actif »
// décochée — le service naissait décoché et la liaison ne le cochait pas.
//
// ## La règle, décidée le 26/09 par Bertrand
//
// Une seule règle pour tous les services : la barre latérale liste les
// services ACTIVÉS ET CONNECTÉS (`servicesConnectes`, `utilisable()` côté
// serveur depuis #5130). C'est le SERVEUR qui a été corrigé : lier son compte
// Bandcamp coche la case, et un compte déjà lié dont personne n'a touché la
// case est actif (tune-server-rust, lot
// `batch/bandcamp-actif-connexion-20260926`).
//
// web#1624 avait fait l'inverse : Bandcamp entrait dans la barre par la sonde
// de l'extension (`/ext/bandcamp/tags`), même décoché, et même sans compte
// lié. Ces épreuves ferment cette exception.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';
import Sidebar from '../../components/v2/Sidebar.svelte';
import {
  BANDCAMP_EXT,
  BANDCAMP_SVC,
  ongletDeRestitution,
  ongletsStreaming,
} from '../ongletsStreaming';

vi.setConfig({ testTimeout: 60_000 });

/** Le cas de Didier sur un serveur 0.9.165 : Bandcamp LIÉ mais décoché. */
const SERVICES_DIDIER_165 = {
  qobuz: { enabled: true, authenticated: true, username: 'Virlogeux Didier' },
  bandcamp: { enabled: false, authenticated: true, username: 'didierv' },
  deezer: { enabled: true, authenticated: false, username: null },
} as any;

/** Le même compte sur un serveur corrigé : la liaison a coché la case. */
const SERVICES_DIDIER = {
  ...SERVICES_DIDIER_165,
  bandcamp: { enabled: true, authenticated: true, username: 'didierv' },
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

describe('fil 1952 — la barre latérale suit la règle unique : activé ET connecté', () => {
  it('Bandcamp activé et lié : une entrée dans la barre, et une seule', async () => {
    await monterBarre();
    expect(
      entrees().filter((l) => /bandcamp/i.test(l)),
      `entrées rendues : [${entrees().join(' | ')}]`,
    ).toHaveLength(1);
  });

  it('cliquer « Bandcamp » ouvre l’écran Streaming SUR Bandcamp', async () => {
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

  it('🔴 Bandcamp décoché (serveur 0.9.165) : absent de la barre, comme tout service décoché', async () => {
    // L'extension répond : c'est précisément le cas où web#1624 le faisait
    // entrer malgré la case.
    services = SERVICES_DIDIER_165;
    await monterBarre();
    expect(
      entrees().some((l) => /bandcamp/i.test(l)),
      `un service décoché ne doit pas avoir d'entrée : [${entrees().join(' | ')}]`,
    ).toBe(false);
  });

  it('🔴 Bandcamp activé mais sans compte lié : absent, même si l’extension répond', async () => {
    services = { ...SERVICES_DIDIER, bandcamp: { enabled: true, authenticated: false, username: null } };
    await monterBarre();
    expect(
      entrees().some((l) => /bandcamp/i.test(l)),
      `un service non connecté ne doit pas avoir d'entrée : [${entrees().join(' | ')}]`,
    ).toBe(false);
  });

  it('TÉMOIN — la barre ne dépend pas de la sonde de l’extension', async () => {
    extensionChargee = false;
    await monterBarre();
    expect(entrees().filter((l) => /bandcamp/i.test(l)), `[${entrees().join(' | ')}]`).toHaveLength(1);
  });

  it('TÉMOIN — Qobuz reste là, Deezer non connecté n’y est pas', async () => {
    await monterBarre();
    const rendues = entrees();
    expect(rendues.some((l) => /^qobuz$/i.test(l)), `[${rendues.join(' | ')}]`).toBe(true);
    expect(rendues.some((l) => /deezer/i.test(l)), `[${rendues.join(' | ')}]`).toBe(false);
  });
});

// web#1621 — la MÊME règle sur l'ÉCRAN Streaming. web#1632 l'avait posée sur
// la barre, mais `ongletsStreaming` ajoutait encore l'onglet de l'extension
// dès que `/ext/bandcamp/tags` répondait, case décochée ou compte non lié :
// l'écran montrait Bandcamp, la barre non — l'écart même du fil 1952.
describe('web#1621 — l’écran Streaming suit la règle unique : activé ET connecté', () => {
  const estBandcamp = (o: string) => o === BANDCAMP_SVC || o === BANDCAMP_EXT;

  it('🔴 module — Bandcamp décoché + extension vivante : pas d’onglet Bandcamp', () => {
    expect(ongletsStreaming(SERVICES_DIDIER_165, true).filter(estBandcamp)).toEqual([]);
  });

  it('🔴 module — activé sans compte lié + extension vivante : pas d’onglet Bandcamp', () => {
    const sansCompte = { ...SERVICES_DIDIER, bandcamp: { enabled: true, authenticated: false } };
    expect(ongletsStreaming(sansCompte, true).filter(estBandcamp)).toEqual([]);
  });

  it('module — activé et connecté : UN onglet, celui de l’extension quand elle répond', () => {
    expect(ongletsStreaming(SERVICES_DIDIER, true)).toEqual(['qobuz', BANDCAMP_EXT]);
    expect(ongletsStreaming(SERVICES_DIDIER, false)).toEqual(['qobuz', BANDCAMP_SVC]);
  });

  it('🔴 module — un raccourci « bandcamp » sur un Bandcamp décoché retombe sur la rangée réelle', () => {
    expect(ongletDeRestitution(SERVICES_DIDIER_165, true, BANDCAMP_SVC)).toBe('qobuz');
  });

  it('🔴 écran — Bandcamp décoché (serveur 0.9.165), extension vivante : aucun onglet Bandcamp', async () => {
    services = SERVICES_DIDIER_165;
    await monterEcran();
    const rendus = ongletsRendus();
    expect(rendus.some((l) => /qobuz/i.test(l)), `rangée : [${rendus.join(' | ')}]`).toBe(true);
    expect(
      rendus.some((l) => /bandcamp/i.test(l)),
      `un service décoché ne doit pas avoir d'onglet : [${rendus.join(' | ')}]`,
    ).toBe(false);
  });

  it('écran — Bandcamp activé et connecté : un onglet Bandcamp, un seul', async () => {
    await monterEcran();
    const rendus = ongletsRendus();
    expect(rendus.filter((l) => /bandcamp/i.test(l)), `rangée : [${rendus.join(' | ')}]`).toHaveLength(1);
  });
});
