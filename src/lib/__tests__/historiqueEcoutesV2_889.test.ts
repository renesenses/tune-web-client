/**
 * #889 — « Les morceaux écoutés avec les radios live ne figurent plus dans
 * l’historique depuis le 06/09/2026 » (Reivax66, Tune 0.9.141, Windows).
 *
 * ## Pourquoi la RADIO, et elle seule
 *
 * L’écran fusionne deux sources : le serveur (`/library/history`, alimenté par
 * `listen_history`) et le magasin local. Le serveur n’écrit PAS la radio — une
 * écoute y est indexée sur un identifiant de `tracks`, qu’un titre de radio n’a
 * pas. La radio ne tenait donc que par le magasin local, dont l’unique écrivain
 * vivait dans `App.svelte`. `?v2` monte `ShellV2` à la place : personne.
 *
 * D’où la forme exacte du symptôme — les pistes LOCALES restent à l’écran,
 * servies par le serveur ; la radio disparaît.
 *
 * ## Ce que cette garde tient
 *
 * La règle, en appelant la vraie fonction avec un carnet témoin, et le
 * BRANCHEMENT dans les deux coquilles : sans lui, la règle serait juste et
 * personne ne l’appellerait — exactement l’état d’avant.
 *
 * ## Ce qu’elle ne tient PAS
 *
 * Que le serveur se mette à écrire la radio. C’est l’autre moitié du défaut,
 * elle vit dans `tune-server-rust`, et ce correctif ne la touche pas.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  estDebutDEcoute, concerneLEcoute, noterEcoute, noterSiDebutDEcoute,
} from '../historiqueEcoutes';
import type { Track } from '../types';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
/** `nowPlayingToTrack` : la zone porte un `NowPlaying`, dont l’id est `track_id`. */
const convertir = (np: any): Track => ({ ...np, id: np.track_id ?? np.id ?? null });

/** Un titre entendu à la radio : pas d’identifiant de `tracks`, le flux pour source. */
const TITRE_RADIO = {
  title: 'Blue in Green',
  artist_name: 'Miles Davis',
  source: 'radio',
  source_id: 'http://flux.example/fip.mp3',
  track_id: null,
};

function carnet() {
  const pose: { piste: Track; zone: string }[] = [];
  return { pose, ajouter: (piste: Track, zone: string) => pose.push({ piste, zone }) };
}

describe('#889 — l’historique local des écoutes', () => {
  it('seuls `started` et `track_changed` ouvrent une écoute', () => {
    expect(estDebutDEcoute('playback.started')).toBe(true);
    expect(estDebutDEcoute('playback.track_changed')).toBe(true);
    // `resumed` est la MÊME piste : la noter remplirait l’historique de
    // doublons à chaque pause.
    for (const t of ['playback.resumed', 'playback.paused', 'playback.stopped',
                     'playback.position', 'zone.updated', undefined, null, '']) {
      expect(estDebutDEcoute(t as any), String(t)).toBe(false);
    }
  });

  it('la zone COURANTE est notée', () => {
    expect(concerneLEcoute(7, { id: 7 }, { id: 7 })).toBe(true);
  });

  it('un membre du MÊME groupe multiroom aussi — il joue la même chose', () => {
    expect(concerneLEcoute(9, { id: 7, group_id: 3 }, { id: 9, group_id: 3 })).toBe(true);
  });

  /** 🔴 Une zone qui joue dans une autre pièce ne remplit pas MON historique. */
  it('une autre zone, hors groupe, ne l’est pas', () => {
    expect(concerneLEcoute(9, { id: 7, group_id: null }, { id: 9, group_id: null })).toBe(false);
    expect(concerneLEcoute(9, { id: 7, group_id: 3 }, { id: 9, group_id: 4 })).toBe(false);
  });

  /**
   * 🔴 `null === null` est VRAI en JavaScript : deux zones sans groupe
   * passeraient pour groupées ensemble si `group_id` n’était pas exigé non nul
   * des deux côtés.
   */
  it('deux zones SANS groupe ne sont pas « groupées ensemble »', () => {
    expect(concerneLEcoute(9, { id: 7 }, { id: 9 })).toBe(false);
  });

  it('sans zone courante, rien n’est noté', () => {
    expect(concerneLEcoute(7, null, { id: 7 })).toBe(false);
    expect(concerneLEcoute(null, { id: 7 }, { id: 7 })).toBe(false);
  });

  it('une zone sans piste courante ne note rien', () => {
    const c = carnet();
    expect(noterEcoute({ id: 1, name: 'Salon' }, convertir, c.ajouter)).toBe(false);
    expect(c.pose).toHaveLength(0);
  });

  /** 🔴 LE CAS DE REIVAX66. */
  it('un titre de RADIO est noté, avec le nom de sa zone', () => {
    const c = carnet();
    const note = noterSiDebutDEcoute(
      'playback.track_changed', 4,
      { id: 4, name: 'Salon', current_track: TITRE_RADIO }, { id: 4 },
      convertir, c.ajouter,
    );
    expect(note).toBe(true);
    expect(c.pose).toHaveLength(1);
    expect(c.pose[0].zone).toBe('Salon');
    expect(c.pose[0].piste.title).toBe('Blue in Green');
    // Pas d’identifiant de bibliothèque : c’est précisément ce qui empêche le
    // serveur de l’écrire, et donc ce qui rend le magasin local indispensable.
    expect(c.pose[0].piste.id).toBeNull();
  });

  it('un `resumed` sur la même zone ne note rien', () => {
    const c = carnet();
    expect(noterSiDebutDEcoute(
      'playback.resumed', 4, { id: 4, name: 'Salon', current_track: TITRE_RADIO }, { id: 4 },
      convertir, c.ajouter,
    )).toBe(false);
    expect(c.pose).toHaveLength(0);
  });

  it('une écoute sur une zone étrangère ne note rien', () => {
    const c = carnet();
    expect(noterSiDebutDEcoute(
      'playback.started', 9, { id: 4, name: 'Salon', current_track: TITRE_RADIO }, { id: 9 },
      convertir, c.ajouter,
    )).toBe(false);
    expect(c.pose).toHaveLength(0);
  });

  /**
   * 🔴 LE BRANCHEMENT. La règle juste que personne n’appelle, c’est l’état
   * d’avant — et il était silencieux.
   */
  it('la NOUVELLE coquille l’appelle, après le rechargement des zones', () => {
    const src = lire('src/lib/v2Live.ts');
    expect(src).toContain('noterSiDebutDEcoute');
    expect(src).toContain('playbackHistory');
    // Après `rechargerZones()`, jamais avant : c’est lui qui pose la NOUVELLE
    // piste dans `currentZone`. Noter avant réécrirait l’ancienne.
    expect(src).toMatch(/rechargerZones\(\)\.then\([\s\S]{0,2000}?noterSiDebutDEcoute/);
  });

  it('l’ANCIENNE coquille passe par la même fonction — elles ne divergeront plus', () => {
    const src = lire('src/App.svelte');
    expect(src).toContain('noterSiDebutDEcoute');
    // L’appel direct d’avant a disparu : deux chemins, c’est deux règles.
    expect(src).not.toMatch(/playbackHistory\.add\(nowPlayingToTrack\(/);
  });

  it('le module reste le SEUL décideur : aucune coquille ne refiltre le type', () => {
    for (const f of ['src/lib/v2Live.ts', 'src/App.svelte']) {
      const src = lire(f);
      const i = src.indexOf('noterSiDebutDEcoute(');
      expect(i, f).toBeGreaterThan(-1);
      // Les 400 caractères qui suivent l'appel ne doivent pas re-tester le type.
      expect(src.slice(i, i + 400), f).not.toContain("'playback.started'");
    }
  });
});
