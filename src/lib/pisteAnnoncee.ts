/**
 * La piste annoncée par le serveur, tenue jusqu'à ce que `GET /zones` la montre.
 *
 * web#2615 (Belkadi Yacine, rc9) : sur « Lecture en cours », il faut recharger
 * la page à chaque changement d'album pour voir le nouveau.
 *
 * Le client relit `/zones` après chaque `playback.started` ou
 * `playback.track_changed`, et c'est la seule relecture : les relevés de
 * position qui suivent (`playback.position`) ne relisent rien. Or deux
 * réponses peuvent porter l'ANCIENNE piste :
 *
 *  - la zone du serveur reste incohérente une à deux secondes après le
 *    changement : `current_track` porte encore le morceau d'avant (mesuré sur
 *    la .18 le 13/09/2026, voir #954 dans `v2Live.ts`) ;
 *  - les relectures ne sont pas ordonnées : celle d'un événement antérieur
 *    peut arriver après la bonne et l'écraser.
 *
 * Dans les deux cas, rien ne relisait la zone avant le PROCHAIN événement de
 * lecture : l'écran gardait la pochette et le titre de l'album précédent
 * pendant tout le morceau.
 *
 * L'événement, lui, porte le `NowPlaying` complet (`now_playing_event_data`,
 * côté serveur, depuis #1096). Cette piste est donc retenue, par zone : tant
 * qu'une relecture ne la montre pas, la piste de l'événement remplace la
 * piste périmée, et une nouvelle relecture est demandée. L'attente cesse dès
 * qu'une relecture la confirme, qu'une piste plus récente est annoncée, que la
 * zone n'a plus de piste, ou au bout de `DUREE_ATTENTE_MS`.
 */
import { pisteDeLEvenement } from './historiqueEcoutes';

/** Au-delà, la relecture fait foi, même si elle diffère de l'annonce. */
export const DUREE_ATTENTE_MS = 10_000;

/** Délai avant de relire une zone qui montre encore la piste d'avant. */
export const DELAI_RELECTURE_MS = 1_000;

export interface PisteAttendue {
  /** La piste telle que l'événement la décrit, forme de `zone.current_track`. */
  piste: Record<string, unknown>;
  cle: string;
  /** `track_generation` de l'événement, s'il le porte. */
  generation: number | null;
  /** Instant (ms) au-delà duquel on cesse d'attendre. */
  jusqua: number;
}

/**
 * Clé d'identité d'une piste : l'identifiant de bibliothèque s'il existe
 * (`track_id` dans `/zones` et dans l'événement, `id` dans `/zones/{id}`),
 * sinon la source, l'identifiant chez le service et le titre.
 */
export function clePiste(piste: unknown): string | null {
  if (!piste || typeof piste !== 'object') return null;
  const t = piste as Record<string, unknown>;
  const id = t.track_id ?? t.id;
  if (id != null && id !== '') return `id:${String(id)}`;
  const source = t.source == null ? '' : String(t.source);
  const sourceId = t.source_id == null ? '' : String(t.source_id);
  const titre = t.title == null ? '' : String(t.title).toLowerCase();
  if (!source && !sourceId && !titre) return null;
  return `s:${source}:${sourceId}:${titre}`;
}

/**
 * Retient la piste qu'annonce un événement de changement de piste.
 * Rend `true` si une attente a été posée.
 */
export function retenirPisteAnnoncee(
  attentes: Map<number, PisteAttendue>,
  type: string,
  donnees: unknown,
  maintenant: number,
): boolean {
  if (type !== 'playback.started' && type !== 'playback.track_changed') return false;
  const d = donnees as Record<string, unknown> | null;
  const zoneId = d?.zone_id;
  if (typeof zoneId !== 'number') return false;
  const piste = pisteDeLEvenement(donnees) as Record<string, unknown> | null;
  const cle = clePiste(piste);
  if (!piste || !cle) {
    attentes.delete(zoneId);
    return false;
  }
  const generation = typeof d?.track_generation === 'number' ? d.track_generation : null;
  const precedente = attentes.get(zoneId);
  // Un événement plus ancien que celui déjà retenu ne le remplace pas.
  if (precedente?.generation != null && generation != null && generation < precedente.generation) {
    return false;
  }
  attentes.set(zoneId, { piste, cle, generation, jusqua: maintenant + DUREE_ATTENTE_MS });
  return true;
}

/**
 * Confronte une liste de zones relue aux pistes annoncées.
 *
 * Rend la liste à écrire (les zones en retard portent la piste annoncée) et
 * `relire` : vrai si au moins une zone est encore en retard.
 */
export function appliquerPistesAnnoncees<Z>(
  liste: Z[],
  attentes: Map<number, PisteAttendue>,
  maintenant: number,
): { liste: Z[]; relire: boolean } {
  if (attentes.size === 0) return { liste, relire: false };
  let relire = false;
  const sortie = liste.map((zone) => {
    const z = zone as Record<string, unknown> | null;
    const id = z?.id;
    if (typeof id !== 'number') return zone;
    const attente = attentes.get(id);
    if (!attente) return zone;
    if (maintenant > attente.jusqua) {
      attentes.delete(id);
      return zone;
    }
    const cleRelue = clePiste(z!.current_track);
    // Zone sans piste (arrêt, file vidée) : l'annonce ne vaut plus.
    if (cleRelue === null || cleRelue === attente.cle) {
      attentes.delete(id);
      return zone;
    }
    relire = true;
    return { ...z, current_track: attente.piste } as Z;
  });
  return { liste: sortie, relire };
}
