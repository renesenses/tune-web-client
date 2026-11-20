// @vitest-environment jsdom
//
// tune-server-rust#8761 — la convolution garde un fichier par fréquence
// d'échantillonnage, et le bloc FIR dit lequel le serveur emploie
// (« Fichier utilisé : 96 kHz (rééchantillonné depuis 48 kHz) »).
// Demande de Begastor, forum-hifi fil 41831 (#924 et #960).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({ fetchJSON: vi.fn() }));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import CorrectionAcoustiqueZone from '../../components/partages/CorrectionAcoustiqueZone.svelte';
import { locale } from '../i18n';

let hote: HTMLElement;
let composant: Record<string, any> | null = null;
const zone = { id: 7, name: 'Salon', current_track: null } as any;

async function monter(statut: any) {
  mocks.fetchJSON.mockImplementation(async (url: string) => {
    if (url.includes('/room-correction/ir/status/')) return statut;
    return { points: [], sample_rate: 48000, channels: 1, taps: 1 };
  });
  composant = mount(CorrectionAcoustiqueZone, { target: hote, props: { zone } });
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    flushSync();
  }
}

beforeEach(() => {
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  mocks.fetchJSON.mockReset();
});
afterEach(() => {
  if (composant) unmount(composant);
  composant = null;
  hote.remove();
});

describe('#8761 — fichiers par fréquence et fichier utilisé', () => {
  it('dit le filtre rééchantillonné, avec les deux fréquences', async () => {
    await monter({
      active: true,
      ir_path: '/d/ir/zone_7.wav',
      files: [{ path: '/d/ir/zone_7.wav', sample_rate: 48000, main: true }],
      in_use: { stream_sample_rate: 96000, file_sample_rate: 48000, resampled: true },
    });
    const ligne = hote.querySelector('[data-testid="ir-in-use"]');
    expect(ligne?.textContent?.trim()).toBe('Fichier utilisé : 96 kHz (rééchantillonné depuis 48 kHz)');
  });

  it('liste les fichiers par fréquence et marque celui pris tel quel', async () => {
    await monter({
      active: true,
      ir_path: '/d/ir/zone_7.wav',
      files: [
        { path: '/d/ir/zone_7.wav', sample_rate: 44100, main: true },
        { path: '/d/ir/zone_7_sr96000.wav', sample_rate: 96000 },
      ],
      in_use: { stream_sample_rate: 44100, file_sample_rate: 44100, resampled: false },
    });
    const items = [...hote.querySelectorAll('[data-testid="ir-files"] li')];
    expect(items.map((li) => li.textContent?.replace('×', '').trim())).toEqual(['44.1 kHz', '96 kHz']);
    expect(items[0].classList.contains('ir-file-used')).toBe(true);
    expect(items[1].classList.contains('ir-file-used')).toBe(false);
    expect(hote.querySelector('[data-testid="ir-in-use"]')?.textContent?.trim()).toBe('Fichier utilisé : 44.1 kHz');
    expect(hote.querySelector('[data-testid="ir-add-rate"]')).toBeTruthy();
  });

  it("un serveur d'avant #8761 (ni files ni in_use) : le bloc reste comme avant", async () => {
    await monter({ active: true, ir_path: '/d/ir/zone_7.wav' });
    expect(hote.querySelector('[data-testid="ir-in-use"]')).toBeNull();
    expect(hote.querySelector('[data-testid="ir-files"]')).toBeNull();
    expect(hote.querySelector('.ir-path')?.textContent).toBe('zone_7.wav');
  });
});
