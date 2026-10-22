import { describe, expect, it, vi } from 'vitest';
import { envoyerVolumeOuReverrouiller } from '../refusDeVolume';

/**
 * tune-server-rust#6721 — fil forum 2366 (Marantz NR1200, tweeter détruit).
 *
 * Sous PURE « Forcer à 100 % », le serveur refuse désormais une consigne de
 * volume sous 100 % au lieu de l'envoyer à 100 %. Le curseur, lui, était libre
 * parce que l'état du verrou lu par ce client était faux (PURE armé ailleurs,
 * ou lecture en échec). Un refus doit relire le verrou et le dire.
 */
function banc(envoi: () => Promise<unknown>, verrouApres: boolean) {
  let verrou = false;
  const deps = {
    envoyer: vi.fn(envoi),
    relireVerrou: vi.fn(async () => {
      verrou = verrouApres;
    }),
    verrouille: () => verrou,
    direVerrou: vi.fn(),
  };
  return deps;
}

describe('#6721 — refus de volume du serveur', () => {
  it('un refus relit le verrou de la zone et le dit quand PURE le tient', async () => {
    const deps = banc(() => Promise.reject(new Error('409')), true);
    const ok = await envoyerVolumeOuReverrouiller(7, 0.18, deps);
    expect(ok).toBe(false);
    expect(deps.envoyer).toHaveBeenCalledWith(7, 0.18);
    expect(deps.relireVerrou).toHaveBeenCalledWith(7);
    expect(deps.direVerrou).toHaveBeenCalledTimes(1);
  });

  it("un refus sans verrou armé n'invente pas de message PURE", async () => {
    const deps = banc(() => Promise.reject(new Error('502')), false);
    expect(await envoyerVolumeOuReverrouiller(7, 0.18, deps)).toBe(false);
    expect(deps.relireVerrou).toHaveBeenCalledWith(7);
    expect(deps.direVerrou).not.toHaveBeenCalled();
  });

  it('une consigne acceptée ne relit rien', async () => {
    const deps = banc(() => Promise.resolve(), true);
    expect(await envoyerVolumeOuReverrouiller(7, 0.18, deps)).toBe(true);
    expect(deps.relireVerrou).not.toHaveBeenCalled();
    expect(deps.direVerrou).not.toHaveBeenCalled();
  });

  it('une relecture en échec ne rejette pas (aucune promesse orpheline)', async () => {
    const deps = banc(() => Promise.reject(new Error('409')), true);
    deps.relireVerrou.mockRejectedValueOnce(new Error('réseau'));
    await expect(envoyerVolumeOuReverrouiller(7, 0.18, deps)).resolves.toBe(false);
    expect(deps.direVerrou).not.toHaveBeenCalled();
  });
});
