/**
 * Pourquoi le palier est gratuit (rc14).
 *
 * Quand mozaiklabs.fr refuse ou rétrograde une clé, le serveur Tune expose la
 * raison dans `GET /cloud/license/status` : `reason` (le code) et
 * `reason_detail` (de quoi la mettre en phrase). Ce module choisit la phrase
 * et le geste à proposer. Affichage seulement : le palier, lui, vient du
 * serveur et ne dépend pas de ce qui est lu ici.
 *
 * Un serveur antérieur n'envoie pas le champ : rien ne s'affiche.
 */

export type RaisonLicence =
  | 'session_conflict'
  | 'key_expired'
  | 'key_invalid'
  | 'server_unreachable'
  | 'rate_limited'
  | 'grace_period';

/** `reason_detail` tel que le serveur le rend. Aucun secret. */
export interface DetailRaisonLicence {
  reason: RaisonLicence | string;
  /** `session_conflict` : minutes avant que la session de l'autre appareil se libère. */
  minutes_remaining?: number | null;
  /** `key_expired` : date de fin de l'abonnement (ISO-8601). */
  expires_at?: string | null;
  /** `grace_period` : fin de la tolérance hors ligne (ISO-8601). */
  grace_until?: string | null;
  upstream_status?: number | null;
  checked_at?: string | null;
}

/** L'espace personnel sur le site, où l'on gère et renouvelle sa licence. */
export const URL_COMPTE_MOZAIKLABS = 'https://mozaiklabs.fr/account';

export interface PhraseRaisonLicence {
  /** Le code, repris tel quel pour `data-raison-licence`. */
  raison: RaisonLicence;
  /** Clé i18n de la phrase. */
  cle: string;
  /** Valeur de `{n}` (minutes), quand la phrase en porte. */
  minutes: number | null;
  /** Date ISO à formater dans `{date}`, quand la phrase en porte. */
  date: string | null;
  /** Lien vers le compte, quand le geste est d'y aller. */
  lien: string | null;
  /** `warn` = Premium absent ; `info` = Premium conservé. */
  ton: 'warn' | 'info';
}

function entierPositif(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function texte(s: unknown): string | null {
  return typeof s === 'string' && s.trim() !== '' ? s : null;
}

/**
 * La phrase à afficher sous le palier, ou `null` quand il n'y a rien à dire
 * (pas de détail, ou raison inconnue d'un serveur plus récent : on n'invente
 * rien).
 */
export function phraseRaisonLicence(
  detail: DetailRaisonLicence | null | undefined,
): PhraseRaisonLicence | null {
  if (!detail || typeof detail !== 'object') return null;
  const base = { minutes: null, date: null, lien: null, ton: 'warn' as const };
  switch (detail.reason) {
    case 'session_conflict': {
      const minutes = entierPositif(detail.minutes_remaining);
      return {
        ...base,
        raison: 'session_conflict',
        cle: minutes === null
          ? 'settings.licenseReasonSessionConflictLater'
          : 'settings.licenseReasonSessionConflict',
        minutes,
      };
    }
    case 'key_expired': {
      const date = texte(detail.expires_at);
      return {
        ...base,
        raison: 'key_expired',
        cle: date === null ? 'settings.licenseReasonKeyExpiredNoDate' : 'settings.licenseReasonKeyExpired',
        date,
        lien: URL_COMPTE_MOZAIKLABS,
      };
    }
    case 'key_invalid':
      return { ...base, raison: 'key_invalid', cle: 'settings.licenseReasonKeyInvalid', lien: URL_COMPTE_MOZAIKLABS };
    case 'server_unreachable':
      return { ...base, raison: 'server_unreachable', cle: 'settings.licenseReasonServerUnreachable' };
    case 'rate_limited':
      return { ...base, raison: 'rate_limited', cle: 'settings.licenseReasonRateLimited' };
    case 'grace_period': {
      const date = texte(detail.grace_until);
      // Sans date de fin, le bandeau de grâce hors ligne (#1999) dit déjà l'essentiel.
      if (date === null) return null;
      return { ...base, raison: 'grace_period', cle: 'settings.licenseReasonGracePeriod', date, ton: 'info' };
    }
    default:
      return null;
  }
}
