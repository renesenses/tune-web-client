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
 * Lequel des artistes rendus par le service est le nôtre.
 *
 * Le nom EXACT (casse ignorée) prime ; à défaut, le premier — le service
 * classe ses résultats par pertinence. C'est la règle de l'interface actuelle,
 * reprise telle quelle : la changer ici ferait diverger deux écrans qui
 * doivent montrer la même chose.
 *
 * ⚠️ Un rapprochement par NOM reste faillible — « M » et « -M- » sont le même
 * artiste et deux chaînes. On ne peut pas faire mieux : le service ne connaît
 * pas l'identifiant de notre table, et aucune correspondance n'est stockée.
 */
export function apparierArtiste(
  candidats: { id?: unknown; source_id?: unknown; name: string }[] | null | undefined,
  nom: string,
): string | null {
  const liste = candidats ?? [];
  if (!liste.length) return null;
  const cible = nom.toLowerCase();
  const choisi = liste.find((a) => (a?.name ?? '').toLowerCase() === cible) ?? liste[0];
  const id = choisi?.id ?? choisi?.source_id ?? null;
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
        return { service, albums: albums.map((a) => ({ ...a, source: (a.source ?? service) as Album['source'] })) };
      } catch {
        return null;
      }
    }),
  );

  // L'ordre des services est celui qu'on a reçu : stable d'un artiste à
  // l'autre, sans quoi les sections danseraient d'une fiche à la suivante.
  return sections.filter((s): s is AlbumsDeService => s != null);
}
