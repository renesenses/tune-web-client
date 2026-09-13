// 🔴 `renesenses/tune-web-client#850` — FabienM, fil 1749 : « le barème ne
// connaît aucune source ni notoriété — 100 points pour un titre exactement
// égal à la requête ».
//
// CE QUE LA MESURE A MONTRÉ, ET QUI N'ÉTAIT PAS DANS LA FICHE
// -----------------------------------------------------------
// Le défaut n'est pas que le barème soit grossier : c'est qu'il ne tranche
// presque JAMAIS. Relevé le 12/09/2026 sur la .18, dix requêtes réelles avec
// `GET /search?q=…&limit=10` :
//
//   🔴 9 requêtes sur 10 ont un meilleur résultat décidé par ÉGALITÉ
//      « air » 8 ex æquo · « miles davis » 6 · « daft punk » 5 · « beatles » 3
//
// La boucle garde le premier au score maximal (`s > best`), donc c'est
// l'ORDRE D'ARRIVÉE qui décide. Et cet ordre est alphabétique par accident —
// le serveur sérialise ses services depuis un `BTreeMap` (#856). Mesuré sur
// huit requêtes, un seul ordre observé : bandcamp, qobuz, tidal, youtube.
//
// Conséquence : l'alphabet met en tête le service qui rend le MOINS.
//
//   tidal    rang 3,0 — 320 résultats     bandcamp  rang 1,0 — 143
//   qobuz    rang 2,0 — 319               youtube   rang 4,0 —  30
//
// CE QUE CE FICHIER TIENT
// -----------------------
// Un calcul pur, vérifié exactement. Et surtout l'INVARIANT qui protège le
// reste : un bonus de source ne doit jamais faire gagner un moins bon texte.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue le barème d'AVANT sur le cas de
// « beatles » et exige qu'il rende bien l'ordre alphabétique.
import { describe, expect, it } from 'vitest';
import { bonusSource, meilleurResultat, type ResultatsFusionnes } from '../rechercheClassement';

const art = (name: string, source: string, image?: boolean) =>
  ({ id: 1, name, source, ...(image ? { image_path: 'x' } : {}) }) as any;
const alb = (title: string, source: string) => ({ id: 1, title, source }) as any;
const pis = (title: string, source: string) => ({ id: 1, title, source }) as any;
const vide = (): ResultatsFusionnes => ({ artistes: [], albums: [], pistes: [] });

describe('#850 — à texte égal, la SOURCE tranche', () => {
  it('🔴 le cas de « beatles » : qobuz et tidal à égalité, qobuz gagne', () => {
    // Mesuré sur la .18 : les deux rendent « The Beatles » avec le même score
    // de texte. Avant, l'alphabet donnait qobuz par hasard ; désormais c'est
    // un choix, et il tient même si le serveur change son ordre.
    const r = vide();
    r.artistes = [art('The Beatles', 'tidal'), art('The Beatles', 'qobuz')];
    const m = meilleurResultat('the beatles', r) as any;
    expect(m.genre).toBe('artiste');
    expect(m.artiste.source, 'l’ordre d’arrivée décide encore').toBe('qobuz');
  });

  it('le LOCAL passe devant tout le monde', () => {
    const r = vide();
    r.artistes = [art('Air', 'qobuz'), art('Air', 'local'), art('Air', 'tidal')];
    expect((meilleurResultat('air', r) as any).artiste.source).toBe('local');
  });

  it('l’ordre assumé : local > qobuz > tidal > deezer > bandcamp > youtube', () => {
    const rangs = ['local', 'qobuz', 'tidal', 'deezer', 'bandcamp', 'youtube']
      .map((s) => bonusSource(s));
    expect(rangs, 'l’ordre des sources n’est plus strictement décroissant')
      .toEqual([...rangs].sort((a, b) => b - a));
    expect(new Set(rangs).size, 'deux sources ont le même rang : l’égalité revient').toBe(6);
  });

  it('une source INCONNUE vaut peu, jamais rien', () => {
    // Un service ajouté demain ne doit pas tomber derrière un `undefined`.
    expect(bonusSource('napster')).toBeGreaterThan(0);
    expect(bonusSource('napster')).toBeLessThan(bonusSource('youtube') + 1);
    expect(bonusSource(null)).toBeGreaterThan(0);
    expect(bonusSource(undefined)).toBeGreaterThan(0);
  });
});

describe('#850 — 🔴 L’INVARIANT : le texte prime toujours sur la source', () => {
  it('une égalité exacte bat un préfixe, même depuis la pire source', () => {
    const r = vide();
    r.artistes = [art('Airbourne', 'local'), art('Air', 'youtube')];
    expect((meilleurResultat('air', r) as any).artiste.name,
      'le bonus de source a battu un meilleur score de texte').toBe('Air');
  });

  it('un préfixe bat un contenu, même depuis la pire source', () => {
    const r = vide();
    r.albums = [alb('Le grand air', 'local'), alb('Air de rien', 'youtube')];
    expect((meilleurResultat('air', r) as any).album.title).toBe('Air de rien');
  });

  it('le bonus maximal reste sous le plus petit écart de texte', () => {
    // contenu 20 → préfixe 50 : l'écart le plus serré du barème est de 30.
    const maxi = Math.max(...['local','qobuz','tidal','deezer','bandcamp','youtube'].map(bonusSource));
    expect(maxi, 'un bonus de source peut renverser le barème de texte').toBeLessThan(30);
  });

  it('il départage aussi les albums et les pistes, pas seulement les artistes', () => {
    const r1 = vide();
    r1.albums = [alb('Discovery', 'youtube'), alb('Discovery', 'qobuz')];
    expect((meilleurResultat('discovery', r1) as any).album.source).toBe('qobuz');
    const r2 = vide();
    r2.pistes = [pis('One More Time', 'bandcamp'), pis('One More Time', 'local')];
    expect((meilleurResultat('one more time', r2) as any).piste.source).toBe('local');
  });

  it('rien ne correspond : le repli d’avant est intact', () => {
    const r = vide();
    r.artistes = [art('Zappa', 'qobuz')];
    expect((meilleurResultat('xyz', r) as any).genre).toBe('artiste');
    expect(meilleurResultat('', r)).toBeNull();
    expect(meilleurResultat('air', vide())).toBeNull();
  });
});

describe('#850 — CONTRE-ÉPREUVE', () => {
  it('l’ancien barème rendait bien l’ordre alphabétique sur « beatles »', () => {
    // Sans bonus de source, les deux valent 100 et `s > best` garde le premier
    // arrivé — c'est-à-dire l'ordre du `BTreeMap` serveur.
    const scoreTexte = (v: string, q: string) => (v.toLowerCase() === q ? 100 : 0);
    const lignes = [
      { name: 'The Beatles', source: 'bandcamp' },
      { name: 'The Beatles', source: 'qobuz' },
      { name: 'The Beatles', source: 'tidal' },
    ];
    let best = 0, gagnant: any = null;
    for (const a of lignes) {
      const s = scoreTexte(a.name, 'the beatles');
      if (s > 0 && s > best) { best = s; gagnant = a; }
    }
    expect(gagnant.source, 'le témoin ne reproduit pas le défaut').toBe('bandcamp');

    // Et le nouveau, sur les mêmes lignes, choisit qobuz — le service qui rend
    // 319 résultats là où bandcamp en rend 143.
    const r = vide();
    r.artistes = lignes.map((l) => art(l.name, l.source));
    expect((meilleurResultat('the beatles', r) as any).artiste.source).toBe('qobuz');
  });
});
