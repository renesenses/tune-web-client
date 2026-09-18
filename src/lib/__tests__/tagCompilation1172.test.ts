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
//  - les deux gestes partent en POST sur LEURS routes, avec les albums —
//    `apiFetch` avec des options partirait en GET et « réussirait » sans rien
//    écrire (piège documenté de `api.ts`) ;
//  - 🔴 le drapeau ne passe JAMAIS par `/albums/batch-update` : le serveur n'y
//    a pas de champ `is_compilation`, serde le jette, la requête rend 200 et
//    rien n'est posé. Première version livrée ainsi le 18/09, muette ;
//  - l'album qui survit à une fusion est le plus fourni, pas le premier coché ;
//  - le bilan de gravure dit les albums SANS décision manuelle ;
//  - réunir et graver sont ARMÉS en deux clics : elles déplacent des pistes ou
//    écrivent sur le disque ;
//  - une nouvelle recherche vide la sélection — sinon le geste porte sur des
//    albums qu'on ne voit plus ;
//  - les dix-sept libellés existent dans les onze langues.
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

  it('les deux gestes partent en POST sur LEURS routes, avec les albums', () => {
    const i = apiMeta.indexOf('export function poserCompilation');
    expect(i).toBeGreaterThan(-1);
    const poser = apiMeta.slice(i, i + 460);
    expect(poser).toContain('/library/albums/compilation');
    expect(poser).toMatch(/method:\s*'POST'/);
    expect(poser).toContain('album_ids: albumIds, valeur, fusionner');

    const j = apiMeta.indexOf('export function graverCompilation');
    expect(j).toBeGreaterThan(-1);
    const graver = apiMeta.slice(j, j + 460);
    expect(graver).toContain('/library/albums/compilation/graver');
    expect(graver).toMatch(/method:\s*'POST'/);
    expect(graver).toContain('album_ids: albumIds');
  });

  it('🔴 le drapeau ne passe JAMAIS par batch-update', () => {
    // Le serveur n'a pas de champ `is_compilation` sur `/albums/batch-update`
    // (tune-server-rust#4431) : serde jette les champs inconnus, la requête
    // rend 200, et RIEN n'est posé. Une panne muette — c'est exactement ce qui
    // a été livré le 18/09 avant ce correctif.
    const i = api.indexOf('export function batchUpdateAlbums');
    expect(i).toBeGreaterThan(-1);
    const signature = api.slice(i, api.indexOf(')', api.indexOf('updates:', i)));
    expect(signature).not.toContain('is_compilation');
    expect(vue).not.toMatch(/batchUpdateAlbums\([^)]*is_compilation/);
  });

  it('l’écran a l’onglet et branche les trois gestes sur la bonne route', () => {
    expect(vue).toContain("tab = 'compil'");
    // Marquer ne fusionne pas ; réunir fusionne. Le booléen est explicite des
    // deux côtés : une valeur par défaut déciderait à notre place.
    expect(vue).toContain('api.poserCompilation(ids, valeur, false)');
    expect(vue).toContain('api.poserCompilation(ids, true, true)');
    expect(vue).toContain('api.graverCompilation(ids)');
  });

  it('l’album qui survit à la fusion est le plus fourni, pas le premier coché', () => {
    // Le serveur garde `album_ids[0]`. Sur Coco María — onze albums d'UNE
    // piste — l'ordre de cochage déciderait au hasard.
    const i = vue.indexOf('function idsChoisisCiblePremiere(');
    expect(i).toBeGreaterThan(-1);
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain('(y.track_count ?? 0) - (x.track_count ?? 0)');
    for (const fn of ['marquerCompil', 'reunirCompil']) {
      const j = vue.indexOf(`async function ${fn}(`);
      expect(vue.slice(j, vue.indexOf('\n  }', j)), fn).toContain('idsChoisisCiblePremiere()');
    }
  });

  it('le bilan de gravure dit les albums SANS décision', () => {
    // Sans clic préalable sur « Compilation », le serveur ne grave rien et
    // rend `sans_decision`. Taire ce compte ferait passer « 0 fichier gravé »
    // pour une panne.
    const i = vue.indexOf('async function graverCompil(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain('b.fichiers_ecrits');
    expect(corps).toContain('b.sans_decision?.length');
    expect(corps).toContain('b.echecs?.length');
  });

  it('réunir et graver demandent DEUX clics — marquer, un seul', () => {
    for (const [fn, cle] of [['reunirCompil', 'cp:reunir'], ['graverCompil', 'cp:graver']] as const) {
      const i = vue.indexOf(`async function ${fn}(`);
      expect(i, fn).toBeGreaterThan(-1);
      const corps = vue.slice(i, vue.indexOf('\n  }', i));
      expect(corps, fn).toContain(`if (arme !== '${cle}') { arme = '${cle}'; return; }`);
    }
    const i = vue.indexOf('async function marquerCompil(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).not.toContain('arme =');
  });

  it('🔴 le filtre porte sur le TITRE D\'ALBUM, pas sur le ?q= du serveur', () => {
    // `?q=` cherche dans le titre de PISTE et le nom d'ARTISTE, jamais dans le
    // titre d'album (`facets.rs`). Mesuré le 18/09 : 23 albums s'appellent
    // « Coco María Presents… » et `q=Coco` en rendait DEUX — le cas même pour
    // lequel cet écran existe.
    expect(vue).not.toMatch(/getAlbumsDetailed\(\s*\{\s*q\b/);
    const i = vue.indexOf('let cpAlbums = $derived.by(');
    expect(i).toBeGreaterThan(-1);
    const corps = vue.slice(i, vue.indexOf('});', i));
    expect(corps).toContain("pliage(a.title ?? '').includes(q)");
    // Et la liste entière est paginée : le serveur plafonne à 2000 par appel,
    // et s'arrêter au premier lot cachait 12 des 23 albums.
    const j = vue.indexOf('async function chargerAlbumsCompil(');
    expect(j).toBeGreaterThan(-1);
    expect(vue.slice(j, vue.indexOf('\n  }', j))).toContain('offset += 2000');
  });

  it('accents et casse ignorés — « Coco María » se trouve en tapant « coco maria »', () => {
    const i = vue.indexOf('function pliage(');
    expect(i).toBeGreaterThan(-1);
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain("normalize('NFD')");
    expect(corps).toContain('toLowerCase()');
  });

  it('changer la recherche vide la sélection', () => {
    // Sinon le geste porterait sur des albums qu'on ne voit plus.
    const i = vue.indexOf('cpQuery;');
    expect(i).toBeGreaterThan(-1);
    expect(vue.slice(i, i + 120)).toContain('cpChoisis = new Set()');
  });

  it('retirer le drapeau ne réunit rien, et réunir exige au moins deux albums', () => {
    const i = vue.indexOf('async function marquerCompil(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).not.toContain('true, true');
    const j = vue.indexOf('async function reunirCompil(');
    expect(vue.slice(j, j + 200)).toContain('cpChoisis.size < 2');
  });

  it('les dix-sept libellés existent dans les onze langues', () => {
    const cles = ['tabCompil','compilIntro','compilSearch','compilStart','compilNone',
      'compilAll','compilNoneSel','compilMark','compilUnmark','compilMerge','compilBurn',
      'compilBurnHint','compilTracks','compilMarked','compilMerged','compilBurned','compilUnavail'];
    for (const l of ['de','en','es','fr','hu','it','ja','ko','ro','sv','zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of cles) expect(src, `${l} : v2.meta.${c}`).toContain(`"v2.meta.${c}":`);
    }
  });
});
