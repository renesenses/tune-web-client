// @vitest-environment jsdom
//
// 🔴 `renesenses/tune-web-client#922` — et le point 5 du fil 1691.
//
// FabienM : « La recherche globale ne retourne pas tous les résultats du
// streaming (ex : "Somebody" sur Qobuz → seulement 50 résultats) ».
//
// 🔴 LE COMMENTAIRE DU CODE AFFIRMAIT LE CONTRAIRE, ET IL AVAIT TORT
// -------------------------------------------------------------------
// `api.ts` déclarait au-dessus de `SEARCH_PAGE_LIMIT` : « 50 est le plafond de
// page de l'API Qobuz — demander davantage ne rend pas davantage. » C'est ce
// commentaire, jamais revérifié, qui tenait le plafond.
//
// MESURÉ le 12/09/2026 sur la .18 en v0.9.147, requête « somebody » :
//
//   GET /streaming/qobuz/search?limit=50  → 50 albums, 50 titres
//                                   100  → 100, 100
//                                   200  → 200, 200
//                                   500  → 500, 500
//   totals : albums 1000 · titres 1000 · artistes 135 · playlists 173
//
// Demander davantage rend bien davantage. Et `offset` est honoré sur cette
// route — deux pages de 5 rendent dix identifiants distincts.
//
// ⚠️ À NE PAS CONFONDRE avec la route FÉDÉRÉE `/search?q=…&sources=qobuz`,
// qui accepte `limit` jusqu'à 500 mais IGNORE `offset` pour un service
// (mesuré le même jour : deux pages consécutives y rendent les mêmes lignes).
// Ce réglage ne vaut donc que pour la recherche service par service.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue le plafond en dur et exige qu'il
// rende bien 50 là où le réglage rend ce qu'on lui demande.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TAILLES_PAGE, TAILLE_DEFAUT, TAILLE_MAX,
  chargerTaillePage, normaliserTaille, retenirTaillePage,
} from '../taillePageRecherche';

afterEach(() => { try { localStorage.clear(); } catch { /* ignore */ } vi.restoreAllMocks(); });

describe('#922 — les tailles offertes', () => {
  it('50, 100, 200, 500 — et rien au-delà du plafond mesuré', () => {
    expect([...TAILLES_PAGE]).toEqual([50, 100, 200, 500]);
    expect(Math.max(...TAILLES_PAGE)).toBe(TAILLE_MAX);
    expect(TAILLE_DEFAUT, 'le défaut a changé : on surprendrait ceux qui n’ont rien réglé').toBe(50);
  });

  it('🔴 aucune option « Tous » — ce serait un mensonge', () => {
    // Le serveur plafonne à 500 : mesuré, `limit=1000` rend 500. Annoncer
    // « Tous » sur une recherche à 1000 titres promettrait ce qu'on ne peut
    // pas tenir — le même défaut que le « CD » inventé de #852.
    expect((TAILLES_PAGE as readonly number[]).every((n) => n <= TAILLE_MAX)).toBe(true);
  });
});

describe('#922 — une valeur venue d’ailleurs', () => {
  it('une taille inconnue retombe sur le défaut, jamais sur elle-même', () => {
    for (const v of [42, 1000, -1, 0, 'beaucoup', null, undefined, {}, NaN]) {
      expect(normaliserTaille(v as unknown), `valeur ${String(v)}`).toBe(TAILLE_DEFAUT);
    }
  });

  it('une taille offerte est retenue, en nombre comme en chaîne', () => {
    expect(normaliserTaille(200)).toBe(200);
    expect(normaliserTaille('200')).toBe(200);
  });
});

describe('#922 — le rangement local', () => {
  it('ce qui est retenu est relu', () => {
    expect(retenirTaillePage(200)).toBe(200);
    expect(chargerTaillePage()).toBe(200);
  });

  it('🔴 un stockage qui LÈVE ne casse pas l’écran', () => {
    // Navigation privée, stockage refusé : une préférence d'affichage ne doit
    // jamais empêcher la recherche de s'ouvrir.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('refusé'); });
    expect(chargerTaillePage()).toBe(TAILLE_DEFAUT);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('refusé'); });
    expect(retenirTaillePage(500), 'écrire a levé et la valeur est perdue').toBe(500);
  });

  it('une valeur corrompue dans le stockage ne passe pas', () => {
    localStorage.setItem('tune_taille_page_recherche', '999999');
    expect(chargerTaillePage()).toBe(TAILLE_DEFAUT);
  });
});

describe('#922 — l’écran s’en sert vraiment', () => {
  const lire = async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    return readFileSync(resolve(__dirname, '../../components/v2/StreamingV2.svelte'), 'utf-8');
  };

  it('🔴 la PREMIÈRE page la prend — c’est elle qui rendait « seulement 50 »', async () => {
    const src = await lire();
    expect(src).toContain('api.searchStreaming(svc, needle, taillePage)');
  });

  it('les pages SUIVANTES avancent du même pas', async () => {
    const src = await lire();
    expect(src).toContain('const suivant = rechOffset + taillePage;');
    expect(src).toContain('api.searchStreaming(svc, needle, taillePage, suivant)');
    expect(src, 'le plafond en dur est revenu quelque part').not.toContain('api.SEARCH_PAGE_LIMIT');
  });

  it('le choix est OFFERT, et rangé', async () => {
    const src = await lire();
    expect(src).toContain('retenirTaillePage(');
    expect(src).toContain("$t('v2.stream.pageSize'");
  });

  it('CONTRE-ÉPREUVE : le plafond en dur rendait bien 50 quoi qu’on demande', () => {
    const ancien = (_souhaite: number) => 50;
    expect(ancien(500), 'le témoin ne reproduit pas le plafond').toBe(50);
    expect(normaliserTaille(500), 'le réglage ne rend pas ce qu’on lui demande').toBe(500);
  });
});
