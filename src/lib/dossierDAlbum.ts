/**
 * Où vit un album sur le disque — #1156.
 *
 * Tades, fil 1677 (06/09/2026) : « J'aurais aimé trouver une fonction
 * "afficher dans le dossier d'origine" afin de prendre une décision en
 * connaissance de cause. » Le premier point de son message — le format
 * d'origine — est traité depuis (le badge de qualité sur chaque vignette).
 * Le second ne l'était pas : l'écran propose de convertir sans jamais dire
 * D'OÙ.
 *
 * 🔴 `Album` ne porte PAS de chemin. Mesuré sur le .18 :
 * `GET /library/albums` rend `cover_path`, et c'est un HACHAGE
 * (`f7c037a9fb1fff61ffedf708bfebcecd`), pas un chemin de fichier — en tirer un
 * dossier ne donnerait rien. Le chemin vit sur la PISTE :
 * `GET /library/albums/{id}/tracks` rend `file_path`
 * (`/data/music/NEW_FLAC/ELECTRO/Enigma/…/01. The Voice Of Enigma.mp3`).
 *
 * Une page web ne peut pas ouvrir l'explorateur de fichiers du serveur — et le
 * serveur n'est même pas toujours la machine de l'utilisateur. Ce qu'on peut
 * faire, et qui suffit à décider, c'est NOMMER le dossier.
 */

/** Le dossier d'un chemin, quel que soit le séparateur. `null` si on ne peut
 *  rien en dire — mieux vaut ne rien afficher qu'un chemin inventé. */
export function dossierDuFichier(chemin: unknown): string | null {
  if (typeof chemin !== 'string') return null;
  const c = chemin.trim();
  if (!c) return null;
  // Windows et POSIX dans la même bibliothèque : le serveur rend le chemin tel
  // qu'il l'a lu, et une part des testeurs tourne sous Windows.
  const i = Math.max(c.lastIndexOf('/'), c.lastIndexOf('\\'));
  if (i <= 0) return null;
  return c.slice(0, i);
}

/**
 * Le dossier d'un ALBUM, à partir des chemins de ses pistes.
 *
 * 🔴 Un album n'est pas toujours dans UN dossier : un coffret se range souvent
 * en `CD1/`, `CD2/`… Rendre le dossier de la première piste dirait alors
 * « CD1 » pour l'album entier — faux, et trompeur au moment de décider. Quand
 * les pistes divergent, on remonte au PARENT COMMUN.
 */
export function dossierDeLAlbum(chemins: readonly unknown[]): string | null {
  const dossiers = [...new Set(
    chemins.map(dossierDuFichier).filter((d): d is string => !!d),
  )];
  if (!dossiers.length) return null;
  if (dossiers.length === 1) return dossiers[0];
  return prefixeCommun(dossiers);
}

/**
 * Le plus long préfixe de dossier commun — par SEGMENT, jamais par caractère.
 *
 * Par caractère, `/m/Album Live` et `/m/Album Studio` rendraient
 * `/m/Album ` : un dossier qui n'existe pas.
 */
export function prefixeCommun(dossiers: readonly string[]): string | null {
  if (!dossiers.length) return null;
  const sep = dossiers[0].includes('\\') && !dossiers[0].includes('/') ? '\\' : '/';
  const parts = dossiers.map((d) => d.split(/[\\/]/));
  const commun: string[] = [];
  for (let i = 0; i < parts[0].length; i++) {
    const s = parts[0][i];
    if (!parts.every((p) => p[i] === s)) break;
    commun.push(s);
  }
  // `['', 'data', 'music']` → `/data/music` : le premier segment vide EST la
  // racine POSIX, la jointure la restitue.
  if (commun.length <= 1) return null;
  return commun.join(sep);
}
