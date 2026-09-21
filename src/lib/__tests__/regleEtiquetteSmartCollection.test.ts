// Bertrand, 21/09/2026 : « impossible de choisir un tag comme règle de smart
// collection ». Les étiquettes existaient — tables `tags` et `item_tags` —,
// mais ni la grammaire des règles ni le serveur ne les lisaient. Le champ
// `tag` est ajouté des deux côtés (tune-server-rust, `smart_refs`).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHAMPS, operateursDe, typeDuChamp, valeurInitiale, regleComplete } from '../smartRegles';

const EDITEUR = readFileSync(
  resolve(process.cwd(), 'src/components/v2/CollectionSmartEditeurV2.svelte'),
  'utf8',
);

describe('règle « Étiquette » d’une smart collection', () => {
  it('le champ existe, et c’est une RÉFÉRENCE choisie dans une liste', () => {
    expect(CHAMPS.some((c) => c.value === 'tag')).toBe(true);
    expect(typeDuChamp('tag')).toBe('tag_ref');
  });

  it('« porte » / « ne porte pas » — les deux seuls que le serveur sait nier', () => {
    // `smart_refs::is_negated` reconnaît `is_not` ; un `!=` sur ce champ
    // serait compris aussi, mais c'est `is` / `is_not` qui y sont écrits.
    expect(operateursDe('tag').map((o) => o.value)).toEqual(['is', 'is_not']);
  });

  it('part VIDE et refuse de s’enregistrer tant que rien n’est choisi', () => {
    // Partir sur une valeur arbitraire aurait enregistré une règle visant une
    // étiquette que l'utilisateur n'a pas choisie.
    expect(valeurInitiale('is', 'tag_ref')).toBe('');
    expect(regleComplete({ field: 'tag', op: 'is', value: '' })).toBe(false);
    expect(regleComplete({ field: 'tag', op: 'is', value: '7' })).toBe(true);
  });

  it('l’éditeur de smart collection sait la SAISIR', () => {
    // Un champ absent de `SAISISSABLES` n'est pas proposé : il resterait
    // invisible, exactement le défaut signalé.
    const debut = EDITEUR.indexOf('const SAISISSABLES');
    expect(debut, 'SAISISSABLES introuvable').toBeGreaterThan(-1);
    expect(EDITEUR.slice(debut, debut + 300)).toContain("'tag_ref'");
  });

  it('la valeur se CHOISIT dans les étiquettes de l’utilisateur', () => {
    expect(EDITEUR).toContain("{:else if type === 'tag_ref'}");
    expect(EDITEUR).toContain('api.getTags()');
    // Porte l'IDENTIFIANT, que le serveur attend — pas le nom.
    expect(EDITEUR).toContain('<option value={String(e.id)}>');
  });
});
