// La recherche en DEUX TEMPS — Bertrand, 19/09/2026.
//
// « La recherche se fait en deux temps : local puis streaming. Il ne faut pas
// faire patienter l'utilisateur ».
//
// Le premier temps allait déjà : `SearchV2` lance `searchLibrary` et
// `federatedSearch` en parallèle, et `busy` ne suit que le local. Ce qui
// coûtait, c'était le second. Mesuré sur le .18 (0.9.155), « coltrane », chaud :
//
//     /library/search                          0,24 s   ← ce qui s'affiche
//     /search sans sources                     2,03 s   (5,2 s à froid)
//       ↳ le bloc `local`, REFAIT puis jeté    0,95 s
//       ↳ les services, interrogés À LA FILE   1,20 s
//     qobuz 0,13  tidal 0,03  youtube 0,42  bandcamp 0,30   (seuls)
//
// Deux corrections, l'une ici, l'autre côté serveur (`routes/search.rs` :
// `join_all` au lieu d'une boucle qui `await`, et le verrou du registre
// relâché avant les appels réseau).
//
// 🔴 Ce que cet écran JETAIT : `fed` ne reçoit que `r.services`. Le bloc
// `local` de la fédérée n'a jamais servi. Le jeton `streaming` le dit au
// serveur, qui ne le calcule plus.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOURCES_SERVICES } from '../sourcesRecherche';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('le jeton du deuxième temps', () => {
  it('🔴 c’est la graphie du serveur, au caractère près', () => {
    // `tune-server/src/routes/filtre_sources.rs` : `JETON_SERVICES =
    // "streaming"`. Une graphie divergente serait un jeton INCONNU, et un
    // jeton inconnu ne sélectionne rien — ni service, ni local. La recherche
    // de streaming rendrait zéro résultat, sans un mot.
    expect(SOURCES_SERVICES).toBe('streaming');
  });

  it('🔴 ce n’est pas `all` — `all` ramènerait le local', () => {
    expect(SOURCES_SERVICES).not.toBe('all');
    expect(SOURCES_SERVICES).not.toBe('local');
  });
});

describe('l’écran ne fait plus chercher le local deux fois', () => {
  const vue = sansCommentaires(lire('src/components/v2/SearchV2.svelte'));

  it('🔴 il NOMME les sources dans l’appel fédéré', () => {
    expect(vue).toContain('api.federatedSearch(query, [SOURCES_SERVICES])');
  });

  it('🔴 il ne l’appelle plus à nu', () => {
    // `federatedSearch(query)` sans second argument = pas de `sources` = le
    // bloc local refait pour rien.
    expect(vue).not.toMatch(/api\.federatedSearch\(\s*query\s*\)/);
  });

  it('il passe par la constante partagée, pas par une chaîne écrite sur place', () => {
    expect(vue).toContain("from '../../lib/sourcesRecherche'");
    expect(vue).not.toMatch(/federatedSearch\(query,\s*\['streaming'\]\)/);
  });
});

describe('le PREMIER temps n’a pas bougé', () => {
  const vue = sansCommentaires(lire('src/components/v2/SearchV2.svelte'));

  it('🔴 le local part en parallèle, pas derrière les services', () => {
    // Les deux appels sont lancés dans le même `setTimeout`, sans `await`
    // entre eux : c'est ce qui fait que le local s'affiche à 0,24 s.
    const loc = vue.indexOf('api.searchLibrary(');
    const fed = vue.indexOf('api.federatedSearch(');
    expect(loc).toBeGreaterThan(-1);
    expect(fed).toBeGreaterThan(loc);
    const entre = vue.slice(loc, fed);
    expect(entre, 'un await entre les deux les remettrait à la file').not.toContain('await ');
  });

  it('🔴 `busy` ne suit QUE le local', () => {
    // Sinon le voyant d'attente durerait jusqu'au dernier service, et l'écran
    // aurait l'air de chercher alors que les résultats locaux sont déjà là.
    const i = vue.indexOf('api.searchLibrary(');
    const bloc = vue.slice(i, vue.indexOf('api.federatedSearch('));
    expect(bloc).toContain('busy = false');
  });
});
