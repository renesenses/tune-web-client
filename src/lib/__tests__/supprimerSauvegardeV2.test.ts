import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Supprimer une sauvegarde de playlist, en v2.
 *
 * ## Ce qui manquait
 *
 * L'écran v2 savait CRÉER une sauvegarde (`backupPlaylists`) et en RESTAURER
 * une (`restorePlaylistSnapshot`), jamais en effacer : la liste ne pouvait que
 * grossir. `DELETE /playlist-manager/backups/{id}` existait pourtant depuis
 * toujours côté serveur.
 *
 * ## Pourquoi ce geste-là et pas les autres
 *
 * Les treize appels que l'écran hérité savait faire et pas la v2 ne sont pas
 * treize oublis : dix sont des choix. Bertrand a demandé le 02/09/2026 de
 * retirer de cet écran Merge, Transferts, Générateur et Sync, et réserve les
 * playlists collaboratives au social. Ces choix sont gardés par
 * `pochetteActions.test.ts`.
 *
 * Les sauvegardes, elles, RESTENT sur cet écran — « c'est ici qu'on risque de
 * perdre une playlist, donc ici que le filet doit se voir ». Pouvoir en
 * supprimer une fait partie de ce filet.
 */

const RACINE = resolve(process.cwd());
const lire = (c: string) => readFileSync(resolve(RACINE, c), 'utf8');

function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('supprimer une sauvegarde en v2', () => {
  const ecran = sansCommentaires(lire('src/components/v2/PlaylistsV2.svelte'));

  it('l’écran v2 APPELLE deletePlaylistSnapshot', () => {
    expect(ecran).toMatch(/api\.deletePlaylistSnapshot\s*\(/);
  });

  it('un geste d’utilisateur le déclenche', () => {
    expect(ecran, 'la fonction est écrite et rien ne l’appelle')
      .toMatch(/onclick=\{\(\) => supprimerInstantane\(/);
  });

  it('🔴 la suppression DEMANDE confirmation, et en mode danger', () => {
    // On retire un filet, et rien ne le reconstitue. Les alarmes supprimaient
    // sans rien demander : c'est le défaut qu'on ne reproduit pas.
    const corps = ecran.slice(ecran.indexOf('async function supprimerInstantane'), ecran.indexOf('// ── Import M3U'));
    expect(corps).toMatch(/await dialogs\.confirm\(/);
    expect(corps).toMatch(/danger:\s*true/);
    // Et l'appel ne part QUE si l'utilisateur a dit oui.
    expect(corps).toMatch(/if \(!ok\) return;/);
  });

  it('🔴 aucun dialogue natif', () => {
    // `window.confirm` ne s'ouvre jamais dans un webview : le clic ne fait
    // rien, sans message ni erreur (#166).
    expect(ecran).not.toMatch(/window\.confirm\s*\(/);
  });

  it('🔴 le résultat est DIT, succès comme échec', () => {
    const corps = ecran.slice(ecran.indexOf('async function supprimerInstantane'), ecran.indexOf('// ── Import M3U'));
    expect(corps).toMatch(/notifications\.success\s*\(/);
    expect(corps).toMatch(/notifications\.error\s*\(/);
    expect(corps).not.toMatch(/console\.error\s*\(/);
  });

  it('la liste est RELUE après coup, pas corrigée à la main', () => {
    // Retirer l'élément du tableau local ferait diverger l'écran du serveur
    // si la suppression n'avait porté que sur une partie.
    const corps = ecran.slice(ecran.indexOf('async function supprimerInstantane'), ecran.indexOf('// ── Import M3U'));
    expect(corps).toMatch(/await chargerInstantanes\(\)/);
  });

  it('les trois gestes du filet sont là', () => {
    // Créer, restaurer, supprimer : sans le troisième, la liste ne fait que
    // grossir.
    expect(ecran).toMatch(/api\.backupPlaylists\s*\(/);
    expect(ecran).toMatch(/api\.restorePlaylistSnapshot\s*\(/);
    expect(ecran).toMatch(/api\.deletePlaylistSnapshot\s*\(/);
  });

  it('🔴 les quatre écartés du 02/09 ne reviennent pas par cette porte', () => {
    // Cette garde double celle de `pochetteActions` : un lot de portage est
    // exactement le moment où l'on rouvre par distraction ce qui a été fermé
    // par décision.
    for (const mot of ['merge', 'transfer', 'syncLink', 'generator']) {
      expect(
        new RegExp(mot, 'i').test(lire('src/components/v2/PlaylistsV2.svelte')),
        `« ${mot} » est revenu dans l’écran v2, alors qu’il devait en sortir (Bertrand, 02/09/2026).`,
      ).toBe(false);
    }
  });
});
