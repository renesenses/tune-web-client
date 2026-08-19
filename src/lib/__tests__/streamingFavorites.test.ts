/**
 * Favoris d'objets de service — chemin unique (forum #1478, Didier).
 *
 * Les cas couverts sont ceux qui produisaient une INCOHÉRENCE VISIBLE entre le
 * cœur de la barre de lecture et celui de la liste des pistes, pas de simples
 * variations d'entrée.
 */
import { describe, it, expect } from 'vitest';
import { favKeyOf, isStreamingFavorite, serviceFavType } from '../streamingFavorites';
import { streamingFavKey } from '../stores/profile';

const piste = { itemType: 'track' as const, service: 'qobuz', serviceId: '12345' };
const album = { itemType: 'album' as const, service: 'qobuz', serviceId: '999' };

describe('favKeyOf', () => {
  it('produit la même clé que le magasin', () => {
    expect(favKeyOf(piste)).toBe(streamingFavKey('track', 'qobuz', '12345'));
  });

  /** Une piste et un album peuvent porter le même identifiant chez un service :
   *  les confondre cocherait l'un en favorisant l'autre. */
  it('sépare les types pour un même identifiant', () => {
    const a = favKeyOf({ itemType: 'track', service: 'qobuz', serviceId: '42' });
    const b = favKeyOf({ itemType: 'album', service: 'qobuz', serviceId: '42' });
    expect(a).not.toBe(b);
  });

  it('sépare les services pour un même identifiant', () => {
    const a = favKeyOf({ itemType: 'track', service: 'qobuz', serviceId: '42' });
    const b = favKeyOf({ itemType: 'track', service: 'tidal', serviceId: '42' });
    expect(a).not.toBe(b);
  });

  /** ⚠️ Le piège : un identifiant vide donnerait UNE clé partagée par tous les
   *  objets sans identifiant du service — un seul favori les cocherait tous. */
  it('refuse un identifiant ou un service vide', () => {
    expect(favKeyOf({ itemType: 'track', service: 'qobuz', serviceId: '' })).toBeNull();
    expect(favKeyOf({ itemType: 'track', service: 'qobuz', serviceId: '   ' })).toBeNull();
    expect(favKeyOf({ itemType: 'track', service: '', serviceId: '42' })).toBeNull();
    expect(favKeyOf(null)).toBeNull();
    expect(favKeyOf(undefined)).toBeNull();
  });
});

describe('isStreamingFavorite', () => {
  it('reconnaît un objet présent dans le jeu de clés', () => {
    const keys = new Set([favKeyOf(piste)!]);
    expect(isStreamingFavorite(keys, piste)).toBe(true);
  });

  /** C'est exactement le symptôme de Didier : le même objet doit donner la même
   *  réponse quel que soit l'écran qui pose la question. */
  it('donne la même réponse pour la même piste vue de deux endroits', () => {
    const keys = new Set([favKeyOf(piste)!]);
    const vueDepuisLaListe = { itemType: 'track' as const, service: 'qobuz', serviceId: '12345' };
    const vueDepuisLaBarre = {
      itemType: 'track' as const, service: 'qobuz', serviceId: '12345',
      title: 'un titre', artist: 'un artiste', coverUrl: 'http://x/y.jpg',
    };
    expect(isStreamingFavorite(keys, vueDepuisLaListe)).toBe(true);
    expect(isStreamingFavorite(keys, vueDepuisLaBarre)).toBe(true);
  });

  it('ne coche pas un album parce que sa piste est en favori', () => {
    const keys = new Set([favKeyOf(piste)!]);
    expect(isStreamingFavorite(keys, album)).toBe(false);
  });

  it('ne coche rien sans identifiant', () => {
    const keys = new Set([favKeyOf(piste)!]);
    expect(isStreamingFavorite(keys, { itemType: 'track', service: 'qobuz', serviceId: '' })).toBe(false);
    expect(isStreamingFavorite(keys, null)).toBe(false);
  });
});

describe('serviceFavType', () => {
  /** L'API du service attend le pluriel là où le nôtre emploie le singulier. */
  it('met au pluriel pour l’API du service', () => {
    expect(serviceFavType('track')).toBe('tracks');
    expect(serviceFavType('album')).toBe('albums');
    expect(serviceFavType('artist')).toBe('artists');
  });
});
