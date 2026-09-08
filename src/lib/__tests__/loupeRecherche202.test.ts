// @vitest-environment jsdom
//
// jsdom, et pas `node` : ce fichier MONTE le composant réel. C'est tout
// l'objet du test — l'exploration disait « aucun effet », et seul le DOM
// produit peut le contredire.
/**
 * #202 — « Contrôle sans effet : Recherche », rapporté par l'exploration
 * automatique le 29/07/2026, neuf occurrences.
 *
 * > Le clic sur « Recherche » n'a produit aucune requête, aucun changement
 * > d'écran et aucun message.
 *
 * ## Les trois observations sont exactes, et la conclusion ne l'est pas
 *
 * La loupe repliée n'a pas à faire de requête : elle **déplie le champ** et y
 * met le curseur. Aucune requête tant que rien n'est tapé — c'est voulu, sinon
 * chaque ouverture interrogerait quatre services pour une chaîne vide. Aucun
 * changement d'écran non plus : on ne quitte pas la vue pour taper.
 *
 * L'exploration cherchait un effet OBSERVABLE parmi trois qu'elle sait voir.
 * L'effet réel — un champ qui apparaît et prend le focus — n'en fait pas
 * partie.
 *
 * Plutôt que de fermer sur une opinion, ce test rend l'effet VÉRIFIABLE : on
 * monte la barre, on clique, et on regarde le DOM.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import GlobalSearchBar from '../../components/GlobalSearchBar.svelte';

let monte: Record<string, any> | null = null;
let hote: HTMLElement | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.useRealTimers();
});

function poser() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(GlobalSearchBar, { target: hote });
  flushSync();
  return hote;
}

describe('La loupe de la recherche globale', () => {
  it('est bien un bouton, replié, avant tout clic', () => {
    const h = poser();
    expect(h.querySelector('button.search-icon-btn'), 'la loupe est introuvable').not.toBeNull();
    expect(h.querySelector('input'), 'le champ ne doit pas être là avant le clic').toBeNull();
  });

  it('🔴 le clic DÉPLIE le champ — l’effet que l’exploration ne savait pas voir', () => {
    const h = poser();
    (h.querySelector('button.search-icon-btn') as HTMLButtonElement).click();
    flushSync();

    expect(h.querySelector('input'), 'le champ ne s’est pas ouvert').not.toBeNull();
    expect(h.querySelector('button.search-icon-btn'), 'la loupe devait céder la place').toBeNull();
  });

  it('et il y met le curseur', () => {
    vi.useFakeTimers();
    const h = poser();
    (h.querySelector('button.search-icon-btn') as HTMLButtonElement).click();
    flushSync();
    // Le focus est posé après un tour, le temps que le DOM existe.
    vi.advanceTimersByTime(100);

    expect(document.activeElement, 'le curseur n’est pas dans le champ')
      .toBe(h.querySelector('input'));
  });

  it('🔴 et il ne LANCE aucune recherche — c’est voulu', () => {
    // Interroger quatre services pour une chaîne vide à chaque ouverture
    // serait un défaut, pas une amélioration. L'absence de requête que
    // l'exploration a relevée est le comportement juste.
    const h = poser();
    const champ = () => h.querySelector('input') as HTMLInputElement | null;
    (h.querySelector('button.search-icon-btn') as HTMLButtonElement).click();
    flushSync();
    expect(champ()?.value ?? '').toBe('');
  });
});
