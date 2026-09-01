/**
 * Composition d'une phrase traduite qui porte une emphase en son milieu.
 *
 * ## Le problème
 *
 * Les écrans v2 écrivent leurs explications comme ceci :
 *
 * ```svelte
 * <p>Retirer un dossier ne supprime <b>aucun fichier</b> : il sort de la bibliothèque.</p>
 * ```
 *
 * Trois fragments de texte séparés par du balisage. Les traduire fragment par
 * fragment — « Retirer un dossier ne supprime », « aucun fichier », « : il sort
 * simplement de la bibliothèque. » — donne un résultat juste en français et faux
 * partout ailleurs : l'ordre des mots n'est pas universel, et le traducteur ne
 * voit jamais la phrase entière. En allemand le verbe part à la fin ; en
 * japonais la structure est inversée. Le fragment du milieu peut devoir se
 * retrouver au début.
 *
 * ## La règle retenue
 *
 * UNE clé porte la phrase COMPLÈTE, et le passage à mettre en valeur est encadré
 * d'astérisques :
 *
 * ```ts
 * 'settings.removeFolderHint': 'Retirer un dossier ne supprime *aucun fichier* : il sort simplement de la bibliothèque.'
 * ```
 *
 * Le traducteur reçoit une phrase entière et place l'emphase où sa langue
 * l'exige. Le rendu la recompose :
 *
 * ```svelte
 * {#each emphaseParts($t('settings.removeFolderHint')) as p}
 *   {#if p.fort}<b>{p.texte}</b>{:else}{p.texte}{/if}
 * {/each}
 * ```
 *
 * ## Pourquoi pas `{@html}`
 *
 * Parce qu'une chaîne de traduction finirait par porter du balisage, donc par
 * traverser l'interpréteur HTML. Une locale mal relue — ou un fichier de langue
 * contribué — deviendrait un vecteur d'injection pour un gain nul. Ici rien
 * n'est interprété : le texte reste du texte, seul le découpage est structurel.
 */

/** Un morceau de phrase, à rendre en emphase ou non. */
export interface EmphasePart {
  texte: string;
  fort: boolean;
}

/**
 * Découpe une phrase sur ses paires d'astérisques.
 *
 * - Zéro astérisque → un seul morceau, non emphatique. C'est le cas courant, et
 *   il ne coûte donc rien d'appeler cette fonction partout.
 * - Astérisque orpheline (nombre impair) → elle est rendue TELLE QUELLE, dans le
 *   texte. Une traduction qui perd une astérisque doit afficher une phrase un
 *   peu abîmée, jamais avaler la moitié de son contenu.
 * - Paire vide `**` → ignorée, pas de morceau fort vide.
 */
export function emphaseParts(phrase: string): EmphasePart[] {
  if (!phrase) return [{ texte: '', fort: false }];

  const parts: EmphasePart[] = [];
  let reste = phrase;

  for (;;) {
    const ouvre = reste.indexOf('*');
    if (ouvre === -1) break;
    const ferme = reste.indexOf('*', ouvre + 1);
    // Astérisque non refermée : le reste part en texte simple, astérisque comprise.
    if (ferme === -1) break;

    const avant = reste.slice(0, ouvre);
    const dedans = reste.slice(ouvre + 1, ferme);
    if (avant) parts.push({ texte: avant, fort: false });
    if (dedans) parts.push({ texte: dedans, fort: true });
    reste = reste.slice(ferme + 1);
  }

  if (reste) parts.push({ texte: reste, fort: false });
  return parts.length ? parts : [{ texte: '', fort: false }];
}
