/**
 * tune-server-rust#6068 — un build tiers portant `.no-auto-update` voyait la
 * pastille « v1.0.0-dev → v1.0.0-rc3 » de la barre latérale l'inviter à
 * installer, puis le serveur refusait (`status: "blocked"`). Le serveur dit
 * désormais `installable: false` + `install_hint` dès `/update/check` ; la
 * pastille doit l'écouter, comme l'écran Réglages.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reponse = vi.hoisted(() => ({ valeur: {} as any }));
vi.mock('../api', () => ({ checkForUpdate: vi.fn(async () => reponse.valeur) }));

import { normaliserVerificationMaj } from '../miseAJour';
import {
  startUpdatePolling,
  stopUpdatePolling,
  updateAvailable,
  updateInstallable,
  updateInstallHint,
} from '../stores/updates';

const HINT = 'Automatic updates are disabled on this build (.no-auto-update file next to the binary).';

async function sonder(valeur: any) {
  reponse.valeur = valeur;
  stopUpdatePolling();
  startUpdatePolling();
  await vi.waitFor(() => expect(get(updateAvailable)).toBe(valeur.update_available === true));
  await Promise.resolve();
}

afterEach(() => stopUpdatePolling());

describe('normalisation : installable et install_hint', () => {
  it('un build .no-auto-update n est pas installable, et dit pourquoi', () => {
    const v = normaliserVerificationMaj({
      current: '1.0.0-dev', latest: '1.0.0-rc3', update_available: true,
      installable: false, install_hint: HINT, installation_manager: 'manual',
    })!;
    expect(v.installable).toBe(false);
    expect(v.install_hint).toBe(HINT);
  });

  it('un serveur plus ancien, sans le champ, reste installable', () => {
    const v = normaliserVerificationMaj({ current: '1', latest: '2', update_available: true })!;
    expect(v.installable).toBe(true);
    expect(v.install_hint).toBeNull();
  });
});

describe('le magasin de la pastille lit `installable`', () => {
  it('installable: false du serveur arrive dans le magasin', async () => {
    await sonder({ current: '1.0.0-dev', latest: '1.0.0-rc3', update_available: true,
      installable: false, install_hint: HINT });
    await vi.waitFor(() => expect(get(updateInstallable)).toBe(false));
    expect(get(updateInstallHint)).toBe(HINT);
  });

  it('une installation officielle reste installable', async () => {
    await sonder({ current: '1.0.0-rc2', latest: '1.0.0-rc3', update_available: true,
      installable: true, install_hint: null });
    await vi.waitFor(() => expect(get(updateInstallable)).toBe(true));
    expect(get(updateInstallHint)).toBeNull();
  });
});

describe('la barre latérale ne propose pas d installer ce qui ne s installe pas', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/components/v2/Sidebar.svelte'), 'utf-8')
    .replace(/<!--[\s\S]*?-->/g, '');

  it('la pastille non installable passe AVANT le bouton, sans geste', () => {
    const neutre = src.indexOf('{#if $updateAvailable && !$updateInstallable}');
    const bouton = src.indexOf('<button class="maj-lien" onclick={ouvrirMaj}');
    expect(neutre).toBeGreaterThan(-1);
    expect(bouton).toBeGreaterThan(-1);
    expect(neutre).toBeLessThan(bouton);
    const branche = src.slice(neutre, bouton);
    expect(branche).toContain('title={$updateInstallHint');
    expect(branche).not.toContain('onclick');
  });

  it('repliée, le point d installation exige installable', () => {
    const repliee = src.indexOf('{#if enIcones && $updateAvailable}');
    expect(repliee).toBeGreaterThan(-1);
    const bloc = src.slice(repliee, src.indexOf('{/if}\n    {/if}', repliee));
    const installable = bloc.indexOf('{#if $updateInstallable}');
    const geste = bloc.indexOf('<button class="maj-point" onclick={ouvrirMaj}');
    expect(installable).toBeGreaterThan(-1);
    expect(geste).toBeGreaterThan(installable);
    const neutre = bloc.slice(bloc.indexOf('{:else}'));
    expect(neutre).toContain('class="maj-point neutre"');
    expect(neutre).not.toContain('onclick');
  });
});
