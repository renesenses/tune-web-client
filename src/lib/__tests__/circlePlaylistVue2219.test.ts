// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  majorite, pastilleVisible, contributeurUnique, dureeTotaleMs, pochetteDuMorceau, mosaique,
  corpsDeFileMorceau, designationEnLecture, idsJouables, personnes, initiale, jouable,
} from '../circlePlaylistVue';
import { etatResolution, corpsDeLecturePlaylist, codeT5, type EtatResolution, type MorceauCercle } from '../circlePlaylists';
import { albumContact, pochetteAlbumContact } from '../circle';
import { artworkUrl } from '../api';

/**
 * web#2219 (go de Bertrand du 19/10/2026, rc7) — la vue d'une playlist de
 * cercle, rangée : ce que l'écran dit une fois en tête plutôt qu'à chaque
 * ligne, et ce qu'il envoie pour jouer ou enfiler UN morceau.
 */

const m = (item_id: string, o: Partial<MorceauCercle> = {}): MorceauCercle => ({
  item_id, title: `T ${item_id}`, artist_name: 'A', album_title: 'B', duration_ms: 60_000,
  added_by: { nom: 'Élise' }, mine: false, added_at: null, ...o,
});
const res = (o: Record<string, EtatResolution>) => new Map(Object.entries(o));
const qobuz = (sid: string, extra: object = {}): EtatResolution => etatResolution({ status: 'matched', source: 'qobuz', source_id: sid, ...extra })!;

describe('la résolution, lue en liste blanche', () => {
  it('un titre de service garde de quoi l\'enfiler et SA pochette', () => {
    expect(etatResolution({
      status: 'matched', source: 'qobuz', source_id: '123', title: 'So What', artist_name: 'Miles Davis',
      album_title: 'Kind of Blue', duration_ms: 562000, cover_url: 'https://static.qobuz.com/x.jpg', path: '/Users/x',
    })).toEqual({
      etat: 'service', service: 'qobuz',
      titre: { source_id: '123', title: 'So What', artist_name: 'Miles Davis', album_title: 'Kind of Blue', duration_ms: 562000, cover_url: 'https://static.qobuz.com/x.jpg' },
    });
  });

  it('une piste de ma bibliothèque : son `track_id` et son album, jamais la colonne `source_id`', () => {
    expect(etatResolution({ status: 'matched', source: 'local', source_id: '/Users/moi/a.flac', track_id: 7, album_id: 3 }))
      .toEqual({ etat: 'bibliotheque', piste: { track_id: 7, album_id: 3 } });
  });

  it('une pochette qui n\'est pas une adresse web ne passe pas', () => {
    const e = etatResolution({ status: 'matched', source: 'tidal', source_id: '9', cover_url: 'ftp://exemple.org/a.jpg' });
    expect(e).toEqual({ etat: 'service', service: 'tidal', titre: { source_id: '9' } });
  });
});

describe('la pastille « Jouable via X » dédupliquée', () => {
  const items = [m('1'), m('2'), m('3'), m('4')];

  it('la majorité nette est résumée, ses lignes se taisent, les autres parlent', () => {
    const r = res({ 1: qobuz('a'), 2: qobuz('b'), 3: qobuz('c'), 4: { etat: 'bibliotheque' } });
    const maj = majorite(items, r)!;
    expect(maj).toMatchObject({ sorte: 'service:qobuz', n: 3 });
    expect(pastilleVisible(r.get('1')!, maj)).toBe(false);
    expect(pastilleVisible(r.get('4')!, maj)).toBe(true);
  });

  it('l\'introuvable n\'est jamais la majorité, ni jamais tu', () => {
    const r = res({ 1: { etat: 'introuvable' }, 2: { etat: 'introuvable' }, 3: { etat: 'introuvable' }, 4: qobuz('d') });
    expect(majorite(items, r)).toBeNull();
    expect(pastilleVisible({ etat: 'introuvable' }, { sorte: 'service:qobuz', etat: qobuz('x'), n: 5 })).toBe(true);
  });

  it('égalité ou un seul morceau : pas de majorité, chaque ligne garde sa pastille', () => {
    expect(majorite(items, res({ 1: qobuz('a'), 2: qobuz('b'), 3: { etat: 'bibliotheque' }, 4: { etat: 'bibliotheque' } }))).toBeNull();
    expect(majorite([m('1')], res({ 1: qobuz('a') }))).toBeNull();
  });

  it('deux services différents ne se confondent pas', () => {
    const tidal = etatResolution({ status: 'matched', source: 'tidal', source_id: 't' })!;
    const maj = majorite(items, res({ 1: qobuz('a'), 2: qobuz('b'), 3: tidal }))!;
    expect(pastilleVisible(tidal, maj)).toBe(true);
  });
});

describe('« ajouté par » une seule fois', () => {
  it('un seul contributeur : il est rendu pour l\'en-tête', () => {
    expect(contributeurUnique([m('1'), m('2')])?.added_by).toEqual({ nom: 'Élise' });
    expect(contributeurUnique([m('1', { mine: true }), m('2', { mine: true })])?.mine).toBe(true);
  });
  it('plusieurs contributeurs (ou moi + un autre) : `null`, chaque ligne le dit', () => {
    expect(contributeurUnique([m('1'), m('2', { added_by: { nom: 'Paul' } })])).toBeNull();
    expect(contributeurUnique([m('1'), m('2', { mine: true })])).toBeNull();
    expect(contributeurUnique([m('1'), m('2', { added_by: null })])).toBeNull();
    expect(contributeurUnique([])).toBeNull();
  });
});

describe('durée totale', () => {
  it('somme des durées connues', () => {
    expect(dureeTotaleMs([m('1', { duration_ms: 562000 }), m('2', { duration_ms: null }), m('3', { duration_ms: 337000 })])).toBe(899000);
  });
});

describe('pochettes', () => {
  it('par la piste de MA bibliothèque (album) ou par MON service ; rien pour un introuvable', () => {
    expect(pochetteDuMorceau({ etat: 'bibliotheque', piste: { track_id: 1, album_id: 3 } })).toEqual({ coverPath: null, albumId: 3 });
    expect(pochetteDuMorceau(qobuz('a', { cover_url: 'https://static.qobuz.com/a.jpg' }))).toEqual({ coverPath: 'https://static.qobuz.com/a.jpg', albumId: null });
    expect(pochetteDuMorceau({ etat: 'introuvable' })).toBeNull();
    expect(pochetteDuMorceau(null)).toBeNull();
  });

  it('la mosaïque : quatre pochettes DISTINCTES au plus, dans l\'ordre', () => {
    const r = res({
      1: qobuz('a', { cover_url: 'https://x/1.jpg' }), 2: qobuz('b', { cover_url: 'https://x/1.jpg' }),
      3: { etat: 'bibliotheque', piste: { track_id: 5, album_id: 9 } }, 4: qobuz('d', { cover_url: 'https://x/4.jpg' }),
    });
    expect(mosaique([m('1'), m('2'), m('3'), m('4')], r).map((p) => p.coverPath ?? p.albumId)).toEqual(['https://x/1.jpg', 9, 'https://x/4.jpg']);
  });

  it('un titre de service passe par le relais de NOTRE serveur', () => {
    expect(artworkUrl('https://static.qobuz.com/a.jpg')).toBe(`/api/v1/library/artwork/proxy?url=${encodeURIComponent('https://static.qobuz.com/a.jpg')}`);
  });

  it('bibliothèque amie (décision du 28/09) : Cover Art Archive par le MBID, par le relais ; sans MBID, rien', () => {
    const mbid = '77cf47ba-58cd-3f3d-a5f9-79bf89860421';
    const url = pochetteAlbumContact(albumContact({ id: 1, title: 'A Love Supreme', musicbrainz_release_group_id: mbid }));
    expect(url).toBe(`https://coverartarchive.org/release-group/${mbid}/front-250`);
    expect(artworkUrl(url)).toBe(`/api/v1/library/artwork/proxy?url=${encodeURIComponent(url!)}`);
    expect(pochetteAlbumContact(albumContact({ id: 2, title: 'X', musicbrainz_release_group_id: null }))).toBeNull();
    expect(pochetteAlbumContact(albumContact({ id: 3, title: 'X', musicbrainz_release_group_id: 'pas-un-mbid' }))).toBeNull();
  });
});

describe('jouer et enfiler UN morceau', () => {
  it('le corps de `play` : rien, `from_item_id` ou `item_ids`', () => {
    expect(corpsDeLecturePlaylist(2)).toEqual({ zone_id: 2 });
    expect(corpsDeLecturePlaylist(2, { depuis: 'it-3' })).toEqual({ zone_id: 2, from_item_id: 'it-3' });
    expect(corpsDeLecturePlaylist(2, { seulement: ['it-1'] })).toEqual({ zone_id: 2, item_ids: ['it-1'] });
  });

  it('les refus du greffon ont leur phrase', () => {
    expect(codeT5({ code: 'circle.item_not_playable' })).toBe('v2.circle.pl.err.itemNotPlayable');
    expect(codeT5({ code: 'circle.unknown_item' })).toBe('v2.circle.pl.changed');
  });

  it('« Lire ensuite » d\'un titre de mon service : la paire et ce que MON service en dit, au rang donné', () => {
    const e = qobuz('123', { title: 'So What (Remastered)', cover_url: 'https://static.qobuz.com/a.jpg', duration_ms: 1000 });
    expect(corpsDeFileMorceau(m('1', { title: 'So What' }), e, 4)).toEqual({
      tracks: [{ source: 'qobuz', source_id: '123', title: 'So What (Remastered)', artist_name: 'A', album_title: 'B',
        cover_path: 'https://static.qobuz.com/a.jpg', duration_ms: 1000 }],
      position: 4,
    });
  });

  it('« Ajouter à la file » d\'une piste de ma bibliothèque : son seul `track_id`', () => {
    expect(corpsDeFileMorceau(m('1'), { etat: 'bibliotheque', piste: { track_id: 44 } })).toEqual({ track_id: 44 });
  });

  it('un introuvable, ou une résolution sans de quoi enfiler : rien', () => {
    expect(corpsDeFileMorceau(m('1'), { etat: 'introuvable' })).toBeNull();
    expect(corpsDeFileMorceau(m('1'), { etat: 'bibliotheque' })).toBeNull();
    expect(corpsDeFileMorceau(m('1'), { etat: 'service', service: 'qobuz' })).toBeNull();
    expect(jouable({ etat: 'introuvable' })).toBe(false);
    expect(jouable(null)).toBe(false);
  });

  it('le repère « en cours » compare la piste de ma bibliothèque ou la paire de mon service', () => {
    expect(designationEnLecture({ etat: 'bibliotheque', piste: { track_id: 44 } })).toEqual({ id: 44 });
    expect(designationEnLecture(qobuz('123'))).toMatchObject({ source: 'qobuz', source_id: '123' });
    expect(designationEnLecture({ etat: 'introuvable' })).toBeNull();
  });

  it('Aléatoire part des seuls jouables', () => {
    const r = res({ 1: qobuz('a'), 2: { etat: 'introuvable' }, 3: { etat: 'bibliotheque' } });
    expect(idsJouables([m('1'), m('2'), m('3'), m('4')], r)).toEqual(['1', '3']);
  });
});

describe('les membres de l\'en-tête', () => {
  it('connus puis contributeurs nommés, sans doublon ; jamais moi ni un anonyme', () => {
    expect(personnes(['Élise'], [m('1'), m('2', { added_by: { nom: 'Paul' } }), m('3', { mine: true, added_by: { nom: 'Bertrand' } }), m('4', { added_by: null })]))
      .toEqual(['Élise', 'Paul']);
    expect(initiale('élise')).toBe('É');
  });
});
