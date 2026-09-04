import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import {
  creerBandeauLisible,
  avertissementDe,
  BANDEAU_DUREE_MIN_MS,
  type AvertissementBandeau,
} from './bandeauLisible';

/**
 * Le bandeau « aucun onglet ne reçoit le son » s'effaçait à l'instant même où
 * l'utilisateur réagissait (renesenses/tune-server-rust#2588).
 *
 * Sa visibilité était dérivée telle quelle du champ serveur `output_reach`,
 * qui retombe à `"ok"` dès que la zone quitte l'état de lecture
 * (`zones.rs:739-741`). Appuyer sur Arrêt — le geste par lequel on réagit au
 * silence — effaçait donc le seul message qui expliquait ce silence.
 */

const ZONE = 7;
const AUTRE_ZONE = 9;

describe('durée minimale du bandeau', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function bandeau() {
    return creerBandeauLisible(BANDEAU_DUREE_MIN_MS);
  }

  it("s'affiche sans le moindre délai dès que le serveur le signale", () => {
    const b = bandeau();
    b.signaler(ZONE, 'browser_unattended');
    // Pas d'avance d'horloge : rien ne doit temporiser l'APPARITION.
    expect(get(b.affiche)).toBe('browser_unattended');
  });

  // Le cœur de #2588. Sans durée minimale, cette assertion tombe : le serveur
  // dit « ok » et le bandeau disparaît dans la même image.
  it("ne s'efface PAS à l'instant où la zone quitte la lecture", () => {
    const b = bandeau();
    b.signaler(ZONE, 'browser_unattended');
    vi.advanceTimersByTime(300); // l'utilisateur appuie sur Arrêt
    b.signaler(ZONE, 'ok');
    expect(get(b.affiche)).toBe('browser_unattended');
  });

  it('tient exactement la durée minimale, pas une milliseconde de moins', () => {
    const b = bandeau();
    b.signaler(ZONE, 'browser_unattended');
    vi.advanceTimersByTime(300);
    b.signaler(ZONE, 'ok');

    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS - 300 - 1);
    expect(get(b.affiche)).toBe('browser_unattended');

    vi.advanceTimersByTime(1);
    expect(get(b.affiche)).toBeNull();
  });

  // Le garde-fou de l'excès inverse : un bandeau qui reste alors que le son
  // est revenu serait un mensonge de plus.
  it('part IMMÉDIATEMENT quand le son revient après la durée minimale', () => {
    const b = bandeau();
    b.signaler(ZONE, 'browser_unattended');
    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS + 5000);
    expect(get(b.affiche)).toBe('browser_unattended');

    b.signaler(ZONE, 'ok');
    expect(get(b.affiche)).toBeNull(); // aucune horloge à attendre
  });

  // Tant que la durée minimale court, un signal intermittent est absorbé. Le
  // maintien ne prétend pas absorber davantage : passé la durée minimale, un
  // « ok » veut dire que le son est revenu, et le bandeau doit partir — c'est
  // l'exigence inverse, testée juste au-dessus.
  it("ne clignote pas quand le signal serveur retombe brièvement à « ok »", () => {
    const b = bandeau();
    const vus: (AvertissementBandeau | null)[] = [];
    const stop = b.affiche.subscribe((v) => vus.push(v));

    b.signaler(ZONE, 'browser_unattended');
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000);
      b.signaler(ZONE, 'ok'); // creux d'un sondage
      vi.advanceTimersByTime(1000);
      b.signaler(ZONE, 'browser_unattended');
    }
    expect(vi.getTimerCount()).toBe(0); // la durée minimale n'a jamais expiré
    stop();

    // Une seule transition : null → browser_unattended. Le bandeau n'a jamais
    // quitté l'écran, donc jamais scintillé.
    expect(vus).toEqual([null, 'browser_unattended']);
  });

  it("un creux n'écourte ni ne rallonge l'horloge : elle court depuis l'affichage", () => {
    const b = bandeau();
    b.signaler(ZONE, 'browser_unattended');
    vi.advanceTimersByTime(3000);
    b.signaler(ZONE, 'ok');
    vi.advanceTimersByTime(1000);
    b.signaler(ZONE, 'browser_unattended'); // le creux se referme
    vi.advanceTimersByTime(1000);
    b.signaler(ZONE, 'ok'); // arrêt réel, à t = 5 000

    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS - 5000 - 1);
    expect(get(b.affiche)).toBe('browser_unattended');
    vi.advanceTimersByTime(1);
    expect(get(b.affiche)).toBeNull();
  });

  it('garde le motif affiché pendant la traîne, sans basculer sur l’autre libellé', () => {
    const b = bandeau();
    b.signaler(ZONE, 'no_output');
    b.signaler(ZONE, 'ok');
    // Si la traîne relisait `reach`, le rendu retomberait sur le libellé
    // « aucun onglet ne reçoit le son » — le mauvais message, et sans son
    // bouton d'action.
    expect(get(b.affiche)).toBe('no_output');
  });

  it("change de motif remet l'horloge à zéro : le nouveau texte a droit au même temps", () => {
    const b = bandeau();
    b.signaler(ZONE, 'no_output');
    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS - 500);
    b.signaler(ZONE, 'browser_unattended');
    expect(get(b.affiche)).toBe('browser_unattended');

    b.signaler(ZONE, 'ok');
    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS - 1);
    expect(get(b.affiche)).toBe('browser_unattended');
    vi.advanceTimersByTime(1);
    expect(get(b.affiche)).toBeNull();
  });

  // Le composant est monté une seule fois ; la zone qu'il reçoit change.
  it("abandonne le maintien sur-le-champ quand l'utilisateur change de zone", () => {
    const b = bandeau();
    b.signaler(ZONE, 'browser_unattended');
    b.signaler(AUTRE_ZONE, 'ok');
    expect(get(b.affiche)).toBeNull();
  });

  it("n'emporte pas non plus le maintien vers une autre zone en défaut", () => {
    const b = bandeau();
    b.signaler(ZONE, 'browser_unattended');
    vi.advanceTimersByTime(1000);
    b.signaler(AUTRE_ZONE, 'no_output');
    expect(get(b.affiche)).toBe('no_output');
    b.signaler(AUTRE_ZONE, 'ok');
    // L'horloge de la nouvelle zone est neuve : elle n'hérite pas des 1 000 ms
    // déjà écoulées sur la précédente.
    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS - 1);
    expect(get(b.affiche)).toBe('no_output');
    vi.advanceTimersByTime(1);
    expect(get(b.affiche)).toBeNull();
  });

  // Rechargement de page : une instance neuve n'hérite de rien, et l'état est
  // juste dès le premier `/zones` — que l'application demande à `onMount`
  // (`App.svelte:790`), pas au premier sondage.
  it('après un rechargement, une instance neuve part vide et suit le premier état reçu', () => {
    const avant = bandeau();
    avant.signaler(ZONE, 'browser_unattended');
    avant.detruire();

    const apres = bandeau();
    expect(get(apres.affiche)).toBeNull(); // rien de persisté

    apres.signaler(ZONE, 'ok');
    expect(get(apres.affiche)).toBeNull(); // pas de bandeau fantôme

    const encore = bandeau();
    encore.signaler(ZONE, 'browser_unattended');
    expect(get(encore.affiche)).toBe('browser_unattended'); // juste tout de suite
  });

  it("le démontage annule l'extinction en attente", () => {
    const b = bandeau();
    b.signaler(ZONE, 'browser_unattended');
    b.signaler(ZONE, 'ok');
    // Le compte est relevé AVANT toute avance d'horloge : avancer ferait
    // partir la minuterie et le compte retomberait à zéro tout seul, ce qui
    // rendrait l'assertion vraie même sans annulation.
    expect(vi.getTimerCount()).toBe(1);
    b.detruire();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('signaler deux fois la même chose ne relance rien', () => {
    const b = bandeau();
    b.signaler(ZONE, 'browser_unattended');
    vi.advanceTimersByTime(2000);
    b.signaler(ZONE, 'browser_unattended'); // ré-émission du même état
    b.signaler(ZONE, 'ok');
    b.signaler(ZONE, 'ok'); // idem
    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS - 2000 - 1);
    expect(get(b.affiche)).toBe('browser_unattended');
    vi.advanceTimersByTime(1);
    expect(get(b.affiche)).toBeNull();
  });
});

describe('lecture du champ serveur', () => {
  it.each([
    ['no_output', 'no_output'],
    ['browser_unattended', 'browser_unattended'],
  ])('%s mérite un bandeau', (recu, attendu) => {
    expect(avertissementDe(recu)).toBe(attendu);
  });

  // Un serveur antérieur à 0.9.70 n'envoie pas le champ. Pas de champ, pas de
  // bandeau : on ne devine rien à partir de `online`.
  it.each([['ok'], [undefined], [null], [''], ['okay'], ['NO_OUTPUT']])(
    'ne fabrique pas de bandeau à partir de %o',
    (recu) => {
      expect(avertissementDe(recu as any)).toBeNull();
    },
  );

  it("un serveur muet n'affiche jamais rien, quelle que soit la durée", () => {
    vi.useFakeTimers();
    const b = creerBandeauLisible(BANDEAU_DUREE_MIN_MS);
    b.signaler(ZONE, undefined);
    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS * 2);
    expect(get(b.affiche)).toBeNull();
    vi.useRealTimers();
  });
});

/**
 * Garde-fou de source : la décision ne doit pas revenir dans le composant.
 *
 * Le défaut de #2588 était une ligne unique — `visible = $derived(reach ===
 * 'no_output' || reach === 'browser_unattended')`. La réécrire réinstallerait
 * le défaut sans qu'aucun test de comportement ci-dessus ne bouge, puisqu'ils
 * ne montent pas le composant.
 *
 * La recherche est bornée au bloc `<script>` et **les commentaires sont
 * retirés** : le composant en cite l'historique, et un garde-fou qui trouve
 * son motif dans un commentaire reste vert à tort.
 */
describe('ZoneOutputBanner ne juge plus `output_reach` lui-même', () => {
  const source = readFileSync(
    new URL('../components/ZoneOutputBanner.svelte', import.meta.url),
    'utf-8',
  );

  const script = (() => {
    const m = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!m) throw new Error('bloc <script> introuvable dans ZoneOutputBanner.svelte');
    return m[1]
      .replace(/\/\*[\s\S]*?\*\//g, '') // commentaires de bloc
      .replace(/(^|[^:])\/\/.*$/gm, '$1'); // commentaires de ligne
  })();

  /** Le balisage seul : ni <script>, ni <style>, ni commentaires HTML. */
  const balisage = source
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  it('le bloc <script> dépouillé de ses commentaires est bien non vide', () => {
    // Contre-épreuve du dépouillement : s'il avalait tout, les assertions
    // suivantes passeraient sur du vide.
    expect(script).toContain('$props()');
    expect(script.length).toBeGreaterThan(100);
  });

  it('le balisage extrait est bien non vide', () => {
    // Même contre-épreuve pour le balisage.
    expect(balisage).toContain('zone-output-banner');
    expect(balisage).toContain('noOutputBannerAction');
  });

  it("n'énumère plus les valeurs de `output_reach`", () => {
    expect(script).not.toContain('browser_unattended');
  });

  // Le balisage doit lire le motif MAINTENU, jamais le champ brut : le relire
  // pour choisir le libellé ferait basculer le texte — et disparaître le
  // bouton d'action — au premier `"ok"`, c'est-à-dire rejouerait #2588 dans le
  // rendu même si la logique de maintien, elle, restait correcte.
  it("le balisage ne relit pas `output_reach` pour choisir le libellé", () => {
    expect(balisage).not.toContain('output_reach');
  });

  it('délègue à la durée minimale partagée', () => {
    expect(script).toContain('creerBandeauLisible');
  });
});
