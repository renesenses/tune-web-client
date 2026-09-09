import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2732 — Smart Collections : la limite sauvegardée est relue sous un autre
 * nom et retombe à 500.
 *
 * Le serveur persiste et renvoie la borne sous `max_limit` (dépôt serveur,
 * `docs/contrat-web.json` : champ obligatoire de GET et POST
 * `/library/smart-collections` ; ni `max_albums`, ni `auto_refresh`, ni
 * `updated_at` n'y figurent, et `rules` y est le tableau JSON décodé).
 *
 * L'éditeur envoyait bien `max_limit` à la sauvegarde, mais relisait
 * `collection.max_albums` à la réouverture : `undefined`, donc 500 affiché,
 * puis 500 écrasait la vraie borne à la sauvegarde suivante. Le correctif
 * tient en un nom ; il avait été écrit le 28/08 (`a3c17fd6`) et jamais
 * fusionné. Cette garde lit les sources : si l'ancien nom revient dans
 * l'éditeur ou dans le type, elle tombe.
 */
const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const editeur = sansCommentaires(lire('src/components/SmartCollectionEditor.svelte'));
const vue = sansCommentaires(lire('src/components/SmartCollectionsView.svelte'));
const types = sansCommentaires(lire('src/lib/types.ts'));
const blocType = types.match(/export interface SmartCollection \{([\s\S]*?)\n\}/)?.[1] ?? '';

describe('#2732 — un seul nom de contrat, max_limit, de la réponse au formulaire', () => {
  it('l’éditeur relit la borne sauvegardée sous max_limit, pas max_albums', () => {
    expect(editeur).toMatch(/collection\?\.max_limit\s*\?\?\s*500/);
    expect(editeur).not.toMatch(/max_albums/);
  });

  it('l’éditeur enregistre sous le nom qu’il relit', () => {
    // Prévisualisation ET sauvegarde : même nom que la relecture.
    expect(editeur).toMatch(/max_limit:\s*maxAlbums/);
  });

  it('le type SmartCollection suit la réponse réelle du serveur', () => {
    expect(blocType).not.toBe('');
    expect(blocType).toMatch(/\bmax_limit:/);
    for (const fantome of ['max_albums', 'auto_refresh', 'updated_at']) {
      expect(blocType, `${fantome} n'est pas dans la réponse Rust`).not.toContain(fantome);
    }
    // Le routeur renvoie le tableau décodé, pas une chaîne JSON.
    expect(blocType).toMatch(/\brules:\s*SmartRule\[\]/);
  });

  it('le résumé des règles accepte le tableau que le serveur renvoie', () => {
    // `JSON.parse` d'un tableau jette : le résumé sortait vide.
    expect(vue).toMatch(/Array\.isArray\(col\.rules\)/);
  });
});
