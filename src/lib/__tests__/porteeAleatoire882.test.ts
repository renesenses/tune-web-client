// 🔴 `renesenses/tune-web-client#882` — Marco Polo, fil 1614, v0.9.142 :
//
//   « Dans la nouvelle interface, la lecture aléatoire par répertoire ciblé
//     dans la bibliothèque ne fonctionne pas : la lecture aléatoire prend sa
//     source dans TOUTE la bibliothèque. Si je passe à l'ancienne interface,
//     la lecture aléatoire fonctionne. »
//
// ⚠️ Sa précision — l'ancienne marche, la nouvelle non — vit dans la RÉPONSE
// du fil, pas dans le corps de la fiche. Sans elle, on chercherait le défaut
// des deux côtés.
//
// LE MÉCANISME
// ------------
// `LibraryView` (client actuel) bâtit `{folder, search_query, genre}` depuis
// #2801. `LibraryV2` n'envoyait que `search_query` — alors que la portée de
// répertoire était SOUS SES YEUX : `dossierPortee` filtre déjà l'affichage,
// elle n'arrivait simplement pas jusqu'au serveur.
//
// C'est le motif « écrit mais pas branché », et la SECONDE fois qu'il touche
// ce réglage : #3101 l'avait déjà corrigé pour la LISTE, pas pour l'aléatoire.
//
// L'enveloppe `api.shuffleAll` accepte `folder` depuis toujours — rien à
// écrire côté serveur.
//
// CONTRE-ÉPREUVE : le dernier bloc rejoue la construction de V2 sur le cas de
// Marco Polo et exige qu'elle perde bien le répertoire.
import { describe, expect, it } from 'vitest';
import { optionsAleatoire } from '../porteeAleatoire';

describe('#882 — la pastille de répertoire arrive enfin au serveur', () => {
  it('🔴 le cas de Marco Polo : un répertoire ciblé, rien d’autre', () => {
    expect(optionsAleatoire({ dossier: '/data/music/NEW_FLAC' }))
      .toEqual({ folder: '/data/music/NEW_FLAC' });
  });

  it('sans aucune portée, on n’envoie RIEN — l’aléatoire prend tout', () => {
    expect(optionsAleatoire({})).toBeUndefined();
    expect(optionsAleatoire({ dossier: '', recherche: '  ', genre: null })).toBeUndefined();
  });

  it('les espaces ne font pas une portée', () => {
    expect(optionsAleatoire({ dossier: '   ' })).toBeUndefined();
    expect(optionsAleatoire({ recherche: '\t\n' })).toBeUndefined();
  });
});

describe('#882 — 🔴 le GENRE cède devant le RÉPERTOIRE', () => {
  it('les deux posés : seul le répertoire part', () => {
    // La pastille de répertoire est la portée EXTÉRIEURE : quand elle est
    // posée, les onglets qu'elle contient ne sont plus des filtres
    // indépendants mais des vues de ce répertoire. Envoyer les deux
    // demanderait au serveur une intersection qu'il ne fait pas, et rendrait
    // un aléatoire VIDE là où l'utilisateur voit des albums.
    expect(optionsAleatoire({ dossier: '/data/music', genre: 'Jazz' }))
      .toEqual({ folder: '/data/music' });
  });

  it('sans répertoire, le genre part bien', () => {
    expect(optionsAleatoire({ genre: 'Jazz' })).toEqual({ genre: 'Jazz' });
  });

  it('la recherche prime sur le genre — on cherche DANS ce qu’on regarde', () => {
    expect(optionsAleatoire({ recherche: 'miles', genre: 'Jazz' }))
      .toEqual({ search_query: 'miles' });
  });

  it('répertoire ET recherche voyagent ensemble', () => {
    expect(optionsAleatoire({ dossier: '/data/music', recherche: 'miles' }))
      .toEqual({ folder: '/data/music', search_query: 'miles' });
  });

  it('les trois posés : le genre saute, les deux autres restent', () => {
    expect(optionsAleatoire({ dossier: '/d', recherche: 'm', genre: 'Jazz' }))
      .toEqual({ folder: '/d', search_query: 'm' });
  });
});

describe('#882 — les DEUX écrans appellent la même règle', () => {
  const lire = async (chemin: string) => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    return readFileSync(resolve(__dirname, '../../components', chemin), 'utf8');
  };

  it('🔴 la nouvelle coquille transmet le répertoire', async () => {
    const src = await lire('v2/LibraryV2.svelte');
    expect(src).toContain('optionsAleatoire({ dossier: dossierPortee, recherche: q })');
    expect(
      /shuffleAll\(zid, q\.trim\(\) \?/.test(src),
      'la construction d’avant est revenue : le répertoire repart à la trappe',
    ).toBe(false);
  });

  it('l’écran actuel passe par la MÊME règle — plus deux constructions', async () => {
    const src = await lire('LibraryView.svelte');
    expect(src).toContain('optionsAleatoire({');
    expect(
      /opts\.folder = scopedFolder/.test(src),
      'la construction à la main est revenue : les deux écrans peuvent rediverger',
    ).toBe(false);
  });
});

describe('#882 — CONTRE-ÉPREUVE', () => {
  it('la construction de V2 perdait bien le répertoire', () => {
    // Ce que `LibraryV2` faisait : `q.trim() ? { search_query } : undefined`.
    const avant = (q: string) => (q.trim() ? { search_query: q.trim() } : undefined);
    // Le cas de Marco Polo : un répertoire ciblé, aucune recherche.
    expect(avant(''), 'le témoin ne reproduit pas la perte').toBeUndefined();
    // La règle actuelle, sur le même cas, envoie le répertoire.
    expect(optionsAleatoire({ dossier: '/data/music/NEW_FLAC', recherche: '' }))
      .toEqual({ folder: '/data/music/NEW_FLAC' });
  });
});
