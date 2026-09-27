// @vitest-environment jsdom
/**
 * tune-web-client#1670 — Levente Toth, fil 1992, 0.9.166 Linux :
 *
 * > « When clicking on Add music in Library, it goes to settings, but I can't
 * >   add a new folder / music anymore. »
 *
 * LA CAUSE, LUE DANS LE CODE : `LibraryV2.addContent()` faisait
 * `activeView.set('settings')` et rien d'autre. Les Réglages s'ouvraient donc
 * sur leur onglet par défaut, Général, qui ne porte AUCUN champ de dossier :
 * l'ajout vit sous Bibliothèque ▸ Emplacements (`musicDirs`).
 *
 * CE BANC NE LIT PAS LE SOURCE. Il monte la vraie Bibliothèque, CLIQUE le
 * bouton, puis monte les vrais Réglages dans l'état où le clic les laisse, et
 * cherche le champ où l'on tape le chemin.
 *
 * 🔴 CONTRE-ÉPREUVE : les mêmes Réglages, ouverts SANS passer par le bouton,
 * n'affichent pas ce champ. Sans elle, le banc serait vert dans un monde où
 * les Réglages montreraient l'ajout de dossier sur n'importe quel onglet — et
 * il ne prouverait rien du clic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { albums, libraryFolderScope, libraryLoading } from '../stores/library';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { _remiseAZeroPourTests } from '../stores/albumsPagines';
import { locale } from '../i18n';
import { V2_SETTINGS } from '../v2Settings';

vi.setConfig({ testTimeout: 30_000 });

/** Le placeholder du champ « Ajouter un dossier » de la carte Emplacements. */
const CHAMP_DOSSIER = 'input[placeholder="/Volumes/Musique"]';

const ALBUMS = Array.from({ length: 3 }, (_, i) => ({
  id: i + 1, title: `Album ${i + 1}`, artist_name: 'Artiste', year: 2000,
  cover_path: null, source: 'local', added_at: 1_000 + i,
}));

function reponse(corps: unknown): Response {
  const t = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => t,
  } as unknown as Response;
}
function servir(url: string): Response {
  const u = new URL(url, 'http://tune.test');
  if (u.pathname.endsWith('/library/albums')) {
    return reponse({ items: ALBUMS, total: ALBUMS.length, limit: 50, offset: 0 });
  }
  if (u.pathname.endsWith('/system/health')) return reponse({ status: 'ok' });
  if (u.pathname.endsWith('/config')) return reponse({ music_dirs: ['/run/media/tune/Music/Music'] });
  if (u.pathname.includes('/zones') || u.pathname.includes('/devices')) return reponse([]);
  return reponse([]);
}

class Inerte { observe() {} unobserve() {} disconnect() {} }

let hotes: HTMLDivElement[] = [];
let montes: Record<string, any>[] = [];
const attendre = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function souffler(n = 8) { for (let i = 0; i < n; i++) { await attendre(); flushSync(); } }

function monter(C: any): HTMLDivElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(C, { target: hote, props: {} }));
  return hote;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
  locale.set('en');
  _remiseAZeroPourTests();
  vi.stubGlobal('fetch', vi.fn(async (e: any) => servir(typeof e === 'string' ? e : e?.url ?? String(e))));
  vi.stubGlobal('IntersectionObserver', Inerte as unknown as typeof IntersectionObserver);
  vi.stubGlobal('ResizeObserver', Inerte as unknown as typeof ResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { setTimeout(() => f(0), 0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('library');
  v2SettingsTarget.set(null);
  libraryFolderScope.set(null as any);
  libraryLoading.set(false);
  albums.set(ALBUMS as any);
});

afterEach(() => {
  for (const m of montes) unmount(m);
  montes = [];
  for (const h of hotes) h.remove();
  hotes = [];
  albums.set([]);
  v2SettingsTarget.set(null);
  activeView.set('home');
  locale.set('fr');
  _remiseAZeroPourTests();
  vi.unstubAllGlobals();
});

/** Le bouton « Add » de la Bibliothèque, trouvé par son infobulle. */
async function cliquerAjouter(): Promise<void> {
  const lib = monter(LibraryV2);
  await souffler();
  const bouton = lib.querySelector<HTMLButtonElement>('button[title="Add music folders"]');
  expect(bouton, 'le bouton « Add » de la Bibliothèque est introuvable').toBeTruthy();
  bouton!.click();
  flushSync();
}

describe('#1670 — « Add » dans la Bibliothèque ouvre l’endroit où l’on ajoute un dossier', () => {
  it('la cible existe bien dans le vrai catalogue des Réglages (sinon le banc viserait une carte morte)', () => {
    const onglet = V2_SETTINGS.find((x) => x.id === 'library');
    expect(onglet, 'onglet « library » absent du catalogue').toBeTruthy();
    const carte = onglet!.sections.find((s) => s.id === 'musicDirs');
    expect(carte, 'carte « musicDirs » absente de l’onglet Bibliothèque').toBeTruthy();
    expect(carte!.min, 'la carte doit être offerte dès le niveau le plus bas').toBe('beginner');
    // Et elle n'est PAS sur l'onglet par défaut : c'est tout le défaut.
    const general = V2_SETTINGS.find((x) => x.id === 'general');
    expect(general?.sections.some((s) => s.id === 'musicDirs')).toBe(false);
  });

  it('🔴 le clic ouvre les Réglages SUR Bibliothèque ▸ Emplacements', async () => {
    await cliquerAjouter();
    expect(get(activeView)).toBe('settings');
    expect(get(v2SettingsTarget), 'aucune cible : les Réglages s’ouvriront sur l’onglet Général')
      .toEqual({ tab: 'library', section: 'musicDirs' });
  });

  it('🔴 après le clic, les Réglages montrent le champ du dossier, sur la carte mise en avant', async () => {
    await cliquerAjouter();
    const reg = monter(SettingsV2);
    await souffler();
    const champ = reg.querySelector<HTMLInputElement>(CHAMP_DOSSIER);
    expect(champ, 'le champ « Add folder » n’est pas à l’écran après le clic').toBeTruthy();
    const carte = champ!.closest('section.card');
    expect(carte?.classList.contains('hl'), 'la carte Emplacements n’est pas mise en avant').toBe(true);
    expect(carte?.getAttribute('data-section')).toBe('musicDirs');
    // Consommée une fois : un retour ultérieur ne rejouera pas la cible.
    expect(get(v2SettingsTarget)).toBeNull();
  });

  it('contre-épreuve : les Réglages ouverts SANS le bouton n’affichent pas ce champ', async () => {
    activeView.set('settings');
    const reg = monter(SettingsV2);
    await souffler();
    // Le montage a bien eu lieu (des cartes existent), et pourtant pas celle-là.
    expect(reg.querySelectorAll('section.card').length).toBeGreaterThan(0);
    expect(reg.querySelector(CHAMP_DOSSIER)).toBeNull();
  });
});
