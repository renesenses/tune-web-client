/**
 * Ajouter un dossier de musique sans risquer d'avaler un disque entier, et
 * le retirer sans détour (fil forum 2171).
 *
 * « sur les dernières versions il faut saisir un chemin exact […] une juste
 * une petite erreur m'a généré le chargement non désiré d'un disque SSD en
 * entier (1 To) dans la bibliothèque ».
 *
 * Deux défauts se composaient :
 *
 * 1. le sélecteur de dossier de l'ancienne interface (`FolderWizard`) est
 *    parti avec elle ; il ne restait qu'un champ texte, et `POST
 *    /system/music-dirs` lance l'analyse sur-le-champ ;
 * 2. le retrait (la croix) ne retirait que le DOSSIER des réglages : la
 *    question « retirer aussi ses pistes ? » (`purgeOrphelines`, #2149) n'était
 *    plus posée par aucun écran, si bien que les pistes du disque restaient
 *    dans la bibliothèque, hors de portée du scan, pour toujours.
 *
 * Ce module porte les deux gestes, dépendances injectées : il se teste sans
 * serveur ni boîte de dialogue.
 */
import {
  purgeAProposer,
  questionDePurge,
  verdictDePurge,
  verdictDeRefus,
  type RetraitDossier,
  type Traduire,
  type Verdict,
} from './purgeOrphelines';

/** Ce que rend `GET /system/browse-dirs/estimate?path=`. */
export interface EstimationDossier {
  path?: string;
  audio_files?: number;
  folders?: number;
  /** `false` : le comptage s'est arrêté sur une borne, les nombres sont des minimums. */
  complete?: boolean;
  drive_root?: boolean;
  error?: string;
}

/**
 * Au-delà de ce nombre de fichiers audio, l'ajout demande confirmation même
 * s'il ne vise pas une racine de disque. Une grosse bibliothèque légitime le
 * dépasse : la question ne coûte alors qu'un clic.
 */
export const SEUIL_FICHIERS_AUDIO = 20_000;

/**
 * Le chemin désigne-t-il un disque ENTIER ?
 *
 * Racine du système (`/`), racine de lecteur Windows (`D:\`), racine de
 * partage UNC (`\\nas\musique`), ou point de montage usuel d'un disque
 * externe (`/Volumes/SSD`, `/mnt/ssd`, `/media/ssd`, `/media/moi/ssd`,
 * `/run/media/moi/ssd`).
 */
export function estUneRacineDeVolume(chemin: string): boolean {
  const c = chemin.trim();
  if (!c) return false;
  if (/^[\\/]+$/.test(c)) return true;
  if (/^[A-Za-z]:[\\/]*$/.test(c)) return true;
  if (/^\\\\[^\\/]+[\\/][^\\/]+[\\/]*$/.test(c)) return true;
  const segments = c.split('/').filter(Boolean);
  if (!c.startsWith('/') || segments.length === 0) return false;
  const [tete] = segments;
  if (tete === 'Volumes' || tete === 'mnt') return segments.length === 2;
  if (tete === 'media') return segments.length === 2 || segments.length === 3;
  if (tete === 'run' && segments[1] === 'media') return segments.length === 4;
  return false;
}

function entier(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function interpoler(modele: string, vars: Record<string, string>): string {
  let s = modele;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

/** L'ajout de `chemin` doit-il être confirmé ? */
export function faitConfirmer(chemin: string, est: EstimationDossier | null): boolean {
  if (estUneRacineDeVolume(chemin) || est?.drive_root === true) return true;
  if (!est || est.error) return false;
  if (est.complete === false) return true;
  return entier(est.audio_files) >= SEUIL_FICHIERS_AUDIO;
}

/**
 * La question posée avant l'ajout. Elle dit ce qui va être analysé, avec le
 * nombre quand le serveur a pu le mesurer, et rappelle que le geste se défait.
 */
export function questionAvantAjout(
  chemin: string,
  est: EstimationDossier | null,
  tr: Traduire,
  nombre: (n: number) => string = String,
): string {
  const racine = estUneRacineDeVolume(chemin) || est?.drive_root === true;
  const phrases = [
    interpoler(tr(racine ? 'settings.addFolderDriveRoot' : 'settings.addFolderLarge'), { path: chemin }),
  ];
  if (est && !est.error && typeof est.audio_files === 'number') {
    const vars = { count: nombre(entier(est.audio_files)), folders: nombre(entier(est.folders)) };
    phrases.push(
      interpoler(tr(est.complete === false ? 'settings.addFolderCountAtLeast' : 'settings.addFolderCount'), vars),
    );
  }
  phrases.push(tr('settings.addFolderConfirm'));
  return phrases.join(' ');
}

export interface DependancesAjout {
  estimer: (chemin: string) => Promise<EstimationDossier>;
  ajouter: (chemin: string) => Promise<{ music_dirs: string[] }>;
  confirmer: (message: string) => Promise<boolean>;
  tr: Traduire;
  nombre?: (n: number) => string;
}

/**
 * Ajoute `chemin` après la confirmation qu'il mérite. Rend `null` si
 * l'utilisateur renonce. Un serveur sans route de comptage (antérieur) ou un
 * comptage refusé n'empêche rien : la racine de disque reste détectée ici.
 */
export async function ajouterUnDossier(
  chemin: string,
  d: DependancesAjout,
): Promise<{ music_dirs: string[] } | null> {
  let est: EstimationDossier | null = null;
  try {
    est = await d.estimer(chemin);
  } catch {
    est = null;
  }
  if (faitConfirmer(chemin, est) && !(await d.confirmer(questionAvantAjout(chemin, est, d.tr, d.nombre)))) {
    return null;
  }
  return d.ajouter(chemin);
}

export interface DependancesRetrait {
  retirer: (chemin: string, confirmPurge?: number) => Promise<RetraitDossier & { music_dirs: string[] }>;
  confirmer: (message: string) => Promise<boolean>;
  annoncer: (v: Verdict) => void;
  tr: Traduire;
}

/**
 * « Retirer de la bibliothèque » : retire le dossier des réglages, puis, s'il
 * laisse des pistes derrière lui, propose de les retirer aussi (#2149). Les
 * fichiers ne sont jamais touchés, et la question le dit.
 */
export async function retirerUnDossier(chemin: string, d: DependancesRetrait): Promise<string[]> {
  const rep = await d.retirer(chemin);
  const n = purgeAProposer(rep);
  if (n === 0) return rep.music_dirs;
  if (!(await d.confirmer(questionDePurge(rep, d.tr)))) {
    d.annoncer(verdictDeRefus(rep, d.tr));
    return rep.music_dirs;
  }
  const purge = await d.retirer(chemin, n);
  d.annoncer(verdictDePurge(purge, d.tr));
  return purge.music_dirs;
}
