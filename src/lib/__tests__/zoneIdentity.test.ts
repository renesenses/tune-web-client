/**
 * Identité de zone dans la barre de lecture (forum #1460,
 * tune-server-rust#1858, FabienM).
 *
 * Les cas couverts ici sont ceux qui produisent un affichage FAUX plutôt
 * qu'imparfait : la chaîne vide prise pour une valeur, la marque répétée dans
 * le modèle, et le repli quand on ne sait rien.
 */
import { describe, it, expect } from 'vitest';
import {
  zoneIconKind,
  zoneTypeLabel,
  zoneDeviceName,
  zoneChipLabel,
  zoneFullLabel,
} from '../zoneIdentity';
import type { Zone } from '../types';

function zone(p: Partial<Zone> = {}): Zone {
  return { id: 1, name: 'Salon', ...p } as Zone;
}

describe('zoneIconKind', () => {
  it('distingue la sortie locale du reste', () => {
    expect(zoneIconKind('local')).toBe('desktop');
    expect(zoneIconKind('browser')).toBe('browser');
  });

  it('range les enceintes réseau ensemble', () => {
    for (const t of ['dlna', 'openhome', 'bluos', 'sonos', 'squeezebox'] as const) {
      expect(zoneIconKind(t)).toBe('network');
    }
  });

  it('sépare ce qui est le plus souvent un téléviseur', () => {
    expect(zoneIconKind('chromecast')).toBe('tv');
    expect(zoneIconKind('airplay')).toBe('tv');
    expect(zoneIconKind('airplay2')).toBe('tv');
  });

  /** Un client plus ancien que le serveur ne doit pas afficher un trou. */
  it('retombe sur l’enceinte réseau pour un type inconnu ou absent', () => {
    expect(zoneIconKind(undefined)).toBe('network');
    expect(zoneIconKind(null)).toBe('network');
    expect(zoneIconKind('un_type_futur' as never)).toBe('network');
  });
});

describe('zoneTypeLabel', () => {
  it('écrit les protocoles comme sur les appareils', () => {
    expect(zoneTypeLabel('dlna')).toBe('DLNA');
    expect(zoneTypeLabel('bluos')).toBe('BluOS');
    expect(zoneTypeLabel('chromecast')).toBe('Cast');
  });

  it('regroupe airplay et airplay2 sous un seul nom', () => {
    expect(zoneTypeLabel('airplay')).toBe('AirPlay');
    expect(zoneTypeLabel('airplay2')).toBe('AirPlay');
  });

  /** « Local » ne dirait rien de plus que le pictogramme. */
  it('ne dit rien pour la sortie locale', () => {
    expect(zoneTypeLabel('local')).toBe('');
    expect(zoneTypeLabel(undefined)).toBe('');
  });
});

describe('zoneDeviceName', () => {
  it('assemble marque et modèle', () => {
    expect(zoneDeviceName(zone({ brand: 'Marantz', model: 'ND8006' })))
      .toBe('Marantz ND8006');
  });

  /** Beaucoup de modèles portent déjà la marque : « Bluesound Bluesound Node »
   *  est le genre de doublon qu'un testeur signale le lendemain. */
  it('ne répète pas la marque déjà contenue dans le modèle', () => {
    expect(zoneDeviceName(zone({ brand: 'Bluesound', model: 'Bluesound Node' })))
      .toBe('Bluesound Node');
    expect(zoneDeviceName(zone({ brand: 'bluesound', model: 'Bluesound Node 2i' })))
      .toBe('Bluesound Node 2i');
  });

  it('préfère le choix de l’utilisateur à la détection UPnP', () => {
    expect(zoneDeviceName(zone({
      brand: 'Marantz', model: 'ND8006',
      detected_manufacturer: 'Denon', detected_model: 'HEOS',
    }))).toBe('Marantz ND8006');
  });

  /** Corriger la marque sans toucher au modèle ne doit pas faire perdre le
   *  modèle détecté : les deux champs se replient indépendamment. */
  it('replie chaque champ séparément sur la détection', () => {
    expect(zoneDeviceName(zone({
      brand: 'Marantz', model: null,
      detected_manufacturer: 'Denon', detected_model: 'ND8006',
    }))).toBe('Marantz ND8006');
  });

  /** ⚠️ Le serveur renvoie `''` autant que `null` pour un champ non
   *  renseigné (`brand.unwrap_or_default()`). Le confondre avec une valeur
   *  affichait un séparateur orphelin. */
  it('traite la chaîne vide et les espaces comme une absence', () => {
    expect(zoneDeviceName(zone({ brand: '', model: '' }))).toBeNull();
    expect(zoneDeviceName(zone({ brand: '   ', model: null }))).toBeNull();
    expect(zoneDeviceName(zone({ brand: '', model: 'Node' }))).toBe('Node');
  });

  it('ne sait rien quand rien n’est renseigné', () => {
    expect(zoneDeviceName(zone())).toBeNull();
    expect(zoneDeviceName(null)).toBeNull();
  });
});

describe('zoneChipLabel', () => {
  it('montre l’appareil quand on le connaît', () => {
    expect(zoneChipLabel(zone({ brand: 'Marantz', model: 'ND8006' })))
      .toBe('Marantz ND8006');
  });

  /** Le nom de zone est toujours présent et souvent parlant. La pastille ne
   *  doit jamais être vide : une pastille vide se lit comme une panne. */
  it('retombe sur le nom de la zone, jamais sur du vide', () => {
    expect(zoneChipLabel(zone())).toBe('Salon');
    expect(zoneChipLabel(zone({ brand: '', model: '' }))).toBe('Salon');
    expect(zoneChipLabel(null)).toBe('');
  });
});

describe('zoneFullLabel', () => {
  it('donne zone, appareil et protocole', () => {
    expect(zoneFullLabel(zone({ brand: 'Marantz', model: 'ND8006', output_type: 'dlna' })))
      .toBe('Salon — Marantz ND8006 · DLNA');
  });

  it('n’écrit pas deux fois la même chose', () => {
    expect(zoneFullLabel(zone({ name: 'Marantz ND8006', brand: 'Marantz', model: 'ND8006', output_type: 'dlna' })))
      .toBe('Marantz ND8006 · DLNA');
  });

  it('se contente du nom quand la sortie est locale', () => {
    expect(zoneFullLabel(zone({ output_type: 'local' }))).toBe('Salon');
  });
});
