// @vitest-environment jsdom
//
// web#2797 — Michel (Premium, rc11), fil 2748 : sur « Lecture en cours », la
// strophe active fait des allers-retours entre la strophe en cours et la
// précédente, et le décalage des paroles réglé sur la zone n'y est pas
// appliqué.
//
// Causes : `seekPositionMs` est recalé sur le serveur au-delà de 2 s d'écart
// (`DERIVE_MAX_MS`, `v2Live.ts`) et peut RECULER d'autant d'un coup ; et
// `lyrics_offset_ms` n'était lu que par le Grand écran (`TvView`).
//
// Le panneau est monté pour de bon, et l'on joue sur `seekPositionMs` la suite
// de positions que produit un recalage : 2,1 s → recalage à 1,5 s → 2,3 s.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import NowPlayingLyrics from '../../components/partages/NowPlayingLyrics.svelte';
import { seekPositionMs } from '../stores/nowPlaying';
import { avecDecalageParoles, ligneParolesActive, positionParolesTenue, RECUL_TOLERE_MS } from '../lyrics';

const LIGNES = [
  { time: 0, text: 'un' },
  { time: 1000, text: 'deux' },
  { time: 2000, text: 'trois' },
  { time: 3000, text: 'quatre' },
  { time: 20000, text: 'cinq' },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function monter(props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlayingLyrics, {
    target: hote,
    props: {
      loading: false, lyrics: null, syncedLines: LIGNES, karaokeMode: true, source: 'lrc',
      onToggleKaraoke: () => {}, ...props,
    },
  });
  flushSync();
  return hote;
}

function active(): string | null {
  return hote!.querySelector('.karaoke-line.active')?.textContent?.trim() ?? null;
}

function aller(ms: number): string | null {
  seekPositionMs.set(ms);
  flushSync();
  return active();
}

beforeEach(() => {
  seekPositionMs.set(0);
  // jsdom n'implémente pas scrollIntoView, appelé par le défilement automatique.
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  seekPositionMs.set(0);
});

describe('#2797 — la règle', () => {
  it('un recul de recalage (≤ 2,5 s) garde la position atteinte', () => {
    expect(positionParolesTenue(2100, 1500)).toBe(2100);
    expect(positionParolesTenue(2100, 2100 - RECUL_TOLERE_MS)).toBe(2100);
  });
  it('un vrai déplacement (recul plus grand, ou avance) est suivi', () => {
    expect(positionParolesTenue(10_000, 500)).toBe(500);
    expect(positionParolesTenue(2100, 2300)).toBe(2300);
    expect(positionParolesTenue(null, 1234)).toBe(1234);
  });
  it('le décalage recule les paroles, sans position négative', () => {
    expect(avecDecalageParoles(2100, 1000)).toBe(1100);
    expect(avecDecalageParoles(500, 1000)).toBe(0);
    expect(avecDecalageParoles(2100, null)).toBe(2100);
    expect(ligneParolesActive(LIGNES, 1100)).toBe(1);
  });
});

describe('#2797 — le panneau « Lecture en cours »', () => {
  it('🔴 un recalage qui recule de 0,6 s ne rallume pas la strophe précédente', () => {
    monter();
    expect(aller(2100)).toBe('trois');
    // Recalage : le serveur annonce 1,5 s, la position recule d'un coup.
    expect(aller(1500), 'aller-retour : la strophe précédente se rallume').toBe('trois');
    expect(aller(1700)).toBe('trois');
    expect(aller(3100)).toBe('quatre');
  });

  it('un vrai retour en arrière (curseur) est suivi', () => {
    monter();
    expect(aller(20_500)).toBe('cinq');
    expect(aller(1200)).toBe('deux');
  });

  it('en pause, un petit retour en arrière est suivi tout de suite', () => {
    monter({ enLecture: false });
    expect(aller(2100)).toBe('trois');
    expect(aller(1500)).toBe('deux');
  });

  it('🔴 le décalage de la zone s’applique à « Lecture en cours »', () => {
    monter({ decalageMs: 1000 });
    expect(aller(2100), 'le décalage de la zone est ignoré').toBe('deux');
    expect(aller(3100)).toBe('trois');
  });

  it('« Lecture en cours » transmet le décalage de la zone au panneau', () => {
    const np = readFileSync('src/components/partages/NowPlaying.svelte', 'utf8');
    expect(np).toContain('decalageMs={zone?.lyrics_offset_ms ?? 0}');
    expect(np).toContain('enLecture={isEffectivePlaying}');
  });
});
