import { get } from 'svelte/store';
import { t } from './i18n';
import { lireEvenementErreur } from './messageServeur';

/**
 * tune-server-rust#8483 (go de Bertrand, rc12) — un fichier abîmé : son
 * conteneur annonce plus de musique que le flux n'en porte. Quand la zone se
 * fige sur la coupure, le serveur passe à la piste suivante et le dit par un
 * `zone.playback_error` NON fatal, code `track_file_damaged`, paramètres
 * `title` et `position` (`m:ss`). La zone continue : c'est un avertissement,
 * pas un échec — affiché en information, traduit
 * (`erreursServeur.track_file_damaged`), jamais tu par la fenêtre de grâce.
 */
export const CODE_FICHIER_ABIME = 'track_file_damaged';

/** L'événement est-il l'avis « fichier abîmé » ? */
export function estAvisFichierAbime(data: { code?: unknown } | null | undefined): boolean {
  return data?.code === CODE_FICHIER_ABIME;
}

/** Le texte de l'avis, dans la langue de l'interface, titre et position compris. */
export function texteAvisFichierAbime(data: Record<string, unknown> | null | undefined): string {
  return lireEvenementErreur(data, 'library.playbackError').message || get(t)('library.playbackError');
}
