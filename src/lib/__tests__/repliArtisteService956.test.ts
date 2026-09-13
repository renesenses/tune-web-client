/**
 * #956 — « l’interface tourne en boucle et me renvoie simplement sur la grille
 * des résultats de recherche du début » (Sandro, fil 1769, 12/09/2026, v0.9.147).
 *
 * Le repli vers la recherche était DÉLIBÉRÉ et MUET. Cette garde tient les
 * deux moitiés du correctif :
 *
 *  1. il parle, et
 *  2. il distingue « ton service ne répond pas » de « cet artiste n’existe pas
 *     chez lui » — deux causes sans rien en commun, qui produisaient le même
 *     écran silencieux.
 *
 * 🔴 Ce qu’elle NE prouve PAS : que le cas de Sandro soit l’une ou l’autre.
 * Sur la .18 en v0.9.147, `GET /search?q=Leprous&limit=5&sources=qobuz` rend
 * l’artiste 610403 et l’appariement réussit. Son cas ne se reproduit pas ; ce
 * correctif le rend DIAGNOSTICABLE, il ne le résout pas.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resoudreArtisteDeService, choisirArtiste, messageRepli, CLES_REPLI,
} from '../repliArtisteService';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];
const LEPROUS = { service: 'qobuz', nom: 'Leprous' };

describe('#956 — résoudre un artiste de service, ou dire pourquoi on n’a pas pu', () => {
  it('le cas qui MARCHE : la mesure du 12/09 sur la .18', async () => {
    const chercher = vi.fn().mockResolvedValue([
      { id: '610403', name: 'Leprous' },
      { id: '999', name: 'Leprous Tribute' },
    ]);
    const issue = await resoudreArtisteDeService(LEPROUS, chercher);
    expect(issue).toEqual({ type: 'fiche', id: '610403' });
    expect(chercher).toHaveBeenCalledWith('Leprous', 'qobuz');
  });

  it('le nom EXACT prime sur le premier rendu', () => {
    expect(choisirArtiste(
      [{ id: 'a', name: 'Leprous Tribute' }, { id: 'b', name: 'leprous' }], 'Leprous',
    )).toBe('b');
  });

  it('à défaut d’exact, le premier — le service classe par pertinence', () => {
    expect(choisirArtiste([{ id: 'a', name: '-M-' }], 'M')).toBe('a');
  });

  /**
   * 🔴 LA BRANCHE DE SANDRO, la seule qui peut produire son symptôme sans
   * qu’aucune mesure ne l’explique. Le `catch` d’avant l’avalait.
   */
  it('la recherche qui LÈVE rend « injoignable », et garde l’erreur', async () => {
    const boum = new Error('401 session expirée');
    const issue = await resoudreArtisteDeService(LEPROUS, () => Promise.reject(boum));
    expect(issue.type).toBe('repli');
    expect(issue).toMatchObject({ raison: 'injoignable', erreur: boum });
  });

  it('une réponse SANS artiste rend « introuvable », pas « injoignable »', async () => {
    const issue = await resoudreArtisteDeService(LEPROUS, async () => []);
    expect(issue).toEqual({ type: 'repli', raison: 'introuvable' });
  });

  it('un candidat sans identifiant est introuvable, pas une fiche vide', async () => {
    const issue = await resoudreArtisteDeService(LEPROUS, async () => [{ id: '', name: 'Leprous' }]);
    expect(issue).toEqual({ type: 'repli', raison: 'introuvable' });
  });

  it('un nom vide n’interroge PAS le service — l’accuser serait un mensonge', async () => {
    const chercher = vi.fn();
    const issue = await resoudreArtisteDeService({ service: 'qobuz', nom: '  ' }, chercher);
    expect(issue).toEqual({ type: 'repli', raison: 'introuvable' });
    expect(chercher).not.toHaveBeenCalled();
  });

  it('les deux raisons ont deux messages DIFFÉRENTS', () => {
    expect(CLES_REPLI.introuvable).not.toBe(CLES_REPLI.injoignable);
  });

  it('le message nomme l’artiste ET le service', () => {
    const dico: Record<string, string> = {
      'v2.nav.artisteIntrouvable': '« {nom} » est introuvable chez {service}.',
    };
    const m = messageRepli('introuvable', LEPROUS, (k) => dico[k] ?? k);
    expect(m).toContain('Leprous');
    expect(m).toContain('qobuz');
    expect(m).not.toContain('{');
  });

  it('les deux clés existent dans les onze langues, avec leurs deux marques', () => {
    for (const l of LANGUES) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const cle of Object.values(CLES_REPLI)) {
        const ligne = src.split('\n').find((x) => x.includes(`"${cle}"`));
        expect(ligne, `${cle} manque en ${l}`).toBeTruthy();
        expect(ligne, `${cle} sans {nom} en ${l}`).toContain('{nom}');
        expect(ligne, `${cle} sans {service} en ${l}`).toContain('{service}');
      }
    }
  });

  /**
   * Sans ces trois lignes la coquille repartirait en silence : le module
   * saurait pourquoi, et personne ne le saurait.
   */
  it('ShellV2 utilise le module, PARLE, et trace la branche muette', () => {
    const src = lire('src/components/v2/ShellV2.svelte');
    expect(src).toContain('resoudreArtisteDeService');
    expect(src).toMatch(/notifications\.info\(messageRepli\(/);
    expect(src).toMatch(/issue\.raison === 'injoignable'[\s\S]{0,200}console\.warn/);
  });

  it('elle ne se contente plus du `catch` silencieux d’avant', () => {
    const src = lire('src/components/v2/ShellV2.svelte');
    expect(src).not.toContain("catch { /* le repli ci-dessous s'en charge */ }");
  });
});
