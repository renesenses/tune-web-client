import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 Une playlist de service doit S'OUVRIR, pas se lancer.
 *
 * Bertrand, 13/09/2026, écran `#streaming` : « Impossible d'ouvrir une
 * playlist Qobuz ni en cliquant sur la cover ni sur le titre. »
 *
 * Le serveur répondait parfaitement — mesuré le même jour, `/streaming/qobuz/
 * playlists`, `…/{id}` et `…/{id}/tracks` rendaient tous les trois 200. Le
 * défaut tenait en une ligne de `ouvrirFiche` :
 *
 *     if (type !== 'album' || !sid || !svc || svc === BANDCAMP) return null;
 *
 * Elle ne connaissait que l'album. Pour une playlist elle rendait `null`, et
 * le gabarit `tile` retombe alors sur `ouvre ?? onPlay` — DEUX fois, pour la
 * pochette et pour le titre. Les deux gestes lançaient donc la lecture au lieu
 * d'ouvrir : sans erreur, et sans rien à l'écran quand la lecture ne prenait
 * pas.
 *
 * Ce repli `?? onPlay` est VOULU pour une piste, qui n'a pas de fiche — on ne
 * peut donc pas le supprimer. Ce témoin garde l'autre moitié : que la playlist,
 * elle, ait bien une fiche à ouvrir, de sorte que le repli ne la concerne
 * jamais.
 */
const ecran = readFileSync(
  resolve(__dirname, '../../components/v2/StreamingV2.svelte'),
  'utf-8',
);

/** Le corps de `ouvrirFiche`, seul décideur de « y a-t-il une fiche ? ». */
const ouvrirFiche = (() => {
  const d = ecran.indexOf('function ouvrirFiche(');
  const f = ecran.indexOf('\n  }', d);
  expect(d).toBeGreaterThanOrEqual(0);
  expect(f).toBeGreaterThan(d);
  return ecran.slice(d, f);
})();

describe('StreamingV2 — ouvrir une playlist de service', () => {
  it('ouvre une fiche pour une playlist, pas seulement pour un album', () => {
    expect(ouvrirFiche).toMatch(/type === 'playlist'/);
    expect(ouvrirFiche).toMatch(/fichePlaylist\s*=/);
  });

  it("traite la playlist AVANT la garde qui ne laisse passer que l'album", () => {
    // L'ordre est tout le défaut : la garde `type !== 'album' … return null`
    // court-circuite tout ce qui la suit. Un correctif placé après elle serait
    // du code mort, et ce témoin resterait vert sans rien garder.
    const posPlaylist = ouvrirFiche.indexOf("type === 'playlist'");
    const posGarde = ouvrirFiche.indexOf("type !== 'album'");
    expect(posPlaylist).toBeGreaterThanOrEqual(0);
    expect(posGarde).toBeGreaterThan(posPlaylist);
  });

  it('laisse le repli vers la lecture aux seules pistes', () => {
    // Contre-épreuve de portée : `ouvre ?? onPlay` doit RESTER — c'est lui qui
    // donne un geste au titre d'une piste, qui n'a pas de fiche. Le supprimer
    // « corrigerait » la playlist en cassant la piste.
    expect(ecran).toContain('onOuvrir={ouvre ?? onPlay}');
    expect(ecran).toMatch(/onclick=\{ouvre \?\? onPlay\}/);
  });

  it('rend toutes les listes de playlists ouvrables par le même chemin', () => {
    // « Mon <service> » passait déjà son propre `ouvrir` en quatrième
    // argument ; la recherche et l'éditorial n'avaient rien. Corriger
    // `ouvrirFiche` répare ces listes SANS toucher à leur appel — c'est
    // précisément ce qui rend la correction sûre, et ce qu'on garde ici.
    // Une ligne par tuile : `[^)]*` ne convient pas, l'appel contient déjà
    // des parenthèses (`playPlaylist(p)`) avant le type. Mesuré : la regex
    // gourmande rendait 0 sur un fichier sain — la contre-épreuve l'a montré
    // en faisant échouer ce témoin AVANT tout sabotage.
    const tuiles = ecran
      .split('\n')
      .filter((l) => l.includes('@render tile(') && l.includes("'playlist'"));
    expect(tuiles.length).toBeGreaterThanOrEqual(2);
  });
});
