// @vitest-environment jsdom
//
// rc12 — « Taille du texte » (go de Bertrand du 12/11/2026 ; testeurs :
// « chữ nhỏ li ti », des textes minuscules).
//
// Ce banc garde :
//   1. la préférence : « Normale » par défaut, valeur inconnue → « Normale » ;
//   2. l'attribut `<html data-v2-taille-texte>` et la feuille : les trois crans
//      de `tune-v2.css` sont ceux de `ECHELLE_TEXTE`, « Normale » vaut 1 ;
//   3. 🔴 la GARDE : toute taille de police en px/rem des composants passe par
//      `--v2-txt-echelle` — sinon le réglage laisse des îlots minuscules. Les
//      composants de la barre de lecture et de Lecture en cours sont exclus
//      (chantier parallèle de la forme d'onde), et listés ici ;
//   4. contre-épreuve : la garde attrape une taille écrite en dur ;
//   5. les chaînes dans les quinze locales, et l'entrée de l'index des réglages.
import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { preferences } from '../stores/preferences';
import {
  appliquerTailleTexte, ECHELLE_TEXTE, estTailleTexte, TAILLES_TEXTE, TAILLE_TEXTE_DEFAUT,
} from '../tailleTexte';
import { REGLAGES } from '../reglagesIndex';

const RACINE = process.cwd();
const lire = (p: string) => readFileSync(resolve(RACINE, p), 'utf-8');

/** Barre de lecture et Lecture en cours : pas encore à l'échelle (autre chantier). */
const EXCLUS = new Set([
  'src/components/partages/TransportBar.svelte',
  'src/components/partages/SeekBar.svelte',
  'src/components/partages/NowPlaying.svelte',
  'src/components/partages/NowPlayingEqPanel.svelte',
  'src/components/partages/NowPlayingLyrics.svelte',
  'src/components/v2/mini/MiniBarreLecture.svelte',
]);

function fichiers(d: string): string[] {
  const o: string[] = [];
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) o.push(...fichiers(p));
    else if (/\.(svelte|css)$/.test(n)) o.push(p);
  }
  return o;
}

/** Les tailles écrites en dur (px/rem) qui échappent au jeton, dans un bloc de style. */
export function taillesEnDur(css: string): string[] {
  const f: string[] = [];
  for (const ligne of css.split('\n')) {
    const sansCalc = ligne.replace(/calc\([^;]*?var\(--v2-txt-echelle, 1\)\)/g, '');
    if (/font-size\s*:\s*\d*\.?\d+(px|rem)/.test(sansCalc)) f.push(ligne.trim());
    if (/\bfont\s*:\s*(?:[a-z-]+\s+|\d{3}\s+)*\d*\.?\d+(px|rem)/.test(sansCalc)) f.push(ligne.trim());
  }
  return f;
}
const styles = (src: string, css: boolean) =>
  css ? src : (src.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? []).join('\n');

afterEach(() => document.documentElement.removeAttribute('data-v2-taille-texte'));

describe('rc12 — Taille du texte', () => {
  it('« Normale » par défaut : personne ne voit son affichage changer sans l’avoir demandé', () => {
    expect(TAILLE_TEXTE_DEFAUT).toBe('normale');
    expect(get(preferences).tailleTexte).toBe('normale');
    expect(ECHELLE_TEXTE.normale).toBe(1);
    expect(ECHELLE_TEXTE.petite).toBeLessThan(1);
    expect(ECHELLE_TEXTE.grande).toBeGreaterThan(1);
  });

  it('pose le cran sur <html> ; une valeur inconnue retombe sur « Normale »', () => {
    appliquerTailleTexte('grande');
    expect(document.documentElement.getAttribute('data-v2-taille-texte')).toBe('grande');
    appliquerTailleTexte('énorme');
    expect(document.documentElement.getAttribute('data-v2-taille-texte')).toBe('normale');
    expect(estTailleTexte('petite')).toBe(true);
    expect(estTailleTexte(1.2)).toBe(false);
  });

  it('la feuille porte les MÊMES crans que le code', () => {
    const css = lire('src/styles/tune-v2.css');
    expect(css).toMatch(/:root\{\s*--v2-txt-echelle:1;\s*\}/);
    for (const t of TAILLES_TEXTE) {
      if (t === 'normale') continue;
      const m = new RegExp(`:root\\[data-v2-taille-texte="${t}"\\]\\{\\s*--v2-txt-echelle:([\\d.]+);`).exec(css);
      expect(m, t).not.toBeNull();
      expect(Number(m![1])).toBe(ECHELLE_TEXTE[t]);
    }
  });

  it('🔴 toute taille de police des composants passe par le jeton', () => {
    const fautes: string[] = [];
    for (const f of [...fichiers(join(RACINE, 'src/components')), ...fichiers(join(RACINE, 'src/styles'))]) {
      const rel = relative(RACINE, f);
      if (EXCLUS.has(rel)) continue;
      for (const l of taillesEnDur(styles(readFileSync(f, 'utf-8'), f.endsWith('.css')))) fautes.push(`${rel}: ${l}`);
    }
    expect(fautes).toEqual([]);
  });

  it('contre-épreuve : une taille en dur est attrapée, une taille à l’échelle ne l’est pas', () => {
    expect(taillesEnDur('.a{font-size: 13px}\n.b{font:600 12px var(--v2-sans)}')).toHaveLength(2);
    expect(taillesEnDur('.a{font-size: calc(13px * var(--v2-txt-echelle, 1))}')).toEqual([]);
    expect(taillesEnDur('.a{font-size: clamp(11px, 1vw, 16px)}'), 'les tailles fluides restent libres').toEqual([]);
  });

  it('Réglages › Interface : le sélecteur à trois crans, indexé pour la recherche', () => {
    const s = lire('src/components/v2/SettingsV2.svelte');
    expect(s).toContain('data-reglage="taille-texte"');
    expect(s).toContain('{#each TAILLES_TEXTE as tt (tt)}');
    expect(REGLAGES.find((r) => r.id === 'taille-texte')?.section).toBe('interface');
    expect(lire('src/components/v2/ShellV2.svelte')).toContain('appliquerTailleTexte($preferences.tailleTexte)');
  });

  it('les chaînes dans les quinze locales', () => {
    const dir = resolve(RACINE, 'src/lib/locales');
    const fs = readdirSync(dir).filter((n) => /^[a-z]{2}\.ts$/.test(n));
    expect(fs).toHaveLength(15);
    for (const n of fs) {
      const src = readFileSync(resolve(dir, n), 'utf-8');
      for (const k of ['settings.textSize', 'settings.textSizeHint', 'settings.textSizeSmall', 'settings.textSizeNormal',
        'settings.textSizeLarge', 'reglages.termes.tailleTexte']) {
        expect(src, `${n} ${k}`).toMatch(new RegExp(`"${k.replace(/\./g, '\\.')}": "[^"]+"`));
      }
    }
  });
});
