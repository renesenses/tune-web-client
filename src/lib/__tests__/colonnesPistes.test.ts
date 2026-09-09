/**
 * Le modèle de colonnes du tableau de pistes (chantier du 07/09/2026,
 * maquette Levente).
 *
 * Ces gardes tiennent surtout les décisions PRODUIT, celles qu'un refactor
 * ultérieur effacerait sans s'en apercevoir : quelles colonnes existent, ce
 * qui est verrouillé, ce qui n'a pas de donnée, et ce qu'on affiche quand on
 * ne sait pas.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COLONNES, DEFAUTS, MODES_BRANCHES, PAR_CLE,
  colonnesRetenues, gabaritGrille, offerteAu, valeurColonne, type CleColonne,
} from '../colonnesPistes';
import type { Track } from '../types';

/** Une piste telle que `/library/albums/{id}/tracks` la rend, mesurée le 07/09. */
const piste = (o: Partial<Track> = {}) => ({
  id: 5, track_number: 1, title: 'Almoraima', artist_name: 'Paco de Lucia',
  composer: 'Paco de Lucia', duration_ms: 327506, year: 1996, channels: 2,
  bpm: null, genre: 'World Music', format: 'flac', sample_rate: 44100, bit_depth: 16,
  ...o,
}) as unknown as Track;

describe('le catalogue', () => {
  it('les douze colonnes de la maquette ouvrent le catalogue, dans l’ordre', () => {
    // 🔴 RÉORIENTÉE le 07/09/2026. La garde figeait la liste ENTIÈRE ; le
    // catalogue s'est enrichi le jour même — « je voudrai ajouter des metadata
    // pour Advanced et Expert », puis « en expert, il les faut toutes comme
    // Dynamic Range » (Bertrand). Ce qu'elle protège reste : les douze de la
    // maquette existent, dans son ordre, et ouvrent le tableau.
    expect(COLONNES.slice(0, 12).map((c) => c.cle)).toEqual([
      'num', 'title', 'artist', 'composer', 'time', 'year',
      'plays', 'lastPlayed', 'channels', 'bpm', 'genre', 'quality',
    ]);
    // Les douze de la maquette sont offertes DÈS Essentiel : c'est le mode
    // qu'elle décrit.
    for (const c of COLONNES.slice(0, 12)) expect(c.min, c.cle).toBeUndefined();
  });

  it('chaque colonne porte une CLÉ de traduction, pas un libellé', () => {
    for (const c of COLONNES) expect(c.cleI18n, c.cle).toMatch(/^v2\.tcol\./);
  });

  it('le TITRE est la seule colonne verrouillée', () => {
    // Une liste de pistes sans titre n'est plus une liste de pistes. Le
    // numéro, lui, reste décochable — il n'a pas de sens hors d'un album, et
    // la maquette le laisse décoché.
    expect(COLONNES.filter((c) => c.verrouillee).map((c) => c.cle)).toEqual(['title']);
  });

  it('🔴 AUCUNE colonne n’est déclarée sans donnée (#826 puis #824)', () => {
    // Deux lots ont mesuré le même jour, séparément, et se recoupent.
    //
    // #826, `GET /library/tracks?limit=400` sur le .18 :
    //   play_count      → présent sur 400 / 400   ⇒ ALLUMÉE
    //   last_played_at  → présent sur   8 / 400   ⇒ ALLUMÉE (creuse, pas morte)
    //   dynamic_range   → présent sur   0 / 400
    //
    // #824, sur les TROIS surfaces du .18 en v0.9.144 :
    //   GET /library/tracks?limit=3       → play_count=4, last_played_at posés
    //   GET /library/tracks?q=Lachrimae…  → idem, chemin FILTRÉ
    //   GET /library/tracks/16645         → idem, fiche d'une piste
    //
    // 🔴 LE DR A CHANGÉ DE CAMP, ET VOICI POURQUOI. #826 le laissait grisé :
    // le serveur le sert, mais aucune bibliothèque sous la main n'en porte
    // (0/400 sur DEUX serveurs, `dynamic_ranges` vide dans
    // `/library/albums/filters`), donc « on ne peut pas distinguer pas-de-tag
    // de pas-branché ». Cette mesure est juste. La distinction a ensuite été
    // ÉTABLIE : deux lignes `dr_track` posées le temps d'une mesure sur le .18,
    // puis retirées, ont fait sortir la clé sur les trois surfaces — `"0"`
    // comprise — pendant que la piste voisine non taguée gardait la clé
    // ABSENTE dans la même charge. « Pas branché » est donc exclu par la
    // mesure. Arbitrage de Bertrand le 09/09 : on allume.
    expect(COLONNES.filter((c) => c.indisponible).map((c) => c.cle)).toEqual([]);
  });

  it('les colonnes allumées LISENT bien le champ du serveur', () => {
    // Ce témoin vient de #826 : les déclarer disponibles sans les brancher
    // donnerait une colonne cochable et vide — pire que grisée. Il garde
    // désormais l'implémentation de #826, conservée à la fusion.
    const piste = { play_count: 12, last_played_at: '2026-09-01T10:00:00Z' } as any;
    expect(valeurColonne(piste, 'plays')).toBe('12');
    expect(valeurColonne(piste, 'lastPlayed')).toBe('2026-09-01');
    // Jamais écoutée : rien, et surtout pas une date inventée.
    expect(valeurColonne({} as any, 'lastPlayed')).toBeNull();
    // Et le DR, ajout de #824 : la clé existe désormais aussi.
    expect(valeurColonne({ dynamic_range: '14' } as any, 'dr')).toBe('14');
  });

  it('🔴 le drapeau `indisponible` reste APPLIQUÉ, même inutilisé', () => {
    // Personne ne le porte aujourd'hui : une garde qui se contenterait de la
    // liste vide ci-dessus laisserait passer la suppression du filtre, et la
    // soupape serait perdue sans un seul rouge. On lit donc le MODULE, et on
    // y cherche le filtre — aiguille assemblée à l'exécution pour qu'elle ne
    // se trouve pas elle-même dans ce fichier de test.
    const src = readFileSync(resolve(process.cwd(), 'src/lib/colonnesPistes.ts'), 'utf-8');
    const aiguille = '!c.' + 'indisponible';
    expect(src.includes(aiguille), 'colonnesRetenues n’écarte plus une colonne sans donnée')
      .toBe(true);
  });

  it('🔴 EXPERT propose TOUT le catalogue', () => {
    // « En expert, il les faut toutes comme Dynamic Range » (Bertrand).
    // Aucune colonne ne doit exiger plus qu'Expert, et rien ne doit rester
    // hors de portée d'Expert.
    for (const c of COLONNES) expect(offerteAu(c, 'expert'), c.cle).toBe(true);
  });

  it('🔴 la RÉPARTITION par niveau est figée, colonne par colonne', () => {
    // Une première version comptait seulement les colonnes expertes. Retirer
    // `min: 'expert'` de « Fichier » la laissait VERTE — la colonne serait
    // remontée en Essentiel sans que rien ne le dise. Un test qui compte ne
    // garde pas ce qui est réparti.
    const par = (m: string) => COLONNES.filter((c) => c.min === m).map((c) => c.cle).sort();
    // « D'Album à bit depth accessible aussi en mode advanced » (Bertrand,
    // 07/09/2026) : format, fréquence et profondeur sont descendues d'Expert.
    // La pastille Qualité les résume déjà en Essentiel ; ces colonnes servent
    // à TRIER, ce qui n'est pas un geste d'expert.
    expect(par('intermediate')).toEqual(
      ['album', 'albumArtist', 'bitDepth', 'disc', 'format', 'label', 'sampleRate'].sort(),
    );
    // Expert ne garde que ce qui décrit le FICHIER plutôt que la musique.
    expect(par('expert')).toEqual(
      ['comments', 'discSubtitle', 'dr', 'hash', 'isrc', 'mbid', 'modified', 'path', 'size', 'source'].sort(),
    );
  });

  it('le mode d’une colonne ne remonte jamais au-dessus de son niveau', () => {
    for (const c of COLONNES.filter((x) => x.min === 'expert')) {
      expect(offerteAu(c, 'beginner'), c.cle).toBe(false);
      expect(offerteAu(c, 'intermediate'), c.cle).toBe(false);
    }
    for (const c of COLONNES.filter((x) => x.min === 'intermediate')) {
      expect(offerteAu(c, 'beginner'), c.cle).toBe(false);
      expect(offerteAu(c, 'intermediate'), c.cle).toBe(true);
    }
  });

  it('🔴 le tableau applique le minimum du MODE COURANT', () => {
    // Un réglage plus ancien peut cocher une colonne experte pour Essentiel :
    // elle ne doit pas réapparaître.
    expect(colonnesRetenues(['path', 'artist'], 'beginner').map((c) => c.cle))
      .toEqual(['title', 'artist']);
    expect(colonnesRetenues(['path', 'artist'], 'expert').map((c) => c.cle))
      .toEqual(['title', 'artist', 'path']);
  });
});

describe('les colonnes retenues', () => {
  it('respectent l’ordre du CATALOGUE, pas celui du réglage', () => {
    const r = colonnesRetenues(['quality', 'artist', 'num']);
    expect(r.map((c) => c.cle)).toEqual(['num', 'title', 'artist', 'quality']);
  });

  it('gardent le titre même s’il est absent du réglage', () => {
    expect(colonnesRetenues([]).map((c) => c.cle)).toEqual(['title']);
  });

  it('🔴 retiennent « # écoutes » et « dernière écoute », désormais SERVIES', () => {
    // Ce témoin gardait l'inverse jusqu'au 09/09/2026 : les deux colonnes
    // portaient `indisponible` et étaient donc écartées même cochées.
    //
    // 🔴 IL N'A PLUS DE COLONNE À GARDER pour l'autre moitié de son contrat.
    // #826 avait fait basculer l'assertion « écartée même cochée » sur `dr`,
    // seule colonne encore grisée ; `dr` est allumée depuis. Le mécanisme
    // lui-même est désormais gardé par lecture du module — voir « le drapeau
    // `indisponible` reste APPLIQUÉ » plus haut. Ici on garde ce qui est
    // observable : une case cochée produit bien une colonne.
    expect(colonnesRetenues(['plays', 'lastPlayed']).map((c) => c.cle))
      .toEqual(['title', 'plays', 'lastPlayed']);
  });

  it('écartent une clé INCONNUE au lieu de casser la grille', () => {
    // Un réglage écrit par une version future ne doit pas produire une
    // `grid-template-columns` avec un trou.
    const r = colonnesRetenues(['artist', 'colonne-du-futur', '']);
    expect(r.map((c) => c.cle)).toEqual(['title', 'artist']);
  });
});

describe('le gabarit de grille', () => {
  it('est fabriqué UNE fois pour l’en-tête et les lignes', () => {
    // C'est la leçon de la vue Liste de la Bibliothèque : deux gabarits
    // calculés séparément finissent par diverger, et les colonnes ne
    // s'alignent plus d'une ligne à l'autre.
    expect(gabaritGrille(colonnesRetenues(['num', 'artist', 'time'])))
      .toBe('44px minmax(0,2fr) minmax(0,1.4fr) 64px');
  });
});

describe('les valeurs', () => {
  it.each([
    ['num', '1'], ['title', 'Almoraima'], ['artist', 'Paco de Lucia'],
    ['composer', 'Paco de Lucia'], ['time', '5:27'], ['year', '1996'],
    ['channels', '2'], ['genre', 'World Music'],
  ] as [CleColonne, string][])('%s', (cle, attendu) => {
    expect(valeurColonne(piste(), cle)).toBe(attendu);
  });

  it('🔴 « on ne sait pas » rend null, jamais « — » ni « 0 »', () => {
    // Une cellule vide se lit comme une absence ; un zéro affirme une valeur.
    // C'est la confusion qui avait fait perdre du temps sur le bandeau de fin
    // de scan (fil 1512).
    expect(valeurColonne(piste({ bpm: null } as any), 'bpm')).toBeNull();
    expect(valeurColonne(piste({ year: null } as any), 'year')).toBeNull();
    expect(valeurColonne(piste({ genre: '   ' } as any), 'genre')).toBeNull();
    // Les trois clés ABSENTES de la charge : le serveur ne pose `play_count`
    // et `last_played_at` que si la base a répondu, et `dynamic_range` que si
    // la piste porte le tag. Rien à dire ⇒ cellule vide.
    expect(valeurColonne(piste(), 'plays')).toBeNull();
    expect(valeurColonne(piste(), 'lastPlayed')).toBeNull();
    expect(valeurColonne(piste(), 'dr')).toBeNull();
  });

  it('un zéro RÉEL reste zéro', () => {
    expect(valeurColonne(piste({ channels: 0 } as any), 'channels')).toBe('0');
    expect(valeurColonne(piste({ track_number: 0 } as any), 'num')).toBe('0');
  });

  describe('🔴 #824 — les trois colonnes rallumées, et leurs DEUX contrats', () => {
    // Le piège central du ticket : `dynamic_range` absent et `dynamic_range`
    // à zéro ne veulent PAS dire la même chose, et `play_count` à zéro ne veut
    // pas dire la même chose qu'un `play_count` absent. Quatre cas, quatre
    // affichages, mesurés le 09/09/2026 sur le .18 en v0.9.144.

    it('DR0 s’affiche « 0 » : c’est la mesure d’un master saturé', () => {
      // Le serveur rend la valeur en CHAÎNE (mesuré : `"0"`, `"14"`). Un test
      // de vérité sur cette chaîne la laisserait passer ; un test de vérité
      // sur un nombre `0` la perdrait. Les deux formes sont couvertes.
      expect(valeurColonne(piste({ dynamic_range: '0' } as any), 'dr')).toBe('0');
      expect(valeurColonne(piste({ dynamic_range: 0 } as any), 'dr')).toBe('0');
    });

    it('une piste SANS tag DR laisse la cellule vide, jamais « 0 »', () => {
      // C'est le sens de la flèche qui compte : vide ⇏ DR0. Un `?? 0` posé un
      // jour de fatigue afficherait « 0 » sur les 46 877 pistes du .18, et
      // accuserait toute la bibliothèque d'être écrasée.
      expect(valeurColonne(piste({} as any), 'dr')).toBeNull();
      expect(valeurColonne(piste({ dynamic_range: null } as any), 'dr')).toBeNull();
      expect(valeurColonne(piste({ dynamic_range: '  ' } as any), 'dr')).toBeNull();
    });

    it('DR14 s’affiche « 14 »', () => {
      expect(valeurColonne(piste({ dynamic_range: '14' } as any), 'dr')).toBe('14');
    });

    it('play_count = 0 s’affiche « 0 » : jamais jouée est une information', () => {
      // L'inverse du DR. Ici la clé est TOUJOURS posée quand la base répond,
      // et l'immense majorité des pistes vaut `0` : rendre `null` viderait la
      // colonne entière et la ferait passer pour une panne.
      expect(valeurColonne(piste({ play_count: 0 } as any), 'plays')).toBe('0');
      expect(valeurColonne(piste({ play_count: 4 } as any), 'plays')).toBe('4');
    });

    it('play_count ABSENT laisse la cellule vide : la base a échoué', () => {
      // Le serveur ne pose alors AUCUNE des deux clés, plutôt qu'un `0` qui
      // se lirait « jamais jouée » et mentirait.
      expect(valeurColonne(piste({} as any), 'plays')).toBeNull();
    });

    it('last_played_at rend la DATE, et `null` reste vide', () => {
      // Horodatage tel que mesuré sur le .18.
      expect(valeurColonne(piste({ last_played_at: '2026-09-06T12:09:53Z' } as any), 'lastPlayed'))
        .toBe('2026-09-06');
      expect(valeurColonne(piste({ last_played_at: null } as any), 'lastPlayed')).toBeNull();
      expect(valeurColonne(piste({ last_played_at: 'pas une date' } as any), 'lastPlayed'))
        .toBeNull();
    });

    it('🔴 `dr` reste EXPERT, et c’est l’ÉCRAN qui descend vers elle', () => {
      // Arbitrage de Bertrand, 09/09/2026. La version précédente de ce témoin
      // disait l'inverse — `MODES_BRANCHES` ne citait pas 'expert', et le DR
      // n'était rendu nulle part. Le niveau de la colonne n'a pas bougé : le
      // tableau, lui, existe maintenant aussi en Expert.
      expect(PAR_CLE.dr.min).toBe('expert');
      expect(MODES_BRANCHES).toContain('expert');
      // Elle reste hors de portée d'Essentiel : brancher un mode ne déplace
      // aucune colonne.
      expect(colonnesRetenues(['dr'], 'beginner').map((c) => c.cle)).toEqual(['title']);
      expect(colonnesRetenues(['dr'], 'expert').map((c) => c.cle)).toEqual(['title', 'dr']);
      // Les écoutes n'ont AUCUN `min` : les deux modes en tableau les portent.
      expect(PAR_CLE.plays.min).toBeUndefined();
      expect(PAR_CLE.lastPlayed.min).toBeUndefined();
      for (const m of MODES_BRANCHES) {
        expect(colonnesRetenues(['plays', 'lastPlayed'], m).map((c) => c.cle), m)
          .toEqual(['title', 'plays', 'lastPlayed']);
      }
    });
  });

  it('la qualité ne passe pas par le texte : c’est une pastille', () => {
    expect(valeurColonne(piste(), 'quality')).toBeNull();
  });
});

describe('les défauts par mode', () => {
  it('ne citent que des clés du catalogue', () => {
    for (const [mode, cles] of Object.entries(DEFAUTS))
      for (const c of cles) expect(PAR_CLE[c as CleColonne], `${mode} → ${c}`).toBeTruthy();
  });

  it('n’avancent AUCUNE colonne sans donnée', () => {
    // Les proposer cochées d'office remplirait l'écran de vide le premier jour.
    for (const cles of Object.values(DEFAUTS))
      for (const c of cles) expect(PAR_CLE[c as CleColonne].indisponible, c).toBeFalsy();
  });

  it('Essentiel est le plus sobre des trois', () => {
    expect(DEFAUTS.beginner.length).toBeLessThan(DEFAUTS.intermediate.length);
    expect(DEFAUTS.intermediate.length).toBeLessThan(DEFAUTS.expert.length);
  });

  it('🔴 Essentiel ET Expert sont branchés ; Avancé ne l’est pas', () => {
    // Arbitrage du 09/09/2026 : « on branche le tableau en mode Expert ».
    // Avancé reste dehors — périmètre explicite, pas un oubli : la matrice
    // des Réglages continue de le griser et de le dire.
    expect(MODES_BRANCHES).toEqual(['beginner', 'expert']);
    expect(MODES_BRANCHES).not.toContain('intermediate');
  });

  it('🔴 les modes branchés ouvrent sur des colonnes, jamais sur une grille NUE', () => {
    // Ce qui se passe pour quelqu'un dont les préférences ont été écrites
    // quand Expert ne portait pas le tableau : le magasin refusionne mode par
    // mode sur `DEFAUTS`, donc il retombe sur cette liste-ci. Elle a cessé
    // d'être théorique le jour où Expert est passé au tableau — et
    // `settingsLevel` vaut `'expert'` par DÉFAUT depuis le 27/08, donc c'est
    // aussi ce que voit une installation neuve.
    for (const m of MODES_BRANCHES) {
      expect(DEFAUTS[m].length, `${m} : défaut vide`).toBeGreaterThan(0);
      const rendues = colonnesRetenues(DEFAUTS[m], m).map((c) => c.cle);
      expect(rendues.length, `${m} : aucune colonne rendue`).toBeGreaterThan(1);
      expect(rendues, `${m} : le titre a disparu`).toContain('title');
    }
  });

  it('le titre survit même à un réglage VIDE — la grille n’est jamais sans colonne', () => {
    // « Une liste VIDE est un choix : on ne la remplace pas par le défaut »
    // (magasin de préférences). Ce choix ne doit pas produire un tableau sans
    // une seule cellule cliquable : le titre est verrouillé, il reste.
    for (const m of MODES_BRANCHES) {
      expect(colonnesRetenues([], m).map((c) => c.cle), m).toEqual(['title']);
    }
  });
});

describe('la matrice des Réglages', () => {
  const lire = (p: string) =>
    readFileSync(resolve(process.cwd(), p), 'utf-8');
  const sansCommentaires = (src: string) =>
    src.replace(/<!--[\s\S]*?-->/g, '')
       .replace(/\/\*[\s\S]*?\*\//g, '')
       .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = () => sansCommentaires(lire('src/components/v2/SettingsV2.svelte'));

  it('première ligne les MODES, première colonne les MÉTADONNÉES', () => {
    // La forme demandée mot pour mot : « un tableau avec sur la première ligne
    // les modes et sur la première colonne les metadatas ».
    const s = src();
    expect(s).toContain('class="matrice"');
    expect(s).toMatch(/\{#each SETTINGS_LEVELS as m \(m\)\}[\s\S]{0,200}columnheader/);
    expect(s).toMatch(/\{#each COLONNES as c \(c\.cle\)\}/);
  });

  it('les modes sont nommés par la clé DÉJÀ existante', () => {
    // `LEVEL_LABEL_KEYS` nomme Essentiel/Avancé/Expert depuis toujours. Les
    // renommer ici en donnerait deux jeux, qui finiraient par diverger.
    expect(src()).toContain('LEVEL_LABEL_KEYS[m] as any');
  });

  it('🔴 un mode NON BRANCHÉ est désactivé ET annoncé', () => {
    // Option A. Une case cochable sans effet serait précisément le défaut que
    // ce client passe son temps à corriger.
    const s = src();
    expect(s).toMatch(/disabled=\{c\.verrouillee \|\| sansDonnee \|\| !offerte \|\| !modeBranche\(m\)\}/);
    expect(s).toContain("$t('settings.colModeNotWired' as any)");
    expect(s).toMatch(/class:inerte=\{!modeBranche\(m\)\}/);
  });

  it('🔴 une colonne SANS DONNÉE est désactivée ET le motif est écrit', () => {
    const s = src();
    expect(s).toMatch(/\{@const sansDonnee = !!c\.indisponible\}/);
    expect(s).toContain("$t('settings.colNoData' as any)");
  });

  it('le titre est coché et non décochable', () => {
    const s = src();
    expect(s).toMatch(/checked=\{offerte && \(c\.verrouillee \|\| colonneCochee\(m, c\.cle\)\)\}/);
  });

  it('🔴 une ligne sous son niveau est grisée ET dit à partir d’où', () => {
    // « Je voudrai ajouter des metadata pour Advanced et Expert, et donc grisé
    // en Essential » (Bertrand). Une case grise sans explication laisserait
    // croire à une panne.
    const s = src();
    expect(s).toMatch(/\{@const offerte = offerteAu\(c, m\)\}/);
    expect(s).toContain("$t('settings.colLevelOnly' as any).replace('{m}', depuis)");
    expect(s).toMatch(/class:inerte=\{!offerte\}/);
  });

  it("la bascule réécrit l'objet ENTIER", () => {
    // Muter la liste en place ne réveillerait pas les abonnés, et le magasin
    // ne se sauvegarderait pas — la préférence serait perdue au rechargement.
    expect(src()).toMatch(/v2Colonnes: \{ \.\.\.pr\.v2Colonnes, \[m\]: suivant \}/);
  });

  it('chaque case porte un nom accessible', () => {
    // Une grille de cases nues est illisible sans la vue : le nom dit quelle
    // métadonnée et quel mode.
    expect(src()).toMatch(/aria-label=\{`\$\{\$t\(c\.cleI18n as any\)\} — \$\{\$t\(LEVEL_LABEL_KEYS\[m\] as any\)\}`\}/);
  });
});

describe('les huit listes passent par le rendu partagé', () => {
  const lire2 = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

  const ECRANS = [
    'AlbumDetailV2', 'PlaylistDetailV2', 'LibraryV2', 'SearchV2',
    'FavoritesV2', 'EtiquettesV2', 'HistoriqueV2',
  ];

  it('🔴 aucun écran n’appelle plus la ligne directement', () => {
    // Le conteneur est le seul endroit où les deux formes coexistent. Un écran
    // qui court-circuiterait vers `LignePisteV2` garderait ses lignes au mode
    // Essentiel, et le tableau serait absent d'un écran sur huit sans que rien
    // ne le dise.
    for (const f of ECRANS) {
      const src = lire2(`src/components/v2/${f}.svelte`);
      expect(src, `${f} appelle encore LignePisteV2 en direct`).not.toContain('<LignePisteV2');
      expect(src, `${f} ne délègue pas`).toContain('<ListePistesV2');
    }
  });

  it('🔴 les listes où `id` peut manquer transmettent une CLÉ', () => {
    // `id` est nul sur toute piste de SERVICE, et l'Historique peut afficher
    // deux fois la même piste. Deux clés identiques arrêtent Svelte sur
    // `each_key_duplicate` : l'écran entier disparaît. La première version de
    // cette délégation avait perdu la clé des Favoris — une garde l'a vu.
    for (const f of ['FavoritesV2', 'HistoriqueV2', 'SearchV2']) {
      const src = lire2(`src/components/v2/${f}.svelte`);
      expect(/<ListePistesV2[\s\S]{0,400}clef=\{/.test(src), `${f} ne transmet pas de clé`).toBe(true);
    }
  });

  it('le suffixe reste une COLONNE, pas une enveloppe', () => {
    // Enveloppée, la ligne serait plus étroite que l'en-tête et les colonnes
    // ne tomberaient plus en face — le défaut d'alignement qu'on vient de
    // corriger ailleurs.
    const liste = lire2('src/components/v2/ListePistesV2.svelte');
    // La largeur du suffixe est FIXE, comme celle des actions : voir le bloc
    // « l'alignement de l'en-tête et des lignes » plus bas.
    expect(liste).toMatch(/gabaritGrille\(colonnes\)\} \$\{LARGEUR_ACTIONS\}/);
    expect(liste).toMatch(/apres \? ` \$\{largeurApres\}` : ''/);
    expect(liste).toMatch(/\{#if apres\}<span class="td act" role="cell">\{@render apres\(p, i\)\}<\/span>\{\/if\}/);
  });

  it('les trois écrans à suffixe le fournissent', () => {
    for (const [f, quoi] of [
      ['PlaylistDetailV2', 'le bouton retirer'],
      ['HistoriqueV2', "l'instant et le cœur radio"],
      ['SearchV2', 'le pourcentage de proximité'],
    ] as [string, string][]) {
      const src = lire2(`src/components/v2/${f}.svelte`);
      expect(src, `${f} a perdu ${quoi}`).toMatch(/apres=\{[a-zA-Zé]+\}/);
      expect(src, `${f} : le fragment doit exister`).toMatch(/\{#snippet [a-zA-Zé]+\(/);
    }
  });
});

describe('🔴 l’alignement de l’en-tête et des lignes', () => {
  const liste = () =>
    readFileSync(resolve(process.cwd(), 'src/components/v2/ListePistesV2.svelte'), 'utf-8');

  it('AUCUNE colonne dimensionnée par son contenu', () => {
    // Signalé par Bertrand le 07/09/2026, capture à l'appui : « TIME » deux
    // cents pixels à droite de « 5:24 ».
    //
    // L'en-tête et les lignes sont des grilles SÉPARÉES qui partagent le même
    // `grid-template-columns`. Une colonne en `auto` ou `max-content` s'y
    // résout indépendamment — zéro dans l'en-tête, où la cellule d'actions est
    // vide, ~178 px dans les lignes — et les colonnes en `fr` absorbent
    // l'écart. C'est la leçon de la vue Liste, écrite le 05/09 et réintroduite
    // ici deux jours plus tard.
    const src = liste().replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    const i = src.indexOf('const gabarit = $derived(');
    expect(i).toBeGreaterThan(-1);
    const expr = src.slice(i, src.indexOf(');', i));
    expect(expr, 'un `auto` est revenu dans le gabarit').not.toMatch(/\bauto\b/);
    expect(expr, 'un `max-content` est revenu dans le gabarit').not.toMatch(/max-content/);
  });

  it('la colonne d’actions a une largeur FIXE', () => {
    // Les actions sont conditionnelles : playlist et étiquettes ne sont
    // offertes que sur une piste locale. Dimensionnée par son contenu, la
    // colonne différerait d'une LIGNE à l'autre, pas seulement de l'en-tête.
    expect(liste()).toMatch(/const LARGEUR_ACTIONS = '\d+px';/);
  });

  it('le suffixe aussi, et chaque écran donne la sienne', () => {
    expect(liste()).toMatch(/largeurApres = '\d+px'/);
    for (const f of ['PlaylistDetailV2', 'HistoriqueV2', 'SearchV2']) {
      const src = readFileSync(resolve(process.cwd(), `src/components/v2/${f}.svelte`), 'utf-8');
      expect(src, `${f} laisse la largeur par défaut`).toMatch(/largeurApres="\d+px"/);
    }
  });

  it('les actions sont calées à DROITE', () => {
    // Sinon, sur une piste sans playlist ni étiquettes, les quatre icônes
    // restantes glissent à gauche et les cœurs ne sont plus l'un sous l'autre.
    expect(liste()).toMatch(/\.act\{[^}]*justify-content:flex-end/);
  });
});

describe('🔴 UNE seule source de vérité pour « ce mode rend-il un tableau ? »', () => {
  const composant = () =>
    readFileSync(resolve(process.cwd(), 'src/components/v2/ListePistesV2.svelte'), 'utf-8');
  const sansCommentaires2 = (src: string) =>
    src.replace(/<!--[\s\S]*?-->/g, '')
       .replace(/\/\*[\s\S]*?\*\//g, '')
       .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('le composant CONSULTE `MODES_BRANCHES` au lieu de retrancher la question', () => {
    // Avant le 09/09/2026 il décidait tout seul : `enTableau = mode ===
    // 'beginner'`, pendant que l'écran des Réglages consultait
    // `MODES_BRANCHES`. Deux réponses à une question — brancher Expert dans la
    // constante n'aurait rien changé à l'affichage, et la matrice aurait
    // annoncé cochable un mode que le tableau ignorait.
    expect(sansCommentaires2(composant())).toMatch(/const enTableau = \$derived\(modeEnTableau\(mode\)\)/);
  });

  it('🔴 AUCUN nom de mode écrit en dur dans la décision du tableau', () => {
    // C'est exactement la ligne qu'un correctif futur réintroduit sans y
    // penser — « il suffit de tester le mode ici ». Elle repasserait au vert
    // sur tous les autres témoins, et Expert reperdrait son tableau en
    // silence.
    //
    // 🔴 Aiguilles ASSEMBLÉES à l'exécution : écrites en clair, elles
    // figureraient dans CE fichier, et ce témoin se trouverait lui-même.
    const src = sansCommentaires2(composant());
    const ligne = src.split('\n').find((l) => l.includes('const enTableau')) ?? '';
    expect(ligne, 'la ligne `enTableau` a disparu').not.toBe('');
    for (const mode of ['beg' + 'inner', 'interme' + 'diate', 'exp' + 'ert']) {
      expect(ligne.includes(mode), `« ${mode} » est écrit en dur dans enTableau`).toBe(false);
    }
  });
});
