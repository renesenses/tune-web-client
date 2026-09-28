/**
 * LES DEUX BARRES DE PROGRESSION DISENT LA MÊME CHOSE — Sevy Tabroc, 28/09/2026.
 *
 * > « Pas de synchro entre la barre de progression de la transport bar et celle
 * > affichée dans le widget de la première ligne de la homepage. »
 *
 * ## Ce qui n'allait pas, et que le correctif de la veille n'avait PAS réglé
 *
 * #1711 avait traité « le temps reste à 0:00 ». Sevy décrit autre chose : les
 * deux barres bougent, mais pas ensemble. Trois causes, toutes structurelles :
 *
 *  1. deux SOURCES — la barre lit `seekPositionMs`, nourri par le flux
 *     `playback.position` ; la carte lisait `zone.position_ms`, qui ne bouge
 *     qu'à l'arrivée d'un `zone.updated` ;
 *  2. deux MINUTEURS d'une seconde, démarrés à des instants différents : ils ne
 *     se rattrapent jamais, d'où 1:23 d'un côté et 1:24 de l'autre ;
 *  3. le DÉPLACEMENT du curseur n'atteignait pas la carte : `playback.seek`
 *     était filtré sur la zone courante et n'allait nulle part ailleurs.
 *
 * ## Ce que le serveur donne — vérifié dans sa source, pas supposé
 *
 * `tune-server/src/routes/ws.rs` diffuse CHAQUE évènement de lecture à tous les
 * clients, estampillé de son `zone_id`, sans aucun filtrage. Le poller publie
 * la position RETENUE, celle que sert `GET /zones`, explicitement pour que
 * l'évènement et la route ne divergent pas. Le flux existait donc pour toutes
 * les zones : c'est le client qui le jetait.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ancrerPosition, positionsZones, positionMaintenant, ancrerDepuisZone } from '../positionsZones';
import { zones } from '../stores/zones';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const zoneQuiJoue = (id: number, position_ms: number) => ({
  id,
  state: 'playing',
  position_ms,
  current_track: { track_id: 7, title: 'Aja', duration_ms: 480_000, source: 'local' },
});

let arreter: (() => void) | null = null;

/**
 * 🔴 L'HORLOGE EST FIGÉE, et ce n'est pas un confort.
 *
 * La valeur publiée est INTERPOLÉE à l'instant de la lecture : entre le moment
 * où le test pose une zone et celui où il lit le magasin, quelques
 * millisecondes de vraie horloge se sont écoulées, et l'égalité exacte échoue
 * — ce témoin l'a fait, en attendant 0 et en trouvant 1. Une tolérance aurait
 * masqué la mesure ; une horloge figée la rend exacte, et permet en prime de
 * faire avancer le temps à la demande.
 */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
  zones.set([]);
  // Un abonné : c'est lui qui arme le magasin (et son minuteur).
  arreter = positionsZones.subscribe(() => {});
});

afterEach(() => {
  arreter?.();
  arreter = null;
  zones.set([]);
  vi.useRealTimers();
});

describe('🔴 le flux `playback.position` nourrit TOUTES les zones', () => {
  it('une position annoncée pour une zone la fait avancer aussitôt', () => {
    zones.set([zoneQuiJoue(4, 0)] as any);
    expect(get(positionsZones)[4], 'la zone part de ce que dit /zones').toBe(0);

    // Ce que le serveur émet une fois par relevé, pour CETTE zone.
    ancrerPosition(4, 125_000);
    expect(get(positionsZones)[4], 'le flux n’a pas atteint la carte').toBe(125_000);
  });

  it('🔴 elle nourrit une zone qui n’est PAS la zone courante', () => {
    // C'est tout l'objet du correctif : `v2Live` jetait ces messages, et les
    // cartes des zones voisines n'avaient aucune source vivante.
    zones.set([zoneQuiJoue(4, 0), zoneQuiJoue(9, 0)] as any);
    ancrerPosition(9, 61_000);
    expect(get(positionsZones)[9]).toBe(61_000);
    expect(get(positionsZones)[4], 'la mauvaise zone a bougé').toBe(0);
  });

  it('un déplacement RECULE la carte, il ne fait pas qu’avancer', () => {
    zones.set([zoneQuiJoue(4, 200_000)] as any);
    ancrerPosition(4, 12_000);
    expect(get(positionsZones)[4]).toBe(12_000);
  });

  it('une zone inconnue du magasin est ignorée, sans exploser', () => {
    // On ne fabrique pas une ancre sans savoir de quelle piste ni de quelle
    // durée on parle : `zones` la posera au premier relevé.
    expect(() => ancrerPosition(999, 5_000)).not.toThrow();
    expect(get(positionsZones)[999]).toBeUndefined();
  });

  it('🔴 elle AVANCE toute seule entre deux messages du serveur', () => {
    // C'est ce qui remplace l'ancien `zone.position_ms` figé : le flux ancre,
    // le minuteur compte. Sans lui, la carte attendrait le message suivant.
    zones.set([zoneQuiJoue(4, 0)] as any);
    ancrerPosition(4, 10_000);
    vi.advanceTimersByTime(3_000);
    expect(get(positionsZones)[4]).toBe(13_000);
  });

  it('une charge malformée ne casse rien', () => {
    zones.set([zoneQuiJoue(4, 0)] as any);
    ancrerPosition(undefined, 1_000);
    ancrerPosition(4, undefined);
    ancrerPosition(4, 'plus tard');
    expect(get(positionsZones)[4], 'une valeur invalide a été gobée').toBe(0);
  });

  it('la position annoncée repart de zéro pour compter — pas de double avance', () => {
    const a = ancrerDepuisZone(undefined, zoneQuiJoue(4, 0) as any, 0);
    expect(positionMaintenant(a, 30_000)).toBe(30_000);
  });
});

describe('🔴 la zone COURANTE lit le nombre de la barre de lecture', () => {
  const carte = sansCommentaires(lire('src/components/v2/ligne1/CarteZoneL1.svelte'));
  const barre = lire('src/components/partages/TransportBar.svelte');

  it('la barre affiche bien `seekPositionMs` — la prémisse du correctif', () => {
    // Si la barre changeait de source, ce correctif deviendrait faux sans que
    // rien ne le dise. C'est la garde de la PRÉMISSE, pas du correctif.
    expect(barre).toContain('{formatTime($seekPositionMs)}');
  });

  it('et la carte lit LE MÊME nombre pour cette zone', () => {
    expect(carte).toContain('$seekPositionMs');
    expect(carte).toContain('estCourante');
    // Deux horloges nourries à la même source s'écartent quand même ; un seul
    // nombre ne le peut pas.
    const i = carte.indexOf('const positionMs');
    const bloc = carte.slice(i, i + 260);
    expect(bloc, 'la zone courante ne passe plus par seekPositionMs').toContain('$seekPositionMs');
  });

  it('les AUTRES zones passent par le magasin, que `seekPositionMs` ne sait pas décrire', () => {
    const i = carte.indexOf('const positionMs');
    expect(carte.slice(i, i + 260)).toContain('$positionsZones[');
  });
});

describe('🔴 v2Live ne jette plus le flux des autres zones', () => {
  const src = sansCommentaires(lire('src/lib/v2Live.ts'));

  it('`playback.position` est ancrée AVANT le filtre de zone courante', () => {
    const i = src.indexOf("type === 'playback.position'");
    expect(i).toBeGreaterThan(-1);
    const bloc = src.slice(i, src.indexOf('return;', i));
    const iAncre = bloc.indexOf('ancrerPosition(');
    const iFiltre = bloc.indexOf('concerneLaZoneCourante');
    expect(iAncre, 'le flux n’est plus ancré du tout').toBeGreaterThan(-1);
    expect(iAncre, 'l’ancrage est derrière le filtre : les autres zones sont muettes')
      .toBeLessThan(iFiltre);
  });

  it('`playback.seek` aussi — sinon la carte garde l’ancien point', () => {
    const i = src.indexOf("type === 'playback.seek'");
    const bloc = src.slice(i, src.indexOf('return;', i));
    const iAncre = bloc.indexOf('ancrerPosition(');
    const iFiltre = bloc.indexOf('concerneLaZoneCourante');
    expect(iAncre).toBeGreaterThan(-1);
    expect(iAncre).toBeLessThan(iFiltre);
  });

  it('le filtre de zone courante SUBSISTE pour `seekPositionMs`', () => {
    // Il protège la barre de lecture, qui ne parle que d'une zone et porte en
    // plus le déplacement manuel. Le retirer ferait sauter la barre à la
    // position d'une zone voisine.
    const i = src.indexOf("type === 'playback.position'");
    const bloc = src.slice(i, src.indexOf('return;', i));
    expect(bloc).toContain('concerneLaZoneCourante(event)');
    expect(bloc).toContain('seekPositionMs.set');
  });
});
