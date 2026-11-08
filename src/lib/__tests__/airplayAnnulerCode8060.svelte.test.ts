// @vitest-environment jsdom
//
// tune-server-rust#8060 — la fenêtre du code AirPlay 2 fermée sans code
// annule l'attente côté serveur (`POST …/airplay/pair-cancel`) : sans cela, la
// sortie refusait la lecture tant que l'attente n'avait pas expiré.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  startAirplayPairing: vi.fn(),
  getAirplayPairStatus: vi.fn(),
  submitAirplayPairPin: vi.fn(),
  cancelAirplayPairing: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import AirplayPairingModal from '../../components/partages/AirplayPairingModal.svelte';
import { locale } from '../i18n';

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };

let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
let onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useRealTimers();
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.startAirplayPairing.mockResolvedValue({ ok: true, status: 'pin_requested' });
  mocks.getAirplayPairStatus.mockResolvedValue({ status: 'pin_requested' });
  mocks.submitAirplayPairPin.mockResolvedValue({ ok: true });
  mocks.cancelAirplayPairing.mockResolvedValue({ ok: true, cancelled: true, status: 'idle' });
  locale.set('fr');
  onClose = vi.fn<() => void>();
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(AirplayPairingModal, { target: hote, props: { deviceId: 'airplay-mac-7000', deviceName: 'MacBook', onClose } });
  flushSync();
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

/** Ce que fait le parent sur `onClose` : retirer la fenêtre. */
function fermerCommeLeParent() {
  unmount(instance as any);
  instance = null;
  flushSync();
}

async function jusquALaSaisieDuCode() {
  hote.querySelector<HTMLButtonElement>('.modal-body .btn-primary')!.click();
  await respirer();
  expect(hote.querySelector('.pin-input'), 'le champ du code doit être affiché').not.toBeNull();
}

describe('#8060 — fermer la fenêtre du code AirPlay 2', () => {
  it('🔴 fermée par la croix pendant la saisie du code, elle annule l’attente côté serveur', async () => {
    await jusquALaSaisieDuCode();
    hote.querySelector<HTMLButtonElement>('.close-btn')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    fermerCommeLeParent();
    expect(mocks.cancelAirplayPairing).toHaveBeenCalledTimes(1);
    expect(mocks.cancelAirplayPairing).toHaveBeenCalledWith('airplay-mac-7000');
  });

  it('🔴 fermée par un clic hors du panneau, elle annule aussi', async () => {
    await jusquALaSaisieDuCode();
    hote.querySelector<HTMLDivElement>('.modal-overlay')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
    fermerCommeLeParent();
    expect(mocks.cancelAirplayPairing).toHaveBeenCalledWith('airplay-mac-7000');
  });

  it('un serveur sans la route (404) ne fait pas échouer la fermeture', async () => {
    mocks.cancelAirplayPairing.mockRejectedValue(new Error('404 Not Found'));
    await jusquALaSaisieDuCode();
    fermerCommeLeParent();
    await respirer();
    expect(mocks.cancelAirplayPairing).toHaveBeenCalledTimes(1);
  });

  it('fermée avant d’avoir demandé un code, elle n’annule rien', () => {
    fermerCommeLeParent();
    expect(mocks.cancelAirplayPairing).not.toHaveBeenCalled();
  });

  it('fermée après un jumelage réussi, elle n’annule rien', async () => {
    mocks.getAirplayPairStatus.mockResolvedValue({ status: 'connected' });
    hote.querySelector<HTMLButtonElement>('.modal-body .btn-primary')!.click();
    await respirer();
    expect(hote.querySelector('.success-row')).not.toBeNull();
    fermerCommeLeParent();
    expect(mocks.cancelAirplayPairing).not.toHaveBeenCalled();
  });
});
