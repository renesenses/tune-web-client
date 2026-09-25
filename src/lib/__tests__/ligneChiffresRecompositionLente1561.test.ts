// @vitest-environment jsdom
//
// tune-web-client#1561 — jfpaquet, fil 1918, 0.9.163 Windows, PostgreSQL,
// 80 228 pistes, scan en cours :
//
//   « I have edited twice the "My Library" widget, to add "traks number" and
//     remove something. Each time it says "reloading" but nothing happens for
//     at least a minute. It works only when I close Tune and restart it. »
//
// #1558 a rendu la demande au registre : cocher une case RAPPELLE désormais la
// source. Restait ce que voit l'utilisateur PENDANT ce rappel, sur un serveur
// qui met plusieurs secondes à rendre ses statistiques :
//
//   1. `recomposerLigne` vidait l'état du widget : la ligne retombait sur
//      « Chargement… » à chaque case cochée, et le SÉLECTEUR, imbriqué dans la
//      branche de la ligne chargée, disparaissait avec elle — impossible de
//      cocher la case suivante avant le retour du serveur ;
//   2. deux recompositions en vol en même temps : la réponse de la PREMIÈRE,
//      arrivée après la seconde, réécrivait l'ancienne ligne — la carte
//      décochée revenait, et y restait.
//
// Ce témoin tient la source EN SUSPENS (des promesses qu'il résout lui-même,
// dans l'ordre qu'il choisit) : il ne dépend d'aucune durée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
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

/**
 * Une ligne de chiffres dont la source répond QUAND le témoin le décide — sauf
 * le premier chargement, servi aussitôt. Chaque carte porte son identifiant :
 * la ligne affichée dit exactement quel choix a été servi.
 */
function ligneEnSuspens() {
  const appels: { ids: string[]; servir: () => void }[] = [];
  const widget = {
    id: 'temoin',
    cleTitre: 'v2.home.title',
    forme: 'chiffres' as const,
    chiffresComposables: true,
    charger: async () => [],
    chiffres: (ctx: any) => {
      const ids: string[] = [...(ctx.chiffresChoisis ?? [])];
      const cartes = ids.map((id) => ({ cle: 'v2.home.title', valeur: `#${id}`, id, icone: '' }));
      return new Promise((resoudre) => {
        const servir = () => resoudre(cartes);
        appels.push({ ids, servir });
        if (appels.length === 1) servir();
      });
    },
  };
  return { appels, widget };
}

async function poserLaPage(widget: any) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: {
      catalogue: [widget],
      dispositionDefaut: ['temoin'],
      cle: 'temoin1561_widgets',
      cleChiffres: 'temoin1561_chiffres',
      cleChiffresMigre: 'temoin1561_chiffres_migre',
    },
  });
  flushSync();
  await souffler(100);
  flushSync();
  const boutons = Array.from(hote.querySelectorAll('.v2-actions button')) as HTMLButtonElement[];
  boutons[boutons.length - 1].click();
  flushSync();
  return hote;
}

/** Les valeurs des cartes affichées, une par carte — comparées EXACTEMENT. */
const cartesAffichees = (page: HTMLElement) =>
  Array.from(page.querySelectorAll('.chiffres .v')).map((e) => e.textContent ?? '');
function decocherUneCarte(page: HTMLElement): void {
  const options = Array.from(page.querySelectorAll('.choix-chiffres .opt input')) as HTMLInputElement[];
  const cochee = options.find((o) => o.closest('.opt')?.classList.contains('on'));
  expect(cochee, 'plus de case cochée — ou plus de sélecteur').toBeTruthy();
  const avant = Array.from(page.querySelectorAll('.choix-chiffres .opt.on input'));
  cochee!.click();
  flushSync();
  const apres = Array.from(page.querySelectorAll('.choix-chiffres .opt.on input'));
  expect(apres.length).toBe(avant.length - 1);
}

describe('#1561 (fil 1918) — recomposer la ligne sur un serveur lent', () => {
  it('pendant le rappel, la ligne d’avant et le sélecteur RESTENT à l’écran', async () => {
    const { appels, widget } = ligneEnSuspens();
    const page = await poserLaPage(widget);
    expect(appels.length).toBe(1);
    const initiale = cartesAffichees(page);
    expect(initiale.length, 'la ligne n’a pas été servie au montage').toBeGreaterThan(0);

    decocherUneCarte(page);
    await souffler(60);
    flushSync();
    expect(appels.length, 'cocher n’a pas rappelé la source').toBe(2);

    // La source n'a pas répondu : c'est l'instant que jfpaquet a regardé.
    expect(page.querySelector('.chiffres'), 'la ligne est retombée sur « Chargement… » pendant le rappel').toBeTruthy();
    expect(cartesAffichees(page)).toEqual(initiale);
    expect(page.querySelector('.chiffres')?.getAttribute('aria-busy')).toBe('true');
    expect(
      page.querySelectorAll('.choix-chiffres .opt input').length,
      'le sélecteur a disparu pendant le rappel : impossible de cocher la case suivante',
    ).toBeGreaterThan(0);

    appels[1].servir();
    await souffler(20);
    flushSync();
    expect(page.querySelector('.chiffres')?.getAttribute('aria-busy')).toBeNull();
    const retiree = appels[0].ids.find((id) => !appels[1].ids.includes(id))!;
    expect(cartesAffichees(page), 'la ligne n’a pas suivi le nouveau choix').toEqual(appels[1].ids.map((id) => `#${id}`));
    expect(cartesAffichees(page)).not.toContain(`#${retiree}`);
  });

  it('deux recompositions en vol : la réponse PÉRIMÉE, arrivée la dernière, n’écrase pas la ligne', async () => {
    const { appels, widget } = ligneEnSuspens();
    const page = await poserLaPage(widget);
    decocherUneCarte(page);
    await souffler(60);
    flushSync();
    decocherUneCarte(page);
    await souffler(60);
    flushSync();
    expect(appels.length, 'la seconde case n’a pas rappelé la source').toBe(3);

    // Le serveur répond dans le désordre : la dernière demande d'abord.
    appels[2].servir();
    await souffler(20);
    flushSync();
    appels[1].servir();
    await souffler(20);
    flushSync();

    const affichee = cartesAffichees(page);
    expect(affichee, 'la ligne affichée n’est pas celle du DERNIER choix').toEqual(appels[2].ids.map((id) => `#${id}`));
    const retirees = appels[0].ids.filter((id) => !appels[2].ids.includes(id));
    expect(retirees.length).toBe(2);
    for (const r of retirees) {
      expect(affichee.includes(`#${r}`), `la carte #${r}, décochée, est revenue avec la réponse périmée`).toBe(false);
    }
    expect(page.querySelector('.chiffres')?.getAttribute('aria-busy')).toBeNull();
  });
});
