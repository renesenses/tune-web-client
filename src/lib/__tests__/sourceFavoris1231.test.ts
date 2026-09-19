// « Source : Qobuz » veut dire « mes favoris Qobuz » — #1231.
//
// Bertrand, 18/09/2026 : « Smart Collection — source qobuz retourne 0 album ».
// Mesuré sur le .18 le 19/09 : sa playlist d'essai `Test Qobuz Coltrane`
// (`artist = John Coltrane` ET `source = qobuz`) rend 0 piste — et c'est la
// BONNE réponse : ses 21 favoris de pistes Qobuz ne contiennent aucun
// Coltrane. La règle porte sur les favoris, pas sur le catalogue.
//
// Le comportement est celui décidé le 17/09 côté serveur. Ce qui manquait,
// c'est que l'écran le DISE : sans la phrase, « 0 résultat » se lit comme une
// panne.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { estSourceDeService } from '../sourcesRegle';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('une source de service se distingue de la bibliothèque', () => {
  it('les services en sont, la bibliothèque non', () => {
    for (const s of ['qobuz', 'tidal', 'bandcamp', 'youtube', 'QOBUZ', '  qobuz  ']) {
      expect(estSourceDeService(s), s).toBe(true);
    }
    for (const s of ['local', 'upnp', 'LOCAL', '', '   ']) {
      expect(estSourceDeService(s), s).toBe(false);
    }
  });

  it('🔴 un serveur UPnP nommé n’est pas un service de streaming', () => {
    // `upnp:<id>` désigne une bibliothèque distante, pas un abonnement : la
    // phrase sur les favoris n'aurait aucun sens là.
    expect(estSourceDeService('upnp:1234')).toBe(false);
  });
});

describe('l’éditeur le dit à l’écran', () => {
  const vue = sansCommentaires(lire('src/components/v2/PlaylistSmartEditeurV2.svelte'));

  it('la précision s’affiche pour un service, et pour lui seul', () => {
    expect(vue).toContain("{#if estSourceDeService(r.value ?? '')}");
    expect(vue).toContain("v2.smart.sourceFavoris");
  });

  it('elle nomme le service, pas un mot générique', () => {
    const i = vue.indexOf('v2.smart.sourceFavoris');
    expect(vue.slice(i, i + 260)).toContain("'{service}'");
    expect(vue.slice(i, i + 260)).toContain('libelleSource(');
  });

  it('le libellé existe dans les onze langues, et nomme les favoris', () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      expect(src, `${l}`).toContain('"v2.smart.sourceFavoris":');
      const ligne = src.split('\n').find((x) => x.includes('"v2.smart.sourceFavoris":')) ?? '';
      expect(ligne, `${l} doit porter {service}`).toContain('{service}');
    }
  });
});
