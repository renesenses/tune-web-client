import { notifications } from './stores/notifications';
import { detailServeur, estMessageGenerique, estUnCode } from './messageServeur';

/**
 * Un échec montré à l'écran : la PHRASE de l'écran, traduite, et le texte
 * brut de l'exception replié dans « Détails ».
 *
 * 🔴 LE DÉFAUT (08/11/2026). Une centaine d'écrans écrivaient
 * `notifications.error(\`${$t('x')} : ${e?.message || e}\`)` ou
 * `notifications.error(e?.message ?? $t('x'))`. Le texte de l'exception vient
 * du navigateur (« Failed to fetch », « Load failed »), d'un `throw` local,
 * ou du serveur par `api/_client.ts` : en anglais ou en français, quelle que
 * soit la langue choisie, et collé au message principal.
 *
 * LA RÈGLE.
 *
 *  - Le message est la phrase de l'écran.
 *  - Si l'erreur porte un MOTIF CONNU — une `ApiError` d'`api.ts`, dont le
 *    message est déjà la traduction du code ou la phrase que le serveur dit
 *    avoir traduite (`messageServeur.ts`, #2417) — ce motif est gardé :
 *    collé à la phrase (`Phrase : motif`), ou seul (`motifSeul`) là où
 *    l'écran le montrait déjà seul.
 *  - Tout le reste part dans `detail`, que le bandeau replie.
 */

interface ErreurLue {
  message?: unknown;
  status?: unknown;
  detail?: unknown;
  code?: unknown;
}

/** Messages-sentinelles d'`api.ts`, levés avant toute traduction. */
const SENTINELLES = new Set(['Session expired', 'premium_required']);

/**
 * Le motif traduit que porte l'erreur, ou `null`.
 *
 * Seule une erreur qui a traversé `api.ts` (elle porte un `status`) a un
 * message traduit. Le générique « le serveur n'a pas pu traiter la demande »
 * n'apprend rien de plus que la phrase de l'écran : il est écarté aussi.
 */
export function motifConnu(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as ErreurLue;
  if (typeof o.status !== 'number' || o.status === 401) return null;
  const m = typeof o.message === 'string' ? o.message.trim() : '';
  if (!m || SENTINELLES.has(m) || estUnCode(m) || estMessageGenerique(m)) return null;
  return m;
}

/** Le texte brut de l'erreur, pour le « Détails » replié (vide si rien). */
export function detailErreur(e: unknown): string {
  if (e == null) return '';
  const morceaux: string[] = [];
  const ajouter = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s && !morceaux.includes(s)) morceaux.push(s);
  };
  ajouter(detailServeur(e));
  if (typeof e === 'object') {
    const m = (e as ErreurLue).message;
    if (typeof m === 'string' && m.trim() !== motifConnu(e) && !estMessageGenerique(m)) ajouter(m);
  } else {
    ajouter(String(e));
  }
  return morceaux.join(' — ');
}

export interface OptionsErreur {
  /** Le motif connu remplace la phrase au lieu de s'y ajouter. */
  motifSeul?: boolean;
  /** Durée d'affichage (ms), 5000 par défaut. */
  duree?: number;
}

/** Le message et le détail à montrer, sans les afficher. */
export function messageEtDetail(phrase: string, e: unknown, opts: OptionsErreur = {}): { message: string; detail: string } {
  const motif = motifConnu(e);
  let message = phrase;
  if (motif && motif !== phrase.trim()) message = opts.motifSeul ? motif : `${phrase} : ${motif}`;
  return { message, detail: detailErreur(e) };
}

/** Affiche l'échec : phrase traduite, motif connu éventuel, brut replié. */
export function notifierErreur(phrase: string, e: unknown, opts: OptionsErreur = {}): number {
  const { message, detail } = messageEtDetail(phrase, e, opts);
  return notifications.error(message, opts.duree ?? 5000, detail || undefined);
}
