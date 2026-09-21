import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * La fusion de playlists, sans mode préalable (Bertrand + maquette Levente,
 * 20/09/2026).
 *
 * Bertrand : « il me semble que la fusion ne marche pas ! » Elle marchait —
 * mais elle était derrière un MODE : un bouton « Fusionner » basculait
 * l'écran, et seulement alors les cases apparaissaient. Personne ne trouvait
 * la porte. On sélectionne désormais d'abord, la barre apparaît ensuite.
 */
const ECRAN = readFileSync(
  resolve(process.cwd(), 'src/components/v2-heritage/PlaylistManagerView.svelte'),
  'utf8',
);
const sansCommentaires = ECRAN
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('#playlists — fusionner sans mode', () => {
  it('🔴 le MODE a disparu : plus de bouton à découvrir avant de cocher', () => {
    expect(sansCommentaires).not.toContain('merge-toggle-btn');
    expect(sansCommentaires).not.toContain('mergeMode');
  });

  it('la barre de fusion s’affiche dès UNE sélection, et dit pourquoi elle attend', () => {
    // Elle apparaît à un, sinon rien ne signale qu'on a coché ; et elle
    // explique qu'il en faut deux, au lieu de griser un bouton en silence.
    expect(sansCommentaires).toContain('{#if mergeSelected.size > 0}');
    expect(sansCommentaires).toContain('{#if mergeSelected.size < 2}');
    expect(sansCommentaires).toContain('playlistManager.selectAtLeastTwo');
  });

  it('🔴 l’identifiant n’est plus AMPUTÉ par un split à deux arguments', () => {
    // `'a:b:c'.split(':', 2)` rend ['a','b'] : le second argument TRONQUE le
    // tableau, il ne rejoint pas le reste. Tout identifiant portant un
    // deux-points partait coupé.
    expect(sansCommentaires).not.toMatch(/split\(':',\s*2\)/);
    expect(sansCommentaires).toContain('function cleService');
    expect(sansCommentaires).toContain('function cleIdentifiant');
  });

  it('la sélection est confinée à UN service, gardée dans la fonction', () => {
    // Un bouton `disabled` arrête la souris, pas un appel : la règle doit
    // vivre dans `toggleMergeSelect`, pas seulement dans le balisage.
    const i = sansCommentaires.indexOf('function toggleMergeSelect');
    expect(i).toBeGreaterThan(-1);
    const corps = sansCommentaires.slice(i, sansCommentaires.indexOf('\n  }', i));
    expect(corps).toContain('serviceVerrouille !== null && serviceVerrouille !== service');
    expect(corps).toContain('return;');
  });

  it('la fusion atterrit dans le service de la sélection', () => {
    // « Au même endroit » : la sélection étant confinée à un service, c'est
    // lui la cible. Un seul état pour les deux règles.
    expect(sansCommentaires).toContain('target_service: serviceVerrouille');
  });

  it('les cartes des autres services deviennent inertes, pas invisibles', () => {
    // Les cacher ferait croire à un filtre ; les estomper dit « pas celles-là ».
    expect(sansCommentaires).toContain('class:inerte');
    expect(sansCommentaires).toContain('playlistManager.sameServiceOnly');
  });

  it('la grille a remplacé la liste', () => {
    expect(sansCommentaires).toContain('class="pl-grille"');
    expect(sansCommentaires).not.toContain('class="playlist-list"');
  });

  it('🔴 le bloc <style> a ses accolades ÉQUILIBRÉES', () => {
    // Écrite après m'être fait avoir : en retirant une règle CSS morte, j'ai
    // supprimé la ligne du SÉLECTEUR et laissé ses propriétés orphelines. Les
    // tests passaient — ils ne cherchaient qu'un nom de classe — et la
    // feuille de style était cassée à partir de là.
    const style = ECRAN.slice(ECRAN.lastIndexOf('<style>'), ECRAN.lastIndexOf('</style>'));
    const ouvrantes = (style.match(/\{/g) ?? []).length;
    const fermantes = (style.match(/\}/g) ?? []).length;
    expect(ouvrantes, 'accolades du <style> déséquilibrées').toBe(fermantes);
  });

  it('le coin de sélection est un bouton à deux états, pas une case cachée', () => {
    expect(sansCommentaires).toContain('aria-pressed={cochee}');
  });
});
