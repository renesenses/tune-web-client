import { get } from 'svelte/store';
import { t } from './i18n';

/**
 * Ce que l'écran peut dire d'un refus du serveur — tune-web-client#2417,
 * tune-server-rust#7077.
 *
 * 🔴 LE DÉFAUT. `apiError` recopiait `detail`, `message` ou `error` du corps
 * dans `err.message`, que des centaines d'écrans affichent tels quels, et les
 * bandeaux posaient `Server error: ${err.message}`. Or le serveur composait
 * ces phrases EN FRANÇAIS, en dur : un anglophone lisait « réglage non
 * enregistré » ou « Tune démarre : configuration » (testeur Alex,
 * 26/10/2026). Le texte brut d'un service tiers (Qobuz, un `stderr` de
 * `mount.cifs`) passait de la même façon.
 *
 * LA RÈGLE. Le texte montré est, dans cet ordre :
 *
 *  1. la traduction du CODE par le client (`erreursServeur.<code>`), quand
 *     le dictionnaire la connaît ;
 *  2. la phrase du serveur, quand le serveur dit l'avoir traduite :
 *     `message_key` (contrat de tune-server-rust#7077, `message_api.rs`), ou
 *     un des codes qui la rendaient déjà traduite avant ce contrat ;
 *  3. sinon, un message GÉNÉRIQUE traduit.
 *
 * Le texte brut n'est jamais perdu : il part dans `detail`, que le bandeau
 * range dans un « Détails » replié.
 */
export interface MessageServeur {
  /** Le texte à montrer, dans la langue de l'interface. */
  message: string;
  /** Le détail technique, pour le « Détails » replié ; vide s'il n'y en a pas. */
  detail: string;
  /** Le code stable du refus, s'il y en a un. */
  code?: string;
}

/** Clé du message générique. */
export const CLE_GENERIQUE = 'erreursServeur.generique';

/**
 * Codes dont le serveur rendait DÉJÀ la phrase dans la langue de
 * l'interface avant `message_key` : `zone_output_unavailable` (#4601, la
 * phrase nomme l'appareil), `rate_limited` (`cloud_error.rs`, #2178).
 */
const CODES_DEJA_TRADUITS = new Set<string>(['zone_output_unavailable', 'rate_limited']);

/** Un code machine : ASCII, sans espace (`zone_en_lecture`, `not_found`). */
export function estUnCode(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z][a-z0-9_.:-]*$/i.test(v) && !/\s/.test(v);
}

function chaine(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** La traduction client d'un code, paramètres interpolés, ou `null`. */
export function traductionDuCode(code: string | undefined, params?: unknown): string | null {
  if (!code) return null;
  const cle = `erreursServeur.${code}`;
  const traduit = get(t)(cle);
  if (!traduit || traduit === cle) return null;
  const p = params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
  return traduit.replace(/\{(\w+)\}/g, (tout, nom) => (nom in p ? String(p[nom]) : tout));
}

/**
 * Lire un corps de refus (JSON déjà analysé, ou `null`) et son texte brut.
 *
 * `brut` est le texte de la réponse quand ce n'était pas du JSON
 * (`text/plain`) ; `statut` complète le détail.
 */
export function lireMessageServeur(corps: unknown, brut = '', statut?: number): MessageServeur {
  const c = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};
  const code = estUnCode(c.code) ? c.code : estUnCode(c.error) ? (c.error as string) : undefined;

  // Le détail technique : tout ce que le serveur a écrit, sans doublon.
  const morceaux: string[] = [];
  const ajouter = (v: unknown) => {
    const s = chaine(v);
    if (s && !morceaux.includes(s)) morceaux.push(s);
  };
  if (statut) ajouter(`HTTP ${statut}`);
  if (code) ajouter(code);
  ajouter(c.message);
  ajouter(c.detail);
  if (!estUnCode(c.error)) ajouter(c.error);
  ajouter(c.cause);
  ajouter(c.upstream_message);
  if (!Object.keys(c).length) {
    const texte = chaine(brut);
    if (texte && !texte.startsWith('<')) ajouter(texte);
  }
  let detail = morceaux.join(' — ');
  if (detail.length > 600) detail = detail.slice(0, 600) + '…';

  const duClient = traductionDuCode(code, c.params);
  if (duClient) return { message: duClient, detail, code };

  const phrase = chaine(c.message);
  if (phrase && (chaine(c.message_key) || (code && CODES_DEJA_TRADUITS.has(code)))) {
    return { message: phrase, detail, code };
  }

  return { message: get(t)(CLE_GENERIQUE), detail, code };
}

/**
 * Le message est-il le générique ? Un écran qui a sa propre phrase de repli
 * (« Erreur de lecture ») ne lui accole pas « Le serveur n'a pas pu traiter
 * la demande » : ce serait dire deux fois la même chose.
 */
export function estMessageGenerique(m: unknown): boolean {
  return typeof m === 'string' && m.trim() === get(t)(CLE_GENERIQUE).trim();
}

/**
 * Le texte d'un événement `zone.playback_error` : même règle, repli sur la
 * clé donnée (l'échec de lecture générique).
 */
export function lireEvenementErreur(
  data: Record<string, unknown> | null | undefined,
  cleRepli: string,
): MessageServeur {
  const lu = lireMessageServeur(data ?? {});
  if (lu.message === get(t)(CLE_GENERIQUE)) return { ...lu, message: get(t)(cleRepli) };
  return lu;
}
