// @vitest-environment jsdom
//
// #902 — le jeton Discogs voyage avec la sauvegarde cloud, chiffré avec le
// reste de l'instantané (serveur : section `service_tokens`, liste fermée).
//
// Ces témoins tiennent ce que l'écran en dit :
//  1. le bilan de restauration annonce « Jeton Discogs repris » quand le
//     serveur l'a réécrit, et rien sinon (serveur antérieur compris) ;
//  2. l'écran monté l'affiche vraiment après la restauration ;
//  3. l'introduction ne prétend plus qu'aucun jeton ne voyage : elle nomme
//     l'exception Discogs, dans les onze langues ; la nouvelle clé existe
//     partout.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SauvegardeCloudV2 from '../../components/v2/SauvegardeCloudV2.svelte';
import {
  lignesDuBilan,
  jetonDiscogsRepris,
  type BilanRestauration,
  type EtatSauvegardeCloud,
  type InstantaneCloud,
} from '../sauvegardeCloud';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const BILAN: BilanRestauration = {
  settings_written: 3, zones_created: 0, zones_updated: 0, profiles_created: 0,
  playlists_restored: 0, playlists_replaced: 0, favorites_restored: 0, radios_restored: 0,
  warnings: [],
};

describe('bilan — le jeton Discogs repris est annoncé', () => {
  it('repris : une ligne « Jeton Discogs repris »', () => {
    const b = { ...BILAN, service_tokens_restored: ['discogs_token'] };
    expect(jetonDiscogsRepris(b)).toBe(true);
    expect(lignesDuBilan(b).map((l) => l.cle)).toContain('cloudBackup.reportDiscogs');
  });
  it('non repris, ou serveur antérieur qui ne le dit pas : rien', () => {
    expect(lignesDuBilan({ ...BILAN, service_tokens_restored: [] }).map((l) => l.cle))
      .not.toContain('cloudBackup.reportDiscogs');
    expect(lignesDuBilan(BILAN).map((l) => l.cle)).not.toContain('cloudBackup.reportDiscogs');
    expect(jetonDiscogsRepris(null)).toBe(false);
  });
});

// ── Écran monté ────────────────────────────────────────────────────

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

const ETAT: EtatSauvegardeCloud = {
  premium: true, account_linked: true, enabled: true, key_configured: true,
  last_backup_at: '2026-10-12T08:00:00Z', last_attempt_at: null, last_error: null,
  pending_since: null, debounce_minutes: 10, max_snapshots: 3,
};
const INSTANTANE: InstantaneCloud = {
  id: 4, server_id: 'srv-a', server_label: 'Salon', key_id: '0123456789abcdef', format_version: 1,
  size_bytes: 48_000, created_at: '2026-10-12T08:00:00Z', this_server: true, local_key: true,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const methode = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/system/config-backup/cloud/status')) return json(ETAT);
    if (url.includes('/system/config-backup/cloud/snapshots')) return json({ backups: [INSTANTANE], max: 3 });
    if (url.includes('/system/config-backup/cloud/restore') && methode === 'POST') {
      return json({
        success: true, key_adopted: false,
        report: { ...BILAN, service_tokens_restored: ['discogs_token'] },
      });
    }
    return json({});
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

async function attendre(cond: () => boolean, essais = 80) {
  for (let i = 0; i < essais && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
}

describe('Réglages › Sauvegarde — après restauration', () => {
  it('le bilan affiché dit que le jeton Discogs est repris', async () => {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(SauvegardeCloudV2, { target: cible });
    await attendre(() => !!cible.querySelector('.liste li'));
    (cible.querySelector('.liste li button') as HTMLButtonElement).click();
    flushSync();
    const lancer = [...cible.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === dictionnaire('fr')['cloudBackup.confirmRestore'],
    )!;
    lancer.click();
    const attendu = dictionnaire('fr')['cloudBackup.reportDiscogs'];
    await attendre(() => (cible.textContent ?? '').includes(attendu));
    expect(cible.textContent, 'le bilan ne dit pas que le jeton Discogs est repris').toContain(attendu);
    unmount(c);
  });
});

// ── i18n ───────────────────────────────────────────────────────────

describe('i18n — Discogs dans les onze langues', () => {
  it('la ligne du bilan existe partout, non vide, et nomme Discogs', () => {
    for (const l of ONZE_LANGUES) {
      const v = dictionnaire(l)['cloudBackup.reportDiscogs'];
      expect(v, `${l} : cloudBackup.reportDiscogs manque`).toBeTruthy();
      expect(v, `${l} : la ligne ne nomme pas Discogs`).toContain('Discogs');
    }
  });
  it('l’introduction nomme l’exception Discogs au lieu de dire qu’aucun jeton ne part', () => {
    for (const l of ONZE_LANGUES) {
      expect(dictionnaire(l)['cloudBackup.intro'], `${l} : l’intro tait le jeton Discogs`).toContain('Discogs');
    }
  });
});
