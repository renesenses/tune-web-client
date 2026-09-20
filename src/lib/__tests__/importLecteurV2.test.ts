// @vitest-environment jsdom
//
// Phase 5 (web#1257) — l'import d'une bibliothèque Roon ou Plex survit au
// retrait de l'ancienne interface.
//
// L'assistant n'existait que dans l'ancien `SettingsView`. La v2 affichait à
// sa place « l'import reste dans le client actuel », et l'inventaire classait
// `importRoon` / `importPlex` parmi les fonctions qui « n'ont jamais
// fonctionné » — faux depuis tune-server-rust #3914 : le fichier téléversé est
// lu, `?preview=true` calcule le rapport sans rien écrire, l'import réel rend
// `202 {task_id}` et son rapport se lit sur `/system/import/status/{id}`.
//
// Ce témoin MONTE les Réglages v2, ouvre Système, choisit un fichier, lit
// l'aperçu, confirme et suit la tâche. Il lit les requêtes réellement parties.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reponse(status: number, corps: unknown): Response {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let appels: { url: string; method: string; body: unknown }[] = [];
let apercu: { status: number; corps: unknown };

const RAPPORT = {
  source: 'roon_import',
  total_rows: 3,
  matched: 2,
  unmatched: 1,
  play_counts_updated: 0,
  ratings_updated: 0,
  history_entries_added: 0,
  playlists_created: 0,
  details: [
    { title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', matched: true, match_method: 'path', tune_track_id: 1 },
    { title: 'Blue in Green', artist: 'Miles Davis', album: 'Kind of Blue', matched: true, match_method: 'fuzzy', tune_track_id: 2 },
    { title: 'Inconnue', artist: 'X', album: null, matched: false, match_method: null, tune_track_id: null },
  ],
};

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrirSysteme(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  return hote;
}

function deposer(el: HTMLElement, source: 'roon' | 'plex', nom: string) {
  const champ = el.querySelector(`input.choix-${source}`) as HTMLInputElement | null;
  expect(champ, `aucun choix de fichier « ${source} » dans Réglages › Système › Import`).not.toBeNull();
  const f = new File(['Title,Artist,Album\nSo What,Miles Davis,Kind of Blue\n'], nom, { type: 'text/csv' });
  Object.defineProperty(champ!, 'files', { value: [f], configurable: true });
  champ!.dispatchEvent(new Event('change', { bubbles: true }));
}

function bouton(el: HTMLElement, libelle: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === libelle) as
    | HTMLButtonElement
    | undefined;
}

const posts = (motif: RegExp) => appels.filter((a) => a.method === 'POST' && motif.test(a.url));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  appels = [];
  apercu = { status: 200, corps: RAPPORT };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const u = String(url);
      const method = String(options?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method, body: options?.body });
      if (/\/system\/import\/(roon|plex)\?preview=true$/.test(u)) return reponse(apercu.status, apercu.corps);
      if (/\/system\/import\/(roon|plex)\?preview=false$/.test(u)) return reponse(202, { status: 'accepted', task_id: 'tache-7' });
      if (/\/system\/import\/status\/tache-7$/.test(u))
        return reponse(200, { task_id: 'tache-7', status: 'completed', imported: 1, skipped: 2, errors: 0, ...RAPPORT, details: [] });
      return reponse(200, {});
    }),
  );
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Réglages v2 › Système › Import — Roon et Plex', () => {
  it('ne renvoie plus vers l’ancien client, et ne propose pas les listes M3U (bouchon serveur)', async () => {
    const el = await ouvrirSysteme();
    expect(el.querySelector('input.choix-roon')).not.toBeNull();
    expect(el.querySelector('input.choix-plex')).not.toBeNull();
    expect(el.querySelector('input.choix-playlists')).toBeNull();
  });

  it('Roon : l’aperçu part en ?preview=true (multipart) et affiche le rapport sans rien importer', async () => {
    const el = await ouvrirSysteme();
    deposer(el, 'roon', 'roon.csv');
    await attendre();
    const p = posts(/\/system\/import\/roon\?preview=true$/);
    expect(p.length, 'aucun aperçu POST /system/import/roon?preview=true').toBe(1);
    expect(p[0].body instanceof FormData, 'le fichier ne part pas en multipart').toBe(true);
    expect(posts(/preview=false/).length, 'l’import réel part sans confirmation').toBe(0);
    const texte = el.textContent ?? '';
    expect(texte).toContain(fr['import.preview']);
    expect(texte).toContain('Blue in Green');
  });

  it('confirmer lance l’import réel, suit la tâche et affiche le rapport final', async () => {
    const el = await ouvrirSysteme();
    deposer(el, 'plex', 'plex.xml');
    await attendre();
    const confirmer = bouton(el, fr['import.confirm']);
    expect(confirmer, 'aucun bouton de confirmation').toBeDefined();
    confirmer!.click();
    await attendre(12);
    expect(posts(/\/system\/import\/plex\?preview=false$/).length, 'l’import réel ne part pas').toBe(1);
    expect(
      appels.some((a) => a.method === 'GET' && /\/system\/import\/status\/tache-7$/.test(a.url)),
      'la tâche n’est pas suivie',
    ).toBe(true);
    expect(el.textContent).toContain(fr['import.done']);
    expect(el.textContent).not.toContain(fr['v2.import.background']);
  });

  it('un CSV refusé affiche la phrase du serveur (detail), pas le corps JSON brut', async () => {
    apercu = {
      status: 422,
      corps: { error: 'csv_sans_colonne_utilisable', detail: 'aucune piste lisible dans ce CSV. En-tête reçu : « foo;bar ».' },
    };
    const el = await ouvrirSysteme();
    deposer(el, 'roon', 'mauvais.csv');
    await attendre();
    const err = el.querySelector('.errline');
    expect(err, 'aucune erreur affichée').not.toBeNull();
    expect(err!.textContent).toContain('aucune piste lisible dans ce CSV');
    expect(err!.textContent).not.toContain('{"error"');
    expect(bouton(el, fr['import.confirm'])).toBeUndefined();
  });
});
