/**
 * Ignorer un appareil, durablement (#1280) — ce que le client ASSEMBLE.
 *
 * Deux exigences dictées par le ticket, et deux tests qui les CLOUENT :
 *
 * 1. la croix des réglages appelle la route DURABLE
 *    (`POST /devices/{id}/ignore`), plus `DELETE /devices/{id}` qui n'oublie
 *    l'appareil qu'en mémoire — d'où son retour au scan suivant ;
 * 2. il existe un écran « appareils ignorés », sans quoi l'utilisateur se
 *    piège lui-même : un appareil ignoré n'est annoncé NULLE PART.
 *
 * Ce que ces tests ne prouvent pas : l'allure à l'écran. Le dépôt n'a pas de
 * harnais de rendu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  detailAppareilIgnore,
  libelleAppareilIgnore,
  sansAppareils,
  transportAppareilIgnore,
  type AppareilIgnore,
} from '../appareilsIgnores';

const appareil = (p: Partial<AppareilIgnore> = {}): AppareilIgnore => ({
  device_id: 'uuid:1',
  mac: '',
  host: '',
  name: '',
  device_type: '',
  created_at: null,
  ...p,
});

describe("une ligne d'appareil ignoré reste toujours identifiable", () => {
  it('affiche le nom annoncé quand il y en a un', () => {
    expect(libelleAppareilIgnore(appareil({ name: 'Sonos One' }))).toBe('Sonos One');
  });

  it("retombe sur l'hôte, puis sur l'identifiant", () => {
    // `instantane_d_identite` interroge le scanner, le registre des sorties,
    // puis la zone persistée : si aucune ne répond, l'instantané se réduit à
    // l'identifiant. Une ligne VIDE serait indébloquable en pratique.
    expect(libelleAppareilIgnore(appareil({ host: '192.168.1.42' }))).toBe('192.168.1.42');
    expect(libelleAppareilIgnore(appareil({ device_id: 'uuid:abc' }))).toBe('uuid:abc');
  });

  it('ne prend pas un nom fait d\'espaces pour un nom', () => {
    expect(libelleAppareilIgnore(appareil({ name: '   ', host: 'salon.local' }))).toBe('salon.local');
  });
});

describe('le détail dit POURQUOI trois UUID ne font qu\'une ligne', () => {
  it("montre l'hôte et la MAC, les deux identités testées après l'id", () => {
    expect(detailAppareilIgnore(appareil({ host: '192.168.1.42', mac: 'AA:BB:CC:DD:EE:FF' })))
      .toBe('192.168.1.42 · AA:BB:CC:DD:EE:FF');
  });

  it('écarte les champs vides plutôt que de les rendre par un tiret', () => {
    // Le serveur rend ces champs VIDES, pas absents : un « — · — » serait du
    // bruit fabriqué par le client.
    expect(detailAppareilIgnore(appareil({ host: '192.168.1.42' }))).toBe('192.168.1.42');
    expect(detailAppareilIgnore(appareil())).toBe('');
  });

  it("n'affiche pas de pastille de transport quand le serveur n'a rien figé", () => {
    expect(transportAppareilIgnore(appareil())).toBe('');
    expect(transportAppareilIgnore(appareil({ device_type: 'dlna' }))).toBe('DLNA');
  });
});

describe('la ligne quitte la liste affichée tout de suite', () => {
  it("retire l'identifiant visé et celui que le serveur a figé", () => {
    // Le serveur a déjà retiré l'appareil de `GET /devices` ; la liste
    // affichée, elle, a été chargée AVANT le geste. Sans ce retrait local, le
    // clic aurait l'air sans effet.
    const liste = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(sansAppareils(liste, ['b', 'c'])).toEqual([{ id: 'a' }]);
  });

  it("ignore les identifiants vides — l'instantané peut n'en porter aucun", () => {
    const liste = [{ id: 'a' }, { id: 'b' }];
    expect(sansAppareils(liste, ['', 'b'])).toEqual([{ id: 'a' }]);
  });
});

describe('EXIGENCE 1 : la croix appelle la route durable, pas l\'ancienne', () => {
  const vue = readFileSync(join('src', 'components', 'SettingsView.svelte'), 'utf8');
  const apiSrc = readFileSync(join('src', 'lib', 'api.ts'), 'utf8');

  it('la croix de la liste des appareils réseau appelle handleIgnoreDevice', () => {
    expect(vue).toMatch(/class="device-delete-btn"[^>]*onclick=\{\(\) => handleIgnoreDevice\(/);
  });

  it("l'écran n'appelle plus api.deleteDevice, qui n'oublie qu'en mémoire", () => {
    // `DELETE /devices/{id}` retire la sortie du registre et des appareils
    // manuels persistés — rien n'empêche la découverte de la ré-enregistrer.
    // C'est le « ils réapparaissent rapidement » du ticket.
    expect(vue).not.toContain('api.deleteDevice(');
  });

  it('handleIgnoreDevice passe par api.ignoreDevice', () => {
    const debut = vue.indexOf('async function handleIgnoreDevice');
    expect(debut).toBeGreaterThan(-1);
    expect(vue.slice(debut, debut + 900)).toContain('api.ignoreDevice(');
  });

  it('api.ignoreDevice vise POST /devices/{id}/ignore', () => {
    const debut = apiSrc.indexOf('export function ignoreDevice');
    const corps = apiSrc.slice(debut, debut + 400);
    expect(corps).toContain('/ignore');
    expect(corps).toContain("method: 'POST'");
  });
});

describe('EXIGENCE 2 : il existe un écran « appareils ignorés »', () => {
  const vue = readFileSync(join('src', 'components', 'SettingsView.svelte'), 'utf8');
  const apiSrc = readFileSync(join('src', 'lib', 'api.ts'), 'utf8');

  it("l'écran lit GET /devices/ignored — la SEULE vue qui les annonce encore", () => {
    const debut = apiSrc.indexOf('export function listIgnoredDevices');
    expect(debut).toBeGreaterThan(-1);
    expect(apiSrc.slice(debut, debut + 300)).toContain('/devices/ignored');
    expect(vue).toContain('api.listIgnoredDevices()');
  });

  it('chaque ligne offre le retour en arrière', () => {
    expect(vue).toContain('handleUnignoreDevice');
    expect(vue).toContain("$t('settings.unignoreDevice')");
  });

  it('débloquer est un DELETE sur la MÊME adresse que le blocage', () => {
    const debut = apiSrc.indexOf('export function unignoreDevice');
    const corps = apiSrc.slice(debut, debut + 400);
    expect(corps).toContain('/ignore');
    expect(corps).toContain("method: 'DELETE'");
  });

  it("la section dit son vide plutôt que de disparaître", () => {
    // Une section absente quand la liste est vide laisserait croire que
    // l'écran n'existe pas — c'est précisément le piège à éviter.
    expect(vue).toContain("$t('settings.noIgnoredDevices')");
  });
});
