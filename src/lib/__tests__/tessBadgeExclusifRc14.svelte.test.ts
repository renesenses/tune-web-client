// @vitest-environment jsdom
//
// Recette rc14 du 24/11, point 6 — dans le chemin du signal TESS, Crossfeed
// portait la pastille « INDISPONIBLE » quand un autre membre de son groupe
// exclusif était actif, alors que l'explication dessous parle d'exclusivité.
//
// Le serveur publie alors `available: false` pour Crossfeed : le greffon
// historique est coupé dès qu'un autre membre du groupe est en service. Le
// client ne peut pas le distinguer d'un vrai `plugin_unavailable` par le
// seul catalogue ; il le distingue par la CHAÎNE : un autre membre du groupe
// est coché (`conflitExclusif`). Dans ce cas la pastille dit « EXCLUSIF » ;
// un `plugin_unavailable` sans membre concurrent actif garde « INDISPONIBLE ».
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import CheminTess from '../../components/v2/tess/CheminTess.svelte';
import { locale } from '../i18n';
import { catalogueSimule } from '../tessSimulation';
import { cleDuBadgeVerrou, type MotifVerrouTess } from '../tessPanneaux';
import { dictionnaire, ONZE_LANGUES, en } from './onzeDictionnaires';

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function reponse(crosstalkActif: boolean) {
  return {
    chain: {
      bypass: false,
      plugins: [
        { id: 'crossfeed', enabled: false, settings: {} },
        { id: 'crosstalk', enabled: crosstalkActif, settings: {} },
      ],
    },
    signal_path: [],
    catalog: catalogueSimule(),
  } as any;
}

function monter(crosstalkActif: boolean, motifCrossfeed: MotifVerrouTess | null) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  const rien = () => {};
  monte = mount(CheminTess, {
    target: hote,
    props: {
      reponse: reponse(crosstalkActif),
      verrouDe: (id: string) => (id === 'crossfeed' ? motifCrossfeed : null),
      onSelect: rien, onToggle: rien, onRemove: rien, onMove: rien, onBypass: rien, onAdd: rien,
    },
  });
  flushSync();
}

const pastille = () => hote!.querySelector<HTMLElement>('[data-tess-verrou-chemin="crossfeed"]');

beforeEach(() => { locale.set('en'); });
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
});

describe('rc14 point 6 — pastille de Crossfeed exclu par un autre membre du groupe', () => {
  it('🔴 un autre membre du groupe est actif : « EXCLUSIVE », pas « UNAVAILABLE »', () => {
    monter(true, 'plugin_unavailable');
    const p = pastille()!;
    expect(p.textContent!.trim()).toBe(en['tess.exclusiveBadge']);
    expect(p.textContent!.trim()).not.toBe(en['tess.unavailableBadge']);
    // L'explication sous la ligne reste celle de l'exclusivité.
    expect(hote!.querySelector('[data-tess-blocage="crossfeed"]')!.textContent).toContain('Crosstalk');
  });

  it('contre-épreuve : vrai `plugin_unavailable`, aucun membre concurrent actif : « UNAVAILABLE »', () => {
    monter(false, 'plugin_unavailable');
    expect(pastille()!.textContent!.trim()).toBe(en['tess.unavailableBadge']);
  });

  it('la règle, motif par motif', () => {
    expect(cleDuBadgeVerrou('plugin_unavailable', 'crosstalk')).toBe('tess.exclusiveBadge');
    expect(cleDuBadgeVerrou('plugin_unavailable', null)).toBe('tess.unavailableBadge');
    expect(cleDuBadgeVerrou('plugin_not_installed', null)).toBe('tess.notInstalledBadge');
    expect(cleDuBadgeVerrou('plugin_not_installed', 'crosstalk')).toBe('tess.notInstalledBadge');
    // La licence reste la licence, même dans un groupe.
    expect(cleDuBadgeVerrou('premium_required', 'crosstalk')).toBe('tess.locked');
  });

  it('« EXCLUSIF » existe dans les vingt langues, traduit, et diffère de « indisponible »', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      expect(d['tess.exclusiveBadge'], l).toBeTruthy();
      expect(d['tess.exclusiveBadge'], l).not.toBe(d['tess.unavailableBadge']);
      if (l !== 'en') expect(d['tess.exclusiveBadge'], l).not.toBe(en['tess.exclusiveBadge']);
    }
  });
});
