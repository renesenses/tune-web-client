/**
 * Rayons de collections — tune-server-rust#4853 (Gros Bidon, fil 1907).
 *
 * « Rock → Artiste 1, Artiste 2… ; Jazz → … » : un ARBRE de rayons qui range
 * les collections des deux sortes. Décision de Bertrand du 24/09/2026 : arbre
 * (une collection dans un seul rayon), profondeur maximale 3.
 *
 * Logique pure, sans composant : ce que l'écran et la barre latérale
 * partagent, et ce que les témoins vérifient.
 */
import { writable } from 'svelte/store';
import type { ArbreCollections, RayonCollections, SorteCollectionRangee } from './api';

/**
 * Ce que l'écran peut montrer.
 *
 * `plat` : le serveur ne sert pas l'arbre (serveur antérieur à #4853 → 404,
 * ou panne). L'écran Collections reste alors EXACTEMENT celui d'aujourd'hui —
 * ses deux onglets de listes plates, sans bandeau d'erreur : l'absence d'une
 * fonction nouvelle n'est pas une panne.
 */
export type EtatRayons =
  | { mode: 'arbre'; arbre: ArbreCollections }
  | { mode: 'plat' };

export async function chargerRayons(
  lire: () => Promise<ArbreCollections>,
): Promise<EtatRayons> {
  try {
    const arbre = await lire();
    // Garde de forme : un repli SPA ou un proxy peut répondre 200 sans l'arbre.
    if (!arbre || !Array.isArray(arbre.folders) || !Array.isArray(arbre.collections)) {
      return { mode: 'plat' };
    }
    return { mode: 'arbre', arbre };
  } catch {
    return { mode: 'plat' };
  }
}

/**
 * L'arbre PARTAGÉ entre l'écran Collections et la barre latérale : l'écran le
 * republie après chaque rangement, la barre ne montre donc jamais un arbre
 * périmé.
 */
export const etatRayons = writable<EtatRayons>({ mode: 'plat' });

export async function rafraichirRayons(
  lire: () => Promise<ArbreCollections>,
): Promise<EtatRayons> {
  const e = await chargerRayons(lire);
  etatRayons.set(e);
  return e;
}

/**
 * La clé de raccourci d'une collection, celle qu'écoute l'écran Collections
 * (`tune:shortcut-restore`) : la barre latérale ouvre une collection rangée
 * par le même chemin qu'un raccourci, sans second mécanisme.
 */
export function cleCibleCollection(kind: SorteCollectionRangee, id: number): string {
  return `${kind === 'smart' ? 'smartcollections' : 'collections'}:${id}`;
}

/** Tous les rayons, à plat, dans l'ordre de l'arbre (parcours en profondeur). */
export function tousLesRayons(folders: RayonCollections[]): RayonCollections[] {
  const sortie: RayonCollections[] = [];
  const visiter = (liste: RayonCollections[]) => {
    for (const f of liste) {
      sortie.push(f);
      visiter(f.folders ?? []);
    }
  };
  visiter(folders);
  return sortie;
}

/** Hauteur du sous-arbre : 1 pour un rayon sans sous-rayon. */
export function hauteur(f: RayonCollections): number {
  return 1 + Math.max(0, ...(f.folders ?? []).map(hauteur));
}

/** Vrai si `id` est `f` lui-même ou l'un de ses descendants. */
function contient(f: RayonCollections, id: number): boolean {
  return f.id === id || (f.folders ?? []).some((s) => contient(s, id));
}

/**
 * Où peut-on déplacer le rayon `id` ? `null` = la racine.
 *
 * Mêmes refus que le serveur, pour ne pas PROPOSER ce qui sera refusé : ni
 * lui-même, ni l'un de ses descendants (cycle), ni un parent qui porterait un
 * rayon du sous-arbre au-delà de `maxDepth`. Le serveur reste juge : cette
 * liste n'est qu'un menu.
 */
export function destinationsDuRayon(
  arbre: ArbreCollections,
  id: number,
): (RayonCollections | null)[] {
  const tous = tousLesRayons(arbre.folders);
  const lui = tous.find((f) => f.id === id);
  if (!lui) return [];
  const h = hauteur(lui);
  const sorties: (RayonCollections | null)[] = [];
  if (lui.parent_id !== null) sorties.push(null);
  for (const f of tous) {
    if (contient(lui, f.id)) continue;
    if (f.id === lui.parent_id) continue;
    if (f.depth + h > arbre.max_depth) continue;
    sorties.push(f);
  }
  return sorties;
}

/**
 * Où peut-on ranger une collection ? Tout rayon, quelle que soit sa
 * profondeur, et la racine si elle est aujourd'hui dans un rayon.
 */
export function destinationsDeLaCollection(
  arbre: ArbreCollections,
  dossierActuel: number | null,
): (RayonCollections | null)[] {
  const sorties: (RayonCollections | null)[] = [];
  if (dossierActuel !== null) sorties.push(null);
  for (const f of tousLesRayons(arbre.folders)) {
    if (f.id !== dossierActuel) sorties.push(f);
  }
  return sorties;
}

/** Peut-on créer un sous-rayon dans `f` ? */
export function peutContenirUnSousRayon(arbre: ArbreCollections, f: RayonCollections): boolean {
  return f.depth < arbre.max_depth;
}

/**
 * Ce que transporte un glisser-déposer : un rayon ou une collection — et pour
 * une collection, TOUJOURS sa sorte (l'id 1 est « favorites » ET
 * « Audiophile »).
 */
export type Glisse =
  | { type: 'rayon'; id: number }
  | { type: 'collection'; kind: SorteCollectionRangee; id: number };

export const TYPE_GLISSE = 'application/x-tune-rayon';

export function encoderGlisse(g: Glisse): string {
  return JSON.stringify(g);
}

export function decoderGlisse(brut: string | null | undefined): Glisse | null {
  if (!brut) return null;
  try {
    const g = JSON.parse(brut);
    if (g?.type === 'rayon' && Number.isInteger(g.id)) return { type: 'rayon', id: g.id };
    if (
      g?.type === 'collection' &&
      (g.kind === 'collection' || g.kind === 'smart') &&
      Number.isInteger(g.id)
    ) {
      return { type: 'collection', kind: g.kind, id: g.id };
    }
  } catch {
    /* corps étranger : ignoré */
  }
  return null;
}

/** Les rayons repliés, mémorisés par navigateur (préférence d'écran). */
const CLE_REPLIS = 'tune_v2_rayons_replies';

export function lireReplis(): Set<number> {
  try {
    const brut = localStorage.getItem(CLE_REPLIS);
    const ids = brut ? JSON.parse(brut) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x) => Number.isInteger(x)) : []);
  } catch {
    return new Set();
  }
}

export function ecrireReplis(ids: Set<number>): void {
  try {
    localStorage.setItem(CLE_REPLIS, JSON.stringify([...ids]));
  } catch {
    /* stockage indisponible : le repli vaut pour la session */
  }
}
