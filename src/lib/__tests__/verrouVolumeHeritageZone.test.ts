// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import {
  audiophileGlobalLockVolume,
  audiophileLockVolume,
  audiophileZoneLockOverride,
} from '../stores/audiophile';
import { fr } from './onzeDictionnaires';
import type { AudiophileModeState } from '../api';

/**
 * LA TROISIÈME POSITION DU VERROU DE VOLUME PAR ZONE — #2526.
 *
 * ── LE DÉFAUT ────────────────────────────────────────────────────────────────
 *
 * `audiophile.lockInherit` (« Utiliser le réglage global ») nommait la
 * troisième position d'un sélecteur, dans l'ancien écran de réglages. Le
 * portage v2 a rendu ce réglage sous la forme d'un INTERRUPTEUR, et un
 * interrupteur n'a que deux positions : il n'envoyait jamais `null`.
 *
 * Tout le reste de la chaîne savait pourtant faire :
 *
 *   - `stores/audiophile.setZoneVolumeLock(zoneId, enabled: boolean | null)`
 *     accepte `null` ;
 *   - `api.setAudiophileVolumeLock` sérialise `lock_volume: null` ;
 *   - le serveur résout l'héritage, `volume_lock_override(zone).unwrap_or(global)` ;
 *   - `audiophileLockBadge` distingue encore `inherited` de `own`.
 *
 * Conséquence : une zone ayant reçu une surcharge explicite ne pouvait PLUS
 * revenir à l'héritage depuis l'interface. Ce n'est pas un libellé débranché —
 * c'est un état que l'API sait atteindre et que l'utilisateur ne pouvait plus.
 *
 * ── POURQUOI ON MONTE ────────────────────────────────────────────────────────
 *
 * Une garde de source aurait été satisfaite par la seule présence du littéral
 * `null` quelque part dans le fichier. Ce qui doit être prouvé, c'est qu'un
 * geste d'utilisateur — choisir « hériter » dans la liste — fait partir `null`
 * sur le réseau, et que la liste retombe ensuite sur cette position. On monte
 * donc `TransportBar` et on ouvre son panneau « chemin du signal », comme
 * `signalPath1097.test.ts`.
 */

/** ⏱️ Même raison et même valeur que `sortieMonoZone.test.ts` : la
 *  transformation Svelte est payée à froid au premier montage, au-dessus du
 *  plafond de 5 s de Vitest dès que la machine a autre chose à faire. */
const DELAI_MONTAGE = 60_000;

const lireMode = vi.fn<(id: number) => Promise<AudiophileModeState>>();
const ecrireVerrou = vi.fn<
  (id: number, lock: boolean | null, confirme: boolean) => Promise<AudiophileModeState>
>();
const lireConfig = vi.fn<() => Promise<Record<string, unknown>>>();
const confirmer = vi.fn<(msg: string) => Promise<boolean>>();

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  // Seuls les trois appels du verrou sont remplacés : un module d'API
  // entièrement inventé rendrait le montage vert quoi qu'il arrive au vrai
  // contrat.
  return {
    ...reel,
    getAudiophileMode: (id: number) => lireMode(id),
    setAudiophileVolumeLock: (id: number, lock: boolean | null, confirme = false) =>
      ecrireVerrou(id, lock, confirme),
    getConfig: () => lireConfig(),
  };
});

vi.mock('../stores/dialogs', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../stores/dialogs')>();
  return {
    ...reel,
    dialogs: { ...reel.dialogs, confirm: (msg: string) => confirmer(msg) },
  };
});

let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | undefined;

/** Une zone en lecture, façonnée comme la charge utile réelle de `GET /zones`. */
function zoneEnLecture() {
  return [
    {
      id: 1,
      name: 'Salon',
      state: 'playing',
      online: true,
      volume: 0.4,
      output_type: 'local',
      output_device_id: 'local:dac-1',
      // La pastille qui OUVRE le panneau n'existe que sur une zone en lecture
      // qui publie son chemin de signal (`TransportBar`, condition du
      // `.signal-led`). Sans ce champ, il n'y a rien à cliquer.
      signal_path: {
        bit_perfect: true,
        lossless: true,
        steps: [{ name: 'Source', description: 'FLAC source', bit_perfect: true }],
      },
    },
  ];
}

beforeEach(() => {
  lireMode.mockReset();
  ecrireVerrou.mockReset();
  lireConfig.mockReset();
  confirmer.mockReset();
  lireConfig.mockResolvedValue({});
  confirmer.mockResolvedValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })),
  );
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(async () => {
  if (monte) await unmount(monte);
  monte = undefined;
  hote.remove();
  zones.set([]);
  currentZoneId.set(null);
  audiophileZoneLockOverride.set(null);
  audiophileGlobalLockVolume.set(false);
  audiophileLockVolume.set(false);
  vi.unstubAllGlobals();
});

/** Monte la barre, ouvre le panneau du chemin du signal, rend le sélecteur. */
async function ouvrirLeVerrou(etat: AudiophileModeState): Promise<HTMLSelectElement> {
  lireMode.mockResolvedValue(etat);
  zones.set(zoneEnLecture() as never);
  currentZoneId.set(1);
  monte = mount(TransportBar, { target: hote });
  flushSync();
  const led = hote.querySelector<HTMLButtonElement>('.signal-led');
  expect(led, 'la pastille du chemin du signal doit exister').not.toBeNull();
  led!.click();
  flushSync();
  expect(hote.querySelector('.sp-card'), 'le panneau doit s’ouvrir').not.toBeNull();

  // L'état du verrou arrive par le réseau : on attend la réponse plutôt que de
  // lire une liste encore à sa valeur de départ.
  await vi.waitFor(() => expect(lireMode).toHaveBeenCalledWith(1));
  flushSync();

  const liste = hote.querySelector<HTMLSelectElement>('.sp-ap-choix');
  expect(liste, 'le verrou par zone doit être une LISTE, pas une bascule').not.toBeNull();
  return liste!;
}

/** Choisir une position, comme l'utilisateur le fait. */
function choisir(liste: HTMLSelectElement, valeur: string): void {
  liste.value = valeur;
  liste.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('#2526 — le verrou par zone a TROIS positions', () => {
  it('la liste offre « hériter », « toujours » et « jamais », traduits', { timeout: DELAI_MONTAGE }, async () => {
    const liste = await ouvrirLeVerrou({ enabled: true, lock_volume: null, effective_lock_volume: false });

    const options = [...liste.querySelectorAll('option')];
    expect(options.map((o) => o.value)).toEqual(['inherit', 'on', 'off']);
    // Les libellés RENDUS viennent du dictionnaire : si la clé manquait,
    // l'utilisateur lirait « audiophile.lockInherit » dans la liste.
    expect(options.map((o) => o.textContent!.trim())).toEqual([
      fr['audiophile.lockInherit'],
      fr['audiophile.lockAlways'],
      fr['audiophile.lockNever'],
    ]);
    expect(liste.textContent).not.toContain('audiophile.');
  });

  it('une zone SANS surcharge s’affiche sur « hériter »', { timeout: DELAI_MONTAGE }, async () => {
    const liste = await ouvrirLeVerrou({ enabled: true, lock_volume: null, effective_lock_volume: true });
    // 🔴 `effective_lock_volume` vaut `true` ici et la position reste
    // « hériter » : la position se lit de la SURCHARGE, jamais de la valeur
    // effective, qui confondrait « hérité armé » et « surchargé armé ».
    expect(liste.value).toBe('inherit');
  });

  it('une zone surchargée s’affiche sur sa propre position', { timeout: DELAI_MONTAGE }, async () => {
    const armee = await ouvrirLeVerrou({ enabled: true, lock_volume: true, effective_lock_volume: true });
    expect(armee.value).toBe('on');
  });
});

describe('#2526 — une zone surchargée REVIENT à l’héritage', () => {
  it('choisir « hériter » envoie `null` au serveur', { timeout: DELAI_MONTAGE }, async () => {
    // La zone a une surcharge explicite « toujours 100 % », le réglage général
    // est désarmé. C'est l'état dont l'interrupteur à deux positions ne savait
    // plus sortir.
    const liste = await ouvrirLeVerrou({ enabled: true, lock_volume: true, effective_lock_volume: true });
    expect(liste.value).toBe('on');

    ecrireVerrou.mockResolvedValue({
      enabled: true,
      lock_volume: null,
      effective_lock_volume: false,
    });
    choisir(liste, 'inherit');
    await vi.waitFor(() => expect(ecrireVerrou).toHaveBeenCalled());

    // 🔴 L'assertion du défaut : `null`, pas `false`. `false` serait une
    // SECONDE surcharge — la zone resterait sourde au réglage général.
    expect(ecrireVerrou.mock.calls[0][0]).toBe(1);
    expect(ecrireVerrou.mock.calls[0][1]).toBeNull();
  });

  it('et la liste retombe sur « hériter » quand le serveur a répondu', { timeout: DELAI_MONTAGE }, async () => {
    const liste = await ouvrirLeVerrou({ enabled: true, lock_volume: false, effective_lock_volume: false });
    expect(liste.value).toBe('off');

    ecrireVerrou.mockResolvedValue({
      enabled: true,
      lock_volume: null,
      effective_lock_volume: false,
    });
    choisir(liste, 'inherit');
    await vi.waitFor(() => expect(ecrireVerrou).toHaveBeenCalled());
    flushSync();

    // Le chemin du retour est bouclé : l'écran montre l'héritage rétabli, sans
    // rechargement et sans que le client ait rejoué l'héritage lui-même.
    await vi.waitFor(() => {
      flushSync();
      expect(liste.value).toBe('inherit');
    });
  });

  it('revenir à l’héritage vers un général ARMÉ demande l’accord plein volume', { timeout: DELAI_MONTAGE }, async () => {
    // Le général est armé : rendre la zone à l'héritage la fait passer à 100 %.
    // Le retour à l'héritage n'est donc pas toujours un geste sans risque, et
    // c'est la seule raison pour laquelle le client regarde le défaut global.
    lireConfig.mockResolvedValue({ audiophile_lock_volume: true });
    const liste = await ouvrirLeVerrou({ enabled: true, lock_volume: false, effective_lock_volume: false });
    await vi.waitFor(() => expect(lireConfig).toHaveBeenCalled());

    ecrireVerrou.mockResolvedValue({
      enabled: true,
      lock_volume: null,
      effective_lock_volume: true,
    });
    choisir(liste, 'inherit');

    await vi.waitFor(() => expect(confirmer).toHaveBeenCalled());
    expect(confirmer.mock.calls[0][0]).toBe(fr['audiophile.lockVolumeWarn']);
    await vi.waitFor(() => expect(ecrireVerrou).toHaveBeenCalledWith(1, null, true));
  });

  it('un accord REFUSÉ n’écrit rien', { timeout: DELAI_MONTAGE }, async () => {
    const liste = await ouvrirLeVerrou({ enabled: true, lock_volume: null, effective_lock_volume: false });
    confirmer.mockResolvedValue(false);

    choisir(liste, 'on');
    await vi.waitFor(() => expect(confirmer).toHaveBeenCalled());
    expect(ecrireVerrou).not.toHaveBeenCalled();
  });

  it('« jamais » n’exige aucun accord : désarmer est sans danger', { timeout: DELAI_MONTAGE }, async () => {
    const liste = await ouvrirLeVerrou({ enabled: true, lock_volume: true, effective_lock_volume: true });
    ecrireVerrou.mockResolvedValue({
      enabled: true,
      lock_volume: false,
      effective_lock_volume: false,
    });

    choisir(liste, 'off');
    await vi.waitFor(() => expect(ecrireVerrou).toHaveBeenCalled());
    expect(ecrireVerrou).toHaveBeenCalledWith(1, false, false);
    expect(confirmer).not.toHaveBeenCalled();
  });
});
