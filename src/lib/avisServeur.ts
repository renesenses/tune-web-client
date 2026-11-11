/**
 * Un AVIS du serveur (`zone.notice`), jamais une erreur.
 *
 * tune-server-rust#8422 (décision de Bertrand du 11/11) : une bascule PURE
 * sur un fichier dont le traitement est déjà cuit (égaliseur, crossfeed) doit
 * refaire le flux. Le serveur reprend à la position en cours et le dit une
 * fois : `{ code: 'pure_resumed_at_position', position_ms, position, message }`.
 *
 * Le texte se dit dans la langue de l'interface (`avisServeur.<code>`) ; un
 * code inconnu du client retombe sur le `message` du serveur (français), un
 * avis sans rien de lisible n'affiche rien.
 */
import { get } from 'svelte/store';
import { t } from './i18n';
import { formatTime } from './utils';

export interface AvisServeur {
  code?: unknown;
  message?: unknown;
  position_ms?: unknown;
}

export function texteAvisServeur(data: AvisServeur | null | undefined): string | null {
  const code = typeof data?.code === 'string' ? data.code : '';
  if (code) {
    const cle = `avisServeur.${code}`;
    const traduit = get(t)(cle);
    if (traduit && traduit !== cle) {
      const ms = typeof data?.position_ms === 'number' ? data.position_ms : 0;
      return traduit.replace('{position}', formatTime(ms));
    }
  }
  const brut = typeof data?.message === 'string' ? data.message.trim() : '';
  return brut || null;
}
