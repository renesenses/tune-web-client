/**
 * L'annonce de mise à jour existe AUSSI dans la nouvelle coquille.
 *
 * Elle était écrite depuis longtemps — sondage toutes les 30 min, stores
 * `updateAvailable` / `latestVersion` / `updateBannerDismissed`, bannière,
 * masquage mémorisé par version — mais tout cela vivait dans `App.svelte`,
 * que `?v2` ne monte JAMAIS : `main.ts` monte `ShellV2` à la place.
 *
 * Personne n'appelait donc `startUpdatePolling()` sur cette voie. Conséquence
 * mesurable, et pas seulement l'absence de bannière : la barre latérale v2 lit
 * le MÊME store pour sa pastille de version, et cette pastille ne pouvait
 * jamais s'allumer. « Écrit mais pas branché » — on garde ici l'APPELANT, pas
 * le module appelé, parce que c'est l'appelant qui manquait.
 *
 * Bertrand, 04/09/2026 : « L'annonce de la mise à jour est-elle implémentée en
 * v2 ? » — non. Elle l'est depuis.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const shell = readFileSync(
  resolve(process.cwd(), 'src/components/v2/ShellV2.svelte'),
  'utf-8',
);

/**
 * Le source SANS ses commentaires.
 *
 * Trois gardes de ce projet sont déjà passées au vert en lisant le commentaire
 * qui expliquait pourquoi la chose était absente. On scanne donc le code.
 */
const code = shell
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('coquille v2 — annonce de mise à jour', () => {
  it('le sondage est DÉMARRÉ par la coquille', () => {
    expect(
      code.includes('startUpdatePolling()'),
      'sans cet appel, `updateAvailable` reste false pour toujours sur la voie v2 ' +
        '— ni bannière, ni pastille de version dans la barre latérale.',
    ).toBe(true);
  });

  it('et ARRÊTÉ au démontage', () => {
    // La bascule d'interface remonte la coquille : sans le retour de l'effet,
    // chaque remontage laisserait un minuteur de plus derrière lui.
    expect(code).toMatch(/return \(\) => stopUpdatePolling\(\)/);
  });

  it('la bannière ne s’affiche que s’il y a quelque chose à dire', () => {
    expect(code).toMatch(/\$updateAvailable && !\$updateBannerDismissed/);
    expect(code).toContain('{#if annonceMaj}');
  });

  it('elle nomme la version, dans la langue de l’utilisateur', () => {
    // `t` est un store dérivé SANS interpolation : le paramètre se pose à la
    // main. L'oublier afficherait « Tune v{version} disponible » tel quel.
    expect(code).toContain("$t('app.updateAvailable')");
    expect(code).toMatch(/\.replace\('\{version\}', String\(\$latestVersion/);
  });

  it('elle MÈNE à l’écran qui installe la mise à jour', () => {
    // Une bannière qui annonce sans conduire laisse chercher l'écran soi-même.
    // La section « à propos » de l'onglet Système porte le bouton d'installation.
    expect(code).toContain("v2SettingsTarget.set({ tab: 'system', section: 'about' })");
    expect(code).toContain("activeView.set('settings')");
  });

  it('elle se masque, et le masquage vaut pour CETTE version', () => {
    // `dismissUpdateBanner` écrit le numéro de version dans localStorage : la
    // version suivante ré-annonce d'elle-même. Réécrire un simple booléen ici
    // aurait tu l'annonce pour toujours.
    expect(code).toContain('onclick={dismissUpdateBanner}');
    expect(code).toContain("$t('app.dismiss')");
  });

  it('elle pousse la coquille au lieu de la recouvrir', () => {
    // La grappe avatar/signet est en position absolue en haut à droite : une
    // bannière posée par-dessus passerait dessous, et une bannière en absolu
    // mangerait la première ligne de chaque écran.
    expect(code).toContain('class:avec-maj={annonceMaj}');
    expect(shell).toContain('.avec-maj .av-tr{top:calc(20px + var(--maj-h))}');
  });
});
