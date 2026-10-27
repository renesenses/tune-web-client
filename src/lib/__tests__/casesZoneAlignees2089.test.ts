// @vitest-environment jsdom
//
// web#2089 (Didier, fil 2222) — Réglages › Appareils, carte d'une zone :
// « suivant les choix des listes DSD, Fréquence Max et Décalage Paroles, les
// deux listes à puce suivantes peuvent ne plus être alignées ». La capture :
// DSD = « Natif » avec la note « le DSD natif est envoyé en DoP » (#1876), et
// les cases « Volume fixe » et « Sortie mono » descendues au niveau de la note.
//
// LE MÉCANISME
// ------------
// La rangée `.zr` est un flex. Les cases (`.zf.chk`) y étaient alignées sur le
// BAS de la rangée (`align-self:flex-end; padding-bottom:8px`) : tant que les
// colonnes ne portaient qu'un intitulé et un sélecteur, le bas de la rangée
// tombait sous les sélecteurs. La note DoP allonge la colonne DSD, donc la
// rangée, et les cases suivent le bas.
//
// CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS
// ------------------------------------------------
// jsdom ne calcule aucune mise en page. On lit la cascade RÉELLE de la feuille
// de `SettingsV2` (`cascadeCss.ts`, le moteur de `plafondSousLaBarre1837`) et
// on place les deux boîtes d'après elle, pour une rangée sans note puis avec
// une note de deux lignes : le centre des cases doit tomber sur celui des
// sélecteurs dans les deux cas. Un dernier cas monte la carte et vérifie que
// la rangée porte bien ces éléments, note comprise.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extraireFeuilleDeStyle, releverDeclarations, valeurEffective, type Contexte } from '../cascadeCss';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { zones } from '../stores/zones';
import { dictionnaire } from './onzeDictionnaires';

const FEUILLE = extraireFeuilleDeStyle(readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8'));
const PROPS = ['align-self', 'padding-bottom', 'margin-top', 'height', 'gap', 'line-height'];
const REGLES = releverDeclarations(FEUILLE, PROPS);
const CTX: Contexte = { ecran: { largeur: 1440, hauteur: 900 }, survol: false };

/** Les sélecteurs de la feuille qui visent chaque élément de la rangée. */
const CASE = ['.zf', '.zf.chk', '.zr > .zf.chk'];
const CHAMP = ['.zf'];
const INTITULE = ['.zf > span'];
const SELECTEUR = ['.sel', '.sel.sm'];

const px = (sel: readonly string[], prop: string, defaut?: number): number => {
  const v = valeurEffective(REGLES, sel, prop, CTX);
  if (v == null && defaut != null) return defaut;
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(v ?? '');
  expect(m, `${sel.at(-1)} { ${prop} } : « ${v} » n’est pas une longueur en px`).not.toBeNull();
  return Number(m![1]);
};

/** Le centre vertical des sélecteurs, depuis le haut de la rangée. */
function centreSelecteurs(): number {
  return px(INTITULE, 'line-height') + px(CHAMP, 'gap') + px(SELECTEUR, 'height') / 2;
}

/** Le centre vertical des cases, dans une rangée de `hauteur` px. */
function centreCases(hauteur: number): number {
  const align = valeurEffective(REGLES, CASE, 'align-self', CTX);
  // La case elle-même : sa hauteur déclarée, sinon celle de son contenu (la
  // case à cocher, 15 px).
  const h = valeurEffective(REGLES, CASE, 'height', CTX) ? px(CASE, 'height') : 15;
  if (align === 'flex-end') return hauteur - px(CASE, 'padding-bottom', 0) - h / 2;
  expect(align, `align-self inattendu : ${align}`).toBe('flex-start');
  return px(CASE, 'margin-top', 0) + h / 2;
}

describe('web#2089 — les cases de la zone restent au niveau des sélecteurs', () => {
  const sansNote = () => px(INTITULE, 'line-height') + px(CHAMP, 'gap') + px(SELECTEUR, 'height');
  // La note DoP (`.dsd-dop`, 11,5 px / 1,35) sur deux lignes, sous le sélecteur.
  const avecNote = () => sansNote() + px(CHAMP, 'gap') + 2 * 11.5 * 1.35;

  it('rangée sans note : alignées', () => {
    expect(centreCases(sansNote())).toBeCloseTo(centreSelecteurs(), 0);
  });

  it('🔴 rangée allongée par la note DoP (#1876) : TOUJOURS alignées', () => {
    expect(centreCases(avecNote()), 'les cases descendent avec la note DoP').toBeCloseTo(centreSelecteurs(), 0);
  });

  it('les blocs Publier et Bit-perfect strict, hors de la rangée, ne sont pas touchés', () => {
    expect(valeurEffective(REGLES, ['.zf', '.zf.chk', '.publi-bloc .zf.chk'], 'margin-top', CTX)).toBeNull();
    expect(valeurEffective(REGLES, ['.zf', '.zf.chk', '.strict-bloc .zf.chk'], 'height', CTX)).toBeNull();
  });
});

describe('web#2089 — la rangée montée porte ces éléments', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    zones.set([]);
    vi.unstubAllGlobals();
  });

  it('carte locale en Natif : note DoP et deux cases, enfants directs de `.zr`', { timeout: 60_000 }, async () => {
    const z = { id: 21, name: 'SMSL M400', output_type: 'local', output_device_id: 'local:hw:1,0',
      volume: 1, state: 'stopped', dsd_mode: 'native', dsd_transport: 'natif_servi_en_dop' };
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      const corps = /\/zones(\?|$)/.test(u) ? [z] : /\/(profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
    zones.set([z] as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    flushSync();
    const onglet = [...hote.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === dictionnaire('fr')['settings.tabDevices'],
    );
    (onglet as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
    hote.querySelector<HTMLButtonElement>('button.ligne')?.click(); // web#2451
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
    const rangee = hote.querySelector('#zc-21 .zr');
    expect(rangee, 'rangée DSD / fréquence / paroles absente').not.toBeNull();
    expect(rangee!.querySelector('.dsd-dop'), 'note DoP absente — témoin sans objet').not.toBeNull();
    expect(rangee!.querySelectorAll(':scope > .zf.chk').length).toBe(2);
    expect(rangee!.querySelectorAll(':scope > .zf:not(.chk) > span').length).toBe(3);
    expect(rangee!.querySelectorAll(':scope > .zf:not(.chk) > select.sel.sm').length).toBe(3);
  });
});
