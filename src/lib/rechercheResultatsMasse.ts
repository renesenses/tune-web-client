/**
 * Les deux gestes de MASSE de la recherche, sur les résultats déjà reçus —
 * `tune-server-rust#4710`.
 *
 * ## D'où vient ce module
 *
 * #3190 (durée totale) et #3191 (créer une liste depuis les résultats) ont été
 * livrés à jfpaquet en v0.9.141. Les deux vivaient **uniquement** dans
 * `src/components/SearchView.svelte`, supprimé le 19/09 par `d5ed7deb` avec
 * leurs deux bancs de tests et leurs clés de traduction (retirées par
 * `35e66cd0`). `SearchV2.svelte` ne les a jamais repris : rien ne pouvait
 * passer au rouge, et le testeur les a réclamés le 22/09 (fil 1644).
 *
 * Le calcul est ici, et non dans le composant, pour deux raisons :
 * il se teste sans rendre de Svelte, et `SearchV2.svelte` est en ce moment
 * touché par plusieurs chantiers en parallèle (dont tune-server-rust#4663).
 *
 * ## 🔴 Ce que ces fonctions refusent d'affirmer
 *
 * La liste de la recherche est une PAGE. Écrire « 3 h 12 » sous un compteur
 * qui dit déjà « 40 sur 2451 » publierait un second chiffre faux, avec
 * l'autorité d'une durée. Aucune fonction d'ici ne prétend donc totaliser
 * « la recherche » : elles totalisent ce qui a été REÇU, et le libellé le dit.
 */

/** Le strict nécessaire : ces fonctions ne lisent rien d'autre. */
export interface PisteDeResultat {
  id?: unknown;
  source?: unknown;
  duration_ms?: number | null;
}

/**
 * La somme des durées, en millisecondes.
 *
 * Une piste sans durée compte pour zéro — c'est le cas des pistes de service
 * dont le fournisseur n'annonce pas la longueur. Une durée négative ou non
 * finie est ignorée de la même façon : elle ne doit pas RETRANCHER du total.
 */
export function dureeTotaleMs(pistes: readonly PisteDeResultat[] | null | undefined): number {
  let somme = 0;
  for (const p of pistes ?? []) {
    const d = Number(p?.duration_ms);
    if (Number.isFinite(d) && d > 0) somme += d;
  }
  return somme;
}

/**
 * Combien de pistes portent réellement une durée.
 *
 * C'est ce qui sépare « 3 h 12 » de « 3 h 12, mais seulement sur 18 des 40
 * lignes ». L'appelant décide quoi en faire ; le total, lui, ne ment pas sur
 * son assiette.
 */
export function nombreAvecDuree(pistes: readonly PisteDeResultat[] | null | undefined): number {
  let n = 0;
  for (const p of pistes ?? []) {
    const d = Number(p?.duration_ms);
    if (Number.isFinite(d) && d > 0) n += 1;
  }
  return n;
}

/**
 * Les pistes que l'on peut réellement enregistrer dans une liste de lecture
 * locale : celles de la BIBLIOTHÈQUE, avec un identifiant numérique.
 *
 * 🔴 `estDeBibliotheque` est passé en paramètre, et non importé : c'est le même
 * prédicat que l'écran emploie pour le cœur, le crayon et le geste de lecture
 * (#4201, un album UPnP est de la bibliothèque, pas d'un « service »). Deux
 * définitions divergentes de « local » sur le même écran produiraient une
 * liste qui ne contient pas ce que l'écran montre comme local.
 *
 * `POST /playlists/{id}/tracks` prend des identifiants de bibliothèque : une
 * piste de service n'en a pas, et l'inventer la ferait disparaître en silence.
 */
export function pistesEnregistrables<T extends PisteDeResultat>(
  pistes: readonly T[] | null | undefined,
  estDeBibliotheque: (x: T) => boolean,
): T[] {
  return (pistes ?? []).filter((p) => estDeBibliotheque(p) && typeof p?.id === 'number');
}

/** Les identifiants à envoyer, dédoublonnés, dans l'ordre de l'écran. */
export function identifiantsEnregistrables<T extends PisteDeResultat>(
  pistes: readonly T[] | null | undefined,
  estDeBibliotheque: (x: T) => boolean,
): number[] {
  const vus = new Set<number>();
  const ids: number[] = [];
  for (const p of pistesEnregistrables(pistes, estDeBibliotheque)) {
    const id = p.id as number;
    if (vus.has(id)) continue;
    vus.add(id);
    ids.push(id);
  }
  return ids;
}
