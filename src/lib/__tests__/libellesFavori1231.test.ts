// Le critère « favori » dit enfin ce qu'il fait — #1231.
//
// Bertrand, 19/09/2026 : « on a le critère favori comme sélecteur qu'il faut
// améliorer ou simplifier en oui ou non ».
//
// En le lisant, il ne s'agissait pas d'un sélecteur redondant : les trois
// valeurs portent SIX sens, trois par objet édité (`smart_refs.rs`) —
//
//   collection : contient une piste favorite / l'album est favori / l'artiste
//                de l'album est favori
//   playlist   : la piste est favorite / son album est favori / son artiste
//                est favori
//
// Un oui/non aurait gardé « l'objet est favori » et perdu les quatre autres,
// dont « les albums dont j'aime au moins un morceau ». L'écran affichait
// « Favori » puis « Piste / Album / Artiste » : le mécanisme était bon, ses
// libellés ne disaient rien. Arbitrage de Bertrand : renommer, ne rien retirer.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const EDITEURS = [
  ['src/components/v2/CollectionSmartEditeurV2.svelte', 'Col'],
  ['src/components/v2/PlaylistSmartEditeurV2.svelte', 'Pl'],
] as const;

describe('les libellés du critère « favori »', () => {
  it('chaque éditeur emploie SES libellés, pas ceux de l’autre', () => {
    for (const [f, prefixe] of EDITEURS) {
      const src = lire(f);
      for (const quoi of ['Track', 'Album', 'Artist']) {
        expect(src, `${f} doit porter fav${prefixe}${quoi}`).toContain(
          `v2.smart.fav${prefixe}${quoi}`,
        );
      }
      const autre = prefixe === 'Col' ? 'Pl' : 'Col';
      expect(src, `${f} ne doit pas porter les libellés de l'autre objet`).not.toContain(
        `v2.smart.fav${autre}`,
      );
    }
  });

  it('🔴 les trois valeurs restent — on renomme, on ne retire pas', () => {
    // Un oui/non aurait supprimé quatre des six sens. Les valeurs envoyées au
    // serveur (`track`, `album`, `artist`) ne bougent pas.
    for (const [f] of EDITEURS) {
      const src = lire(f);
      for (const v of ['track', 'album', 'artist']) {
        expect(src, `${f} garde la valeur ${v}`).toContain(`<option value="${v}">`);
      }
    }
  });

  it('les six libellés existent dans les onze langues', () => {
    const cles = ['favColTrack', 'favColAlbum', 'favColArtist', 'favPlTrack', 'favPlAlbum', 'favPlArtist'];
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of cles) expect(src, `${l} : v2.smart.${c}`).toContain(`"v2.smart.${c}":`);
    }
  });

  it('🔴 « contient une piste favorite » ne se confond pas avec « album favori »', () => {
    // C'est la distinction que le libellé « Piste » effaçait, et la plus utile
    // des six : les albums dont j'aime au moins un morceau.
    const fr = lire('src/lib/locales/fr.ts');
    const ligne = (c: string) =>
      fr.split('\n').find((x) => x.includes(`"v2.smart.${c}":`)) ?? '';
    expect(ligne('favColTrack').toLowerCase()).toContain('contient');
    expect(ligne('favColAlbum').toLowerCase()).not.toContain('contient');
    expect(ligne('favColTrack')).not.toEqual(ligne('favColAlbum'));
  });
});
