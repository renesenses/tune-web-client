/**
 * Le fichier `version.json` que le serveur cherche à la racine du `dist/`.
 *
 * ## Pourquoi ce module existe (#3667, résidu de tune-server-rust#3380)
 *
 * Le serveur SAIT lire `<web_dir>/version.json` depuis la v0.9.143
 * (`tune-core/src/interface_web.rs`) : il en tire `ui_version` pour la
 * télémétrie et la ligne « Interface (web) » du rapport de bogue. Le module
 * Rust refuse délibérément tout repli sur la version du SERVEUR — deux tests
 * l'y gardent — parce que la raison d'être du ticket est justement que les
 * deux numéros DIVERGENT : `web/` se déploie séparément du binaire.
 *
 * Mais **personne n'écrivait ce fichier**. Ni ce dépôt, ni la chaîne de
 * release de `tune-server-rust` : `git grep version.json` rendait zéro dans
 * les deux arbres. Conséquence mesurée le 11/09/2026 sur le `web/` du serveur
 * .18, déployé la VEILLE — fichier absent — et donc, pour 100 % du parc, un
 * rapport de bogue qui affiche :
 *
 *     Interface (web): inconnue (web/version.json absent : build web
 *                      anterieur a #3380)
 *
 * Cette phrase accuse le build du testeur d'être vieux. Elle ne mesure rien :
 * un build du jour la déclenche exactement pareil. C'est pire qu'une absence
 * d'information — c'est une information fausse, et elle envoie chercher le
 * défaut dans une version qui n'est pas celle qui tourne.
 *
 * ## Le contrat, et pourquoi il est minuscule
 *
 * Le lecteur Rust ne demande qu'un champ : `version`, une chaîne non vide.
 * Tout le reste du document est ignoré chez lui, pour qu'un champ ajouté ici
 * plus tard ne casse rien là-bas. On s'en tient donc à ce champ : ce qui n'est
 * pas lu n'a pas à être écrit.
 *
 * La source est `package.json` — la même que `__APP_VERSION__` affiché dans
 * l'interface. Deux sources donneraient deux numéros à tenir d'accord, et
 * c'est exactement le défaut que ce ticket corrige.
 */

/** Nom du fichier, tel que le serveur le cherche. Ne pas le changer seul. */
export const FICHIER_VERSION = 'version.json';

/**
 * Contenu du fichier pour une version donnée.
 *
 * PURE : ni disque, ni build. Rend le texte exact, saut de ligne final compris
 * — un fichier de configuration sans fin de ligne fâche les outils qui le
 * concatènent, et ça ne coûte rien.
 */
export function contenuVersionJson(version: string): string {
  return `${JSON.stringify({ version })}\n`;
}

/**
 * Greffon Vite qui dépose `version.json` à la racine du `dist/`.
 *
 * Passe par `emitFile` et non par une écriture disque dans `closeBundle` :
 * l'actif ainsi déclaré appartient au bundle, il suit `outDir` quel qu'il
 * soit, et il survit à `emptyOutDir: true` — une écriture faite trop tôt
 * serait effacée par le nettoyage, en silence et seulement parfois.
 */
export function greffonVersionJson(version: string) {
  return {
    name: 'tune-version-json',
    generateBundle(this: { emitFile: (a: unknown) => void }) {
      this.emitFile({
        type: 'asset',
        fileName: FICHIER_VERSION,
        source: contenuVersionJson(version),
      });
    },
  };
}
