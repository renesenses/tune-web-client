/**
 * Découper une adresse de partage réseau telle qu'un utilisateur la donne.
 *
 * Le champ « adresse » de l'assistant SMB attend un **hôte**. Les gens y
 * collent ce qu'ils avaient sous Windows : le chemin complet, partage et
 * sous-dossier compris. C'était accepté sans broncher — la chaîne entière
 * partait comme nom d'hôte, puis l'assistant lui concaténait le partage
 * choisi, et la cible devenait
 *
 *     \\192.168.1.159\344207a4420769c6\Musique\/344207A4420769C6
 *
 * qui ne désigne rien. « Échec de la connexion », sans que rien à l'écran ne
 * laisse deviner que le champ avait été mal compris (Benjithom, sur Tune OS,
 * tune-server-rust#1846).
 *
 * On extrait donc l'hôte, et on garde le reste : ce que l'utilisateur a tapé
 * après l'hôte est très probablement le partage et le dossier qu'il vise, et
 * cela vaut mieux que de le jeter.
 */
export interface SmbAddress {
  /** L'hôte seul : `192.168.1.159`, `nas.local`, `MONSERVEUR`. */
  host: string;
  /** Le premier segment après l'hôte, s'il y en a un — le partage. */
  share?: string;
  /** Ce qui suit le partage, séparateurs normalisés en `/`. */
  path?: string;
}

/**
 * Accepte `192.168.1.159`, `\\192.168.1.159`, `//nas.local/Musique`,
 * `smb://nas/Musique/Albums`, `\\nas\Musique\Albums\`, et les mélanges.
 * Renvoie `null` si rien d'exploitable ne subsiste.
 */
export function parseSmbAddress(saisie: string): SmbAddress | null {
  let reste = (saisie ?? '').trim();
  if (!reste) return null;

  // Schéma éventuel (`smb://`, `cifs://`), puis séparateurs unifiés.
  reste = reste.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  reste = reste.replace(/\\/g, '/');

  // Les préfixes UNC et les séparateurs superflus.
  const segments = reste.split('/').filter((s) => s.length > 0);
  const host = segments.shift();
  if (!host) return null;

  const adresse: SmbAddress = { host };
  if (segments.length > 0) {
    adresse.share = segments.shift();
    if (segments.length > 0) adresse.path = segments.join('/');
  }
  return adresse;
}
