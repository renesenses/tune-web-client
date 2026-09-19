// @vitest-environment jsdom
//
// jsdom est indispensable ici : sans `window`, le runtime client de Svelte
// n'installe pas son ordonnanceur et `$effect` ne se déclenche JAMAIS, même
// après `flushSync`. Un test de réactivité écrit en environnement `node`
// passerait au vert sans avoir rien exécuté — pire qu'un test absent. Le reste
// de la suite reste en `node` (voir `streamingNavScope.test.ts`, qui a payé
// cette découverte).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PLAFOND_OUVERTURE_MS } from '../ouvertureFlux';
import { bancOuverture, vider } from './ouvertureCablage.svelte';

// Préfixés : `it` seul écraserait le `it` de Vitest, et chaque `it(...)` du
// fichier appellerait le dictionnaire italien.
import lFr from '../locales/fr';
import lDe from '../locales/de';
import lEn from '../locales/en';
import lEs from '../locales/es';
import lHu from '../locales/hu';
import lIt from '../locales/it';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lZh from '../locales/zh';

/**
 * Second volet de `renesenses/tune-server-rust#2267` — le MINI-LECTEUR.
 *
 * Demande de DEvir, stub forum #164, juin 2026, en deux morceaux. Le premier
 * (une animation sur la barre de lecture) est parti dans v0.9.114. Le second
 * ne l'était pas :
 *
 *   « État "Chargement..." dans le mini-lecteur — le titre affiche
 *     "Chargement..." avec une animation subtile au lieu de rester figé. »
 *
 * Ce qu'on voyait à la place : « Aucune lecture ». Pas un texte figé — le
 * CONTRAIRE de ce qui se passe, alors que le serveur a accepté la demande et
 * cherche une URL jouable. 32 secondes mesurées chez un testeur sur une
 * extraction YouTube (#1359), pendant lesquelles l'écran affirme que rien
 * n'est en cours.
 *
 * Aucune ligne de Rust : `ZoneState.resolving`
 * (`tune-core/src/playback/mod.rs:132`) porte déjà l'information et arrive
 * jusqu'au client (`Zone.resolving`, `src/lib/types.ts`).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Le câblage, éprouvé pour de vrai — pas seulement lu dans la source.
//
// `ouvertureFlux.test.ts` couvre la DÉCISION (`suivreOuverture`, pure). Ce qui
// suit couvre l'autre moitié, celle qui touche à Svelte et que personne ne
// vérifiait : l'état tenu entre deux appels, le battement de l'horloge, et la
// dépendance de l'effet.
// ─────────────────────────────────────────────────────────────────────────────
describe('suiviOuverture — le câblage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("s'allume sur le drapeau du serveur et s'éteint à la lecture", () => {
    const banc = bancOuverture({ state: 'stopped', resolving: false });
    expect(banc.visible).toBe(false);

    banc.poserZone({ state: 'stopped', resolving: true });
    expect(banc.visible).toBe(true);

    banc.poserZone({ state: 'playing', resolving: false });
    expect(banc.visible).toBe(false);
    banc.stop();
  });

  it("s'éteint tout seul quand PLUS AUCUNE nouvelle n'arrive du serveur", () => {
    // Le cas qui justifie le battement d'horloge, et que rien ne vérifiait :
    // `SUPERSEDED_BEFORE_TRANSCODE` (`orchestrator.rs:1530-1541`) sort en
    // laissant volontairement le drapeau levé, et une WebSocket coupée fige le
    // store sur la dernière valeur reçue. Dans les deux cas la zone n'est plus
    // JAMAIS remplacée : sans minuteur, l'indicateur tourne pour toujours.
    //
    // On ne repose donc aucune zone ici. Seul le temps passe.
    const banc = bancOuverture({ state: 'stopped', resolving: true });
    expect(banc.visible).toBe(true);

    vi.advanceTimersByTime(PLAFOND_OUVERTURE_MS - 2_000);
    vider();
    expect(banc.visible).toBe(true);

    vi.advanceTimersByTime(4_000);
    vider();
    expect(banc.visible).toBe(false);
    banc.stop();
  });


  it("ne se réveille pas sur sa propre écriture (#2555)", () => {
    // La sonde de la dépendance. Le corps de l'effet LIT l'état précédent puis
    // l'ÉCRIT ; sans `untrack`, il s'inscrit lui-même dans ses dépendances et
    // se replanifie — c'est le mécanisme qui a levé
    // `effect_update_depth_exceeded`, ARRÊTÉ l'ordonnanceur de rendu de Svelte,
    // et fait dire à cinq testeurs « il faut faire F5 ».
    //
    // Aucun minuteur n'avance ici : chaque lecture de la zone est donc une
    // exécution du corps de l'effet. Entrer en ouverture change l'état, donc
    // doit coûter UNE exécution — pas deux.
    const banc = bancOuverture({ state: 'stopped', resolving: false });
    banc.remettreCompteur();

    banc.poserZone({ state: 'stopped', resolving: true });
    expect(banc.visible).toBe(true);
    expect(banc.lectures).toBe(1);
    banc.stop();
  });

  it('libère son minuteur quand le composant disparaît', () => {
    const banc = bancOuverture({ state: 'stopped', resolving: true });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    banc.stop();
    vider();
    expect(vi.getTimerCount()).toBe(0);
  });
});

