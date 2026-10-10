// @vitest-environment jsdom
//
// web#2019, point 2 — Alex Campbell (fil 2178, Safari 18.6, 1.0.0-rc2) :
// « 'Ban this track' looks squished, maybe even it out like 'Crossfeed'. »
//
// ## LA CAUSE
//
// La rangée `.np-extra-btns` de « Lecture en cours » est un flex SANS
// `flex-wrap`, et ses boutons `.np-credits-btn` gardent `flex-shrink: 1` sans
// `white-space: nowrap`. Avec huit boutons (Crédits, Paroles, Égaliseur,
// Partager, Sleep, Crossfeed, Réveil, Bannir), la place manque : le moteur
// rétrécit chaque bouton jusqu'à sa largeur min-content. Un libellé d'un seul
// mot (« Crossfeed ») ne peut pas descendre sous ce mot. « Ban this track », lui,
// se casse sur trois lignes dans sa pastille : le bouton paraît écrasé, et
// c'est le seul à l'être. C'est le même mécanisme que #975, où il touchait un
// panneau.
//
// ## LE TÉMOIN
//
// jsdom ne met rien en page, donc une largeur ne s'y mesure pas. On compile la
// VRAIE feuille de `NowPlaying.svelte` (portée fixée par `cssHash`), on la pose
// dans le document, et on lit les styles CALCULÉS sur la rangée et sur un
// bouton. Un bouton ne doit ni se rétrécir ni se casser, et la rangée doit
// passer à la ligne quand la place manque.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PORTEE = 'np2019';

beforeAll(() => {
  const chemin = 'src/components/partages/NowPlaying.svelte';
  const src = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
  const { css } = compile(src, { css: 'external', filename: chemin, cssHash: () => PORTEE });
  if (!css?.code) throw new Error(`${chemin} : aucune feuille compilée`);
  const el = document.createElement('style');
  el.textContent = css.code;
  document.head.appendChild(el);
});

function rangee(): { ligne: HTMLElement; bannir: HTMLElement } {
  const ligne = document.createElement('div');
  ligne.className = `np-extra-btns ${PORTEE}`;
  for (const libelle of ['Credits', 'Lyrics', 'EQ', 'Share', 'Sleep', 'Crossfeed', 'Alarm', 'Ban this track']) {
    const b = document.createElement('button');
    b.className = `np-credits-btn ${PORTEE}`;
    b.textContent = libelle;
    ligne.appendChild(b);
  }
  document.body.appendChild(ligne);
  return { ligne, bannir: ligne.lastElementChild as HTMLElement };
}

describe('#2019 — « Ban this track » ne s’écrase plus dans la rangée de Lecture en cours', () => {
  it('la feuille compilée vise bien la rangée et ses boutons', () => {
    const { ligne, bannir } = rangee();
    expect(getComputedStyle(ligne).display).toBe('flex');
    expect(getComputedStyle(bannir).display).toBe('inline-flex');
  });

  it('un bouton garde son libellé sur une ligne et ne se rétrécit pas', () => {
    const { bannir } = rangee();
    const s = getComputedStyle(bannir);
    expect(s.whiteSpace).toBe('nowrap');
    expect(s.flexShrink).toBe('0');
  });

  it('la rangée passe à la ligne quand la place manque', () => {
    const { ligne } = rangee();
    expect(getComputedStyle(ligne).flexWrap).toBe('wrap');
  });
});
