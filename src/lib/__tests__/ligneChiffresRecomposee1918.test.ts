// @vitest-environment jsdom
//
// « My Library widget » — jfpaquet, fil 1918, ticket support 164, 0.9.163
// Windows :
//
//   « I have edited twice the "My Library" widget, to add "traks number" and
//     remove something. Each time it says "reloading" but nothing happens for
//     at least a minute. It works only when I close Tune and restart it. »
//
// 🔴 CE N'EST PAS UNE LENTEUR, C'EST UN ALLER SANS RETOUR.
//
// La case à cocher du sélecteur de chiffres appelait `relancerWidget`, écrite
// pour le chemin d'ÉCHEC : son contrat dit en toutes lettres « rien n'est
// retiré du registre ici, c'est le `.catch` qui rend la demande ». Sur un
// widget tombé c'est juste. Sur un widget SERVI — et la ligne de chiffres l'est
// toujours, puisqu'elle s'affiche — l'identifiant est encore dans `demandes` :
//
//   1. `etats` perd son entrée ;
//   2. `chargerWidget` est refusé par `demandes.has(id)` — aucune promesse
//      n'est créée ;
//   3. la carte retombe sur la branche `!et` du balisage, « Chargement… ».
//
// Le chien de garde des 8 s ne se déclenche pas (pas de promesse), le bouton
// « Réessayer » vit dans la branche `echec` jamais atteinte : rien, jamais,
// n'en sort. « At least a minute » était en réalité DÉFINITIF, et seul un
// rechargement complet — fermer et rouvrir Tune — repartait avec un registre
// neuf. Le choix, lui, était bien enregistré : c'est pourquoi il réapparaissait
// au redémarrage.
//
// 🔴 CE TÉMOIN COCHE, IL NE LIT PAS LE CODE.
//
// Il monte la vraie page avec un seul widget de forme `chiffres`, passe en
// édition, coche une case, et compte les appels à la SOURCE. Si le registre
// n'est pas rendu, le compteur reste à un et la ligne reste sur
// « Chargement… » — le témoin rougit.
//
// ⚠️ Ce que ce témoin ne verrait PAS, et pourquoi il est écrit ainsi :
//   - `demandes` est une `const` de composant : on ne peut pas la lire du
//     dehors. Seule la RECOMPOSITION OBSERVABLE prouve qu'elle a été rendue ;
//   - vérifier que la case est cochée ne suffirait pas : elle l'était déjà
//     avant le correctif, c'est la LIGNE au-dessus qui ne suivait pas ;
//   - vérifier que le serveur a été appelé ne suffirait pas non plus : le
//     widget de témoin ne fait aucun appel réseau, tout se joue dans le
//     registre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** Préférences vides : la page part du défaut, et enregistre dans le vide. */
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

/**
 * Un widget de chiffres de témoin.
 *
 * Il rend UNE carte par identifiant choisi, dont le texte porte l'identifiant :
 * la ligne affichée dit donc exactement ce que la source a reçu. Et il note
 * chaque appel, avec le choix qu'on lui a passé.
 */
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

/** Le bouton « Modifier » : le seul qui porte `v2.home.editTip` en `title`. */
function entrerEnEdition(page: HTMLElement) {
  const boutons = Array.from(page.querySelectorAll('.v2-actions button')) as HTMLButtonElement[];
  const modifier = boutons[boutons.length - 1];
  expect(modifier, 'le bouton « Modifier » a disparu de l’en-tête').toBeTruthy();
  modifier.click();
  flushSync();
}

describe('fil 1918 (ticket 164) — composer la ligne de chiffres la RECOMPOSE, sans recharger la page', () => {
  it('cocher une carte rappelle la source et met la ligne à jour', async () => {
    const { appels, widget } = ligneDeTemoin();
    const page = await poserLaPage(widget);

    // 1. La ligne est servie : elle a été chargée une fois, elle affiche ses
    //    cartes, et elle n'est PAS sur « Chargement… ».
    expect(appels.length, 'la ligne n’a jamais été chargée').toBe(1);
    const choixInitial = appels[0];
    expect(choixInitial.length, 'la ligne est partie sans aucun chiffre').toBeGreaterThan(0);
    expect(page.querySelector('.chiffres'), 'la ligne de chiffres n’est pas rendue').toBeTruthy();

    // 2. Le sélecteur n'apparaît qu'en édition — c'est la porte du geste.
    expect(page.querySelector('.choix-chiffres'), 'le sélecteur est visible hors édition').toBeNull();
    entrerEnEdition(page);
    const options = Array.from(page.querySelectorAll('.choix-chiffres .opt input')) as HTMLInputElement[];
    expect(options.length, 'le sélecteur de chiffres n’est pas là').toBeGreaterThan(0);

    // 3. On DÉCOCHE une carte affichée : décocher est le geste qui passe
    //    toujours, quel que soit le plafond du sélecteur.
    const cochee = options.find((o) => o.closest('.opt')?.classList.contains('on'));
    expect(cochee, 'aucune carte n’est cochée : le sélecteur ne reflète pas la ligne').toBeTruthy();
    cochee!.click();
    await souffler(120);
    flushSync();

    // 4. LE CŒUR DU TÉMOIN. Sans le correctif, `chargerWidget` est refusé par
    //    le registre : le compteur reste à un.
    expect(
      appels.length,
      'le registre n’a pas rendu la demande : cocher une case n’a rien rappelé — c’est le défaut du fil 1918',
    ).toBe(2);

    // 5. Et la source a bien reçu le NOUVEAU choix : exactement une carte de
    //    moins, et c'est bien celle qu'on a décochée.
    expect(appels[1].length, 'la source a été rappelée avec l’ancien choix').toBe(choixInitial.length - 1);
    const retirees = choixInitial.filter((id) => !appels[1].includes(id));
    expect(retirees.length, 'le nouveau choix ne retire pas exactement une carte').toBe(1);
    const aRetirer = retirees[0];

    // 6. Et l'écran suit : plus de « Chargement… », et la carte retirée n'est
    //    plus dans la ligne.
    const ligne = page.querySelector('.chiffres');
    expect(ligne, 'la ligne est restée sur « Chargement… » après l’édition').toBeTruthy();
    expect(
      (ligne!.textContent ?? '').includes(`#${aRetirer}`),
      'la carte décochée est encore affichée : la ligne n’a pas été recomposée',
    ).toBe(false);
  });

  it('DEUX éditions de suite, comme jfpaquet : la seconde répond aussi', async () => {
    // Le testeur a édité DEUX fois. Après le premier clic, sans le correctif,
    // le widget n'avait plus d'état du tout — donc plus de sélecteur, et le
    // second geste n'était même plus atteignable. On le prouve ici.
    const { appels, widget } = ligneDeTemoin();
    const page = await poserLaPage(widget);
    entrerEnEdition(page);

    for (const tour of [1, 2]) {
      const options = Array.from(page.querySelectorAll('.choix-chiffres .opt input')) as HTMLInputElement[];
      expect(
        options.length,
        `tour ${tour} : le sélecteur a disparu — le widget n’a plus d’état`,
      ).toBeGreaterThan(0);
      const cochee = options.find((o) => o.closest('.opt')?.classList.contains('on'));
      expect(cochee, `tour ${tour} : plus aucune carte cochée`).toBeTruthy();
      cochee!.click();
      await souffler(120);
      flushSync();
      expect(
        appels.length,
        `tour ${tour} : la ligne n’a pas été rappelée`,
      ).toBe(tour + 1);
    }
  });

  it('le geste de l’édition ne passe PAS par la relance d’échec', async () => {
    // Garde de source. `relancerWidget` ne rend pas le registre — c'est son
    // contrat, et il est juste pour le bouton « Réessayer ». L'y ramener ici
    // rétablirait le défaut sans qu'aucun témoin de comportement ne bouge si
    // un jour le registre changeait de forme.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/PageWidgets.svelte'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const i = src.indexOf('basculer(chiffres, ch.id)');
    expect(i, 'le geste de composition de la ligne a disparu').toBeGreaterThan(-1);
    const fin = src.indexOf('}}', i);
    expect(fin, 'le geste de composition n’a plus la forme attendue').toBeGreaterThan(i);
    const geste = src.slice(i, fin);
    expect(
      geste.includes('relancerWidget'),
      'la composition de la ligne repasse par `relancerWidget`, qui ne rend pas le registre — c’est le défaut du fil 1918',
    ).toBe(false);
    expect(
      geste.includes('recomposerLigne'),
      'la composition de la ligne n’appelle plus `recomposerLigne`',
    ).toBe(true);
  });
});
