/**
 * LA POSITION DE LECTURE PENDANT UN CHANGEMENT DE PISTE — #954.
 *
 * ## Le signalement
 *
 * Fil forum 1764, 11/09/2026, Tune 0.9.145 Linux :
 *
 *   « The next track will start after clicking, but the timeline will stay in
 *     the same place, or jump a bit. After the 3rd - 4th track change the line
 *     resets correctly. »
 *
 * ## Ce que la mesure a montré
 *
 * Relevé sur la .18 le 13/09/2026, zone Eversolo DMP-A8, `GET /zones/10` toutes
 * les 250 ms, quatre `next` intercalés :
 *
 * ```text
 * t_ms   titre                  position_ms  queue_pos
 *  337   Champ magnétique            68000      0
 * 3770   Champ magnétique            68000      0     ← figée 3,4 s
 * 5131   >>> NEXT <<<
 * 5131   Champ magnétique            68000      1     ← 🔴 piste ANCIENNE
 * 6608   Melancholia                  5000      1
 * 8141   Melancholia                  5000      1     ← re-figée
 * ```
 *
 * Trois faits :
 *
 *  1. `position_ms` n'est échantillonné qu'une fois toutes les 3 à 5 secondes,
 *     en secondes entières. Entre deux, il est GELÉ — c'est l'horloge locale
 *     du client qui donne l'illusion du mouvement.
 *  2. 🔴 Au changement, l'objet de zone est INCOHÉRENT pendant une à deux
 *     secondes : `queue_position` a déjà avancé, `current_track` et
 *     `position_ms` portent encore l'ancienne piste. C'est la fenêtre où « la
 *     ligne de temps reste en place ».
 *  3. La nouvelle piste apparaît avec une position déjà de 3 à 7 secondes,
 *     jamais zéro. D'où « ou saute ».
 *
 * ## Ce que ce module corrige, et ce qu'il ne corrige PAS
 *
 * ✅ Le point 2. Tant que la position reçue appartient à une AUTRE piste que
 * celle qu'on affiche, elle est refusée. La barre repart de zéro au changement
 * au lieu de montrer la position du morceau précédent.
 *
 * ❌ Le point 1. La cadence d'échantillonnage du serveur est ce qu'elle est, et
 * le premier relevé d'une nouvelle piste arrive tard. Le saut résiduel vient de
 * là, et il se règle côté serveur. **Ne pas prétendre que ce lot l'élimine.**
 *
 * ## Pourquoi un module
 *
 * `App.svelte` remet déjà la barre à zéro sur `playback.track_changed`
 * (`seekPositionMs.set(0); startSeekTimer()`). `v2Live` ne le fait PAS — la
 * coquille v2 ne connaît que `suivreProgression`, qui recopie la position du
 * serveur telle quelle. Écrit, mais pas branché, comme l'annonce de mise à
 * jour, les raccourcis clavier, l'historique du navigateur et le mode sans
 * distraction avant lui.
 *
 * La règle vit donc ICI, pure et testable, pour que les deux coquilles tiennent
 * la même — et que la prochaine correction ne s'applique pas à une seule.
 */

/** Ce qu'il faut d'une piste pour la reconnaître d'un relevé à l'autre. */
export interface PisteIdentifiable {
  id?: unknown;
  source?: unknown;
  source_id?: unknown;
  title?: unknown;
}

/** Ce qu'il faut d'une zone. */
export interface ZoneProgression {
  current_track?: PisteIdentifiable | null;
  position_ms?: number | null;
  state?: string | null;
}

/**
 * La clé d'une piste EN COURS DE LECTURE.
 *
 * 🔴 Elle ne peut pas se contenter de `id` : sur une file de streaming, les
 * cinq pistes relevées portaient toutes `current_track.id = null`. Elle ne peut
 * pas non plus se contenter de `source_id` : sur une radio, il vaut l'URL du
 * FLUX, la même pour tous les titres de la station (leçon de #3729). On les
 * combine avec le titre, qui est le seul repère qui change d'un morceau à
 * l'autre dans les deux cas.
 *
 * `null` quand rien ne joue : aucune piste ne peut alors être « la même ».
 */
export function clePisteEnCours(zone: ZoneProgression | null | undefined): string | null {
  const t = zone?.current_track;
  if (!t) return null;
  if (t.id != null && t.id !== '') return `id:${String(t.id)}`;
  const src = `${t.source == null ? '' : String(t.source)}:${t.source_id == null ? '' : String(t.source_id)}`;
  const titre = (t.title == null ? '' : String(t.title)).toLowerCase();
  if (src === ':' && !titre) return null;
  return `s:${src}:${titre}`;
}

/** L'état que le client tient entre deux relevés. */
export interface SuiviPosition {
  /** La piste à laquelle la position affichée appartient. */
  clePiste: string | null;
  positionMs: number;
}

export interface Decision {
  /** Le nouvel état à retenir. */
  suivi: SuiviPosition;
  /** Faut-il écrire cette position dans le magasin ? */
  ecrire: boolean;
  /**
   * Pourquoi — utile en garde, et en journal quand on cherche.
   * `changement` : la piste a changé, on repart de zéro.
   * `recalage`   : même piste, l'écart au serveur dépasse le seuil.
   * `horloge`    : même piste, l'écart est dans le seuil — l'horloge locale
   *                fait foi, et on n'écrit rien (sinon la barre saccade).
   * `arret`      : la zone ne joue pas ; on prend la position du serveur.
   */
  raison: 'changement' | 'recalage' | 'horloge' | 'arret';
}

/**
 * Que faire du relevé qui vient d'arriver.
 *
 * 🔴 Le cœur du correctif tient en une ligne : si la piste a changé, la
 * position reçue est REFUSÉE, quelle qu'elle soit. Elle appartient — ou peut
 * appartenir — au morceau d'avant, et c'est précisément ce que le testeur voit.
 */
export function positionApresReleve(
  precedent: SuiviPosition,
  zone: ZoneProgression | null | undefined,
  positionLocale: number,
  deriveMaxMs: number,
): Decision {
  const cle = clePisteEnCours(zone);
  const duServeur = Math.max(0, Number(zone?.position_ms ?? 0) || 0);

  if (cle !== precedent.clePiste) {
    // La piste a changé. On repart de zéro, sans regarder ce que le serveur
    // annonce : tant qu'il n'a pas ré-échantillonné, il parle de l'ancienne.
    return { suivi: { clePiste: cle, positionMs: 0 }, ecrire: true, raison: 'changement' };
  }

  if (zone?.state !== 'playing') {
    return { suivi: { clePiste: cle, positionMs: duServeur }, ecrire: true, raison: 'arret' };
  }

  if (Math.abs(positionLocale - duServeur) > deriveMaxMs) {
    return { suivi: { clePiste: cle, positionMs: duServeur }, ecrire: true, raison: 'recalage' };
  }

  return { suivi: { clePiste: cle, positionMs: positionLocale }, ecrire: false, raison: 'horloge' };
}
