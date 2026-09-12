/**
 * La zone sélectionnée au chargement — une règle, deux coquilles.
 *
 * Elle existait en double et les deux exemplaires divergeaient : l'interface
 * actuelle préférait la zone QUI JOUE, la V1 prenait la PREMIÈRE de la liste.
 * Comme `audioLevels` ne rend que les niveaux de la zone sélectionnée, les
 * deux interfaces du même serveur pouvaient afficher, au même instant et sur
 * la même écoute, des aiguilles vivantes d'un côté et le silence de l'autre.
 *
 * Les cas ci-dessous sont écrits sur la configuration RÉELLE qui a mis le
 * défaut en évidence — sept zones, une AirPlay hors ligne en tête de liste,
 * la lecture sur la quatrième.
 */
import { describe, it, expect } from 'vitest';
import { zoneInitiale, type ZoneChoisissable } from '../zoneInitiale';

/** Les sept zones d'une installation réelle, dans l'ordre rendu par `/zones`. */
const SEPT_ZONES: ZoneChoisissable[] = [
  { id: 1, state: 'stopped' },               // AirPlay, hors ligne
  { id: 2, state: 'stopped' },               // Chromecast
  { id: 3, state: 'stopped' },               // DLNA
  { id: 4, state: 'playing' },               // Diretta — celle qu'on écoute
  { id: 5, state: 'stopped' },               // Diretta
  { id: 6, state: 'stopped' },               // Squeezebox
  { id: 7, state: 'stopped' },               // Squeezebox
];

describe('zoneInitiale', () => {
  it('sans rien de mémorisé, prend la zone QUI JOUE et non la première', () => {
    // 🔴 Le cœur du défaut : la V1 rendait 1, une zone hors ligne et muette.
    expect(zoneInitiale(SEPT_ZONES, null, null)).toBe(4);
  });

  it('respecte un choix mémorisé encore valable', () => {
    expect(zoneInitiale(SEPT_ZONES, 6, null)).toBe(6);
  });

  it('abandonne un choix mémorisé qui a disparu de la liste', () => {
    // Une zone supprimée depuis la dernière session laisserait sinon
    // l'interface pointer dans le vide, boutons Lire inertes.
    expect(zoneInitiale(SEPT_ZONES, 99, null)).toBe(4);
  });

  it('le défaut du SERVEUR passe avant la zone qui joue', () => {
    const avecDefaut = SEPT_ZONES.map((z) => (z.id === 2 ? { ...z, is_default: true } : z));
    expect(zoneInitiale(avecDefaut, null, null)).toBe(2);
  });

  it('le défaut de l APPAREIL passe avant la zone qui joue', () => {
    expect(zoneInitiale(SEPT_ZONES, null, 5)).toBe(5);
  });

  it('le défaut du serveur l emporte sur celui de l appareil', () => {
    const avecDefaut = SEPT_ZONES.map((z) => (z.id === 2 ? { ...z, is_default: true } : z));
    expect(zoneInitiale(avecDefaut, null, 5)).toBe(2);
  });

  it('un défaut d appareil qui ne correspond à aucune zone est ignoré', () => {
    expect(zoneInitiale(SEPT_ZONES, null, 404)).toBe(4);
  });

  it('sans zone qui joue ni défaut, retombe sur la première', () => {
    const rienNeJoue = SEPT_ZONES.map((z) => ({ ...z, state: 'stopped' }));
    expect(zoneInitiale(rienNeJoue, null, null)).toBe(1);
  });

  it('rend null sur une liste vide, sans exception', () => {
    expect(zoneInitiale([], null, null)).toBeNull();
    expect(zoneInitiale([], 4, 2)).toBeNull();
  });

  it('tolère une zone sans identifiant plutôt que de rendre undefined', () => {
    expect(zoneInitiale([{ state: 'playing' }], null, null)).toBeNull();
  });
});

describe('les deux coquilles appliquent la MÊME règle', () => {
  const lire = (p: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('node:fs').readFileSync(new URL(p, import.meta.url), 'utf-8') as string;

  it('la coquille V1 appelle `zoneInitiale`', () => {
    expect(
      lire('../v2Bootstrap.ts').includes('zoneInitiale('),
      'v2Bootstrap a de nouveau sa propre règle de sélection de zone'
    ).toBe(true);
  });

  it('l interface actuelle aussi', () => {
    expect(
      lire('../../App.svelte').includes('zoneInitiale('),
      'App.svelte a de nouveau sa propre règle : les deux vont redivergier'
    ).toBe(true);
  });

  it('plus aucune des deux ne retombe sur `list[0]` à la main', () => {
    expect(lire('../v2Bootstrap.ts')).not.toContain('list[0].id');
  });
});
