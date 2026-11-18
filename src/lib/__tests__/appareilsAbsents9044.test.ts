import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { V2_SETTINGS } from '../v2Settings';
import {
  absentsAOublier,
  libelleAbsence,
  libelleAbsent,
  lireAbsents,
  type AppareilAbsent,
} from '../appareilsAbsents';
import * as api from '../api';
import { dictionnaire } from './onzeDictionnaires';

// api.ts lit un jeton dans localStorage et pousse des bandeaux : on les
// remplace, comme `api.empty-body.test.ts`.
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

/**
 * tune-server-rust#9044 — oublier les appareils partis du réseau (go de
 * Bertrand le 18/11 pour la rc13). Ils restaient listés, grisés, à vie ;
 * supprimer leur zone ne faisait que la masquer.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'nb', 'pl', 'el', 'tr'];

function absent(p: Partial<AppareilAbsent>): AppareilAbsent {
  return {
    device_id: 'uuid:x', name: 'Ampli', type: 'dlna', zone_id: 1, zone_name: 'Salon',
    zone_hidden: false, last_seen_at: null, absent_for_s: null, ...p,
  };
}

const t = (k: string) => `[${k}]{n}`;

describe('libellé « absent depuis »', () => {
  it('jours, heures, minutes, ou date inconnue', () => {
    expect(libelleAbsence(3 * 86_400 + 5, t)).toBe('[settings.absentSinceDays]3');
    expect(libelleAbsence(86_400, t)).toBe('[settings.absentSinceDay]1');
    expect(libelleAbsence(5 * 3600 + 1, t)).toBe('[settings.absentSinceHours]5');
    expect(libelleAbsence(120, t)).toBe('[settings.absentSinceMinutes]{n}');
    expect(libelleAbsence(null, t)).toBe('[settings.absentSinceUnknown]{n}');
  });
});

describe('oubli groupé : même règle que le serveur', () => {
  it('absents depuis au moins N jours, datés, chaque appareil une fois', () => {
    const items = [
      absent({ device_id: 'vieux', absent_for_s: 30 * 86_400 }),
      absent({ device_id: 'vieux', zone_id: 2, absent_for_s: 9 * 86_400 }),
      absent({ device_id: 'recent', absent_for_s: 3600 }),
      absent({ device_id: 'jamais-vu', absent_for_s: null }),
    ];
    expect(absentsAOublier(items, 7).map((i) => i.device_id)).toEqual(['vieux']);
    expect(absentsAOublier(items, 0).map((i) => i.device_id)).toEqual(['vieux', 'recent']);
  });

  it('lit un corps malformé comme une liste vide', () => {
    expect(lireAbsents(null)).toEqual([]);
    expect(lireAbsents({ items: [{ device_id: '' }, { device_id: 'a' }] })).toHaveLength(1);
    expect(libelleAbsent(absent({ zone_name: ' ', name: '' }))).toBe('uuid:x');
  });
});

describe('les appels au serveur', () => {
  afterEach(() => vi.unstubAllGlobals());

  function espion(corps: unknown) {
    const f = vi.fn(async () => new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', f);
    return f;
  }

  it('oublier un appareil envoie DELETE avec l’accord pour la zone', async () => {
    const f = espion({ device_id: 'uuid:a b', forgotten: true, zones_deleted: [4] });
    await api.forgetDevice('uuid:a b');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/devices/uuid%3Aa%20b?with_zone=true');
    expect(init.method).toBe('DELETE');
  });

  it('oublier les absents envoie le seuil en jours', async () => {
    const f = espion({ older_than_days: 7, forgotten: [], zones_deleted: [], skipped: [] });
    await api.forgetAbsentDevices(7);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/devices/absent/forget?older_than_days=7');
    expect(init.method).toBe('POST');
  });

  it('la liste des absents lit `items`, et un serveur sans la route rend []', async () => {
    espion({ total: 1, items: [absent({})] });
    expect(await api.listAbsentDevices()).toHaveLength(1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await api.listAbsentDevices()).toEqual([]);
  });
});

describe('l’écran : Réglages › Appareils › Appareils absents', () => {
  function bloc(): string {
    const debut = V2.indexOf("{:else if s.id === 'absentDevices'}");
    expect(debut, 'aucun rendu pour la section').toBeGreaterThan(-1);
    return V2.slice(debut, V2.indexOf('{:else if s.id ===', debut + 1));
  }

  it('la section est dans l’onglet Appareils, au niveau débutant', () => {
    const onglet = V2_SETTINGS.find((o) => o.id === 'devices')!;
    const s = onglet.sections.find((x) => x.id === 'absentDevices');
    expect(s?.min).toBe('beginner');
  });

  it('chaque ligne dit depuis quand, et confirme DANS la page en nommant la zone', () => {
    const b = bloc();
    expect(b).toContain('libelleAbsence(a.absent_for_s');
    expect(b).toContain("'settings.forgetDeviceConfirmZone'");
    expect(b).toContain('onclick={() => oublierAppareil(a)}');
    expect(b).toContain("'settings.forgetAbsentDevices'");
    expect(b).toContain('onclick={oublierAbsents}');
    expect(b, 'une liste vide doit le dire').toContain("'settings.noAbsentDevices'");
    // Pas de boîte du navigateur : la confirmation est dans la page.
    expect(b).not.toMatch(/\bconfirm\(/);
    expect(V2).not.toMatch(/window\.confirm\(|[^.\w]confirm\(\$t\('settings\.forget/);
  });

  it('le bouton n’appelle le serveur qu’après la confirmation', () => {
    const b = bloc();
    const avantConfirmation = b.slice(b.indexOf('{:else}'));
    expect(avantConfirmation).toContain('oubliAConfirmer = a.device_id');
    expect(avantConfirmation.split('{/if}')[0]).not.toContain('oublierAppareil(');
  });

  it('toutes les clés existent dans les seize langues', () => {
    // Clés ÉCRITES en entier : un gabarit qui colle le suffixe passerait pour une
    // clé dynamique et couvrirait tout `settings.*` (referencesFaiblesI18n).
    const cles = ['settings.absentDevices', 'settings.absentDevicesIntro', 'settings.noAbsentDevices',
      'settings.absentSinceDay', 'settings.absentSinceDays', 'settings.absentSinceHours',
      'settings.absentSinceMinutes', 'settings.absentSinceUnknown', 'settings.forgetDevice',
      'settings.forgetDeviceConfirmZone', 'settings.forgetDeviceConfirm', 'settings.deviceForgotten',
      'settings.forgetAbsentDevices', 'settings.forgetAbsentDevicesLabel',
      'settings.forgetAbsentDevicesConfirm', 'settings.absentDevicesForgotten'];
    for (const l of LANGUES) {
      const dico = dictionnaire(l);
      for (const c of cles) expect(dico[c], `${l} : ${c}`).toBeTruthy();
      expect(dico['settings.absentSinceDays']).toContain('{n}');
      expect(dico['settings.forgetDeviceConfirmZone']).toContain('{zone}');
      expect(dico['settings.forgetAbsentDevices']).toContain('{days}');
    }
  });
});
