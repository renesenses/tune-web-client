/**
 * tune-server-rust#8676 — « Remplacer le chemin » d'un dossier de musique.
 *
 * Fil forum 2799 : une base restaurée depuis une autre machine garde les
 * chemins de cette machine (`/mnt/Music/…`) alors que la musique vit ici sous
 * un autre (`/media/nas/Musique/…`). Rescanner recréerait toutes les pistes
 * sous de nouveaux identifiants, et écoutes, notes, favoris et listes de
 * lecture resteraient sur les anciennes. Le serveur réécrit le préfixe des
 * chemins stockés, en une transaction.
 *
 * Le geste est en deux temps : l'APERÇU (combien de pistes, combien
 * retrouvées sur le disque au nouveau chemin, exemples manquants), puis la
 * CONFIRMATION, qui renvoie le nombre de pistes montré — le serveur refuse si
 * la bibliothèque a changé entre-temps.
 *
 * Ce module ne parle qu'au travers de dépendances injectées : il se teste sans
 * serveur.
 */

/** Codes de refus du serveur (`deplacer_racine::Refus`). */
export type RefusDeplacement =
  | 'invalid_prefix'
  | 'same_prefix'
  | 'no_tracks'
  | 'none_found'
  | 'conflicts';

export interface ExempleDeplacement {
  old: string;
  new: string;
}

/** Réponse de `POST /system/music-dirs/move/preview`. */
export interface ApercuDeplacement {
  old_prefix?: string;
  new_prefix?: string;
  tracks?: number;
  checked?: number;
  found?: number;
  missing?: number;
  sampled?: boolean;
  missing_examples?: ExempleDeplacement[];
  conflicts?: number;
  conflict_examples?: string[];
  settings?: { key: string }[];
  refusal?: RefusDeplacement | null;
  can_apply?: boolean;
  error?: string;
}

/** Réponse de `POST /system/music-dirs/move`. */
export interface BilanDeplacement extends ApercuDeplacement {
  applied?: boolean;
  tracks_updated?: number;
  dirs?: string[];
  reverse?: { old_prefix: string; new_prefix: string };
  confirm_tracks_required?: number;
}

export type Traduire = (cle: string) => string;

function entier(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function interpoler(modele: string, vars: Record<string, string>): string {
  let s = modele;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

/** Le message d'un refus, ou `null` si la réponse n'en porte pas. */
export function messageDeRefus(
  r: BilanDeplacement | null | undefined,
  tr: Traduire,
  nombre: (n: number) => string = String,
): string | null {
  if (!r) return null;
  switch (r.refusal) {
    case 'invalid_prefix':
    case 'same_prefix':
      return tr('settings.moveFolderRefusInvalid');
    case 'no_tracks':
      return interpoler(tr('settings.moveFolderRefusNoTracks'), { old: r.old_prefix ?? '' });
    case 'none_found':
      return interpoler(tr('settings.moveFolderRefusNoneFound'), { new: r.new_prefix ?? '' });
    case 'conflicts':
      return interpoler(tr('settings.moveFolderRefusConflicts'), { count: nombre(entier(r.conflicts)) });
    default:
      break;
  }
  if (r.error === 'scan_running') return tr('settings.moveFolderRefusScan');
  if (r.error === 'confirmation_mismatch') return tr('settings.moveFolderRefusStale');
  if (r.error) return interpoler(tr('settings.moveFolderError'), { error: r.error });
  return null;
}

/** Ce que l'écran montre d'un aperçu applicable. */
export interface LignesDApercu {
  resume: string;
  echantillon: string | null;
  manquants: string[];
}

export function lignesDApercu(
  a: ApercuDeplacement,
  tr: Traduire,
  nombre: (n: number) => string = String,
): LignesDApercu {
  return {
    resume: interpoler(tr('settings.moveFolderSummary'), {
      tracks: nombre(entier(a.tracks)),
      old: a.old_prefix ?? '',
      found: nombre(entier(a.found)),
      checked: nombre(entier(a.checked)),
      new: a.new_prefix ?? '',
    }),
    echantillon: a.sampled ? tr('settings.moveFolderSampled') : null,
    manquants: (a.missing_examples ?? []).map((e) => e.new),
  };
}

/** Le message de fin d'une application réussie, avec le geste inverse. */
export function messageDeFin(b: BilanDeplacement, tr: Traduire, nombre: (n: number) => string = String): string {
  return interpoler(tr('settings.moveFolderDone'), {
    count: nombre(entier(b.tracks_updated)),
    new: b.new_prefix ?? '',
    old: b.old_prefix ?? '',
  });
}

/** L'application est-elle réussie ? */
export function estApplique(b: BilanDeplacement | null | undefined): boolean {
  return !!b && b.applied === true;
}
