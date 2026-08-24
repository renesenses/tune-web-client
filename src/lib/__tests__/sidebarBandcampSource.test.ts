import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bandcamp appartient à « Sources », pas à « Navigation ».
 *
 * Il vivait entre « Ambiance » et « Historique » — un rangement d'accident,
 * pas de sens : Bandcamp fournit de la musique, exactement comme les services
 * de streaming, les radios et les serveurs multimédia. Un utilisateur qui
 * cherche d'où vient sa musique regarde « Sources » ; il n'a aucune raison de
 * descendre dans les écrans de navigation.
 *
 * Ce test lit la barre latérale et vérifie la POSITION, pas la présence : une
 * entrée présente au mauvais endroit passerait un test de présence.
 */

const SOURCE = readFileSync(
  resolve(__dirname, '../../components/Sidebar.svelte'),
  'utf8',
);

/** L'index du libellé de section, tel qu'il est rendu. */
function indexDeSection(cle: string): number {
  const i = SOURCE.indexOf(`{$t('${cle}')}`);
  expect(i, `le libellé de section « ${cle} » a disparu de la barre latérale`).toBeGreaterThan(-1);
  return i;
}

describe('barre latérale — Bandcamp', () => {
  it('est rendu UNE seule fois', () => {
    const occurrences = SOURCE.split("{$t('nav.bandcamp')}").length - 1;
    expect(occurrences, 'Bandcamp est rendu deux fois : un déplacement a laissé une copie').toBe(1);
  });

  it('est dans « Sources », après le début de cette section', () => {
    const sources = indexDeSection('nav.sources');
    const bandcamp = SOURCE.indexOf("{$t('nav.bandcamp')}");
    expect(bandcamp).toBeGreaterThan(sources);
  });

  it("n'est plus dans « Navigation »", () => {
    const navigation = indexDeSection('nav.navigation');
    const sources = indexDeSection('nav.sources');
    const bandcamp = SOURCE.indexOf("{$t('nav.bandcamp')}");
    // La borne haute compte autant que la borne basse : sans elle, une entrée
    // restée dans « Navigation » satisferait encore « après nav.sources » si
    // les deux sections étaient un jour inversées.
    expect(bandcamp).toBeGreaterThan(navigation);
    expect(bandcamp).toBeGreaterThan(sources);
  });

  it('reste masqué quand le plugin est absent', () => {
    // Une entrée qui mène à une porte fermée est pire que pas d'entrée : la
    // garde doit survivre au déplacement.
    const bandcamp = SOURCE.indexOf("{$t('nav.bandcamp')}");
    const gardeAvant = SOURCE.lastIndexOf('{#if $bandcampUsable}', bandcamp);
    expect(gardeAvant, 'la garde `$bandcampUsable` a été perdue au déplacement').toBeGreaterThan(-1);
    // Et elle doit être PROCHE : une garde lointaine serait celle d'autre chose.
    expect(bandcamp - gardeAvant).toBeLessThan(400);
  });
});
