// @vitest-environment jsdom
//
// « Réinitialiser la compatibilité » sur la fiche d'un renderer DLNA —
// suite web de renesenses/tune-server-rust#5962 (décision de Bertrand, 08/10).
//
// Le serveur retient, par renderer, la forme de commande `SetAVTransportURI`
// acceptée après un refus, et la garde d'un démarrage à l'autre.
// `DELETE /zones/{id}/compatibilite-renderer` la fait oublier.
//
// Ces témoins MONTENT la fiche (`RendererConfig`) avec un `fetch` simulé : ils
// cliquent le bouton et lisent la requête qui part vraiment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import RendererConfig from '../../components/partages/RendererConfig.svelte';
import * as api from '../api';
import { compatibiliteReinitialisable, messageReinitialisation } from '../compatibiliteRenderer';
import { notifications } from '../stores/notifications';
import type { Zone } from '../types';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
const CLES = [
  'renderer.resetCompat',
  'renderer.resetCompatHint',
  'renderer.resetCompatDone',
  'renderer.resetCompatNone',
  'renderer.resetCompatError',
];

type Requete = { methode: string; chemin: string };
let requetes: Requete[] = [];
let reponse: { status: number; corps: unknown };

function zone(output_type: string): Zone {
  return { id: 7, name: 'Salon', output_type, output_device_id: 'uuid:salon' } as unknown as Zone;
}

beforeEach(() => {
  requetes = [];
  reponse = { status: 200, corps: { zone_id: 7, profils_oublies: 2 } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), 'http://tune.test').pathname;
    requetes.push({ methode: (init?.method ?? 'GET').toUpperCase(), chemin });
    return new Response(JSON.stringify(reponse.corps), {
      status: reponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('l’appel au serveur', () => {
  it('vise DELETE /zones/{id}/compatibilite-renderer et rend le nombre de profils oubliés', async () => {
    const r = await api.reinitialiserCompatibiliteRenderer(7);
    expect(requetes).toEqual([{ methode: 'DELETE', chemin: '/api/v1/zones/7/compatibilite-renderer' }]);
    expect(r.profils_oublies).toBe(2);
  });
});

describe('ce que l’écran dit', () => {
  const t = (k: string) => (k === 'renderer.resetCompatDone' ? '{n} oublié(s)' : k);
  it('compte les profils oubliés', () => {
    expect(messageReinitialisation(t, 3)).toBe('3 oublié(s)');
  });
  it('zéro profil n’est pas un échec : il n’y avait rien d’appris', () => {
    expect(messageReinitialisation(t, 0)).toBe('renderer.resetCompatNone');
    expect(messageReinitialisation(t, undefined)).toBe('renderer.resetCompatNone');
  });
  it('seules les zones DLNA ont une compatibilité à réinitialiser (le serveur répond 400 aux autres)', () => {
    expect(compatibiliteReinitialisable('dlna')).toBe(true);
    for (const autre of ['openhome', 'local', 'airplay2', null, undefined]) {
      expect(compatibiliteReinitialisable(autre)).toBe(false);
    }
  });
});

describe('la fiche du renderer', () => {
  it('une zone DLNA porte le bouton, et le clic efface le profil appris', async () => {
    const succes = vi.spyOn(notifications, 'success');
    const fiche = mount(RendererConfig, { target: document.body, props: { zone: zone('dlna') } });
    flushSync();
    const bouton = document.querySelector<HTMLButtonElement>('.rc-compat button');
    expect(bouton, 'le bouton « Réinitialiser la compatibilité » doit être sur la fiche').not.toBeNull();
    bouton!.click();
    await vi.waitFor(() => expect(succes).toHaveBeenCalled());
    expect(requetes).toContainEqual({ methode: 'DELETE', chemin: '/api/v1/zones/7/compatibilite-renderer' });
    unmount(fiche);
  });

  it('un échec du serveur est dit, pas tu', async () => {
    reponse = { status: 404, corps: { error: 'zone_not_found' } };
    const erreur = vi.spyOn(notifications, 'error');
    const fiche = mount(RendererConfig, { target: document.body, props: { zone: zone('dlna') } });
    flushSync();
    document.querySelector<HTMLButtonElement>('.rc-compat button')!.click();
    await vi.waitFor(() => expect(erreur).toHaveBeenCalled());
    unmount(fiche);
  });

  it('une zone OpenHome n’a pas le bouton', () => {
    const fiche = mount(RendererConfig, { target: document.body, props: { zone: zone('openhome') } });
    flushSync();
    expect(document.querySelector('.rc-compat button')).toBeNull();
    unmount(fiche);
  });
});

describe('les libellés', () => {
  it.each(ONZE_LANGUES)('%s porte les cinq clés', (langue) => {
    const dict = dictionnaire(langue);
    for (const cle of CLES) {
      expect(dict[cle], `${langue} : ${cle}`).toBeTruthy();
    }
    expect(dict['renderer.resetCompatDone']).toContain('{n}');
  });
});
