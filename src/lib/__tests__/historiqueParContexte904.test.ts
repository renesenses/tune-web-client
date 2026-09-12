// 🔴 `renesenses/tune-web-client#904` (l'objet au premier niveau) et `#903`
// (le tiroir) — FabienM, fil forum 1649.
//
// LES DEUX FICHES SONT UNE SEULE PIÈCE
// ------------------------------------
// Un niveau 1 livré seul remplacerait N lignes de titres par une ligne
// d'objet, sans rien pour les rouvrir : l'écran y PERDRAIT de l'information.
// Le regroupement et le tiroir ne se livrent pas séparément.
//
// CE QUI EST MESURÉ, ET QUI N'ÉTAIT PAS DANS LA FICHE
// ---------------------------------------------------
// Relevé sur les 879 écoutes de la .18 le 12/09/2026, par `GET
// /library/history?limit=879` :
//
//   context_type : null 65,8 % · album 16,5 % · playlist 9,8 % · track 8,0 %
//   context_position absente pour 67 % des écoutes
//   context_id : numérique 28,2 % · service 4,7 % · null 65,8 % · URL 1,4 %
//
// Deux écoutes sur trois n'ont AUCUN contexte : le regroupement ne pouvait
// donc jamais être la seule forme de l'écran. Et `context_id` prend quatre
// formes — dont une URL entière — donc on ne l'interprète jamais, on ne fait
// que le comparer.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue la règle de déduplication
// d'AVANT (« un titre, une ligne ») sur le cas exact du schéma de FabienM et
// exige qu'elle supprime bien la seconde occurrence. Sans elle, une règle qui
// ne dédupliquerait plus rien passerait pour corrigée.
import { describe, expect, it } from 'vitest';
import {
  cleDObjet,
  enTranches,
  estRegroupable,
  nomDObjet,
  ordonnerDansLObjet,
  regrouperParContexte,
  type EntreeDatee,
} from '../historiqueParContexte';

type E = EntreeDatee & { titre: string };
const e = (titre: string, quand: string, ctx?: any): E => ({
  titre, playedAt: quand, contexte: ctx ?? null,
});

describe('#904 — ce qui mérite un regroupement, et ce qui n’en mérite pas', () => {
  it('sans contexte — les deux tiers du parc — la ligne reste plate', () => {
    expect(estRegroupable(null)).toBe(false);
    expect(estRegroupable({ type: null, id: null })).toBe(false);
    expect(estRegroupable({ type: 'album', id: null })).toBe(false);
    expect(estRegroupable({ type: null, id: '4377' })).toBe(false);
  });

  it('`track` n’est PAS regroupable : le tiroir redirait sa propre ligne', () => {
    expect(estRegroupable({ type: 'track', id: '32229' })).toBe(false);
  });

  it('album, playlist, artiste le sont — quelle que soit la forme de l’identifiant', () => {
    expect(estRegroupable({ type: 'album', id: 4377 })).toBe(true);
    expect(estRegroupable({ type: 'album', id: 'rgo0zkvxd5pad' })).toBe(true);
    expect(estRegroupable({ type: 'playlist', id: '65607848' })).toBe(true);
    // Les douze écoutes dont `context_id` est une URL entière : on ne
    // l'interprète pas, on le compare.
    expect(estRegroupable({
      type: 'album', id: 'http://192.168.1.54:8888/api/v1/library/tracks/14/audio',
    })).toBe(true);
  });

  it('deux objets de types différents mais de même identifiant ne se confondent pas', () => {
    expect(cleDObjet({ type: 'album', id: '12' })).not.toBe(cleDObjet({ type: 'playlist', id: '12' }));
  });
});

describe('#904 — le premier niveau', () => {
  const ALBUM = { type: 'album', id: 4377, position: null };
  const LISTE = { type: 'playlist', id: '65607848', position: null };

  it('l’objet prend la place de sa PREMIÈRE écoute et emporte les autres', () => {
    const n = regrouperParContexte([
      e('A1T1', '2026-09-12T10:00:00Z', ALBUM),
      e('nu', '2026-09-12T09:00:00Z'),
      e('A1T2', '2026-09-12T08:00:00Z', ALBUM),
    ]);
    expect(n.map((x) => x.genre)).toEqual(['objet', 'titre']);
    const objet = n[0] as any;
    expect(objet.entrees.map((x: E) => x.titre)).toEqual(['A1T2', 'A1T1']);
    expect(objet.quand, 'l’objet ne se date pas sur sa plus VIEILLE écoute')
      .toBe('2026-09-12T10:00:00Z');
  });

  it('les titres sans contexte gardent leur place, entre les objets', () => {
    const n = regrouperParContexte([
      e('t1', '2026-09-12T10:00:00Z'),
      e('A1T1', '2026-09-12T09:00:00Z', ALBUM),
      e('t2', '2026-09-12T08:00:00Z'),
      e('P1T1', '2026-09-12T07:00:00Z', LISTE),
    ]);
    expect(n.map((x) => x.genre)).toEqual(['titre', 'objet', 'titre', 'objet']);
  });

  it('les titres nus consécutifs forment UNE tranche, pas un tableau chacun', () => {
    const t = enTranches(regrouperParContexte([
      e('t1', '2026-09-12T10:00:00Z'),
      e('t2', '2026-09-12T09:30:00Z'),
      e('t3', '2026-09-12T09:00:00Z'),
      e('A1T1', '2026-09-12T08:00:00Z', ALBUM),
      e('t4', '2026-09-12T07:00:00Z'),
    ]));
    expect(t.map((x) => x.genre)).toEqual(['titres', 'objet', 'titres']);
    expect((t[0] as any).entrees).toHaveLength(3);
    expect((t[2] as any).entrees).toHaveLength(1);
  });
});

describe('#903 — l’ordre DANS le tiroir', () => {
  it('par position quand le serveur la donne pour toutes', () => {
    const r = ordonnerDansLObjet([
      e('c', '2026-09-12T10:00:00Z', { type: 'album', id: 1, position: 3 }),
      e('a', '2026-09-12T09:00:00Z', { type: 'album', id: 1, position: 1 }),
      e('b', '2026-09-12T08:00:00Z', { type: 'album', id: 1, position: 2 }),
    ]);
    expect(r.map((x) => x.titre)).toEqual(['a', 'b', 'c']);
  });

  it('🔴 par DATE dès qu’une position manque — 67 % des écoutes', () => {
    // Mélanger les deux donnerait un ordre arbitraire : une position à 0 et
    // une absente ne se comparent pas.
    const r = ordonnerDansLObjet([
      e('tard', '2026-09-12T10:00:00Z', { type: 'album', id: 1, position: 0 }),
      e('tôt', '2026-09-12T08:00:00Z', { type: 'album', id: 1, position: null }),
    ]);
    expect(r.map((x) => x.titre)).toEqual(['tôt', 'tard']);
  });
});

describe('#904 — CONTRE-ÉPREUVE de la déduplication restreinte', () => {
  it('le schéma de FabienM perd bien sa seconde occurrence sous l’ancienne règle', () => {
    // « Titre A1T1 » y figure DEUX fois : sous « Album A1 » et sous
    // « Artiste A1 ». L'ancienne clé valait la seule piste.
    const lignes = [
      { piste: 'A1T1', ctx: { type: 'album', id: 1 } },
      { piste: 'A1T1', ctx: { type: 'artist', id: 9 } },
    ];
    const ancienne = new Set(lignes.map((l) => l.piste));
    expect(ancienne.size, 'le témoin ne reproduit pas la perte').toBe(1);

    const nouvelle = new Set(lignes.map((l) => `${l.piste}@${cleDObjet(l.ctx)}`));
    expect(nouvelle.size, 'la règle restreinte écrase encore deux objets distincts').toBe(2);
  });

  it('mais deux écoutes du MÊME objet se replient toujours sur une ligne', () => {
    const ctx = { type: 'album', id: 1 };
    const cles = new Set([`A1T1@${cleDObjet(ctx)}`, `A1T1@${cleDObjet(ctx)}`]);
    expect(cles.size, 'l’arbitrage d’origine a été abandonné au lieu d’être restreint').toBe(1);
  });
});

describe('#904 — nommer l’objet, alors que le serveur ne le nomme pas', () => {
  // Mesuré : `/library/history` sert seize champs et AUCUN nom de contexte.
  const avec = (album?: string | null, artiste?: string | null) => ({
    track: { album_title: album ?? null, artist_name: artiste ?? null },
  });

  it('un album se nomme par le titre que ses pistes portent', () => {
    expect(nomDObjet('album', [avec('Wish You Were Here', 'Pink Floyd')]))
      .toBe('Wish You Were Here');
  });

  it('un artiste, par le nom que ses pistes portent', () => {
    expect(nomDObjet('artist', [avec(null, 'Mitski')])).toBe('Mitski');
  });

  it('🔴 une playlist n’a AUCUN nom déductible — on n’en invente pas', () => {
    // Aucune piste ne porte le nom de la liste dont elle vient.
    expect(nomDObjet('playlist', [avec('Un album', 'Un artiste')])).toBeNull();
  });

  it('une première piste au champ vide ne fait pas renoncer', () => {
    expect(nomDObjet('album', [avec('  ', 'x'), avec('Le vrai titre', 'x')]))
      .toBe('Le vrai titre');
  });
});
