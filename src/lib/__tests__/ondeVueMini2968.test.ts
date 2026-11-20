// @vitest-environment jsdom
//
// Fil du forum 2968 (Rémi, app de bureau Tune Client) : « les formes d'onde ne
// semblent pas s'afficher ». L'app ouvre par défaut la VUE MINI
// (`?vue=mini&hote=widget`), dont l'écran Écouter (`EcouterMini`) avait sa
// propre barre de progression, classique, sans la forme d'onde de `SeekBar`
// (Discussion #8269). La barre de la vue mini dessine désormais l'onde quand
// `ondePisteEnCours` en fournit une — même store, même réglage que la vue
// complète — et garde la barre classique sinon.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('../stores/ondePiste', async () => {
  const { writable } = await import('svelte/store');
  return { ondePisteEnCours: writable<number[] | null>(null) };
});

import EcouterMini from '../../components/v2/mini/EcouterMini.svelte';
import { ondePisteEnCours } from '../stores/ondePiste';
import { zones, currentZoneId } from '../stores/zones';
import { seekPositionMs } from '../stores/nowPlaying';

let demonter: (() => void) | null = null;
afterEach(() => { demonter?.(); demonter = null; (ondePisteEnCours as any).set(null); });

function monter(piste: Record<string, unknown>) {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', volume: 0.5, current_track: piste } as any]);
  currentZoneId.set(1);
  seekPositionMs.set(60_000);
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const m = mount(EcouterMini, { target: hote, props: {} });
  flushSync();
  demonter = () => { unmount(m); hote.remove(); };
  return hote;
}

const PISTE = { id: 42, track_id: 42, title: 'So What', source: 'local', duration_ms: 240_000 };

describe('vue mini — barre en forme d\'onde (fil 2968)', () => {
  it("dessine l'onde quand le store en fournit une", () => {
    (ondePisteEnCours as any).set([0.1, 0.8, 0.4, 0.9, 0.2]);
    const hote = monter(PISTE);
    const barre = hote.querySelector('[data-progression]')!;
    expect(barre.classList.contains('onde')).toBe(true);
    expect(barre.querySelector('.onde svg path')).not.toBeNull();
    expect(barre.querySelector('i')).toBeNull();
    // La progression (60 s sur 240 s) découpe la partie jouée.
    expect(barre.querySelector('.jouee')?.getAttribute('style')).toContain('inset(0 75% 0 0)');
  });

  it('garde la barre classique sans onde (réglage décoché, calcul en cours…)', () => {
    const hote = monter(PISTE);
    const barre = hote.querySelector('[data-progression]')!;
    expect(barre.classList.contains('onde')).toBe(false);
    expect(barre.querySelector('svg')).toBeNull();
    expect((barre.querySelector('i') as HTMLElement).style.width).toBe('25%');
  });

  it("une radio n'a pas de durée : jamais d'onde", () => {
    (ondePisteEnCours as any).set([0.1, 0.8, 0.4]);
    const hote = monter({ title: 'FIP', source: 'radio', duration_ms: 0 });
    const barre = hote.querySelector('[data-progression]')!;
    expect(barre.querySelector('svg')).toBeNull();
  });
});
