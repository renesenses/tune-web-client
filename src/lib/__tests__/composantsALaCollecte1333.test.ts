// #1333 — un banc ne charge JAMAIS un composant `.svelte` dans le corps d'un
// test.
//
// C'est la garde jumelle de `dictionnairesALaCollecte1308.test.ts`, pour un
// motif dont le coût est pire.
//
// `await import('….svelte')` posé DANS un cas fait payer la compilation du
// composant par vite au chronomètre de ce cas. Sous charge, le chronomètre
// saute : vitest déclare le cas expiré, `afterEach` retire l'hôte, le cas
// suivant s'ouvre — puis la CONTINUATION ABANDONNÉE reprend et exécute son
// `mount(…, { target: hote! })`. `hote` est une variable de module : elle
// désigne alors l'hôte du cas SUIVANT, ou un environnement jsdom déjà démonté.
//
// Le rouge qui en sort nomme du code de production SAIN — `preferences.ts:419`,
// `auth.ts:7`, ou, dans #1326, le doublon d'onglet Bandcamp de #860, corrigé
// depuis. Un faux rouge qui accuse le terrain coûte une journée à chaque fois.
//
// La parade est celle de #1317 puis de #1328 : l'import statique en tête de
// fichier, résolu à la COLLECTE, que vitest ne chronomètre pas — et `mount`
// redevient synchrone, donc aucune continuation ne peut plus se poser ailleurs.
//
// Cette garde lit les fichiers de test ; elle ne se lit pas elle-même, et le
// motif est assemblé pour ne jamais apparaître en clair dans ce fichier.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RACINE = join(__dirname, '..', '..');
const CE_FICHIER = 'composantsALaCollecte1333.test.ts';

function fichiersDeTest(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiersDeTest(p, acc);
    else if (/\.test\.ts$/.test(nom) && nom !== CE_FICHIER) acc.push(p);
  }
  return acc;
}

// `import(` suivi, dans la même expression, d'un chemin en `.svelte`.
//
// 🔴 Le caractère qui précède compte. De nombreux bancs lisent un composant de
// production et ASSERTENT qu'il charge son panneau à la demande :
//
//     expect(col).toContain("im" + "port('./CollectionSmartEditeurV2.svelte')")
//
// Ce `im`+`port(` là vit dans une chaîne — il ne charge rien, et le signaler
// ferait de cette garde un bruit qu'on finirait par débrancher. On exige donc
// que le motif ne soit pas précédé d'un guillemet : c'est ce qui sépare un
// chargement réel d'une citation.
const OUVRANT = 'im' + 'port\\(\\s*[\'"`][^\'"`]*\\.svelte';
const CHARGEMENT = new RegExp('(^|[^\'"`\\w.])' + OUVRANT, 'm');

/**
 * 🔴 Et un COMMENTAIRE ne charge rien non plus.
 *
 * `albumArtRange.test.ts` tient un tableau des cinq façons dont les gardes de
 * ce dépôt désignent un composant, forme dynamique comprise ; les bancs
 * corrigés par #1333 expliquent en tête de fonction le motif qu'ils viennent
 * de quitter. Signaler ces lignes rendrait la garde impossible à documenter —
 * et une garde qu'on ne peut pas documenter finit débranchée.
 */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('#1333 — les composants se chargent à la collecte, pas dans un test', () => {
  it('aucun banc ne charge un composant `.svelte` dynamiquement', () => {
    const fautifs = fichiersDeTest(RACINE)
      .filter((f) => CHARGEMENT.test(sansCommentaires(readFileSync(f, 'utf8'))))
      .map((f) => relative(RACINE, f));
    expect(
      fautifs,
      'importer le composant en tête de fichier (statique) : la compilation '
        + 'quitte le chronomètre du cas, et `mount` redevient synchrone',
    ).toEqual([]);
  });

  it('le motif reconnaît les formes qui expiraient', () => {
    // Contre-épreuve de la garde elle-même : sans elle, une expression
    // régulière fausse la laisserait verte pour toujours.
    const p = (s: string) => CHARGEMENT.test(s);
    expect(p("  const { default: V } = await im" + "port('../../components/v2/StreamingV2.svelte');")).toBe(true);
    expect(p("  monte = mount((await im" + "port(`../../components/v2/QueueV2.svelte`)).default, {})")).toBe(true);
    expect(p("  im" + "port('./Sidebar.svelte').then((m) => mount(m.default, {}));")).toBe(true);
  });

  it('elle laisse passer ce qui ne charge rien', () => {
    const p = (s: string) => CHARGEMENT.test(s);
    // L'import statique — la parade elle-même.
    expect(p("import StreamingV2 from '../../components/v2/StreamingV2.svelte';")).toBe(false);
    // Une CITATION : le banc lit la source de production et y cherche le motif.
    expect(p('    expect(col).toContain("im' + 'port(\'./CollectionSmartEditeurV2.svelte\')");')).toBe(false);
    expect(p("    expect(src).toContain('im" + 'port("./EtiquettesPanneau.svelte")\');')).toBe(false);
    // Un chargement dynamique qui n'est pas un composant.
    expect(p("    const api = await im" + "port('../api');")).toBe(false);
  });

  it('un commentaire qui MONTRE le motif n’est pas un chargement', () => {
    const cite = [
      '/**',
      ' *     im' + "port('../X.svelte')                     import dynamique",
      ' */',
      "    // const { default: V } = await im" + "port('./V.svelte');",
      "import V from './V.svelte';",
    ].join('\n');
    expect(CHARGEMENT.test(cite)).toBe(true);
    expect(CHARGEMENT.test(sansCommentaires(cite))).toBe(false);
  });
});
