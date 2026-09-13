/**
 * #980 — « le bouton "BACK" du navigateur retourne à la page d’accueil et non
 * à la page de résultats ».
 *
 * Fabien, fil « v0.9.147 : v1 divers bugs », point 1 :
 *
 *   « Menu recherche, après une recherche et page de résultat, quand on clique
 *     sur un album → page album, le bouton "BACK" du navigateur retourne à la
 *     page d’accueil et non à la page de résultats. »
 *
 * ## La cause
 *
 * La fiche album de la Recherche est un CALQUE (`let opened = $state(...)`).
 * L’ouvrir ne changeait pas `activeView`, donc la coquille n’écrivait AUCUNE
 * entrée d’historique. Le Précédent dépilait alors l’entrée d’avant — l’écran
 * d’où l’on était venu à la Recherche, l’accueil dans son cas.
 *
 * `ArtistesV2` tenait déjà cette règle pour sa fiche artiste (#828, #3843).
 * La Recherche ne l’avait jamais reprise.
 *
 * ## Ce que cette garde tient
 *
 * La clé — par la vraie fonction — et le branchement dans l’écran. Elle ne
 * tient PAS le comportement du navigateur lui-même : celui-là vit dans
 * `historiqueCoquille`, avec ses propres gardes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleDetailAlbum } from '../cleDetailAlbum';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const ecran = () => lire('src/components/v2/SearchV2.svelte');

describe('#980 — la clé d’historique d’une fiche album', () => {
  it('un album LOCAL est désigné par son identifiant de bibliothèque', () => {
    expect(cleDetailAlbum({ id: 259 })).toBe('album:259');
    expect(cleDetailAlbum({ id: 259, source: 'local' })).toBe('album:259');
  });

  /**
   * 🔴 Les deux espaces d’identifiants ne se mélangent PAS : l’album 42 de
   * Qobuz n’est pas l’album 42 de la bibliothèque. Les confondre donnerait
   * deux fiches différentes sous la même clé.
   */
  it('un album de SERVICE ne peut pas porter la même clé qu’un album local', () => {
    const local = cleDetailAlbum({ id: 42 });
    const service = cleDetailAlbum({ source: 'qobuz', source_id: '42' });
    expect(service).toBe('album:qobuz:42');
    expect(service).not.toBe(local);
  });

  it('deux services distincts donnent deux clés distinctes', () => {
    expect(cleDetailAlbum({ source: 'qobuz', source_id: 'x' }))
      .not.toBe(cleDetailAlbum({ source: 'tidal', source_id: 'x' }));
  });

  /** Une clé inventée serait pire que pas d’entrée. */
  it('un album indésignable ne rend AUCUNE clé', () => {
    expect(cleDetailAlbum(null)).toBeNull();
    expect(cleDetailAlbum(undefined)).toBeNull();
    expect(cleDetailAlbum({})).toBeNull();
    expect(cleDetailAlbum({ source: 'qobuz' })).toBeNull();
    expect(cleDetailAlbum({ source: 'qobuz', source_id: '  ' })).toBeNull();
    expect(cleDetailAlbum({ source_id: 'abc' })).toBeNull();
  });

  it('la clé est toujours une CHAÎNE — `history.state` refuse les proxies', () => {
    for (const a of [{ id: 1 }, { source: 'qobuz', source_id: 7 }]) {
      expect(typeof cleDetailAlbum(a as any)).toBe('string');
    }
  });
});

describe('#980 — la Recherche empile et dépile son calque', () => {
  it('ouvrir une fiche empile une entrée', () => {
    const src = ecran();
    expect(src).toContain('ouvrirDetail');
    const i = src.indexOf('function ouvrirFiche');
    const corps = src.slice(i, src.indexOf('\n  }', i));
    expect(corps).toContain('cleDetailAlbum');
    expect(corps).toContain('ouvrirDetail(');
    // La CLÉ, jamais l'objet : un proxy Svelte ne traverse pas `history.state`.
    expect(corps).not.toMatch(/ouvrirDetail\(\s*a\s*\)/);
  });

  it('le Retour de la fiche referme ET dépile', () => {
    const src = ecran();
    expect(src).toContain('fermerDetailEnReculant(fermerLaFiche)');
    expect(src).toContain('onClose={retourFiche}');
    // L'ancien geste — refermer sans dépiler — a disparu.
    expect(src).not.toContain('onClose={() => { opened = null; serviceOuvert = null; }}');
  });

  /**
   * 🔴 L'autre sens. Sans lui, le Précédent du navigateur dépilerait l'entrée
   * et l'écran resterait sur la fiche : un Précédent qui ne referme rien.
   */
  it('le Précédent du navigateur referme le calque', () => {
    const src = ecran();
    expect(src).toMatch(/\$detailOuvert == null && opened/);
    expect(src).toMatch(/import \{[^}]*detailOuvert[^}]*\} from '\.\.\/\.\.\/lib\/historiqueCoquille'/);
  });

  it('la Recherche suit le même contrat que la fiche artiste', () => {
    const artistes = lire('src/components/v2/ArtistesV2.svelte');
    for (const aide of ['ouvrirDetail', 'fermerDetailEnReculant']) {
      expect(artistes, `${aide} a disparu d’ArtistesV2`).toContain(aide);
      expect(ecran(), `${aide} manque à SearchV2`).toContain(aide);
    }
  });
});
