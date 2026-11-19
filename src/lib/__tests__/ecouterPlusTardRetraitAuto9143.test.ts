// tune-server-rust#9143 / web#3248 (fil forum 2934) — l'option « retirer
// d'Écouter plus tard après écoute complète ».
//
// Le retrait se fait côté serveur, qui lit la clé `ecouterPlusTardRetraitAuto`
// dans les réglages du profil, à côté de l'étiquette du sas. Ces témoins
// gardent la clé exacte, le défaut ÉTEINT, et l'écriture qui FUSIONNE.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProfilePreferences: vi.fn(),
  setProfilePreferences: vi.fn(),
}));
vi.mock('../api', () => mocks);

import {
  CLE_REGLAGE,
  CLE_RETRAIT_AUTO,
  ecrireRetraitAuto,
  lireRetraitAuto,
  retraitAutoActif,
} from '../ecouterPlusTard';
import { REGLAGES } from '../reglagesIndex';

beforeEach(() => {
  mocks.getProfilePreferences.mockReset();
  mocks.setProfilePreferences.mockReset();
});

describe('#9143 — option de retrait automatique', () => {
  it('la clé est celle que lit le serveur', () => {
    expect(CLE_RETRAIT_AUTO).toBe('ecouterPlusTardRetraitAuto');
    expect(CLE_REGLAGE).toBe('ecouterPlusTardEtiquette');
  });

  it('éteinte par défaut : seule la valeur true l’allume', () => {
    expect(retraitAutoActif(null)).toBe(false);
    expect(retraitAutoActif({})).toBe(false);
    expect(retraitAutoActif({ [CLE_RETRAIT_AUTO]: 'true' })).toBe(false);
    expect(retraitAutoActif({ [CLE_RETRAIT_AUTO]: 1 })).toBe(false);
    expect(retraitAutoActif({ [CLE_RETRAIT_AUTO]: true })).toBe(true);
  });

  it('lit l’option dans les réglages du profil', async () => {
    mocks.getProfilePreferences.mockResolvedValue({ [CLE_REGLAGE]: 7, [CLE_RETRAIT_AUTO]: true });
    await expect(lireRetraitAuto(3)).resolves.toBe(true);
    expect(mocks.getProfilePreferences).toHaveBeenCalledWith(3);
  });

  it('écrit par la voie qui fusionne, la clé seule', async () => {
    mocks.setProfilePreferences.mockResolvedValue({});
    await ecrireRetraitAuto(3, true);
    await ecrireRetraitAuto(3, false);
    expect(mocks.setProfilePreferences.mock.calls).toEqual([
      [3, { [CLE_RETRAIT_AUTO]: true }],
      [3, { [CLE_RETRAIT_AUTO]: false }],
    ]);
  });

  it('a sa ligne dans Réglages › Lecture et dans l’index de recherche', () => {
    const ecran = readFileSync(
      resolve(__dirname, '../../components/v2/SettingsV2.svelte'),
      'utf8',
    );
    expect(ecran).toContain('data-reglage="retrait-ecouter-plus-tard"');
    expect(ecran).toContain('ecrireRetraitAuto(');
    const entree = REGLAGES.find((e) => e.id === 'retrait-ecouter-plus-tard');
    expect(entree?.section).toBe('playback');
    expect(entree?.labelKey).toBe('settings.retraitEcouterPlusTard');
  });
});
