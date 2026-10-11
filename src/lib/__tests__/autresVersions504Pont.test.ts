// @vitest-environment jsdom
/**
 * Essai en 5G du 09/10/2026, accueil par le pont : bandeau rouge
 * « Server error: 504 ». Journal du .18 à 13:52 UTC :
 *
 *     relay local dispatch failed … url (http://127.0.0.1:8888/api/v1/home/other-versions)
 *     slow_query ms=31751 sql=SELECT lh.title, … CROSS JOIN tracks t …
 *
 * La rangée « Autres versions » de l'accueil dépasse les 30 s du relais ; le
 * pont rend 504. La rangée porte DÉJÀ son propre état d'échec et son bouton
 * « réessayer » (`PageWidgets.chargerWidget`) : le bandeau global annonçait
 * une panne de tout Tune pour un carrousel qui n'a pas chargé.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toasts: string[] = [];
vi.mock('../stores/notifications', () => ({
  notifications: {
    error: (m: string) => { toasts.push(m); },
    success: () => {}, info: () => {}, avecAction: () => {},
  },
}));

import * as api from '../api';

beforeEach(() => {
  toasts.length = 0;
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Gateway Timeout', { status: 504 })));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('« Autres versions » en 504 : la rangée échoue, sans bandeau global', () => {
  it('rejette, mais ne lève aucun « Server error »', async () => {
    await expect(api.getOtherVersions(12)).rejects.toBeTruthy();
    expect(toasts).toEqual([]);
  });
});
