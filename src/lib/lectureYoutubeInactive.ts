/**
 * tune-server-rust#8913 — lire YouTube demande désormais yt-dlp : Google
 * refuse les deux voies natives de Tune depuis août (#2162, 48 échecs sur
 * 48). Tant que la « Lecture YouTube » n'est pas activée, le serveur refuse
 * la lecture par un 409 au code stable `youtube_playback_disabled`, phrase
 * traduite (`message_key`), au lieu de l'ancien
 * « HTTP 502 — upstream_error — Streaming service error: … » brut.
 *
 * Deux moments où l'interface propose de l'activer :
 *  - au premier échec de lecture : le message et le bouton qui mène au
 *    réglage (`annoncerLectureYoutubeInactive`, depuis `fetchJSON` et
 *    l'événement `zone.playback_error`) ;
 *  - à la connexion du compte YouTube : `proposerApresConnexion`, depuis les
 *    Réglages, avec un bouton qui l'active sur place.
 */
import { get } from 'svelte/store';
import { t } from './i18n';
import { notifications } from './stores/notifications';
import { activeView } from './stores/navigation';
import { v2SettingsTarget } from './stores/v2SettingsNav';
import { estMessageGenerique } from './messageServeur';

export const CODE_LECTURE_YOUTUBE_INACTIVE = 'youtube_playback_disabled';
/** Repli quand le serveur n'a pas envoyé sa phrase traduite. */
export const CLE_MESSAGE = 'playback.errorYoutubeDisabled';
export const CLE_BOUTON = 'playback.youtubeOpenSetting';
export const CLE_PROPOSITION = 'settings.youtubeConnectedEnablePrompt';
export const CLE_BOUTON_ACTIVER = 'settings.youtubePlaybackEnable';
/** Le réglage visé (`lib/reglagesIndex`) : onglet Accès, carte Streaming. */
export const REGLAGE_LECTURE_YOUTUBE = 'youtube-lecture';

/** Ouvre les Réglages sur « Lecture YouTube », amené à l'écran et éclairé. */
export function ouvrirReglageLectureYoutube(): void {
  v2SettingsTarget.set({ tab: 'access', section: 'streaming', reglage: REGLAGE_LECTURE_YOUTUBE });
  activeView.set('settings' as any);
}

/** Le refus est-il « lecture YouTube non activée » ? */
export function estLectureYoutubeInactive(code: unknown): boolean {
  return code === CODE_LECTURE_YOUTUBE_INACTIVE;
}

/**
 * La phrase à afficher : celle du serveur quand elle est traduite (un
 * message non générique, passé par `lireMessageServeur`), sinon la nôtre.
 * Le texte d'un `zone.playback_error` (« Impossible de lire la piste
 * suivante : youtube_playback_disabled: … ») n'est jamais montré : il porte
 * le code brut.
 */
export function texteLectureYoutubeInactive(messageServeur?: unknown): string {
  if (
    typeof messageServeur === 'string'
    && messageServeur.trim() !== ''
    && !estMessageGenerique(messageServeur)
    && !messageServeur.includes(CODE_LECTURE_YOUTUBE_INACTIVE)
  ) {
    return messageServeur;
  }
  return get(t)(CLE_MESSAGE as any);
}

/** Le message et le bouton qui mène au réglage. Rend la phrase affichée. */
export function annoncerLectureYoutubeInactive(messageServeur?: unknown): string {
  const texte = texteLectureYoutubeInactive(messageServeur);
  notifications.withAction(texte, get(t)(CLE_BOUTON as any), ouvrirReglageLectureYoutube, 15000);
  return texte;
}

/**
 * À la connexion du compte YouTube : si la lecture n'est pas activée, le
 * proposer, avec le bouton qui l'active tout de suite (`activer`). Rend
 * `true` quand la proposition a été faite.
 */
export function proposerApresConnexion(
  service: string,
  lectureActivee: boolean,
  activer: () => void,
): boolean {
  if (service !== 'youtube' || lectureActivee) return false;
  const tr = get(t);
  notifications.withAction(tr(CLE_PROPOSITION as any), tr(CLE_BOUTON_ACTIVER as any), activer, 20000);
  return true;
}
