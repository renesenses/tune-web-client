/**
 * web#2072 — Didier, fil 2210 (1.0.0-rc3) : Streaming › Favoris, au
 * défilement, « une fine partie des pochettes d'albums apparaît entre les
 * choix "Éditorial, Playlists, Favoris, Genres" et les indications "Albums,
 * Artistes, Titres" qui ne bougent pas ».
 *
 * Cause : le conteneur qui défile, `.scroll`, a un `padding-top`. Un élément
 * `position:sticky; top:0` s'y colle au bord de ce RETRAIT, pas au bord du
 * conteneur : la grille défile visible dans la bande du retrait, entre la
 * rangée d'onglets (hors `.scroll`) et le sommaire figé. Même défaut pour la
 * rangée des sous-genres (`.chips.sous`, #887).
 *
 * La garde : tout en-tête figé de `.scroll` remonte d'autant (`top` négatif
 * égal au retrait) et son fond opaque couvre la bande (`padding-top` au moins
 * égal au retrait). Un `margin-top` négatif identique au supplément de
 * `padding-top` garde la mise en page au repos inchangée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireStyles } from './ancrageDefilement';

const source = readFileSync(resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'), 'utf-8');
const regles = lireStyles(source);
const exacte = (sel: string) => Object.assign({}, ...regles.filter((r) => r.selecteur === sel).map((r) => r.declarations));
const px = (v: string | undefined) => {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec((v ?? '').trim());
  return m ? Number(m[1]) : v === '0' ? 0 : NaN;
};
/** padding-top d'une règle, raccourci `padding` compris (la dernière déclaration lue gagne). */
function paddingHaut(d: Record<string, string>): number {
  if (d['padding-top'] !== undefined) return px(d['padding-top']);
  return px((d.padding ?? '0').split(/\s+/)[0]);
}

describe('web#2072 — rien ne défile entre les onglets du service et l’en-tête figé', () => {
  const retrait = paddingHaut(exacte('.scroll'));

  it('le conteneur qui défile a bien un retrait en haut (sinon la garde ne garde rien)', () => {
    expect(retrait).toBeGreaterThan(0);
  });

  for (const sel of ['.sommaire', '.chips.sous']) {
    it(`🔴 ${sel} remonte du retrait de .scroll et le couvre de son fond`, () => {
      const d = exacte(sel);
      expect(d.position).toBe('sticky');
      expect(px(d.top), `${sel} top`).toBe(-retrait);
      expect(paddingHaut(d), `${sel} padding-top`).toBeGreaterThanOrEqual(retrait);
      expect(d.background ?? d['background-color']).toBeTruthy();
    });
  }
});
