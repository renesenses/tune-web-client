import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  chargerPresentation,
  presentationAlbumDeServiceDe,
  servicesPresentationRefuses,
} from './presentationAlbumService';

describe('#6480 — présentation d’un album de service', () => {
  beforeEach(() => servicesPresentationRefuses.set(new Set()));

  it('le bouton ne s’offre que pour un album Qobuz désigné', () => {
    expect(presentationAlbumDeServiceDe('qobuz', '5099749522428')).toEqual({ service: 'qobuz', albumId: '5099749522428' });
    expect(presentationAlbumDeServiceDe('qobuz', '')).toBeNull();
    expect(presentationAlbumDeServiceDe('tidal', '42')).toBeNull();
    expect(presentationAlbumDeServiceDe(null, '42')).toBeNull();
  });

  it('le texte du serveur est rendu tel quel, avec sa langue', async () => {
    const r = await chargerPresentation({ service: 'qobuz', albumId: '1' }, async () => ({
      description: 'Premier paragraphe.\n\nSecond.',
      language: 'fr',
    }));
    expect(r).toEqual({ etat: 'texte', texte: 'Premier paragraphe.\n\nSecond.', langue: 'fr' });
  });

  it('null ou texte vide : rien à lire', async () => {
    expect(await chargerPresentation({ service: 'qobuz', albumId: '1' }, async () => null)).toEqual({ etat: 'vide' });
    expect(await chargerPresentation({ service: 'qobuz', albumId: '1' }, async () => ({ description: '  ' }))).toEqual({ etat: 'vide' });
  });

  it('un 501 retire le bouton pour le service, une panne non', async () => {
    const refus = Object.assign(new Error('501'), { status: 501 });
    expect(await chargerPresentation({ service: 'qobuz', albumId: '1' }, async () => { throw refus; })).toEqual({ etat: 'refus' });
    expect(get(servicesPresentationRefuses).has('qobuz')).toBe(true);
    expect(presentationAlbumDeServiceDe('qobuz', '2')).toBeNull();

    servicesPresentationRefuses.set(new Set());
    const panne = Object.assign(new Error('502'), { status: 502 });
    expect(await chargerPresentation({ service: 'qobuz', albumId: '1' }, async () => { throw panne; })).toEqual({ etat: 'erreur' });
    expect(get(servicesPresentationRefuses).has('qobuz')).toBe(false);
  });
});
