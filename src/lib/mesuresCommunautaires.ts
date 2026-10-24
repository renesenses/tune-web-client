/**
 * Résultats d'analyse partagés par la communauté
 * (renesenses/tune-server-rust#5594) : ReplayGain, plage dynamique et
 * empreinte acoustique, échangés par la clé PCM exacte des FLAC.
 *
 * Deux réglages serveur, DÉSACTIVÉS par défaut et indépendants :
 *  - recevoir : le serveur comble les analyses manquantes avec des valeurs
 *    mesurées par au moins deux autres installations sur le même signal ;
 *  - contribuer : le serveur envoie ses propres mesures, sans chemin, titre
 *    ni compte. Le couper fait effacer ce qui a été envoyé.
 *
 * Lus par `GET /system/config`, écrits par `PATCH`. Un serveur qui ne
 * publie pas la clé ne sait pas faire : pas de case.
 */

/** `tune_core::cloud::mesures_communautaires::CLE_RECEPTION`. */
export const CLE_RECEPTION_MESURES = 'community_measures_receive_enabled';
/** `tune_core::cloud::mesures_communautaires::CLE_CONTRIBUTION`. */
export const CLE_CONTRIBUTION_MESURES = 'community_measures_contribute_enabled';
