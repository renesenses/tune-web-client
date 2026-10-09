import type { OubliPartage, SmbMount } from './api';

/**
 * Ce qu'il faut afficher pour un partage SMB.
 *
 * Extrait du gabarit pour une raison précise : c'est ici que se joue la
 * distinction qui a coûté #1916, et un gabarit ne se teste pas.
 *
 * ## `active` n'est PAS `mounted`
 *
 * - `active`      : l'INTENTION de l'utilisateur — « ce partage doit être monté » ;
 * - `mount_state` : le CONSTAT du dernier essai au démarrage ;
 * - `mounted`     : vérifié à l'instant sur le système de fichiers.
 *
 * Avant la v0.9.91, seul `active` existait. L'interface affichait donc les
 * partages d'Éric (`ricouxxx`) comme montés alors que leur remontage avait
 * échoué : la bibliothèque s'affichait — les pistes sont en base — et seule la
 * lecture échouait, sur une erreur réseau qui ne nommait jamais la cause. Il a
 * trouvé le contournement seul, sur un forum public.
 *
 * **Dériver l'état affiché de `active` rouvrirait ce défaut.** C'est ce que ce
 * module et ses tests empêchent.
 */
export interface EtatPartage {
  /** Le partage n'est pas monté, quelle que soit l'intention. */
  enEchec: boolean;
  /** Afficher le badge « SMB 1.0 » — protocole obsolète et non chiffré. */
  signalerSmb1: boolean;
  /** La cause à montrer, ou `null` s'il n'y a rien d'utile à dire. */
  cause: string | null;
}

export function etatPartage(m: SmbMount): EtatPartage {
  // `mounted` est le constat de l'instant : il prime sur `mount_state`, qui
  // date du dernier essai. Un NAS rallumé et remonté à la main doit apparaître
  // monté, même si le démarrage s'était soldé par un échec.
  const enEchec = !m.mounted;

  return {
    enEchec,
    signalerSmb1: m.smb_version === '1.0',
    // Une cause n'a de sens que sur un partage en échec. L'afficher sur un
    // partage qui marche montrerait une erreur périmée — celle d'un essai que
    // le suivant a réparé.
    cause: enEchec && m.last_mount_error ? m.last_mount_error : null,
  };
}

/** Un chemin sans sa barre finale, pour comparer des racines. */
function sansBarreFinale(p: string): string {
  const t = p.trim().replace(/[\\/]+$/, '');
  return t === '' ? p.trim() : t;
}

/** `enfant` est-il `parent` ou un dossier en dessous ? */
function sous(enfant: string, parent: string): boolean {
  const e = sansBarreFinale(enfant);
  const p = sansBarreFinale(parent);
  return e === p || e.startsWith(p + '/') || e.startsWith(p + '\\');
}

/**
 * Fil 2145 (Daniel Levy) — la racine de ce partage est-elle déjà lue par la
 * bibliothèque ?
 *
 * Oui si un dossier déclaré est le point de montage, un dossier en dessous, ou
 * un dossier au-dessus. Proposer « Ajouter à la bibliothèque » dans ces deux
 * derniers cas ferait lire deux fois la même musique.
 */
export function racineDeclaree(m: SmbMount, musicDirs: string[]): boolean {
  const point = m.mount_path;
  if (!point) return true; // rien à proposer sans chemin
  return musicDirs.some((d) => sous(d, point) || sous(point, d));
}

/**
 * « Ajouter à la bibliothèque » s'affiche sur un partage MONTÉ dont la racine
 * n'est pas déclarée — le cas de Daniel : monté à chaque démarrage, jamais lu.
 */
export function proposerAjout(m: SmbMount, musicDirs: string[]): boolean {
  return m.mounted && !racineDeclaree(m, musicDirs);
}

/**
 * Fil 2145 (web#1935) — pourquoi la bibliothèque est-elle vide ?
 *
 * La vue Bibliothèque disait seulement « Votre bibliothèque est vide. » à un
 * utilisateur dont le partage était monté, mais dont aucun dossier n'était
 * déclaré : il a conclu à une perte de sa musique. La cause se lit pourtant
 * dans deux listes que le client possède déjà.
 *
 * - `partageNonDeclare` : au moins un partage MONTÉ dont la racine n'est pas
 *   déclarée (même règle que « Ajouter à la bibliothèque », `proposerAjout`).
 *   `partages` les nomme, `\\serveur\partage`.
 * - `aucunDossier` : aucun dossier déclaré, et aucun partage à proposer.
 * - `null` : des dossiers sont déclarés et tous les partages montés sont lus ;
 *   la bibliothèque est vide pour une autre raison (analyse pas encore faite,
 *   dossier sans musique), rien de plus précis à dire.
 */
export type CauseBibliothequeVide =
  | { cause: 'partageNonDeclare'; partages: string[] }
  | { cause: 'aucunDossier' };

export function causeBibliothequeVide(
  musicDirs: string[],
  partages: SmbMount[],
): CauseBibliothequeVide | null {
  const nonLus = partages.filter((m) => proposerAjout(m, musicDirs));
  if (nonLus.length) {
    return { cause: 'partageNonDeclare', partages: nonLus.map((m) => `\\\\${m.server}\\${m.share}`) };
  }
  if (!musicDirs.length) return { cause: 'aucunDossier' };
  return null;
}

/**
 * « Oublier ce partage » : premier appel sans confirmation ; si le serveur
 * répond que des dossiers de la bibliothèque en dépendent, on les montre à
 * l'utilisateur, qui peut aussi les retirer de la bibliothèque (case cochée
 * par défaut, décision de Bertrand du 05/10), avec la purge habituelle de
 * leurs pistes. Décoché, ils restent déclarés.
 *
 * Rend la réponse finale du serveur, ou `null` si l'utilisateur a renoncé.
 * Une autre erreur (démontage refusé…) est levée avec le message du serveur.
 */
export async function oublierUnPartage(
  id: number,
  oublier: (id: number, confirmer: boolean, retirer?: { pistes: number }) => Promise<OubliPartage>,
  confirmer: (racines: string[], pistes: number) => Promise<{ coche: boolean } | null>,
): Promise<OubliPartage | null> {
  let r = await oublier(id, false);
  if (r?.error === 'racines_dependantes') {
    const pistes = r.pistes ?? 0;
    const reponse = await confirmer(r.racines ?? [], pistes);
    if (!reponse) return null;
    r = await oublier(id, true, reponse.coche ? { pistes } : undefined);
  }
  if (!r?.oublie) throw new Error(r?.message || r?.error || 'forget failed');
  return r;
}
