// 🔴 `renesenses/tune-web-client#1708` — FabienM, fil 1991, 0.9.167.
//
// Il cherche `"wish you were here"`. Le médaillon « Meilleur résultat » ne
// montre plus l'album Bandcamp (#1662 est passé) mais un ARTISTE de service
// nommé « Wish You Were Here », avec portrait — alors que l'album Pink Floyd
// de sa bibliothèque, au titre exactement égal, est en tête de la section
// Albums. « Est-ce normal que meilleur résultat retourne un artiste ? »
//
// LA CAUSE : LA RÈGLE ÉTAIT ÉCRITE DEUX FOIS
// ------------------------------------------
// `meilleurResultat` désigne un champion par type, puis compare les trois sur
// le score brut. Le bonus d'image, lui, existait en DEUX exemplaires :
//
//   albums   `cover_path ? BONUS_POCHETTE : 0`   — 0,5, corrigé par #1662
//   artistes `image_path ? 30 : 0`               — écrit en clair, jamais revu
//
// #1662 n'avait donc corrigé qu'une des deux copies. Le barème réel :
//
//   artiste « Wish You Were Here », Qobuz, avec portrait  100 + 30  + 4 = 134
//   album   « Wish You Were Here », bibliothèque, pochette 100 + 0,5 + 5 = 105,5
//
// Le +30 valait SIX FOIS l'écart entre la bibliothèque (5) et Bandcamp (1) :
// aucune source ne pouvait le rattraper.
//
// CE QUE CE FICHIER TIENT — par des DONNÉES, pas par une lecture du source :
// on construit des entrées et on vérifie l'ORDRE rendu.
//
// CONTRE-ÉPREUVE : remettre `image_path ? 30 : 0` dans la boucle des artistes
// (le code compile toujours) rougit ce fichier.
import { describe, expect, it } from 'vitest';
import { bonusSource, meilleurResultat, type ResultatsFusionnes } from '../rechercheClassement';

const art = (name: string, source: string, portrait = false) =>
  ({ id: 1, name, source, ...(portrait ? { image_path: '/portrait.jpg' } : {}) }) as any;
const alb = (title: string, source: string, pochette = false) =>
  ({ id: 2, title, source, ...(pochette ? { cover_path: '/pochette.jpg' } : {}) }) as any;
const pis = (title: string, source: string) => ({ id: 3, title, source }) as any;

const jeu = (o: Partial<ResultatsFusionnes>): ResultatsFusionnes =>
  ({ artistes: [], albums: [], pistes: [], ...o });

const SOURCES = ['local', 'qobuz', 'tidal', 'deezer', 'bandcamp', 'youtube'];

describe('#1708 — le médaillon, entre TYPES, respecte la source', () => {
  it('🔴 le cas de Fabien : l’album de la bibliothèque bat l’artiste de service à portrait', () => {
    // Exactement la capture du fil 1991 : l'artiste fusionné porte Qobuz (sa
    // source la mieux rangée) et un portrait ; l'album Pink Floyd est local.
    const r = jeu({
      artistes: [art('Wish You Were Here', 'qobuz', true)],
      albums: [alb('Wish You Were Here', 'local', true)],
    });
    const m = meilleurResultat('"wish you were here"', r) as any;
    expect(m.genre, 'le portrait d’un service reprend le médaillon à la bibliothèque').toBe('album');
    expect(m.album.source).toBe('local');
  });

  it('🔴 même sans pochette, l’album local garde le médaillon', () => {
    // Le cas le plus défavorable : la bibliothèque n'a AUCUNE image et le
    // service en a une. C'est la source qui doit trancher, pas l'image.
    const r = jeu({
      artistes: [art('Wish You Were Here', 'bandcamp', true)],
      albums: [alb('Wish You Were Here', 'local', false)],
    });
    expect((meilleurResultat('wish you were here', r) as any).genre).toBe('album');
  });

  it('🔴 une PISTE locale exacte bat aussi l’artiste de service à portrait', () => {
    // Les pistes n'ont aucun bonus d'image : elles étaient les plus exposées.
    const r = jeu({
      artistes: [art('Money', 'qobuz', true)],
      pistes: [pis('Money', 'local')],
    });
    expect((meilleurResultat('money', r) as any).genre).toBe('piste');
  });

  it('🔴 l’invariant, sur TOUTES les paires de sources : une image ne renverse jamais un rang', () => {
    // Le défaut se mesure ici : avec +30, l'artiste gagnait sur les 15 paires.
    const perdants: string[] = [];
    for (let i = 0; i < SOURCES.length; i++) {
      for (let j = i + 1; j < SOURCES.length; j++) {
        const mieux = SOURCES[i]; // rang supérieur
        const moins = SOURCES[j];
        const r = jeu({
          artistes: [art('Air', moins, true)],
          albums: [alb('Air', mieux, false)],
        });
        const m = meilleurResultat('air', r) as any;
        if (m.genre !== 'album') perdants.push(`${moins} (portrait) > ${mieux}`);
      }
    }
    expect(perdants, 'un bonus d’image a battu un meilleur rang de source').toEqual([]);
  });

  it('le bonus d’image reste sous le plus petit écart entre deux sources', () => {
    // Formulé en DONNÉES : deux lignes de rangs voisins, celle du dessous
    // avec image, celle du dessus sans. La mieux rangée doit gagner.
    const rangs = SOURCES.map(bonusSource);
    for (let i = 0; i + 1 < SOURCES.length; i++) {
      expect(rangs[i], `${SOURCES[i]} n’est plus au-dessus de ${SOURCES[i + 1]}`)
        .toBeGreaterThan(rangs[i + 1]);
      const r = jeu({
        artistes: [art('Air', SOURCES[i + 1], true)],
        albums: [alb('Air', SOURCES[i], false)],
      });
      expect((meilleurResultat('air', r) as any).album.source).toBe(SOURCES[i]);
    }
  });
});

describe('#1708 — ce qui ne devait PAS changer', () => {
  it('à source égale, l’artiste avec portrait garde le médaillon', () => {
    // La raison d'être du bonus : la grande carte vaut mieux qu'une initiale.
    const r = jeu({
      artistes: [art('Miles Davis', 'local', true)],
      albums: [alb('Miles Davis', 'local', false)],
    });
    expect((meilleurResultat('miles davis', r) as any).genre).toBe('artiste');
  });

  it('à source ET image égales, l’artiste passe encore devant l’album', () => {
    const r = jeu({
      artistes: [art('Miles Davis', 'local', true)],
      albums: [alb('Miles Davis', 'local', true)],
    });
    expect((meilleurResultat('miles davis', r) as any).genre).toBe('artiste');
  });

  it('à source égale, une ligne AVEC image passe devant une ligne sans', () => {
    const r = jeu({
      albums: [alb('Discovery', 'qobuz', false), alb('Discovery', 'qobuz', true)],
    });
    expect((meilleurResultat('discovery', r) as any).album.cover_path).toBe('/pochette.jpg');
  });

  it('le TEXTE prime toujours : un artiste de service exact bat un album local en simple préfixe', () => {
    // Baisser le bonus d'image ne doit pas faire remonter un moins bon texte.
    const r = jeu({
      artistes: [art('Air', 'youtube', true)],
      albums: [alb('Airbourne live', 'local', true)],
    });
    expect((meilleurResultat('air', r) as any).genre).toBe('artiste');
  });

  it('rien ne correspond : le repli sur la première ligne est intact', () => {
    const r = jeu({ albums: [alb('Zzz', 'local')] });
    expect((meilleurResultat('quelque chose', r) as any).genre).toBe('album');
  });
});
