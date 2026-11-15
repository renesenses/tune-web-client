// renesenses/tune-server-rust#7725 — Didier, fil « Toutes ou Tous ? », et la
// décision de Bertrand du 04/11 : le libellé reste « Toutes », et le filtre
// Qualité gagne « DSD » et « Multicanal ».
//
//   - DSD : DSF, DFF, image SACD ISO (format `dsd`) ; il était rangé sous
//     Hi-Res sur la page d'un artiste.
//   - Multicanal : plus de deux canaux, lu dans `max_channels` (serveur
//     rc11). Critère À PART des paliers : un album DSD 5.1 sort sous les deux.
import { describe, expect, it } from 'vitest';
import { aLaQualite, compterFocus, filtrerFocus, fusionnerDiscographie, qualiteDe } from '../discographieCommune';
import { estMulticanal, porteSesCanaux } from '../utils';
import type { Album } from '../types';
import lDe from '../locales/de';
import lEl from '../locales/el';
import lEn from '../locales/en';
import lEs from '../locales/es';
import lFr from '../locales/fr';
import lHu from '../locales/hu';
import lIt from '../locales/it';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lNb from '../locales/nb';
import lPl from '../locales/pl';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lVi from '../locales/vi';
import lZh from '../locales/zh';

const al = (o: Record<string, unknown>) => o as unknown as Album;
const local = (o: Record<string, unknown>) => ({ source: 'local', album: al(o) });

describe('#7725 — DSD, palier à part sur la page d’un artiste', () => {
  it('DSF, DFF et image SACD ISO sont du DSD, plus du Hi-Res', () => {
    for (const format of ['dsf', 'dff', 'dsd', 'DSF']) {
      expect(qualiteDe(local({ format, sample_rate: 2822400, bit_depth: 1 })), format).toBe('dsd');
    }
  });

  it('un FLAC 24/96 reste Hi-Res, un FLAC 16/44 reste CD', () => {
    expect(qualiteDe(local({ format: 'flac', sample_rate: 96000, bit_depth: 24 }))).toBe('hires');
    expect(qualiteDe(local({ format: 'flac', sample_rate: 44100, bit_depth: 16 }))).toBe('cd');
  });
});

describe('#7725 — Multicanal : plus de deux canaux', () => {
  it('se lit dans max_channels', () => {
    expect(estMulticanal(al({ max_channels: 6 }))).toBe(true);
    expect(estMulticanal(al({ max_channels: 3 }))).toBe(true);
    expect(estMulticanal(al({ max_channels: 2 }))).toBe(false);
    expect(estMulticanal(al({ max_channels: 1 }))).toBe(false);
    expect(estMulticanal(al({}))).toBe(false);
  });

  it('la puce n’est proposée que si le serveur sert les canaux', () => {
    expect(porteSesCanaux(al({ max_channels: 2 }))).toBe(true);
    expect(porteSesCanaux(al({}))).toBe(false);
  });

  it('est indépendant des paliers : un DSD 5.1 est DSD ET Multicanal', () => {
    const e = local({ format: 'dsf', sample_rate: 2822400, max_channels: 6 });
    expect(aLaQualite(e, 'dsd')).toBe(true);
    expect(aLaQualite(e, 'multichannel')).toBe(true);
    expect(aLaQualite(e, 'hires')).toBe(false);
  });
});

describe('#7725 — le Focus Qualité de la page d’un artiste rend les bons albums', () => {
  const e = fusionnerDiscographie(
    [
      al({ id: 1, title: 'Stéréo CD', format: 'flac', sample_rate: 44100, bit_depth: 16, max_channels: 2 }),
      al({ id: 2, title: 'Surround', format: 'flac', sample_rate: 96000, bit_depth: 24, max_channels: 6 }),
      al({ id: 3, title: 'DSF stéréo', format: 'dsf', sample_rate: 2822400, bit_depth: 1, max_channels: 2 }),
      al({ id: 4, title: 'DFF 5.1', format: 'dff', sample_rate: 2822400, bit_depth: 1, max_channels: 6 }),
      al({ id: 5, title: 'SACD ISO', format: 'dsd', sample_rate: 2822400, bit_depth: 1, max_channels: 2 }),
    ],
    [],
  );
  const titres = (q: any[]) =>
    filtrerFocus(e, { sources: new Set(), qualites: new Set(q) }).map((x) => x.principal.album.title);

  it('DSD rend les DSF, DFF et ISO, et eux seuls', () => {
    expect(titres(['dsd'])).toEqual(['DSF stéréo', 'DFF 5.1', 'SACD ISO']);
  });

  it('Multicanal rend les albums de plus de deux canaux, et eux seuls', () => {
    expect(titres(['multichannel'])).toEqual(['Surround', 'DFF 5.1']);
  });

  it('Hi-Res ne rend plus les DSD', () => {
    expect(titres(['hires'])).toEqual(['Surround']);
  });

  it('les comptes du panneau nomment DSD et Multicanal', () => {
    expect(compterFocus(e).qualites).toEqual([
      { qualite: 'dsd', n: 3 },
      { qualite: 'hires', n: 1 },
      { qualite: 'cd', n: 1 },
      { qualite: 'multichannel', n: 2 },
    ]);
  });
});

describe('#7725 — libellés, dans toutes les langues', () => {
  const langues: Record<string, Record<string, string>> = {
    de: lDe, el: lEl, en: lEn, es: lEs, fr: lFr, hu: lHu, it: lIt, ja: lJa, ko: lKo,
    nb: lNb, pl: lPl, ro: lRo, sv: lSv, vi: lVi, zh: lZh,
  };

  it('la pastille « tout » de la rangée Source dit « Toutes les sources » (#2774, décision du 10/11)', () => {
    expect(lFr['v2.fav.allSources']).toBe('Toutes les sources');
  });

  it.each(Object.keys(langues))('%s porte les libellés DSD, Multicanal et « tout »', (l) => {
    for (const cle of ['v2.fav.allSources', 'v2.disco.dsd', 'v2.disco.multichannel', 'v2.lib.qualityMultichannel']) {
      expect(langues[l][cle], `${l} : ${cle}`).toBeTruthy();
    }
  });
});
