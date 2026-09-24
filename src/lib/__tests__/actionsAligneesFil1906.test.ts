// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// 🔴 Fil forum 1906 (FabienM, v0.9.163, Windows) — LES ICÔNES GLISSENT.
//
// Capture de l'Historique : une ligne Qobuz porte lire, lire à partir d'ici,
// lire ensuite, file, PLAYLIST, étiquettes, cœur, « … ». La ligne Bandcamp
// juste en dessous n'a pas de playlist — Bandcamp n'écrit pas de playlist de
// service (`playlistService.ts`, `SERVICES_PLAYLIST_ECRITURE`) — et ses
// étiquettes, son cœur et son « … » tombaient une colonne à gauche.
//
// LE MÉCANISME : `PisteActions` rendait RIEN pour un geste impossible. Chaque
// absence décalait tout ce qui suivait. La correction garde la règle « absent,
// pas grisé » mais laisse la CASE : un `<span class="pa vide" aria-hidden>`.
//
// Cette garde MONTE la barre pour les deux pistes et compare les cases : une
// garde de texte resterait verte avec un `{:else}` jamais atteint.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { get } from 'svelte/store';
import { currentZoneId } from '../stores/zones';
import { t } from '../i18n';

const QOBUZ = {
  id: null, title: 'Second Song', source: 'qobuz', source_id: '441078583',
  artist_name: 'Neil Young', album_title: 'Second Song', album_id: 'atua1kxxk4tis',
  cover_path: null, duration_ms: 360000,
};
const BANDCAMP = {
  id: null, title: 'Morceau', source: 'bandcamp',
  source_id: 'https://artiste.bandcamp.com/track/morceau',
  artist_name: 'Artiste', album_title: 'Album', cover_path: null, duration_ms: 200000,
};

const hotes: HTMLDivElement[] = [];
const montes: Record<string, any>[] = [];

function barre(piste: Record<string, unknown>, props: Record<string, unknown> = {}): HTMLElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(PisteActions, { target: hote, props: { piste, onLireDepuis: () => {}, ...props } as any }));
  flushSync();
  return hote.querySelector<HTMLElement>('.pactions')!;
}

/** Les CASES de la barre, dans l'ordre : un bouton ou une case vide. */
const cases = (b: HTMLElement) => Array.from(b.children) as HTMLElement[];
const rangDe = (b: HTMLElement, choix: (el: HTMLElement) => boolean) => cases(b).findIndex(choix);
const estCoeur = (el: HTMLElement) => el.classList.contains('coeur');
const estMenu = (el: HTMLElement) => el.getAttribute('aria-haspopup') === 'menu';

beforeEach(() => { currentZoneId.set(1); });
afterEach(() => {
  for (const m of montes.splice(0)) unmount(m);
  for (const h of hotes.splice(0)) h.remove();
  currentZoneId.set(null);
});

describe('🔴 fil 1906 — chaque geste garde SA case dans la barre d’une piste', () => {
  it('Qobuz et Bandcamp : le même nombre de cases, le cœur et le « … » au même rang', () => {
    const q = barre(QOBUZ);
    const b = barre(BANDCAMP);
    expect(cases(q).length, 'la barre Qobuz n’a pas ses huit cases').toBe(8);
    expect(cases(b).length, 'la barre Bandcamp a perdu une case : ses icônes glissent').toBe(cases(q).length);
    expect(rangDe(q, estCoeur)).toBeGreaterThan(-1);
    expect(rangDe(b, estCoeur), 'le cœur Bandcamp n’est pas en face du cœur Qobuz').toBe(rangDe(q, estCoeur));
    expect(rangDe(q, estMenu)).toBeGreaterThan(-1);
    expect(rangDe(b, estMenu), 'le « … » Bandcamp n’est pas en face du « … » Qobuz').toBe(rangDe(q, estMenu));
  });

  it('la case de la playlist Bandcamp est VIDE : aucun ajout impossible n’est offert', () => {
    const q = barre(QOBUZ);
    const b = barre(BANDCAMP);
    const playlist = get(t)('v2.pa.playlist' as any);
    const rang = cases(q).findIndex((el) => el.getAttribute('aria-label') === playlist);
    expect(rang, 'Qobuz n’offre plus la playlist de son service').toBeGreaterThan(-1);
    expect(b.querySelector(`[aria-label="${playlist}"]`),
      'Bandcamp propose un bouton playlist qu’il ne peut pas tenir').toBeNull();
    expect(cases(b)[rang].tagName).toBe('SPAN');
    expect(cases(b)[rang].classList.contains('vide')).toBe(true);
  });

  it('une case vide ne se vise pas : ni bouton, ni focus, ni annonce', () => {
    const b = barre(BANDCAMP);
    const vides = cases(b).filter((el) => el.classList.contains('vide'));
    expect(vides.length).toBeGreaterThan(0);
    for (const v of vides) {
      expect(v.tagName).toBe('SPAN');
      expect(v.getAttribute('aria-hidden')).toBe('true');
      expect(v.hasAttribute('tabindex')).toBe(false);
      expect(v.children.length).toBe(0);
      // Même boîte que ses voisines : elle hérite de `.pa`.
      expect(v.classList.contains('pa')).toBe(true);
    }
  });

  it('une piste qu’on ne sait pas désigner garde ses huit cases, toutes vides', () => {
    const b = barre({ id: null, title: 'Sans rien', source: 'qobuz', source_id: null });
    expect(cases(b).length).toBe(8);
    expect(b.querySelectorAll('button').length).toBe(0);
  });

  it('sans « lire à partir d’ici », la case reste aussi', () => {
    const q = barre(QOBUZ, { onLireDepuis: null });
    expect(cases(q).length).toBe(8);
    expect(q.querySelector('[data-depuis]')).toBeNull();
    expect(cases(q)[1].classList.contains('vide')).toBe(true);
  });
});
