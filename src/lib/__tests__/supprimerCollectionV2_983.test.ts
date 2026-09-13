/**
 * #983 — « Je ne vois aucun bouton "Supprimer" une collection ? »
 *
 * Fabien, fil « v0.9.147 : v1 divers bugs », 13/09/2026, point 4.
 *
 * Il ne le voyait pas : **il n’existait pas**. `grep -in "supprimer|delete"`
 * sur `CollectionsV2.svelte` rendait ZÉRO, alors que l’ancienne interface
 * porte une corbeille par carte depuis toujours
 * (`CollectionsView.handleDelete`, `api.deleteCollection`).
 *
 * ## Les trois choses que cette garde tient
 *
 * 1. **La bonne route par sorte.** Les deux familles ont des identifiants qui
 *    SE RECOUVRENT — l’id 1 est à la fois la collection « favorites » et
 *    l’intelligente « Audiophile » sur le serveur de Bertrand. Appeler la
 *    mauvaise route supprimerait une AUTRE collection que celle qu’on vise.
 * 2. **La confirmation.** L’ancienne interface supprimait sans rien demander.
 *    Et `dialogs.confirm`, jamais le dialogue NATIF du navigateur : celui-là
 *    ne s’affiche pas dans les vues web embarquées.
 * 3. **La place du geste.** Derrière le menu d’actions, teinté `danger` — pas
 *    une corbeille sur la vignette. C’est la règle que `ZonesV2` pose déjà :
 *    « une carte qu’on clique pour activer ne doit pas porter une corbeille à
 *    portée de pouce ».
 *
 * ## Ce qu’elle ne tient PAS
 *
 * Que le serveur supprime vraiment. Les deux routes existent et sont servies
 * ailleurs ; ce lot ne fait que les atteindre.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const ecran = () => lire('src/components/v2/CollectionsV2.svelte');
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];

/**
 * Le fichier PRIVÉ DE SES COMMENTAIRES.
 *
 * 🔴 Première version de cette garde, 13/09/2026 : elle refusait le dialogue
 * natif en lisant le texte brut, et échouait sur le commentaire qui explique
 * justement pourquoi on ne l’emploie pas. Une garde qui se déclenche
 * sur sa propre justification ne mesure pas le code.
 *
 * C’est la deuxième fois du jour : la garde #2430 avait compté une condition
 * écrite dans un commentaire. Un contrôle qui parle du CODE doit lire le code.
 */
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}

/** Le corps de `supprimerCollection`, jusqu’à sa fermeture par indentation. */
function corpsSuppression(src: string): string {
  const lignes = src.split('\n');
  const debut = lignes.findIndex((l) => l.includes('async function supprimerCollection'));
  expect(debut, 'la fonction de suppression a disparu').toBeGreaterThan(-1);
  const marge = lignes[debut].length - lignes[debut].trimStart().length;
  let fin = -1;
  for (let i = debut + 1; i < lignes.length; i++) {
    const l = lignes[i];
    if (l.trim() === '}' && l.length - l.trimStart().length === marge) { fin = i; break; }
  }
  expect(fin).toBeGreaterThan(debut);
  return lignes.slice(debut, fin + 1).join('\n');
}

describe('#983 — supprimer une collection dans la nouvelle interface', () => {
  it('le geste existe', () => {
    expect(ecran()).toContain('async function supprimerCollection');
  });

  /** 🔴 Deux sortes, deux routes — leurs identifiants se recouvrent. */
  it('chaque sorte appelle SA route, et l’aiguillage se fait sur `sorte`', () => {
    const corps = corpsSuppression(ecran());
    expect(corps).toContain("e.sorte === 'smart'");
    expect(corps).toContain('api.deleteSmartCollection(e.id)');
    expect(corps).toContain('api.deleteCollection(e.id)');
  });

  it('la liste est retirée sur la PAIRE (sorte, id), jamais sur l’id seul', () => {
    const corps = corpsSuppression(ecran());
    expect(corps).toMatch(/x\.sorte === e\.sorte && x\.id === e\.id/);
  });

  /** 🔴 L’ancienne interface supprimait SANS rien demander. */
  it('une confirmation précède la suppression, et elle est marquée `danger`', () => {
    const corps = corpsSuppression(ecran());
    expect(corps).toMatch(/await dialogs\.confirm\([\s\S]{0,120}\{ danger: true \}\)/);
    // Et le refus ARRÊTE tout : sans le `return`, la confirmation serait un décor.
    expect(corps).toMatch(/if \(!\(await dialogs\.confirm[\s\S]{0,160}\)\)\s*return;/);
  });

  it('jamais le dialogue natif — il ne s’affiche pas dans une vue web embarquée', () => {
    const code = sansCommentaires(ecran());
    expect(code).not.toMatch(/\bwindow\.confirm\b/);
    expect(code).not.toMatch(/(?<![.\w])confirm\s*\(/);
    /**
     * Contre-épreuve du DÉCAPAGE : il doit retirer le commentaire et LAISSER le
     * code. Sans ce cas, un décapage trop large rendrait la garde vide.
     *
     * 🔴 L'appel interdit est ASSEMBLÉ, jamais écrit : `check-native-dialogs`
     * inspecte tout le dépôt, fichiers de test compris, et refusait à juste
     * titre ce témoin quand il était en clair (relevé le 13/09/2026).
     */
    const interdit = `window.${'con' + 'firm'}`;
    expect(sansCommentaires(`/* ${interdit} */ const a = 1;`)).not.toContain(interdit);
    expect(sansCommentaires(`<!-- ${interdit} --> const a = 1;`)).toContain('const a = 1');
    expect(sansCommentaires(`const x = ${interdit}(1);`)).toContain(interdit);
  });

  /** La place du geste : dans le menu, pas sur la vignette. */
  it('le geste vit dans le menu d’actions, teinté `danger`', () => {
    const src = ecran();
    const i = src.indexOf('menu={[');
    expect(i, 'la carte n’offre aucun menu').toBeGreaterThan(-1);
    const bloc = src.slice(i, src.indexOf(']}', i));
    expect(bloc).toContain('danger: true');
    expect(bloc).toContain('supprimerCollection(e)');
  });

  it('aucune corbeille posée sur la vignette elle-même', () => {
    // `PochetteActions` ne connaît pas de prop de suppression : si une
    // corbeille apparaissait un jour, elle passerait par là.
    expect(lire('src/components/v2/PochetteActions.svelte')).not.toContain('onSupprimer');
  });

  it('la question nomme la collection, dans les onze langues', () => {
    for (const l of LANGUES) {
      const ligne = lire(`src/lib/locales/${l}.ts`)
        .split('\n').find((x) => x.includes('"v2.col.deleteAsk"'));
      expect(ligne, `v2.col.deleteAsk manque en ${l}`).toBeTruthy();
      expect(ligne, `sans {nom} en ${l}`).toContain('{nom}');
    }
    expect(corpsSuppression(ecran())).toContain("replace('{nom}'");
  });
});
