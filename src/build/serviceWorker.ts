/**
 * Le service worker et l'identifiant de build (rc10, 31/10/2026).
 *
 * Constat : après la pose d'un nouveau `web/` sur un serveur, un navigateur
 * qui avait déjà ouvert Tune gardait l'ANCIENNE interface, même après un
 * rechargement forcé ; la navigation privée montrait la nouvelle. Le `sw.js`
 * d'avant était un fichier fixe (`tune-v3`) : jamais remplacé, jamais purgé,
 * et son « réseau d'abord » repassait par le cache HTTP. Voir
 * `sw.modele.js` pour le détail.
 *
 * `package.json` porte une version qui ne change pas à chaque build (1.0.0) :
 * elle ne peut pas dire si deux builds diffèrent. D'où un identifiant de
 * BUILD, écrit à trois endroits par la même valeur : le bundle
 * (`__TUNE_BUILD__`), `dist/version.json` (champ `build`) et `dist/sw.js`.
 */
import { readFileSync } from 'fs';

/** Marque remplacée dans le modèle. */
export const MARQUE_BUILD = '__TUNE_BUILD__';
/** Préfixe des caches de Tune : seuls ceux-là sont purgés. */
export const PREFIXE_CACHE = 'tune-';
export const FICHIER_SW = 'sw.js';
export const MODELE_SW = new URL('./sw.modele.js', import.meta.url);

/**
 * Identifiant d'un build : la version du paquet et l'instant du build.
 * `TUNE_BUILD_ID` (CI, build reproductible) prime s'il est fourni.
 */
export function identifiantDeBuild(version: string, instant: number, impose?: string | null): string {
  const force = (impose ?? '').trim();
  if (force) return force;
  return `${version}+${instant.toString(36)}`;
}

/** Nom du cache d'un build. */
export function nomDuCache(build: string): string {
  return `${PREFIXE_CACHE}${build}`;
}

/** Caches à supprimer à l'activation : ceux de Tune, sauf celui du build. */
export function cachesAPurger(cles: readonly string[], courant: string): string[] {
  return cles.filter((k) => k.startsWith(PREFIXE_CACHE) && k !== courant);
}

/** Texte du `sw.js` d'un build. */
export function texteServiceWorker(modele: string, build: string): string {
  if (!modele.includes(MARQUE_BUILD)) {
    throw new Error(`modèle de service worker sans ${MARQUE_BUILD}`);
  }
  // JSON.stringify puis retrait des guillemets : un identifiant imposé ne peut
  // pas casser la chaîne JavaScript qui le reçoit.
  const sur = JSON.stringify(build).slice(1, -1).replace(/'/g, "\\'");
  return modele.split(MARQUE_BUILD).join(sur);
}

/** Greffon Vite : dépose `dist/sw.js`, propre à ce build. */
export function greffonServiceWorker(build: string, modele: string = readFileSync(MODELE_SW, 'utf-8')) {
  return {
    name: 'tune-service-worker',
    generateBundle(this: { emitFile: (a: unknown) => void }) {
      this.emitFile({ type: 'asset', fileName: FICHIER_SW, source: texteServiceWorker(modele, build) });
    },
  };
}
