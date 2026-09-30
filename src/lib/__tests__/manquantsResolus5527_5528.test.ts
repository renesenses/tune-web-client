/**
 * tune-server-rust#5527 et #5528 — résoudre les albums manquants d'un dossier
 * « Collections » (Lulu, fil 1891, v0.9.168).
 *
 * « Lorsque je transfère un album manquant de la bibliothèque vers un
 * répertoire de "Collections", cet album figure encore dans la liste des
 * albums manquants, il serait souhaitable de le supprimer » ; et des opéras
 * « compilés dans un seul album » y figurent sans que rien ne le dise.
 *
 * Décision de Bertrand (30/09/2026) : sur chaque ligne des manquants,
 *
 * 1. « Oublier » — la route de retrait EXISTANTE, avec l'identifiant mort ;
 * 2. « Remplacer par … » — un album vivant de même artiste et de même titre
 *    PROPOSÉ par `GET /collections/{id}/missing`, jamais substitué d'office ;
 * 3. « Réuni dans … » — l'album qui a reçu ses pistes (`merged_into`), avec
 *    un lien vers lui ;
 * 4. les textes dans les ONZE langues.
 *
 * Le geste est gardé par son COMPORTEMENT (`resolutionManquants.ts`) ; le
 * branchement de l'écran, par son texte privé de commentaires.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  albumProche,
  lireResolutions,
  remplacantsAOffrir,
  resoudreManquant,
} from '../resolutionManquants';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (src: string) =>
  src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];
const CLES = [
  'collections.missingMergedInto',
  'collections.missingReplace',
  'collections.missingReplaceBy',
  'collections.missingForget',
  'collections.missingForgetHint',
  'collections.missingActionFailed',
];

/** Un faux client qui note l'ordre des appels, et peut refuser le rangement. */
function routes(refuserLeRangement = false) {
  const appels: string[] = [];
  return {
    appels,
    async addAlbumToCollection(c: number, a: number) {
      appels.push(`POST ${c}/${a}`);
      if (refuserLeRangement) throw new Error('refusé');
    },
    async removeAlbumFromCollection(c: number, a: number) {
      appels.push(`DELETE ${c}/${a}`);
    },
  };
}

describe('#5527/#5528 — le geste', () => {
  it('« Oublier » appelle la route de retrait avec l’identifiant MORT, et rien d’autre', async () => {
    const r = routes();
    await resoudreManquant(r, 7, 901, null);
    expect(r.appels).toEqual(['DELETE 7/901']);
  });

  it('🔴 « Remplacer » range le vivant AVANT de retirer le mort', async () => {
    const r = routes();
    await resoudreManquant(r, 7, 901, 42);
    expect(r.appels).toEqual(['POST 7/42', 'DELETE 7/901']);
  });

  it('🔴 un rangement refusé ne retire PAS le mort : rien n’est perdu', async () => {
    const r = routes(true);
    await expect(resoudreManquant(r, 7, 901, 42)).rejects.toThrow();
    expect(r.appels).toEqual(['POST 7/42']);
  });
});

describe('#5528 — ce que le serveur propose', () => {
  it('lit les remplaçants par identifiant manquant, et « déjà rangé »', () => {
    const r = lireResolutions([
      {
        id: 901,
        title: 'Tosca, CD1',
        artist: 'Maria Callas',
        merged_into: null,
        candidates: [
          { id: 42, title: 'Tosca', artist: 'Maria Callas', in_collection: false },
          { id: 43, title: 'Tosca', artist: 'Maria Callas', in_collection: true },
          { id: 'x', title: 'mal formé' },
        ],
      },
      { id: 902, title: null, artist: null, merged_into: null },
    ]);
    expect(r[901]).toEqual([
      { id: 42, titre: 'Tosca', artiste: 'Maria Callas', dejaRange: false },
      { id: 43, titre: 'Tosca', artiste: 'Maria Callas', dejaRange: true },
    ]);
    expect(r[902]).toEqual([]);
  });

  it('une réponse mal formée ne propose rien (serveur d’avant #5528)', () => {
    expect(lireResolutions(null)).toEqual({});
    expect(lireResolutions({ error: 'not found' })).toEqual({});
  });

  it('n’offre ni un album déjà rangé ici, ni celui déjà dit « réuni dans »', () => {
    const c = [
      { id: 42, titre: 'Tosca', artiste: null, dejaRange: false },
      { id: 43, titre: 'Tosca', artiste: null, dejaRange: true },
      { id: 44, titre: 'Tosca', artiste: null, dejaRange: false },
    ];
    expect(remplacantsAOffrir(c, { id: 44, titre: 'Tosca', artiste: null }).map((x) => x.id)).toEqual([42]);
    expect(remplacantsAOffrir(undefined, null)).toEqual([]);
  });

  it('`merged_into` se lit, et un objet incomplet n’est pas inventé', () => {
    expect(albumProche({ id: 5, title: 'Tosca', artist: '' })).toEqual({ id: 5, titre: 'Tosca', artiste: null });
    expect(albumProche(null)).toBeNull();
    expect(albumProche({ id: 5 })).toBeNull();
  });
});

describe('#5527/#5528 — le branchement de l’écran', () => {
  const ecran = () => sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));
  const liste = () => {
    const src = ecran();
    const debut = src.indexOf('{#each dossier.manquantsDetail as m (m.id)}');
    expect(debut, 'la liste des manquants').toBeGreaterThan(0);
    return src.slice(debut, src.indexOf('{/each}', src.indexOf('missingForget', debut)));
  };

  it('chaque ligne porte « Oublier », branché sur l’identifiant mort', () => {
    expect(liste()).toMatch(/onclick=\{\(\) => resoudre\(dossier, m\.id, null\)\}[\s\S]*collections\.missingForget/);
  });

  it('chaque ligne propose ses remplaçants, et « Réuni dans … » quand il est connu', () => {
    const l = liste();
    expect(l).toContain('remplacantsAOffrir(resolutions[m.id], m.reuniDans)');
    expect(l).toMatch(/resoudre\(dossier, m\.id, c\.id\)/);
    expect(l).toContain('collections.missingReplaceBy');
    expect(l).toContain('collections.missingMergedInto');
    expect(l).toMatch(/ouvrirReuni\(r\)/);
  });

  it('le geste passe par `resoudreManquant` et les routes EXISTANTES du client', () => {
    const src = ecran();
    expect(src).toMatch(/await resoudreManquant\(api, dossier\.id, mort, remplacant\)/);
    expect(src).toMatch(/api\.getCollectionMissing\(dossier\.id\)/);
    expect(src).toMatch(/reuniDans: albumProche\(a\.merged_into\)/);
  });

  it('`getCollectionMissing` vise la route du serveur', () => {
    const api = lire('src/lib/api.ts');
    expect(api).toMatch(
      /export function getCollectionMissing\(collectionId: number\)[\s\S]{0,200}\/library\/collections\/\$\{collectionId\}\/missing/,
    );
  });
});

describe('#5527/#5528 — les onze langues', () => {
  for (const langue of LANGUES) {
    it(`${langue}.ts porte les ${CLES.length} textes`, () => {
      const src = lire(`src/lib/locales/${langue}.ts`);
      for (const cle of CLES) {
        const ligne = src.split('\n').find((l) => l.includes(`"${cle}"`));
        expect(ligne, `${cle} dans ${langue}.ts`).toBeTruthy();
        expect(ligne!.split(':').slice(1).join(':').trim().length, `${cle} non vide dans ${langue}.ts`).toBeGreaterThan(4);
      }
      const remplacerPar = src.split('\n').find((l) => l.includes('"collections.missingReplaceBy"'))!;
      expect(remplacerPar, `{title} dans ${langue}.ts`).toContain('{title}');
    });
  }
});
