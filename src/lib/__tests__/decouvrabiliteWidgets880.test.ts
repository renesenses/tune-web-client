/**
 * #880 — « une fois que j’ai ajouté un widget à l’écran d’accueil, comment
 * puis-je le supprimer ? » (Sandro, fil forum 1679, 06/09/2026 à 16 h 20).
 *
 * Le geste EXISTAIT. C’est un autre testeur, Gros Bidon, qui lui a répondu le
 * soir même : « De mémoire on fait modifier puis apparait une petite croix
 * grise sur la droite en haut du Widget. » Il avait raison — et c’est le
 * défaut : la seule porte s’appelle « Modifier », sans complément, et ce
 * qu’elle révèle est un « × » nu dont le libellé « Retirer ce widget » ne
 * vivait que dans un `aria-label`. Un lecteur d’écran l’annonçait ; une souris
 * ne le voyait jamais.
 *
 * ## Ce que cette garde tient
 *
 * Que les trois affordances portent un texte VISIBLE à la souris : `title` sur
 * la croix, sur la poignée de déplacement, sur le bouton qui ouvre le mode —
 * plus un bandeau dans le mode lui-même. `aria-label` seul ne compte pas :
 * c’est exactement l’état qui a produit la question de Sandro.
 *
 * ## Ce qu’elle ne tient PAS
 *
 * Le point que l’issue laisse ouvert : Sandro a forcément traversé ce mode
 * pour AJOUTER son widget, la croix y était, et il ne l’a pas vue. Contraste
 * (`--v2-txt3`, la teinte la plus effacée) ou taille peuvent y être pour
 * quelque chose — non mesuré à l’écran, et hors de portée d’une garde de
 * source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const page = () => lire('src/components/v2/PageWidgets.svelte');

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];

/**
 * La balise qui porte `classe`, du `<` à son `>` fermant.
 *
 * 🔴 Le `>` fermant n'est PAS le premier rencontré : une flèche Svelte en
 * contient un (`onclick={() => retirer(id)}`). Première version de cette
 * garde, 13/09/2026 : elle coupait à `onclick={() =>` et déclarait absent un
 * `title` écrit trois lignes plus bas. On saute donc ce qui vit entre
 * accolades, et ce qui vit entre guillemets.
 */
function baliseDepuis(src: string, debut: number): string {
  let accolades = 0;
  let guillemet: string | null = null;
  for (let k = debut; k < src.length; k++) {
    const c = src[k];
    if (guillemet) {
      if (c === guillemet) guillemet = null;
      continue;
    }
    if (c === '"' || c === "'") { guillemet = c; continue; }
    if (c === '{') { accolades++; continue; }
    if (c === '}') { accolades--; continue; }
    if (c === '>' && accolades === 0) return src.slice(debut, k + 1);
  }
  return src.slice(debut);
}

function balise(src: string, classe: string): string {
  const i = src.indexOf(`class="${classe}"`);
  expect(i, `aucune balise class="${classe}"`).toBeGreaterThan(-1);
  return baliseDepuis(src, src.lastIndexOf('<', i));
}

describe('#880 — retirer un widget doit se voir à la souris', () => {
  it('la croix de retrait porte un `title`, pas seulement un `aria-label`', () => {
    const b = balise(page(), 'retirer');
    expect(b).toContain('title=');
    expect(b).toContain('v2.home.remove');
  });

  it('la poignée de déplacement aussi', () => {
    const b = balise(page(), 'poignee');
    expect(b).toContain('title=');
    expect(b).toContain('v2.home.move');
  });

  /**
   * La porte d’entrée. « Modifier » ne dit ni quoi, ni qu’il fait apparaître
   * la suppression : c’est le premier maillon de la question de Sandro.
   */
  it('le bouton qui ouvre le mode nomme les gestes qu’il révèle', () => {
    const src = page();
    expect(src).toContain('v2.home.editTip');
    const i = src.indexOf('v2.home.editTip');
    // Il doit être posé en `title`, dans la même balise que le libellé du mode.
    const b = baliseDepuis(src, src.lastIndexOf('<', i));
    expect(b).toContain('title=');
    expect(b).toContain('class:on={edition}');
  });

  it('le mode édition porte un bandeau qui dit ce qu’on y fait', () => {
    const src = page();
    expect(src).toContain('v2.home.editHint');
    // Rendu sous `{#if edition}`, sinon il ne s’affiche jamais au bon moment.
    const i = src.indexOf('v2.home.editHint');
    expect(src.lastIndexOf('{#if edition}', i)).toBeGreaterThan(-1);
  });

  it('les deux nouvelles clés existent dans les onze langues', () => {
    for (const l of LANGUES) {
      const src = lire(`src/lib/locales/${l}.ts`);
      expect(src, l).toContain('"v2.home.editTip"');
      expect(src, l).toContain('"v2.home.editHint"');
    }
  });

  /**
   * Contre-épreuve du périmètre : la garde doit voir la DIFFÉRENCE entre un
   * `aria-label` seul et un `title`. Un témoin sans `title` doit échouer au
   * même contrôle, sinon la garde passerait sur l’état d’origine.
   */
  it('le contrôle distingue bien `aria-label` seul de `title`', () => {
    const temoin = '<button class="temoin880" onclick={() => r(id)} aria-label={$t(\'x\')}>×</button>';
    expect(balise(temoin, 'temoin880')).not.toContain('title=');
  });

  /**
   * 🔴 Et il ne doit pas s'arrêter sur la flèche : un témoin dont le `title`
   * suit un `onclick={() => …}` doit être VU. Sans ce cas, la garde
   * redeviendrait celle qui a crié au loup le 13/09/2026.
   */
  it('le contrôle lit au-delà d’une flèche Svelte', () => {
    const temoin = '<button class="temoin880b" onclick={() => r(id)} title={$t(\'y\')}>×</button>';
    expect(balise(temoin, 'temoin880b')).toContain('title=');
  });
});
