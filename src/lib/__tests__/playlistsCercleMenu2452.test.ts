// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PlaylistsCercleSection from '../../components/v2/PlaylistsCercleSection.svelte';
import { preparerLocale } from '../i18n';

/**
 * web#2452 — le menu Playlists montre aussi les playlists Tune Circle, avec
 * les appels de l'écran Circle (`GET /ext/circle/playlists`, puis la fiche).
 * Sans compte relié (412), sans greffon (404) ou sans playlist : RIEN.
 */

type Etat = { liste: { status: number; corps: unknown } };
let etat: Etat;
let appels: string[] = [];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const LISTE = [
  { id: 'pl-1', name: 'Dimanche jazz', owner: { user_id: 7, name: 'Camille' }, count: 12, version: 3, updated_at: null, mine: false, circle_id: null, circle_name: 'Famille' },
  { id: 'pl-2', name: 'Route', owner: { user_id: 1, name: 'Moi' }, count: 4, version: 1, updated_at: null, mine: true, circle_id: 5, circle_name: 'Amis' },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  appels = [];
  etat = { liste: { status: 200, corps: LISTE } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    appels.push(`${(init?.method ?? 'GET').toUpperCase()} ${u.replace(/^.*\/api\/v1/, '')}`);
    const chemin = u.split('?')[0].replace(/^.*\/api\/v1\/ext\/circle/, '');
    if (chemin === '/playlists') return reponse(etat.liste.status, etat.liste.corps);
    if (chemin === '/playlists/pl-1') {
      return reponse(200, { id: 'pl-1', name: 'Dimanche jazz', version: 3, mine: false,
        items: [{ item_id: 'it-1', title: 'So What', mine: false, added_by: { nom: 'Camille' }, added_at: '2026-10-20T10:00:00Z' }] });
    }
    if (chemin.endsWith('/resolve')) return reponse(200, []);
    return reponse(404, { error: 'not_found' });
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  vi.unstubAllGlobals();
});

async function laisserFaire() {
  for (let i = 0; i < 15; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function monter(props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistsCercleSection, { target: hote, props });
  flushSync();
  await laisserFaire();
  return hote;
}

describe('web#2452 — section Tune Circle du menu Playlists', () => {
  it('liste les playlists partagées avec leur auteur et leur cercle, par les appels de l’écran Circle', async () => {
    const el = await monter();
    const lignes = [...el.querySelectorAll('li.playlist-cercle')];
    expect(lignes).toHaveLength(2);
    expect(el.querySelector('section')?.getAttribute('aria-labelledby')).toBe('pl-cercle-titre');
    expect(lignes[0].textContent).toContain('Dimanche jazz');
    expect(lignes[0].textContent).toContain('Camille');
    expect(lignes[0].textContent).toContain('Famille');
    expect(lignes[1].textContent).toContain('partagée par moi');
    expect(lignes[1].textContent).toContain('Amis');
    expect(appels).toEqual(['GET /ext/circle/playlists']);
  });

  it('sans compte relié (412) : rien n’est rendu', async () => {
    etat.liste = { status: 412, corps: { connected: false, code: 'circle.not_connected' } };
    const el = await monter();
    expect(el.querySelector('section')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('greffon ou serveur sans la route (404) : rien n’est rendu', async () => {
    etat.liste = { status: 404, corps: {} };
    const el = await monter();
    expect(el.querySelector('section')).toBeNull();
  });

  it('aucune playlist de cercle : rien n’est rendu', async () => {
    etat.liste = { status: 200, corps: [] };
    const el = await monter();
    expect(el.querySelector('section')).toBeNull();
  });

  it('le filtre de l’écran hôte s’applique, sans accents ni casse', async () => {
    const el = await monter({ filtre: 'DIMANCHÉ' });
    const lignes = [...el.querySelectorAll('li.playlist-cercle')];
    expect(lignes).toHaveLength(1);
    expect(lignes[0].textContent).toContain('Dimanche jazz');
  });

  it('ouvrir une playlist donne la fiche de l’écran Circle (titres et date d’ajout), et Échap la ferme', async () => {
    const el = await monter();
    (el.querySelector('li.playlist-cercle .ouvrir-playlist-cercle') as HTMLButtonElement).click();
    flushSync();
    await laisserFaire();
    const calque = document.body.querySelector('.calque-cercle') ?? el.querySelector('.calque-cercle');
    expect(calque?.getAttribute('role')).toBe('dialog');
    expect(calque?.getAttribute('aria-modal')).toBe('true');
    expect(calque?.querySelector('.nom-playlist')?.textContent?.trim()).toBe('Dimanche jazz');
    expect(calque?.querySelector('li.morceau .titre-morceau')?.textContent?.trim()).toBe('So What');
    expect(appels).toContain('GET /ext/circle/playlists/pl-1');
    calque!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(el.querySelector('.calque-cercle')).toBeNull();
  });

  it('le menu Playlists (gestionnaire) monte la section avec son filtre de recherche', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/v2-heritage/PlaylistManagerView.svelte'), 'utf8');
    expect(src).toContain("import PlaylistsCercleSection from '../v2/PlaylistsCercleSection.svelte'");
    expect(src).toContain('<PlaylistsCercleSection filtre={searchQuery}');
  });

  it('pastille Tune Circle (web#2543) : la section ne se montre que pastille choisie, la pastille suit onexiste', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/v2-heritage/PlaylistManagerView.svelte'), 'utf8');
    expect(src).toContain("visible={activeFilter === 'circle'}");
    expect(src).toContain('{#if cercleExiste}');
    expect(src).toContain("activeFilter = 'circle'");
    // la grille et ses messages disparaissent sous la pastille Circle
    expect(src).toContain("{#if activeFilter !== 'circle'}");
  });

  it('visible=false : la liste n’est pas rendue mais l’hôte est prévenu que la section existe', async () => {
    const onexiste = vi.fn();
    const el = await monter({ visible: false, onexiste });
    expect(el.querySelector('section')).toBeNull();
    expect(onexiste).toHaveBeenLastCalledWith(true);
  });

  it('visible=true : la liste est rendue', async () => {
    const el = await monter({ visible: true });
    expect(el.querySelectorAll('li.playlist-cercle')).toHaveLength(2);
  });

  it('sans playlist de cercle : l’hôte est prévenu que la section n’existe pas (pas de pastille)', async () => {
    etat.liste = { status: 200, corps: [] };
    const onexiste = vi.fn();
    await monter({ visible: false, onexiste });
    expect(onexiste).toHaveBeenLastCalledWith(false);
    expect(onexiste).not.toHaveBeenCalledWith(true);
  });
});
