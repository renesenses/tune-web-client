// @vitest-environment jsdom
//
// tune-server-rust#6120 — RATTACHER À LA MAIN UNE ZONE ORPHELINE À UNE SORTIE
// ASIO PRÉSENTE (décision de Bertrand du 12/10/2026).
//
// Gros Bidon (fil 2215) : la zone 14 « Sortie SMSL SU-8 » visait un pilote
// ASIO disparu ; « USB DAC ASIO » était présent, mais le serveur refuse, à bon
// droit, de ré-associer seul une zone ASIO. Ces témoins gardent les trois
// fils : le menu propose le geste à une zone dont la sortie est absente (et à
// elle seule), le déroulé rattache le pilote confirmé, et l'API appelle la
// route du serveur telle quelle.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { entreesMenuZone, type GestesZone } from '../menuZone';
import { rattacherZoneOrpheline } from '../rattacherZone';
import * as api from '../api';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

function gestes(): GestesZone {
  return {
    renommer: vi.fn(), image: vi.fn(), reglages: vi.fn(), latence: vi.fn(),
    appairer: vi.fn(), fusionner: vi.fn(), rattacher: vi.fn(), supprimer: vi.fn(), correction: vi.fn(),
  };
}

const USB_DAC_ASIO = { device_id: 'local:USB DAC ASIO', name: 'USB DAC ASIO', backend: 'asio' };

describe('#6120 — le menu propose « Rattacher » à une zone orpheline, et à elle seule', () => {
  it('une zone dont la sortie est absente porte l’entrée, reliée à son geste', () => {
    const g = gestes();
    const e = entreesMenuZone({ expert: false, appairable: false, jumelle: null, rattachable: true }, g);
    const r = e.find((x) => x.cle === 'v2.zone.reattach');
    expect(r, 'entrée « Rattacher » absente du menu d’une zone orpheline').toBeTruthy();
    r!.faire();
    expect(g.rattacher).toHaveBeenCalledOnce();
    expect(e[e.length - 1].cle, 'la suppression reste la dernière').toBe('zone.deleteZone');
  });

  it('une zone dont la sortie est présente ne la porte pas', () => {
    const e = entreesMenuZone({ expert: true, appairable: true, jumelle: null, rattachable: false }, gestes());
    expect(e.map((x) => x.cle)).not.toContain('v2.zone.reattach');
  });

  it('l’écran Zones mesure `sortie_absente` et branche le geste', () => {
    const src = lire('src/components/v2/ZonesV2.svelte');
    expect(src).toContain('rattachable: z.sortie_absente === true');
    expect(src).toContain('rattacher: () => { void rattacher(z); },');
    expect(src).toContain('rattacherZoneOrpheline(');
  });

  it('les trois clés existent dans les onze langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'vi', 'el']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const k of ['v2.zone.reattach', 'v2.zone.reattachConfirm', 'v2.zone.reattachNone']) {
        expect(src, `${k} manque en ${l}`).toContain(`"${k}"`);
      }
      expect(src).toMatch(/"v2\.zone\.reattachConfirm": "[^"]*\{zone\}[^"]*\{device\}/);
    }
  });
});

describe('#6120 — le déroulé du rattachement', () => {
  const question = 'Rattacher « {zone} » à « {device} » ?';

  it('le pilote confirmé est rattaché, avec la question qui le nomme', async () => {
    const rattacher = vi.fn().mockResolvedValue({});
    const confirmer = vi.fn().mockResolvedValue(true);
    const r = await rattacherZoneOrpheline(14, 'Sortie SMSL SU-8', {
      candidats: async () => ({ candidats: [USB_DAC_ASIO] }),
      confirmer,
      rattacher,
      question,
    });
    expect(r).toEqual({ issue: 'rattachee', deviceId: 'local:USB DAC ASIO' });
    expect(confirmer).toHaveBeenCalledWith('Rattacher « Sortie SMSL SU-8 » à « USB DAC ASIO » ?');
    expect(rattacher).toHaveBeenCalledWith(14, 'local:USB DAC ASIO');
  });

  it('sans candidat, rien n’est envoyé et l’écran le dit', async () => {
    const rattacher = vi.fn();
    const r = await rattacherZoneOrpheline(14, 'Z', {
      candidats: async () => ({ candidats: [] }),
      confirmer: vi.fn(),
      rattacher,
      question,
    });
    expect(r).toEqual({ issue: 'aucun_candidat' });
    expect(rattacher).not.toHaveBeenCalled();
  });

  it('refusé, rien n’est envoyé ; avec deux pilotes, le second accepté est celui rattaché', async () => {
    const rattacher = vi.fn().mockResolvedValue({});
    const annule = await rattacherZoneOrpheline(14, 'Z', {
      candidats: async () => ({ candidats: [USB_DAC_ASIO] }),
      confirmer: async () => false,
      rattacher,
      question,
    });
    expect(annule).toEqual({ issue: 'annule' });
    expect(rattacher).not.toHaveBeenCalled();

    const reponses = [false, true];
    const deux = await rattacherZoneOrpheline(14, 'Z', {
      candidats: async () => ({
        candidats: [{ ...USB_DAC_ASIO, device_id: 'local:ASIO4ALL v2', name: 'ASIO4ALL v2' }, USB_DAC_ASIO],
      }),
      confirmer: async () => reponses.shift() ?? false,
      rattacher,
      question,
    });
    expect(deux).toEqual({ issue: 'rattachee', deviceId: 'local:USB DAC ASIO' });
    expect(rattacher).toHaveBeenCalledOnce();
    expect(rattacher).toHaveBeenCalledWith(14, 'local:USB DAC ASIO');
  });
});

describe('#6120 — l’API appelle la route du serveur', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('GET puis POST /zones/{id}/rattacher, le device_id dans le corps', async () => {
    const appels: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ?? null });
      const corps = (init?.method ?? 'GET') === 'GET'
        ? { zone_id: 14, candidats: [USB_DAC_ASIO] }
        : { zone_id: 14, output_device_id: 'local:USB DAC ASIO' };
      return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const c = await api.getRattachementCandidats(14);
    expect(c.candidats[0].device_id).toBe('local:USB DAC ASIO');
    await api.rattacherZone(14, 'local:USB DAC ASIO');
    expect(appels[0].url).toMatch(/\/zones\/14\/rattacher(?:\?lang=[a-z]{2})?$/);
    expect(appels[0].method).toBe('GET');
    expect(appels[1].url).toMatch(/\/zones\/14\/rattacher(?:\?lang=[a-z]{2})?$/);
    expect(appels[1].method).toBe('POST');
    expect(JSON.parse(String(appels[1].body))).toEqual({ device_id: 'local:USB DAC ASIO' });
  });
});
