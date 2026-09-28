// @vitest-environment jsdom
//
// #1664 — Patatorz, fil 1860, réponse 6966, 27/09/2026 : « Non toujours pas
// réglé ». Deux correctifs (#1272 puis #1345) ont changé QUI survit au
// regroupement par `output_device_id` ; aucun n'a demandé si ce regroupement
// avait lieu d'être. Sa zone Diretta dCS reste absente du sélecteur de la
// barre de lecture alors que la page Zones l'affiche — les deux lisent
// pourtant le même magasin `zones`.
//
// Ce que ces témoins gardent : une zone que l'utilisateur peut NOMMER ne
// disparaît jamais du sélecteur. On ne regroupe que l'indistinguable — même
// appareil ET même nom. Le garde-fou du figeage de juin 2026 (`2fe77a3e`)
// reste le plafond de cinquante lignes, et les doublons du même appareil
// portant le même nom se regroupent toujours.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { zonesDuSelecteur, cleDeGroupe } from '../zonesSelecteur';

// Les deux Targets du DDC-0 de Ludovic / Patatorz. Le même `output_device_id`
// est l'hypothèse de #1272, jamais mesurée : on la prend au pire, puisque
// c'est elle qui faisait disparaître une ligne.
const LVDS = { id: 7, name: 'Diretta LVDS', output_device_id: 'diretta:target-1', state: 'stopped' };
const DCS = {
  id: 12,
  name: 'dCS Vivaldi Upsampler Plus USB',
  output_device_id: 'diretta:target-1',
  state: 'stopped',
};
const SERENADE = { id: 3, name: 'Serenade', output_device_id: 'dlna:serenade', state: 'playing' };

describe('#1664 — aucune zone nommée ne disparaît du sélecteur', () => {
  it('la zone dCS À L’ARRÊT, sans être pilotée, est listée malgré la zone LVDS du même appareil', () => {
    const rendu = zonesDuSelecteur([LVDS, DCS, SERENADE], SERENADE.id).map((z) => z.name);
    expect(
      rendu,
      'la zone Diretta dCS est encore masquée par une autre zone du même appareil (#1664) : le sélecteur regroupe sur le seul `output_device_id`',
    ).toContain(DCS.name);
    expect(rendu).toEqual([LVDS.name, DCS.name, SERENADE.name]);
  });

  it('aucune des quatre positions du rang ne fait disparaître l’autre zone', () => {
    // Pilotée, en lecture, par défaut, quelconque : les deux lignes restent.
    const cas: Array<[string, unknown[], number | null]> = [
      ['pilotée ailleurs', [LVDS, DCS, SERENADE], SERENADE.id],
      ['dCS pilotée', [LVDS, DCS], DCS.id],
      ['LVDS pilotée', [LVDS, DCS], LVDS.id],
      ['dCS en lecture', [LVDS, { ...DCS, state: 'playing' }], null],
      ['dCS par défaut', [LVDS, { ...DCS, is_default: true }], null],
      ['rien ne distingue', [LVDS, DCS], null],
    ];
    for (const [quoi, liste, pilotee] of cas) {
      const noms = zonesDuSelecteur(liste as never[], pilotee).map((z: never) => (z as any).name);
      expect(noms, `« ${quoi} » : une des deux zones Diretta a disparu du sélecteur (#1664)`).toEqual(
        expect.arrayContaining([LVDS.name, DCS.name]),
      );
    }
  });

  it('le regroupement ne tient plus qu’à l’indistinguable : même appareil ET même nom', () => {
    expect(cleDeGroupe(LVDS)).not.toBe(cleDeGroupe(DCS));
    // Le nom est plié (espaces, casse) : deux saisies du même nom ne font pas
    // deux lignes.
    expect(cleDeGroupe({ id: 1, name: ' Salon ', output_device_id: 'dlna:a' })).toBe(
      cleDeGroupe({ id: 2, name: 'salon', output_device_id: 'dlna:a' }),
    );
    // Une zone sans appareil ne se regroupe avec personne, comme avant.
    expect(cleDeGroupe({ id: 3, name: 'Navigateur', output_device_id: null })).toBeNull();
  });

  it('la garde de juin 2026 tient : les doublons du même appareil ET du même nom se regroupent', () => {
    const doublons = Array.from({ length: 300 }, (_, i) => ({
      id: 100 + i,
      name: 'Chambre',
      output_device_id: 'uuid:RINCON_B8E937B44D08',
      state: 'stopped',
    }));
    const rendu = zonesDuSelecteur([...doublons, SERENADE], SERENADE.id);
    expect(rendu.map((z) => z.id)).toEqual([100, SERENADE.id]);
  });

  it('et le plafond borne la liste même quand rien ne se regroupe', () => {
    const beaucoup = Array.from({ length: 80 }, (_, i) => ({
      id: i + 1,
      name: `Zone ${i}`,
      output_device_id: 'diretta:target-1',
      state: 'stopped',
    }));
    const rendu = zonesDuSelecteur(beaucoup, 70);
    expect(rendu).toHaveLength(50);
    expect(rendu.some((z) => z.id === 70), 'la zone pilotée est tombée sous le plafond').toBe(true);
  });
});

// ── La vraie barre de lecture ──────────────────────────────────────────────

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}),
    text: async () => '{}',
  }) as unknown as Response));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('#1664 — la barre de lecture montée', () => {
  it('le sélecteur ouvert montre les DEUX zones Diretta, et son compteur les compte', () => {
    zones.set([LVDS, DCS, SERENADE] as never);
    currentZoneId.set(SERENADE.id);

    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(TransportBar, { target: hote });
    flushSync();
    const bouton = hote.querySelector('.zone-selector-btn') as HTMLButtonElement | null;
    expect(bouton, 'le sélecteur de zones a disparu de la barre').not.toBeNull();
    bouton!.click();
    flushSync();

    const noms = Array.from(hote.querySelectorAll('.zone-popover-row .zone-popover-name')).map(
      (n) => n.textContent?.trim(),
    );
    expect(
      noms,
      'la zone « dCS Vivaldi Upsampler Plus USB » manque au sélecteur de la barre de lecture (#1664)',
    ).toContain(DCS.name);
    expect(noms, 'la zone « Diretta LVDS » a été masquée à son tour (#1664)').toContain(LVDS.name);

    const compteur = hote.querySelector('.zone-popover-count')?.textContent?.trim();
    expect(
      compteur,
      `le compteur de l'en-tête (${compteur}) ne correspond pas aux ${noms.length} lignes affichées`,
    ).toBe(String(noms.length));
  });
});
