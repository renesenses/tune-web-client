// @vitest-environment jsdom
//
// web#2324 — décision de Bertrand (23/10/2026) sur le point 1 de Didier
// (fil 2390) : « Analyser la bibliothèque » passe EN TÊTE de Réglages ›
// Bibliothèque ; le bloc ISO SACD descend dans les options (« Options de
// scan »). Avant, l'état de l'outil ISO SACD venait en premier et noyait la
// fonction la plus importante de la page.
//
// Le témoin MONTE le vrai écran Réglages › Bibliothèque et lit l'ordre rendu.
// ⛔ Il n'établit pas le rendu visuel d'un navigateur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const fr = dictionnaire('fr');
let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
class Observer { observe() {} unobserve() {} disconnect() {} }
const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.includes('/sacd-rip/iso-status') ? { available: false, tool: 'none' } : /\/(zones|devices)(\?|$)/.test(url) ? [] : {};
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

async function monter(niveau: 'beginner' | 'intermediate') {
  preferences.update((p) => ({ ...p, settingsLevel: niveau }));
  v2SettingsTarget.set({ tab: 'library', section: 'library' });
  component = mount(SettingsV2, { target: host });
  await settle();
}

describe('web#2324 — ordre de Réglages › Bibliothèque', () => {
  it('« Analyser la bibliothèque » est la première chose de la carte Bibliothèque, sans ISO SACD avant', async () => {
    await monter('beginner');
    const carte = host.querySelector<HTMLElement>('section.card[data-section="library"]')!;
    expect(carte).not.toBeNull();
    const premier = carte.querySelector('.row, .sacd-status');
    expect(premier?.matches('.row[data-analyse-bibliotheque]'), 'la première ligne n’est pas « Analyser la bibliothèque »').toBe(true);
    expect(premier?.textContent).toContain(fr['settings.scanLibraryV2']);
    expect(carte.querySelector('.sacd-status'), 'ISO SACD est encore dans la carte Bibliothèque').toBeNull();
  });

  it('le bloc ISO SACD vit dans « Options de scan », après la carte Bibliothèque', async () => {
    await monter('intermediate');
    const options = host.querySelector<HTMLElement>('section.card[data-section="scanOpts"]')!;
    expect(options).not.toBeNull();
    expect(options.querySelector('.sacd-status')?.textContent).toContain(fr['sacdIso.title']);
    const cartes = [...host.querySelectorAll<HTMLElement>('section.card[data-section]')].map((c) => c.dataset.section);
    expect(cartes.indexOf('library')).toBeLessThan(cartes.indexOf('scanOpts'));
  });
});
