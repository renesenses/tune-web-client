/**
 * #859 — FabienM, fils 1749 puis 1774 : « Mes playlists » sur Bandcamp
 * affichait « Ce widget n'a pas pu être chargé. (502 Bad Gateway) », puis
 * « (501 Not Implemented) » une fois le serveur corrigé (.147). Un code HTTP
 * brut, en rouge, avec un bouton « réessayer » — pour un service qui,
 * simplement, ne propose pas de playlists de compte.
 *
 * Un 501 est une RÉPONSE, pas une panne : la bande le dit en clair.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dictionnaire } from './onzeDictionnaires';

const src = readFileSync(resolve(process.cwd(), 'src/components/v2/PageWidgets.svelte'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('#859 — un 501 n’est pas un échec de widget', () => {
  it('🔴 le 501 est reconnu AVANT le repli « échec », sur le statut porté par l’erreur', () => {
    const i = src.indexOf("if (err?.status === 501) { majEtat(id, { phase: 'non-propose' }); return; }");
    const j = src.indexOf("phase: 'echec',");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
  it('🔴 la bande dit que le service ne propose pas la rubrique — sans rouge ni « réessayer »', () => {
    const i = src.indexOf("{:else if et.phase === 'non-propose'}");
    const bloc = src.slice(i, src.indexOf('{:else if', i + 10));
    expect(i).toBeGreaterThan(-1);
    expect(bloc).toContain("$t('v2.home.widgetUnsupported' as any)");
    expect(bloc).not.toContain('err');
    expect(bloc).not.toContain('relancerWidget');
  });
  it('le libellé existe dans les onze langues', async () => {
    for (const code of ['fr', 'en', 'de', 'es', 'it', 'ro', 'sv', 'hu', 'ja', 'ko', 'zh']) {
      const dico = dictionnaire(code);
      expect(dico['v2.home.widgetUnsupported'], code).toBeTruthy();
    }
  });
});
