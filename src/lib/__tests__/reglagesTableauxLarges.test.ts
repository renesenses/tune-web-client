// Recette du .18 (15/11/2026), Bertrand : « Écran réglages Library pas bon !! »
// — la colonne de 720 px des Réglages (maquette de Levente, #3058) bridait
// aussi l'audit d'intégrité : « Full » et « Healthy » une lettre par ligne,
// « Cannot be located » sur trois lignes.
//
// Ce banc lit la SOURCE (la mise en page réelle dépend du rendu) : les blocs
// larges portent `pleine-largeur`, leur carte échappe aux 720 px, le texte
// des réglages y reste ; dans l'audit, les colonnes courtes ne se coupent pas
// et seul le chemin se coupe n'importe où.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const V2 = join(__dirname, '..', '..', 'components');
const ECRAN = readFileSync(join(V2, 'v2', 'SettingsV2.svelte'), 'utf8');
const AUDIT = readFileSync(join(V2, 'partages', 'AuditIntegrite.svelte'), 'utf8');
const style = (src: string) => src.slice(src.lastIndexOf('<style>'));
/** Le corps CSS d'une règle dont le sélecteur est donné tel quel. */
function regle(css: string, selecteur: string): string | null {
  const i = css.indexOf(selecteur + '{') >= 0 ? css.indexOf(selecteur + '{') : css.indexOf(selecteur + ' {');
  if (i < 0) return null;
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
}

describe('Réglages — les tableaux larges échappent à la colonne de 720 px', () => {
  it('l’audit d’intégrité, l’import d’un autre lecteur et les chemins écartés sont marqués pleine-largeur', () => {
    expect(ECRAN).toMatch(/<div class="pleine-largeur" data-reglage="audit-integrite"><AuditIntegrite \/><\/div>/);
    expect(ECRAN).toMatch(/<div class="pleine-largeur" data-reglage="import-autre-lecteur"><ImportLecteurV2 \/><\/div>/);
    expect(ECRAN).toMatch(/<details class="ecartes pleine-largeur">/);
  });

  it('la carte qui porte un bloc large n’est plus bornée, le texte de ses réglages l’est toujours', () => {
    const css = style(ECRAN);
    expect(regle(css, '.pane > *'), 'la colonne de 720 px a disparu').toMatch(/max-width:720px/);
    expect(regle(css, '.pane > .card:has(.pleine-largeur)')).toMatch(/max-width:none/);
    expect(regle(css, '.pane > .card:has(.pleine-largeur) > :not(.pleine-largeur):not(:has(.pleine-largeur))')).toMatch(/max-width:720px/);
    const bloc = regle(css, '.pane .pleine-largeur');
    expect(bloc).toMatch(/max-width:none/);
    expect(bloc, 'un tableau trop large doit défiler dans son cadre').toMatch(/overflow-x:auto/);
  });

  it('audit : colonnes courtes en nowrap, seul le chemin se coupe n’importe où, le tableau défile dans son cadre', () => {
    const css = style(AUDIT);
    expect(regle(css, '.court')).toMatch(/white-space:\s*nowrap/);
    expect(regle(css, '.chemin')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(regle(css, 'th, td'), 'overflow-wrap:anywhere sur toutes les cellules coupe « Full » lettre par lettre').not.toMatch(/overflow-wrap/);
    expect(regle(css, '.rapport')).toMatch(/overflow-x:\s*auto/);
    // Mode, verdict et position sont des colonnes courtes, en tête comme dans le corps.
    expect((AUDIT.match(/<th class="court">/g) ?? []).length).toBe(3);
    expect((AUDIT.match(/<td class="court">/g) ?? []).length).toBe(3);
    expect(AUDIT).toMatch(/<td class="chemin">/);
  });
});
