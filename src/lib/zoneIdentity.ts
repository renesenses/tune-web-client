/**
 * Identité d'une zone : de quel genre d'appareil s'agit-il, et comment
 * l'appeler.
 *
 * Signalé par FabienM (forum #1460, tune-server-rust#1858) : la barre de
 * lecture affiche la MÊME icône pour toutes les zones, si bien qu'on ne sait
 * plus où joue la musique sans se souvenir de ce qu'on a choisi. L'information
 * existe pourtant — la barre latérale, elle, affiche déjà le type de chaque
 * zone. Le défaut n'était donc pas un manque mais une incohérence : la même
 * donnée montrée à un endroit et tue à l'autre.
 *
 * ⚠️ La demande initiale — une bibliothèque de logos par marque et modèle — a
 * été écartée (arbitrage du 18/08, tune-server-rust#1858) : un catalogue
 * d'images se maintient indéfiniment, et les logos de marque ne sont pas libres
 * de droits alors que Tune est distribué commercialement. On dérive donc le
 * pictogramme du TYPE de sortie, et l'on nomme l'appareil en toutes lettres.
 *
 * Limite assumée : deux zones du même type portent le même pictogramme. C'est
 * `zoneDeviceName` qui les sépare, et seulement si l'utilisateur a renseigné
 * marque et modèle — ou si l'UPnP les a détectés.
 */
import type { OutputType, Zone } from './types';

/** Famille de pictogramme. Plusieurs types de sortie partagent une famille
 *  quand ils désignent le même genre d'objet : un Node BluOS et une enceinte
 *  DLNA sont tous deux « une enceinte au bout du réseau ». Le protocole, lui,
 *  reste dit en toutes lettres par `zoneTypeLabel`. */
export type ZoneIconKind = 'desktop' | 'browser' | 'network' | 'tv' | 'multiroom';

/**
 * Pictogramme à employer pour une zone.
 *
 * `airplay` et `chromecast` sont séparés du gros des sorties réseau non par
 * élégance mais parce qu'ils désignent souvent un objet différent — un poste
 * de télévision ou un dongle — là où DLNA/BluOS/Sonos désignent une enceinte
 * ou un ampli.
 */
export function zoneIconKind(type?: OutputType | null): ZoneIconKind {
  switch (type) {
    case 'local':
      return 'desktop';
    case 'browser':
      return 'browser';
    case 'chromecast':
      return 'tv';
    case 'airplay':
    case 'airplay2':
      return 'tv';
    case 'snapcast':
      return 'multiroom';
    case 'dlna':
    case 'openhome':
    case 'bluos':
    case 'sonos':
    case 'squeezebox':
      return 'network';
    default:
      // Un type inconnu vient forcément d'un serveur plus récent que ce
      // client. Une enceinte réseau est le pari le moins faux : c'est ce
      // qu'est la grande majorité des sorties non locales.
      return 'network';
  }
}

/**
 * Nom du protocole, tel qu'on l'écrit sur les appareils du commerce.
 *
 * Ce sont des noms propres : ils ne se traduisent pas, et ce module ne dépend
 * donc d'aucune locale. `local` ne renvoie rien — « DLNA » informe, « Local »
 * répète le pictogramme.
 */
export function zoneTypeLabel(type?: OutputType | null): string {
  switch (type) {
    case 'dlna':
      return 'DLNA';
    case 'openhome':
      return 'OpenHome';
    case 'airplay':
    case 'airplay2':
      return 'AirPlay';
    case 'chromecast':
      return 'Cast';
    case 'bluos':
      return 'BluOS';
    case 'sonos':
      return 'Sonos';
    case 'snapcast':
      return 'Snapcast';
    case 'squeezebox':
      return 'Squeezebox';
    case 'browser':
      return 'Browser';
    case 'local':
      return '';
    default:
      return '';
  }
}

/** Une valeur venue du serveur ne compte que si elle porte quelque chose.
 *
 *  ⚠️ Le serveur renvoie tantôt `null`, tantôt la CHAÎNE VIDE pour une marque
 *  non renseignée (`inject_device_identity` sérialise l'override tel quel,
 *  `PATCH /zones/{id}` répond `brand.unwrap_or_default()`). Tester `!= null`
 *  laisserait passer `''` et afficherait « Salon ·  » avec un séparateur
 *  orphelin. */
function present(v?: string | null): string | null {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : null;
}

/**
 * Comment s'appelle l'appareil de cette zone — « Marque Modèle ».
 *
 * L'override choisi par l'utilisateur prime sur la détection UPnP, dans les
 * deux champs et indépendamment : quelqu'un qui a corrigé la marque sans
 * toucher au modèle doit garder le modèle détecté.
 *
 * Renvoie `null` quand on ne sait rien — l'appelant décide alors quoi montrer
 * à la place, plutôt que de recevoir une chaîne vide à tester.
 */
export function zoneDeviceName(zone?: Pick<
  Zone,
  'brand' | 'model' | 'detected_manufacturer' | 'detected_model'
> | null): string | null {
  if (!zone) return null;
  const brand = present(zone.brand) ?? present(zone.detected_manufacturer);
  const model = present(zone.model) ?? present(zone.detected_model);
  if (brand && model) {
    // Beaucoup de modèles répètent déjà la marque (« Bluesound Node »,
    // « Marantz ND8006 ») : la concaténation naïve donnerait « Bluesound
    // Bluesound Node ».
    if (model.toLowerCase().startsWith(brand.toLowerCase())) return model;
    return `${brand} ${model}`;
  }
  return brand ?? model;
}

/**
 * Ce qu'on écrit sur la pastille de zone de la barre de lecture.
 *
 * L'appareil d'abord, parce que c'est la question posée — « où joue la
 * musique ? ». Le nom de la zone en repli, parce qu'il est toujours là et
 * qu'il est souvent parlant (« Salon »). Jamais vide.
 */
export function zoneChipLabel(zone?: Zone | null): string {
  if (!zone) return '';
  return zoneDeviceName(zone) ?? zone.name ?? '';
}

/**
 * Libellé long, pour l'infobulle et l'étiquette d'accessibilité : le nom de la
 * zone, l'appareil quand il est connu et qu'il n'est pas déjà ce qu'on montre,
 * puis le protocole.
 *
 * Exemple : « Salon — Marantz ND8006 · DLNA ».
 */
export function zoneFullLabel(zone?: Zone | null): string {
  if (!zone) return '';
  const parts: string[] = [];
  const name = present(zone.name);
  const device = zoneDeviceName(zone);
  if (name) parts.push(name);
  if (device && device !== name) parts.push(device);
  const head = parts.join(' — ');
  const proto = zoneTypeLabel(zone.output_type);
  return proto ? (head ? `${head} · ${proto}` : proto) : head;
}
