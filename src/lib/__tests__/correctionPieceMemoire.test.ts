// @vitest-environment jsdom
/**
 * Retours de Didier et Sandro (rc13.90) — ce que l'écran retrouve en y
 * revenant, zone par zone, et ce qu'il dit APPLIQUÉ à la zone.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  lireSaisie, ecrireSaisie, cleSaisie, lireMemoireMicro, ecrireMemoireMicro, sessionsConnues,
  derniereMesureTerminee, etatCorrection, type ProfilPiece,
} from '../correctionPieceMemoire';
import { PIECE_DEFAUT, SURFACES_DEFAUT, type Avancement, type VueSession } from '../correctionPiece';

beforeEach(() => localStorage.clear());

describe('saisie sans micro, gardée par zone', () => {
  it('se relit telle quelle, et une zone ne voit pas la saisie d’une autre', () => {
    const s = {
      piece: { longueur_m: 6.2, largeur_m: 4.1, hauteur_m: 2.6 },
      surfaces: { ...SURFACES_DEFAUT, sol: 'reflechissante' as const },
      placement: { auditeur: { x: 3.8, y: 2, z: 1.1 }, enceintes: [{ x: 0.8, y: 1, z: 0.9 }, { x: 0.8, y: 3, z: 0.9 }] },
      cible: 'harman' as const, expert: { bandes_max: 6, coupe_max_db: 9 }, simulee: true,
    };
    ecrireSaisie(7, s);
    expect(lireSaisie(7)).toEqual(s);
    expect(lireSaisie(8)).toBeNull();
  });

  it('une saisie illisible ou abîmée est ignorée, pas propagée', () => {
    localStorage.setItem(cleSaisie(7), '{pas du json');
    expect(lireSaisie(7)).toBeNull();
    localStorage.setItem(cleSaisie(7), JSON.stringify({ piece: PIECE_DEFAUT, surfaces: { avant: 'beton' } }));
    expect(lireSaisie(7)).toBeNull();
  });
});

describe('dernière mesure au micro', () => {
  const av = (id: string, zone: number, etat: Avancement['etat']): Avancement =>
    ({ id, zone_id: zone, entree: 'umik', etat, progression: 1, avertissements: [] });
  const session = (id: string, zone: number, mesures: string[] = []): VueSession => ({
    version: 2, id, zone_id: zone, positions_prevues: 3, centrale: 0, positions: [],
    etats: mesures.map((m, index) => ({ index, mesure_id: m, etat: 'terminee' })),
  } as VueSession);

  it('la dernière terminée de la zone, hors positions de session', () => {
    const liste = [av('m1', 3, 'terminee'), av('m2', 3, 'terminee'), av('m3', 3, 'refusee'), av('m4', 4, 'terminee'), av('m5', 3, 'terminee')];
    expect(derniereMesureTerminee(liste, 3, [session('s1', 3, ['m5'])])?.id).toBe('m2');
    expect(derniereMesureTerminee(liste, 9, null)).toBeNull();
  });

  it('les sessions gardées ne reviennent que si le serveur les connaît encore', () => {
    ecrireMemoireMicro(3, { sessions: { a: 's1', b: 's2' }, cible: 'harman' });
    const m = lireMemoireMicro(3)!;
    expect(m.cible).toBe('harman');
    expect(sessionsConnues(m.sessions, [session('s1', 3), session('s2', 3)], 3)).toEqual({ a: 's1', b: 's2' });
    expect(sessionsConnues(m.sessions, [session('s1', 3)], 3)).toEqual({ a: 's1', b: null });
    // Serveur redémarré : il ne connaît plus rien.
    expect(sessionsConnues(m.sessions, [], 3)).toEqual({ a: null, b: null });
    expect(sessionsConnues(m.sessions, [session('s1', 4)], 3)).toEqual({ a: null, b: null });
  });
});

describe('ce qui est appliqué à la zone', () => {
  const profil: ProfilPiece = {
    name: 'Salon', zone_id: '3', created_at: '2026-11-25T10:00:00Z', origin: 'measured',
    filters: [{ frequency_hz: 50, gain_db: -8, q_factor: 4 }, { frequency_hz: 120, gain_db: -5, q_factor: 6 }],
  };
  it('appliquée quand l’égaliseur actif porte les bandes du profil, enregistrée sinon', () => {
    const eq = { enabled: true, bands: [{ freq: 120, gain: -5, q: 6 }, { freq: 50, gain: -8, q: 4 }] };
    expect(etatCorrection(profil, eq).etat).toBe('appliquee');
    expect(etatCorrection(profil, { ...eq, enabled: false }).etat).toBe('enregistree');
    expect(etatCorrection(profil, { enabled: true, bands: [{ freq: 50, gain: -3, q: 4 }, { freq: 120, gain: -5, q: 6 }] }).etat).toBe('enregistree');
    expect(etatCorrection(null, eq).etat).toBe('aucune');
  });
});
