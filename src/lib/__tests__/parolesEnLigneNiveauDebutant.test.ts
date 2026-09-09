import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SETTING_LEVELS, isKeyVisible, hiddenCountByTab, type SettingKey } from '../settingLevels';

/**
 * Garde : la case « Paroles en ligne (LRCLIB) » est ATTEIGNABLE au niveau
 * d'affichage par défaut (renesenses/tune-server-rust#2859, fil forum 1617).
 *
 * Le défaut vécu. Pierre M rapporte que les paroles « ne marchent qu'avec des
 * fichiers dans les répertoires ». Le code donnait raison à son constat : le
 * serveur garde la récupération en ligne désactivée par défaut
 * (`lyrics_lrclib_enabled` absent ⇒ `no_lyrics()`), et le seul interrupteur
 * qui l'active était classé `intermediate` dans le registre des niveaux,
 * alors que le niveau par défaut est `beginner` pour TOUS depuis l'arbitrage
 * du 14/08. Un utilisateur qui n'a jamais touché ce réglage ne pouvait donc
 * pas allumer la seule source de paroles automatique : l'option existait, elle
 * lui était invisible — et une fonction qu'on ne peut pas trouver ne se
 * distingue pas d'une fonction absente.
 *
 * Arbitrage Bertrand (30/08) : rendre la case visible au niveau débutant.
 *
 * Ce que ce test tient, et pourquoi il faut les deux moitiés :
 *
 *   1. Le REGISTRE descend la case au niveau débutant. Sans cela, rien ne
 *      s'affiche.
 *   2. Le MARQUAGE de la ligne voisine. La section « Métadonnées » n'est
 *      masquée que si AUCUN de ses réglages n'est visible (`lvAny`), et ses
 *      lignes n'avaient pas de garde individuelle. Descendre la case des
 *      paroles ouvre donc la section — et, sans garde par ligne, ouvrirait du
 *      même coup « Enrichir pendant le scan », un réglage intermédiaire, à
 *      tous les débutants. La correction serait alors une régression déguisée
 *      en correctif.
 *
 * On lit la SOURCE du composant pour le point 2 : ce dépôt n'a pas de harnais
 * de rendu Svelte, et la propriété à tenir est structurelle.
 */

const SOURCE = readFileSync(
  resolve(__dirname, '../../components/SettingsView.svelte'),
  'utf-8',
);

/** La section « Métadonnées » de l'onglet Bibliothèque, du `<section>` à sa fermeture. */
const SECTION_METADONNEES = (() => {
  const debut = SOURCE.indexOf("class:lv-hidden={!lvAny('library.metadataReadonly'");
  expect(debut, 'section Métadonnées introuvable dans SettingsView').toBeGreaterThan(-1);
  const fin = SOURCE.indexOf('</section>', debut);
  expect(fin, 'fin de la section Métadonnées introuvable').toBeGreaterThan(debut);
  return SOURCE.slice(debut, fin);
})();

describe('la case « Paroles en ligne » vit au niveau débutant', () => {
  it('le registre la classe débutant, et non intermédiaire', () => {
    expect(SETTING_LEVELS['library.lyricsLrclib'].level).toBe('beginner');
    expect(SETTING_LEVELS['library.lyricsLrclib'].tab).toBe('library');
  });

  it('un utilisateur qui n\'a jamais rien réglé la voit', () => {
    // `modified = false` : c'est précisément le cas de Pierre — réglage jamais
    // touché, donc la règle d'or ne le sauve pas. Avant la correction, ce
    // même appel rendait `false`.
    expect(isKeyVisible('library.lyricsLrclib', 'beginner', false)).toBe(true);
    expect(isKeyVisible('library.lyricsLrclib', 'intermediate', false)).toBe(true);
    expect(isKeyVisible('library.lyricsLrclib', 'expert', false)).toBe(true);
  });
});

describe('ouvrir la section ne fait entrer aucun réglage d\'un niveau supérieur', () => {
  it('« Enrichir pendant le scan » reste intermédiaire dans le registre', () => {
    expect(SETTING_LEVELS['library.enrichOnScan'].level).toBe('intermediate');
    expect(isKeyVisible('library.enrichOnScan', 'beginner', false)).toBe(false);
  });

  it('et chaque ligne de la section porte sa propre garde de niveau', () => {
    for (const cle of [
      'library.metadataReadonly',
      'library.enrichOnScan',
      'library.lyricsLrclib',
    ] as SettingKey[]) {
      // Deux occurrences par réglage : le libellé et l'interrupteur.
      const gardes = SECTION_METADONNEES.split(`!lvOk('${cle}')`).length - 1;
      expect(gardes, `garde de niveau manquante pour ${cle}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('le compteur « n réglages masqués » suit', () => {
  it('la case ne compte plus parmi les réglages masqués au niveau débutant', () => {
    const masques = hiddenCountByTab(
      'beginner',
      () => false, // aucun réglage modifié
      () => true, // tous les blocs présents à l'écran
    );
    // Le compteur promet à l'utilisateur ce qu'il gagnerait à monter de
    // niveau : y laisser une case désormais visible serait un mensonge.
    expect(masques.library).toBeGreaterThan(0);
    const masquesLibraryAvant = (
      Object.entries(SETTING_LEVELS) as [SettingKey, { tab: string; level: string; sub?: true }][]
    ).filter(([, e]) => e.tab === 'library' && e.level !== 'beginner' && !e.sub).length;
    expect(masques.library).toBe(masquesLibraryAvant);
  });
});
