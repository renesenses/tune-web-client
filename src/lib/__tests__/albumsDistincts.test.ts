/**
 * « Ces albums ne sont pas des doublons » (#1276) — ce que le client
 * ASSEMBLE.
 *
 * Ce que ces tests prouvent : la règle appliquée côté client est celle du
 * serveur (`variantes_retenues`, `routes/library/albums.rs`), l'onglet cesse
 * de signaler ce que l'utilisateur a arbitré, son compteur compte la même
 * chose que sa liste, et les trois routes appelées sont celles qui existent au
 * tag v0.9.127.
 *
 * Ce qu'ils ne prouvent pas : l'allure à l'écran. Le dépôt n'a pas de harnais
 * de rendu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  clePaire,
  copiesEnTrop,
  ensembleDistinct,
  estDistinct,
  groupeRetenu,
  groupesRetenus,
  pairesDuGroupe,
  type PaireDistincte,
} from '../albumsDistincts';

const paire = (a: number, b: number): PaireDistincte => ({
  album_a_id: Math.min(a, b),
  album_b_id: Math.max(a, b),
  a_title: `album ${a}`,
  a_artist: null,
  b_title: `album ${b}`,
  b_artist: null,
  created_at: null,
  resolved: true,
});

const al = (id: number) => ({ id });

describe("l'ordre des deux albums est indifférent, comme côté serveur", () => {
  it('la clé est normalisée', () => {
    expect(clePaire(7, 3)).toBe(clePaire(3, 7));
  });

  it("un arbitrage se reconnaît dans les deux sens", () => {
    const ens = ensembleDistinct([paire(3, 7)]);
    expect(estDistinct(ens, 3, 7)).toBe(true);
    expect(estDistinct(ens, 7, 3)).toBe(true);
    expect(estDistinct(ens, 3, 8)).toBe(false);
  });
});

describe('la règle du serveur, appliquée aux groupes de cet écran', () => {
  it("une variante déclarée distincte de l'original sort du groupe", () => {
    const groupe = [al(1), al(2), al(3)];
    const retenu = groupeRetenu(groupe, ensembleDistinct([paire(1, 2)]));
    expect(retenu?.map((a) => a.id)).toEqual([1, 3]);
  });

  it("un groupe vidé de ses variantes n'est plus signalé DU TOUT", () => {
    // C'est la règle qui fait disparaître la carte, et donc le geste utile :
    // sans elle, la paire reviendrait à la ligne suivante et le bouton aurait
    // l'air mort.
    const groupe = [al(1), al(2)];
    expect(groupeRetenu(groupe, ensembleDistinct([paire(1, 2)]))).toBeNull();
  });

  it("la comparaison se fait contre l'ORIGINAL, pas entre variantes", () => {
    // Un groupe de trois dont seule la paire (2,3) est arbitrée garde ses
    // trois membres : on retire la paire nommée, on n'invente pas de nouveau
    // rapprochement — même arbitrage que le serveur.
    const groupe = [al(1), al(2), al(3)];
    const retenu = groupeRetenu(groupe, ensembleDistinct([paire(2, 3)]));
    expect(retenu?.map((a) => a.id)).toEqual([1, 2, 3]);
  });

  it('sans aucun arbitrage, rien ne change', () => {
    const groupes = [[al(1), al(2)], [al(3), al(4), al(5)]];
    expect(groupesRetenus(groupes, new Set())).toEqual(groupes);
  });

  it('un album sans identifiant ne peut être arbitré, et reste', () => {
    const groupe = [al(1), { id: null }];
    const retenu = groupeRetenu(groupe, ensembleDistinct([paire(1, 2)]));
    expect(retenu?.length).toBe(2);
  });
});

describe('écarter un groupe = N−1 arbitrages nommés, pas un effacement', () => {
  it("produit l'original contre chaque variante", () => {
    expect(pairesDuGroupe([al(4), al(9), al(11)])).toEqual([
      [4, 9],
      [4, 11],
    ]);
  });

  it('ignore un doublon d\'identifiant — le serveur refuse a == b (400)', () => {
    expect(pairesDuGroupe([al(4), al(4)])).toEqual([]);
  });

  it('ne produit rien sans original identifiable', () => {
    expect(pairesDuGroupe([{ id: null }, al(2)])).toEqual([]);
  });
});

describe('le compteur de l\'onglet compte la même chose que sa liste', () => {
  it('compte les copies EN TROP après arbitrage, pas avant', () => {
    // Le défaut à éviter : une pastille qui annonce 3 quand l'onglet ne montre
    // plus rien. Compteur et liste dérivent de la MÊME valeur filtrée.
    const bruts = [[al(1), al(2)], [al(3), al(4), al(5)]];
    expect(copiesEnTrop(bruts)).toBe(3);

    const ensemble = ensembleDistinct([paire(1, 2), paire(3, 4)]);
    const retenus = groupesRetenus(bruts, ensemble);
    expect(retenus.map((g) => g.map((a) => a.id))).toEqual([[3, 5]]);
    expect(copiesEnTrop(retenus)).toBe(1);
  });
});

describe('les routes appelées sont celles du serveur au tag v0.9.127', () => {
  const src = readFileSync(join('src', 'lib', 'api', 'metadata.ts'), 'utf8');

  it('la liste de révision lit GET /library/albums/distinct', () => {
    const corps = src.slice(src.indexOf('export function listDistinctAlbumPairs'));
    expect(corps.slice(0, 300)).toContain('/library/albums/distinct');
  });

  it("poser l'arbitrage est un POST sur /albums/{id}/distinct/{other}", () => {
    const debut = src.indexOf('export function declareAlbumsDistinct');
    const corps = src.slice(debut, debut + 400);
    expect(corps).toContain('/library/albums/${albumId}/distinct/${otherId}');
    expect(corps).toContain("method: 'POST'");
  });

  it('revenir dessus est un DELETE sur la MÊME adresse', () => {
    const debut = src.indexOf('export function revokeAlbumsDistinct');
    const corps = src.slice(debut, debut + 400);
    expect(corps).toContain('/library/albums/${albumId}/distinct/${otherId}');
    expect(corps).toContain("method: 'DELETE'");
  });
});

describe("l'écran branche bien le filtre et le retour en arrière", () => {
  const vue = readFileSync(join('src', 'components', 'MetadataView.svelte'), 'utf8');

  it('la liste des groupes passe par le filtre des arbitrages', () => {
    // Sans ce filtre, l'arbitrage serait écrit sur le serveur et invisible
    // ici : le groupe reviendrait au rendu suivant.
    expect(vue).toMatch(/duplicateGroups = \$derived\(groupesRetenus\(duplicateGroupsBruts, ensembleDistinctes\)\)/);
  });

  it('le compteur dérive de la liste filtrée, pas des groupes bruts', () => {
    // Depuis #670, la pastille montre d'ABORD les paires audio du scan quand
    // il y en a. Le repli — le cas des albums au même nom, celui que #1276
    // arbitre — doit rester branché sur la liste FILTRÉE : sinon l'arbitrage
    // serait écrit sur le serveur et la pastille continuerait à compter la
    // paire écartée.
    expect(vue).toMatch(/copiesEnTrop\(duplicateGroups\)/);
    expect(vue).not.toMatch(/copiesEnTrop\(duplicateGroupsBruts\)/);
  });

  it('les paires audio du scan priment sur le repli par nom (#670)', () => {
    // Les deux règles cohabitent : l'arbitrage de #1276 porte sur des ALBUMS
    // rapprochés par titre/artiste/qualité, jamais sur les paires de PISTES
    // par empreinte audio. Il n'y a donc rien à retirer aux secondes.
    const debut = vue.indexOf('let duplicateCount = $derived(');
    expect(debut).toBeGreaterThan(-1);
    const corps = vue.slice(debut, debut + 200);
    expect(corps).toMatch(/duplicates\.length > 0 \? duplicates\.length/);
    expect(corps).toContain('copiesEnTrop(duplicateGroups)');
  });

  it('un arbitrage posé par erreur est révocable depuis l\'écran', () => {
    expect(vue).toContain('revoquerPaireDistincte');
    expect(vue).toContain('metadata.notDuplicatesRevoke');
  });
});
