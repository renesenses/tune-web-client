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

  it('garde son minuteur malgré le flot de mises à jour du serveur', () => {
    // Pendant une ouverture, la WebSocket continue de pousser des `zone.updated`
    // et `App.svelte` remplace le store EN BLOC (`zones.set(zoneList)`) : la
    // zone est un objet NEUF à chaque passage, plusieurs fois par seconde.
    //
    // Si le minuteur dépendait de la zone, il serait détruit et réarmé à chaque
    // poussée — donc remis à zéro avant d'avoir jamais battu. Le plafond ne
    // tomberait alors JAMAIS tant que le serveur parle, ce qui est précisément
    // le cas d'un drapeau bloqué sur une WebSocket vivante
    // (`SUPERSEDED_BEFORE_TRANSCODE`, `orchestrator.rs:1530-1541`).
    const poser = vi.spyOn(globalThis, 'setInterval');
    const banc = bancOuverture({ state: 'stopped', resolving: true });

    // Le serveur répète la même chose, dans un objet différent, tout du long.
    for (let t = 0; t < PLAFOND_OUVERTURE_MS + 5_000; t += 500) {
      banc.poserZone({ state: 'stopped', resolving: true });
      vi.advanceTimersByTime(500);
      vider();
    }

    expect(poser).toHaveBeenCalledTimes(1);
    expect(banc.visible).toBe(false);

    banc.stop();
    poser.mockRestore();
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

// ─────────────────────────────────────────────────────────────────────────────
// 2. Le mini-lecteur lui-même.
//
// Il n'y a ni `@testing-library/svelte` ni test de rendu dans ce dépôt : on lit
// la source du composant, comme le font déjà `lecteurInfobulles.test.ts` et
// `ouvertureFlux.test.ts`. Sans cette garde, tout ce qui précède resterait vert
// avec un module écrit, testé et jamais importé — l'histoire exacte de la clé
// `zone.buffering`, traduite dans onze langues et référencée nulle part.
// ─────────────────────────────────────────────────────────────────────────────
describe('MiniPlayer.svelte — le titre dit ce qui se passe', () => {
  const SOURCE = readFileSync(
    resolve(__dirname, '../../components/MiniPlayer.svelte'),
    'utf8',
  );
  const MARQUAGE = SOURCE.slice(0, SOURCE.indexOf('<style>'));
  const STYLE = SOURCE.slice(SOURCE.indexOf('<style>'));

  it('branche le suivi partagé sur la zone courante', () => {
    expect(SOURCE).toMatch(/from\s+['"]\.\.\/lib\/ouvertureFlux\.svelte['"]/);
    expect(SOURCE).toContain('suiviOuverture');
  });

  it("remplace le titre pendant l'ouverture, au lieu d'annoncer « aucune lecture »", () => {
    // Le point de la demande : c'est le TITRE qui change, pas un badge de plus
    // ajouté à côté. Les deux branches doivent donc sortir au même endroit.
    expect(MARQUAGE).toMatch(/ouverture\s*\?\s*\$t\('zone\.buffering'\)/);
    expect(MARQUAGE).toContain("nowplaying.noPlayback");
    expect(MARQUAGE).toMatch(/class="mini-title[^"]*"[^>]*>\{titreAffiche\}</);
  });

  it("le dit aussi aux technologies d'assistance", () => {
    // Une opacité qui respire ne dit rien à un lecteur d'écran.
    expect(MARQUAGE).toMatch(/aria-busy=\{ouverture\}/);
  });

  it("porte une animation subtile, retirée si l'utilisateur refuse le mouvement", () => {
    expect(STYLE).toContain('.mini-title.ouverture');
    expect(STYLE).toContain('prefers-reduced-motion');
  });

  it("n'invente aucune clé : `zone.buffering` existait, morte, dans les 11 langues", () => {
    // Elle avait été posée par anticipation pour cette demande précise, puis
    // oubliée. Le corps de l'issue la relevait comme orpheline ; elle reprend
    // ici son emploi.
    const langues = {
      fr: lFr, de: lDe, en: lEn, es: lEs, hu: lHu, it: lIt,
      ja: lJa, ko: lKo, ro: lRo, sv: lSv, zh: lZh,
    } as unknown as Record<string, Record<string, string>>;
    for (const [code, dict] of Object.entries(langues)) {
      expect(dict['zone.buffering'], `zone.buffering manque en ${code}`).toBeTruthy();
    }
    expect(lFr['zone.buffering']).toBe('Chargement');
  });
});
