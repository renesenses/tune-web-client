// renesenses/tune-web-client#2731 (Rhorn, fil forum 2713) — « 2.0 » ou
// « 5.1 » à côté du badge DSD / Hi-Res de la carte d'album, et sur chaque
// version de la fiche : laquelle des deux éditions d'un SACD est la
// multicanale. Lu dans `max_channels` ; aucun badge quand il est inconnu.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { badgeCanaux, canauxDePochette, libelleNombreCanaux } from '../utils';
import { libelleVersion, regrouperAlbums, type VersionAlbum } from '../oeuvres';

describe('#2731 — le nombre de canaux écrit comme sur une pochette', () => {
  it('2 → 2.0, 6 → 5.1, comme le badge par défaut du serveur', () => {
    expect(libelleNombreCanaux(1)).toBe('1.0');
    expect(libelleNombreCanaux(2)).toBe('2.0');
    expect(libelleNombreCanaux(4)).toBe('4.0');
    expect(libelleNombreCanaux(5)).toBe('5.0');
    expect(libelleNombreCanaux(6)).toBe('5.1');
    expect(libelleNombreCanaux(8)).toBe('7.1');
  });
  it('au-delà de 8, le compte : « 12 ch »', () => {
    expect(libelleNombreCanaux(12)).toBe('12 ch');
  });
  it('inconnu (absent, nul, négatif) : rien', () => {
    for (const n of [undefined, null, 0, -2, Number.NaN]) expect(libelleNombreCanaux(n)).toBeNull();
    expect(badgeCanaux([])).toBeNull();
    expect(badgeCanaux([null, undefined, 0])).toBeNull();
  });
  it('une carte de deux éditions dit les deux : « 2.0/5.1 »', () => {
    expect(badgeCanaux([6, 2, 6])).toBe('2.0/5.1');
    expect(badgeCanaux([2, null])).toBe('2.0');
  });
});

describe('#2731 — la carte regroupée connaît les canaux de CHAQUE version', () => {
  it('stéréo (préférée) + 5.1 : la carte porte [2, 6], pas seulement le maximum', () => {
    const liste = [
      { id: 10, title: 'X', max_channels: 2 },
      { id: 11, title: 'X 5.1', max_channels: 6 },
      { id: 12, title: 'Y', max_channels: 2 },
    ];
    const r = regrouperAlbums(liste, [{ work_id: 'x', preferred_id: 10, ids: [10, 11] }]);
    expect(badgeCanaux(r.canaux.get(10) ?? [])).toBe('2.0/5.1');
    // L'album seul n'est pas dans la table : la carte lit son propre max_channels.
    expect(r.canaux.has(12)).toBe(false);
  });
  it('versions sans canaux connus : rien dans la table', () => {
    const r = regrouperAlbums([{ id: 1 }, { id: 2 }], [{ work_id: 'w', preferred_id: 1, ids: [1, 2] }]);
    expect(r.canaux.get(1)).toBeUndefined();
  });
});

describe('#2731 — chaque version de la fiche dit ses canaux', () => {
  const base: VersionAlbum = {
    id: 1, title: 'DSOTM', version_name: '2003 SACD', year: 2003, label: null,
    format: 'dsf', sample_rate: null, bit_depth: null, source: 'local',
  };
  it('5.1 et 2.0 apparaissent dans le libellé du sélecteur', () => {
    expect(libelleVersion({ ...base, max_channels: 6 })).toBe('2003 SACD · 2003 · DSF · 5.1');
    expect(libelleVersion({ ...base, max_channels: 2 })).toBe('2003 SACD · 2003 · DSF · 2.0');
  });
  it('canaux inconnus (serveur antérieur) : le libellé d’avant, sans badge', () => {
    expect(libelleVersion(base)).toBe('2003 SACD · 2003 · DSF');
    expect(libelleVersion({ ...base, max_channels: null })).toBe('2003 SACD · 2003 · DSF');
  });
});

describe('#2731 — la règle de la pochette', () => {
  it('DSD ou Hi-Res : le badge de canaux, stéréo comprise', () => {
    expect(canauxDePochette('DSD', [2])).toBe('2.0');
    expect(canauxDePochette('DSD', [6])).toBe('5.1');
    expect(canauxDePochette('96', [2, 6])).toBe('2.0/5.1');
  });
  it('sans badge de qualité : un multicanal le porte, une stéréo non', () => {
    expect(canauxDePochette(null, [6])).toBe('5.1');
    expect(canauxDePochette(null, [2])).toBeNull();
  });
  it('canaux inconnus : rien, même sous DSD', () => {
    expect(canauxDePochette('DSD', [undefined])).toBeNull();
    expect(canauxDePochette('DSD', [])).toBeNull();
  });
});

describe('#2731 — les trois grilles de pochettes posent le badge de canaux', () => {
  const src = readFileSync('src/components/v2/LibraryV2.svelte', 'utf8');
  it('chaque badge de pochette porte la pastille de canaux', () => {
    expect((src.match(/<span class="bdg">\{q \?\? ''\}/g) ?? []).length).toBe(3);
    expect((src.match(/<span class="cnx" class:seul=\{!q\}/g) ?? []).length).toBe(3);
  });
  it('le filet ne tombe que quand les canaux sont SEULS (pas de :first-child, qui ignore « DSD »)', () => {
    expect(src).toContain('.cnx.seul{');
    expect(src).not.toMatch(/\.cnx:first-child/);
  });
  it('le libellé de l’infobulle est traduit', () => {
    expect(src).toContain("$tr('v2.lib.channelsCount' as any)");
  });
});
