// @vitest-environment jsdom
//
// tune-server-rust#6473 (Bilou, Jean Valjean, fil 2308) — « Pas moyen de
// supprimer des radios ». La capture montre un bandeau rouge :
// « can't access property "id", r.radio is null ».
//
// Ce qui se passait : « Supprimer » ouvre une confirmation (`dialogs.confirm`)
// dont le fond est à `z-index: 300`, SOUS la modale d'édition (`z-index: 900`).
// La confirmation est donc cachée derrière le panneau. Le testeur, qui ne voit
// rien venir, clique à côté : la modale d'édition se ferme (`enEdition = null`),
// sa prop `radio` passe à `null`, la confirmation apparaît enfin ; il clique OK
// et `api.deleteRadio(radio.id)` lève la TypeError — attrapée et affichée en
// bandeau. Le DELETE ne part jamais : la station reste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), deleteRadio: vi.fn(), updateRadio: vi.fn(), createRadio: vi.fn(),
  playRadio: vi.fn(), importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'), uploadRadioCover: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { dialogs } from '../stores/dialogs';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';

const STATION = { id: 7, name: 'Radio Paradise Main Mix', stream_url: 'https://stream.example/rp', favorite: false };

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 6; i++) await attendre(); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([STATION]);
  mocks.deleteRadio.mockResolvedValue(undefined);
  mocks.exportRadiosUrl.mockReturnValue('#');
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
});
afterEach(() => {
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

async function ouvrirEdition() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  flushSync();
  await respirer();
  const editer = hote.querySelector<HTMLButtonElement>('.coin.tr');
  expect(editer, 'pas de bouton d’édition sur la pochette').not.toBeNull();
  editer!.click();
  await respirer();
  const supprimer = document.querySelector<HTMLButtonElement>('.fond .sec.danger');
  expect(supprimer, 'pas de bouton Supprimer dans la modale').not.toBeNull();
  return supprimer!;
}

describe('#6473 — supprimer une radio', () => {
  it('🔴 modale fermée pendant la confirmation, puis OK : la station est supprimée, sans TypeError', async () => {
    const supprimer = await ouvrirEdition();
    supprimer.click();
    await respirer();
    expect(get(dialogs)).toHaveLength(1);

    // Le clic « à côté » du testeur, la confirmation étant cachée derrière.
    document.querySelector<HTMLDivElement>('.fond')!.click();
    await respirer();
    expect(document.querySelector('.fond'), 'la modale d’édition est restée ouverte').toBeNull();

    dialogs.settle(get(dialogs)[0].id, true);
    await respirer();

    const erreurs = get(notifications).filter((n) => n.level === 'error').map((n) => n.message);
    expect(erreurs.join(' | '), 'un bandeau d’erreur est affiché').toBe('');
    expect(mocks.deleteRadio).toHaveBeenCalledWith(7);
    expect(hote.querySelector('.coin.tr'), 'la station supprimée est toujours affichée').toBeNull();
  });

  it('le chemin normal : Supprimer, OK, la station disparaît et la modale se ferme', async () => {
    const supprimer = await ouvrirEdition();
    supprimer.click();
    await respirer();
    dialogs.settle(get(dialogs)[0].id, true);
    await respirer();
    expect(mocks.deleteRadio).toHaveBeenCalledWith(7);
    expect(document.querySelector('.fond')).toBeNull();
    expect(hote.querySelector('.coin.tr')).toBeNull();
    expect(get(notifications).filter((n) => n.level === 'error')).toEqual([]);
  });
});

/** Le plus grand `z-index` déclaré dans un composant. */
function zIndexMax(chemin: string): number {
  const css = readFileSync(resolve(__dirname, '../../components', chemin), 'utf8');
  return Math.max(...[...css.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1])));
}

describe('#6473 — la confirmation passe AU-DESSUS des modales qui la demandent', () => {
  it.each([
    'v2/RadioEditModale.svelte',
    'v2/ExtractionCdV2.svelte',
    'v2/FavoritesV2.svelte',
    'partages/FolderBrowser.svelte',
    'partages/ZoneConfigModal.svelte',
    'partages/ImportWizard.svelte',
    'partages/SmbWizard.svelte',
    'partages/AirplayPairingModal.svelte',
  ])('%s', (chemin) => {
    const dialogue = zIndexMax('partages/DialogContainer.svelte');
    expect(dialogue, `la confirmation (${dialogue}) est cachée sous ${chemin}`).toBeGreaterThan(zIndexMax(chemin));
  });
});
