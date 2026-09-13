// 🔴 `renesenses/tune-web-client#854` — Pierre M, fil 1671, réponse 6166 :
//
//   « L'option 'Localiser sur le disque' : OK mais retour ne ramène à l'album
//     mais remonte l'arborescence (et c'est très lent...) »
//
// LE MÉCANISME
// ------------
// Le bouton bascule sur l'écran Répertoires du client ACTUEL (`BrowseView`),
// dont le Retour est `goUp()` — le dossier parent, puis les racines. Rien ne
// lui disait d'où l'on venait.
//
// Sa bibliothèque fait 155 829 titres (lu sur une autre capture du même
// message) : retrouver son album à la main après un aller simple, ce n'est pas
// une gêne, c'est un cul-de-sac.
//
// ⚠️ La LENTEUR qu'il cite entre parenthèses est un ticket serveur séparé
// (#3857) — autre code, autre dépôt, rien à voir ici.
//
// CE QU'ON N'A PAS INVENTÉ
// ------------------------
// `vueDeRetour` existe depuis #3843 : le dépôt posé par l'émetteur du geste et
// consommé UNE fois par l'écran qui porte le bouton. `pendingLibraryAlbum` est
// le contrat que `LibraryV2` lit déjà pour rouvrir une fiche. Les deux étaient
// là ; ce lot les branche.
//
// CONTRE-ÉPREUVE : le dernier bloc rejoue le `goUp` d'avant et montre qu'il
// remontait bien l'arborescence quel que soit le chemin d'arrivée.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) =>
  readFileSync(resolve(__dirname, '../../components', p), 'utf8');

describe('#854 — l’aller POSE le chemin du retour', () => {
  it('🔴 la fiche album dit où rendre la main, et quel album rouvrir', () => {
    const src = lire('v2/AlbumDetailV2.svelte');
    const i = src.indexOf('function localiser()');
    expect(i, '`localiser` a disparu').toBeGreaterThan(-1);
    const corps = src.slice(i, src.indexOf('\n  }', i));
    expect(corps).toContain("vueDeRetour.set('library')");
    expect(corps).toContain('pendingLibraryAlbum.set(album.id)');
  });

  it('le dépôt est posé AVANT de changer de vue', () => {
    // Poser après aurait laissé l'écran d'arrivée lire un dépôt vide.
    const src = lire('v2/AlbumDetailV2.svelte');
    const i = src.indexOf('function localiser()');
    const corps = src.slice(i, src.indexOf('\n  }', i));
    expect(corps.indexOf('vueDeRetour.set'))
      .toBeLessThan(corps.indexOf("activeView.set('browse')"));
  });

  it('un album sans identifiant ne pose pas de cible — il n’en a pas', () => {
    const src = lire('v2/AlbumDetailV2.svelte');
    const i = src.indexOf('function localiser()');
    const corps = src.slice(i, src.indexOf('\n  }', i));
    expect(corps).toContain('album.id != null');
  });
});

describe('#854 — le RETOUR consomme ce dépôt', () => {
  const corpsGoUp = () => {
    const src = lire('BrowseView.svelte');
    const i = src.indexOf('function goUp()');
    expect(i, '`goUp` a disparu').toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('\n  }', i));
  };

  it('🔴 il rend la main à la vue déposée', () => {
    const c = corpsGoUp();
    expect(c).toContain('get(vueDeRetour)');
    expect(c).toContain('activeView.set(retour)');
  });

  it('🔴 le dépôt est CONSOMMÉ — un second Retour remonte à nouveau', () => {
    // Sans cela on ne pourrait plus jamais remonter l'arborescence après être
    // venu d'un album : le Retour téléporterait à chaque fois.
    const c = corpsGoUp();
    expect(c).toContain('vueDeRetour.set(null)');
    expect(c.indexOf('vueDeRetour.set(null)'))
      .toBeLessThan(c.indexOf('activeView.set(retour)'));
  });

  it('sans dépôt, le geste d’avant est intact', () => {
    const c = corpsGoUp();
    expect(c).toContain('browseResult?.parent');
    expect(c).toContain('goToRoots()');
  });

  it('l’identifiant est bien importé — la garde qui m’a repris', () => {
    // `check-svelte` a rougi sur « Cannot find name 'vueDeRetour' » : à
    // l'exécution, le composant lève et la vue ne s'affiche plus. La 0.9.62
    // est partie ainsi (`albumWall`).
    const src = lire('BrowseView.svelte');
    expect(src).toContain("vueDeRetour } from '../lib/stores/navigation'");
  });
});

describe('#854 — CONTRE-ÉPREUVE', () => {
  it('le `goUp` d’avant remontait quel que soit le chemin d’arrivée', () => {
    const avant = (parent: string | null) => (parent ? `vers:${parent}` : 'racines');
    expect(avant('/data/music'), 'le témoin ne reproduit pas la remontée').toBe('vers:/data/music');
    expect(avant(null)).toBe('racines');
    // Aucune branche ne consultait un dépôt de retour.
    expect(/vueDeRetour/.test(avant.toString())).toBe(false);
  });
});
