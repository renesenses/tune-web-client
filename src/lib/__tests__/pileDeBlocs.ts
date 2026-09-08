/**
 * La pile de blocs `{#if}` ouverts autour d'un repère, dans un modèle Svelte.
 *
 * ## Pourquoi ça existe
 *
 * Ce qui cache un bouton dans « En écoute » n'est pas ce que sa ligne
 * contient : ce sont les blocs qui l'ENVELOPPENT. Une recherche de texte ne
 * peut donc rien prouver — le bouton EQ portait exactement le même balisage
 * avant et après avoir été sorti de `{#if !isRadio && displayTrack.id}`.
 *
 * L'analyseur a été écrit pour la garde du bouton EQ
 * (`npEqButton.test.ts`, #531). Le même défaut ayant été retrouvé sur trois
 * autres boutons de la MÊME barre (#534), il est extrait ici plutôt que
 * recopié : deux copies auraient dérivé, et la seconde aurait fini par
 * garantir autre chose que la première.
 *
 * N'est pas un fichier de test : `vitest.config.ts` n'inclut que les fichiers
 * dont le nom se termine par `.test.ts`.
 */

/** Lit l'expression d'un bloc à partir de `start`, jusqu'à son `}` fermant. */
export function lireExpression(source: string, start: number): string {
  let depth = 1;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i).trim();
    }
  }
  return source.slice(start).trim();
}

/**
 * Les conditions des blocs `{#if}` encore ouverts à l'indice `index`.
 *
 * `{#each}` / `{#await}` / `{#key}` / `{#snippet}` sont empilés eux aussi :
 * sans ça, leur `{/each}` dépilerait un `{#if}` et la pile mentirait.
 */
export function conditionsA(source: string, index: number): string[] {
  const template = source.indexOf('</script>');
  const from = template === -1 ? 0 : template;
  const stack: { kind: string; condition: string }[] = [];
  const re = /\{#(if|each|await|key|snippet)\b|\{:else if\b|\{:else\}|\{\/(if|each|await|key|snippet)\}/g;
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m.index >= index) break;
    const token = m[0];
    if (token.startsWith('{#')) {
      const kind = m[1];
      stack.push({
        kind,
        condition: kind === 'if' ? lireExpression(source, m.index + token.length) : '',
      });
    } else if (token.startsWith('{:else if')) {
      // Être dans cette branche, c'est ne PAS être dans la précédente : la
      // condition précédente reste une garde, niée.
      const top = stack[stack.length - 1];
      if (top) {
        top.condition = `!(${top.condition}) && ${lireExpression(source, m.index + token.length)}`;
      }
    } else if (token === '{:else}') {
      const top = stack[stack.length - 1];
      if (top) top.condition = `!(${top.condition})`;
    } else {
      stack.pop();
    }
  }
  return stack.map((b) => b.condition).filter((c) => c.length > 0);
}
