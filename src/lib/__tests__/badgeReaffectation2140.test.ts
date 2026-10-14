// @vitest-environment jsdom
//
// web#2140 (fil 2202) — « quand on active la réaffectation sur un album, est-il
// possible de le marquer sur un indicateur de la page de l'album ? […] sur une
// zone, sur la page des zones ? »
//
// Deux choses sont tenues :
//  1. la décision « armée » (`regleArmee`), miroir de `armee_pour` côté serveur :
//     enregistrée, activée, valide, pas l'identité ;
//  2. le badge monté interroge la BONNE route (album ou zone) et ne s'affiche
//     que pour une règle armée.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import BadgeReaffectation from '../../components/v2/BadgeReaffectation.svelte';
import { regleArmee, type EtatReaffectation } from '../reaffectationCanaux';

function etat(p: Partial<EtatReaffectation> & { enabled?: boolean; identity?: boolean; valid?: boolean } = {}): EtatReaffectation {
  return {
    key: 'zone_1_channel_remap',
    saved: p.saved ?? true,
    settings: { enabled: p.enabled ?? true, inputs: 4, outputs: 2, gains_db: [[0, null, -3, null], [null, 0, null, -3]], normalize: true },
    effective: { valid: p.valid ?? true, identity: p.identity ?? false },
    input_names: null,
    output_names: null,
  };
}

describe('web#2140 — regleArmee', () => {
  it('une règle enregistrée, activée, valide et non identité est armée', () => {
    expect(regleArmee(etat())).toEqual({ entrees: 4, sorties: 2 });
  });
  it('non enregistrée, désactivée, invalide ou identité : rien', () => {
    expect(regleArmee(etat({ saved: false }))).toBeNull();
    expect(regleArmee(etat({ enabled: false }))).toBeNull();
    expect(regleArmee(etat({ valid: false }))).toBeNull();
    expect(regleArmee(etat({ identity: true }))).toBeNull();
    expect(regleArmee(null)).toBeNull();
  });
});

describe('web#2140 — le badge monté', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  async function poser(props: Record<string, unknown>, reponse: EtatReaffectation | null) {
    const appels: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      appels.push(String(url));
      if (!reponse) return { ok: false, status: 404, statusText: 'Not Found', headers: new Map(), json: async () => ({}), text: async () => '' } as unknown as Response;
      return {
        ok: true, status: 200, statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => reponse, text: async () => JSON.stringify(reponse),
      } as unknown as Response;
    }));
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(BadgeReaffectation, { target: hote, props: props as any });
    flushSync();
    for (let i = 0; i < 5; i++) { await Promise.resolve(); await tick(); }
    flushSync();
    return { el: hote, appels };
  }

  it('🔴 fiche album : règle armée → badge « 4 → 2 », lu sur la route de l’album', async () => {
    const { el, appels } = await poser({ cible: 'album', id: 42 }, etat());
    expect(appels.some((u) => u.endsWith('/channel-remap/albums/42'))).toBe(true);
    const b = el.querySelector('[data-reaffectation="album"]');
    expect(b, 'aucun indicateur sur la fiche album').not.toBeNull();
    expect(b!.textContent).toMatch(/4\s*→\s*2/);
    expect(b!.getAttribute('title') ?? '').not.toBe('');
  });

  it('🔴 page Zones : règle armée → badge, lu sur la route de la zone', async () => {
    const { el, appels } = await poser({ cible: 'zone', id: 3 }, etat());
    expect(appels.some((u) => u.endsWith('/channel-remap/zones/3'))).toBe(true);
    expect(el.querySelector('[data-reaffectation="zone"]')).not.toBeNull();
  });

  it('CONTRE-ÉPREUVE : règle désactivée → aucun badge', async () => {
    const { el } = await poser({ cible: 'zone', id: 3 }, etat({ enabled: false }));
    expect(el.querySelector('[data-reaffectation]')).toBeNull();
  });

  it('route absente (serveur ancien) → aucun badge, aucune erreur', async () => {
    const { el } = await poser({ cible: 'album', id: 7 }, null);
    expect(el.querySelector('[data-reaffectation]')).toBeNull();
  });
});
