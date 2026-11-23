/**
 * Fil forum 2844 — dans la Bibliothèque, le menu « Source » d'une bibliothèque
 * purement locale montre une note (« Seuls des albums locaux sont affichés… »).
 * Ce <p> n'avait ni classe ni règle : il prenait la police par défaut du
 * navigateur (16 px, pleine couleur), trois fois la taille des entrées du menu.
 *
 * Garde : la note porte une classe, et cette classe a une taille de police
 * alignée sur l'échelle du menu.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(resolve(__dirname, '../../components/v2/LibraryV2.svelte'), 'utf-8');

describe('fil 2844 — note du menu Source', () => {
  it('la note « albums locaux seulement » porte une classe', () => {
    expect(src).not.toMatch(/<p>\{\$tr\('upnp\.sync\.localOnly'/);
    expect(src).toMatch(/<p class="menu-note">\{\$tr\('upnp\.sync\.localOnly'/);
  });

  it('la classe a une taille de police à l’échelle du menu', () => {
    const regle = src.match(/\.drop \.menu \.menu-note\{([^}]*)\}/);
    expect(regle).not.toBeNull();
    expect(regle![1]).toMatch(/font:calc\(11\.5px \* var\(--v2-txt-echelle, 1\)\)/);
    expect(regle![1]).toMatch(/color:var\(--v2-txt3\)/);
  });
});
