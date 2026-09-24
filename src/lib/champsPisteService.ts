/**
 * « Tous les champs piste » pour une piste de SERVICE — fil forum 1906
 * (FabienM, point 3).
 *
 * Le tiroir (`TrackTagsDrawer`) lisait les champs du FICHIER par
 * `GET /library/tracks/{id}/all-tags`, qui prend un `i64` de `tracks`. Un
 * titre Qobuz, Tidal, Bandcamp… n'en a pas : l'entrée était absente de son
 * menu, alors que le client tient déjà une bonne partie de ce qu'on peut en
 * dire (titre, artiste, album, numéros, durée, qualité, ISRC, identifiants).
 *
 * La RÈGLE — quelle piste y a droit, quels champs on montre — vit ici, une
 * fois, pour les deux menus (`v2/PisteActions`, `partages/MenuPisteV1`) : c'est
 * la leçon de `routageAlbum.albumDeServiceDe`, dont les deux copies avaient
 * divergé.
 *
 * Rien n'est inventé : on recopie les champs que la piste PORTE, puis on les
 * complète par `GET /streaming/{service}/tracks/{id}` (`get_track` du service,
 * un `StreamTrack`) quand le service sait répondre. Lecture seule : le
 * serveur n'a aucune route pour écrire les champs d'un titre de service.
 */
import { cibleDeService } from './cibleEtiquette';

/** Une piste désignée chez son service. */
export interface PisteDeService {
  service: string;
  sourceId: string;
}

/**
 * La piste se désigne-t-elle chez un SERVICE ? `null` sinon.
 *
 * Même désignation que les étiquettes de service (#1238, `cibleDeService`) —
 * `source` normalisée, `source_id` non vide, source de bibliothèque exclue —
 * moins la RADIO : son `source_id` est l'adresse du flux, partagée par tous
 * les titres de la station, et aucune route de détail n'existe pour elle.
 */
export function pisteDeServiceDe(piste: unknown): PisteDeService | null {
  const c = cibleDeService('track', piste);
  if (!c || c.source === 'radio') return null;
  return { service: c.source, sourceId: c.sourceId };
}

/**
 * Champs propres au client, jamais servis par le serveur comme donnée de la
 * piste : ils n'ont rien à faire dans une fiche de champs.
 */
const CHAMPS_CLIENT_ECARTES: ReadonlySet<string> = new Set([
  // Identifiant de bibliothèque : `null` sur une piste de service.
  'id',
  // Objet de qualité : aplati plus bas en champs lisibles.
  'quality',
]);

function valeurMontrable(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0 && v.every((x) => x == null || typeof x !== 'object');
  return false;
}

/**
 * Les champs qu'une piste de service PORTE, prêts pour `grouperChampsPiste`.
 *
 * On recopie tout champ scalaire renseigné — le tiroir range ce qu'il ne
 * connaît pas dans « Autres champs » plutôt que de le taire. L'objet `quality`
 * d'un `StreamTrack` est aplati : `format`, `sample_rate`, `bit_depth`,
 * `channels` (quand `mapStreamingQuality` ne les a pas déjà posés) et
 * `bitrate`, qu'il est seul à porter.
 */
export function champsConnusDePisteService(piste: unknown): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  if (!piste || typeof piste !== 'object') return sortie;
  const p = piste as Record<string, unknown>;
  for (const [cle, v] of Object.entries(p)) {
    if (CHAMPS_CLIENT_ECARTES.has(cle) || cle.startsWith('_')) continue;
    if (valeurMontrable(v)) sortie[cle] = v;
  }
  const q = p.quality;
  if (q && typeof q === 'object') {
    const qq = q as Record<string, unknown>;
    const poser = (cle: string, v: unknown) => {
      if (!(cle in sortie) && valeurMontrable(v)) sortie[cle] = v;
    };
    poser('format', typeof qq.codec === 'string' ? qq.codec.toLowerCase() : qq.codec);
    poser('sample_rate', qq.sample_rate);
    poser('bit_depth', qq.bit_depth);
    poser('channels', qq.channels);
    poser('bitrate', qq.bitrate);
  } else if (typeof q === 'string') {
    // `Album.quality` / certaines pistes : une étiquette déjà lisible.
    if (q.trim() !== '') sortie.quality = q;
  }
  return sortie;
}

/**
 * Complète les champs connus par la réponse du service.
 *
 * Le service a le dernier mot sur ce qu'il renseigne ; un champ qu'il ne
 * renseigne pas ne gomme pas ce que le client savait. La SOURCE reste celle
 * de la piste : `StreamTrack` ne la sérialise pas.
 */
export function completerChampsService(
  connus: Record<string, unknown>,
  duService: unknown,
): Record<string, unknown> {
  const sortie = { ...connus, ...champsConnusDePisteService(duService) };
  if (connus.source != null) sortie.source = connus.source;
  return sortie;
}
