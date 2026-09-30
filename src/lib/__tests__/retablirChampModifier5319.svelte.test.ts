// @vitest-environment jsdom
//
// « Modifié à la main » et « Rétablir » dans le mode Modifier — décision de
// Bertrand du 29/09/2026 (tune-server-rust#5319).
//
// Chaque champ de `champs_edites` porte un badge. « Rétablir » demande
// confirmation (composant `dialogs`), puis
// `POST /library/albums/{id}/edition/retablir` `{ field }` : le serveur rend
// la fiche d'édition, où le champ a repris la valeur des balises et n'est plus
// marqué. Le bouton n'existe que si la fiche annonce `retablir_champ`.
//
// `fetch` est remplacé, pas `api.ts` : ce témoin lit ce qui part sur le réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import { locale } from '../i18n';
import { dialogs } from '../stores/dialogs';
import { activeView } from '../stores/navigation';
import type { Album } from '../types';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import type { EditionReponse } from '../editionAlbum';
import lFr from '../locales/fr';

const FR = lFr as Record<string, string>;

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

const ALBUM_ID = 101;
const LOCAL = { id: ALBUM_ID, title: 'Mon titre', artist_name: 'Miles Davis', year: 2001 } as Album;

function edition(titre: string, edites: string[], sonde: boolean): EditionReponse {
  return {
    album: {
      id: ALBUM_ID, title: titre, album_artist: 'Miles Davis', year: 2001, label: null,
      genre: 'Jazz', release_type: 'album', cover_path: null, compilation_mode: 'auto',
      compilation_effective: false, coffret: null, champs_edites: edites,
    },
    discs: [{ number: 1, title: null, cover_path: null, track_count: 1 }],
    tracks: [{ id: 11, disc_number: 1, track_number: 1, title: 'So What', artist_name: 'Miles Davis', duration_ms: 562000 }],
    ecriture_balises: true,
    ...(sonde ? { retablir_champ: true } : {}),
  };
}

const reponse = (corps: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Err',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 3000): Promise<boolean> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return true;
    if (Date.now() >= fin) return false;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let appels: { methode: string; url: string; corps: any }[] = [];
let sonde = true;
let refusRetablir: number | null = null;

beforeEach(() => {
  appels = [];
  sonde = true;
  refusRetablir = null;
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const methode = (init?.method ?? 'GET').toUpperCase();
    const corps = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    appels.push({ methode, url: u, corps });
    if (/\/edition\/retablir$/.test(u)) {
      if (refusRetablir) return reponse({ error: 'retablir_par_defaire', message: 'coffret' }, refusRetablir);
      // Le titre a repris la valeur des balises ; seule l'année reste marquée.
      return reponse(edition('Kind of Blue', ['year'], sonde));
    }
    if (/\/library\/albums\/\d+\/edition$/.test(u)) return reponse(edition('Mon titre', ['title', 'year', 'discs'], sonde));
    if (/\/library\/albums\/\d+\/tracks/.test(u)) return reponse([]);
    if (/\/library\/albums\/\d+$/.test(u)) return reponse(LOCAL);
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('library');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.unstubAllGlobals();
});

const q = <T extends Element = HTMLElement>(sel: string) => hote?.querySelector<T>(sel) ?? null;
const retablirs = () => appels.filter((a) => /\/edition\/retablir$/.test(a.url));

async function ouvrirEdition() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { onClose: () => {}, album: LOCAL } as any });
  flushSync();
  expect(await jusqua(() => !!q('[data-modifier-album]')), 'pas de bouton « Modifier »').toBe(true);
  q<HTMLButtonElement>('[data-modifier-album]')!.click();
  expect(await jusqua(() => !!q('.edition'))).toBe(true);
}

async function repondre(oui: boolean): Promise<string> {
  expect(await jusqua(() => get(dialogs).length > 0), 'aucune confirmation demandée').toBe(true);
  const [d] = get(dialogs);
  dialogs.settle(d.id, oui);
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
  return d.message;
}

describe('mode Modifier — « modifié à la main » et « Rétablir » (#5319)', () => {
  it('🔴 un badge sur CHAQUE champ modifié, et sur lui seul', async () => {
    await ouvrirEdition();
    expect(q('[data-modifie="title"]')?.textContent?.trim()).toBe(FR['v2.edition.editedBadge']);
    expect(q('[data-modifie="year"]')).not.toBeNull();
    expect(q('[data-modifie="discs"]'), 'la disposition des disques aussi').not.toBeNull();
    expect(q('[data-modifie="label"]'), 'le label n’est pas modifié').toBeNull();
    expect(q('[data-retablir="title"]')).not.toBeNull();
  });

  it('🔴 « Rétablir » : confirmation de l’application, POST du champ, champ relu et badge retiré', async () => {
    const confirmNatif = vi.spyOn(window, 'confirm');
    await ouvrirEdition();
    q<HTMLButtonElement>('[data-retablir="title"]')!.click();
    expect(await repondre(true)).toBe(FR['v2.edition.restoreAsk']);
    expect(await jusqua(() => retablirs().length === 1)).toBe(true);
    expect(retablirs()[0].methode).toBe('POST');
    expect(retablirs()[0].url).toMatch(new RegExp(`/library/albums/${ALBUM_ID}/edition/retablir$`));
    expect(retablirs()[0].corps).toEqual({ field: 'title' });
    expect(await jusqua(() => q('[data-modifie="title"]') === null), 'le badge du titre reste').toBe(true);
    expect(q<HTMLInputElement>('.ed-champs [name="title"]')!.value, 'le titre des balises').toBe('Kind of Blue');
    expect(q('[data-modifie="year"]'), 'l’année reste modifiée').not.toBeNull();
    expect(confirmNatif).not.toHaveBeenCalled();
    confirmNatif.mockRestore();
  });

  it('🟢 CONTRE-ÉPREUVE : annuler n’envoie rien', async () => {
    await ouvrirEdition();
    q<HTMLButtonElement>('[data-retablir="year"]')!.click();
    await repondre(false);
    expect(retablirs()).toHaveLength(0);
    expect(q('[data-modifie="year"]')).not.toBeNull();
  });

  it('🟢 CONTRE-ÉPREUVE : serveur sans la sonde — les badges, pas de bouton', async () => {
    sonde = false;
    await ouvrirEdition();
    expect(q('[data-modifie="title"]')).not.toBeNull();
    expect(q('[data-retablir="title"]')).toBeNull();
  });

  it('🔴 grisé tant qu’une modification n’est pas enregistrée', async () => {
    await ouvrirEdition();
    const titre = q<HTMLInputElement>('.ed-champs [name="label"]')!;
    titre.value = 'Columbia';
    titre.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(q<HTMLButtonElement>('[data-retablir="title"]')!.disabled).toBe(true);
  });

  it('🔴 les disques d’un coffret : le serveur répond 409, l’écran dit « Défaire le coffret »', async () => {
    refusRetablir = 409;
    await ouvrirEdition();
    q<HTMLButtonElement>('[data-retablir="discs"]')!.click();
    await repondre(true);
    expect(await jusqua(() => !!q('[data-erreur-edition]'))).toBe(true);
    expect(q('[data-erreur-edition]')!.textContent).toContain(FR['v2.edition.restoreByUndo']);
  });
});
