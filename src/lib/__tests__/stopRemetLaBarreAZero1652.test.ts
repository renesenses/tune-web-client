/**
 * web#1652 — Didier, fil 1983 : après « Arrêter », la barre d'avancement
 * restait à 1:36.
 *
 * Le serveur conserve `position_ms` à l'arrêt, mais en session Lecture après
 * Stop relance la piste depuis 0:00 (`reprise_applicable` ne vaut que pour la
 * position restaurée au démarrage, test serveur
 * `sans_marqueur_la_lecture_repart_de_zero`). La barre affichait donc une
 * position que Lecture n'honore pas.
 *
 * On rejoue les relevés de zone tels que `v2Live.suivreProgression` les passe
 * à la règle partagée.
 */
import { describe, it, expect } from 'vitest';
import { positionApresReleve, type SuiviPosition } from '../positionLecture';

const DERIVE = 3000;
const zone = (pos: number, etat: string) => ({
  current_track: { id: 42, source: 'local', source_id: null, title: 'Inner City Blues' },
  position_ms: pos,
  state: etat,
});

/** Rejoue une suite de relevés, rend les positions affichées. */
function rejouer(depart: SuiviPosition, releves: [number, string][]): number[] {
  let s = depart;
  const affichees: number[] = [];
  for (const [pos, etat] of releves) {
    const d = positionApresReleve(s, zone(pos, etat), s.positionMs, DERIVE);
    s = d.suivi;
    affichees.push(s.positionMs);
  }
  return affichees;
}

const CLE = 'id:42';

describe('web#1652 — Stop ramène la barre à 0:00', () => {
  it('🔴 le cas de Didier : lecture à 1:36, Stop → 0:00, et elle y reste', () => {
    const affichees = rejouer({ clePiste: CLE, positionMs: 0 }, [
      [96_000, 'playing'],
      [96_000, 'stopped'], // le relevé qui suit « Arrêter » : le serveur garde 96 000
      [96_000, 'stopped'], // et le répète aux relevés suivants
      [96_000, 'stopped'],
    ]);
    expect(affichees[0]).toBe(96_000);
    expect(affichees.slice(1), 'la barre reste à la position d’avant l’arrêt').toEqual([0, 0, 0]);
  });

  it('depuis la pause aussi : Pause puis Stop → 0:00', () => {
    const affichees = rejouer({ clePiste: CLE, positionMs: 0 }, [
      [96_000, 'playing'], [96_000, 'paused'], [96_000, 'stopped'],
    ]);
    expect(affichees).toEqual([96_000, 96_000, 0]);
  });

  it('Lecture après Stop : la piste repart de 0, la barre avec elle', () => {
    const affichees = rejouer({ clePiste: CLE, positionMs: 0 }, [
      [96_000, 'playing'], [96_000, 'stopped'], [1_000, 'playing'],
    ]);
    expect(affichees).toEqual([96_000, 0, 0]);
  });
});

describe('web#1652 — CONTRE-ÉPREUVES : ce qui ne doit PAS repartir à zéro', () => {
  /**
   * #2876 : au démarrage, le serveur restaure `last_position_ms` et Lecture
   * reprend bien là. Une zone trouvée déjà arrêtée garde donc sa position.
   */
  it('une zone trouvée DÉJÀ arrêtée garde la position du serveur', () => {
    const affichees = rejouer({ clePiste: CLE, positionMs: 0 }, [
      [151_000, 'stopped'], [151_000, 'stopped'],
    ]);
    expect(affichees).toEqual([151_000, 151_000]);
  });

  it('la pause garde sa position', () => {
    const affichees = rejouer({ clePiste: CLE, positionMs: 0 }, [
      [96_000, 'playing'], [96_000, 'paused'], [96_000, 'paused'],
    ]);
    expect(affichees).toEqual([96_000, 96_000, 96_000]);
  });

  it('un déplacement du curseur APRÈS l’arrêt est suivi, pas écrasé par zéro', () => {
    const affichees = rejouer({ clePiste: CLE, positionMs: 0 }, [
      [96_000, 'playing'], [96_000, 'stopped'], [200_000, 'stopped'], [200_000, 'stopped'],
    ]);
    expect(affichees).toEqual([96_000, 0, 200_000, 200_000]);
  });
});
