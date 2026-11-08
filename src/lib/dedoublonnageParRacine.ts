/**
 * « Ne regrouper que les copies d'un même dossier de musique » —
 * Réglages › Bibliothèque › Nettoyage du serveur. tune-server-rust#6917.
 *
 * Un disque dur et un NAS présentent le même fichier, octet pour octet. Par
 * défaut, Tune n'en garde qu'UNE entrée dans la bibliothèque : le scan fait de
 * la seconde copie un exemplaire de la première, et « Nettoyage du serveur »
 * (`POST /system/cleanup`) retire la ligne en double. Le serveur
 * (`tune_core::library::dedoublonnage_par_racine`) lit la clé
 * {@link CLE_DEDOUBLONNAGE_PAR_RACINE} : allumée, deux copies identiques ne se
 * replient l'une sur l'autre que si elles vivent sous la même racine de
 * musique (`music_dirs`). Aucun fichier n'est jamais effacé.
 *
 * Lecture : `GET /system/config` (publiée même absente de la base, défaut
 * `false`). Écriture : `PATCH /system/config { library_dedup_same_root_only:
 * true | false }` — toute autre valeur est refusée en 400.
 */
export const CLE_DEDOUBLONNAGE_PAR_RACINE = 'library_dedup_same_root_only';

/**
 * La valeur publiée, lue comme le serveur la lit (`depuis_valeur`) : seules les
 * formes « vraies » usuelles allument l'option ; absente ou illisible, éteinte.
 */
export function dedoublonnageParRacineDepuisConfig(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    return ['true', '1', 'yes', 'on'].includes(v.trim().replace(/^"|"$/g, '').toLowerCase());
  }
  return false;
}
