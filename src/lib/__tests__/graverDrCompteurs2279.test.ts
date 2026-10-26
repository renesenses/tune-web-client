// web#2279 (fil 2349, Tades, rc6) : « 1825 / 1886 pistes traitées » et
// « 1 295 pistes à graver » affichés en même temps. Aucun compteur n'est faux
// (`tune-server/src/routes/library/graver_dr.rs`) :
//  - `total` est figé au clic sur « Graver » (`candidates.len()`), et
//    `written + already + skipped + errors` avance sur CETTE liste ;
//  - `a_graver` est recompté à chaque `GET /library/dr/gravure` : il inclut
//    les pistes que l'analyse a mesurées depuis le lancement, et les fichiers
//    introuvables ou en erreur de la passe (restés `dr_source = analysis`).
// L'écran ne le disait pas. Il le dit désormais, dans toutes les langues.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import vi from '../locales/vi';
import el from '../locales/el';
import nb from '../locales/nb';
import pl from '../locales/pl';
import zh from '../locales/zh';

const LANGUES: Record<string, Record<string, string>> = {
  de, en, es, fr, hu, it: it_, ja, ko, ro, sv, vi, el, zh,
} as any;

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Graver le DR : chaque compteur dit à quoi il porte (web#2279)', () => {
  const vue = sansCommentaires(lire('src/components/v2/MetadataV2.svelte'));

  /** `passeConnue`, ÉVALUÉ comme le ferait Svelte. */
  const passeConnue = (dr: Record<string, unknown> | null): boolean => {
    const m = /const passeConnue = \$derived\((.*)\);/.exec(vue);
    expect(m, '`passeConnue` introuvable').not.toBeNull();
    return Boolean(new Function('dr', `return (${m![1]});`)(dr));
  };

  it('dès qu’une passe existe, « à graver » se dit recompté en direct', () => {
    const photo = { a_graver: 1295, total: 1886, written: 1800, already: 20, skipped: 3, errors: 2 };
    expect(passeConnue({ ...photo, status: 'running' }), 'running').toBe(true);
    expect(passeConnue({ ...photo, status: 'interrupted' }), 'interrupted').toBe(true);
    expect(passeConnue({ ...photo, status: 'done' }), 'done').toBe(true);
    // Avant tout lancement, le nombre est un simple inventaire : libellé inchangé.
    expect(passeConnue({ a_graver: 1295, status: 'idle' }), 'idle').toBe(false);
    expect(passeConnue(null), 'pas encore chargé').toBe(false);

    const grille = vue.slice(vue.indexOf('<div class="drgrid">'), vue.indexOf('</div>\n        {#if', vue.indexOf('<div class="drgrid">')));
    expect(grille).toContain(
      "<b>{$formatNombre(dr.a_graver)}</b><span>{$t((passeConnue ? 'v2.meta.drToEngraveLive' : 'v2.meta.drToEngrave') as any)}</span>",
    );
  });

  it('pendant une passe (ou après une interruption), l’écran explique les deux nombres', () => {
    expect(vue).toMatch(
      /\{#if dr\.status === 'running' \|\| dr\.status === 'interrupted'\}\s*<p class="note" data-temoin="dr-compteurs">\{\$t\('v2\.meta\.drCountersNote' as any\)\}<\/p>/,
    );
    // L'avancement reste le même compteur, sur la liste figée.
    expect(vue).toContain(
      "{$t('v2.meta.drProgress' as any).replace('{done}', $formatNombre(drFaites)).replace('{total}', $formatNombre(dr.total ?? 0))}",
    );
  });

  it('le français dit précisément à quoi porte chaque nombre', () => {
    expect(fr['v2.meta.drProgress']).toMatch(/^Passe en cours : \{done\} \/ \{total\} .*liste figée au lancement/);
    expect(fr['v2.meta.drToEngraveLive']).toBe('restent à graver (recompté en direct)');
    const note = fr['v2.meta.drCountersNote'];
    expect(note).toContain('liste figée au clic');
    expect(note).toContain('recompté en direct');
    expect(note).toContain('pistes mesurées depuis le lancement');
    expect(note).toContain('introuvables ou en erreur');
  });

  it.each(Object.keys(LANGUES))('%s : les trois libellés existent, traduits, avec leurs marqueurs', (l) => {
    const d = LANGUES[l];
    for (const cle of ['v2.meta.drProgress', 'v2.meta.drToEngraveLive', 'v2.meta.drCountersNote']) {
      expect(typeof d[cle] === 'string' && d[cle].trim().length > 0, `${l} : ${cle} manquant`).toBe(true);
      if (l !== 'en') expect(d[cle], `${l} : ${cle} recopié de l’anglais`).not.toBe((en as Record<string, string>)[cle]);
    }
    expect(d['v2.meta.drProgress']).toContain('{done}');
    expect(d['v2.meta.drProgress']).toContain('{total}');
    // Libellé « en direct » distinct du libellé d'inventaire.
    expect(d['v2.meta.drToEngraveLive']).not.toBe(d['v2.meta.drToEngrave']);
  });
});
