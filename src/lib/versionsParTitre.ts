/**
 * « Autres versions » d'une piste SANS identifiant de bibliothèque — par
 * rapprochement TITRE + ARTISTE.
 *
 * Décision de Bertrand, 23/09/2026 : l'entrée « Autres versions » doit AUSSI
 * apparaître sur une piste de SERVICE (Qobuz, Tidal, Deezer, Bandcamp,
 * YouTube, historique streaming), « par rapprochement titre + artiste,
 * résultats approximatifs acceptés ».
 *
 * ## Pourquoi côté CLIENT
 *
 * La seule route de versions, `GET /library/tracks/{id}/versions`
 * (`routes/versions.rs`), prend un `i64` de `tracks` : une piste de service
 * n'en a pas. Aucune route ne prend `title` + `artist` en entrée — vérifié
 * dans `api.ts` le 23/09/2026 : `other-versions` part de l'historique
 * d'écoute, `library/search` et `streaming/{s}/search` prennent un `q` libre.
 *
 * On COMPOSE donc : la recherche FÉDÉRÉE (`GET /search?q=`) rend en UN appel
 * les pistes locales ET celles de chaque service connecté — c'est le serveur
 * qui sait lesquels le sont — puis ce module ne garde que ce qui se rapproche
 * du titre ET de l'artiste, et le range dans la MÊME forme que la route par
 * piste (`OtherVersionGroup`), pour que `VersionsPistePanneau` n'ait qu'un
 * seul rendu.
 *
 * ## Le `q` envoyé est le TITRE seul
 *
 * La recherche locale et celles des services reçoivent la même chaîne. Un
 * `q` qui concatène titre et artiste rend beaucoup chez Qobuz, mais la
 * recherche locale n'a pas de contrat public sur les requêtes à plusieurs
 * termes : elle pourrait ne rien rendre. Le titre seul est ce que les DEUX
 * chemins serveur (`routes/versions.rs`, `/home/other-versions`) emploient
 * déjà comme clé de rapprochement ; l'artiste est filtré ICI.
 *
 * ## « Approximatif », précisément
 *
 * Titre : égal une fois normalisé (`rechercheRestreinte.normaliser` — bas de
 * casse, sans accents, ponctuation ramenée à une espace), OU égal une fois la
 * mention finale retirée — « Lovely Day (Remastered 2005) », « Lovely Day -
 * Live » rejoignent « Lovely Day » ; « Lovely Day Dream », non, c'est un autre
 * morceau. Artiste : égal une fois normalisé, OU l'un contient l'autre
 * — « Bill Withers » rejoint « Bill Withers feat. Grover Washington, Jr. ».
 * Un candidat SANS artiste est écarté : l'absence est une valeur, pas un
 * joker (même règle que `cleJumelage`).
 *
 * ## Ce que la liste ne contient JAMAIS
 *
 *  - la piste d'ORIGINE (même service, même `source_id`) : on cherche ses
 *    autres versions, pas elle ;
 *  - deux fois la même paire service + `source_id`.
 *
 * ## L'ordre
 *
 * L'ordre REÇU est conservé : la bibliothèque d'abord (tableau `versions`),
 * puis les services dans l'ordre où la réponse les énumère. Le panneau
 * applique ensuite `ordonnerVersionsService` (réglage « Ordre des autres
 * versions », tune-server-rust#4368), exactement comme pour la route par
 * piste. Aucun tri ici : voir la règle de stabilité dans `versionsPiste.ts`.
 *
 * ## Contrat serveur SOUHAITÉ
 *
 * `GET /library/versions?title=&artist=&source=&source_id=` — le rapprochement
 * de `routes/versions.rs` (ISRC, durées, barème #2372) appliqué à un titre
 * NOMMÉ plutôt qu'à un `i64`, avec le cache de six heures. Ce module en tient
 * lieu d'ici là ; le panneau ne verrait pas la différence.
 */
import * as api from './api';
import type { FederatedSearchResult, SearchResult, Track } from './types';
import { normaliser } from './rechercheRestreinte';
import { estDeBibliotheque } from './provenanceBibliotheque';

/** Ce qu'il faut pour rapprocher : le titre, l'artiste, et de quoi s'exclure. */
export interface CibleParTitre {
  titre: string;
  artiste: string;
  /** Le service de la piste d'origine, pour l'écarter des résultats. */
  source: string | null;
  source_id: string | null;
}

/**
 * La cible d'une piste, ou `null` quand le rapprochement n'a pas de sens :
 * une piste de la BIBLIOTHÈQUE (la route par `i64` fait mieux), une piste
 * sans titre, une piste sans artiste.
 */
export function cibleParTitre(
  piste: Pick<Track, 'id' | 'source' | 'source_id' | 'title' | 'artist_name' | 'album_artist'>,
): CibleParTitre | null {
  if (estDeBibliotheque(piste)) return null;
  const titre = (piste.title ?? '').trim();
  const artiste = ((piste.artist_name ?? '') || (piste.album_artist ?? '')).trim();
  if (!titre || !artiste) return null;
  return {
    titre,
    artiste,
    source: piste.source == null ? null : String(piste.source),
    source_id: piste.source_id == null ? null : String(piste.source_id),
  };
}

/**
 * Le titre SANS sa mention finale — « (Remastered 2005) », « [Live] »,
 * « - Radio Edit » — puis normalisé. C'est la mention, et elle seule, qui
 * distingue deux versions d'un même morceau ; un mot de plus SANS parenthèse
 * ni tiret (« Lovely Day Dream ») est un autre morceau.
 */
function titreDeBase(s: string): string {
  return normaliser(
    s.replace(/(\s*[([][^)\]]*[)\]])+\s*$/u, '').replace(/\s+[-–—]\s+.*$/u, ''),
  );
}

/** Titre ≈ titre : égaux normalisés, ou égaux une fois la mention finale retirée. */
export function titresProches(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliser(a ?? '');
  const nb = normaliser(b ?? '');
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ba = titreDeBase(a ?? '');
  const bb = titreDeBase(b ?? '');
  return !!ba && ba === bb;
}

/** Artiste ≈ artiste : égaux normalisés, ou l'un contient l'autre. Vide = jamais. */
export function artistesProches(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliser(a ?? '');
  const nb = normaliser(b ?? '');
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

type VersionLocale = api.OtherVersionGroup['versions'][number];
type VersionService = NonNullable<api.OtherVersionGroup['streaming']>[number];

function artisteDe(t: Track): string | null {
  return (t.artist_name ?? '').trim() || (t.album_artist ?? '').trim() || null;
}

function correspond(t: Track, cible: CibleParTitre): boolean {
  return titresProches(t.title, cible.titre) && artistesProches(artisteDe(t), cible.artiste);
}

function estLOrigine(t: Track, service: string, cible: CibleParTitre): boolean {
  return cible.source != null && cible.source_id != null
    && service === cible.source && String(t.source_id ?? '') === cible.source_id;
}

/**
 * Le rapprochement, PUR : de la réponse fédérée à la forme du panneau.
 *
 * @returns Un groupe de la forme de `/library/tracks/{id}/versions` —
 *   `versions` pour la bibliothèque, `streaming` pour les services.
 */
export function rapprocherParTitre(
  reponse: Pick<FederatedSearchResult, 'local' | 'services'> | null | undefined,
  cible: CibleParTitre,
): api.OtherVersionGroup {
  const versions: VersionLocale[] = [];
  for (const t of reponse?.local?.tracks ?? []) {
    if (!estDeBibliotheque(t) || !correspond(t, cible)) continue;
    versions.push({
      track_id: t.id as number,
      album_id: typeof t.album_id === 'number' ? t.album_id : null,
      album_title: t.album_title ?? null,
      artist_name: artisteDe(t),
      cover_path: t.cover_path ?? null,
      duration_ms: t.duration_ms ?? null,
    });
  }
  const streaming: VersionService[] = [];
  const vus = new Set<string>();
  const services: Record<string, SearchResult> = reponse?.services ?? {};
  for (const service of Object.keys(services)) {
    for (const t of services[service]?.tracks ?? []) {
      const s = String(t.source ?? service);
      if (!correspond(t, cible) || estLOrigine(t, s, cible)) continue;
      const id = t.source_id == null ? null : String(t.source_id);
      const albumId = t.album_id == null ? null : String(t.album_id);
      if (id == null && albumId == null) continue;
      const cle = `${s}:${id ?? `a:${albumId}`}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      streaming.push({
        service: s,
        source_id: id,
        title: t.title,
        artist_name: artisteDe(t),
        album_title: t.album_title ?? null,
        album_id: albumId,
        cover_path: t.cover_path ?? null,
        kind: 'version',
      });
    }
  }
  return { title: cible.titre, artist_name: cible.artiste, played_album: '', versions, streaming };
}

/**
 * Le chargeur que le panneau appelle en mode titre + artiste : UN appel à la
 * recherche fédérée, puis le rapprochement.
 */
export function chargerVersionsParTitre(cible: CibleParTitre): Promise<api.OtherVersionGroup> {
  return api.federatedSearch(cible.titre).then((r) => rapprocherParTitre(r, cible));
}
