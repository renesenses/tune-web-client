// renesenses/tune-server-rust#8560 (fil forum 2713) — Bibliothèque › Qualité
// gagne « Stéréo » à côté de « Multicanal » : les albums en une ou deux voies,
// sans ceux qui ne sont QUE multicanaux. Un album qui mêle les deux sort sous
// les deux choix. Se lit dans `min_channels` (serveur rc12), à défaut dans
// `max_channels`.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { estMulticanal, estStereo } from '../utils';
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

describe('#8560 — Stéréo : une ou deux voies, pas le multicanal seul', () => {
  it('un album stéréo est Stéréo, pas Multicanal', () => {
    const a = { min_channels: 2, max_channels: 2 };
    expect(estStereo(a)).toBe(true);
    expect(estMulticanal(a)).toBe(false);
  });

  it('un album tout multicanal n’est pas Stéréo', () => {
    expect(estStereo({ min_channels: 6, max_channels: 6 })).toBe(false);
  });

  it('un album qui mêle stéréo et multicanal sort sous les deux choix', () => {
    const a = { min_channels: 2, max_channels: 6 };
    expect(estStereo(a)).toBe(true);
    expect(estMulticanal(a)).toBe(true);
  });

  it('le mono n’est pas du multicanal : il sort sous Stéréo', () => {
    expect(estStereo({ min_channels: 1, max_channels: 1 })).toBe(true);
  });

  it('serveur plus ancien (max_channels seul) : on s’en tient à lui', () => {
    expect(estStereo({ max_channels: 2 })).toBe(true);
    expect(estStereo({ max_channels: 6 })).toBe(false);
  });

  it('canaux inconnus : ni Stéréo ni Multicanal', () => {
    expect(estStereo({})).toBe(false);
    expect(estStereo({ min_channels: 0, max_channels: 0 })).toBe(false);
    expect(estStereo(null)).toBe(false);
  });
});

describe('#8560 — la puce est branchée et traduite', () => {
  it('LibraryV2 propose « stereo » et le filtre la lit par estStereo', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/LibraryV2.svelte'), 'utf8');
    expect(src).toContain("key: 'stereo'");
    expect(src).toContain("if (key === 'stereo') return estStereo(a);");
  });

  it('la clé v2.lib.qualityStereo existe dans toutes les langues', () => {
    for (const [nom, l] of Object.entries({ lDe, lEl, lEn, lEs, lFr, lHu, lIt, lJa, lKo, lNb, lPl, lRo, lSv, lVi, lZh })) {
      expect((l as Record<string, string>)['v2.lib.qualityStereo'], nom).toBeTruthy();
    }
  });
});
