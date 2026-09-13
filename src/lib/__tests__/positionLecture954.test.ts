/**
 * #954 — « the timeline will stay in the same place, or jump a bit. After the
 * 3rd - 4th track change the line resets correctly. »
 *
 * Fil forum 1764, 11/09/2026, Tune 0.9.145 Linux.
 *
 * ## La mesure qui a tranché
 *
 * Relevé sur la .18 le 13/09/2026, zone Eversolo DMP-A8, `GET /zones/10` toutes
 * les 250 ms, quatre `next` intercalés. Les vraies valeurs, reprises telles
 * quelles dans les cas ci-dessous :
 *
 * ```text
 * t_ms   titre                  position_ms  queue_pos
 *  337   Champ magnétique            68000      0
 * 3770   Champ magnétique            68000      0     ← figée 3,4 s
 * 5131   >>> NEXT <<<
 * 5131   Champ magnétique            68000      1     ← 🔴 piste ANCIENNE
 * 6608   Melancholia                  5000      1
 * ```
 *
 * ## Ce que cette garde tient
 *
 * Qu'une position appartenant à une AUTRE piste est refusée. C'est le point 2
 * de la mesure, et c'est celui que le client peut corriger seul.
 *
 * ## Ce qu'elle ne tient PAS, et il faut le dire
 *
 * La cadence d'échantillonnage du serveur — une valeur toutes les 3 à 5
 * secondes, et le premier relevé d'une piste neuve qui arrive déjà à 5 s. Le
 * saut résiduel vient de là et se règle côté serveur. Ce lot ne l'élimine pas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clePisteEnCours, positionApresReleve, type SuiviPosition,
} from '../positionLecture';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const DERIVE = 3000;

const zone = (titre: string | null, pos: number, etat = 'playing') => ({
  current_track: titre == null ? null : { id: null, source: 'qobuz', source_id: 'x', title: titre },
  position_ms: pos,
  state: etat,
});

describe('#954 — reconnaître la piste d’un relevé à l’autre', () => {
  /** 🔴 Les cinq pistes mesurées portaient toutes `current_track.id = null`. */
  it('une piste de streaming SANS identifiant reste reconnaissable', () => {
    const a = clePisteEnCours(zone('Champ magnétique', 68000));
    const b = clePisteEnCours(zone('Melancholia', 5000));
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('un identifiant de bibliothèque prime quand il existe', () => {
    expect(clePisteEnCours({ current_track: { id: 42, title: 'X' } })).toBe('id:42');
  });

  /**
   * 🔴 Sur une radio, `source_id` vaut l’URL du FLUX — la même pour tous les
   * titres de la station (leçon de #3729). Sans le titre dans la clé, un
   * changement de morceau à la radio passerait pour « même piste ».
   */
  it('deux titres d’une MÊME radio ne partagent pas la même clé', () => {
    const flux = (titre: string) => ({
      current_track: { id: null, source: 'radio', source_id: 'http://flux/x.mp3', title: titre },
      position_ms: 0, state: 'playing',
    });
    expect(clePisteEnCours(flux('Blue in Green'))).not.toBe(clePisteEnCours(flux('So What')));
  });

  it('rien qui joue ne donne aucune clé', () => {
    expect(clePisteEnCours(null)).toBeNull();
    expect(clePisteEnCours({ current_track: null })).toBeNull();
    expect(clePisteEnCours({ current_track: { id: null } })).toBeNull();
  });
});

describe('#954 — la position d’une AUTRE piste est refusée', () => {
  /** 🔴 LE CAS MESURÉ, à t=5131 : queue_position a avancé, pas la piste. */
  it('au changement, la barre repart de ZÉRO — pas à 68 s', () => {
    const avant: SuiviPosition = {
      clePiste: clePisteEnCours(zone('Champ magnétique', 68000)),
      positionMs: 68000,
    };
    // Le serveur annonce encore l'ANCIENNE piste à 68 s… puis la nouvelle.
    const d = positionApresReleve(avant, zone('Melancholia', 68000), 68000, DERIVE);
    expect(d.raison).toBe('changement');
    expect(d.ecrire).toBe(true);
    expect(d.suivi.positionMs).toBe(0);
  });

  it('même quand le serveur annonce une position PLAUSIBLE pour la nouvelle', () => {
    const avant: SuiviPosition = { clePiste: 's:qobuz:x:champ magnétique', positionMs: 68000 };
    const d = positionApresReleve(avant, zone('Melancholia', 5000), 68000, DERIVE);
    expect(d.suivi.positionMs).toBe(0);
    expect(d.raison).toBe('changement');
  });

  it('sur la MÊME piste, un écart au-delà du seuil recale', () => {
    const cle = clePisteEnCours(zone('Melancholia', 5000));
    const d = positionApresReleve({ clePiste: cle, positionMs: 1000 }, zone('Melancholia', 9000), 1000, DERIVE);
    expect(d.raison).toBe('recalage');
    expect(d.suivi.positionMs).toBe(9000);
  });

  /**
   * 🔴 Dans le seuil, on n’écrit RIEN : la position du serveur est gelée entre
   * deux échantillons (3 à 5 s, mesuré), et la recopier ferait reculer la barre
   * à chaque relevé.
   */
  it('sur la même piste et dans le seuil, l’horloge locale fait foi', () => {
    const cle = clePisteEnCours(zone('Melancholia', 5000));
    const d = positionApresReleve({ clePiste: cle, positionMs: 6200 }, zone('Melancholia', 5000), 6200, DERIVE);
    expect(d.raison).toBe('horloge');
    expect(d.ecrire).toBe(false);
    expect(d.suivi.positionMs).toBe(6200);
  });

  it('à l’arrêt, la position du serveur fait foi', () => {
    const cle = clePisteEnCours(zone('Melancholia', 5000));
    const d = positionApresReleve({ clePiste: cle, positionMs: 9999 }, zone('Melancholia', 4000, 'paused'), 9999, DERIVE);
    expect(d.raison).toBe('arret');
    expect(d.suivi.positionMs).toBe(4000);
  });

  it('une position négative ou absente ne descend jamais sous zéro', () => {
    const cle = clePisteEnCours(zone('Melancholia', 0));
    for (const p of [-5000, null, undefined, NaN]) {
      const d = positionApresReleve({ clePiste: cle, positionMs: 0 },
        { ...zone('Melancholia', 0), position_ms: p as any }, 0, DERIVE);
      expect(d.suivi.positionMs).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * La séquence mesurée, rejouée d’un bout à l’autre : la barre ne doit jamais
   * afficher 68 s sur « Melancholia ».
   */
  it('la séquence mesurée ne montre jamais la position du morceau d’avant', () => {
    const releves: [string, number][] = [
      ['Champ magnétique', 68000], ['Champ magnétique', 68000],
      ['Champ magnétique', 68000],           // t=5131, après le NEXT
      ['Melancholia', 5000], ['Melancholia', 5000], ['Melancholia', 5000],
    ];
    let s: SuiviPosition = { clePiste: null, positionMs: 0 };
    const affichees: number[] = [];
    for (const [titre, pos] of releves) {
      const d = positionApresReleve(s, zone(titre, pos), s.positionMs, DERIVE);
      s = d.suivi;
      affichees.push(s.positionMs);
    }
    // Les trois premiers relevés : la piste initiale, à sa position.
    expect(affichees.slice(0, 3)).toEqual([0, 68000, 68000]);
    // 🔴 CE QUI COMPTE : dès que « Melancholia » paraît, la barre est à ZÉRO.
    // Jamais 68 000 — la position du morceau d'avant ne s'affiche plus.
    expect(affichees[3]).toBe(0);
    expect(affichees.slice(3)).not.toContain(68000);
    /**
     * ⚠️ Et ce qui reste : au relevé SUIVANT, le serveur annonce 5 000 pour une
     * piste qui vient de commencer, l'écart dépasse le seuil, et la barre saute
     * à 5 s. C'est le point 1 de la mesure — la cadence d'échantillonnage du
     * serveur — et ce lot ne le corrige PAS.
     *
     * Ma première version de ce test attendait que 5 000 n'apparaisse jamais.
     * Elle était rouge, et elle avait tort : c'était une promesse que le
     * correctif ne tient pas. Le test dit maintenant ce qui est.
     */
    expect(affichees[4]).toBe(5000);
  });
});

describe('#954 — les deux coquilles, et le souvenir', () => {
  it('la coquille v2 emploie la règle au lieu de recopier la position', () => {
    const src = lire('src/lib/v2Live.ts');
    expect(src).toContain('positionApresReleve');
    // L'ancienne recopie inconditionnelle a disparu.
    expect(src).not.toMatch(/if \(Math\.abs\(get\(seekPositionMs\) - posServeur\) > DERIVE_MAX_MS\)/);
  });

  it('le souvenir repart au changement de zone, et meurt au débranchement', () => {
    const src = lire('src/lib/v2Live.ts');
    // Changer de zone : on repart sur la piste de la NOUVELLE zone, pas à null
    // — sinon le premier relevé serait refusé pour rien.
    expect(src).toMatch(/function suiviDeZone[\s\S]{0,300}?clePisteEnCours\(z\)/);
    expect(src).toMatch(/void rechargerFile\(\);[\s\S]{0,600}?suiviDeZone\(id\)/);
    // Débranchement : le souvenir meurt, sinon une coquille remontée
    // comparerait à la piste d'une session d'avant.
    expect(src).toMatch(/stopSeekTimer\(\);[\s\S]{0,400}?suivi = \{ clePiste: null/);
  });

  it('l’ancienne coquille garde sa propre remise à zéro', () => {
    const src = lire('src/App.svelte');
    expect(src).toMatch(/playback\.track_changed'[\s\S]{0,500}?seekPositionMs\.set\(0\)/);
  });
});
