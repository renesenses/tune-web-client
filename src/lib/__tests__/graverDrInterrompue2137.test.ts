// Fil 2137 / ticket 229 (Philippe) : « Gravure en cours… » grisé à vie,
// compteur figé à « 50 / 4 046 pistes traitées ». Une passe de gravure du DR
// tuée en route (redémarrage, panne) laissait en base un `running` que plus
// personne ne changeait ; le serveur le renvoyait tel quel, et l'écran grise
// le bouton tant que le statut vaut `running`.
//
// Le serveur (branche fix/gravure-dr-interrompue-2137) rend désormais
// `status: "interrupted"`, compteurs du dernier jalon gardés. Côté client :
//  - `interrupted` laisse le bouton CLIQUABLE ;
//  - il dit où la passe s'est arrêtée : « Interrompue à N / M — relancer » ;
//  - un serveur ancien ne renvoie jamais `interrupted` : rien ne change.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];

describe('gravure du DR interrompue (fil 2137)', () => {
  const api = sansCommentaires(lire('src/lib/api.ts'));
  const vue = sansCommentaires(lire('src/components/v2/MetadataV2.svelte'));

  const i = vue.indexOf('onclick={graverDr}');
  const ouverture = vue.lastIndexOf('<button', i);
  const bouton = vue.slice(ouverture, vue.indexOf('</button>', i));

  /** L'expression `disabled={…}` du bouton, ÉVALUÉE comme le ferait Svelte. */
  const inerte = (dr: Record<string, unknown>, drBusy = false): boolean => {
    const m = /disabled=\{([^}]*)\}/.exec(bouton);
    expect(m, 'attribut disabled du bouton Graver introuvable').not.toBeNull();
    return Boolean(new Function('dr', 'drBusy', `return (${m![1]});`)(dr, drBusy));
  };

  it('le type de l’état connaît `interrupted`', () => {
    expect(api).toMatch(/export interface GravureDrEtat \{\s*status: [^;]*'interrupted'[^;]*;/);
  });

  it('`interrupted` rend le bouton cliquable — `running` le grise toujours', () => {
    const photo = { total: 4046, written: 40, already: 10, skipped: 0, errors: 0, a_graver: 18609 };
    expect(inerte({ ...photo, status: 'interrupted' }), 'interrupted').toBe(false);
    // Serveur ancien : le `running` périmé grise comme avant — inchangé.
    expect(inerte({ ...photo, status: 'running' }), 'running').toBe(true);
    expect(inerte({ ...photo, status: 'done' }), 'done').toBe(false);
    expect(inerte({ ...photo, status: 'interrupted' }, true), 'pendant le clic').toBe(true);
    expect(inerte({ ...photo, status: 'interrupted', a_graver: 0 }), 'rien à graver').toBe(true);
  });

  it('le bouton dit où la passe s’est arrêtée, avec le dernier compteur', () => {
    expect(bouton).toMatch(
      /\{:else if dr\.status === 'interrupted'\}\{\$t\('v2\.meta\.drInterrupted' as any\)\.replace\('\{done\}', \$formatNombre\(drFaites\)\)\.replace\('\{total\}', \$formatNombre\(dr\.total \?\? 0\)\)\}/,
    );
    // `running` garde son libellé, le reste garde « Graver ».
    expect(bouton).toMatch(/\{#if dr\.status === 'running'\}\{\$t\('v2\.meta\.drRunning' as any\)\}/);
    expect(bouton).toMatch(/\{:else\}\{\$t\('v2\.meta\.drEngraveBtn' as any\)\}\{\/if\}/);
    // Le compteur est le même que celui de la ligne d'avancement.
    expect(vue).toContain(
      'const drFaites = $derived(dr ? (dr.written ?? 0) + (dr.already ?? 0) + (dr.skipped ?? 0) + (dr.errors ?? 0) : 0);',
    );
  });

  it('on ne relit l’état en boucle que pendant `running` — pas sur `interrupted`', () => {
    expect(vue).toMatch(/if \(dr\?\.status === 'running'\) \{[\s\S]{0,160}setTimeout\(chargerDr, 2000\)/);
    expect((vue.match(/setTimeout\(chargerDr/g) ?? []).length).toBe(1);
  });

  it('le libellé existe dans les onze langues, avec ses deux compteurs', () => {
    for (const l of LANGUES) {
      const m = /"v2\.meta\.drInterrupted": "([^"]+)"/.exec(lire(`src/lib/locales/${l}.ts`));
      expect(m, `${l} : v2.meta.drInterrupted`).not.toBeNull();
      expect(m![1], l).toContain('{done}');
      expect(m![1], l).toContain('{total}');
    }
  });
});
