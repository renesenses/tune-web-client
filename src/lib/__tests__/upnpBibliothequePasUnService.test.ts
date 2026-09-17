// Bertrand, .18, 17/09/2026 : un album UPnP ouvert depuis la Recherche affiche
// « unknown service: upnp » et « 0 titre ». Forme mesurée de `/search` :
//   {"id": 4399, "source": "upnp", "source_id": "uuid:258FC2D5-…|5cf94a9195326ae5"}
import { describe, expect, it } from 'vitest';
import { estDeBibliotheque, estSourceDeBibliotheque } from '../provenanceBibliotheque';
import { cleDetailAlbum } from '../cleDetailAlbum';
import { corpsDeLecture, estPisteLocale } from '../pisteFile';

const albumUpnp = { id: 4399, source: 'upnp', source_id: 'uuid:258FC2D5-E2C3-B734-0-123456789abc|5cf94a9195326ae5' };

describe('upnp est une provenance de BIBLIOTHÈQUE, pas un service', () => {
  it('les sources de bibliothèque', () => {
    for (const s of [null, undefined, '', 'local', 'upnp', 'UPnP', 'upnp:uuid:1']) expect(estSourceDeBibliotheque(s as any), String(s)).toBe(true);
    for (const s of ['qobuz', 'tidal', 'bandcamp', 'youtube']) expect(estSourceDeBibliotheque(s), s).toBe(false);
  });

  it('un objet de bibliothèque a un id ; sans id, même local, il n’en est pas un', () => {
    expect(estDeBibliotheque(albumUpnp)).toBe(true);
    expect(estDeBibliotheque({ id: null, source: 'upnp' })).toBe(false);
    expect(estDeBibliotheque({ id: 12 })).toBe(true);
    expect(estDeBibliotheque({ id: null, source: 'qobuz' })).toBe(false);
  });

  it('la clé d’historique d’un album UPnP est celle d’un album de bibliothèque', () => {
    expect(cleDetailAlbum(albumUpnp)).toBe('album:4399');
    expect(cleDetailAlbum({ source: 'qobuz', source_id: 'ji81keobq0v2b' })).toBe('album:qobuz:ji81keobq0v2b');
  });

  it('une piste UPnP de la bibliothèque se joue par son identifiant', () => {
    const piste = { id: 46921, source: 'upnp', source_id: 'uuid:258FC2D5|0e24f178c972322e', title: 'Pretty Fly' } as any;
    expect(estPisteLocale(piste)).toBe(true);
    expect(corpsDeLecture(piste)).toMatchObject({ track_id: 46921 });
  });
});
