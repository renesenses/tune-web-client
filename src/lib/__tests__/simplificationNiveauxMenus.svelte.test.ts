// @vitest-environment jsdom
//
// rc12 — « simplification de l'UI » (go de Bertrand du 12/11/2026).
//
// Ce banc garde :
//   1. Oxygen n'est plus proposé au niveau Essentiel (barre latérale), il
//      reste À SA PLACE dans le noyau et revient dès Avancé ; sa pastille de
//      niveau le dit dans Réglages › Interface ;
//   2. le menu de piste : outils d'expert absents à l'Essentiel, gestes
//      secondaires rangés sous « Plus… » — CONTRE-ÉPREUVE : à l'Expert, ils
//      sont là ; rien n'est retiré, seulement rangé ;
//   3. `MenuPisteV2` : « Plus… » déplie en place et donne le focus à la
//      première entrée dépliée ; « Menus complets » montre tout d'emblée ;
//   4. les intertitres repliables de la barre (préférence vide par défaut) ;
//   5. les chaînes dans les quinze locales.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CORE, NIVEAU_ENTREE, NIVEAU_MIN_NOYAU } from '../../components/v2/Sidebar.svelte';
import MenuPisteV2 from '../../components/v2/MenuPisteV2.svelte';
import {
  CLES_PISTE_HORS_ESSENTIEL, CLES_SECONDAIRES_PISTE, entreesMenuPiste, menusCompletsEffectifs, rangerMenuPiste, type EntreeMenu,
} from '../menuPiste';
import { preferences } from '../stores/preferences';
import { REGLAGES } from '../reglagesIndex';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('rc12 — niveaux étendus : Oxygen', () => {
  it('reste à sa place dans le noyau, mais n’apparaît qu’à partir d’Avancé', () => {
    expect(CORE.map((it) => it.view)).toContain('oxygen');
    expect(NIVEAU_MIN_NOYAU.oxygen).toBe('intermediate');
    expect(NIVEAU_ENTREE.oxygen, 'la pastille « Avancé » de Réglages › Interface').toBe('intermediate');
    const src = lire('src/components/v2/Sidebar.svelte');
    expect(src).toContain('const noyauAffiche = $derived(sansMasquees(CORE.filter(auNiveau)));');
    expect(src).toContain('...CORE.filter(auNiveau), ...SELECTIONS,');
  });
});

/** Toutes les capacités ouvertes : la piste de bibliothèque la plus riche. */
const TOUT = { jouable: true, idBibliotheque: 7, artistId: 3, albumId: 5, etiquetable: true, dansEcouterPlusTard: false, bannie: false } as any;
const f = () => {};
const GESTES = {
  lire: f, ensuite: f, aLaFile: f, plusCommeCa: f, autresVersions: f, ajouterAPlaylist: f, allerArtiste: f,
  allerAlbum: f, etiqueter: f, basculerEcouterPlusTard: f, champsDuFichier: f, voirCredits: f, spectrogramme: f, bannir: f,
} as any;

describe('rc12 — menu de piste rangé', () => {
  const brut = entreesMenuPiste(TOUT, GESTES);

  it('Essentiel : les outils d’expert ne sont pas proposés', () => {
    const cles = rangerMenuPiste(brut, 'beginner').map((e) => e.cle);
    for (const k of CLES_PISTE_HORS_ESSENTIEL) expect(cles).not.toContain(k);
    expect(cles).toContain('common.play');
  });

  it('contre-épreuve : à l’Expert (installation existante), RIEN ne manque', () => {
    const r = rangerMenuPiste(brut, 'expert');
    expect(r.map((e) => e.cle)).toEqual(brut.map((e) => e.cle));
    for (const k of CLES_PISTE_HORS_ESSENTIEL) expect(r.map((e) => e.cle)).toContain(k);
  });

  it('les gestes courants restent à vue, les autres sont marqués secondaires', () => {
    const r = rangerMenuPiste(brut, 'expert');
    const avue = r.filter((e) => !e.secondaire).map((e) => e.cle);
    expect(avue).toEqual(expect.arrayContaining(['common.play', 'v2.pa.next', 'queue.addToQueue', 'nowplaying.addToPlaylist']));
    for (const e of r) expect(!!e.secondaire, e.cle).toBe(CLES_SECONDAIRES_PISTE.has(e.cle));
  });
});

describe('rc12 — « Plus… » dans MenuPisteV2', () => {
  let monte: Record<string, unknown> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    document.body.innerHTML = '';
    preferences.update((p) => ({ ...p, menusComplets: null }));
  });
  const ENTREES: EntreeMenu[] = [
    { cle: 'common.play', faire: f },
    { cle: 'credits.see', faire: f, secondaire: true },
    { cle: 'ban.ban', faire: f, secondaire: true },
  ];
  const poser = () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(MenuPisteV2 as any, { target: hote, props: { ancre: new DOMRect(10, 10, 20, 20), entrees: ENTREES, onClose: f, focusInitial: true } });
    flushSync();
  };
  const items = () => Array.from(document.body.querySelectorAll<HTMLElement>('.menu .item'));

  it('replié : les secondaires attendent sous « Plus… », qui les déplie en place', async () => {
    preferences.update((p) => ({ ...p, menusComplets: false }));
    poser();
    expect(items()).toHaveLength(2);
    const plus = document.body.querySelector<HTMLElement>('[data-menu-plus]')!;
    expect(plus).not.toBeNull();
    plus.click();
    flushSync();
    await tick();
    expect(items()).toHaveLength(3);
    expect(document.body.querySelector('[data-menu-plus]')).toBeNull();
    expect(document.activeElement).toBe(items()[1]);
    expect(document.body.querySelector('.menu'), 'le menu reste ouvert').not.toBeNull();
  });

  it('« Menus complets » : tout d’emblée, pas de « Plus… »', () => {
    preferences.update((p) => ({ ...p, menusComplets: true }));
    poser();
    expect(items()).toHaveLength(3);
    expect(document.body.querySelector('[data-menu-plus]')).toBeNull();
  });
});

describe('rc12 — « Menus complets » : selon le niveau, sauf choix explicite', () => {
  it('Expert (installations existantes) : complets — rien ne change pour elles', () => {
    expect(menusCompletsEffectifs({ menusComplets: null, settingsLevel: 'expert' })).toBe(true);
  });
  it('Essentiel et Avancé : courts, le reste sous « Plus… »', () => {
    expect(menusCompletsEffectifs({ menusComplets: null, settingsLevel: 'beginner' })).toBe(false);
    expect(menusCompletsEffectifs({ menusComplets: null, settingsLevel: 'intermediate' })).toBe(false);
  });
  it('contre-épreuve : le choix explicite l’emporte sur le niveau, dans les deux sens', () => {
    expect(menusCompletsEffectifs({ menusComplets: false, settingsLevel: 'expert' })).toBe(false);
    expect(menusCompletsEffectifs({ menusComplets: true, settingsLevel: 'beginner' })).toBe(true);
  });
});

describe('rc12 — barre et réglages', () => {
  it('rien de replié, menus selon le niveau par défaut ; le réglage est indexé', () => {
    expect(get(preferences).barreGroupesReplies).toEqual([]);
    expect(get(preferences).menusComplets).toBeNull();
    expect(REGLAGES.find((r) => r.id === 'menus-complets')?.section).toBe('interface');
    const src = lire('src/components/v2/Sidebar.svelte');
    expect(src).toContain("{@render intertitreRepliable('selections', 'v2.nav.selections')}");
    expect(src).toContain("{@render intertitreRepliable('studio', 'v2.nav.studio')}");
  });

  it('les chaînes dans les quinze locales', () => {
    const dir = resolve(process.cwd(), 'src/lib/locales');
    const fs = readdirSync(dir).filter((n) => /^[a-z]{2}\.ts$/.test(n));
    expect(fs).toHaveLength(15);
    for (const n of fs) {
      const src = readFileSync(resolve(dir, n), 'utf-8');
      for (const k of ['v2.menu.moreActions', 'v2.nav.groupExpand', 'v2.nav.groupCollapse', 'settings.fullMenus',
        'settings.fullMenusHint', 'reglages.termes.menusComplets']) {
        expect(src, `${n} ${k}`).toMatch(new RegExp(`"${k.replace(/\./g, '\\.')}": "[^"]+"`));
      }
    }
  });
});
