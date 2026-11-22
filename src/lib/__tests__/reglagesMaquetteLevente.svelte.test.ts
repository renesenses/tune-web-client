// @vitest-environment jsdom
//
// Réglages — maquette de Levente (Figma 619:5832 / 620:5835, note 620:5837,
// 15/11/2026) : « Settings section to keep @720px wide so the users can
// easily read the text. Braking up the settings into sections helps overview
// of what the user might need. Long settings, eg. Sidebar, moving to a second
// screen can also help the better overview. »
//
// Ces témoins MONTENT le vrai écran de réglages : la colonne de 720 px, les
// intertitres de la carte Interface, et l'écran secondaire « Barre latérale »
// — atteint par sa ligne, par le retour, et par la recherche (ancre).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { V2_SETTINGS, type V2SettingsTabId } from '../v2Settings';
import { reglageParId, ongletDuReglage } from '../reglagesIndex';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import { get } from 'svelte/store';
import { t } from '../i18n';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}
async function monter(cible?: { tab: V2SettingsTabId; section?: string; reglage?: string }) {
  if (cible) v2SettingsTarget.set(cible as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  return hote;
}
const ouvreur = () => hote!.querySelector<HTMLButtonElement>('button.lien-sous-ecran[data-ouvre-sous-ecran="sidebar"]');

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    json(/\/(zones|profiles|devices|playlists|shortcuts|plugins)(\?|$)/.test(String(url)) ? [] : {})));
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

describe('Réglages — carte de la maquette de Levente', () => {
  it('« Barre latérale » est une section d’écran secondaire de l’onglet Général, juste après Interface', () => {
    const general = V2_SETTINGS.find((t) => t.id === 'general')!;
    const ids = general.sections.map((s) => s.id);
    expect(ids.indexOf('sidebar')).toBe(ids.indexOf('interface') + 1);
    const s = general.sections.find((x) => x.id === 'sidebar')!;
    expect(s.sousEcran).toBe(true);
    expect(s.min).toBe('beginner');
  });

  it('les sources et l’ordre de la barre sont rangés sous elle dans l’index de recherche', () => {
    for (const id of ['sources-barre', 'ordre-barre']) {
      const r = reglageParId(id)!;
      expect(r.section, id).toBe('sidebar');
      expect(ongletDuReglage(r), id).toBe('general');
    }
  });

  it('les nouveaux textes existent dans les 15 langues', () => {
    const cles = ['reglages.barreLaterale.titre', 'reglages.barreLaterale.resume', 'reglages.barreLaterale.deplace',
      'reglages.barreLaterale.ouvrir', 'reglages.interface.apparence', 'reglages.interface.barreLecture',
      'reglages.interface.navigation', 'reglages.interface.details', 'reglages.onglets.precedents', 'reglages.onglets.suivants'];
    expect(ONZE_LANGUES.length).toBe(20);
    for (const lg of ONZE_LANGUES) for (const k of cles) expect(dictionnaire(lg)[k], `${lg} : ${k}`).toBeTruthy();
  });

  it('la colonne des réglages s’arrête à 720 px (jetons, aucune couleur en dur)', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'v2', 'SettingsV2.svelte'), 'utf8');
    expect(src).toMatch(/\.pane > \*\{[^}]*max-width:720px/);
    const css = src.slice(src.indexOf('.panehead.cache'), src.indexOf('.retour-sous-ecran:focus-visible'));
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});

describe('Réglages — écran monté', () => {
  it('Général › Interface : quatre blocs titrés, dans l’ordre', { timeout: 60_000 }, async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    const el = await monter({ tab: 'general', section: 'interface' });
    const carte = el.querySelector('[data-section="interface"]')!;
    const titres = [...carte.querySelectorAll('h4.sous-titre')].map((h) => h.textContent?.trim());
    expect(titres.length).toBe(4);
    // Le thème ouvre « Apparence », la langue ouvre « Navigation ».
    const h4 = [...carte.querySelectorAll('h4.sous-titre')];
    const theme = carte.querySelector('[data-reglage="theme"]')!;
    const langue = carte.querySelector('[data-reglage="langue"]')!;
    expect(h4[0].compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(h4[2].compareDocumentPosition(langue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(h4[1].compareDocumentPosition(langue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('en Essentiel, l’onglet Général montre une ligne « Barre latérale », pas ses réglages', { timeout: 60_000 }, async () => {
    const el = await monter({ tab: 'general' });
    expect(ouvreur(), 'aucune ligne vers l’écran Barre latérale').not.toBeNull();
    expect(el.querySelector('[data-reglage="sources-barre"]')).toBeNull();
    expect(el.querySelector('[data-reglage="ordre-barre"]')).toBeNull();
  });

  it('la ligne ouvre l’écran secondaire, seul, et le retour ramène l’onglet entier', { timeout: 60_000 }, async () => {
    const el = await monter({ tab: 'general' });
    ouvreur()!.click();
    await attendre();
    expect(el.querySelector('[data-sous-ecran="sidebar"]'), 'pas d’en-tête d’écran secondaire').not.toBeNull();
    expect(el.querySelector('[data-reglage="sources-barre"]')).not.toBeNull();
    expect(el.querySelector('[data-reglage="ordre-barre"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-type-source]').length).toBeGreaterThan(0);
    // Seule la section de l'écran secondaire est à l'écran.
    expect(el.querySelector('[data-section="playback"]')).toBeNull();
    expect(el.querySelector('[data-section="interface"]')).toBeNull();

    el.querySelector<HTMLButtonElement>('[data-retour-sous-ecran]')!.click();
    await attendre();
    expect(el.querySelector('[data-sous-ecran]')).toBeNull();
    expect(el.querySelector('[data-section="playback"]')).not.toBeNull();
    expect(ouvreur()).not.toBeNull();
  });

  it('les cases « Sources dans la barre latérale » agissent toujours sur la préférence', { timeout: 60_000 }, async () => {
    const el = await monter({ tab: 'general', section: 'sidebar' });
    const cases = [...el.querySelectorAll<HTMLInputElement>('[data-type-source]')];
    expect(cases.length).toBeGreaterThan(0);
    const c = cases[0];
    const avant = c.checked;
    c.click();
    await attendre();
    expect(c.checked).toBe(!avant);
  });

  it('la recherche (ancre « sources-barre ») ouvre l’écran secondaire depuis un autre onglet', { timeout: 60_000 }, async () => {
    const el = await monter({ tab: 'display', reglage: 'sources-barre' });
    expect(el.querySelector('[data-sous-ecran="sidebar"]')).not.toBeNull();
    expect(el.querySelector('[data-reglage="sources-barre"]')).not.toBeNull();
  });

  it('Affichage garde une ligne qui mène aux sources de la barre (rien ne disparaît)', { timeout: 60_000 }, async () => {
    const el = await monter({ tab: 'display', section: 'displayPrefs' });
    const lien = el.querySelector<HTMLButtonElement>('[data-section="displayPrefs"] [data-ouvre-sous-ecran="sidebar"]');
    expect(lien, 'pas de renvoi depuis Affichage').not.toBeNull();
    lien!.click();
    await attendre();
    expect(el.querySelector('[data-sous-ecran="sidebar"]')).not.toBeNull();
    expect(el.querySelector('[data-reglage="sources-barre"]')).not.toBeNull();

    // Relecture du 15/11 : ouvert depuis Affichage, le retour ramène à Affichage.
    const retour = el.querySelector<HTMLButtonElement>('[data-retour-sous-ecran]')!;
    expect(retour.textContent).toContain(get(t)('settings.tabDisplay' as any));
    retour.click();
    await attendre();
    expect(el.querySelector('[data-sous-ecran]')).toBeNull();
    expect(el.querySelector('[data-section="displayPrefs"]'), 'le retour n’a pas ramené à Affichage').not.toBeNull();
    expect(el.querySelector('[data-section="playback"]')).toBeNull();
  });

  it('changer d’onglet referme l’écran secondaire', { timeout: 60_000 }, async () => {
    const el = await monter({ tab: 'general', section: 'sidebar' });
    expect(el.querySelector('[data-sous-ecran="sidebar"]')).not.toBeNull();
    const onglets = [...el.querySelectorAll<HTMLButtonElement>('nav.tabs .tab')];
    onglets[1].click();
    await attendre();
    expect(el.querySelector('[data-sous-ecran]')).toBeNull();
  });

  it('barre d’onglets qui déborde : fondu au bord coupé et flèche qui la fait défiler', { timeout: 60_000 }, async () => {
    const el = await monter({ tab: 'general' });
    const nav = el.querySelector<HTMLElement>('nav.tabs')!;
    Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(nav, 'scrollWidth', { configurable: true, value: 1200 });
    const pas: number[] = [];
    (nav as any).scrollBy = ({ left }: { left: number }) => { pas.push(left); };
    nav.dispatchEvent(new Event('scroll'));
    await attendre();
    const cadre = el.querySelector('.tabs-cadre')!;
    expect(cadre.classList.contains('fondu-d'), 'pas de fondu au bord droit coupé').toBe(true);
    expect(cadre.classList.contains('fondu-g')).toBe(false);
    el.querySelector<HTMLButtonElement>('[data-defiler-onglets="d"]')!.click();
    expect(pas.length).toBe(1);
    expect(pas[0]).toBeGreaterThan(0);
    // Tout tient : ni fondu ni flèche.
    Object.defineProperty(nav, 'scrollWidth', { configurable: true, value: 400 });
    nav.dispatchEvent(new Event('scroll'));
    await attendre();
    expect(cadre.classList.contains('fondu-d')).toBe(false);
    expect(el.querySelector('[data-defiler-onglets]')).toBeNull();
  });
});
