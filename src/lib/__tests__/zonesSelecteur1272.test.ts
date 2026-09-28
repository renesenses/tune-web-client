// @vitest-environment jsdom
//
// #1272 — Ludovic Audouin, v0.9.156, 19/09/2026 : la zone Diretta « dCS
// Vivaldi Upsampler Plus USB », zone par défaut ET en cours de lecture,
// n'apparaissait pas dans la liste des zones de la barre de lecture, alors que
// la zone « LVDS » y était.
//
// Le sélecteur ne gardait qu'une zone par `output_device_id`, et gardait la
// PREMIÈRE venue : deux zones sur le même appareil, et la zone pilotée
// disparaissait de son propre sélecteur. Le compteur de l'en-tête, lui,
// comptait encore la zone masquée.
//
// ⚠️ Attentes RÉVISÉES par #1664 (Patatorz, 27/09/2026, « Non toujours pas
// réglé »). Ce fichier exigeait aussi que l'AUTRE zone du groupe disparaisse
// (`not.toContain(LVDS.name)`) : personne ne l'a jamais demandé, et c'est
// précisément le défaut. L'attendu de #1272 — « garder la zone pilotée plutôt
// que la première venue » — est tenu a fortiori quand les deux lignes
// restent. Le regroupement ne vaut plus que pour l'indistinguable : même
// appareil ET même nom (voir `zonesSelecteur1664.test.ts`). Les témoins qui
// portent la règle de représentation la jouent donc sur un groupe de MÊME nom,
// le seul où elle décide encore de quelque chose.
//
// Deux étages de témoins :
// 1. la règle, sur la vraie fonction `zonesDuSelecteur` ;
// 2. la VRAIE barre de lecture montée, son sélecteur ouvert : on lit les
//    lignes rendues et le compteur, pas le code source.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { zonesDuSelecteur } from '../zonesSelecteur';

const LVDS = { id: 7, name: 'Diretta LVDS', output_device_id: 'diretta:target-1', online: true, state: 'stopped', volume: 0.4 };
const USB = { id: 9, name: 'dCS Vivaldi Upsampler Plus USB', output_device_id: 'diretta:target-1', online: true, state: 'playing', volume: 0.4 };
const SALON = { id: 1, name: 'Salon', output_device_id: 'alsa:hw0', online: true, state: 'stopped', volume: 0.4 };
const NAVIGATEUR = { id: 3, name: 'Navigateur', output_device_id: null, online: true, state: 'stopped', volume: 0.4 };

describe('#1272 — zonesDuSelecteur : la zone pilotée est dans son propre sélecteur', () => {
  it('liste la zone PILOTÉE même quand une autre zone, plus haut, partage son appareil', () => {
    const rendu = zonesDuSelecteur([SALON, LVDS, USB, NAVIGATEUR], USB.id);
    expect(
      rendu.map((z) => z.id),
      'la zone pilotée a disparu de son propre sélecteur (#1272) : le dédoublonnage par appareil garde la première venue',
    ).toContain(USB.id);
    // #1664 : la zone LVDS n'a pas à disparaître pour autant.
    expect(rendu.map((z) => z.id)).toEqual([SALON.id, LVDS.id, USB.id, NAVIGATEUR.id]);
  });

  it('reste à une zone par appareil ET par nom (la garde de 2fe77a3e contre les centaines de doublons)', () => {
    const doublons = Array.from({ length: 300 }, (_, i) => ({ id: 100 + i, name: 'Chambre', output_device_id: 'dlna:uuid-1' }));
    const rendu = zonesDuSelecteur([...doublons, SALON], SALON.id);
    expect(rendu.map((z) => z.id)).toEqual([100, SALON.id]);
  });

  // ⚠️ Attente RÉVISÉE par #1345. Elle disait « la première venue » sur un
  // montage où `USB` est justement en LECTURE — c'est-à-dire exactement ce dont
  // Ludovic s'est plaint en v0.9.158 : sa zone qui joue restait invisible
  // parce qu'il pilotait une troisième zone. « La première venue » ne vaut
  // donc plus que si AUCUNE zone du groupe ne se distingue.
  it('dans un groupe indistinguable, c’est la zone qui JOUE qui le représente (#1345)', () => {
    const a = { ...LVDS, name: 'Diretta' };
    const b = { ...USB, name: 'Diretta' };
    expect(zonesDuSelecteur([a, b, SALON], SALON.id).map((z) => z.id)).toEqual([b.id, SALON.id]);
    expect(zonesDuSelecteur([a, b], null).map((z) => z.id)).toEqual([b.id]);
  });

  it('aucune zone ne se distingue : la première venue, comme avant', () => {
    const a = { ...LVDS, name: 'Diretta', state: 'stopped' };
    const b = { ...USB, name: 'Diretta', state: 'stopped' };
    expect(zonesDuSelecteur([a, b, SALON], SALON.id).map((z) => z.id)).toEqual([a.id, SALON.id]);
    expect(zonesDuSelecteur([a, b], null).map((z) => z.id)).toEqual([a.id]);
  });

  it('ne regroupe jamais les zones sans appareil', () => {
    const a = { id: 1, output_device_id: null };
    const b = { id: 2, output_device_id: undefined };
    const c = { id: 3, output_device_id: '' };
    expect(zonesDuSelecteur([a, b, c], 2).map((z) => z.id)).toEqual([1, 2, 3]);
  });

  it('le plafond de cinquante lignes ne peut pas exclure la zone pilotée', () => {
    const beaucoup = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, output_device_id: `dev-${i}` }));
    const rendu = zonesDuSelecteur(beaucoup, 70);
    expect(rendu).toHaveLength(50);
    expect(rendu.some((z) => z.id === 70), 'la zone pilotée, au-delà du plafond, a été coupée').toBe(true);
  });
});

// ── La vraie barre de lecture ──────────────────────────────────────────────

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

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

function barreAvecSelecteurOuvert(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TransportBar, { target: hote });
  flushSync();
  const bouton = hote.querySelector('.zone-selector-btn') as HTMLButtonElement | null;
  expect(bouton, 'le sélecteur de zones a disparu de la barre').not.toBeNull();
  bouton!.click();
  flushSync();
  return hote;
}

describe('#1272 — la barre de lecture montée', () => {
  it('le sélecteur liste la zone pilotée, et son compteur compte les lignes affichées', () => {
    zones.set([SALON, LVDS, USB, NAVIGATEUR] as never);
    currentZoneId.set(USB.id);
    const el = barreAvecSelecteurOuvert();

    const noms = Array.from(el.querySelectorAll('.zone-popover-row .zone-popover-name')).map((n) => n.textContent?.trim());
    expect(
      noms,
      'la zone pilotée « dCS Vivaldi Upsampler Plus USB » manque au sélecteur de la barre de lecture (#1272)',
    ).toContain(USB.name);
    // #1664 : et la zone du même appareil n'a pas été sacrifiée pour ça.
    expect(noms).toContain(LVDS.name);

    const compteur = el.querySelector('.zone-popover-count')?.textContent?.trim();
    expect(
      compteur,
      `le compteur de l'en-tête (${compteur}) ne correspond pas aux ${noms.length} lignes affichées (#1272)`,
    ).toBe(String(noms.length));

    // La ligne ACTIVE est bien celle de la zone pilotée.
    const active = el.querySelector('.zone-popover-row.active .zone-popover-name')?.textContent?.trim();
    expect(active).toBe(USB.name);
  });
});

// #1345 — Ludovic Audouin, v0.9.158 : la zone dCS, PAR DÉFAUT et EN LECTURE,
// restait invisible parce qu'il pilotait une troisième zone (le Serenade).
// L'attendu tenu ici : elle est LÀ. #1664 retire l'exigence inverse — « et
// LVDS n'y est pas » — qui n'a jamais été demandée par personne.

describe('#1345 — la zone qui joue est dans le sélecteur', () => {
  const lvds = { id: 7, output_device_id: 'diretta:target-1', name: 'LVDS' };
  const dcs = {
    id: 12,
    output_device_id: 'diretta:target-1',
    name: 'dCS Vivaldi',
    state: 'playing',
    is_default: true,
  };
  const serenade = { id: 3, output_device_id: 'dlna:serenade', name: 'Serenade' };
  const zones = [lvds, dcs, serenade];

  it('pilote ailleurs : la zone qui JOUE est listée', () => {
    const r = zonesDuSelecteur(zones, serenade.id).map((z) => z.name);
    expect(r).toEqual(['LVDS', 'dCS Vivaldi', 'Serenade']);
  });

  it('la zone pilotée est listée elle aussi', () => {
    const r = zonesDuSelecteur(zones, lvds.id).map((z) => z.name);
    expect(r).toEqual(['LVDS', 'dCS Vivaldi', 'Serenade']);
  });

  it('sans lecture, la zone PAR DÉFAUT reste listée', () => {
    const dcsArretee = { ...dcs, state: 'stopped' };
    const r = zonesDuSelecteur([lvds, dcsArretee, serenade], serenade.id).map((z) => z.name);
    expect(r).toEqual(['LVDS', 'dCS Vivaldi', 'Serenade']);
  });

  it('dans un groupe de MÊME nom, la zone qui joue représente le groupe', () => {
    const a = { id: 7, output_device_id: 'diretta:target-1', name: 'Diretta' };
    const b = { id: 12, output_device_id: 'diretta:target-1', name: 'Diretta', state: 'playing' };
    expect(zonesDuSelecteur([a, b, serenade], serenade.id).map((z) => z.id)).toEqual([b.id, serenade.id]);
  });

  it('contre-épreuve : même nom, rien qui distingue, la première gagne comme avant', () => {
    const neutres = [
      { id: 7, output_device_id: 'diretta:target-1', name: 'Diretta' },
      { id: 12, output_device_id: 'diretta:target-1', name: 'Diretta' },
    ];
    expect(zonesDuSelecteur(neutres, null).map((z) => z.id)).toEqual([7]);
  });

  it('la pause compte comme une écoute en cours', () => {
    const a = { id: 7, output_device_id: 'diretta:target-1', name: 'Diretta' };
    const enPause = { id: 12, output_device_id: 'diretta:target-1', name: 'Diretta', state: 'paused' };
    const r = zonesDuSelecteur([a, enPause, serenade], serenade.id).map((z) => z.id);
    expect(r).toEqual([enPause.id, serenade.id]);
  });

  it('la place du groupe dans la liste ne bouge pas', () => {
    const avant = { id: 1, output_device_id: 'dlna:a', name: 'Avant' };
    const apres = { id: 2, output_device_id: 'dlna:b', name: 'Après' };
    const a = { id: 7, output_device_id: 'diretta:target-1', name: 'Diretta' };
    const b = { id: 12, output_device_id: 'diretta:target-1', name: 'Diretta', state: 'playing' };
    const r = zonesDuSelecteur([avant, a, b, apres], null).map((z) => z.id);
    expect(r).toEqual([avant.id, b.id, apres.id]);
  });

  it('le plafond ne peut pas exclure la zone qui joue', () => {
    const remplissage = Array.from({ length: 5 }, (_, i) => ({
      id: 100 + i,
      output_device_id: `dlna:${i}`,
      name: `Z${i}`,
    }));
    const r = zonesDuSelecteur([...remplissage, dcs], null, 3).map((z) => z.name);
    expect(r).toHaveLength(3);
    expect(r).toContain('dCS Vivaldi');
  });
});
