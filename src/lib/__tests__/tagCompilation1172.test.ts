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
//  - la gravure part en POST sur la route du serveur, avec les albums —
//    `apiFetch` avec des options partirait en GET et « réussirait » sans rien
//    écrire (piège documenté de `api.ts`) ;
//  - 🔴 le drapeau passe par `/albums/batch-update`, et PAS par une route
//    `/albums/compilation` : celle-là venait d'une seconde implémentation de
//    #4427, fermée sans être fusionnée. C'est la version `batch-update` qui
//    est livrée en 0.9.155 ; l'autre rend 404 ;
//  - l'album qui survit à une fusion est le plus fourni, pas le premier coché ;
//  - le bilan de gravure dit les albums SANS décision manuelle ;
//  - réunir et graver sont ARMÉS en deux clics : elles déplacent des pistes ou
//    écrivent sur le disque ;
//  - une nouvelle recherche vide la sélection — sinon le geste porte sur des
//    albums qu'on ne voit plus ;
//  - les résultats sont REGROUPÉS par titre, et réunir refuse une sélection
//    à cheval sur deux titres — sur « coco », 23 lignes pour DEUX compilations ;
//  - après une fusion dont les artistes divergent, l'album passe sous
//    « Various Artists » (C2) : la fusion garde sinon l'artiste du maître, et
//    les douze Coco María sont ressorties sous « Ronald Snijders », un invité ;
//  - les dix-neuf libellés existent dans les onze langues.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artisteApresFusion } from '../compilationArtiste';

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

  it('la gravure part en POST sur /library/albums/compilation/graver', () => {
    const j = apiMeta.indexOf('export function graverCompilation');
    expect(j).toBeGreaterThan(-1);
    const graver = apiMeta.slice(j, j + 460);
    expect(graver).toContain('/library/albums/compilation/graver');
    expect(graver).toMatch(/method:\s*'POST'/);
    expect(graver).toContain('album_ids: albumIds');
  });

  it('🔴 le drapeau passe par batch-update — la route /albums/compilation n’existe pas', () => {
    // Deux sessions ont écrit #4427. Celle qui est partie en 0.9.155 étend
    // `BatchAlbumUpdate` avec `is_compilation` ; l'autre, fermée sans être
    // fusionnée, proposait `POST /library/albums/compilation`. Appeler
    // celle-là rend 404 — l'écran a été livré ainsi une demi-journée.
    const i = api.indexOf('export function batchUpdateAlbums');
    expect(i).toBeGreaterThan(-1);
    expect(api.slice(i, api.indexOf(')', api.indexOf('updates:', i)))).toContain('is_compilation?: boolean');
    expect(vue).toContain('api.batchUpdateAlbums(ids, { is_compilation: valeur })');
    // Aucune trace de la route fantôme, ni dans l'écran ni dans l'API.
    expect(vue).not.toContain('poserCompilation');
    expect(apiMeta).not.toContain("/library/albums/compilation'");
  });

  it('l’écran a l’onglet et branche les trois gestes', () => {
    expect(vue).toContain("tab = 'compil'");
    expect(vue).toContain('api.batchUpdateAlbums(ids, { is_compilation: valeur })');
    expect(vue).toContain('api.mergeAlbums(ids)');
    expect(vue).toContain('api.graverCompilation(ids)');
  });

  it('réunir pose le drapeau AVANT de fusionner', () => {
    // Dans l'autre ordre, la fusion supprimerait des lignes album et le
    // marquage porterait sur des identifiants disparus.
    const i = vue.indexOf('async function reunirCompil(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps.indexOf('batchUpdateAlbums')).toBeGreaterThan(-1);
    expect(corps.indexOf('batchUpdateAlbums')).toBeLessThan(corps.indexOf('mergeAlbums'));
  });

  it('le bilan de gravure dit les fichiers que Tune ne relit pas', () => {
    // `hors_format` n'est pas une erreur : annoncer « gravé » pour un WAV
    // serait un faux « fait », le prochain scan ne relira rien.
    const i = vue.indexOf('async function graverCompil(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain('b.ecrits');
    expect(corps).toContain('b.hors_format');
    expect(corps).toContain('b.echecs');
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
    expect(corps).not.toContain('mergeAlbums');
    const j = vue.indexOf('async function reunirCompil(');
    expect(vue.slice(j, j + 200)).toContain('cpChoisis.size < 2');
  });

  it('🔴 les résultats sont regroupés par titre', () => {
    // Taper « coco » sort 23 lignes sur la bibliothèque de Bertrand — et ce
    // sont DEUX compilations. En liste plate, « Tout cocher » puis « Réunir »
    // les fondait en un seul disque, sans retour possible.
    const i = vue.indexOf('let cpGroupes = $derived.by(');
    expect(i).toBeGreaterThan(-1);
    const corps = vue.slice(i, vue.indexOf('\n  });', i));
    expect(corps).toContain("pliage(a.title ?? '')");
    expect(vue).toContain('{#each cpGroupes as g (g.titre)}');
    // Et le « tout cocher » global a disparu : on coche un groupe, pas l'écran.
    expect(vue).not.toContain('toutCocher');
  });

  it('réunir refuse une sélection à cheval sur deux titres', () => {
    const i = vue.indexOf('let cpMelange = $derived(');
    expect(i).toBeGreaterThan(-1);
    expect(vue.slice(i, i + 160)).toContain('titresChoisis().length > 1');
    // Le bouton doit VRAIMENT être inerte, pas seulement le message affiché.
    const j = vue.indexOf("class:armed={arme === 'cp:reunir'}");
    expect(j).toBeGreaterThan(-1);
    expect(vue.slice(j, j + 220)).toContain('cpMelange');
  });

  it('🔴 C2 — l’écran repose l’artiste après la fusion', () => {
    // La règle elle-même est éprouvée pour de vrai plus bas ; ici on tient
    // seulement le fait qu'elle est BRANCHÉE, et sur le résultat de la fusion.
    const i = vue.indexOf('async function reunirCompil(');
    const corps = vue.slice(i, vue.indexOf('\n  }', i));
    expect(corps).toContain('artisteApresFusion(');
    expect(corps).toContain('artist_name: aPoser');
    // La condition EXACTE, et rien d'autre devant : un `false &&` glissé là
    // laissait tous les mots en place et la garde passait au vert.
    expect(corps).toContain('if (aPoser && r.master_id != null) {');
  });

  it('les dix-neuf libellés existent dans les onze langues', () => {
    const cles = ['tabCompil','compilIntro','compilSearch','compilStart','compilNone',
      'compilGroup','compilSelectGroup','compilMixed',
      'compilNoneSel','compilMark','compilUnmark','compilMerge','compilBurn',
      'compilBurnHint','compilTracks','compilMarked','compilMerged','compilBurned','compilUnavail'];
    for (const l of ['de','en','es','fr','hu','it','ja','ko','ro','sv','zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of cles) expect(src, `${l} : v2.meta.${c}`).toContain(`"v2.meta.${c}":`);
    }
  });
});

// La règle C2 elle-même — éprouvée sur des valeurs, pas sur du texte.
//
// 🔴 Ce bloc existe parce qu'une garde TEXTUELLE ne l'attrapait pas : on peut
// changer la façon dont la liste d'artistes est calculée sans toucher une
// ligne que le `grep` surveille, et le sabotage passait au vert.
describe('artisteApresFusion — C2', () => {
  it('plusieurs artistes distincts ⇒ Various Artists', () => {
    // Le cas Coco María : douze lignes, douze invités.
    expect(artisteApresFusion(['Acid Coco', 'Los Pirañas', 'Ronald Snijders'])).toBe('Various Artists');
  });

  it('un seul artiste ⇒ on ne touche à rien', () => {
    // Le coffret d'un chef (les 63 CD de Fritz Reiner, #3855) : lui reprendre
    // son nom serait la régression que C2 interdit explicitement.
    expect(artisteApresFusion(['Fritz Reiner', 'Fritz Reiner', 'Fritz Reiner'])).toBeNull();
  });

  it('aucun artiste ⇒ on n’invente rien', () => {
    expect(artisteApresFusion([null, undefined, '', '   '])).toBeNull();
  });

  it('les lignes sans artiste ne comptent pas pour un artiste de plus', () => {
    // Sinon un coffret dont une ligne a perdu son artiste basculerait à tort
    // en « Various Artists ».
    expect(artisteApresFusion(['Fritz Reiner', '', null, '  Fritz Reiner  '])).toBeNull();
  });
});
