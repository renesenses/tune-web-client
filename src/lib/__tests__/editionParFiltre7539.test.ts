// @vitest-environment jsdom
//
// tune-server-rust#7539 — « Modifier les métadonnées… » sur la sélection
// d'Oxygen. Ces témoins montent le vrai composant et regardent ce qui part au
// serveur : l'aperçu est OBLIGATOIRE (Confirmer reste inactif sans lui, et
// redevient inactif dès que le champ ou la valeur change), la confirmation
// renvoie les comptes VUS, et le toast annonce ces comptes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import OxygenEditionFiltre from '../../components/v2-heritage/OxygenEditionFiltre.svelte';
import OxygenEtiquetageFiltre from '../../components/v2-heritage/OxygenEtiquetageFiltre.svelte';
import { anneeValide, cibleEffective, oublierLaSondeEdition, valeurValide } from '../editionParFiltre';
import { oublierLaSonde } from '../etiquetageParFiltre';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const FILTRE = { genre: ['Swing'] };

interface Appel { url: string; method: string; body: Record<string, unknown> | null }
let appels: Appel[] = [];
let ecriture = false;
let perime = false;
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function reponse(corps: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = async () => {
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

function apercuServeur(q: URLSearchParams) {
  return {
    item_type: q.get('field') === 'album_artist' ? 'album' : q.get('item_type'),
    field: q.get('field'), value: q.get('value'),
    tracks: 1234, albums: 56, unchanged: 7, remote_skipped: 3, remote_albums_skipped: 0,
    limit: 5000, over_limit: false, file_writes_enabled: ecriture, files: ecriture ? 1200 : 0,
    files_cue_skipped: 0,
    track_examples: [{ id: 1, title: 'Take Five', context: 'Time Out', before: 'Swing', after: q.get('value') }],
    album_examples: [],
  };
}

beforeEach(() => {
  locale.set('fr');
  appels = [];
  ecriture = false;
  perime = false;
  oublierLaSonde();
  oublierLaSondeEdition();
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: RequestInit) => {
    const url = String(entree);
    const method = init?.method ?? 'GET';
    appels.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const q = new URL(url, 'http://tune.local').searchParams;
    const filtre = [...q.keys()].some((k) => !['all_of', 'item_type', 'field', 'value'].includes(k));
    if (/\/library\/(tag|edit)-by-filter\/preview/.test(url) && !filtre) {
      return reponse({ error: 'no active filter', code: 'empty_filter' }, 400);
    }
    if (/\/library\/edit-by-filter\/preview/.test(url)) return reponse(apercuServeur(q));
    if (/\/library\/edit-by-filter\?/.test(url) && method === 'POST') {
      if (perime) return reponse({ error: 'changed', code: 'preview_changed', tracks: 1300, albums: 56 }, 409);
      return reponse({ ...apercuServeur(new URLSearchParams({ field: 'genre', value: 'Jazz', item_type: 'track' })), status: 'ok', files_task_id: null });
    }
    if (/\/library\/genres/.test(url)) return reponse([{ name: 'Jazz', count: 10 }, { name: 'Swing', count: 4 }]);
    return reponse({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function monter(composant: unknown, props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant as never, { target: hote, props: props as never });
  await respirer();
  return hote;
}

const el = <T extends HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`);

async function saisir(valeur: string) {
  const champ = el<HTMLInputElement>('oxy-edit-value')!;
  champ.value = valeur;
  champ.dispatchEvent(new Event('input'));
  await respirer();
}

describe('#7539 — validation', () => {
  it('année : quatre chiffres exactement', () => {
    expect(anneeValide('1959')).toBe(true);
    for (const faux of ['59', '19590', '19a9', '0999', '']) expect(anneeValide(faux), faux).toBe(false);
    expect(valeurValide('genre', '  ')).toBe(false);
    expect(cibleEffective('album_artist', 'track')).toBe('album');
    expect(cibleEffective('composer', 'track')).toBe('track');
  });
});

describe('#7539 — la barre de sélection', () => {
  it('« Modifier les métadonnées… » à côté de « Appliquer un tag… »', async () => {
    await monter(OxygenEtiquetageFiltre, { filtres: FILTRE, cibleParDefaut: 'track', nombre: 1234 });
    el<HTMLButtonElement>('oxy-select-all')!.click();
    await respirer();
    const bouton = el<HTMLButtonElement>('oxy-edit-meta');
    expect(bouton, 'le bouton « Modifier les métadonnées… » est absent').not.toBeNull();
    bouton!.click();
    await respirer();
    expect(el('oxy-edit-dialog')).not.toBeNull();
  });
});

describe('#7539 — aperçu obligatoire, puis confirmation', () => {
  it('🔴 Confirmer est inactif sans aperçu, et le redevient quand la valeur change', async () => {
    await monter(OxygenEditionFiltre, { filtres: FILTRE, cibleParDefaut: 'track', onFermer: () => {} });
    await saisir('Jazz');
    const confirmer = el<HTMLButtonElement>('oxy-edit-confirm')!;
    expect(confirmer.disabled, 'confirmer sans aperçu').toBe(true);
    expect(appels.some((a) => a.method === 'POST')).toBe(false);

    el<HTMLButtonElement>('oxy-edit-preview')!.click();
    await respirer();
    expect(el('oxy-edit-count')!.textContent).toMatch(/1[\s,.  ]?234 morceaux et 56 albums seront modifiés/);
    expect(el('oxy-edit-examples')!.textContent).toContain('Take Five');
    expect(el('oxy-edit-files')!.textContent).toContain('ne seront pas modifiés');
    expect(confirmer.disabled).toBe(false);

    await saisir('Bebop');
    expect(confirmer.disabled, 'l’aperçu de « Jazz » ne vaut pas pour « Bebop »').toBe(true);
  });

  it('🔴 la confirmation envoie les filtres et les comptes VUS ; le toast les reprend', async () => {
    const vus: string[] = [];
    const desabo = notifications.subscribe((l) => { for (const n of l) vus.push(n.message); });
    let ferme = false;
    await monter(OxygenEditionFiltre, { filtres: FILTRE, cibleParDefaut: 'track', onFermer: () => { ferme = true; } });
    await saisir('Jazz');
    el<HTMLButtonElement>('oxy-edit-preview')!.click();
    await respirer();
    el<HTMLButtonElement>('oxy-edit-confirm')!.click();
    await respirer();

    const post = appels.find((a) => a.method === 'POST' && a.url.includes('/library/edit-by-filter?'));
    expect(post, 'aucun POST').toBeDefined();
    expect(new URL(post!.url, 'http://tune.local').search).toBe('?genre=Swing');
    expect(post!.body).toEqual({ item_type: 'track', field: 'genre', value: 'Jazz', expected_tracks: 1234, expected_albums: 56 });
    expect(vus.some((m) => /1[\s,.  ]?234 morceaux, 56 albums/.test(m)), `toast : ${vus.join(' | ')}`).toBe(true);
    expect(ferme, 'sans passe de fichiers, le dialogue se ferme').toBe(true);
    desabo();
  });

  it('réglage coché : l’aperçu annonce les fichiers réécrits', async () => {
    ecriture = true;
    await monter(OxygenEditionFiltre, { filtres: FILTRE, cibleParDefaut: 'album', onFermer: () => {} });
    await saisir('Jazz');
    el<HTMLButtonElement>('oxy-edit-preview')!.click();
    await respirer();
    expect(el('oxy-edit-files')!.textContent).toMatch(/1[\s,.  ]?200 morceaux seront réécrits/);
    expect(appels.find((a) => a.url.includes('/edit-by-filter/preview'))!.url).toContain('item_type=album');
  });

  it('année invalide : pas d’aperçu possible', async () => {
    await monter(OxygenEditionFiltre, { filtres: FILTRE, cibleParDefaut: 'track', onFermer: () => {} });
    const select = el<HTMLSelectElement>('oxy-edit-field')!;
    select.value = 'year';
    select.dispatchEvent(new Event('change'));
    await respirer();
    await saisir('59');
    expect(el<HTMLButtonElement>('oxy-edit-preview')!.disabled).toBe(true);
    await saisir('1959');
    expect(el<HTMLButtonElement>('oxy-edit-preview')!.disabled).toBe(false);
  });

  it('aperçu périmé (409) : message, nouvel aperçu, rien d’annoncé comme fait', async () => {
    perime = true;
    // Seuls les toasts NÉS pendant ce test : la liste du magasin survit aux
    // tests précédents (leur « Genre modifié » y est encore).
    const deja = new Set<number>();
    let premier = true;
    const vus: string[] = [];
    const desabo = notifications.subscribe((l) => {
      for (const n of l) {
        if (premier) deja.add(n.id as unknown as number);
        else if (!deja.has(n.id as unknown as number)) { deja.add(n.id as unknown as number); vus.push(n.message); }
      }
      premier = false;
    });
    await monter(OxygenEditionFiltre, { filtres: FILTRE, cibleParDefaut: 'track', onFermer: () => {} });
    await saisir('Jazz');
    el<HTMLButtonElement>('oxy-edit-preview')!.click();
    await respirer();
    el<HTMLButtonElement>('oxy-edit-confirm')!.click();
    await respirer();
    expect(vus.some((m) => m.includes('a changé depuis l’aperçu')), vus.join(' | ')).toBe(true);
    expect(vus.some((m) => m.includes('modifié :'))).toBe(false);
    expect(appels.filter((a) => a.url.includes('/edit-by-filter/preview')).length).toBe(2);
    desabo();
  });
});
