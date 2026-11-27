/**
 * Icônes de zone (itération 7 du thème Roon-like, 27/11/2026).
 *
 * Le jeu de Rémi (`src/assets/zone-icons/`, CC0) : 22 pièces, 8 personnes,
 * 22 appareils. Ce module dit :
 *   - l'icône PAR DÉFAUT d'une zone, d'après son `output_type`, affinée par
 *     `brand` / `model` / `detected_manufacturer` et son nom ;
 *   - le CHOIX de l'utilisateur pour une zone (une pièce, une personne, un
 *     appareil), qui l'emporte sur le défaut.
 *
 * 🔴 Le serveur n'a AUCUN champ pour l'icône d'une zone (`tune-core`
 * `zone_repo.rs`, struct `Zone` : ni `icon` ni `room`). Le choix est donc
 * rangé dans CE navigateur (`localStorage`, clé `tune-icones-zones`), par
 * identifiant de zone. Le jour où le serveur le portera, `iconeDeZone` lira
 * son champ d'abord.
 */
import { writable, type Writable } from 'svelte/store';

export const FAMILLES_ICONES = ['pieces', 'personnes', 'appareils'] as const;
export type FamilleIcone = (typeof FAMILLES_ICONES)[number];

export const ICONES: Record<FamilleIcone, readonly string[]> = {
  pieces: [
    'maison', 'salon', 'salle-ecoute', 'home-cinema', 'chambre', 'chambre-enfant', 'cuisine',
    'salle-a-manger', 'bureau', 'bibliotheque', 'studio', 'salle-de-bain', 'salle-de-jeux',
    'salle-de-sport', 'entree', 'cave', 'atelier', 'garage', 'jardin', 'terrasse', 'exterieur', 'voiture',
  ],
  personnes: [
    'homme-court', 'homme-barbe', 'homme-boucles', 'homme-casquette',
    'femme-carre', 'femme-queue', 'femme-chignon', 'femme-boucles',
  ],
  appareils: [
    'enceinte', 'colonnes', 'enceinte-reseau', 'enceinte-connectee', 'enceinte-portable', 'barre-de-son',
    'caisson', 'ampli', 'dac', 'streamer', 'platine', 'casque', 'ecouteurs', 'telephone', 'tablette',
    'portable', 'ordinateur', 'televiseur', 'recepteur-tv', 'navigateur', 'serveur', 'groupe',
  ],
};

/** Un nom d'icône, sous la forme `famille/nom` (le chemin du fichier). */
export type NomIconeZone = string;

export function estIconeZone(v: unknown): v is NomIconeZone {
  if (typeof v !== 'string') return false;
  const [f, n] = v.split('/');
  return (FAMILLES_ICONES as readonly string[]).includes(f) && ICONES[f as FamilleIcone].includes(n);
}

/** Clé i18n du nom d'une icône (`roonLike.icone.<nom>`). */
export function cleLibelleIcone(nom: NomIconeZone): string {
  return `roonLike.icone.${nom.split('/')[1]}`;
}

/** Ce qu'il faut savoir d'une zone pour choisir son icône. */
export interface ZoneIconeSource {
  id?: number | null;
  name?: string | null;
  output_type?: string | null;
  brand?: string | null;
  model?: string | null;
  detected_manufacturer?: string | null;
  detected_model?: string | null;
}

const a = (n: string): NomIconeZone => `appareils/${n}`;

function indices(z: ZoneIconeSource): string {
  return [z.brand, z.model, z.detected_manufacturer, z.detected_model, z.name]
    .filter(Boolean).join(' ').toLowerCase();
}

/**
 * L'icône par défaut d'une zone — la table du README de Rémi.
 * `groupe` : la zone représente un groupe de zones.
 */
export function iconeParDefaut(z: ZoneIconeSource | null | undefined, opts: { groupe?: boolean } = {}): NomIconeZone {
  if (opts.groupe) return a('groupe');
  if (!z) return a('enceinte');
  const txt = indices(z);
  switch (z.output_type ?? '') {
    case 'browser':
      if (/ipad|tablet|tablette/.test(txt)) return a('tablette');
      if (/iphone|android|phone|téléphone|telephone|mobile/.test(txt)) return a('telephone');
      return a('navigateur');
    case 'local':
    case 'tune_agent':
      if (/airpods|earbuds|écouteurs|ecouteurs|buds/.test(txt)) return a('ecouteurs');
      if (/casque|headphone|headset|kopfhörer/.test(txt)) return a('casque');
      if (/hdmi|\btv\b|télé|tele\b|television/.test(txt)) return a('televiseur');
      if (/haut-parleurs intégrés|built-in|builtin|internal speakers|macbook|laptop/.test(txt)) return a('ordinateur');
      return a('dac');
    case 'airplay':
    case 'airplay2':
      return a('enceinte-reseau');
    case 'dlna':
      if (/samsung|\blg\b|bravia|philips tv|panasonic tv|\btv\b|télé/.test(txt)) return a('televiseur');
      if (/sonos|bose|denon home|bang|b&o|marshall|harman|jbl/.test(txt)) return a('enceinte-connectee');
      return a('streamer');
    case 'chromecast':
      return /\btv\b|télé|television|bravia|samsung|\blg\b/.test(txt) ? a('televiseur') : a('recepteur-tv');
    case 'devialet_air':
      return /expert/.test(txt) ? a('ampli') : a('enceinte-connectee');
    case 'sonos':
      return a('enceinte-connectee');
    case 'oaat':
    case 'openhome':
    case 'squeezebox':
    case 'bluos':
    case 'snapcast':
    case 'sendspin':
    case 'bridge':
      return a('streamer');
    default:
      return a('enceinte');
  }
}

/* ── Le choix de l'utilisateur, par zone (stockage local) ─────────────── */

export const CLE_STOCKAGE_ICONES = 'tune-icones-zones';

export type ChoixIcones = Record<string, NomIconeZone>;

function lire(): ChoixIcones {
  try {
    const brut = JSON.parse(globalThis.localStorage?.getItem(CLE_STOCKAGE_ICONES) ?? '{}');
    const propre: ChoixIcones = {};
    if (brut && typeof brut === 'object') {
      for (const [k, v] of Object.entries(brut)) if (estIconeZone(v)) propre[k] = v;
    }
    return propre;
  } catch {
    return {};
  }
}

export const choixIconesZones: Writable<ChoixIcones> = writable(lire());
choixIconesZones.subscribe((v) => {
  try { globalThis.localStorage?.setItem(CLE_STOCKAGE_ICONES, JSON.stringify(v)); } catch { /* stockage indisponible */ }
});

/** Pose (ou retire, avec `null`) l'icône choisie pour une zone. */
export function choisirIconeZone(zoneId: number | null | undefined, nom: NomIconeZone | null): void {
  if (zoneId == null) return;
  choixIconesZones.update((c) => {
    const n = { ...c };
    if (nom && estIconeZone(nom)) n[String(zoneId)] = nom; else delete n[String(zoneId)];
    return n;
  });
}

/** L'icône à dessiner : le choix de l'utilisateur, sinon le défaut. */
export function iconeDeZone(z: ZoneIconeSource | null | undefined, choix: ChoixIcones, opts: { groupe?: boolean } = {}): NomIconeZone {
  const c = z?.id != null ? choix[String(z.id)] : undefined;
  return c && estIconeZone(c) ? c : iconeParDefaut(z, opts);
}
