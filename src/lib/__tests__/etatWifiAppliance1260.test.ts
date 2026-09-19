import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { etatWifi, MESSAGE_ETAT_WIFI } from '../etatWifiAppliance';
import type { ApplianceStatus } from '../api';

// #1260 — « Aucun réseau détecté » servait pour « pas de carte », « radio
// coupée » et « rien à portée ». Cas réel : sisyphe, Tune OS en Ethernet,
// forum-hifi.fr 19/09/2026.

const statut = (devices: ApplianceStatus['devices'], extra: Partial<ApplianceStatus> = {}): ApplianceStatus => ({
  appliance: true,
  devices,
  ethernet_connected: true,
  wifi_connected: false,
  wifi_ssid: null,
  wifi_signal: null,
  ...extra,
});
const eth = { device: 'enp1s0', type: 'ethernet', state: 'connected', connection: 'Wired' };
const wlan = (state: string) => ({ device: 'wlan0', type: 'wifi', state, connection: null });
const borne = { ssid: 'Maison', signal: 70, security: 'WPA2', in_use: false };

describe('etatWifi (#1260)', () => {
  it("machine en Ethernet SANS carte WiFi : le dit, au lieu de « aucun réseau »", () => {
    expect(etatWifi(statut([eth]), [], false)).toBe('sans-carte');
  });
  it('ne fait pas attendre une recherche qui ne peut rien trouver', () => {
    expect(etatWifi(statut([eth]), [], true)).toBe('sans-carte');
  });
  it('carte présente mais radio coupée : unavailable', () => {
    expect(etatWifi(statut([eth, wlan('unavailable')]), [], false)).toBe('carte-indisponible');
  });
  it('carte ignorée par NetworkManager : unmanaged', () => {
    expect(etatWifi(statut([eth, wlan('unmanaged')]), [], false)).toBe('carte-non-geree');
  });
  it('carte disponible, liste vide : rien à portée', () => {
    expect(etatWifi(statut([eth, wlan('disconnected')]), [], false)).toBe('rien-a-portee');
  });
  it('carte disponible, recherche en cours : recherche', () => {
    expect(etatWifi(statut([eth, wlan('disconnected')]), [], true)).toBe('recherche');
  });
  it('des réseaux trouvés priment sur tout', () => {
    expect(etatWifi(statut([eth]), [borne], false)).toBe('liste');
  });
  it("nmcli muet (network_error) : ne conclut rien sur la carte", () => {
    const s = statut([], { network_error: 'Délai dépassé lors de l’opération WiFi' });
    expect(etatWifi(s, [], false)).toBe('rien-a-portee');
    expect(etatWifi(null, [], true)).toBe('recherche');
  });
  it('contre-épreuve : une seule carte disponible parmi deux suffit à chercher', () => {
    const deux = [wlan('unavailable'), { ...wlan('disconnected'), device: 'wlan1' }];
    expect(etatWifi(statut(deux), [], false)).toBe('rien-a-portee');
  });
});

describe('messages et branchement (#1260)', () => {
  const langues = ['fr', 'en', 'de', 'es', 'it', 'ro', 'sv', 'hu', 'zh', 'ja', 'ko'];
  it('chaque message existe dans les 11 langues', () => {
    for (const l of langues) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf-8');
      for (const cle of Object.values(MESSAGE_ETAT_WIFI)) {
        expect(src, `${l} : ${cle}`).toContain(`"${cle}":`);
      }
    }
  });
  it('les DEUX écrans Réglages passent par etatWifi, plus par la longueur de la liste', () => {
    for (const f of ['src/components/SettingsView.svelte', 'src/components/v2/SettingsV2.svelte']) {
      const src = readFileSync(f, 'utf-8');
      expect(src, f).toMatch(/\$derived\(etatWifi\(/);
      expect(src, f).toContain('MESSAGE_ETAT_WIFI[wifiEtat]');
      expect(src, f).not.toMatch(/:else if !?wifiNe?t?s?\w*\.?length( === 0)?\}\s*\n\s*<p[^>]*>\{\$t\('settings\.wifiNoNetworks/);
    }
  });
});
