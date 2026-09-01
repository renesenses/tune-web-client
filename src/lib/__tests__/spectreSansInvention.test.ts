import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Garde de code : l'analyseur de spectre ne dessine que du mesuré (#2081).
 *
 * Le mode « spectre » portait deux replis qui fabriquaient les barres :
 *
 *  - `useReal` sans bandes : la hauteur venait du seul RMS gauche/droite,
 *    multipliée par `0.85 + Math.random() * 0.3` et par un roll-off arbitraire ;
 *  - aucun niveau : la hauteur venait de `getEnergyProfile()`, qui devine
 *    « grave / médium / aigu » à partir des MÉTADONNÉES de la piste
 *    (fréquence d'échantillonnage, profondeur, format) — sans écouter le son —
 *    plus un tirage aléatoire par bande et par image.
 *
 * Vérifié dans le paquet publié 0.9.118 avant correctif : le second repli y
 * était présent tel quel (`Ce=Q.mid*(.4+Math.random()*.6)`).
 *
 * C'est le préalable aux repères de fréquence. Graduer un affichage qui
 * invente ses données ne le rend pas lisible, ça rend crédible quelque chose
 * de faux. Le même contrat que le mode « forme d'onde » (#2182) : sans donnée,
 * on ne dessine rien.
 *
 * La garde est bornée au CORPS de `spectrumTargets`, commentaires dépouillés :
 * un motif trouvé dans un commentaire ou dans la fonction voisine ne doit ni
 * la faire passer ni la faire échouer.
 */
describe('garde : le mode spectre ne fabrique aucune barre', () => {
  const source = readFileSync(
    resolve(__dirname, '../../components/AudioVisualizer.svelte'),
    'utf-8',
  );

  /** Retire commentaires de bloc et de ligne — un motif en commentaire ne compte pas. */
  function sansCommentaires(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  }

  /** Corps de la fonction nommée, par appariement d'accolades. */
  function corpsDe(nom: string): string {
    const entete = `function ${nom}(`;
    const debut = source.indexOf(entete);
    expect(debut, `${entete} introuvable dans AudioVisualizer.svelte`).toBeGreaterThan(-1);
    const ouvrante = source.indexOf('{', source.indexOf(')', debut));
    expect(ouvrante).toBeGreaterThan(-1);
    let profondeur = 0;
    for (let i = ouvrante; i < source.length; i++) {
      if (source[i] === '{') profondeur++;
      else if (source[i] === '}') {
        profondeur--;
        if (profondeur === 0) return source.slice(ouvrante + 1, i);
      }
    }
    throw new Error(`accolade fermante de ${nom} introuvable`);
  }

  it('le corps extrait est bien celui du spectre, et il est complet', () => {
    // Sans cette vérification, une extraction cassée rendrait une chaîne vide
    // et TOUTES les assertions ci-dessous passeraient au vert pour rien.
    const corps = sansCommentaires(corpsDe('spectrumTargets'));
    expect(corps.length).toBeGreaterThan(300);
    expect(corps).toContain('spectrum_db');
    expect(corps).toContain('barTargets');
  });

  it('aucun tirage aléatoire dans le calcul des barres', () => {
    const corps = sansCommentaires(corpsDe('spectrumTargets'));
    expect(corps).not.toContain('Math.random');
  });

  it('aucune barre déduite des métadonnées de la piste', () => {
    const corps = sansCommentaires(corpsDe('spectrumTargets'));
    // `getEnergyProfile()` ne lit que sample_rate / bit_depth / format : ce
    // qu'il rend décrit le fichier, jamais le son qui en sort.
    expect(corps).not.toContain('getEnergyProfile');
    for (const champ of ['sampleRate', 'bitDepth', 'format']) {
      expect(corps, `le spectre ne doit pas se déduire de ${champ}`).not.toContain(champ);
    }
  });

  it('les commentaires ne peuvent ni sauver ni condamner la garde', () => {
    // Contre-épreuve du dépouillement lui-même.
    expect(sansCommentaires('/* Math.random() */ a')).not.toContain('Math.random');
    expect(sansCommentaires('// Math.random()\nb')).not.toContain('Math.random');
    expect(sansCommentaires('const u = Math.random();')).toContain('Math.random');
    // Une URL ne doit pas être prise pour un commentaire de ligne.
    expect(sansCommentaires("const u = 'https://x/y';")).toContain('https://x/y');
  });

  it('le repli aléatoire n’a pas simplement déménagé dans le voisinage', () => {
    // Le motif retiré ne doit réapparaître nulle part dans le composant.
    const net = sansCommentaires(source);
    for (const motif of ['0.85 + Math.random()', 'Math.random() < 0.15', 'profile.treble * (0.3']) {
      expect(net, `motif de repli encore présent : ${motif}`).not.toContain(motif);
    }
  });
});
