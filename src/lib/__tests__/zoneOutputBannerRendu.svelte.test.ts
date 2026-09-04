// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ZoneOutputBanner from '../../components/ZoneOutputBanner.svelte';
import { BANDEAU_DUREE_MIN_MS } from '../bandeauLisible';
import { locale } from '../i18n';
import fr from '../locales/fr';
import type { Zone } from '../types';

/**
 * Le bandeau, monté pour de vrai (renesenses/tune-server-rust#2588).
 *
 * Les tests de `bandeauLisible.test.ts` portent sur la décision seule. Ceux-ci
 * montent le composant dans un DOM et regardent le texte qui s'y trouve : ils
 * couvrent le câblage — l'effet, l'abonnement au motif maintenu, le libellé
 * choisi — que la décision seule ne prouve pas.
 */

function zone(reach: string | undefined, id = 7): Zone {
  return { id, name: 'Ce PC', output_type: 'browser', output_reach: reach } as unknown as Zone;
}

const TEXTE_NAVIGATEUR = fr['zone.browserUnattendedBanner'];
const TEXTE_SANS_SORTIE = fr['zone.noOutputBanner'];
const ACTION_SANS_SORTIE = fr['zone.noOutputBannerAction'];

describe('ZoneOutputBanner monté dans un DOM', () => {
  let hote: HTMLElement;
  let composant: Record<string, any> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    locale.set('fr');
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    if (composant) unmount(composant);
    composant = null;
    hote.remove();
    vi.useRealTimers();
  });

  /** Monte le bandeau sur une zone, et rend une fonction pour la faire changer. */
  function monter(initiale: Zone | null, cible: HTMLElement = hote) {
    const props = $state<{ zone: Zone | null }>({ zone: initiale });
    const instance = mount(ZoneOutputBanner, { target: cible, props });
    if (cible === hote) composant = instance;
    flushSync();
    return (suivante: Zone | null) => {
      props.zone = suivante;
      flushSync();
    };
  }

  const texte = () => hote.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  // Contre-épreuve du dispositif : sans elle, toutes les assertions
  // « le texte est absent » passeraient sur un montage qui n'a jamais marché.
  it("affiche le message dès le montage quand le serveur l'annonce", () => {
    monter(zone('browser_unattended'));
    expect(texte()).toContain(TEXTE_NAVIGATEUR);
  });

  // Le cas du rechargement, au plus près : `App.svelte` demande `/zones` dès
  // `onMount` (App.svelte:790), si bien que la réponse est déjà là au montage.
  // Le bandeau doit donc être juste à la PREMIÈRE image, pas au balayage
  // suivant — d'où `$effect.pre` dans le composant. Rien n'est vidangé ici :
  // avec un `$effect` ordinaire, cette assertion tombe sur un rendu vide.
  it('est juste dès la première image, sans aucune vidange', () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const props = $state<{ zone: Zone | null }>({ zone: zone('browser_unattended') });
    composant = mount(ZoneOutputBanner, { target: cible, props });
    expect(cible.textContent?.replace(/\s+/g, ' ').trim()).toContain(TEXTE_NAVIGATEUR);
    cible.remove();
  });

  it("n'affiche rien quand le serveur dit « ok »", () => {
    monter(zone('ok'));
    expect(texte()).toBe('');
  });

  it("n'affiche rien face à un serveur qui n'envoie pas le champ", () => {
    monter(zone(undefined));
    expect(texte()).toBe('');
  });

  // Le défaut de #2588, vu à l'écran : l'utilisateur appuie sur Arrêt, la zone
  // quitte `Playing`, le serveur repasse à `"ok"` — et le message reste lisible.
  it("reste à l'écran quand l'utilisateur arrête la lecture", () => {
    const changer = monter(zone('browser_unattended'));
    vi.advanceTimersByTime(400);
    changer(zone('ok'));
    expect(texte()).toContain(TEXTE_NAVIGATEUR);

    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS - 400 - 1);
    flushSync();
    expect(texte()).toContain(TEXTE_NAVIGATEUR);

    vi.advanceTimersByTime(1);
    flushSync();
    expect(texte()).toBe('');
  });

  // L'exigence inverse, à l'écran : le son est revenu, le bandeau s'en va.
  it('disparaît sans délai quand le son repart après la durée minimale', () => {
    const changer = monter(zone('browser_unattended'));
    vi.advanceTimersByTime(BANDEAU_DUREE_MIN_MS + 3000);
    flushSync();
    expect(texte()).toContain(TEXTE_NAVIGATEUR);

    changer(zone('ok')); // l'onglet tire enfin le flux
    expect(texte()).toBe('');
  });

  // Pendant la traîne, le texte ne doit pas basculer sur l'autre libellé, et
  // le bouton « Choisir une sortie » ne doit pas s'évaporer.
  it('garde le libellé « aucune sortie » et son bouton pendant la traîne', () => {
    const changer = monter(zone('no_output'));
    expect(texte()).toContain(TEXTE_SANS_SORTIE);
    expect(texte()).toContain(ACTION_SANS_SORTIE);

    changer(zone('ok'));
    expect(texte()).toContain(TEXTE_SANS_SORTIE);
    expect(texte()).toContain(ACTION_SANS_SORTIE);
    expect(texte()).not.toContain(TEXTE_NAVIGATEUR);
  });

  // Changer de zone ne doit pas laisser traîner l'avertissement de la
  // précédente au-dessus de la nouvelle.
  it("efface le bandeau sur-le-champ quand on bascule vers une zone saine", () => {
    const changer = monter(zone('browser_unattended', 7));
    expect(texte()).toContain(TEXTE_NAVIGATEUR);
    changer(zone('ok', 9));
    expect(texte()).toBe('');
  });

  // Rechargement : un montage neuf ne connaît rien du précédent et affiche
  // exactement ce que le premier `/zones` rapporte.
  it('après un rechargement, un montage neuf suit le premier état reçu', () => {
    const changer = monter(zone('browser_unattended'));
    changer(zone('ok'));
    expect(texte()).toContain(TEXTE_NAVIGATEUR); // traîne en cours
    unmount(composant!);
    composant = null;

    const autre = document.createElement('div');
    document.body.appendChild(autre);
    monter(zone('ok'), autre);
    // Rien de la traîne précédente n'a survécu au rechargement.
    expect(autre.textContent?.trim()).toBe('');
    autre.remove();
  });
});
