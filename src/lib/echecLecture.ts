/**
 * UN échec de lecture DOIT se voir. Point.
 *
 * ## Le défaut (renesenses/tune-server-rust#3732, #3737)
 *
 * Le 09/09/2026, un testeur Windows signale « lecture impossible des albums ».
 * Il a fallu descendre dans 200 lignes de son journal serveur pour découvrir
 * que son DAC n'était plus énuméré par WASAPI. Le serveur le savait, l'écrivait,
 * et NOMMAIT même les appareils disponibles :
 *
 *     exclusive_open_failed_without_fallback backend="WASAPI"
 *       requested_device="audio-gd USB audio"
 *       error="Endpoint WASAPI demandé introuvable : « audio-gd USB audio ».
 *              Disponibles : Haut-parleurs [{0.0.0.00000000}.{e0ea21cf-…}]"
 *
 * Il l'a poussé à toutes les télécommandes, avec `fatal: true`. Aucune ne l'a
 * affiché. Une heure de diagnostic pour un message que l'utilisateur aurait lu
 * en trois secondes.
 *
 * ## Pourquoi un module, et pas dix-neuf `catch` écrits à la main
 *
 * Les dix-neuf appels de lecture de la coquille v2 finissaient par
 * `.catch(() => {})`. Les corriger un par un rouvrirait le trou au vingtième :
 * `.catch(signalerEchecLecture)` est plus court que `.catch(() => {})`, donc
 * c'est aussi le geste le plus facile à répéter. Un garde le vérifie
 * (`v2EchecsLectureVisibles.test.ts`).
 *
 * ## Ce que ce module n'invente pas
 *
 * Rien. Le message vient du SERVEUR et est affiché tel quel ; `library.playbackError`
 * — la clé que la v1 emploie déjà (`LibraryView.svelte`) — ne sert que de
 * préfixe quand le message brut ne se suffit pas. Aucune clé de traduction
 * nouvelle n'a été ajoutée : les onze langues portent déjà celle-ci.
 */
import { get } from 'svelte/store';
import { t } from './i18n';
import { notifications } from './stores/notifications';

/**
 * Un échec nommé se lit plus longtemps qu'un succès : le message du serveur
 * porte l'appareil demandé ET la liste des disponibles, ce qui fait deux
 * lignes. Cinq secondes ne suffisent pas à les lire.
 */
const DUREE_ECHEC_MS = 10000;

/** Le texte de l'échec, quelle que soit la forme sous laquelle il remonte. */
export function texteEchec(e: unknown): string {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const o = e as { message?: unknown; error?: unknown };
  if (typeof o.message === 'string') return o.message;
  if (typeof o.error === 'string') return o.error;
  const s = String(e);
  return s === '[object Object]' ? '' : s;
}

/**
 * Rendre la main à l'utilisateur après un `POST /play` refusé.
 *
 * C'est exactement ce que fait la v1 (`LibraryView.svelte`) : le préfixe traduit,
 * deux points, puis le message du serveur — `400 "no tracks to play"` compris,
 * qui sans cela ne laisse AUCUNE trace, ni à l'écran ni au journal.
 */
export function signalerEchecLecture(e: unknown): void {
  const detail = texteEchec(e);
  const prefixe = get(t)('library.playbackError');
  console.error('Play error:', e);
  notifications.error(detail ? `${prefixe} : ${detail}` : prefixe, DUREE_ECHEC_MS);
}

/**
 * Le même échec, arrivé par WebSocket (`zone.playback_error`).
 *
 * Le message du serveur est déjà complet et localisé : on l'affiche TEL QUEL,
 * sans préfixe — « Endpoint WASAPI demandé introuvable : … Disponibles : … »
 * n'a pas besoin qu'on lui explique que c'est une erreur de lecture. Le titre
 * de la piste est accolé quand le serveur le donne, comme le fait `App.svelte`.
 */
export function signalerErreurServeur(data: {
  message?: string;
  error?: string;
  track_title?: string;
} | null | undefined): void {
  const msg = data?.message || data?.error || get(t)('library.playbackError');
  const titre = data?.track_title;
  notifications.error(titre ? `${msg} — ${titre}` : msg, DUREE_ECHEC_MS);
}
