/**
 * #201 — « Image(s) injoignable(s) sous localhost:8888// — ex. `/` », vue
 * Bibliothèque, deux occurrences par passage de l'exploration automatique
 * (29/07/2026).
 *
 * ## Le mécanisme, et il est exact
 *
 * `artworkUrl()` rend la **chaîne vide** quand il n'y a pas de pochette :
 *
 *     export function artworkUrl(coverPath, size): string {
 *       if (!coverPath) return '';
 *
 * C'est utile devant un `{#if}`. Dans un attribut, c'est autre chose :
 * `<img src="">` fait **redemander la page courante** au navigateur. D'où une
 * requête vers `/` par pochette manquante — ce que le rapport nommait « image
 * injoignable sous localhost:8888// ».
 *
 * Le dépôt en comptait **dix-huit** sans garde. Une bibliothèque de quelques
 * centaines d'albums sans pochette en fait autant de requêtes de page.
 *
 * ## Le correctif
 *
 * `artworkSrc()` rend `undefined` au lieu de `''`. Svelte omet un attribut
 * `undefined` : la balise part sans `src`, et le navigateur ne demande rien.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { globSync } from 'fs';
import { artworkSrc, artworkUrl } from '../api';

describe('L’adresse d’une pochette absente', () => {
  it('🔴 `artworkUrl` rend une chaîne VIDE — c’est la source du défaut', () => {
    // On le fige pour que le jour où quelqu'un « corrige » ce retour, il voie
    // que des `{#if}` en dépendent.
    expect(artworkUrl(null)).toBe('');
    expect(artworkUrl(undefined)).toBe('');
    expect(artworkUrl('')).toBe('');
  });

  it('🔴 `artworkSrc` rend `undefined` — Svelte omet alors l’attribut', () => {
    expect(artworkSrc(null)).toBeUndefined();
    expect(artworkSrc(undefined)).toBeUndefined();
    expect(artworkSrc('')).toBeUndefined();
  });

  it('et rend la MÊME adresse quand la pochette existe', () => {
    // Le correctif ne doit rien changer au cas normal.
    for (const chemin of ['abc.jpg', '/api/v1/library/artwork/x.jpg', 'https://exemple.fr/c.jpg']) {
      expect(artworkSrc(chemin)).toBe(artworkUrl(chemin));
      expect(artworkSrc(chemin, 200)).toBe(artworkUrl(chemin, 200));
    }
  });
});

describe('🔴 Aucun `<img>` du dépôt ne pose une source vide', () => {
  const FICHIERS = globSync('src/components/**/*.svelte');

  it('la garde voit bien quelque chose', () => {
    // Un balayage qui ne lit aucun fichier serait vert pour rien.
    expect(FICHIERS.length).toBeGreaterThan(50);
  });

  it('aucun attribut `src` n’appelle `artworkUrl` directement', () => {
    const fautifs: string[] = [];
    for (const f of FICHIERS) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/src=\{[^}]*\}/g)) {
        if (/\bartworkUrl\(/.test(m[0])) fautifs.push(`${f} → ${m[0].slice(0, 60)}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// #3721 — la garde ne suivait la valeur que sur UNE ligne
//
// Le balayage ci-dessus cherche `src={…artworkUrl(…)}` : il ne voit que la
// forme DIRECTE, et seulement sous `src/components/**`. Deux angles morts :
//
//   1. l'usage INDIRECT — `artworkUrl` passe par une fonction locale, un
//      `$derived` ou une variable d'état avant d'atteindre l'attribut. Sept
//      sites du dépôt sont dans ce cas (DeplocView, RadiosView, ConverterView,
//      TvView, NowPlaying ×2, AlbumArt). Mesurés le 09/09/2026 : les sept sont
//      GARDÉS par un `{#if}` en amont, aucun ne produit `src=""`. La garde ne
//      le savait pas — elle ne les regardait pas.
//   2. `src/components/**` ne couvre pas `src/App.svelte` (vide aujourd'hui).
//
// Ce qui suit corrige les deux. La règle interdit un MOTIF DANGEREUX — une
// valeur pouvant valoir `''` qui atteint un attribut `src` sans garde — et non
// une écriture précise : les sept sites restent verts tels qu'ils sont écrits.
//
// Portée : les attributs `src` d'un gabarit, et eux seuls. Deux des sept sites
// (TvView, NowPlaying) alimentent en réalité un `background-image: url(…)` de
// fond flou : un `url()` vide est une CSS invalide, le navigateur ne demande
// rien — ce n'est pas le défaut de #201, et la garde ne les regarde pas.
//
// Ce que la règle NE prouve PAS : la garde acceptée est un `{#if}` englobant
// dont la condition mentionne un identifiant de l'expression `src`. Un
// `{#if album.id}` autour de `src={coverUrl(album)}` passerait donc pour une
// garde alors qu'il n'en est pas une (un `{#if album}` NU, lui, ne compte
// pas). C'est un faux négatif assumé : exiger
// mieux voudrait dire un vrai suivi de flot, et bannir `artworkUrl` partout
// casserait ses usages LÉGITIMES (`{#if}` de gabarit, fond flou en CSS, icône
// de notification), que le test du haut fige justement.
// ═══════════════════════════════════════════════════════════════════════════

const APPEL_ARTWORK_URL = /\bartworkUrl\s*\(/;

/** Index du délimiteur fermant appairé à celui ouvert en `i`, ou -1. */
function finBloc(texte: string, i: number, ouvrant: string, fermant: string): number {
  if (texte[i] !== ouvrant) return -1;
  let profondeur = 0;
  for (let j = i; j < texte.length; j++) {
    if (texte[j] === ouvrant) profondeur++;
    else if (texte[j] === fermant && --profondeur === 0) return j;
  }
  return -1;
}

/**
 * Les symboles LOCAUX d'un fichier qui peuvent porter une valeur venue
 * d'`artworkUrl` — donc la chaîne vide. Un cran de suivi, pas davantage.
 */
export function symbolesRisques(source: string): Set<string> {
  const risques = new Set<string>();

  // (a) affectation d'un seul tenant : `x = api.artworkUrl(…)`,
  //     `let s = $derived(artworkUrl(…))`. Le corps interdit `; { } < >` pour
  //     ne pas franchir la frontière d'un attribut de gabarit — sans quoi
  //     `src={artworkSrc(p)} onclick={() => { z = artworkUrl(p) }}` ferait
  //     passer `src` lui-même pour risqué.
  for (const m of source.matchAll(
    /([A-Za-z_$][\w$]*)\s*=\s*[^=\n][^\n;{}<>]*\bartworkUrl\s*\(/g,
  )) {
    risques.add(m[1]);
  }

  // (b) corps d'une fonction nommée, sur plusieurs lignes.
  for (const m of source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const finParams = finBloc(source, m.index! + m[0].length - 1, '(', ')');
    if (finParams < 0) continue;
    const ouvre = source.indexOf('{', finParams);
    if (ouvre < 0) continue;
    const fin = finBloc(source, ouvre, '{', '}');
    if (fin < 0) continue;
    if (APPEL_ARTWORK_URL.test(source.slice(ouvre, fin))) risques.add(m[1]);
  }

  // (c) `const f = (…) => {…}` et `let x = $derived(…)` multi-lignes.
  for (const m of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    const apres = m.index! + m[0].length;
    const saut = source.indexOf('\n', apres);
    const tete = source.slice(apres, saut < 0 ? source.length : saut);
    let debut = -1;
    let ouvrant: '(' | '{' = '(';
    if (/^\$derived(\.by)?\s*\(/.test(tete)) {
      debut = source.indexOf('(', apres);
    } else if (tete.includes('=>')) {
      debut = source.indexOf('{', apres + tete.indexOf('=>'));
      ouvrant = '{';
    }
    if (debut < 0) continue;
    const fin = finBloc(source, debut, ouvrant, ouvrant === '(' ? ')' : '}');
    if (fin < 0) continue;
    if (APPEL_ARTWORK_URL.test(source.slice(debut, fin))) risques.add(m[1]);
  }

  return risques;
}

/**
 * Les attributs `src` d'un gabarit Svelte qui reçoivent une valeur pouvant
 * valoir `''`. Rend une ligne par faute, avec le numéro de ligne.
 */
export function sourcesVidesPossibles(source: string): string[] {
  const risques = symbolesRisques(source);
  const fautes: string[] = [];
  // Pile des `{#if}` ouverts : la condition, ou `null` dans une branche
  // `{:else}` (où la condition ne garde plus rien).
  const pile: Array<string | null> = [];
  const jeton = /\{#if\s|\{:else\s+if\s|\{:else\}|\{\/if\}|\bsrc=\{|\{\s*src\s*\}/g;
  const ligneDe = (i: number) => source.slice(0, i).split('\n').length;

  let m: RegExpExecArray | null;
  while ((m = jeton.exec(source))) {
    const t = m[0];

    if (t.startsWith('{#if') || t.startsWith('{:else if')) {
      const fin = finBloc(source, m.index, '{', '}');
      const cond = fin < 0 ? null : source.slice(m.index, fin).replace(/^\{[#:]\w+\s*(if\s*)?/, '');
      if (t.startsWith('{#if')) pile.push(cond);
      else if (pile.length) pile[pile.length - 1] = cond;
      if (fin > 0) jeton.lastIndex = fin + 1;
      continue;
    }
    if (t === '{:else}') {
      if (pile.length) pile[pile.length - 1] = null;
      continue;
    }
    if (t === '{/if}') {
      pile.pop();
      continue;
    }

    // Un attribut `src` : `src={…}` ou le raccourci `{src}`.
    let expr: string;
    if (t === 'src={') {
      const ouvre = m.index + t.length - 1;
      const fin = finBloc(source, ouvre, '{', '}');
      if (fin < 0) continue;
      expr = source.slice(ouvre + 1, fin);
      jeton.lastIndex = fin + 1;
    } else {
      expr = 'src';
    }

    const direct = APPEL_ARTWORK_URL.test(expr);
    const idents = [...new Set(expr.match(/[A-Za-z_$][\w$]*/g) ?? [])];
    const indirects = idents.filter((id) => risques.has(id));
    if (!direct && indirects.length === 0) continue;

    // L'appel DIRECT dans l'attribut est fautif quoi qu'il arrive : c'est la
    // règle de #201, on ne l'assouplit pas. L'usage indirect est acquitté par
    // un `{#if}` englobant qui parle de la même donnée.
    //
    // « Parler de la même donnée » veut dire : ou bien la condition nomme le
    // symbole risqué lui-même (`{#if coverUrl(radio)}`, `{#if src && …}`), ou
    // bien elle interroge un CHAMP d'un des arguments (`{#if album.cover_path}`
    // devant `src={coverUrl(album)}`). Un simple `{#if editRadio}` autour d'un
    // formulaire ne compte pas : il dit que le formulaire est ouvert, pas que
    // la pochette existe.
    const garde =
      !direct &&
      pile.some(
        (c) =>
          c !== null &&
          idents.some((id) =>
            risques.has(id)
              ? new RegExp(`\\b${id}\\b`).test(c)
              : new RegExp(`\\b${id}\\s*[.?]`).test(c),
          ),
      );
    if (garde) continue;

    const via = direct ? 'artworkUrl(…) dans l’attribut' : `via ${indirects.join(', ')}`;
    fautes.push(`ligne ${ligneDe(m.index)} — src={${expr.trim().slice(0, 50)}} (${via})`);
  }

  return fautes;
}

describe('🔴 #3721 — la garde suit la valeur d’un cran, et sur tout `src/**`', () => {
  const TOUS = globSync('src/**/*.svelte');

  it('le balayage couvre `src/App.svelte`, hors de `src/components/**`', () => {
    // L'angle mort secondaire de #3721 : vide aujourd'hui, mais rien
    // n'empêchait d'y écrire demain la ligne que la garde interdit ailleurs.
    expect(TOUS).toContain('src/App.svelte');
    expect(TOUS.length).toBeGreaterThan(globSync('src/components/**/*.svelte').length);
  });

  it('aucune valeur pouvant être vide n’atteint un attribut `src` sans garde', () => {
    const fautifs: string[] = [];
    for (const f of TOUS) {
      for (const faute of sourcesVidesPossibles(readFileSync(f, 'utf8'))) {
        fautifs.push(`${f}:${faute}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe('🔴 #3721 — et la garde elle-même sait dire non', () => {
  // Ces cas sont écrits ici, pas lus dans le dépôt : la garde reste jugée sur
  // un motif connu même si tout le dépôt était réécrit demain.

  it('voit l’appel DIRECT dans l’attribut, gardé ou non', () => {
    expect(sourcesVidesPossibles('<img src={artworkUrl(a.cover_path)} />')).toHaveLength(1);
    expect(
      sourcesVidesPossibles('{#if a.cover_path}<img src={artworkUrl(a.cover_path)} />{/if}'),
    ).toHaveLength(1);
  });

  it('voit le passage par une FONCTION locale non gardée', () => {
    const source = [
      '<script>',
      '  function coverUrl(a) { return artworkUrl(a.cover_path, 200); }',
      '</script>',
      '<img src={coverUrl(album)} />',
    ].join('\n');
    const fautes = sourcesVidesPossibles(source);
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('via coverUrl');
  });

  it('voit le passage par un `$derived` et par une variable d’état non gardés', () => {
    expect(
      sourcesVidesPossibles('<script>let s = $derived(artworkUrl(p));</script><img {src} />'),
    ).toHaveLength(0); // `s` n'est pas `src` : rien à voir
    expect(
      sourcesVidesPossibles('<script>let src = $derived(artworkUrl(p));</script><img {src} />'),
    ).toHaveLength(1);
    expect(
      sourcesVidesPossibles(
        '<script>let u = $state(""); u = api.artworkUrl(t.cover_path);</script><img src={u} />',
      ),
    ).toHaveLength(1);
  });

  it('acquitte le passage indirect quand un `{#if}` englobant parle de la donnée', () => {
    const fn = '<script>\n  function coverUrl(a) { return artworkUrl(a.cover_path); }\n</script>\n';
    expect(sourcesVidesPossibles(`${fn}{#if album.cover_path}<img src={coverUrl(album)} />{/if}`)).toEqual([]);
    expect(sourcesVidesPossibles(`${fn}{#if coverUrl(r)}<img src={coverUrl(r)} />{/if}`)).toEqual([]);
    // …mais pas dans la branche `{:else}`, où la condition ne garde plus rien.
    expect(
      sourcesVidesPossibles(`${fn}{#if album.cover_path}<b></b>{:else}<img src={coverUrl(album)} />{/if}`),
    ).toHaveLength(1);
    // …ni une fois le bloc refermé.
    expect(
      sourcesVidesPossibles(`${fn}{#if album.cover_path}<b></b>{/if}<img src={coverUrl(album)} />`),
    ).toHaveLength(1);
    // …et un `{#if album}` NU ne dit rien de la pochette : RadiosView enferme
    // son formulaire d'édition dans un `{#if editRadio}`, ce qui acquittait à
    // tort la vignette qu'il contient.
    expect(
      sourcesVidesPossibles(`${fn}{#if album}<img src={coverUrl(album)} />{/if}`),
    ).toHaveLength(1);
  });

  it('laisse passer `artworkSrc`, qui rend `undefined`', () => {
    expect(sourcesVidesPossibles('<img src={artworkSrc(a.cover_path)} />')).toEqual([]);
    const source = [
      '<script>',
      '  function coverUrl(a) { return artworkSrc(a.cover_path); }',
      '</script>',
      '<img src={coverUrl(album)} />',
    ].join('\n');
    expect(sourcesVidesPossibles(source)).toEqual([]);
  });

  it('ne confond pas `artworkUrl600` (champ iTunes) avec un appel à `artworkUrl`', () => {
    // PodcastsView lit `p.artworkUrl600` / `p.artworkUrl100` : ce sont des
    // champs de l'API iTunes, pas notre fonction.
    const source = [
      '<script>',
      '  function coverUrl(p) { return p.artworkUrl600 || p.artworkUrl100 || null; }',
      '</script>',
      '<img src={coverUrl(podcast)} />',
    ].join('\n');
    expect(sourcesVidesPossibles(source)).toEqual([]);
    expect(symbolesRisques('const x = p.artworkUrl600;')).toEqual(new Set());
  });
});

describe('🔴 #3721 — `artworkUrl` n’est plus jamais importé sans être appelé', () => {
  it('aucun composant ne garde la fonction à portée de main pour rien', () => {
    // Cinq composants l'importaient sans l'appeler (mesuré le 09/09/2026) :
    // une amorce posée à côté de chaque `src=`, pour le prochain qui passe.
    const fautifs: string[] = [];
    for (const f of globSync('src/**/*.svelte')) {
      const source = readFileSync(f, 'utf8');
      const importe = /import\s*\{[^}]*\bartworkUrl\b[^}]*\}\s*from/.test(source);
      const appele = /(?<![.\w$])artworkUrl\s*\(/.test(source);
      if (importe && !appele) fautifs.push(f);
    }
    expect(fautifs).toEqual([]);
  });
});
