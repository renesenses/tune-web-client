/**
 * #5632 — fil 2090 : un titre Deezer joué sur la zone « Cet ordinateur »
 * avance sans aucun son.
 *
 * Le serveur rend pour Deezer l'adresse de SON mandataire,
 * `http://{server_ip}:{port}/deezer-proxy/deezer/<id>.flac`. Sous Docker,
 * `server_ip` est l'adresse du réseau du conteneur : le navigateur ne la joint
 * pas. `sourceDuLecteur` ne ramenait en relatif que `/stream/<id>` ; l'adresse
 * du mandataire gardait donc son hôte injoignable, et l'onglet ne demandait
 * jamais le flux (aucune requête au mandataire pour ce titre dans le journal).
 */
import { describe, it, expect } from 'vitest';
import { sourceDuLecteur } from '../urlDeFluxNavigateur';

const ORIGINE_PAGE = 'http://nas.local:8888';
// L'adresse du réseau Docker du conteneur, telle que le serveur l'annonce.
const HOTE_DU_CONTENEUR = ['172', '18', '0', '2'].join('.');

describe('#5632 — le mandataire Deezer part en relatif', () => {
  it('🔴 /deezer-proxy/deezer/<id>.flac rejoint l’hôte de la page', () => {
    const rendue = `http://${HOTE_DU_CONTENEUR}:8888/deezer-proxy/deezer/92720184.flac`;
    expect(sourceDuLecteur(rendue, ORIGINE_PAGE)).toBe('/deezer-proxy/deezer/92720184.flac');
  });

  it('la forme courte /deezer-proxy/<id>.mp3 aussi, chaîne de requête comprise', () => {
    const rendue = `http://${HOTE_DU_CONTENEUR}:8888/deezer-proxy/92720184.mp3?q=1`;
    expect(sourceDuLecteur(rendue, ORIGINE_PAGE)).toBe('/deezer-proxy/92720184.mp3?q=1');
  });

  it('sans origine connue, la règle vaut encore', () => {
    expect(
      sourceDuLecteur(`http://${HOTE_DU_CONTENEUR}:8888/deezer-proxy/deezer/1.flac`),
    ).toBe('/deezer-proxy/deezer/1.flac');
  });

  it('un chemin qui n’est pas une route du mandataire garde son hôte', () => {
    // Trois segments après /deezer-proxy/ : aucune route de Tune ne les sert.
    const tierce = 'https://cdn.example.org/deezer-proxy/a/b/c.flac';
    expect(sourceDuLecteur(tierce, ORIGINE_PAGE)).toBe(tierce);
    const autre = 'https://cdn.example.org/deezer-proxy-x/1.flac';
    expect(sourceDuLecteur(autre, ORIGINE_PAGE)).toBe(autre);
  });
});
