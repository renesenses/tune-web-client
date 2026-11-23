import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { V2_SETTINGS } from '../v2Settings';
import { dureesProposees, joursDepuis, libelleAbsent, libelleAppareil, lireAbsents, lireRegle, separer, zonesNommees, zonesVisibles, type AppareilAbsent } from '../appareilsAbsents';
import * as api from '../api';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

// api.ts lit un jeton dans localStorage et pousse des bandeaux : on les
// remplace, comme `api.empty-body.test.ts`.
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

/**
 * tune-server-rust#9044 — oublier les appareils partis du réseau (go de
 * Bertrand le 18/11 pour la rc13). rc14 (23/11) : le serveur date le départ
 * et oublie tout seul après la durée réglée ; oublier GARDE la zone, la
 * supprimer est un second geste confirmé dans la page.
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const API = readFileSync('src/lib/api.ts', 'utf8');
const LANGUES = [...ONZE_LANGUES];

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

  it('oublier un appareil envoie DELETE SANS l’accord pour ses zones : la zone reste', async () => {
    const f = espion({ device_id: 'uuid:a b', forgotten: true, zones_deleted: [] });
    await api.forgetDevice('uuid:a b');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/devices\/uuid%3Aa%20b$/);
    expect(init.method).toBe('DELETE');
  });

  it('supprimer la zone d’un appareil oublié est le SEUL appel avec with_zone', async () => {
    const f = espion({ device_id: 'uuid:a', forgotten: true, zones_deleted: [{ zone_id: 4, zone_name: 'Salon' }] });
    await api.deleteForgottenDeviceZones('uuid:a');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/devices/uuid%3Aa?with_zone=true');
    expect(init.method).toBe('DELETE');
    // Un seul appel (les commentaires ne comptent pas) : l'URL écrite.
    expect(API.match(/\)\}\?with_zone=true`/g)).toHaveLength(1);
  });

  it('la règle d’oubli : lue (null sur serveur ancien), écrite en PUT', async () => {
    espion({ after_days: 30, default_days: 30, max_days: 365 });
    expect(await api.getForgetPolicy()).toEqual({ after_days: 30, default_days: 30, max_days: 365 });
    espion({ error: 'not found' }, 404);
    expect(await api.getForgetPolicy()).toBeNull();
    const f = espion({ after_days: 0 });
    await api.setForgetPolicy(0);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/devices/forget-policy');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ after_days: 0 });
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

  it('une ligne par zone représentante (clé `zone_id`), durée prise au SEUL départ daté', () => {
    const b = bloc();
    expect(b).toContain('{#each absents as a (a.zone_id)}');
    expect(b).toContain('{#each oublies as a (a.zone_id)}');
    expect(b).toContain('{libelleAbsence(a)}');
    expect(corpsDe('libelleAbsence')).toContain('joursDepuis(a.absent_since)');
    expect(corpsDe('libelleAbsence')).toContain("'settings.absentLabel'");
    expect(b).not.toMatch(/absent_for_s|last_seen_at/);
  });

  it('le réglage : Jamais ou une durée, écrit au changement', () => {
    const b = bloc();
    expect(b).toContain('data-reglage="oubli-automatique"');
    expect(b).toContain('dureesProposees(regleOubli.after_days)');
    expect(b).toContain("'settings.forgetNever'");
    expect(corpsDe('changerRegleOubli')).toContain('api.setForgetPolicy(jours)');
  });

  it('supprimer la zone d’un oublié : confirmation dans la page, qui nomme la zone et ses réglages', () => {
    const b = bloc();
    const oublies = b.slice(b.indexOf('{#each oublies'));
    expect(oublies).toContain("'settings.deleteForgottenZoneConfirm'");
    expect(oublies).toContain("replace('{zones}', zonesNommees(a,");
    const ligne = oublies.slice(oublies.indexOf('{:else}'));
    expect(ligne.split('{/if}')[0]).toContain('ouvrirSuppression(a, ev)');
    expect(ligne.split('{/if}')[0]).not.toContain('supprimerZoneOubliee(');
    expect(corpsDe('supprimerZoneOubliee')).toContain('api.deleteForgottenDeviceZones(a.device_id)');
    expect(corpsDe('oublierAppareil')).toContain('api.forgetDevice(a.device_id)');
  });

  it('confirmation DANS la page, qui nomme l’appareil et ses zones, avant tout appel', () => {
    const b = bloc();
    expect(b).toContain("'settings.forgetDeviceKeepZone'");
    expect(b).toContain("replace('{device}', libelleAppareil(a, netLabel))");
    expect(b).toContain("replace('{zones}', zonesNommees({ ...a, zones: zonesVisibles(a) },");
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

  it('toutes les clés existent dans les vingt langues, avec leurs gabarits', () => {
    // Clés ÉCRITES en entier (un gabarit passerait pour une clé dynamique).
    const cles = ['settings.absentDevices', 'settings.absentDevicesIntro', 'settings.noAbsentDevices',
      'settings.absentLabel', 'settings.absentDevicesLoadError', 'settings.forgetDevice',
      'settings.zoneAlreadyDeleted', 'settings.deviceForgotten',
      'settings.absentSinceDays', 'settings.forgetAfter', 'settings.forgetAfterHint', 'settings.forgetNever',
      'settings.forgetAfterDays', 'settings.forgetDeviceKeepZone', 'settings.forgetDeviceNoZone',
      'settings.forgottenDevicesIntro', 'settings.forgottenOn', 'settings.forgottenAutoOn',
      'settings.deleteForgottenZone', 'settings.deleteForgottenZoneConfirm', 'settings.forgottenZoneDeleted',
      'v2.zone.badgeDeviceForgotten', 'v2.zone.deviceForgottenLong'];
    const gabarits: Record<string, string[]> = {
      'settings.absentSinceDays': ['{n}'], 'settings.forgetAfterDays': ['{n}'],
      'settings.forgetDeviceKeepZone': ['{device}', '{zones}'], 'settings.forgetDeviceNoZone': ['{device}'],
      'settings.forgottenOn': ['{date}'], 'settings.forgottenAutoOn': ['{date}'],
      'settings.deleteForgottenZoneConfirm': ['{zones}'], 'settings.forgottenZoneDeleted': ['{name}'],
    };
    expect(LANGUES).toHaveLength(20);
    for (const l of LANGUES) {
      const dico = dictionnaire(l);
      for (const c of cles) expect(dico[c], `${l} : ${c}`).toBeTruthy();
      for (const [c, gs] of Object.entries(gabarits)) for (const g of gs) expect(dico[c], `${l} : ${c}`).toContain(g);
    }
  });
});

describe('rc14 : départ daté, règle, oubliés', () => {
  it('la carte de zone dit « Appareil oublié » seulement HORS LIGNE', () => {
    const zones = readFileSync('src/components/v2/ZonesV2.svelte', 'utf8');
    expect(zones).toContain("if (z.online === false && z.device_forgotten === true) return { cls: 'bad', txt: $t('v2.zone.badgeDeviceForgotten'");
  });

  it('jours depuis le départ : entiers, jamais inventés', () => {
    const maintenant = Date.parse('2026-11-23T12:00:00Z');
    expect(joursDepuis('2026-11-20T11:00:00Z', maintenant)).toBe(3);
    expect(joursDepuis(null, maintenant)).toBeNull();
    expect(joursDepuis('pas une date', maintenant)).toBeNull();
  });

  it('absents et oubliés séparés ; les zones visibles seules restent nommées', () => {
    const a = absent({});
    const o = absent({ device_id: 'uuid:o', zone_id: 2, forgotten: true,
      zones: [{ zone_id: 2, zone_name: 'Cuisine', zone_hidden: false }, { zone_id: 3, zone_name: 'Vieille', zone_hidden: true }] });
    expect(separer([a, o])).toEqual({ absents: [a], oublies: [o] });
    expect(zonesVisibles(o).map((z) => z.zone_id)).toEqual([2]);
  });

  it('règle : lue prudemment, durée du serveur ajoutée aux choix', () => {
    expect(lireRegle({ after_days: 30, default_days: 30, max_days: 365 })?.after_days).toBe(30);
    expect(lireRegle({ error: 'x' })).toBeNull();
    expect(dureesProposees(30)).toContain(0);
    expect(dureesProposees(45)).toContain(45);
  });
});
