// @vitest-environment jsdom
//
// web#3452 (relecture) — l'appui long qui fait entrer en sélection coche
// l'album ; le clic que le navigateur envoie au LÂCHER doit être avalé, sinon
// il atteint la case de sélection et DÉCOCHE l'album tout juste coché.
//
// Le défaut : l'attachement recevait `!modeSelection` comme condition. L'appui
// abouti fait passer `modeSelection` à vrai, Svelte rejoue l'attachement, et
// l'écouteur `click` en capture qui devait avaler le clic disparaissait.
//
// Contre-épreuve : retirer `laisserUnAvaleur` de `lib/appuiLong.ts` fait
// rougir l'épreuve « condition instable » ; remettre `!modeSelection` dans
// `appuiSelection` fait rougir l'épreuve de source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DELAI_APPUI_LONG_MS } from '../appuiLong';
import { focusPanneau } from '../focusPanneau';
import { monterCarte } from './aides/carteAppuiLong.svelte';

function pointeur(el: Element, type: string, pointerType = 'touch') {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerType, clientX: 20, clientY: 20 });
  el.dispatchEvent(e);
}

/** Le geste complet : doigt posé, tenu, levé, puis le clic du système. */
function appuiLongPuisLacher(carte: Element, cible: () => Element) {
  pointeur(carte, 'pointerdown');
  vi.advanceTimersByTime(DELAI_APPUI_LONG_MS);
  flushSync();
  pointeur(carte, 'pointerup');
  // Le navigateur vise ce qui est SOUS le doigt au lâcher : la case, qui vient
  // d'apparaître par-dessus la carte.
  cible().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  flushSync();
}

describe('web#3452 — appui long : le clic au lâcher ne décoche pas', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  for (const conditionInstable of [false, true]) {
    it(`condition ${conditionInstable ? 'instable (filet de lib/appuiLong)' : 'stable (LibraryV2)'} : l'album reste coché`, () => {
      const c = monterCarte(conditionInstable);
      appuiLongPuisLacher(c.carte, () => c.caseSel);
      expect(c.etat.modeSelection).toBe(true);
      expect(c.etat.coche).toBe(true);
      c.defaire();
    });
  }

  it('le clic suivant, lui, passe : un toucher décoche', () => {
    const c = monterCarte(false);
    appuiLongPuisLacher(c.carte, () => c.caseSel);
    expect(c.etat.coche).toBe(true);
    pointeur(c.carte, 'pointerdown');
    pointeur(c.carte, 'pointerup');
    c.caseSel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    flushSync();
    expect(c.etat.coche).toBe(false);
    c.defaire();
  });

  it('un clic perdu (appui annulé par le système) n\'en avale pas un autre plus tard', () => {
    const c = monterCarte(true);
    pointeur(c.carte, 'pointerdown');
    vi.advanceTimersByTime(DELAI_APPUI_LONG_MS);
    flushSync();
    pointeur(c.carte, 'pointercancel');
    expect(c.etat.coche).toBe(true);
    // Toucher suivant : l’avaleur est retiré au pointerdown, le clic passe.
    pointeur(c.carte, 'pointerdown');
    pointeur(c.carte, 'pointerup');
    c.caseSel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    flushSync();
    expect(c.etat.coche).toBe(false);
    c.defaire();
  });

  it('à la souris, rien ne s\'arme : le clic passe', () => {
    const c = monterCarte(false);
    pointeur(c.carte, 'pointerdown', 'mouse');
    vi.advanceTimersByTime(DELAI_APPUI_LONG_MS);
    pointeur(c.carte, 'pointerup', 'mouse');
    c.caseSel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    flushSync();
    expect(c.etat.modeSelection).toBe(false);
    expect(c.etat.coche).toBe(true);
    c.defaire();
  });
});

describe('web#3452 — LibraryV2 : chaque album porte l\'appui long, à condition stable', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/components/v2/LibraryV2.svelte'), 'utf8');

  it('la condition de l\'attachement ne lit pas modeSelection', () => {
    const corps = /function appuiSelection\(a: Album\) \{([\s\S]*?)\n  \}/.exec(src)?.[1] ?? '';
    expect(corps).toContain('appuiLong(');
    expect(corps).not.toMatch(/modeSelection/);
  });

  it('carte, ligne et carte du carrousel (.ccard) branchent appuiSelection', () => {
    for (const ouverture of [/<div class="card"[^>]*\{@attach appuiSelection\(a\)\}>/, /<div class="lhote"[^>]*\{@attach appuiSelection\(a\)\}>/, /<div class="ccard"[^>]*\{@attach appuiSelection\(a\)\}>/]) {
      expect(src).toMatch(ouverture);
    }
    expect(src).not.toMatch(/@attach appuiLong\(/);
  });
});

describe('web#3452 — focus des panneaux « Filtres » et « Affichage »', () => {
  function monterDrop() {
    document.body.innerHTML = '<div class="drop"><button id="ouvrir"></button><div class="menu panneau"><button id="un"></button><button id="deux"></button></div></div><button id="ailleurs"></button>';
    return {
      panneau: document.querySelector<HTMLElement>('.panneau')!,
      ouvrir: document.getElementById('ouvrir')!,
      ailleurs: document.getElementById('ailleurs')!,
    };
  }
  afterEach(() => { document.body.innerHTML = ''; });

  it('à l\'ouverture, le focus va au premier élément du panneau', () => {
    const d = monterDrop();
    focusPanneau()(d.panneau);
    expect(document.activeElement?.id).toBe('un');
  });

  it('à la fermeture (Échap, « Voir »…), il revient au bouton qui l\'a ouvert', () => {
    const d = monterDrop();
    const fermer = focusPanneau()(d.panneau);
    d.panneau.remove();
    fermer();
    expect(document.activeElement).toBe(d.ouvrir);
  });

  it('un clic ailleurs qui ferme garde son focus', () => {
    const d = monterDrop();
    const fermer = focusPanneau()(d.panneau);
    d.ailleurs.focus();
    fermer();
    expect(document.activeElement).toBe(d.ailleurs);
  });

  it('les deux panneaux de LibraryV2 portent l\'attachement', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/LibraryV2.svelte'), 'utf8');
    expect(src).toMatch(/class="menu panneau filtres-choix"[^>]*\{@attach focusPanneau\(\)\}/);
    expect(src).toMatch(/class="menu panneau panneau-vue"[^>]*\{@attach focusPanneau\(\)\}/);
  });
});
