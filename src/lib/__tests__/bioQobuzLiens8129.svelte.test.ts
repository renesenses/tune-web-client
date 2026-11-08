// @vitest-environment jsdom
//
// Biographies Qobuz cliquables — renesenses/tune-server-rust#8129 (Bertrand,
// 08/11). Sur une fiche Qobuz, le serveur rend `bio_segments` : un lien du
// HTML de Qobuz vers un artiste ou un album Qobuz arrive en
// `lien_service: { service, type, id }` et ouvre la fiche Qobuz de Tune ; les
// autres liens et les noms de la bibliothèque suivent les règles de #7910.
//
// Contre-épreuves : un service inconnu ou un identifiant suspect redevient du
// texte ; la présentation d'album sans segments reste du texte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

const { ouvrirArtisteDepuis } = vi.hoisted(() => ({
  ouvrirArtisteDepuis: vi.fn(async (_a: any, _depuis: any) => {}),
}));
vi.mock('../ouvrirArtisteDepuis', async (orig) => ({ ...(await orig<object>()), ouvrirArtisteDepuis }));

import BioEtTitresPhares from '../../components/v2/BioEtTitresPhares.svelte';
import { segmentsAffichables } from '../library/bioSegments';
import { chargerPresentation } from '../presentationAlbumService';
import { ficheAlbumService } from '../stores/streaming';
import { activeView, vueDeRetour } from '../stores/navigation';
import { locale } from '../i18n';

const BIO = 'Miles Davis joue avec John Coltrane sur Kind of Blue. Bill Evans y est. Voir Wikipédia.';
const SEGMENTS = [
  { texte: 'Miles Davis joue avec ' },
  { texte: 'John Coltrane', lien_service: { service: 'qobuz', type: 'artiste', id: '16422' } },
  { texte: ' sur ' },
  { texte: 'Kind of Blue', lien_service: { service: 'qobuz', type: 'album', id: '0886443853839' } },
  { texte: '. ' },
  { texte: 'Bill Evans', lien: { type: 'artiste', id: 3 } },
  { texte: ' y est. Voir ' },
  { texte: 'Wikipédia', url: 'https://fr.wikipedia.org/wiki/Miles_Davis' },
  { texte: '.' },
];

describe('segmentsAffichables — liens de service (#8129)', () => {
  it('garde les liens vers les fiches Qobuz', () => {
    const s = segmentsAffichables(BIO, SEGMENTS)!;
    expect(s.map((x) => x.texte).join('')).toBe(BIO);
    expect(s[1].lien_service).toEqual({ service: 'qobuz', type: 'artiste', id: '16422' });
    expect(s[3].lien_service).toEqual({ service: 'qobuz', type: 'album', id: '0886443853839' });
    expect(s[5].lien).toEqual({ type: 'artiste', id: 3 });
  });

  it('un service inconnu, un type ou un identifiant suspect redeviennent du texte', () => {
    const bio = 'a b c d';
    const s = segmentsAffichables(bio, [
      { texte: 'a', lien_service: { service: 'evil', type: 'artiste', id: '1' } },
      { texte: ' ' },
      { texte: 'b', lien_service: { service: 'qobuz', type: 'playlist', id: '1' } },
      { texte: ' ' },
      { texte: 'c', lien_service: { service: 'qobuz', type: 'album', id: '../x' } },
      { texte: ' ' },
      { texte: 'd', lien_service: { service: 'qobuz', type: 'album', id: 'ok1' } },
    ])!;
    expect(s.filter((x) => x.lien_service).map((x) => x.texte)).toEqual(['d']);
  });
});

describe('fiche artiste Qobuz — rendu et navigation (#8129)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
    locale.set('fr');
    ouvrirArtisteDepuis.mockClear();
    ficheAlbumService.set(null);
    activeView.set('streamingartist');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function monter() {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(BioEtTitresPhares, { target: cible, props: { titres: [], cle: 1, bio: BIO, segments: SEGMENTS } });
    flushSync();
    return c;
  }

  it('les liens Qobuz sont des boutons, sans aucun HTML injecté', () => {
    const c = monter();
    const p = document.querySelector('.bio')!;
    expect(p.textContent).toBe(BIO);
    const services = [...p.querySelectorAll<HTMLButtonElement>('button[data-lien-service="qobuz"]')];
    expect(services.map((b) => [b.textContent, b.dataset.lienBio])).toEqual([
      ['John Coltrane', 'artiste'],
      ['Kind of Blue', 'album'],
    ]);
    expect(p.querySelectorAll('a')).toHaveLength(1);
    expect(p.querySelector('em, script, img')).toBeNull();
    unmount(c);
  });

  it('un artiste Qobuz ouvre sa fiche Qobuz, un album Qobuz sa fiche album Qobuz', async () => {
    const c = monter();
    const [artiste, album] = [...document.querySelectorAll<HTMLButtonElement>('button[data-lien-service]')];
    artiste.click();
    await vi.waitFor(() => expect(ouvrirArtisteDepuis).toHaveBeenCalledTimes(1));
    expect(ouvrirArtisteDepuis.mock.calls[0][0]).toEqual({ source: 'qobuz', source_id: '16422', name: 'John Coltrane' });
    expect(ouvrirArtisteDepuis.mock.calls[0][1]).toBe('streamingartist');

    album.click();
    await vi.waitFor(() => expect(get(ficheAlbumService)).not.toBeNull());
    expect(get(ficheAlbumService)).toMatchObject({ service: 'qobuz', id: '0886443853839', titre: 'Kind of Blue' });
    expect(get(activeView)).toBe('streamingalbum');
    expect(get(vueDeRetour)).toBe('streamingartist');
    unmount(c);
  });
});

describe('présentation d\'album Qobuz (#8129)', () => {
  it('les segments du serveur accompagnent le texte', async () => {
    const r = await chargerPresentation({ service: 'qobuz', albumId: '1' }, async () => ({
      description: BIO,
      language: 'fr',
      bio_segments: SEGMENTS,
    }));
    expect(r).toMatchObject({ etat: 'texte', texte: BIO });
    const s = segmentsAffichables((r as any).texte, (r as any).segments)!;
    expect(s.filter((x) => x.lien_service)).toHaveLength(2);
  });

  it('sans segments (serveur ancien), le texte seul', async () => {
    const r = await chargerPresentation({ service: 'qobuz', albumId: '1' }, async () => ({ description: BIO }));
    expect(segmentsAffichables((r as any).texte, (r as any).segments)).toBeNull();
  });
});
