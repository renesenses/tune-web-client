// @vitest-environment jsdom
//
// web#3245 (Régis, fil 2941) — « Vue playlist par pochettes : bouton
// retirer ». La petite croix « Retirer » d'une vignette se touchait par
// mégarde : des albums partaient de la playlist sans que l'on ait rien
// demandé. Décision de Bertrand (19/11) : une CONFIRMATION avant le retrait.
//
// On MONTE la vraie fiche `PlaylistDetailV2` et la vraie boîte du client
// (`DialogContainer`), et on lit les requêtes réellement émises :
//   - croix → la boîte s'ouvre, nomme le titre et son album, AUCUN retrait ;
//   - « Annuler » (bouton par défaut), Échap, Entrée → rien n'est retiré ;
//   - « Retirer » → le retrait part, exactement comme avant (`entry_id`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import DialogContainer from '../../components/partages/DialogContainer.svelte';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

vi.setConfig({ testTimeout: 30_000 });

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let lignes: any[] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(
    () => {
      flushSync();
      if (!condition()) throw new Error(`attente expirée : ${quoi}`);
    },
    { timeout: 25_000, interval: 10 },
  );
}
const souffler = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };

const LIGNES = [
  { id: 501, title: 'Nightswimming', artist_name: 'R.E.M.', album_title: 'Automatic for the People', album_id: 41, source: 'local', duration_ms: 258000, entry_id: 344 },
  { id: 502, title: 'Losing My Religion', artist_name: 'R.E.M.', album_title: 'Out of Time', album_id: 42, source: 'local', duration_ms: 268000, entry_id: 345 },
  { id: 503, title: 'Drive', artist_name: 'R.E.M.', album_title: 'Automatic for the People', album_id: 41, source: 'local', duration_ms: 271000, entry_id: 346 },
];

let hote: HTMLDivElement | null = null;
let fiche: Record<string, unknown> | null = null;
let boite: Record<string, unknown> | null = null;

beforeEach(() => {
  requetes = [];
  lignes = LIGNES.map((l) => ({ ...l }));
  try { localStorage.clear(); } catch { /* sans stockage */ }
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    let charge: unknown = {};
    if (method === 'POST' && url.endsWith('/playlists/12/tracks/remove')) {
      lignes = lignes.filter((l) => l.entry_id !== body?.entry_id);
      charge = { removed: 1 };
    } else if (method === 'GET' && url.includes('/playlists/12/tracks')) charge = lignes;
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  if (fiche) unmount(fiche);
  if (boite) unmount(boite);
  fiche = null; boite = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

const retraits = () => requetes.filter((r) => r.method === 'POST' && r.url.includes('/tracks/remove'));
const croixPochettes = () => [...hote!.querySelectorAll<HTMLButtonElement>('[data-pgrille] button[data-retirer-titre]')];
const laBoite = () => document.body.querySelector<HTMLElement>('[role="alertdialog"]');
const annuler = () => laBoite()!.querySelector<HTMLButtonElement>('button[data-dialog-annuler]')!;
const valider = () => laBoite()!.querySelector<HTMLButtonElement>('button[data-dialog-valider]')!;
const touche = (key: string) => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); flushSync(); };

async function ouvrirEnPochettes() {
  boite = mount(DialogContainer, { target: document.body });
  fiche = mount(PlaylistDetailV2, {
    target: hote!, props: { item: { kind: 'local', pl: { id: 12, name: 'Réveil', track_count: 3 } } as any, onClose: () => {} },
  });
  await attendreQue(() => (hote!.textContent ?? '').includes('Losing My Religion'), 'les titres affichés');
  hote!.querySelector<HTMLButtonElement>('button[data-vue="pochettes"]')!.click();
  await attendreQue(() => croixPochettes().length === 3, 'les croix de la grille de pochettes');
}

async function cliquerCroix(rang: number) {
  croixPochettes()[rang].click();
  await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
}

describe('web#3245 — vue en pochettes : la croix « Retirer » demande confirmation', () => {
  it('🔴 croix → la boîte s’ouvre, nomme le titre et l’album, et AUCUN retrait ne part', async () => {
    await ouvrirEnPochettes();
    await cliquerCroix(1);
    await souffler();
    expect(retraits(), 'le retrait est parti sans confirmation').toEqual([]);
    const attendu = fr['v2.pl.confirmRemoveAlbum']
      .replace('{title}', 'Losing My Religion').replace('{album}', 'Out of Time').replace('{playlist}', 'Réveil');
    expect(laBoite()!.textContent).toContain(attendu);
    // « Annuler » est le bouton par défaut ; la validation dit « Retirer ».
    expect(document.activeElement).toBe(annuler());
    expect(valider().textContent?.trim()).toBe(fr['v2.pl.remove']);
    expect(annuler().textContent?.trim()).toBe(fr['common.cancel']);
  });

  it('🔴 « Annuler » → rien n’est retiré, la vignette reste', async () => {
    await ouvrirEnPochettes();
    await cliquerCroix(0);
    annuler().click();
    await attendreQue(() => !laBoite(), 'la boîte fermée');
    await souffler();
    expect(retraits()).toEqual([]);
    expect(croixPochettes().length).toBe(3);
    // #3281 (fil 2941) : la légende d'une pochette nomme l'ALBUM, plus la piste.
    expect(hote!.querySelector('[data-pgrille] .pcarte .pnom')?.textContent).toBe('Automatic for the People');
  });

  it('Échap annule ; Entrée, sans avoir choisi « Retirer », annule aussi', async () => {
    await ouvrirEnPochettes();
    await cliquerCroix(0);
    touche('Escape');
    await attendreQue(() => !laBoite(), 'la boîte fermée par Échap');
    await cliquerCroix(0);
    touche('Enter');
    await attendreQue(() => !laBoite(), 'la boîte fermée par Entrée');
    await souffler();
    expect(retraits()).toEqual([]);
    expect(croixPochettes().length).toBe(3);
  });

  it('🔴 « Retirer » → le retrait part, CETTE occurrence, comme avant', async () => {
    await ouvrirEnPochettes();
    await cliquerCroix(2);
    valider().click();
    await attendreQue(() => retraits().length === 1, 'le retrait');
    expect(retraits()[0].url).toMatch(/\/api\/v1\/playlists\/12\/tracks\/remove$/);
    expect(retraits()[0].body).toEqual({ entry_id: 346 });
    await attendreQue(() => croixPochettes().length === 2, 'la vignette retirée');
    expect(hote!.textContent).not.toContain('Drive');
  });

  it('vue en liste : la croix est le même fragment, elle demande aussi confirmation', async () => {
    boite = mount(DialogContainer, { target: document.body });
    fiche = mount(PlaylistDetailV2, {
      target: hote!, props: { item: { kind: 'local', pl: { id: 12, name: 'Réveil', track_count: 3 } } as any, onClose: () => {} },
    });
    await attendreQue(() => (hote!.textContent ?? '').includes('Losing My Religion'), 'les titres affichés');
    expect(hote!.querySelector('[data-pgrille]')).toBeNull();
    hote!.querySelectorAll<HTMLButtonElement>('button[data-retirer-titre]')[0].click();
    await attendreQue(() => !!laBoite(), 'la boîte de confirmation');
    await souffler();
    expect(retraits()).toEqual([]);
    valider().click();
    await attendreQue(() => retraits().length === 1, 'le retrait');
    expect(retraits()[0].body).toEqual({ entry_id: 344 });
  });
});
