// Poser le tag « compilation » à la main — Bertrand, 18/09/2026 :
// « manifestement Coco Maria presents est une compilation. Je veux dans
// l'écran métadonnées une ui me permettant de poser le tag compilation. »
//
// Mesuré sur SA bibliothèque le jour même : onze lignes album pour deux
// compilations (« Club Coco ¡AHORA! » et « New Dimensions »), une par artiste
// de piste, toutes à UNE seule piste, toutes à `is_compilation = false`. Et
// l'onglet « Doublons » ne les voit pas : le détecteur d'albums éclatés rend
// 27 groupes, aucun ne les contient. Il fallait donc un geste à la main.
//
// Ce que ce fichier tient, côté client :
//  - la gravure part bien en POST sur la route du serveur, avec les albums —
//    `apiFetch` avec des options partirait en GET et « réussirait » sans rien
//    écrire (piège documenté de `api.ts`) ;
//  - `batchUpdateAlbums` sait porter `is_compilation`, et l'écran l'appelle ;
//  - réunir et graver sont ARMÉS en deux clics : elles déplacent des pistes ou
//    écrivent sur le disque ;
//  - une nouvelle recherche vide la sélection — sinon le geste porte sur des
//    albums qu'on ne voit plus ;
//  - les dix-huit libellés existent dans les onze langues.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('poser le tag compilation depuis Métadonnées', () => {
  const apiMeta = sansCommentaires(lire('src/lib/api/metadata.ts'));
  const api = sansCommentaires(lire('src/lib/api.ts'));
  // 🔴 L'écran de la NOUVELLE coquille. `MetadataView.svelte` est l'ancienne,
  // que ShellV2 ne monte jamais : y poser le bouton l'aurait rendu invisible
  // pour qui utilise le nouveau client.
  const vue = sansCommentaires(lire('src/components/v2/MetadataV2.svelte'));

  it('la gravure part en POST sur /library/albums/compilation/graver, avec les albums', () => {
    const i = apiMeta.indexOf('export function graverCompilation');
    expect(i).toBeGreaterThan(-1);
    const corps = apiMeta.slice(i, i + 420);
    expect(corps).toContain('/library/albums/compilation/graver');
    expect(corps).toMatch(/method:\s*'POST'/);
    expect(corps).toContain('album_ids: albumIds');
  });

  it('batchUpdateAlbums sait porter le drapeau, et l’écran s’en sert', () => {
    const i = api.indexOf('export function batchUpdateAlbums');
    expect(i).toBeGreaterThan(-1);
    expect(api.slice(i, i + 300)).toContain('is_compilation?: boolean');
    expect(vue).toContain('api.batchUpdateAlbums(ids, { is_compilation: valeur })');
  });

  it('l’écran a l’onglet et branche les trois gestes', () => {
    expect(vue).toContain("tab = 'compil'");
    expect(vue).toContain('api.batchUpdateAlbums(');
    expect(vue).toContain('api.mergeAlbums(ids)');
    expect(vue).toContain('api.graverCompilation(ids)');
  });

  it('réunir et graver demandent DEUX clics — marquer, un seul', () => {
    for (const [fn, cle] of [['reunirCompil', 'cp:reunir'], ['graverCompil', 'cp:graver']] as const) {
      const i = vue.indexOf(`async function ${fn}(`);
      expect(i, fn).toBeGreaterThan(-1);
      const corps = vue.slice(i, vue.indexOf('\n  }', i));
      expect(corps, fn).toContain(`if (arme !== '${cle}') { arme = '${cle}'; return; }`);
    }
    // Poser le drapeau se défait d'un clic : l'armer serait une cérémonie pour
    // rien, et ferait croire à une opération destructrice.
    const i = vue.indexOf('async function marquerCompil(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).not.toContain('arme =');
  });

  it('une nouvelle recherche vide la sélection', () => {
    const i = vue.indexOf('async function chercherCompil(');
    expect(i).toBeGreaterThan(-1);
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain('cpChoisis = new Set()');
  });

  it('retirer le drapeau ne réunit rien, et réunir exige au moins deux albums', () => {
    // Le décochage ne doit pas enchaîner une fusion : ce serait faire passer un
    // simple retrait pour une commande qui déplace des pistes.
    const i = vue.indexOf('async function marquerCompil(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).not.toContain('mergeAlbums');
    const j = vue.indexOf('async function reunirCompil(');
    expect(vue.slice(j, j + 200)).toContain('cpChoisis.size < 2');
  });

  it('les dix-huit libellés existent dans les onze langues', () => {
    const cles = ['tabCompil','compilIntro','compilSearch','compilFind','compilStart','compilNone',
      'compilAll','compilNoneSel','compilMark','compilUnmark','compilMerge','compilBurn',
      'compilBurnHint','compilTracks','compilMarked','compilMerged','compilBurned','compilUnavail'];
    for (const l of ['de','en','es','fr','hu','it','ja','ko','ro','sv','zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of cles) expect(src, `${l} : v2.meta.${c}`).toContain(`"v2.meta.${c}":`);
    }
  });
});
