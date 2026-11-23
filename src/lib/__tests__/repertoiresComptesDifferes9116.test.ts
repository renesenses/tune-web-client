// @vitest-environment jsdom
//
// tune-server-rust#9116 — fil forum 2935 (Thierry C., 544 147 pistes sur
// partages réseau) : « à quoi te sert de compter le nombre de fichiers
// présents dans chaque arborescence quand c'est moi qui prendrai la décision
// d'ouvrir tel ou tel disque ? ».
//
// Le serveur rend la liste des dossiers sans attendre ses comptes
// (`comptes_en_attente: true`, comptes à 0). L'écran doit l'AFFICHER aussitôt,
// navigable, sans annoncer « 0 piste » ni « emplacement vide », puis poser les
// comptes quand le serveur les a.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BrowseView from '../../components/v2-heritage/BrowseView.svelte';
import { locale } from '../i18n';
import { suivreLesComptes, DELAIS_DES_COMPTES_MS, RELANCE_LENTE_MS } from '../comptesDifferes';
import { detailOuvert } from '../historiqueCoquille';

vi.setConfig({ testTimeout: 30_000 });

function reponse(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
    clone() { return this; },
  } as unknown as Response;
}

let comptesPrets = false;
let pistesPretes = true;
let appels: string[] = [];
let requetes: string[] = [];

function repondre(url: string): Response {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  appels.push(p);
  requetes.push(url);
  if (p === '/library/browse') {
    return reponse({
      roots: [{ name: 'music2', path: '/mnt/music2', track_count: comptesPrets ? 272000 : 0, exists: true }],
      comptes_en_attente: !comptesPrets,
    });
  }
  if (p === '/library/browse/dir') {
    return reponse({
      path: '/mnt/music2', parent: null, music_root: '/mnt/music2', accessible: true,
      tracks: pistesPretes ? [{ id: 7, title: 'Inédit', file_path: '/mnt/music2/inedit.flac' }] : [],
      directories: [{ name: '1 Classic', path: '/mnt/music2/1 Classic', track_count: comptesPrets ? 150000 : 0 }],
      comptes_en_attente: !comptesPrets,
      pistes_en_attente: !pistesPretes,
    });
  }
  if (/\/zones/.test(p)) return reponse([]);
  return reponse({});
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(cond: () => boolean, quoi: string, ms = 8_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
}

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  comptesPrets = false;
  pistesPretes = true;
  appels = [];
  requetes = [];
  locale.set('fr');
  detailOuvert.set(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => repondre(String(url))));
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  detailOuvert.set(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#9116 — Répertoires : les dossiers d’abord, les comptes ensuite', () => {
  it('🔴 emplacements et sous-dossiers affichés sans comptes, puis complétés', async () => {
    monte = mount(BrowseView, { target: hote!, props: {} });
    flushSync();
    await attendreQue(() => !!hote!.querySelector('.root-item'), 'les emplacements');
    const racine = hote!.querySelector('.root-item')!;
    expect(racine.textContent).toContain('music2');
    // Ni « 0 pistes », ni « emplacement vide » pendant l'attente.
    expect(racine.querySelector('.root-count')!.textContent!.trim()).toBe('');
    expect(racine.querySelector('.root-warning')).toBeNull();

    // La navigation n'attend rien : on ouvre le disque tout de suite.
    hote!.querySelector<HTMLButtonElement>('.root-item')!.click();
    flushSync();
    await attendreQue(() => !!hote!.querySelector('.dir-item'), 'les sous-dossiers');
    const dossier = hote!.querySelector('.dir-item')!;
    expect(dossier.textContent).toContain('1 Classic');
    expect(dossier.querySelector('.dir-count')!.textContent!.trim()).toBe('');

    // Le serveur a fini son arbre : les comptes se posent d'eux-mêmes.
    comptesPrets = true;
    await attendreQue(
      () => hote!.querySelector('.dir-count')!.textContent!.trim() === '150000',
      'le compte du sous-dossier',
    );
    expect(appels.filter((p) => p === '/library/browse/dir').length).toBeGreaterThanOrEqual(2);
  });

  it('sans attente annoncée, aucune relance', async () => {
    comptesPrets = true;
    monte = mount(BrowseView, { target: hote!, props: {} });
    flushSync();
    await attendreQue(() => !!hote!.querySelector('.root-item'), 'les emplacements');
    expect(hote!.querySelector('.root-count')!.textContent).toContain('272000');
    await new Promise((r) => setTimeout(r, 900));
    expect(appels.filter((p) => p === '/library/browse').length).toBe(1);
  });

  it('l’écran annonce les comptes différés au serveur', async () => {
    comptesPrets = true;
    monte = mount(BrowseView, { target: hote!, props: {} });
    flushSync();
    await attendreQue(() => !!hote!.querySelector('.root-item'), 'les emplacements');
    expect(requetes.some((u) => u.includes('/library/browse?comptes_differes=1'))).toBe(true);
  });

  it('pistes d’un très grand dossier en attente : elles arrivent à la relance', async () => {
    pistesPretes = false;
    monte = mount(BrowseView, { target: hote!, props: {} });
    flushSync();
    await attendreQue(() => !!hote!.querySelector('.root-item'), 'les emplacements');
    hote!.querySelector<HTMLButtonElement>('.root-item')!.click();
    flushSync();
    await attendreQue(() => !!hote!.querySelector('.dir-item'), 'les sous-dossiers');
    expect(hote!.textContent).not.toContain('Inédit');
    pistesPretes = true;
    comptesPrets = true;
    await attendreQue(() => hote!.textContent!.includes('Inédit'), 'les pistes du dossier');
  });

  it('🔴 quitter l’écran arrête les relances', async () => {
    monte = mount(BrowseView, { target: hote!, props: {} });
    flushSync();
    await attendreQue(() => !!hote!.querySelector('.root-item'), 'les emplacements');
    unmount(monte);
    monte = null;
    const avant = appels.length;
    await new Promise((r) => setTimeout(r, 1600));
    expect(appels.length, 'relance après démontage').toBe(avant);
  });
});

describe('#9116 — suivreLesComptes', () => {
  function fausseMinuterie() {
    const posees: { f: () => void; ms: number; id: number }[] = [];
    const retirees: number[] = [];
    let n = 0;
    return {
      posees, retirees,
      minuterie: {
        poser: (f: () => void, ms: number) => { posees.push({ f, ms, id: ++n }); return n; },
        retirer: (id: unknown) => { retirees.push(id as number); },
      },
      async declencher() {
        const m = posees[posees.length - 1];
        m.f();
        for (let i = 0; i < 5; i++) await Promise.resolve();
      },
    };
  }

  it('🔴 cinq relances sans comptes : « comptes en cours », puis une relance lente, sans fin', async () => {
    const fm = fausseMinuterie();
    let lent = 0;
    let applique: unknown = null;
    let lectures = 0;
    const arreter = suivreLesComptes(
      async () => { lectures++; return { comptes_en_attente: lectures < 8 }; },
      (r) => { applique = r; },
      () => { lent++; },
      fm.minuterie,
    );
    for (let i = 0; i < 5; i++) await fm.declencher();
    expect(fm.posees.slice(0, 5).map((m) => m.ms)).toEqual([...DELAIS_DES_COMPTES_MS]);
    expect(lent).toBe(1);
    expect(fm.posees[5].ms).toBe(RELANCE_LENTE_MS);
    await fm.declencher();
    await fm.declencher();
    expect(lent).toBe(1);
    expect(fm.posees[fm.posees.length - 1].ms).toBe(RELANCE_LENTE_MS);
    await fm.declencher();
    expect(applique).toEqual({ comptes_en_attente: false });
    const nb = fm.posees.length;
    arreter();
    expect(fm.posees.length).toBe(nb);
  });

  it('arrêter retire la minuterie en cours et n’applique plus rien', async () => {
    const fm = fausseMinuterie();
    let applique = false;
    const arreter = suivreLesComptes(async () => ({ comptes_en_attente: false }), () => { applique = true; }, () => {}, fm.minuterie);
    arreter();
    expect(fm.retirees).toEqual([1]);
    await fm.declencher();
    expect(applique).toBe(false);
  });
});
