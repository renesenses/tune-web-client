/**
 * serveur#7428 — « Party Mode » (greffon local `party`) et « Mode Party »
 * (sa fiche du catalogue, `party-mode`) s'affichaient comme deux extensions,
 * l'une installée, l'autre à installer. La fiche publie désormais
 * l'identifiant du manifeste de son greffon (`plugin_id`) : c'est la seule clé
 * de rapprochement, jamais le nom affiché.
 */
import { describe, expect, it } from 'vitest';
import { ajouterLaBoutique } from '../catalogueGreffons';

const partyLocal = { name: 'party', display_name: 'Party Mode', installed: true, status: 'enabled' } as any;

describe('ajouterLaBoutique : rapprochement par plugin_id (serveur#7428)', () => {
  it('🔴 un greffon local et sa fiche de même plugin_id donnent UNE entrée, installée', () => {
    const r = ajouterLaBoutique([partyLocal], [
      // Telle que la sert un serveur qui ne marque pas encore la fiche installée.
      { slug: 'party-mode', name: 'tune-plugin-party', display_name: 'Mode Party', platforms: 'wasm', plugin_id: 'party' },
    ]);
    expect(r).toHaveLength(1);
    expect((r[0] as any).name).toBe('party');
    expect((r[0] as any).installed).toBe(true);
    expect((r[0] as any).marketplace).toBeUndefined();
  });

  it('deux greffons distincts restent deux entrées', () => {
    const r = ajouterLaBoutique([partyLocal], [
      { slug: 'autre', name: 'tune-plugin-autre', display_name: 'Autre', platforms: 'wasm', plugin_id: 'autre' },
    ]);
    expect(r.map((p: any) => p.name)).toEqual(['party', 'autre']);
    expect((r[1] as any).installed).toBe(false);
    expect((r[1] as any).marketplace).toBe(true);
  });

  it('une fiche sans plugin_id garde le comportement actuel', () => {
    const fiches = [
      { slug: 'party-mode', name: 'tune-plugin-party', display_name: 'Mode Party', platforms: 'wasm' },
      { slug: 'party-mode-nul', name: 'tune-plugin-party-nul', display_name: 'Mode Party', platforms: 'wasm', plugin_id: null },
    ];
    const r = ajouterLaBoutique([partyLocal], fiches);
    // Sans identifiant, aucun rapprochement par le nom affiché : comme avant.
    expect(r.map((p: any) => p.slug ?? p.name)).toEqual(['party', 'party-mode', 'party-mode-nul']);
    // Et la règle par slug reste celle d'avant.
    expect(ajouterLaBoutique([{ name: 'party-mode' } as any], fiches.slice(0, 1))).toHaveLength(1);
  });
});
