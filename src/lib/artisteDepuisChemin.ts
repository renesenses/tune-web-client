/**
 * Deviner l'artiste d'une piste à partir du chemin de son fichier.
 *
 * Mesuré sur la bibliothèque de Bertrand le 18/09/2026 : l'onglet « Albums
 * douteux » annonce 1 595 entrées — ce ne sont pas des albums mais des
 * **pistes**, et 1 592 pour une seule raison : l'artiste manque. 932 d'Art
 * Blakey, 445 de Prince : des captures de l'enregistreur (Tidal, Qobuz) qui
 * n'ont jamais porté d'étiquette.
 *
 * Trois sources possibles, mesurées :
 *
 * | source | couverture |
 * |---|---|
 * | le **dossier grand-parent** (`…/Prince/Ultimate/01 - ….m4a`) | **1 496 / 1 592** |
 * | l'artiste de l'album | 33 / 1 592 |
 * | le titre en « X - Y » | 79 / 1 592 — le reste est un numéro de piste |
 *
 * Le chemin gagne largement, et pour seulement **26 noms distincts** : on
 * valide 26 décisions, pas 1 496 lignes.
 */

/** Une piste que le serveur juge douteuse. */
export interface PisteDouteuse {
  id: number;
  /** Le serveur rend `Track::title`, jamais nul. */
  title: string;
  artist_name: string | null;
  album_title: string | null;
  duration_ms: number;
  reasons: string[];
  /** Le chemin sur le disque — c'est lui qui porte l'artiste manquant. */
  file_path?: string | null;
}

/** Le dossier parent d'un chemin, quel que soit le séparateur. */
function dossier(chemin: string): string {
  const i = Math.max(chemin.lastIndexOf('/'), chemin.lastIndexOf('\\'));
  return i > 0 ? chemin.slice(0, i) : '';
}

function feuille(chemin: string): string {
  const i = Math.max(chemin.lastIndexOf('/'), chemin.lastIndexOf('\\'));
  return i >= 0 ? chemin.slice(i + 1) : chemin;
}

/**
 * Le nom du dossier **grand-parent**, quand il peut être un artiste.
 *
 * Écarté, et pourquoi :
 *
 * - **vide ou d'un seul caractère** — une lettre d'index (`…/R/RH Factor/…`)
 *   n'est pas un nom ;
 * - **que des chiffres ou de la ponctuation** — « 2003 », « 01 » : une année
 *   ou un numéro de disque ;
 * - **identique au titre de l'album** — rangement `…/Album/CD1/piste`, où le
 *   grand-parent est l'album et non l'artiste.
 *
 * 🔴 Aucune liste de dossiers « à ignorer » n'est codée en dur. Sur le .18,
 * douze pistes rendent « NEW_FLAC », un dossier de genre — il apparaîtra comme
 * un groupe de douze que l'utilisateur décochera. C'est lui qui tranche : une
 * liste noire devinerait, et se tromperait chez quelqu'un d'autre.
 */
export function artisteDuChemin(
  chemin: string | null | undefined,
  titreAlbum?: string | null,
): string | null {
  if (!chemin) return null;
  const grandParent = feuille(dossier(dossier(chemin))).trim();
  if (grandParent.length < 2) return null;
  if (!/[\p{L}]/u.test(grandParent)) return null;
  if (titreAlbum && grandParent.toLowerCase() === titreAlbum.trim().toLowerCase()) return null;
  return grandParent;
}

/** Un nom deviné, et les pistes qu'il couvre. */
export interface GroupeArtisteDevine {
  nom: string;
  pistes: PisteDouteuse[];
}

/**
 * Les pistes sans artiste, groupées par nom deviné, les plus grosses d'abord.
 *
 * Seules les pistes dont l'artiste manque sont concernées : une piste courte
 * ou sans titre d'album a un autre problème, que ce geste ne règle pas.
 */
export function grouperParArtisteDevine(pistes: PisteDouteuse[]): GroupeArtisteDevine[] {
  const par = new Map<string, PisteDouteuse[]>();
  for (const p of pistes) {
    if (!p.reasons?.includes('missing_artist')) continue;
    const nom = artisteDuChemin(p.file_path, p.album_title);
    if (!nom) continue;
    const l = par.get(nom);
    if (l) l.push(p); else par.set(nom, [p]);
  }
  return [...par.entries()]
    .map(([nom, pistes]) => ({ nom, pistes }))
    .sort((x, y) => y.pistes.length - x.pistes.length || x.nom.localeCompare(y.nom));
}
