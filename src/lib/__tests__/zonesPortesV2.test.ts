import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Écran Zones v2 — gestes portés de l'ancien gestionnaire (`ZoneManagerView`),
 * seul écran qui les offrait : appairage AirPlay par code (#1135), mesure de
 * latence, changement de sortie, groupes OAAT, délais multiroom.
 * La règle des sorties proposées est gardée par `sortiesDeZone.test.ts`.
 */
const V2 = readFileSync('src/components/v2/ZonesV2.svelte', 'utf8');
const corps = (nom: string) => {
  const i = V2.indexOf(`async function ${nom}(`);
  expect(i, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  return V2.slice(i, V2.indexOf('\n  }\n', i));
};

describe('appairage AirPlay par code (#1135)', () => {
  it('une zone AirPlay avec un appareil ouvre la fenêtre d’appairage', () => {
    // #1392 — l'appairage a quitté la rangée d'icônes nues pour le menu de la
    // zone : la condition se lit dans les capacités passées à `entreesMenuZone`.
    expect(V2).toMatch(/appairable:\s*estAirplay\(z\) && !!z\.output_device_id/);
    expect(V2).toContain('appairer: () => ouvrirAppairage(z),');
    expect(V2).toContain("import AirplayPairingModal from '../partages/AirplayPairingModal.svelte';");
    expect(V2).toMatch(/\{#if airplayPairing\}\s*<AirplayPairingModal/);
  });

  it('AirPlay 2 compte aussi', () => {
    expect(V2).toContain("z.output_type === 'airplay' || z.output_type === 'airplay2'");
  });
});

describe('latence et sortie', () => {
  it('la mesure affiche le p50 de la zone, et nomme l’échec au lieu d’un 0', () => {
    const c = corps('mesurerLatence');
    expect(c).toContain('api.measureLatency()');
    expect(c).toContain('entree?.control_rtt?.p50_ms');
    expect(c).toMatch(/if \(typeof rtt !== 'number'\) throw/);
    expect(V2).toContain('RTT {latences[z.id]} ms');
  });

  it('changer la sortie passe par la règle partagée et par changeZoneOutput', () => {
    expect(V2).toMatch(/\{#each sortiesProposees\(z, \$devices, \$zones\) as d \(d\.id\)\}/);
    expect(corps('changerSortie')).toContain('api.changeZoneOutput(zid, d.type, d.id)');
    expect(corps('changerSortie')).toContain('zones.update(');
  });
});

describe('groupes OAAT et délais multiroom', () => {
  it('les deux panneaux sont montés (Expert)', () => {
    const i = V2.indexOf('<OaatGroupsPanel />');
    expect(i).toBeGreaterThan(-1);
    expect(V2.indexOf('<MultiroomSettings />')).toBeGreaterThan(-1);
    expect(V2.lastIndexOf('{#if showExpert}', i)).toBeGreaterThan(V2.lastIndexOf('{/if}', i));
  });
});
