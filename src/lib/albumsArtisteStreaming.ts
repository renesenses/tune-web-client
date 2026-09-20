/**
 * Les albums d'un artiste CHEZ LES SERVICES — renesenses/tune-server-rust#3709.
 *
 * FabienM, fil forum 1726 (08/09/2026), v0.9.143 :
 *
 *   « Dans menu bibliothèque, si on sélectionne un artiste, on a que les
 *     albums de sa bibliothèque. Il manque ses albums des services de
 *     streaming, comme le fait Roon depuis sa bibliothèque »
 *
 * ## Rien à inventer : la chaîne existe et sert déjà
 *
 * `LibraryView.svelte:1797` (`loadStreamingArtistAlbums`) la parcourt depuis
 * toujours dans l'interface actuelle, et `ArtistesV2` ne l'avait jamais
 * reprise — `git grep -c streaming src/components/v2/ArtistesV2.svelte` ne
 * rendait AUCUNE correspondance sur `v0.9.143` comme sur `origin/main`.
 *
 * Trois pas, et ils sont imposés par le contrat du serveur :
 *
 *  1. `/streaming/{service}/artists/{artist_id}/albums` prend l'identifiant du
 *     service, PAS celui de la bibliothèque. Les deux espaces d'identifiants
 *     sont disjoints : l'artiste 994 de la table locale n'est pas l'artiste
 *     994 de Qobuz.
 *  2. Il faut donc d'abord RÉSOUDRE le nom en identifiant de service, ce que
 *     `/search` fait déjà (`federatedSearch`).
 *  3. Et n'interroger que les services AUTHENTIFIÉS : les autres répondraient
 *     une erreur, ou rien, dans les deux cas sans rien apprendre.
 *
 * ## Pourquoi un module, et pas un `if` dans l'écran
 *
 * Parce qu'une garde écrite contre un composant ne peut que lire son TEXTE, et
 * qu'un texte présent ne prouve pas qu'il s'exécute — la leçon de
 * `routageArtiste` et de `lectureEnMasse`. Ici les deux appels réseau sont
 * INJECTÉS : la garde les fournit et regarde ce qui part et ce qui revient.
 *
 * ## Ce que ce module ne fait PAS, et pourquoi
 *
 * Il ne FUSIONNE pas ces albums avec ceux de la bibliothèque, et il ne
 * dédoublonne pas. Le point 3 du ticket le pose comme une décision de
 * conception ouverte : la grille de la fiche artiste est indexée sur `al.id`
 * et ses actions de pochette (cœur, étiquettes) sont adossées à un identifiant
 * LOCAL. Un album de service n'en a pas — il porte `source` + `source_id`. Les
 * mêler casserait la clé de boucle et poserait des cœurs sans cible. Une
 * SECTION SÉPARÉE par service se livre sans toucher à l'existant, et c'est
 * aussi la forme que l'interface actuelle donne déjà à la même liste
 * (`LibraryView.svelte:3335`).
 */
import type { Album, StreamingServiceStatus } from './types';

/** Une section : le service, et ce qu'il rend pour cet artiste. */
export interface AlbumsDeService {
  service: string;
  albums: Album[];
  /** L'identifiant de l'artiste chez ce service, résolu par le nom — réemployé
   *  pour ses titres phares (`lib/titresPharesArtiste`). */
  artistId?: string;
}

/**
 * Les deux appels au serveur, injectés pour que la garde puisse les tenir.
 *
 * `resoudreArtiste` rend les artistes que le service propose pour ce nom, dans
 * l'ordre où il les donne.
 */
export interface PasserellesStreaming {
  resoudreArtiste: (service: string, nom: string) => Promise<{ id?: unknown; source_id?: unknown; name: string }[]>;
  albumsDeLArtiste: (service: string, artistId: string) => Promise<Album[]>;
}

/**
 * Les services qu'on peut interroger : ceux dont la session est ouverte.
 *
 * `enabled` ne suffit pas — un service activé mais déconnecté rendrait un 401
 * par artiste ouvert. C'est déjà la règle de `loadStreamingArtistAlbums`
 * (`if (!status.authenticated) continue`).
 */
export function servicesInterrogeables(
  statuts: Record<string, StreamingServiceStatus> | null | undefined,
): string[] {
  return Object.entries(statuts ?? {})
    .filter(([, s]) => s?.authenticated)
    .map(([nom]) => nom);
}

/**
 * Les statuts des services, CHARGÉS s'il le faut — renesenses/tune-server-rust#4330.
 *
 * 🔴 Dans le nouveau client, AUCUN écran ne remplit le magasin
 * `streamingServices`. Seuls l'ancienne barre latérale (`Sidebar.svelte`),
 * les réglages et l'accueil de l'ancienne interface y écrivent ; les écrans v2
 * (`StreamingV2`, `SettingsV2`, `PlaylistsV2`) lisent `getStreamingServices`
 * dans une variable locale. Ouverte depuis la Bibliothèque v2, la fiche artiste
 * lisait donc `{}` et n'interrogeait AUCUN service — mesuré sur le .18 le
 * 17/09/2026 : a-ha, Qobuz connecté, zéro album de service, alors que
 * `/search` et `/streaming/qobuz/artists/53675/albums` répondaient 200.
 * La garde de #3709 ne le voyait pas : elle posait le magasin à la main.
 *
 * On lit le magasin s'il porte quelque chose ; sinon on demande au serveur, et
 * on RANGE la réponse dans le magasin pour les écrans suivants. Un échec rend
 * `{}` : la fiche se montre alors avec la seule bibliothèque, comme avant.
 */
export async function statutsStreaming(
  actuels: Record<string, StreamingServiceStatus> | null | undefined,
  charger: () => Promise<Record<string, StreamingServiceStatus> | null | undefined>,
  ranger: (s: Record<string, StreamingServiceStatus>) => void,
): Promise<Record<string, StreamingServiceStatus>> {
  if (actuels && Object.keys(actuels).length) return actuels;
  try {
    const lus = (await charger()) ?? {};
    if (Object.keys(lus).length) ranger(lus);
    return lus;
  } catch {
    return {};
  }
}

/**
 * Normalise un nom d'artiste pour le rapprochement — #1373.
 *
 * Minuscules, accents retirés, ponctuation et espaces réduits, article de tête
 * (`the`, `le`, `la`, `les`) enlevé. Rien de plus : chaque règle ajoutée ici
 * élargit ce qui se rapproche, et l'élargir à tort est le seul vrai risque.
 *
 * C'est le PENDANT de `artist_releases.rs::nom_normalise` côté serveur, qui
 * rapproche déjà les mêmes noms pour « Nouveautés de vos artistes ». Deux
 * écrans qui rapprochent des noms doivent le faire de la même façon.
 */
export function nomNormalise(nom: string): string {
  const sansAccents = (nom ?? '')
    .toLowerCase()
    .normalize('NFD')
    // Les diacritiques décomposés par NFD — et rien d'autre : on ne touche ni
    // aux alphabets non latins, ni aux chiffres.
    .replace(/[\u0300-\u036f]/g, '');
  const mots = sansAccents.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // Un nom RÉDUIT à un article reste ce nom : « The » seul doit rendre « the »,
  // pas la chaîne vide — sans quoi tous les noms vides se rapprocheraient
  // entre eux.
  const sansArticle =
    mots.length > 1 && ['the', 'le', 'la', 'les'].includes(mots[0]) ? mots.slice(1) : mots;
  return sansArticle.join(' ');
}

/**
 * Lequel des artistes rendus par le service est le nôtre.
 *
 * 🔴 #1373 — LE NOM, ou RIEN. La règle d'avant retenait le nom exact « à
 * défaut, le premier », en s'appuyant sur le classement par pertinence du
 * service. Pour une RECHERCHE, c'est raisonnable ; pour une FICHE D'ARTISTE,
 * c'est une machine à fausses attributions : quand le service ne connaît pas
 * l'artiste, il rend quand même des résultats, et toute la discographie
 * affichée devient celle de quelqu'un d'autre. FabienM, 0.9.158 : sa fiche
 * « Matt Elliott » proposait les albums de Keystone Homeschool.
 *
 * Sans correspondance, on rend `null` : le service n'aura pas de section. Une
 * section vide ne dit rien ; une section fausse ment.
 *
 * ⚠️ Conséquence assumée : « M » et « -M- » sont le même artiste et deux
 * chaînes que la normalisation ne rejoint pas. Le service ne connaît pas
 * l'identifiant de notre table, aucune correspondance n'est stockée, et une
 * fiche incomplète vaut mieux qu'une fiche fausse.
 */
export function apparierArtiste(
  candidats: { id?: unknown; source_id?: unknown; name: string }[] | null | undefined,
  nom: string,
): string | null {
  const liste = candidats ?? [];
  if (!liste.length) return null;
  const cible = nomNormalise(nom);
  if (!cible) return null;
  const choisi = liste.find((a) => nomNormalise(a?.name ?? '') === cible);
  if (!choisi) return null;
  const id = choisi.id ?? choisi.source_id ?? null;
  return id == null || id === '' ? null : String(id);
}

/**
 * Ce que les services connus rendent pour cet artiste.
 *
 * 🔴 Un service qui échoue ne fait pas tomber les autres. Fabien en cite
 * quatre ; s'ils devaient partir ensemble ou pas du tout, une session Tidal
 * expirée cacherait ses albums Qobuz. Un service muet est simplement absent —
 * `getStreamingArtistAlbums` peut aussi rendre une liste vide pour un artiste
 * qu'il ne connaît pas, et une section vide ne dit rien à personne.
 */
export async function albumsDeStreamingPourArtiste(
  nom: string,
  services: string[],
  p: PasserellesStreaming,
): Promise<AlbumsDeService[]> {
  const propre = (nom ?? '').trim();
  if (!propre) return [];

  const sections = await Promise.all(
    services.map(async (service): Promise<AlbumsDeService | null> => {
      try {
        const artistId = apparierArtiste(await p.resoudreArtiste(service, propre), propre);
        if (artistId == null) return null;
        const albums = (await p.albumsDeLArtiste(service, artistId)) ?? [];
        if (!albums.length) return null;
        // 🔴 La SOURCE est TAMPONNÉE ici. Le serveur ne la pose sur aucun objet
        // de streaming (mesuré sur le .18 le 07/09/2026) : une fois l'album
        // détaché de sa requête, plus rien ne dit d'où il vient, et il ne
        // serait alors ni ouvrable ni jouable. `??`, pas `=` : un agrégateur
        // peut rendre du Tidal sous une route Qobuz.
        return { service, artistId, albums: albums.map((a) => ({ ...a, source: (a.source ?? service) as Album['source'] })) };
      } catch {
        return null;
      }
    }),
  );

  // L'ordre des services est celui qu'on a reçu : stable d'un artiste à
  // l'autre, sans quoi les sections danseraient d'une fiche à la suivante.
  return sections.filter((s): s is AlbumsDeService => s != null);
}
