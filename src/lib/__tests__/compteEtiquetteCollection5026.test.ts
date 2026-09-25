// tune-server-rust#5026 — Sevy Tabroc, fil forum 1937, 0.9.164 : la règle
// « Étiquette » d'une collection intelligente annonçait « Sept Oct 2026 (1) »,
// et l'aperçu juste en dessous « 0 albums correspondent ».
//
// Le « (1) » était le `count` de `GET /tags`, qui compte TOUT objet étiqueté
// (piste, objet de streaming…). La règle ne lit que les albums et artistes de
// la bibliothèque. Le sélecteur doit annoncer ce que la règle rend.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  comptesDesEtiquettes,
  libelleEtiquette,
  regleDEtiquette,
} from '../compteEtiquetteCollection';

const EDITEUR = readFileSync(
  resolve(process.cwd(), 'src/components/v2/CollectionSmartEditeurV2.svelte'),
  'utf8',
);

/** L'étiquette de la capture : une pièce étiquetée, que la règle ne lit pas. */
const SEPT_OCT = { id: 12, name: 'Sept Oct 2026', color: '#888', count: 1 };

describe('#5026 — le nombre du sélecteur « Étiquette » est celui que la règle rend', () => {
  it('annonce le total de l’aperçu, pas le `count` de /tags', () => {
    expect(libelleEtiquette(SEPT_OCT, new Map([[12, 0]]))).toBe('Sept Oct 2026 (0)');
    expect(libelleEtiquette(SEPT_OCT, new Map([[12, 3]]))).toBe('Sept Oct 2026 (3)');
  });

  it('tant que le total n’est pas connu, AUCUN nombre plutôt que « (1) »', () => {
    expect(libelleEtiquette(SEPT_OCT, new Map())).toBe('Sept Oct 2026');
  });

  it('demande l’aperçu de la règle « porte l’étiquette », sans borne', async () => {
    const apercu = vi.fn(async (p: { rules: any[]; match_mode?: string }) => ({
      total: p.rules[0].value === '12' ? 0 : 5,
      albums: [],
    }));
    const comptes = await comptesDesEtiquettes([12, 40], apercu);
    expect(comptes.get(12)).toBe(0);
    expect(comptes.get(40)).toBe(5);
    expect(apercu).toHaveBeenCalledWith({ rules: [regleDEtiquette(12)], match_mode: 'all' });
    // 🔴 `max_limit` ferait de `total` la longueur d'une liste bornée.
    for (const [p] of apercu.mock.calls) expect(p).not.toHaveProperty('max_limit');
    expect(regleDEtiquette(12)).toEqual({ field: 'tag', op: 'is', value: '12' });
  });

  it('un aperçu refusé laisse l’étiquette sans nombre, sans emporter les autres', async () => {
    const apercu = vi.fn(async (p: { rules: any[] }) => {
      if (p.rules[0].value === '1') throw new Error('500');
      return { total: 2 };
    });
    const comptes = await comptesDesEtiquettes([1, 2], apercu);
    expect(comptes.has(1)).toBe(false);
    expect(comptes.get(2)).toBe(2);
  });

  it('pas plus de requêtes simultanées que demandé', async () => {
    let enVol = 0;
    let pointe = 0;
    const apercu = async () => {
      enVol++;
      pointe = Math.max(pointe, enVol);
      await new Promise((r) => setTimeout(r, 1));
      enVol--;
      return { total: 1 };
    };
    await comptesDesEtiquettes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], apercu, 3);
    expect(pointe).toBeLessThanOrEqual(3);
  });

  it('l’éditeur affiche ce libellé, et plus le `count` de /tags', () => {
    const debut = EDITEUR.indexOf("{:else if type === 'tag_ref'}");
    expect(debut, 'branche tag_ref introuvable').toBeGreaterThan(-1);
    const branche = EDITEUR.slice(debut, EDITEUR.indexOf('{/each}', debut));
    expect(branche).toContain('libelleEtiquette(e, comptesEtiquettes)');
    expect(branche).not.toContain('e.count');
    expect(EDITEUR).toContain('comptesDesEtiquettes(ids, api.previewSmartCollection)');
  });
});
