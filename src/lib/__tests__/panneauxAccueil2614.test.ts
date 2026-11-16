// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { concertsPlugin } from '../stores/concerts';
import { locale } from '../i18n';
import { panneauxDeLaLigne } from '../premiereLigne';

let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | null = null;
let prefs: Record<string, any>;
const souffler = () => new Promise((r) => setTimeout(r, 120));
const catalogue = [{ id: 'premiere-ligne', cleTitre: 'v2.home.wFirstRow', forme: 'premiere-ligne', sansTitre: true, charger: async () => [] }];
async function ouvrir() {
  hote = document.createElement('div'); document.body.appendChild(hote);
  monte = mount(PageWidgets, { target: hote, props: { catalogue: catalogue as any, dispositionDefaut: ['premiere-ligne'], cle: 'accueil_temoin' } });
  flushSync(); await souffler(); flushSync();
}
async function fermer() {
  if (monte) await unmount(monte);
  monte = null; hote?.remove();
}
const titres = () => [...hote.querySelectorAll('.l1 h3')].map((e) => e.textContent);
async function modifier() {
  hote.querySelector<HTMLButtonElement>('button.v2-btn')!.click();
  flushSync(); await souffler(); flushSync();
}
async function cocher(nom: string) {
  const etiquette = [...hote.querySelectorAll('label.opt')].find((e) => e.textContent?.trim() === nom);
  expect(etiquette, `commande de choix absente : ${nom}`).toBeTruthy();
  etiquette!.querySelector<HTMLInputElement>('input')!.click();
  flushSync(); await souffler(); flushSync();
}
beforeEach(() => {
  prefs = { autre_reglage: 'conservé' };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); let corps: any = {};
    if (url.includes('/profiles/1/settings')) {
      if (init?.method === 'POST') prefs = JSON.parse(String(init.body));
      corps = { ...prefs };
    } else if (url.includes('favorites')) corps = [];
    else if (url.includes('/library/genres')) corps = [];
    else if (url.includes('/concerts')) corps = { concerts: [] };
    return { ok: true, status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'application/json' }), json: async () => corps, text: async () => JSON.stringify(corps) } as Response;
  }));
  currentProfileId.set(1); locale.set('en'); concertsPlugin.set({ name: 'concerts', enabled: true });
});
afterEach(async () => { await fermer(); concertsPlugin.set(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('choisit les panneaux dans la page et retrouve ce choix après réouverture', async () => {
  await ouvrir();
  expect(titres()).toEqual(['Genres', 'Concerts near you', 'My listening']);
  await modifier();
  expect(hote.textContent).toContain('Listening overview');
  expect(hote.textContent).not.toContain('First row');
  await cocher('Genres');
  expect(titres(), 'décocher Genres doit retirer son panneau').toEqual(['Concerts near you', 'My listening']);
  expect(prefs.accueil_temoin_panneaux).toEqual(['concerts', 'stats']);
  expect(prefs.autre_reglage).toBe('conservé');
  await fermer(); await ouvrir();
  expect(titres(), 'le choix est perdu au remontage').toEqual(['Concerts near you', 'My listening']);
  await modifier(); await cocher('Genres');
  expect(titres()).toEqual(['Genres', 'Concerts near you', 'My listening']);
});

it('conserve un choix sans panneau et laisse les commandes accessibles', async () => {
  prefs.accueil_temoin_panneaux = [];
  await ouvrir(); expect(titres()).toEqual([]);
  await modifier(); await cocher('My listening');
  expect(titres()).toEqual(['My listening']);
  expect(prefs.accueil_temoin_panneaux).toEqual(['stats']);
});

it('distingue préférence absente et vide, sans effacer les choix des versions suivantes', () => {
  expect(panneauxDeLaLigne(undefined)).toEqual(['genres', 'concerts', 'stats']);
  expect(panneauxDeLaLigne(null)).toEqual(['genres', 'concerts', 'stats']);
  expect(panneauxDeLaLigne([])).toEqual([]);
  expect(panneauxDeLaLigne(['genres', 'futur', 17, 'genres'])).toEqual(['genres', 'futur']);
});
