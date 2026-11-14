/**
 * Les clés de `track_metadata` qui ne sont PAS des métadonnées de l'utilisateur.
 *
 * `GET /library/tracks/{id}/metadata` sert la table clé/valeur telle quelle.
 * Le serveur y range, à côté des balises lues dans le fichier (commentaire,
 * ISRC, numéro de catalogue…), ses propres témoins de travail : une piste
 * venue d'un serveur UPnP montrait ainsi, dans la section « Autres » de
 * l'inspecteur d'Oxygen, `mb_resolve_tried 1794043157`, `upnp_object_id
 * track/518665`, `upnp_res_url http://…/audio`, `upnp_serveur uuid:…`
 * (recette de Bertrand sur le .18, 14/11/2026).
 *
 * Les écrivains, relevés dans tune-server-rust (batch/bugs-rc12-20261108) :
 *
 * | clé(s)                                   | écrivain                          |
 * |------------------------------------------|-----------------------------------|
 * | `upnp_*`                                 | indexation UPnP (`indexation_upnp.rs`) — préfixe réservé, `PREFIXES_RESERVES` de `rattrapage_metadonnees_5043.rs` |
 * | `mb_resolve_tried`                       | résolution MusicBrainz (`community_sync.rs`) |
 * | `mb_extra_synced`, `mb_extra_pushed`     | synchronisation MusicBrainz       |
 * | `rg_analyzed`, `rg_path_unresolved`, `rg_skipped_oversized`, `rg_*_source`, `rg_algo`, `rg_true_peak_algo` | analyse ReplayGain |
 * | `dr_source`, `dr_indisponible`, `dr_algo` | mesure de plage dynamique        |
 * | `audio_embed_analyzed`, `audio_embed_path_unresolved` | empreintes audio     |
 * | `credits_source`                         | import des crédits                |
 * | `champs_tenus`                           | champs corrigés à la main (montrés, eux, par la Fiche technique) |
 *
 * Les MESURES restent visibles : `rg_track_gain`, `rg_album_peak`,
 * `dr_track`, `dr_album`… sont de vraies informations sur le signal. Seuls
 * leurs témoins (« analysé », « source », « algorithme ») sont écartés.
 *
 * Règles générales, pour que le prochain témoin ne réapparaisse pas en
 * silence : suffixes `_tried`, `_unresolved`, `_synced`, `_pushed`,
 * `_analyzed`, `_algo`. Le suffixe `_source` n'est écarté que sous les
 * préfixes des analyses (`rg_`, `dr_`, `credits_`) : `source_media` est une
 * vraie balise.
 */

const PREFIXES_INTERNES = ['upnp_', 'audio_embed_'] as const;

const CLES_INTERNES: ReadonlySet<string> = new Set([
  'mb_resolve_tried',
  'mb_extra_synced',
  'mb_extra_pushed',
  'rg_analyzed',
  'rg_path_unresolved',
  'rg_skipped_oversized',
  'rg_algo',
  'rg_true_peak_algo',
  'dr_source',
  'dr_indisponible',
  'dr_algo',
  'credits_source',
  'champs_tenus',
]);

const SUFFIXES_INTERNES = ['_tried', '_unresolved', '_synced', '_pushed', '_analyzed', '_algo'] as const;

/** Préfixes sous lesquels `*_source` dit d'où vient une mesure, pas une balise. */
const PREFIXES_SOURCE_DE_MESURE = ['rg_', 'dr_', 'credits_'] as const;

/** Cette clé de `track_metadata` est-elle un témoin interne du serveur ? */
export function estCleMetadonneeInterne(cle: string): boolean {
  const k = cle.trim().toLowerCase();
  if (CLES_INTERNES.has(k)) return true;
  if (PREFIXES_INTERNES.some((p) => k.startsWith(p))) return true;
  if (SUFFIXES_INTERNES.some((s) => k.endsWith(s))) return true;
  if (k.endsWith('_source') && PREFIXES_SOURCE_DE_MESURE.some((p) => k.startsWith(p))) return true;
  return false;
}

/** Les seules métadonnées à montrer à l'utilisateur, témoins internes retirés. */
export function metadonneesVisibles<T>(meta: Record<string, T> | null | undefined): Record<string, T> {
  const sortie: Record<string, T> = {};
  if (!meta || typeof meta !== 'object') return sortie;
  for (const [cle, valeur] of Object.entries(meta)) {
    if (!estCleMetadonneeInterne(cle)) sortie[cle] = valeur;
  }
  return sortie;
}
