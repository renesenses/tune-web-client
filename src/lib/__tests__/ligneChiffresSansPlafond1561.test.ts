// @vitest-environment jsdom
//
// #1561 — LA LIGNE « VOTRE BIBLIOTHÈQUE » N'A PLUS DE PLAFOND.
//
// Décision de Bertrand, 25/09/2026, devant le message de #1519 (PR #1564) :
//
//   « This row is full: 6 figures at most. Uncheck one to choose another.
//     Don't put any limit on the widget ! »
//
// La ligne portait au plus six chiffres (`MAXIMUM_CHIFFRES`). #1564 avait
// rendu ce plafond visible — message « ligne pleine », cases grisées. La
// limite elle-même disparaît : toutes les cases du catalogue se cochent, et
// la ligne rend toutes les cartes choisies.
//
// Ce banc remplace `plafondChiffresAnnonce1519.test.ts`, qui fixait l'inverse
// (un septième chiffre refusé). Il monte la vraie page, entre en édition,
// coche TOUT et lit l'écran.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import * as chiffresAccueil from '../chiffresAccueil';
import { CHIFFRES, CHOIX_DEFAUT, basculer } from '../chiffresAccueil';

/* ------------------------------------------------------------------ */
/* La règle, sans écran                                               */
/* ------------------------------------------------------------------ */

describe('#1561 — la règle : aucun plafond', () => {
  it('🔴 `basculer` accepte TOUT le catalogue, un chiffre après l’autre', () => {
    let ids: string[] = [];
    for (const c of CHIFFRES) ids = basculer(ids, c.id);
    expect(ids, 'un chiffre a été refusé : la ligne a encore un plafond').toEqual(CHIFFRES.map((c) => c.id));
  });

  it('🔴 un septième chiffre entre dans une ligne de six', () => {
    const six = [...CHOIX_DEFAUT];
    const septieme = CHIFFRES.find((c) => !six.includes(c.id))!;
    expect(septieme, 'le catalogue n’offre rien au-delà du défaut : ce témoin ne prouve rien').toBeTruthy();
    expect(basculer(six, septieme.id)).toEqual([...six, septieme.id]);
  });

  it('le mécanisme de refus n’existe plus', () => {
    const exports = chiffresAccueil as Record<string, unknown>;
    for (const nom of ['MAXIMUM_CHIFFRES', 'ajoutRefuse', 'ligneComplete']) {
      expect(exports[nom], `« ${nom} » est encore exporté`).toBeUndefined();
    }
  });

  it('un choix de six reste un choix de six, et décocher marche toujours', () => {
    // Rien ne tronque ni ne complète un choix existant.
    expect(CHOIX_DEFAUT).toHaveLength(6);
    for (const id of CHOIX_DEFAUT) expect(basculer(CHOIX_DEFAUT, id)).toHaveLength(5);
  });
});

/* ------------------------------------------------------------------ */
/* L'écran                                                            */
/* ------------------------------------------------------------------ */

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** Préférences vides : la page part du défaut (six cartes) et écrit dans le vide. */
function poserLeServeur() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}),
    text: async () => '{}',
  } as unknown as Response)));
}

beforeEach(() => {
  poserLeServeur();
  currentProfileId.set(1);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** Un widget de chiffres de témoin, qui note chaque choix qu'on lui passe. */
function ligneDeTemoin() {
  const appels: string[][] = [];
  return {
    appels,
    widget: {
      id: 'temoin',
      cleTitre: 'v2.home.title',
      forme: 'chiffres' as const,
      chiffresComposables: true,
      charger: async () => [],
      chiffres: async (ctx: any) => {
        const ids: string[] = [...(ctx.chiffresChoisis ?? [])];
        appels.push(ids);
        return ids.map((id) => ({ cle: 'v2.home.title', valeur: `#${id}`, id, icone: '' }));
      },
    },
  };
}

async function poserLaPage(widget: any) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: {
      catalogue: [widget],
      dispositionDefaut: ['temoin'],
      cle: 'temoin_widgets',
      cleChiffres: 'temoin_chiffres',
      cleChiffresMigre: 'temoin_chiffres_migre',
    },
  });
  flushSync();
  await souffler(100);
  flushSync();
  return hote;
}

/** Le bouton « Modifier » : le dernier de l'en-tête. */
function entrerEnEdition(page: HTMLElement) {
  const boutons = Array.from(page.querySelectorAll('.v2-actions button')) as HTMLButtonElement[];
  boutons[boutons.length - 1].click();
  flushSync();
}

const cases = (page: HTMLElement) =>
  Array.from(page.querySelectorAll('.choix-chiffres .opt input')) as HTMLInputElement[];
const cochees = (page: HTMLElement) => cases(page).filter((o) => o.closest('.opt')!.classList.contains('on'));
const libres = (page: HTMLElement) => cases(page).filter((o) => !o.closest('.opt')!.classList.contains('on'));

describe('#1561 — à l’écran : cocher TOUS les chiffres', () => {
  it('🔴 toutes les cases se cochent, aucun message « ligne pleine », la ligne rend toutes les cartes', async () => {
    const { appels, widget } = ligneDeTemoin();
    const page = await poserLaPage(widget);
    entrerEnEdition(page);

    // Le départ : le défaut, six cartes, rendues telles quelles.
    expect(cochees(page).length).toBe(CHOIX_DEFAUT.length);
    expect(page.querySelectorAll('.chiffres .stat').length, 'la ligne de six n’est plus une ligne de six').toBe(CHOIX_DEFAUT.length);
    expect(cases(page).length, 'le sélecteur ne propose pas tout le catalogue').toBe(CHIFFRES.length);

    for (const o of cases(page)) {
      expect(o.disabled, 'une case est grisée : la ligne a encore un plafond').toBe(false);
    }

    // On coche tout ce qui reste, une case après l'autre, comme à la main.
    while (libres(page).length) {
      const avant = cochees(page).length;
      libres(page)[0].click();
      await souffler(80);
      flushSync();
      expect(cochees(page).length, `la case n°${avant + 1} n’a pas été retenue`).toBe(avant + 1);
    }

    expect(cochees(page).length).toBe(CHIFFRES.length);
    expect(page.querySelector('.choix-chiffres .plein'), 'la région « ligne pleine » est toujours là').toBeNull();
    const texte = page.querySelector('.choix-chiffres')!.textContent ?? '';
    expect(texte).not.toMatch(/pleine|at most|is full|au maximum/i);
    for (const o of cases(page)) {
      expect(o.disabled).toBe(false);
      expect(o.getAttribute('aria-describedby')).toBeNull();
    }

    // Le widget a reçu le choix ENTIER, et la ligne rend toutes les cartes.
    await souffler(150);
    flushSync();
    expect([...appels[appels.length - 1]].sort()).toEqual(CHIFFRES.map((c) => c.id).sort());
    expect(page.querySelectorAll('.chiffres .stat').length, 'la ligne ne rend pas toutes les cartes choisies').toBe(CHIFFRES.length);
    // #1565 : recomposer garde la ligne ET le sélecteur à l'écran.
    expect(page.querySelector('.choix-chiffres'), 'le sélecteur a disparu').toBeTruthy();
  });

  it('le CSS de la ligne passe à la ligne et interdit à une carte de déborder', () => {
    // jsdom ne mesure rien : garde de texte, limitée aux règles utiles.
    const src = readFileSync(resolve(__dirname, '../../components/v2/PageWidgets.svelte'), 'utf8');
    const style = src.slice(src.indexOf('<style'));
    expect(style).toMatch(/\.chiffres\{display:flex; flex-wrap:wrap;/);
    expect(style).toMatch(/\.chiffres > \.stat\{max-width:100%; min-width:0\}/);
    expect(style).toMatch(/\.choix-chiffres \.opts\{display:flex; flex-wrap:wrap;/);
  });
});
