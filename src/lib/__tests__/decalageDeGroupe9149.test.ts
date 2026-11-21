// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { fr, dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import type { Zone, ZoneGroupResponse } from '../types';
import ZoneConfigModal from '../../components/partages/ZoneConfigModal.svelte';
import { bornerDecalage, mene } from '../decalageDeGroupe';

/**
 * tune-server-rust#9149 (Jon, fil 2757) — le décalage manuel d'une zone qui
 * suit la meneuse de son groupe : lu et écrit par
 * `GET` / `PUT /zones/{id}/group-offset`, réglé dans la section « Lecture
 * groupée » du panneau de zone (curseur et champ).
 *
 * Contre-épreuve : retirer l'appel `api.setZoneGroupOffset` de
 * `enregistrerDecalageGroupe` fait tomber « Appliquer écrit… » ; semer
 * `decalageGroupe` à 0 sans lire le serveur fait tomber « la valeur vient du
 * serveur ».
 */
const DELAI_MONTAGE = 60_000;

const lireDecalage = vi.fn(async (id: number) => ({ zone_id: id, offset_ms: -350, min_ms: -2000, max_ms: 2000 }));
const ecrireDecalage = vi.fn(async (id: number, ms: number) => ({ zone_id: id, offset_ms: ms, min_ms: -2000, max_ms: 2000 }));

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return {
    ...reel,
    getZoneGroupOffset: (id: number) => lireDecalage(id),
    setZoneGroupOffset: (id: number, ms: number) => ecrireDecalage(id, ms),
  };
});

function zoneReseau(id: number, name: string): Zone {
  return { id, name, output_type: 'dlna', output_device_id: `dlna:${id}`, volume: 0.5, state: 'stopped' } as Zone;
}

const MENEUSE = zoneReseau(1, 'OAAT salon');
const SUIVEUSE = zoneReseau(2, 'DLNA cuisine');
const GROUPE: ZoneGroupResponse = {
  group_id: '1',
  leader_id: 1,
  zone_ids: [1, 2],
  auto_synced: false,
  group_manufacturer: '',
};

let cible: HTMLElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  lireDecalage.mockClear();
  ecrireDecalage.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  vi.unstubAllGlobals();
});

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrir(zone: Zone, groups: ZoneGroupResponse[]) {
  monte = mount(ZoneConfigModal, {
    target: cible,
    props: {
      zone,
      allZones: [MENEUSE, SUIVEUSE],
      groups,
      onClose: () => {},
      onDelete: () => {},
      onGroupChanged: () => {},
      onRenamed: () => {},
    },
  });
  flushSync();
  await attendre();
  return cible;
}

describe('#9149 — bornes et rôle', () => {
  it('borne la saisie à ±2000 ms, au pas de 10 ms', () => {
    expect(bornerDecalage(2500)).toBe(2000);
    expect(bornerDecalage('-2600')).toBe(-2000);
    expect(bornerDecalage(-344)).toBe(-340);
    expect(bornerDecalage('abc')).toBe(0);
    expect(bornerDecalage(-0.4)).toBe(0);
  });

  it('reconnaît la meneuse du groupe', () => {
    expect(mene(GROUPE, 1)).toBe(true);
    expect(mene(GROUPE, 2)).toBe(false);
    expect(mene(undefined, 1)).toBe(false);
  });
});

describe('#9149 — libellés', () => {
  it('les quatre libellés existent dans les seize langues', () => {
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const cle of ['zone.groupOffset', 'zone.groupOffsetDesc', 'zone.groupOffsetLeader', 'zone.groupOffsetError']) {
        expect(d[cle], `${langue} ${cle}`).toBeTruthy();
      }
    }
  });
});

describe('#9149 — le réglage dans le panneau de zone', () => {
  it('une zone hors groupe ne montre pas le réglage', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir(SUIVEUSE, []);
    expect(racine.querySelector('[data-testid="decalage-de-groupe"]')).toBeNull();
    expect(lireDecalage).not.toHaveBeenCalled();
  });

  it('la valeur vient du serveur, avec un libellé traduit', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir(SUIVEUSE, [GROUPE]);
    const bloc = racine.querySelector('[data-testid="decalage-de-groupe"]');
    expect(bloc).not.toBeNull();
    expect(bloc!.textContent).toContain(fr['zone.groupOffset']);
    expect(bloc!.textContent).not.toContain('zone.groupOffset');
    expect(lireDecalage).toHaveBeenCalledWith(2);
    const curseur = bloc!.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(curseur.min).toBe('-2000');
    expect(curseur.max).toBe('2000');
    expect(curseur.value).toBe('-350');
    // Suiveuse : pas d'avertissement « meneuse ».
    expect(bloc!.textContent).not.toContain(fr['zone.groupOffsetLeader']);
  });

  it('Appliquer écrit la valeur bornée sur le serveur', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir(SUIVEUSE, [GROUPE]);
    const bloc = racine.querySelector('[data-testid="decalage-de-groupe"]')!;
    const champ = bloc.querySelector<HTMLInputElement>('input[type="number"]')!;
    champ.value = '420';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    const appliquer = bloc.querySelector<HTMLButtonElement>('button.btn-primary');
    expect(appliquer).not.toBeNull();
    appliquer!.click();
    await attendre();
    expect(ecrireDecalage).toHaveBeenCalledWith(2, 420);
    expect(bloc.querySelector('button.btn-primary')).toBeNull();
  });

  it('sur la meneuse, le panneau dit que le réglage vaut quand elle suit', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir(MENEUSE, [GROUPE]);
    const bloc = racine.querySelector('[data-testid="decalage-de-groupe"]')!;
    expect(bloc.textContent).toContain(fr['zone.groupOffsetLeader']);
  });
});
