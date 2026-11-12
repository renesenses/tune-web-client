// @vitest-environment jsdom
//
// tune-server-rust#7523 (alec_eiffel ; discussion #7564, go de Bertrand du
// 12/11/2026) — la fenêtre « Retirer de mes radios » précise que la station
// reste disponible dans l'annuaire, pour ne pas inquiéter.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), deleteRadio: vi.fn(), updateRadio: vi.fn(), createRadio: vi.fn(),
  playRadio: vi.fn(), importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'), uploadRadioCover: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { questionRetraitMesRadios } from '../mesRadios';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const DE_L_ANNUAIRE = {
  id: 7, name: 'FIP', stream_url: 'https://stream.example/fip', favorite: false,
  annuaire: { external_id: 'rm-fip', rapproche_par: null },
};

const fr = dictionnaire('fr');
const tFr = (k: string) => fr[k] ?? k;
const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 6; i++) await attendre(); flushSync(); };
let hote: HTMLDivElement | null = null;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([DE_L_ANNUAIRE]);
  mocks.deleteRadio.mockResolvedValue(undefined);
  mocks.exportRadiosUrl.mockReturnValue('#');
  locale.set('fr');
});
afterEach(() => {
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
});

describe('#7523 — retirer de « Mes radios » : la station reste dans l’annuaire', () => {
  it('station de l’annuaire : la question dit qu’elle y reste', () => {
    const q = questionRetraitMesRadios(tFr, 'FIP', true);
    expect(q).toContain('« FIP »');
    expect(q).toContain("reste disponible dans l'annuaire");
  });

  it('station saisie à la main : la question courte, sans promesse d’annuaire', () => {
    expect(questionRetraitMesRadios(tFr, 'Ma radio', false)).toBe('Retirer « Ma radio » de Mes radios ?');
  });

  it('le libellé existe dans toutes les langues du client, avec {name}', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      expect(d['v2.radio.removeConfirmDirectory'], l).toContain('{name}');
      expect(d['v2.radio.removeConfirmDirectory'], l).not.toBe(d['v2.radio.removeConfirm']);
    }
  });

  it('🔴 « Mes radios » : le bouton Retirer ouvre la question qui rassure', async () => {
    hote = document.createElement('div');
    document.body.append(hote);
    instance = mount(RadiosV2, { target: hote, props: {} });
    flushSync();
    await respirer();
    const retirer = hote.querySelector<HTMLButtonElement>(`.coin[aria-label="${fr['v2.radio.removeFromMine']}"]`);
    expect(retirer, 'pas de bouton Retirer sur la pochette').not.toBeNull();
    retirer!.click();
    await respirer();
    const d = get(dialogs);
    expect(d).toHaveLength(1);
    expect(d[0].message).toContain("reste disponible dans l'annuaire");
    dialogs.settle(d[0].id, true);
    await respirer();
    expect(mocks.deleteRadio).toHaveBeenCalledWith(7);
  });

  it('Lecture en cours : le même texte quand la station est connue de l’annuaire', () => {
    const np = readFileSync(resolve(__dirname, '../../components/partages/NowPlaying.svelte'), 'utf8');
    expect(np).toContain("questionRetraitMesRadios((k) => $t(k as any), nom, !!s.annuaire)");
  });
});
