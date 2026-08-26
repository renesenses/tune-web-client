import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ETAT_OUVERTURE_INITIAL,
  PLAFOND_OUVERTURE_MS,
  suivreOuverture,
} from '../ouvertureFlux';

/**
 * Retour visuel pendant l'ouverture d'un flux — `renesenses/tune-server-rust#2267`.
 *
 * Demande de DEvir (forum, fil `suggestion-ui-etape-3`) : quand un flux met du
 * temps à s'ouvrir, la barre de lecture reste figée et rien ne dit que quelque
 * chose se passe. Son argument est de ne PAS toucher au moteur audio — c'est
 * l'attente *perçue* qui est en cause, pas la latence réelle.
 *
 * L'information existe déjà côté serveur : `ZoneState.resolving`
 * (`tune-core/src/playback/mod.rs:132`), sérialisé sur `/zones`
 * (`routes/zones.rs:1438`), `/zones/{id}` (`:1609`), `/playback`
 * (`routes/playback.rs:285`) et le snapshot WebSocket (`routes/ws.rs:137`).
 * Le client le reçoit déjà (`Zone.resolving`, `src/lib/types.ts:296`).
 *
 * Ce test fixe les trois règles qui comptent, dont la troisième est celle qui
 * décide si la fonctionnalité vaut mieux que rien :
 *
 *   1. l'indicateur apparaît pendant l'ouverture ;
 *   2. il disparaît dès que la lecture démarre ;
 *   3. il disparaît AUSSI quand l'ouverture échoue ou n'aboutit jamais.
 *
 * Un indicateur qui reste allumé indéfiniment est pire que pas d'indicateur :
 * il transforme « je ne sais pas » en « c'est cassé ».
 */

describe('suivreOuverture — apparition', () => {
  it("s'allume quand le serveur annonce une résolution en cours", () => {
    const etat = suivreOuverture(
      ETAT_OUVERTURE_INITIAL,
      { state: 'stopped', resolving: true },
      1_000,
    );
    expect(etat.visible).toBe(true);
    expect(etat.depuisMs).toBe(1_000);
  });

  it("garde l'instant du DÉBUT de l'ouverture, pas celui du dernier tick", () => {
    const debut = suivreOuverture(
      ETAT_OUVERTURE_INITIAL,
      { state: 'stopped', resolving: true },
      1_000,
    );
    const suite = suivreOuverture(debut, { state: 'stopped', resolving: true }, 9_000);
    expect(suite.depuisMs).toBe(1_000);
    expect(suite.visible).toBe(true);
  });

  it('reste allumé pendant les 32 s mesurées sur une extraction YouTube (#1359)', () => {
    const debut = suivreOuverture(
      ETAT_OUVERTURE_INITIAL,
      { state: 'stopped', resolving: true },
      0,
    );
    const trenteDeuxSecondes = suivreOuverture(
      debut,
      { state: 'stopped', resolving: true },
      32_000,
    );
    expect(trenteDeuxSecondes.visible).toBe(true);
  });

  it("ne s'allume pas quand rien ne s'ouvre", () => {
    expect(
      suivreOuverture(ETAT_OUVERTURE_INITIAL, { state: 'stopped', resolving: false }, 1_000)
        .visible,
    ).toBe(false);
    expect(suivreOuverture(ETAT_OUVERTURE_INITIAL, { state: 'paused' }, 1_000).visible).toBe(
      false,
    );
    expect(suivreOuverture(ETAT_OUVERTURE_INITIAL, null, 1_000).visible).toBe(false);
    expect(suivreOuverture(ETAT_OUVERTURE_INITIAL, undefined, 1_000).visible).toBe(false);
  });
});

describe('suivreOuverture — extinction à la lecture', () => {
  it("s'éteint dès que le serveur abaisse le drapeau", () => {
    const ouverture = suivreOuverture(
      ETAT_OUVERTURE_INITIAL,
      { state: 'stopped', resolving: true },
      1_000,
    );
    expect(ouverture.visible).toBe(true);

    // `PlaybackManager::play` pose `resolving = false` et `state = Playing`
    // dans la même section critique (`tune-core/src/playback/mod.rs:492-493`).
    const lecture = suivreOuverture(ouverture, { state: 'playing', resolving: false }, 4_000);
    expect(lecture.visible).toBe(false);
    expect(lecture.depuisMs).toBeNull();
  });

  it("ne se superpose jamais à une barre qui avance vraiment", () => {
    // Enchaînement de piste : le serveur résout la suivante pendant que la
    // précédente s'entend encore. La barre montre alors une vraie position ;
    // une animation par-dessus annoncerait une attente qui n'existe pas.
    const etat = suivreOuverture(
      ETAT_OUVERTURE_INITIAL,
      { state: 'playing', resolving: true },
      1_000,
    );
    expect(etat.visible).toBe(false);
  });
});

describe("suivreOuverture — l'ouverture qui échoue ou n'aboutit jamais", () => {
  it("s'éteint quand l'ouverture échoue et que la zone retombe à l'arrêt", () => {
    // Tous les chemins d'erreur de l'orchestrateur abaissent le drapeau :
    // `orchestrator.rs:1513` et `:1538`, puis `stop()` (`playback/mod.rs:554`).
    const ouverture = suivreOuverture(
      ETAT_OUVERTURE_INITIAL,
      { state: 'stopped', resolving: true },
      1_000,
    );
    const echec = suivreOuverture(ouverture, { state: 'stopped', resolving: false }, 3_000);
    expect(echec.visible).toBe(false);
    expect(echec.depuisMs).toBeNull();
  });

  it("s'éteint tout seul quand le drapeau reste levé au-delà du plafond", () => {
    // Deux trous que le client ne peut pas voir :
    //  — `SUPERSEDED_BEFORE_TRANSCODE` (`orchestrator.rs:1530-1541`) sort en
    //    laissant VOLONTAIREMENT le drapeau levé (la lecture gagnante le
    //    possède) ; si la gagnante n'aboutit pas, plus personne ne l'abaisse ;
    //  — une coupure WebSocket fige le store sur la dernière valeur reçue.
    // Dans les deux cas le client garderait un indicateur allumé pour
    // toujours. Il doit donc porter sa propre durée de vie.
    const debut = suivreOuverture(
      ETAT_OUVERTURE_INITIAL,
      { state: 'stopped', resolving: true },
      0,
    );
    const bloque = suivreOuverture(
      debut,
      { state: 'stopped', resolving: true },
      PLAFOND_OUVERTURE_MS,
    );
    expect(bloque.visible).toBe(false);

    const bienPlusTard = suivreOuverture(
      bloque,
      { state: 'stopped', resolving: true },
      PLAFOND_OUVERTURE_MS * 10,
    );
    expect(bienPlusTard.visible).toBe(false);
  });

  it('ne se rallume pas tant que le drapeau bloqué ne retombe pas', () => {
    let etat = suivreOuverture(ETAT_OUVERTURE_INITIAL, { state: 'stopped', resolving: true }, 0);
    for (let t = 1_000; t <= PLAFOND_OUVERTURE_MS * 3; t += 1_000) {
      etat = suivreOuverture(etat, { state: 'stopped', resolving: true }, t);
      if (t >= PLAFOND_OUVERTURE_MS) expect(etat.visible).toBe(false);
    }

    // Le drapeau retombe enfin, puis une VRAIE nouvelle ouverture démarre :
    // le plafond doit être réarmé, sinon la garde anti-blocage aurait éteint
    // l'indicateur pour le reste de la session.
    const repos = suivreOuverture(etat, { state: 'stopped', resolving: false }, 200_000);
    expect(repos.depuisMs).toBeNull();
    const relance = suivreOuverture(repos, { state: 'stopped', resolving: true }, 201_000);
    expect(relance.visible).toBe(true);
  });

  it('plafonne au-dessus de la plus longue attente légitime observée', () => {
    // 32 s mesurées sur yt-dlp (#1359) et ~23 s sur un pré-transcodage
    // HI-RES DASH (#1146, d'où `PLAY_GRACE_MS = 30000` dans stores/zones.ts).
    // Un plafond sous ces valeurs éteindrait une attente parfaitement normale.
    expect(PLAFOND_OUVERTURE_MS).toBeGreaterThan(32_000);
  });
});

/**
 * La garde de câblage.
 *
 * Sans elle, tout ce qui précède pourrait rester vert avec un module écrit,
 * testé, et jamais importé par la barre — c'est exactement l'histoire de la
 * clé `zone.buffering`, traduite dans onze langues et référencée nulle part.
 * Il n'y a ni `@testing-library/svelte` ni test de rendu dans ce dépôt : on
 * lit donc la source du composant, comme le fait déjà
 * `bandcampInfobulles.test.ts`.
 */
describe('SeekBar.svelte — le câblage existe', () => {
  const SOURCE = readFileSync(
    resolve(__dirname, '../../components/SeekBar.svelte'),
    'utf8',
  );

  it('importe le suivi et le branche sur la zone courante', () => {
    expect(SOURCE).toMatch(/from\s+['"]\.\.\/lib\/ouvertureFlux['"]/);
    expect(SOURCE).toContain('suivreOuverture');
  });

  it("marque la barre pendant l'ouverture, et le dit aux technologies d'assistance", () => {
    const marquage = SOURCE.slice(0, SOURCE.indexOf('<style>'));
    // Un état visuel de la barre existante — pas un composant de plus.
    // `class:ouverture` (forme abrégée) autant que `class:ouverture={…}`.
    expect(marquage).toMatch(/class:ouverture\b/);
    // Un indicateur purement visuel ne dit rien à un lecteur d'écran.
    expect(marquage).toMatch(/aria-busy=/);
  });

  it('réemploie la clé i18n déjà traduite plutôt que d\'en inventer une', () => {
    expect(SOURCE).toContain('zone.resolving');
  });

  it("porte une animation, et la retire quand l'utilisateur refuse le mouvement", () => {
    const style = SOURCE.slice(SOURCE.indexOf('<style>'));
    expect(style).toContain('.seek-track.ouverture');
    expect(style).toContain('prefers-reduced-motion');
  });
});
