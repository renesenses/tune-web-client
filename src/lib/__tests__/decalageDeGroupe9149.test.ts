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
const LOCALE: Zone = { id: 3, name: 'Carte son', output_type: 'local', output_device_id: 'local:0', volume: 0.5, state: 'stopped' } as Zone;
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

/**
 * rc14 (retours de Rémi) — la lecture groupée, décalage compris, a sa propre
 * fenêtre (`section: 'groupe'`, ouverte par « Lecture groupée… ») ; la
 * fenêtre de configuration garde « Décalage sync » (sortie locale).
 */
async function ouvrir(zone: Zone, groups: ZoneGroupResponse[], section: 'groupe' | null = null) {
  monte = mount(ZoneConfigModal, {
    target: cible,
    props: {
      zone,
      allZones: [MENEUSE, SUIVEUSE, LOCALE],
      groups,
      onClose: () => {},
      onDelete: () => {},
      onGroupChanged: () => {},
      onRenamed: () => {},
      section,
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
  it('les quatre libellés existent dans les vingt langues', () => {
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
    const racine = await ouvrir(SUIVEUSE, [], 'groupe');
    expect(racine.querySelector('[data-testid="decalage-de-groupe"]')).toBeNull();
    expect(lireDecalage).not.toHaveBeenCalled();
  });

  it('la valeur vient du serveur, avec un libellé traduit', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir(SUIVEUSE, [GROUPE], 'groupe');
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
    const racine = await ouvrir(SUIVEUSE, [GROUPE], 'groupe');
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
    const racine = await ouvrir(MENEUSE, [GROUPE], 'groupe');
    const bloc = racine.querySelector('[data-testid="decalage-de-groupe"]')!;
    expect(bloc.textContent).toContain(fr['zone.groupOffsetLeader']);
  });
});

/**
 * Fil 2757 — « Décalage sync » (#8437) ne retarde que la sortie LOCALE de la
 * machine Tune. Proposé sur une zone réseau, avec un texte qui promettait un
 * calage « par rapport au leader du groupe », il a fait régler la suiveuse
 * au mauvais endroit. On PRÉVIENT au lieu de masquer (fil 1671, voir le mono
 * dans `sortieMonoZone.test.ts`) : sur une zone réseau, la section reste,
 * avec une note qui renvoie au « Décalage dans le groupe » ; le champ ne
 * reste que pour remettre à zéro une ancienne valeur.
 *
 * Contre-épreuves : retirer la note fait tomber le premier ; retirer la
 * garde `startsWith('local:')` fait tomber le troisième ; conditionner le
 * champ au seul `decalageSyncPropose` fait tomber le quatrième ; remettre
 * l'ancien `zone.syncOffsetDesc` fait tomber le dernier.
 */
function titres(racine: HTMLElement) {
  return [...racine.querySelectorAll('.section-title')].map((h) => h.textContent?.trim());
}
function sectionSync(racine: HTMLElement) {
  return [...racine.querySelectorAll('.modal-section')].find(
    (s) => s.querySelector('.section-title')?.textContent?.trim() === fr['zone.syncOffset'],
  );
}

describe('fil 2757 — « Décalage sync » : prévenir sur une zone réseau', () => {
  it('une zone réseau garde la section, avec la note qui renvoie au décalage de groupe', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir(SUIVEUSE, [GROUPE]);
    expect(titres(racine)).toContain(fr['zone.syncOffset']);
    const section = sectionSync(racine)!;
    expect(section.querySelector('.mono-note')?.textContent?.trim()).toBe(fr['zone.syncOffsetLocalOnly']);
    // Rien à régler ici : pas de champ tant qu'aucune ancienne valeur n'est posée.
    expect(section.querySelector('input.sync-input')).toBeNull();
    // Son vrai réglage est dans la fenêtre de la lecture groupée (rc14),
    // à un clic : le lien « Lecture groupée… » de la fenêtre.
    racine.querySelector<HTMLButtonElement>('[data-ouvrir-groupe]')!.click();
    await attendre();
    expect(racine.querySelector('[data-testid="decalage-de-groupe"]')).not.toBeNull();
  });

  it('une zone locale garde « Décalage sync », son champ, et aucune note', { timeout: DELAI_MONTAGE }, async () => {
    const racine = await ouvrir(LOCALE, []);
    expect(titres(racine)).toContain(fr['zone.syncOffset']);
    const section = sectionSync(racine)!;
    expect(section.textContent).toContain(fr['zone.syncOffsetDesc']);
    expect(section.querySelector('input.sync-input')).not.toBeNull();
    expect(section.querySelector('.mono-note')).toBeNull();
  });

  it('une zone sans output_type mais branchée sur local:… est locale', { timeout: DELAI_MONTAGE }, async () => {
    const sansType = { ...LOCALE, output_type: undefined, output_device_id: 'local:hw:1,0' } as unknown as Zone;
    const racine = await ouvrir(sansType, []);
    const section = sectionSync(racine)!;
    expect(section.querySelector('input.sync-input')).not.toBeNull();
    expect(section.querySelector('.mono-note')).toBeNull();
  });

  it('une zone réseau avec une ancienne valeur garde le champ, pour la remettre à zéro', { timeout: DELAI_MONTAGE }, async () => {
    const ancienne = { ...SUIVEUSE, sync_delay_ms: 250 } as Zone;
    const racine = await ouvrir(ancienne, [GROUPE]);
    const section = sectionSync(racine)!;
    expect(section.querySelector('.mono-note')?.textContent?.trim()).toBe(fr['zone.syncOffsetLocalOnly']);
    const champ = section.querySelector<HTMLInputElement>('input.sync-input');
    expect(champ).not.toBeNull();
    expect(champ!.value).toBe('250');
  });

  it('la note existe dans les vingt langues', () => {
    for (const langue of ONZE_LANGUES) {
      expect(dictionnaire(langue)['zone.syncOffsetLocalOnly'], langue).toBeTruthy();
    }
  });

  it('le texte ne promet plus un calage sur la meneuse, dans aucune langue', () => {
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      // Le texte de la sortie locale ne doit pas être celui du décalage de groupe.
      expect(d['zone.syncOffsetDesc'], langue).toBeTruthy();
      expect(d['zone.syncOffsetDesc'], langue).not.toBe(d['zone.groupOffsetDesc']);
    }
    expect(fr['zone.syncOffsetDesc']).toMatch(/sortie locale/);
    expect(fr['zone.syncOffsetDesc']).not.toMatch(/leader|meneuse/i);
    expect(dictionnaire('en')['zone.syncOffsetDesc']).toMatch(/local output/);
    expect(dictionnaire('en')['zone.syncOffsetDesc']).not.toMatch(/leader/i);
  });
});

/**
 * Serveur antérieur à la rc13 : `GET /zones/{id}/group-offset` répond 404.
 * Le curseur ne s'affiche pas, plutôt que d'offrir un réglage qui
 * n'enregistrerait rien.
 *
 * Contre-épreuve : revenir à `{#if currentGroup}` seul fait tomber ce test.
 */
describe('#9149 — serveur sans la route', () => {
  it('le GET refusé masque le bloc du décalage', { timeout: DELAI_MONTAGE }, async () => {
    lireDecalage.mockImplementationOnce(async () => { throw new Error('404'); });
    const racine = await ouvrir(SUIVEUSE, [GROUPE], 'groupe');
    expect(lireDecalage).toHaveBeenCalledWith(2);
    expect(racine.querySelector('[data-testid="decalage-de-groupe"]')).toBeNull();
  });
});
