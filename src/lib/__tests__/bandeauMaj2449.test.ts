// @vitest-environment jsdom
import { get } from 'svelte/store';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const banc = vi.hoisted(() => ({ check: vi.fn(), handlers: new Set<(e: any) => void>() }));
vi.mock('../api', () => ({ checkForUpdate: banc.check }));
vi.mock('../websocket', () => ({ tuneWS: { onEvent: (h: (e: any) => void) => {
  banc.handlers.add(h); return () => banc.handlers.delete(h);
} } }));
import { startUpdatePolling, stopUpdatePolling, updateAvailable, currentVersion } from '../stores/updates';
const avant = { current: '1.0.0-rc8', latest: '1.0.0-rc8.1', update_available: true };
const apres = { ...avant, current: '1.0.0-rc8.1', update_available: false };
const attendre = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => { banc.check.mockReset(); updateAvailable.set(false); localStorage.clear(); });
afterEach(() => { stopUpdatePolling(); vi.restoreAllMocks(); });
it.each(['focus', 'online', '_connected'])('retire le bandeau après installation au retour %s', async (event) => {
  banc.check.mockResolvedValue(avant);
  startUpdatePolling(); await attendre();
  expect(get(updateAvailable)).toBe(true);
  banc.check.mockResolvedValue(apres);
  if (event === '_connected') banc.handlers.forEach(h => h({ type: event }));
  else window.dispatchEvent(new Event(event));
  await attendre();
  expect(get(currentVersion)).toBe('1.0.0-rc8.1');
  expect(get(updateAvailable)).toBe(false);
});
it.each(['1.0.0-rc8.1', 'v1.0.0-rc8.1+build', '1.0.0-rc9'])('ignore un drapeau périmé quand %s est déjà installé', async (current) => {
  banc.check.mockResolvedValue({ ...avant, current });
  startUpdatePolling(); await attendre();
  expect(get(updateAvailable)).toBe(false);
});
it('la réponse ancienne ne ressuscite pas le bandeau après le retour du serveur', async () => {
  let rendre!: (v: any) => void;
  banc.check.mockImplementationOnce(() => new Promise(r => { rendre = r; })).mockResolvedValue(apres);
  startUpdatePolling();
  banc.handlers.forEach(h => h({ type: '_connected' }));
  await attendre();
  rendre(avant); await attendre();
  expect(get(updateAvailable)).toBe(false);
  expect(get(currentVersion)).toBe('1.0.0-rc8.1');
});
it('désabonne tous les réveils et invalide les réponses au démontage', async () => {
  let rendre!: (v: any) => void;
  banc.check.mockImplementationOnce(() => new Promise(r => { rendre = r; }));
  startUpdatePolling(); stopUpdatePolling();
  rendre(avant); await attendre();
  window.dispatchEvent(new Event('focus'));
  expect(banc.handlers.size).toBe(0);
  expect(banc.check).toHaveBeenCalledTimes(1);
  expect(get(updateAvailable)).toBe(false);
});
it('un serveur ancien sans versions garde son booléen', async () => {
  banc.check.mockResolvedValue({ update_available: true });
  startUpdatePolling(); await attendre();
  expect(get(updateAvailable)).toBe(true);
});
