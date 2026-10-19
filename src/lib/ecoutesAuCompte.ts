/**
 * « Mes écoutes, tous serveurs » (renesenses/tune-server-rust#6510).
 *
 * Le serveur pousse ses écoutes au compte mozaiklabs.fr qui le possède, si et
 * seulement si l'utilisateur coche « Envoyer mes écoutes à mon compte ». Ce
 * réglage est lu par `GET /system/config` (le serveur le publie avec son
 * défaut `false`) et écrit par `PATCH /system/config`, comme les bascules du
 * partage communautaire. Le site additionne les écoutes de tous les serveurs
 * du compte sur sa page « Mes écoutes ».
 */

/** Clé du réglage serveur (`tune_core::cloud::ecoutes_au_compte::CLE_ACTIVATION`). */
export const CLE_ECOUTES_AU_COMPTE = 'cloud_listens_upload_enabled';

/** La page du site qui montre les écoutes de tous les serveurs du compte. */
export const URL_MES_ECOUTES = 'https://mozaiklabs.fr/my-listens';
