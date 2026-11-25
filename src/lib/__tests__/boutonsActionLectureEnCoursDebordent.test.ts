// @vitest-environment jsdom
//
// rc13.91 — « Lecture en cours » : la rangée de boutons d'action (Lyrics,
// Share, EQ, Sleep, Crossfeed…) débordait à droite de la colonne d'infos.
// « Cros… » était coupé, les suivants invisibles, sans défilement possible.
//
// ## LA CAUSE
//
// `.np-extra-btns` passait déjà à la ligne (`flex-wrap`, web#2019), mais son
// ancêtre `.content-layout` est un ITEM FLEX de `.np-scroll` : son `min-width`
// automatique vaut sa largeur min-content, que la pochette (`flex-shrink: 0`)
// et l'analyseur de spectre élargissent au-delà de `width: 100%`. L'îlot
// dépassait `.np-scroll`, la colonne d'infos avec lui, et la rangée n'avait
// aucune borne à respecter pour passer à la ligne.
//
// ## LE TÉMOIN
//
// jsdom ne met rien en page : on compile la VRAIE feuille de
// `NowPlaying.svelte` et on lit les styles CALCULÉS sur la chaîne d'ancêtres
// (même méthode que boutonBannirEcrase2019.test.ts). Chaque maillon entre
// `.np-scroll` et la rangée doit pouvoir rétrécir, et la rangée doit passer à
// la ligne et rester bornée. Le correctif a été retiré pour la contre-épreuve
// (`min-width: 0` sur `.content-layout`) : le test « îlot » rougit.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PORTEE = 'npdebord';

beforeAll(() => {
  const chemin = 'src/components/partages/NowPlaying.svelte';
  const src = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
  const { css } = compile(src, { css: 'external', filename: chemin, cssHash: () => PORTEE });
  if (!css?.code) throw new Error(`${chemin} : aucune feuille compilée`);
  const el = document.createElement('style');
  el.textContent = css.code;
  document.head.appendChild(el);
});

function chaine(classes: string): Record<string, HTMLElement> {
  const mk = (cls: string, parent?: HTMLElement) => {
    const e = document.createElement('div');
    e.className = `${cls} ${PORTEE}`;
    (parent ?? document.body).appendChild(e);
    return e;
  };
  const scroll = mk('np-scroll');
  const ilot = mk(`content-layout wide ${classes}`, scroll);
  const colonne = mk('info-column', ilot);
  const infos = mk('track-info', colonne);
  const rangee = mk('np-extra-btns', infos);
  return { scroll, ilot, colonne, infos, rangee };
}

describe('rc13.91 — les boutons d’action de Lecture en cours ne débordent plus', () => {
  for (const classes of ['', 'v3-44-56', 'file-sous-barre']) {
    describe(`disposition « ${classes || 'large'} »`, () => {
      it('l’îlot peut rétrécir sous sa largeur min-content (sinon il dépasse .np-scroll)', () => {
        const { ilot } = chaine(classes);
        expect(getComputedStyle(ilot).minWidth).toBe('0px');
      });

      it('la colonne d’infos et le bloc titre peuvent rétrécir', () => {
        const { colonne, infos } = chaine(classes);
        expect(getComputedStyle(colonne).minWidth).toBe('0px');
        expect(getComputedStyle(infos).minWidth).toBe('0px');
      });

      it('la rangée passe à la ligne et ne dépasse pas sa colonne', () => {
        const { rangee } = chaine(classes);
        const s = getComputedStyle(rangee);
        expect(s.flexWrap).toBe('wrap');
        expect(s.maxWidth).toBe('100%');
        expect(s.minWidth).toBe('0px');
      });
    });
  }
});
