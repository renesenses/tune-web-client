/**
 * Le bandeau de l'accueil : saluer la personne, au lieu de nommer la page.
 *
 * Bertrand, 03/09/2026 : « remplace "Votre page" par Bonjour ou bonsoir
 * username ! ».
 *
 * Deux décisions y sont enfermées, et aucune des deux n'est cosmétique.
 *
 * ## D'où vient le nom
 *
 * Tune connaît DEUX identités, et elles ne disent pas la même chose :
 *
 *  - le PROFIL local (`/profiles`) — qui écoute sur ce serveur. C'est lui qui
 *    porte la disposition de l'accueil, donc lui que « Votre page » désignait ;
 *  - le compte NUAGE (`/cloud/sso/status`) — qui possède la licence.
 *
 * Le profil prime, sauf quand c'est celui que le serveur sème lui-même à
 * l'installation : `INSERT OR IGNORE INTO profiles … VALUES (1, 'default',
 * 'Default', 1)`. « Bonsoir Default ! » ne salue personne. On retombe alors sur
 * le nom du compte nuage, et faute des deux on ne salue PERSONNE PAR SON NOM —
 * inventer un prénom serait pire que ne pas en dire.
 *
 * ## Bonjour ou bonsoir
 *
 * La bascule est à 18 h, heure LOCALE de la machine qui affiche — c'est l'heure
 * qu'a sous les yeux la personne saluée, pas celle du serveur, qui peut être
 * dans un autre fuseau.
 */

/** Le profil, réduit à ce qui sert ici. */
export interface ProfilNommable {
  id?: number | null;
  name?: string | null;
  display_name?: string | null;
}

/** Le profil 1, créé d'office par le serveur (`DEFAULT_PROFILE_ID`). */
const ID_SEME = 1;

/**
 * Ce profil est-il celui que le serveur a créé d'office, jamais renommé ?
 *
 * Deux générations de serveur :
 *  - avant la rc14 : `default` / `Default` ;
 *  - rc14 (tune-server-rust#9562) : `admin` / `Admin`, seulement s'il portait
 *    encore le nom d'origine.
 *
 * `default` seul suffit (aucun autre profil ne le porte). `admin` exige le
 * nom affiché d'origine `Admin` : un profil que la personne a renommé (ou un
 * profil d'id ≠ 1 appelé `admin`) garde son nom. L'id 1 sert de garde quand
 * il est connu, comme `stores/profile.ts`.
 */
export function estProfilSeme(profil: ProfilNommable | null | undefined): boolean {
  const nom = (profil?.name ?? '').trim().toLowerCase();
  if (nom === 'default') return true;
  if (nom !== 'admin') return false;
  if (profil?.id != null && profil.id !== ID_SEME) return false;
  return (profil?.display_name ?? '').trim() === 'Admin';
}

/**
 * Le nom à afficher, ou `null` quand on n'en tient aucun de personne.
 *
 * ⚠️ Un `display_name` vide ou fait d'espaces n'est pas un nom : il donnerait
 * « Bonsoir  ! », qui se lit comme un défaut d'affichage.
 */
export function nomASaluer(
  profil: ProfilNommable | null | undefined,
  nomNuage?: string | null,
): string | null {
  const propre = (s: string | null | undefined) => (s ?? '').trim() || null;
  if (!estProfilSeme(profil)) {
    const duProfil = propre(profil?.display_name);
    if (duProfil) return duProfil;
  }
  return propre(nomNuage);
}

/** La clé de traduction du salut, selon l'heure locale et le nom connu. */
export function cleSalutation(heure: number, avecNom: boolean): string {
  const soir = heure >= 18 || heure < 5;
  if (soir) return avecNom ? 'v2.home.greetEvening' : 'v2.home.greetEveningPlain';
  return avecNom ? 'v2.home.greetDay' : 'v2.home.greetDayPlain';
}

/**
 * Le bandeau, prêt à afficher.
 *
 * `traduire` est passé plutôt qu'importé : ce module reste lisible sans
 * magasin Svelte, et le test le tient sans monter l'application.
 */
export function salutation(
  traduire: (cle: string) => string,
  profil: ProfilNommable | null | undefined,
  nomNuage: string | null | undefined,
  heure: number,
): string {
  const nom = nomASaluer(profil, nomNuage);
  const modele = traduire(cleSalutation(heure, nom != null));
  return nom != null ? modele.replace('{nom}', nom) : modele;
}
