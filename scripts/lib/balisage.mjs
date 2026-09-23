/**
 * Les NŒUDS DE TEXTE d'un balisage Svelte — y compris ceux collés à une
 * accolade.
 *
 * 🔴 Pourquoi ce fichier existe.
 *
 * Silviu (testeur roumain, v0.9.161) a photographié une file d'attente qui
 * lui parlait français. Les correctifs sont partis (#1451, #1452, #1453,
 * #1467) ; restait la vraie question — pourquoi AUCUNE des deux gardes n'avait
 * vu passer ça pendant des mois ?
 *
 * Parce que les deux lisent le texte visible avec la même forme :
 *
 *     />([^<>{}]*…)<|       (check-i18n.mjs, VISIBLE)
 *     />([^<>{}]+)</g       (check-francais-v2.mjs, troisième passe)
 *
 * Elle exige un texte BORNÉ par `>` et `<`, sans accolade. Or un libellé qui
 * mêle une expression et du texte n'a pas cette forme :
 *
 *     <span>{upNext.length} à suivre</span>
 *     <h2>À suivre{#if !upNext.length}&nbsp;— rien{/if}</h2>
 *
 * Dans le premier cas le `>` est suivi d'un `{` : la forme échoue tout de
 * suite. Dans le second, `À suivre` est suivi d'un `{` et non d'un `<` : même
 * échec. Les deux gardes passaient devant sans rien voir — et « à suivre »,
 * « restantes », « À suivre » sont restés en français dans les onze langues.
 *
 * On ne rafistole pas la forme : on PARCOURT. Le marcheur ci-dessous suit le
 * balisage caractère par caractère, saute l'intérieur des balises (leurs
 * attributs ne s'affichent pas comme texte) et saute les expressions `{…}`,
 * accolades et chaînes imbriquées comprises. Ce qui reste entre deux sauts est
 * un nœud de texte, qu'il soit bordé par des balises, par des accolades, ou
 * par un mélange des deux.
 *
 * Les index rendus sont ceux du balisage reçu : l'appelant y ajoute son propre
 * décalage pour retrouver le numéro de ligne.
 */

/**
 * L'index qui SUIT l'accolade fermante de celle ouverte en `k`.
 * Les accolades imbriquées et les chaînes (`'…'`, `"…"`, `` `…` ``) comptent.
 */
function finAccolade(b, k) {
  const n = b.length;
  let prof = 0;
  let q = null;
  for (let p = k; p < n; p++) {
    const c = b[p];
    if (q) {
      if (c === '\\') { p++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return p + 1;
  }
  return n;
}

/**
 * Les nœuds de texte du balisage : `[{ index, texte }]`, dans l'ordre.
 *
 * `index` est la position du premier caractère du nœud dans `balisage`.
 */
export function noeudsDeTexte(balisage) {
  const out = [];
  const n = balisage.length;
  let i = 0;
  let debut = 0;
  const pousse = (fin) => {
    if (fin > debut) out.push({ index: debut, texte: balisage.slice(debut, fin) });
  };
  while (i < n) {
    const c = balisage[i];
    if (c === '<' && /[A-Za-z/!]/.test(balisage[i + 1] ?? '')) {
      pousse(i);
      // Dans une balise : ses attributs ne s'affichent pas comme texte.
      let q = null;
      let p = i + 1;
      for (; p < n; p++) {
        const d = balisage[p];
        if (q) { if (d === q) q = null; continue; }
        if (d === '"' || d === "'") q = d;
        else if (d === '{') p = finAccolade(balisage, p) - 1;
        else if (d === '>') break;
      }
      i = p + 1;
      debut = i;
    } else if (c === '{') {
      // Une expression, un bloc `{#if}`, un `{@html}` : rien de tout cela
      // n'est du texte en dur. On saute, et le texte reprend APRÈS.
      pousse(i);
      i = finAccolade(balisage, i);
      debut = i;
    } else i++;
  }
  pousse(n);
  return out;
}

/**
 * Les entités HTML, décodées en espace avant examen : `&times;` n'est pas un
 * mot et `&lt; 15 m²` est une mesure. Les réclamer en traduction ferait fuir
 * la garde pour rien.
 */
export const ENTITES_HTML =
  /&(?:times|lt|gt|amp|nbsp|hellip|mdash|ndash|middot|deg|laquo|raquo|divide|plusmn|le|ge|ne|rarr|larr|check|bull);/g;

/** Remplace un fragment par des espaces SANS manger ses sauts de ligne. */
export const blanchir = (m) => m.replace(/[^\n]/g, ' ');

/**
 * Le balisage d'un composant : ce qui suit le dernier `</script>`, sans les
 * blocs `<script module>` restants, sans `<style>`, sans `<code>`/`<pre>`.
 *
 * Rend `{ balisage, decalage }` — `decalage` est l'index du balisage dans
 * `src`, pour que l'appelant retrouve ses numéros de ligne.
 */
export function balisageDe(src) {
  const i = src.indexOf('</script>');
  if (i < 0) return null;
  // Un commentaire HTML n'atteint pas l'écran, et ce dépôt les écrit en
  // français exprès. Blanchi — sans manger ses sauts de ligne.
  let bal = src.slice(i + 9)
    .replace(/<!--[\s\S]*?-->/g, blanchir)
    .replace(/<script[\s\S]*?<\/script>/g, blanchir);
  const j = bal.indexOf('<style');
  if (j > 0) bal = bal.slice(0, j);
  // `<code>` et `<pre>` portent de la SYNTAXE, pas de la prose : un
  // utilisateur allemand doit taper `branch_of`, pas sa traduction.
  bal = bal.replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/g, blanchir);
  return { balisage: bal, decalage: i + 9 };
}
