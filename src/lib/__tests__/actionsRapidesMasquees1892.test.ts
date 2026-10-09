// @vitest-environment jsdom
//
// #1892 (Sandro, fil 2114) — une option pour masquer les icônes d'action
// rapide d'une ligne de piste, en ne gardant que le menu « … ».
//
// Tenu ici, sur la barre MONTÉE :
//  1. par défaut rien ne change (décision du 05/09/2026) ;
//  2. l'option masque lire ensuite, file, playlist et étiquettes ; « Lire »,
//     « Lire à partir d'ici », le cœur et le « … » restent ;
//  3. la barre garde ses HUIT cases, les vides en tête : le cœur et le « … »
//     restent au même rang (fil 1906), l'Historique ne se décale pas ;
//  4. chaque geste masqué reste au menu « … » ;
//  5. le réglage existe, défaut OFF, et ses textes dans les onze langues.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { currentZoneId } from '../stores/zones';
import { preferences } from '../stores/preferences';
import { t } from '../i18n';
import { ACTIONS_MASQUABLES, actionsReduites } from '../actionsRapides';
import { entreesMenuPiste } from '../menuPiste';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const LOCALE = { id: 42, title: 'Chanson', artist_name: 'Artiste', album_id: 7, artist_id: 3, duration_ms: 200000, source: 'local' };

const hotes: HTMLDivElement[] = [];
const montes: Record<string, any>[] = [];

function barre(): HTMLElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(PisteActions, { target: hote, props: { piste: LOCALE, onLireDepuis: () => {} } as any }));
  flushSync();
  return hote.querySelector<HTMLElement>('.pactions')!;
}
const cases = (b: HTMLElement) => Array.from(b.children) as HTMLElement[];
const libelles = (b: HTMLElement) =>
  Array.from(b.querySelectorAll('button')).map((x) => x.getAttribute('aria-label'));
const tr = (k: string) => get(t)(k as any);

beforeEach(() => {
  currentZoneId.set(1);
  preferences.update((p) => ({ ...p, v2ActionsReduites: false }));
});
afterEach(() => {
  for (const m of montes.splice(0)) unmount(m);
  for (const h of hotes.splice(0)) h.remove();
  currentZoneId.set(null);
  preferences.update((p) => ({ ...p, v2ActionsReduites: false }));
});

describe('#1892 — les icônes d’action rapide', () => {
  it('par défaut, rien ne change : les quatre raccourcis sont là', () => {
    expect(actionsReduites(get(preferences))).toBe(false);
    const l = libelles(barre());
    for (const k of ['v2.pa.next', 'v2.pa.queue', 'v2.pa.playlist', 'v2.cover.tags']) {
      expect(l, k).toContain(tr(k));
    }
  });

  it('l’option masque les quatre raccourcis repris par le menu', () => {
    preferences.update((p) => ({ ...p, v2ActionsReduites: true }));
    const l = libelles(barre());
    for (const k of ['v2.pa.next', 'v2.pa.queue', 'v2.pa.playlist', 'v2.cover.tags']) {
      expect(l, `${k} est encore là`).not.toContain(tr(k));
    }
    // Ce qui reste : lire, à partir d'ici, le cœur, le menu.
    expect(l).toContain(tr('v2.pa.play'));
    expect(l).toContain(tr('common.playFromHere'));
    const b = barre();
    expect(b.querySelector('.coeur'), 'le cœur a disparu').toBeTruthy();
    expect(b.querySelector('[aria-haspopup="menu"]'), 'le « … » a disparu').toBeTruthy();
  });

  it('🔴 la barre garde ses huit cases, les vides en tête, cœur et « … » au même rang', () => {
    const pleine = barre();
    const rangCoeur = cases(pleine).findIndex((el) => el.classList.contains('coeur'));
    const rangMenu = cases(pleine).findIndex((el) => el.getAttribute('aria-haspopup') === 'menu');
    preferences.update((p) => ({ ...p, v2ActionsReduites: true }));
    const reduite = barre();
    expect(cases(reduite).length).toBe(8);
    expect(cases(reduite).slice(0, 4).every((el) => el.classList.contains('vide'))).toBe(true);
    expect(cases(reduite).findIndex((el) => el.classList.contains('coeur'))).toBe(rangCoeur);
    expect(cases(reduite).findIndex((el) => el.getAttribute('aria-haspopup') === 'menu')).toBe(rangMenu);
  });

  it('chaque geste masqué reste au menu « … »', () => {
    const fait = () => {};
    const cles = entreesMenuPiste(
      { jouable: true, idBibliotheque: 42, artistId: 3, albumId: 7 },
      { lire: fait, ensuite: fait, aLaFile: fait, ajouterAPlaylist: fait, etiqueter: fait },
    ).map((e) => e.cle);
    for (const k of ACTIONS_MASQUABLES) expect(cles, k).toContain(k);
  });
});

describe('#1892 — le réglage', () => {
  const reglages = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf8');
  const prefs = readFileSync(resolve(__dirname, '../stores/preferences.ts'), 'utf8');

  it('existe dans les Réglages, et son défaut est OFF', () => {
    expect(reglages).toMatch(/checked=\{\$preferences\.v2ActionsReduites\}/);
    expect(prefs).toMatch(/v2ActionsReduites: false,/);
  });

  const DICOS = { de, en, es, fr, hu, it: it_, ja, ko, ro, sv, zh } as unknown as Record<string, Record<string, string>>;
  it.each(Object.keys(DICOS))('%s porte le libellé et l’aide', (l) => {
    expect(DICOS[l]['settings.trackActionsReduced']?.trim()).toBeTruthy();
    expect(DICOS[l]['settings.trackActionsReducedHint']?.trim()).toBeTruthy();
  });
});
