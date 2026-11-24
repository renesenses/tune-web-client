import { get } from 'svelte/store';
import { t } from './i18n';

/**
 * tune-server-rust#9488 (PR #9503, rc15) — le flux lancé d'une radio ne
 * démarre pas (503, connexion refusée, flux vide…) : le serveur passe à un
 * autre flux de la même station et le dit, au premier son du flux de repli,
 * par un `zone.playback_error` NON fatal, code `radio_stream_fallback`,
 * paramètres `title`, `failed_kbps` et `playing_kbps` (débits de la fiche,
 * `null` quand ils sont inconnus).
 *
 * La radio JOUE : c'est une information, pas une erreur. Elle arrive presque
 * toujours dans la fenêtre de grâce de 30 s qui suit « Lire », qui la
 * remplaçait par « chargement… » : la branche dédiée de `v2Live.ts` la dit
 * avant ce filtre.
 *
 * Le texte est composé ICI, à partir des débits, dans la langue de
 * l'interface ; la phrase française du serveur (`error`) n'est pas lue.
 */
export const CODE_REPLI_RADIO = 'radio_stream_fallback';

/** L'événement est-il l'avis « repli sur un autre flux de la station » ? */
export function estAvisRepliRadio(data: { code?: unknown } | null | undefined): boolean {
  return data?.code === CODE_REPLI_RADIO;
}

/** Un débit utilisable (kbit/s entier positif), ou `null`. */
function debit(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Le texte de l'avis, dans la langue de l'interface. Quatre phrases, selon
 * les débits connus — la même règle que `RepliRadio::message` côté serveur.
 */
export function texteAvisRepliRadio(data: Record<string, unknown> | null | undefined): string {
  const p = (data?.params && typeof data.params === 'object' ? data.params : {}) as Record<string, unknown>;
  const enEchec = debit(p.failed_kbps);
  const joue = debit(p.playing_kbps);
  const cle =
    enEchec !== null && joue !== null
      ? 'erreursServeur.radio_stream_fallback'
      : enEchec !== null
        ? 'erreursServeur.radio_stream_fallback_failed'
        : joue !== null
          ? 'erreursServeur.radio_stream_fallback_playing'
          : 'erreursServeur.radio_stream_fallback_unknown';
  const valeurs: Record<string, string> = {
    failed_kbps: String(enEchec ?? ''),
    playing_kbps: String(joue ?? ''),
  };
  return get(t)(cle).replace(/\{(\w+)\}/g, (tout, nom) => (nom in valeurs ? valeurs[nom] : tout));
}
