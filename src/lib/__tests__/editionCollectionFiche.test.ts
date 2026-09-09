/**
 * Le bouton d'édition d'une collection, sur SA FICHE.
 *
 * Bertrand, 09/09/2026 : « Manque le bouton d'édition d'une collection » —
 * copie d'écran de la fiche d'une intelligente (« Intelligente / 2025 »), qui
 * ne proposait que « Tout lire » et « Aléatoire ».
 *
 * L'édition existait, mais UNIQUEMENT sur la vignette de la liste
 * (`PochetteActions`). Une fois la collection ouverte, ses règles n'étaient
 * plus atteignables : il fallait revenir en arrière pour les retrouver. C'est
 * la variante « écrit mais pas atteignable » du défaut dominant de ce client.
 *
 * Deux choses à garder :
 *
 *  1. la BIFURCATION vit à un seul endroit. Les deux sortes n'ouvrent pas la
 *     même chose — l'intelligente ses règles, la manuelle son renommage — et
 *     c'est exactement pourquoi la liste et la fiche doivent appeler le même
 *     code plutôt que le recopier ;
 *  2. la fiche SUIT le rechargement. `ouverte` porte une copie de l'entrée ;
 *     tant qu'on ne pouvait éditer que depuis la liste, on n'était jamais sur
 *     la fiche en éditant. Maintenant si — et un renommage y laissait l'ancien
 *     nom à l'écran.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../components/v2/CollectionsV2.svelte'), 'utf-8');
const sansCommentaires = src.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('le bouton est sur la fiche', () => {
  it('🔴 l’en-tête de la fiche porte une action d’édition', () => {
    const debut = src.indexOf('<header class="v2-top detail">');
    expect(debut, 'l’en-tête de fiche a disparu').toBeGreaterThan(0);
    const entete = src.slice(debut, src.indexOf('</header>', debut));
    expect(entete).toContain('editerCollection(ouverte!)');
    expect(entete).toContain("$t('v2.cover.edit' as any)");
  });

  it('les trois actions de la fiche sont là, et une seule est pleine', () => {
    const debut = src.indexOf('<header class="v2-top detail">');
    const entete = src.slice(debut, src.indexOf('</header>', debut));
    expect(entete).toContain("collections.playAll");
    expect(entete).toContain("collections.shuffleAll");
    // « Tout lire » est le geste principal ; éditer ne lui dispute pas la place.
    expect(entete.match(/class="v2-btn primaire"/g) ?? []).toHaveLength(0);
  });
});

describe('🔴 la bifurcation n’est écrite qu’une fois', () => {
  it('la fonction existe et sépare les deux sortes', () => {
    expect(sansCommentaires).toContain('function editerCollection(e: Entree)');
    const i = sansCommentaires.indexOf('function editerCollection(e: Entree)');
    const corps = sansCommentaires.slice(i, i + 200);
    expect(corps).toContain("e.sorte === 'smart'");
    expect(corps).toContain('editeurSmart = { id: e.id }');
    expect(corps).toContain('enEdition = e');
  });

  it('la liste l’appelle au lieu de recopier le test', () => {
    expect(sansCommentaires).toContain('onEditer={() => editerCollection(e)}');
    // La forme recopiée qu'elle remplace ne doit pas revenir.
    expect(sansCommentaires).not.toContain("onEditer={e.sorte === 'normale'");
  });

  it('la fiche et la liste passent par le MÊME appel', () => {
    const appels = (sansCommentaires.match(/editerCollection\(/g) ?? []).length;
    // La déclaration, plus exactement deux appelants : la liste et la fiche.
    expect(appels).toBe(3);
  });
});

describe('🔴 la fiche suit le rechargement', () => {
  it('après `charger()`, la collection ouverte est reprise dans la liste neuve', () => {
    expect(sansCommentaires).toMatch(/ouverte = liste\.find\(\(x\) =>[^)]*\) \?\? null;/);
  });

  it('elle est retrouvée par SORTE et par identifiant, jamais par id seul', () => {
    // Les deux espaces d'ids se recouvrent : l'id 1 est à la fois la collection
    // « favorites » et l'intelligente « Audiophile » sur le serveur de Bertrand.
    // Chercher par id seul rouvrirait l'autre.
    const i = sansCommentaires.indexOf('ouverte = liste.find(');
    const ligne = sansCommentaires.slice(i, sansCommentaires.indexOf('\n', i));
    expect(ligne).toContain("x.sorte === ouverte!.sorte");
    expect(ligne).toContain('x.id === ouverte!.id');
  });

  it('une collection disparue referme la fiche au lieu d’y rester', () => {
    const i = sansCommentaires.indexOf('ouverte = liste.find(');
    expect(sansCommentaires.slice(i, sansCommentaires.indexOf('\n', i))).toContain('?? null');
  });

  it('les deux éditeurs rechargent après enregistrement', () => {
    // Sans `onSaved={charger}`, la reprise ci-dessus n'aurait jamais lieu.
    expect(sansCommentaires).toContain('onSaved={charger}');
    const smart = sansCommentaires.slice(sansCommentaires.indexOf('{#if editeurSmart}'));
    expect(smart.slice(0, 300)).toContain('onSaved={charger}');
  });
});
