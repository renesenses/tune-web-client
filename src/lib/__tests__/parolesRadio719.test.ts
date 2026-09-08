/**
 * #719 — sur une radio, le surlignage karaoké ne bougeait JAMAIS.
 *
 * Mesuré sur le .18 (v0.9.132) le 04/09/2026, zone 10 en cours d'écoute, deux
 * relevés à huit secondes d'intervalle :
 *
 *     position_ms = 0   state = playing   metadata_age_ms = 247323   duration_ms = 0
 *     position_ms = 0   state = playing   metadata_age_ms ≈ 255000   duration_ms = 0
 *
 * `seekPositionMs` reste à zéro pour toujours. Or le serveur rend bien des
 * paroles HORODATÉES (`/lyrics/by-meta` → `[{t_ms: 22780, …}]`) : la matière
 * était là, seule la position manquait.
 *
 * L'ancrage existait déjà — `radioAnchorFrom` — et n'était utilisé QUE par
 * `TvView`. Treizième « écrit mais pas branché ».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { positionParoles, radioAnchorFrom } from '../lyrics';

describe('La position des paroles', () => {
  it('sur une piste ordinaire, c’est la position de la zone', () => {
    expect(positionParoles({
      estRadio: false, positionZoneMs: 42_000, ancrageRadioMs: 0, maintenantMs: 999,
    })).toBe(42_000);
  });

  it('🔴 sur une RADIO, elle ne vient PAS de la zone — celle-ci vaut zéro', () => {
    // C'est le défaut : lire `positionZoneMs` aurait rendu 0, indéfiniment.
    const ancrage = radioAnchorFrom(247_323, 1_000_000);
    expect(positionParoles({
      estRadio: true, positionZoneMs: 0, ancrageRadioMs: ancrage, maintenantMs: 1_000_000,
    })).toBe(247_323);
  });

  it('🔴 et elle AVANCE — c’est tout l’objet du ticket', () => {
    const ancrage = radioAnchorFrom(20_000, 1_000_000);
    const t0 = positionParoles({ estRadio: true, positionZoneMs: 0, ancrageRadioMs: ancrage, maintenantMs: 1_000_000 });
    const t1 = positionParoles({ estRadio: true, positionZoneMs: 0, ancrageRadioMs: ancrage, maintenantMs: 1_008_000 });
    expect(t1 - t0).toBe(8_000);
  });

  it('sans ancrage, on ne devine pas', () => {
    // Une piste arrivée par un événement optimiste n'a pas encore d'âge
    // serveur : mieux vaut zéro qu'une position inventée.
    expect(positionParoles({ estRadio: true, positionZoneMs: 0, ancrageRadioMs: null, maintenantMs: 5_000 })).toBe(0);
    expect(positionParoles({ estRadio: true, positionZoneMs: 0, ancrageRadioMs: undefined, maintenantMs: 5_000 })).toBe(0);
  });

  it('ne rend jamais de position négative', () => {
    // Une horloge locale qui recule (veille, changement d'heure) ne doit pas
    // renvoyer le surlignage avant la première ligne.
    expect(positionParoles({ estRadio: true, positionZoneMs: 0, ancrageRadioMs: 9_000, maintenantMs: 1_000 })).toBe(0);
    expect(positionParoles({ estRadio: false, positionZoneMs: -5, ancrageRadioMs: null, maintenantMs: 0 })).toBe(0);
  });
});

describe('🔴 Le câblage — la règle ne sert à rien si personne ne l’appelle', () => {
  const NP = readFileSync('src/components/NowPlaying.svelte', 'utf8');
  const PANNEAU = readFileSync('src/components/NowPlayingLyrics.svelte', 'utf8');

  it('« En écoute » pose l’ancrage radio', () => {
    expect(NP).toContain('radioAnchorFrom(track.metadata_age_ms, performance.now())');
  });

  it('et transmet la position au panneau des paroles', () => {
    expect(NP).toContain('positionMs={isRadio ? positionRadio : null}');
  });

  it('le panneau la préfère à la position de zone quand elle existe', () => {
    expect(PANNEAU).toContain('const pos = positionMs ?? $seekPositionMs ?? 0;');
  });

  it('la boucle d’animation se coupe au démontage', () => {
    // Un rAF laissé courir sur un écran fermé tourne pour rien, à soixante
    // battements par seconde.
    const bloc = NP.slice(NP.indexOf('let positionRadio'), NP.indexOf('let positionRadio') + 900);
    expect(bloc).toContain('cancelAnimationFrame(raf)');
  });
});
