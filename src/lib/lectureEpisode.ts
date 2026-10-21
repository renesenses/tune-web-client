/**
 * Lancer un épisode de podcast sur une zone, et dire VRAIMENT si c'est parti
 * (renesenses/tune-server-rust#6468).
 *
 * FabienM, fil 2302 point 13 : un épisode sur sa zone DLNA ne jouait pas, et
 * l'écran se comportait comme si la lecture avait démarré. Depuis la PR
 * serveur 6656, `POST /podcasts/play/{zone}` répond par un vrai statut d'échec,
 * avec un `code` stable, et repasse la zone à l'arrêt :
 *
 *   502  podcast_sortie_refuse       l'enceinte a refusé l'URL ou le Play
 *   503  podcast_sortie_introuvable  l'enceinte n'est pas encore découverte
 *
 * Côté client, trois défauts :
 *
 *  1. l'écran allumait l'épisode « en lecture » AVANT la réponse, et le
 *     laissait allumé deux secondes même sur un refus ;
 *  2. le 5xx posait le bandeau global « Server error: Output device error: … »,
 *     en anglais, quelle que soit la langue de l'interface ;
 *  3. l'écran, lui, disait le repli générique du streaming, sans rien de ce
 *     que le serveur avait expliqué.
 *
 * Ici : le statut décide. Une réponse non 2xx est un échec, avec une phrase
 * traduite pour les codes connus, et sinon le repli traduit suivi du message
 * du serveur. L'écran n'allume l'épisode qu'après un succès.
 */
import { get } from 'svelte/store';
import { playPodcastEpisode } from './api';
import { t } from './i18n';
import { texteEchec } from './echecLecture';

export type EpisodeAJouer = {
  audio_url: string;
  title?: string;
  podcast_name?: string;
  cover_url?: string;
  duration_ms?: number;
};

export type IssueEpisode = { ok: true } | { ok: false; message: string };

/** Les codes rendus par `play_episode` (tune-server, routes/podcasts.rs). */
const CLES_DES_CODES: Record<string, string> = {
  podcast_sortie_refuse: 'v2.pod.playOutputRefused',
  podcast_sortie_introuvable: 'v2.pod.playOutputNotFound',
};

/** La phrase à afficher pour un échec de lancement d'épisode. */
export function messageEchecEpisode(e: unknown): string {
  const traduire = get(t) as (cle: string) => string;
  const code = (e as { code?: unknown } | null)?.code;
  const cle = typeof code === 'string' ? CLES_DES_CODES[code] : undefined;
  if (cle) return traduire(cle);
  const detail = texteEchec(e).trim();
  const repli = traduire('v2.pod.playFailed');
  return detail ? `${repli} : ${detail}` : repli;
}

export async function lancerEpisode(zoneId: number, episode: EpisodeAJouer): Promise<IssueEpisode> {
  try {
    await playPodcastEpisode(zoneId, episode);
    return { ok: true };
  } catch (e) {
    // Le détail technique du serveur (« Output device error: SOAP fault… »)
    // reste en console, là où on le cherche pour diagnostiquer.
    console.error('Podcast episode play error:', e);
    return { ok: false, message: messageEchecEpisode(e) };
  }
}
