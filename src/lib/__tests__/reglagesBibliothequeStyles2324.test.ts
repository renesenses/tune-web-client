// web#2324 — Réglages › Bibliothèque : « BPM de la bibliothèque »,
// « Propositions Discogs », la mention Discogs et « Reprendre la nuit les
// albums refusés par MusicBrainz » s'affichaient SANS style (Didier, fil 2390,
// deux captures, nouvelle interface) ; la phrase sous « ISO SACD » était plus
// grosse que les autres aides de la page.
//
// La cause est la portée des styles Svelte : un <style> est LOCAL à son
// composant. `PassesMetarustV2` n'avait aucun <style> et employait les classes
// du <style> de `SettingsV2` ; `IdentificationNuitV2` n'en reprenait que
// l'interrupteur. Sous jsdom, aucune feuille n'est appliquée : un test de
// rendu serait vert quoi qu'il arrive. Ce témoin lit donc la feuille LIVRÉE de
// chaque composant et exige qu'elle style chaque classe que son balisage
// emploie — exactement la règle que la portée locale impose.
//
// ⛔ Il n'établit pas le rendu dans un navigateur réel.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8');

function decouper(brut: string) {
  const source = brut.replace(/<!--[\s\S]*?-->/g, '');
  const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '';
  const balisage = source
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
  const classes = new Set<string>();
  for (const m of balisage.matchAll(/\sclass="([^"{}]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  for (const m of balisage.matchAll(/\sclass:([\w-]+)/g)) classes.add(m[1]);
  return { style, classes: [...classes] };
}

function declaration(style: string, selecteur: RegExp, propriete: string): string | null {
  for (const m of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').some((s) => selecteur.test(s.trim()))) continue;
    const d = new RegExp(`(?:^|;)\\s*${propriete}\\s*:\\s*([^;]+)`).exec(m[2]);
    if (d) return d[1].trim();
  }
  return null;
}

const COMPOSANTS = {
  PassesMetarustV2: '../../components/v2/PassesMetarustV2.svelte',
  IdentificationNuitV2: '../../components/v2/IdentificationNuitV2.svelte',
};

describe('web#2324 — les lignes des composants enfants de Réglages ont leurs styles', () => {
  for (const [nom, chemin] of Object.entries(COMPOSANTS)) {
    it(`${nom} style chaque classe que son balisage emploie`, () => {
      const { style, classes } = decouper(lire(chemin));
      expect(classes.length).toBeGreaterThan(0);
      const orphelines = classes.filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(style));
      expect(orphelines, `classes sans règle dans ${nom} (portée locale de SettingsV2)`).toEqual([]);
    });

    it(`${nom} : l'aide a la taille des aides voisines (11,5 px)`, () => {
      const { style } = decouper(lire(chemin));
      expect(declaration(style, /^\.hint$/, 'font-size')).toBe('11.5px');
    });
  }

  it('PassesMetarustV2 : la ligne met le bouton « Lancer » à droite du libellé', () => {
    const { style } = decouper(lire(COMPOSANTS.PassesMetarustV2));
    expect(declaration(style, /^\.row$/, 'display')).toBe('flex');
    expect(declaration(style, /^\.row$/, 'justify-content')).toBe('space-between');
  });

  it('SacdIsoStatus : la phrase d’état a la taille des aides (11,5 px)', () => {
    const { style } = decouper(lire('../../components/partages/SacdIsoStatus.svelte'));
    expect(declaration(style, /^p$/, 'font-size')).toBe('11.5px');
  });
});
