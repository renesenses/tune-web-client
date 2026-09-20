import { describe, it, expect } from 'vitest';
import { favKeyOf, identiteDeFavori, isStreamingFavorite } from '../streamingFavorites';

// FabienM, 0.9.158, fil forum 1862 point 4 : « on peut mettre un titre
// bandcamp en favori mais celui-ci n'est pas conservé ».
//
// La cause n'est pas le refus 501 du service — le cœur d'un objet de service
// est tenu par Tune. C'est la CLÉ : l'identifiant d'une piste Bandcamp est son
// URL de flux, que Bandcamp RESIGNE à chaque lecture de page. Le serveur coupe
// donc requête et fragment (`favorites_identity.rs`) ; sans la même coupe ici,
// le cœur reste éteint sur un favori pourtant conservé.

// Les deux URL mesurées le 20/09/2026 sur « Midnight Show », à 3 s d'écart.
const SIGNEE_A =
  'https://t4.bcbits.com/stream/58db28886c8795a747dc69be6491159c/mp3-128/2639113545?p=0&ts=1789982173&t=a130059f109193afe2e59864b82c20f5f3446c7d&token=1789982173_7285db0763aa47e79bc49785feea7c459b90ec0e';
const SIGNEE_B =
  'https://t4.bcbits.com/stream/58db28886c8795a747dc69be6491159c/mp3-128/2639113545?p=0&ts=1789982176&t=d8bb27b0915e21b4430a9c4eca79f57ac9fb39c7&token=1789982176_edadeaf99874538aee5934700e58a102414dfd8c';
const NUE = 'https://t4.bcbits.com/stream/58db28886c8795a747dc69be6491159c/mp3-128/2639113545';

const piste = (serviceId: string) => ({ itemType: 'track' as const, service: 'bandcamp', serviceId });

describe('identiteDeFavori : le pendant exact de la règle serveur', () => {
  it('deux signatures de la MÊME piste donnent la même identité', () => {
    expect(SIGNEE_A).not.toBe(SIGNEE_B);
    expect(identiteDeFavori(SIGNEE_A)).toBe(identiteDeFavori(SIGNEE_B));
    expect(identiteDeFavori(SIGNEE_A)).toBe(NUE);
  });

  it('deux pistes différentes gardent deux identités', () => {
    const autre =
      'https://t4.bcbits.com/stream/2b7a93eadf73639d40ff53eb25f11703/mp3-128/2031798614?p=0&ts=1789982173';
    expect(identiteDeFavori(SIGNEE_A)).not.toBe(identiteDeFavori(autre));
  });

  it('un autre CDN du même domaine est reconnu', () => {
    expect(identiteDeFavori(`https://t5.bcbits.com/stream/abc/mp3-128/42?ts=1`)).toBe(
      'https://t5.bcbits.com/stream/abc/mp3-128/42',
    );
  });

  it('coupe aussi sur un fragment seul, et au PREMIER séparateur', () => {
    expect(identiteDeFavori(`${NUE}#t=10`)).toBe(NUE);
    expect(identiteDeFavori(`${NUE}#a?b=1`)).toBe(NUE);
  });

  it('🔴 ne touche à rien d’autre : page d’album, pochette, autre service, non-URL', () => {
    const page = 'https://sodablonde.bandcamp.com/album/small-talk?from=search';
    const pochette = 'https://f4.bcbits.com/img/a1234567890_10.jpg?x=1';
    const autreService = 'https://streaming.qobuz.com/file?id=42&sig=abc';
    for (const brut of [page, pochette, autreService, '', '   ', '42', 'bcbits.com/stream/x']) {
      expect(identiteDeFavori(brut), brut).toBe(brut);
    }
  });

  it('🔴 un domaine qui se TERMINE par bcbits.com n’est pas bcbits.com', () => {
    const pirate = 'https://evilbcbits.com/stream/abc/mp3-128/42?ts=1';
    expect(identiteDeFavori(pirate)).toBe(pirate);
  });
});

describe('favKeyOf : le cœur se rallume après une resignature', () => {
  it('le cas de Fabien : coché sous une signature, retrouvé sous la suivante', () => {
    const cleAuMomentDuClic = favKeyOf(piste(SIGNEE_A));
    expect(cleAuMomentDuClic).not.toBeNull();
    const favoris = new Set([cleAuMomentDuClic!]);
    // Rechargement de la page : Bandcamp resigne l'URL.
    expect(isStreamingFavorite(favoris, piste(SIGNEE_B))).toBe(true);
    // Et la clé nue, celle que le serveur range, marche aussi.
    expect(isStreamingFavorite(favoris, piste(NUE))).toBe(true);
  });

  it('contre-épreuve : une autre piste ne s’allume pas pour autant', () => {
    const favoris = new Set([favKeyOf(piste(SIGNEE_A))!]);
    const autre = 'https://t4.bcbits.com/stream/2b7a93eadf73639d40ff53eb25f11703/mp3-128/2031798614?ts=1';
    expect(isStreamingFavorite(favoris, piste(autre))).toBe(false);
  });

  it('contre-épreuve : les autres services gardent leur clé intacte', () => {
    const qobuz = { itemType: 'track' as const, service: 'qobuz', serviceId: '23955539' };
    expect(favKeyOf(qobuz)).toBe(favKeyOf(qobuz));
    expect(favKeyOf(qobuz)).toContain('23955539');
  });

  it('un identifiant vide reste sans clé', () => {
    expect(favKeyOf(piste(''))).toBeNull();
    expect(favKeyOf(piste('   '))).toBeNull();
  });
});
