import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { V2_SETTINGS } from '../v2Settings';
import { libelleAbsent, libelleAppareil, lireAbsents, zonesNommees, type AppareilAbsent } from '../appareilsAbsents';
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
 * Bertrand le 18/11 pour la rc13). Un appareil à la fois ; pas de durée
 * d'absence tant que le serveur ne date pas le départ.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const API = readFileSync('src/lib/api.ts', 'utf8');
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'nb', 'pl', 'el', 'tr'];

function absent(p: Partial<AppareilAbsent>): AppareilAbsent {
  return {
    device_id: 'uuid:x', name: 'Salon', type: 'dlna', zone_id: 1,
    zones: [{ zone_id: 1, zone_name: 'Salon', zone_hidden: false }], ...p,
  };
}

describe('ce que la confirmation nomme', () => {
  it('l’appareil (protocole et identifiant) et CHAQUE zone, les supprimées marquées', () => {
    const a = absent({
      zones: [
        { zone_id: 1, zone_name: 'Salon', zone_hidden: false },
        { zone_id: 2, zone_name: 'Ancien salon', zone_hidden: true },
      ],
    });
    expect(libelleAppareil(a, (t) => t.toUpperCase())).toBe('DLNA · uuid:x');
    expect(zonesNommees(a, 'déjà supprimée')).toBe('« Salon », « Ancien salon » (déjà supprimée)');
    expect(libelleAbsent(absent({ name: ' ' }))).toBe('uuid:x');
  });

  it('lit un corps malformé comme une liste vide, et garde les zones', () => {
    expect(lireAbsents(null)).toEqual([]);
    expect(lireAbsents({ items: [{ device_id: '' , zone_id: 1 }, { device_id: 'a', zone_id: 3 }] })).toEqual([
      { device_id: 'a', zone_id: 3, zones: [] },
    ]);
  });
});

describe('les appels au serveur', () => {
  afterEach(() => vi.unstubAllGlobals());

  function espion(corps: unknown, status = 200) {
    const f = vi.fn(async () => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', f);
    return f;
  }

  it('oublier un appareil envoie DELETE avec l’accord pour ses zones', async () => {
    const f = espion({ device_id: 'uuid:a b', forgotten: true, zones_deleted: [{ zone_id: 4, zone_name: 'Salon' }] });
    await api.forgetDevice('uuid:a b');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/devices/uuid%3Aa%20b?with_zone=true');
    expect(init.method).toBe('DELETE');
  });

  it('pas d’oubli groupé en rc13', () => {
    expect(API).not.toContain('/devices/absent/forget');
    expect(V2).not.toMatch(/forgetAbsentDevices|oublierAbsents/);
  });

  it('liste : `items` lus ; 404 (serveur ancien) = [] ; 403/500 = null, pas « aucun »', async () => {
    espion({ total: 1, items: [absent({})] });
    expect(await api.listAbsentDevices()).toHaveLength(1);
    espion({ error: 'not found' }, 404);
    expect(await api.listAbsentDevices()).toEqual([]);
    espion({ error: 'admin role required' }, 403);
    expect(await api.listAbsentDevices()).toBeNull();
    espion({ error: 'database_error' }, 500);
    expect(await api.listAbsentDevices()).toBeNull();
  });
});

describe('l’écran : Réglages › Appareils › Appareils absents', () => {
  function bloc(): string {
    const debut = V2.indexOf("{:else if s.id === 'absentDevices'}");
    expect(debut, 'aucun rendu pour la section').toBeGreaterThan(-1);
    return V2.slice(debut, V2.indexOf('{:else if s.id ===', debut + 1));
  }
  function corpsDe(nom: string): string {
    const debut = V2.indexOf(`function ${nom}(`);
    expect(debut, nom).toBeGreaterThan(-1);
    return V2.slice(debut, V2.indexOf('\n  }\n', debut));
  }

  it('la section est dans l’onglet Appareils, au niveau débutant', () => {
    const onglet = V2_SETTINGS.find((o) => o.id === 'devices')!;
    expect(onglet.sections.find((x) => x.id === 'absentDevices')?.min).toBe('beginner');
  });

  it('une ligne par zone représentante (clé `zone_id`), sans durée inventée', () => {
    const b = bloc();
    expect(b).toContain('{#each absents as a (a.zone_id)}');
    expect(b).toContain("'settings.absentLabel'");
    expect(b).not.toMatch(/absent_for_s|last_seen_at|absentSince/);
  });

  it('confirmation DANS la page, qui nomme l’appareil et ses zones, avant tout appel', () => {
    const b = bloc();
    expect(b).toContain("'settings.forgetDeviceConfirmZones'");
    expect(b).toContain("replace('{device}', libelleAppareil(a, netLabel))");
    expect(b).toContain("replace('{zones}', zonesNommees(a,");
    expect(b).not.toMatch(/\bconfirm\(/);
    // Le bouton de la ligne n'ouvre que la confirmation.
    const ligne = b.slice(b.indexOf('{:else}'));
    expect(ligne.split('{/if}')[0]).toContain('ouvrirOubli(a, ev)');
    expect(ligne.split('{/if}')[0]).not.toContain('oublierAppareil(');
  });

  it('focus : à la confirmation à l’ouverture (pas au bouton qui supprime), rendu au déclencheur', () => {
    const b = bloc();
    expect(b).toMatch(/class="oubli-conf"[^>]*tabindex="-1"[\s\S]*?use:focusALaConfirmation/);
    expect(b).not.toMatch(/class="lnk danger"[^>]*use:focusALaConfirmation/);
    expect(b).toContain("if (e.key === 'Escape') fermerOubli();");
    expect(corpsDe('fermerOubli')).toContain('.focus()');
    expect(corpsDe('ouvrirOubli')).toContain('declencheurOubli = ev.currentTarget');
  });

  it('une erreur de chargement ne se fait pas passer pour « aucun appareil absent »', () => {
    const b = bloc();
    expect(b).toMatch(/absentsErreur \? \$t\('settings\.absentDevicesLoadError'/);
    expect(V2).toContain('absentsErreur = r === null;');
  });

  it('toutes les clés existent dans les seize langues', () => {
    // Clés ÉCRITES en entier (un gabarit passerait pour une clé dynamique).
    const cles = ['settings.absentDevices', 'settings.absentDevicesIntro', 'settings.noAbsentDevices',
      'settings.absentLabel', 'settings.absentDevicesLoadError', 'settings.forgetDevice',
      'settings.forgetDeviceConfirmZones', 'settings.zoneAlreadyDeleted', 'settings.deviceForgotten'];
    for (const l of LANGUES) {
      const dico = dictionnaire(l);
      for (const c of cles) expect(dico[c], `${l} : ${c}`).toBeTruthy();
      expect(dico['settings.forgetDeviceConfirmZones'], l).toContain('{device}');
      expect(dico['settings.forgetDeviceConfirmZones'], l).toContain('{zones}');
    }
  });
});
