// @vitest-environment jsdom
//
// Le panneau FILE de la vue mini, à 360 px.
//
// Bertrand, essai réel du 01/11/2026 sur le .18 : « affichage file d'attente
// pourri, en mode mini ». Sa capture : le panneau montait `QueueV2`, l'écran
// de BUREAU — en-tête sur deux lignes chevauché par « Aléatoire », badge de
// format empilé sur six lignes, cinq icônes, ascenseur horizontal.
//
// Ce banc monte le panneau seul, dans un hôte de 360 px, et vérifie :
//   - qu'aucun morceau de l'écran de bureau n'y est (`.v2-queue`, ses boutons
//     d'en-tête, ses colonnes) ;
//   - l'en-tête sur une ligne « File d'attente · N à suivre · durée », les
//     gestes de file dans le menu ⋯ ;
//   - le titre en cours en carte, titre et artiste lisibles ;
//   - l'ordre de « À suivre » ;
//   - la virtualisation (une file de 500 titres ne monte pas 500 lignes) ;
//   - la garde de débordement horizontal (voir la note plus bas).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import FileMini from '../../components/v2/mini/FileMini.svelte';
import { queueTracks, queuePosition } from '../stores/queue';
import { zones, currentZoneId } from '../stores/zones';
import { rangDArrivee, dureeCompacte, HAUTEUR_LIGNE_FILE } from '../fileMini';

vi.setConfig({ testTimeout: 30_000 });

const piste = (i: number) => ({
  id: 1000 + i, title: `Titre ${i}`, artist_name: `Artiste ${i}`, duration_ms: 200_000 + i * 1000,
  format: 'flac', sample_rate: 44100, bit_depth: 16,
});

let file: ReturnType<typeof piste>[] = [];
let position = 0;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function stabiliser(tours = 6) { for (let i = 0; i < tours; i++) { await respirer(); flushSync(); } }

let demonter: (() => void) | null = null;
async function monter(n: number, pos: number) {
  file = Array.from({ length: n }, (_, i) => piste(i));
  position = pos;
  zones.set([{ id: 1, name: 'Salon', state: 'playing', shuffle: false, autoplay_enabled: false } as any]);
  currentZoneId.set(1);
  queueTracks.set(file as any);
  queuePosition.set(pos);
  const hote = document.createElement('div');
  hote.style.width = '360px';
  document.body.appendChild(hote);
  const m = mount(FileMini, { target: hote, props: {} });
  flushSync();
  await stabiliser();
  demonter = () => { unmount(m); hote.remove(); };
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const p = new URL(String(url), 'http://localhost').pathname;
    const corps = /\/zones\/1\/queue$/.test(p) ? { tracks: file, position } : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});
afterEach(() => { demonter?.(); demonter = null; vi.unstubAllGlobals(); });

describe('panneau File de la vue mini — à 360 px', () => {
  it('aucun morceau de l’écran de bureau : ni `.v2-queue`, ni ses boutons d’en-tête', async () => {
    const el = await monter(12, 2);
    expect(el.querySelector('[data-file-mini]')).not.toBeNull();
    expect(el.querySelector('.v2-queue')).toBeNull();
    // Les trois boutons qui chevauchaient le titre ne sont plus dans l'en-tête :
    // ils sont dans le menu ⋯, fermé à l'ouverture.
    expect(el.querySelector('[data-menu-aleatoire]')).toBeNull();
    expect(el.querySelector('[data-menu-similaires]')).toBeNull();
    expect(el.querySelector('[data-vider-file]')).toBeNull();
    const tete = el.querySelector('header.tete')!;
    expect(tete.querySelectorAll('button').length).toBe(2); // ⋯ et fermer, rien d'autre
    (el.querySelector('[data-menu-tete]') as HTMLButtonElement).click();
    flushSync();
    expect(el.querySelector('[data-menu-aleatoire]')).not.toBeNull();
    expect(el.querySelector('[data-menu-similaires]')).not.toBeNull();
    expect(el.querySelector('[data-vider-file]')).not.toBeNull();
  });

  it('en-tête sur une ligne : « N à suivre · durée »', async () => {
    const el = await monter(12, 2);
    const resume = el.querySelector('[data-resume-file]')!.textContent!;
    expect(resume).toContain('9');
    expect(resume).not.toContain('\n');
  });

  it('le titre en cours est en carte, titre ET artiste lisibles, format sur une ligne', async () => {
    const el = await monter(12, 2);
    const carte = el.querySelector('[data-en-cours-file]')!;
    expect(carte).not.toBeNull();
    expect(carte.querySelector('.t1')!.textContent).toBe('Titre 2');
    expect(carte.querySelector('.t2')!.textContent).toBe('Artiste 2');
    // Le badge de format est UN élément, pas une pile de six.
    expect(carte.querySelectorAll('.fmt').length).toBe(1);
    // Une ligne de file : vignette, titre/artiste, durée, poignée, ⋯ — et rien
    // de plus : pas de colonnes d'actions de bureau.
    const ligne = el.querySelector('[data-a-suivre] .ligne')!;
    expect(ligne.querySelectorAll(':scope > button').length).toBe(3); // poignée, corps, ⋯
  });

  it('« À suivre » respecte l’ordre de la file, à partir du suivant', async () => {
    const el = await monter(12, 2);
    const titres = [...el.querySelectorAll('[data-a-suivre] .ligne .t1')].map((n) => n.textContent);
    expect(titres).toEqual(Array.from({ length: 9 }, (_, k) => `Titre ${k + 3}`));
    const rangs = [...el.querySelectorAll('[data-a-suivre] .ligne')].map((n) => Number(n.getAttribute('data-rang')));
    expect(rangs).toEqual(Array.from({ length: 9 }, (_, k) => k + 3));
  });

  it('une longue file est virtualisée : 500 titres ne montent pas 500 lignes', async () => {
    const el = await monter(500, 0);
    const n = el.querySelectorAll('[data-a-suivre] .ligne').length;
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(60);
    // La hauteur réservée vaut toute la file : l'ascenseur est juste.
    const liste = el.querySelector('[data-a-suivre]') as HTMLElement;
    const reserve = parseFloat(liste.style.paddingTop || '0') + parseFloat(liste.style.paddingBottom || '0');
    expect(reserve + n * HAUTEUR_LIGNE_FILE).toBe(499 * HAUTEUR_LIGNE_FILE);
  });

  it('le menu ⋯ d’une ligne propose lire depuis ici et retirer', async () => {
    const el = await monter(6, 0);
    (el.querySelector('[data-a-suivre] [data-menu-ligne]') as HTMLButtonElement).click();
    flushSync();
    expect(el.querySelector('[data-menu-lire]')).not.toBeNull();
    expect(el.querySelector('[data-menu-retirer]')).not.toBeNull();
  });
});

/*
 * 🔴 LE DÉBORDEMENT HORIZONTAL.
 *
 * jsdom ne calcule AUCUNE mise en page : `scrollWidth` et `clientWidth` y valent
 * 0, et `scrollWidth <= clientWidth` y serait vrai pour n'importe quel balisage,
 * y compris celui de la capture. Un tel test serait vert à vide. La mesure
 * réelle a été faite dans Chromium (voir la PR). Ce banc garde les RÈGLES qui
 * l'empêchent, lues dans la feuille du composant : chaque conteneur flexible
 * qui porte du texte a `min-width:0`, chaque texte coupe en `…` sur une ligne,
 * et le panneau refuse le défilement horizontal.
 */
const SOURCE = readFileSync(join(__dirname, '..', '..', 'components', 'v2', 'mini', 'FileMini.svelte'), 'utf8');
const STYLE = SOURCE.slice(SOURCE.lastIndexOf('<style'));
function regle(selecteur: string): string {
  const m = STYLE.match(new RegExp(`(^|\\n)\\s*${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`));
  return m ? m[2].replace(/\s+/g, '') : '';
}

describe('panneau File de la vue mini — aucun débordement horizontal', () => {
  it('le panneau et sa zone de défilement refusent le défilement horizontal', () => {
    expect(regle('.file')).toContain('overflow-x:hidden');
    expect(regle('.file')).toContain('min-width:0');
    expect(regle('.defile')).toContain('overflow-x:hidden');
    expect(regle('.defile')).toContain('min-width:0');
  });

  it('chaque conteneur de texte peut rétrécir, chaque texte se coupe en « … » sur une ligne', () => {
    for (const s of ['.tx', '.corps', '.tete h3', '.ligne', '.en-cours']) {
      expect(regle(s), s).toContain('min-width:0');
    }
    for (const s of ['.t1', '.t2', '.fmt', '.tete h3']) {
      const r = regle(s);
      expect(r, s).toContain('white-space:nowrap');
      expect(r, s).toContain('text-overflow:ellipsis');
      expect(r, s).toContain('overflow:hidden');
    }
  });
});

describe('panneau File — les règles', () => {
  it('le glisser arrive au rang d’après le déplacement, borné à la file', () => {
    expect(rangDArrivee(3, 0, 10)).toBe(3);
    expect(rangDArrivee(3, HAUTEUR_LIGNE_FILE * 2, 10)).toBe(5);
    expect(rangDArrivee(3, -HAUTEUR_LIGNE_FILE * 9, 10)).toBe(0);
    expect(rangDArrivee(3, HAUTEUR_LIGNE_FILE * 99, 10)).toBe(9);
  });
  it('les durées sont compactes', () => {
    expect(dureeCompacte(562_000)).toBe('9:22');
    expect(dureeCompacte(3_725_000)).toBe('1:02:05');
    expect(dureeCompacte(null)).toBe('');
  });
});
