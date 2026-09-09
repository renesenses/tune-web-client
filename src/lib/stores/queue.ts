import { writable, derived, get } from 'svelte/store';
import type { Track, Zone } from '../types';

export const queueTracks = writable<Track[]>([]);
export const queuePosition = writable<number>(0);
export const queueLength = writable<number>(0);

/** Les trois positions du panneau de file. */
export type QueueSheetState = 'collapsed' | 'peek' | 'expanded';

/**
 * L'état suivant du panneau de file quand on appuie sur le bouton « File ».
 *
 * #2191 — Alex Campbell, 0.9.98 Linux : « you are still required to press it
 * 3 times before the Queue will disappear ». Il compte juste, et ce n'est pas
 * un simple désaccord de conception : sur un écran large, l'appui du milieu ne
 * montre RIEN.
 *
 * Les trois états ne sont distincts qu'en disposition étroite, où le panneau
 * monte du bas et où sa HAUTEUR les sépare (`NowPlaying.svelte` :
 * `.queue-sheet.peek { height: 240px }` contre `.expanded { height: 70vh }`,
 * et 220px contre 65vh sous 768px). Là, `peek` sert vraiment : on entrevoit la
 * file sans masquer la pochette, et les gestes tactiles traversent les trois
 * crans un par un (`handleSheetTouchEnd`).
 *
 * En disposition LARGE, le panneau est une colonne ancrée à droite, pleine
 * hauteur dans les deux cas ; il ne reste que la largeur pour les distinguer —
 * `.wide-layout.peek { width: 380px }` contre `.wide-layout.expanded
 * { width: 420px }`. Quarante pixels. Et dès que l'utilisateur a tiré une fois
 * le bord de redimensionnement, `sheetSizeStyle()` impose sa largeur mémorisée
 * aux DEUX états : l'appui du milieu devient alors strictement sans effet.
 * D'où le décompte d'Alex — ouvrir, « il ne se passe rien », refermer.
 *
 * On ne retire donc `peek` que là où l'écran est incapable de le rendre. Au
 * tactile et en colonne étroite le cycle reste à trois crans : supprimer
 * `peek` partout serait la régression que redoutait l'instruction du fil.
 */
export function nextQueueSheetState(
  current: QueueSheetState,
  isWide: boolean,
): QueueSheetState {
  if (isWide) {
    // Deux crans : `peek` n'a pas de rendu propre ici.
    return current === 'collapsed' ? 'expanded' : 'collapsed';
  }
  if (current === 'collapsed') return 'peek';
  if (current === 'peek') return 'expanded';
  return 'collapsed';
}

/**
 * Sauter à une position de la file, et faire suivre l'affichage.
 *
 * La surbrillance suivait l'événement WebSocket, et rien d'autre. `POST
 * /queue/jump` renvoie pourtant la zone à jour — position de file et morceau
 * courant compris — mais la réponse était jetée : l'affichage attendait que
 * `playback.started` revienne pour se corriger. Deux façons d'attendre en
 * vain : l'événement se perd, ou le client est passé en sondage de repli, qui
 * ne relit que `/zones` et jamais la file. On entendait alors un morceau et on
 * en voyait un autre, sans que rien ne rattrape l'écart (Levente Toth, 0.9.70
 * Linux — #1589).
 *
 * La réponse du serveur fait foi ; l'optimisme ne couvre que l'instant entre
 * le clic et la réponse, et il est défait si l'appel échoue — sans quoi la
 * file montrerait un morceau qui n'a jamais démarré.
 */
export async function jumpAndSync(
  zoneId: number,
  index: number,
  jump: (zoneId: number, index: number) => Promise<Zone>,
  applyZone: (zone: Zone) => void,
): Promise<Zone | null> {
  const precedente = get(queuePosition);
  queuePosition.set(index);
  try {
    const zoneAJour = await jump(zoneId, index);
    applyZone(zoneAJour);
    return zoneAJour;
  } catch (e) {
    queuePosition.set(precedente);
    throw e;
  }
}

/** Next 5 tracks after the current position */
export const upNextTracks = derived(
  [queueTracks, queuePosition],
  ([$tracks, $pos]) => $tracks.slice($pos + 1, $pos + 6)
);

/**
 * Résumé « à suivre » : combien de titres après celui qui joue, et pour
 * combien de temps.
 *
 * L'en-tête de file affichait le total de la file, qui ne bouge pas d'un pouce
 * pendant qu'on écoute : au onzième titre d'un album de onze, elle annonçait
 * toujours « 11 titres ». Suggestion de Dominique COMET, déjà appliquée à la
 * vue File — ces deux dérivés sortent le calcul de `QueueView` pour que
 * l'écran Lecture en cours, qu'il nommait explicitement, dise la même chose
 * sans en réécrire une seconde version.
 *
 * Une piste sans durée connue (radio, flux) compte pour zéro : mieux vaut
 * annoncer un temps un peu court qu'inventer une durée.
 */
export const upNextCount = derived(
  [queueTracks, queuePosition],
  ([$tracks, $pos]) => Math.max(0, $tracks.length - ($pos + 1))
);

export const upNextMs = derived([queueTracks, queuePosition], ([$tracks, $pos]) =>
  $tracks.slice($pos + 1).reduce((sum, t) => sum + (t.duration_ms ?? 0), 0)
);

/**
 * Durée totale de la file, toutes pistes confondues.
 *
 * L'en-tête annonçait le NOMBRE de titres et le temps « à suivre », jamais la
 * durée de l'ensemble : impossible de savoir si une file de 40 titres fait deux
 * heures ou six (#2040, Vincent).
 *
 * ⚠️ À ne pas confondre avec [`upNextMs`], qui est délibérément le temps
 * RESTANT APRÈS la piste en cours — c'est ce que dit son libellé, « à suivre ».
 * Les deux valeurs sont justes et ne mesurent pas la même chose ; les fusionner
 * casserait le résumé demandé par Dominique COMET.
 *
 * Même convention que les autres : une piste sans durée connue (radio, flux)
 * compte pour zéro.
 */
export const queueTotalMs = derived(queueTracks, ($tracks) =>
  $tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0)
);
