// @vitest-environment jsdom
//
// tune-server-rust#4954 — « Serveurs multimédia : les pochettes d'un AUTRE
// serveur Tune sont grises ».
//
// L'onglet d'un serveur Tune ne lit pas la DIDL : `LibraryV2 {depot}` lit le
// catalogue par l'API REST distante, et `pochetteDistante` fait de chaque
// condensat une adresse absolue
// `http://<ip-du-serveur-distant>:8888/api/v1/library/artwork/<condensat>`.
//
// Depuis #1360, `artworkUrl` réécrit TOUTE adresse de cette forme vers le
// condensat, demandé au serveur LOCAL : c'est la réparation des lignes
// d'historique écrites en adresse LAN par la .157 et ses aînées. Mais pour un
// autre serveur Tune, la pochette n'existe pas chez nous : 404, tuile grise, et
// le relais de pochettes — qui admet ce cas depuis srv#4977 — n'est jamais
// appelé.
//
// La règle tenue ici :
//   · hôte = notre origine            → condensat local (inchangé) ;
//   · hôte = un dépôt Tune DISTANT    → relais de pochettes ;
//   · tout autre hôte (ancien format) → condensat local, comme #1360.
import { describe, expect, it } from 'vitest';
import { artworkUrl } from '../api';
import { depotDistant, pochetteDistante } from '../tuneRemote';
import type { MediaServer } from '../types';

const CONDENSAT = '3b1f0c9d8e7a6b5c4d3e2f1a0b9c8d7e.jpg';

function serveur(host: string, port: number): MediaServer {
  return { id: `srv-${host}-${port}`, name: 'Tune', host, port, manufacturer: 'Tune', model: 'Tune Server' };
}

describe('#4954 — une pochette de serveur Tune va au bon endroit', () => {
  it('la pochette du serveur LOCAL (notre origine) est réécrite vers le condensat local', () => {
    const d = depotDistant(serveur(window.location.hostname, Number(window.location.port || 80)));
    const src = artworkUrl(pochetteDistante(d, CONDENSAT));
    expect(src).toBe(`/api/v1/library/artwork/${encodeURIComponent(CONDENSAT)}`);
  });

  it('🔴 la pochette d’un AUTRE serveur Tune passe par le relais de pochettes', () => {
    const d = depotDistant(serveur('192.168.1.77', 8888));
    const absolue = pochetteDistante(d, CONDENSAT)!;
    expect(absolue).toBe(`http://192.168.1.77:8888/api/v1/library/artwork/${CONDENSAT}`);
    const src = artworkUrl(absolue);
    expect(
      src,
      'la pochette est demandée au serveur LOCAL par son condensat : il ne l’a pas, 404 et tuile grise',
    ).toBe(`/api/v1/library/artwork/proxy?url=${encodeURIComponent(absolue)}`);
    // Et la même adresse revenue plus tard (lecture en cours, historique) reste
    // relayée tant que le dépôt est connu.
    expect(artworkUrl(`http://192.168.1.77:8888/api/v1/library/artwork/${CONDENSAT}`)).toContain(
      '/library/artwork/proxy?url=',
    );
  });

  it('un ancien format d’adresse ne casse rien', () => {
    // Ligne d'historique .157 : adresse LAN d'un hôte qui n'est aucun dépôt
    // connu — c'est notre serveur à son adresse de l'époque (#1360).
    expect(artworkUrl(`http://192.168.1.18:8888/api/v1/library/artwork/${CONDENSAT}`)).toBe(
      `/api/v1/library/artwork/${encodeURIComponent(CONDENSAT)}`,
    );
    // Condensat nu, chemin relatif, route du relais, CDN : inchangés.
    expect(artworkUrl(CONDENSAT)).toBe(`/api/v1/library/artwork/${encodeURIComponent(CONDENSAT)}`);
    expect(artworkUrl('/api/v1/library/artwork/abc.jpg')).toBe('/api/v1/library/artwork/abc.jpg');
    const relais = 'http://192.168.1.77:8888/api/v1/library/artwork/proxy?url=https%3A%2F%2Fx%2F1.jpg';
    expect(artworkUrl(relais)).toContain('/library/artwork/proxy?url=');
    const cdn = 'https://static.qobuz.com/images/covers/aa/bb/0123_600.jpg';
    expect(artworkUrl(cdn)).toBe(`/api/v1/library/artwork/proxy?url=${encodeURIComponent(cdn)}`);
    expect(artworkUrl('http://pas une url')).toContain('/library/artwork/proxy?url=');
  });
});
