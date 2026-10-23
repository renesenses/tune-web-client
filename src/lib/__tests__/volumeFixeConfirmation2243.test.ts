// @vitest-environment jsdom
//
// web#2243 — « Volume fixe » : l'armement porte la zone à 100 %. Le serveur
// l'exige avec `confirm_full_volume: true` sur TOUTE sortie, sans exception de
// type (tune-server-rust#2395) ; sans ce champ, il répond 409
// `full_volume_confirmation_required` et n'enregistre rien.
//
// Ce que ces cas tiennent :
// - avec l'accord de l'utilisateur (« 100 » tapé, Confirmer) : le PATCH porte
//   `confirm_full_volume: true` ;
// - sans cet accord (Annuler, saisie fausse, dialogue refusé) : AUCUNE requête
//   qui arme le volume fixe ne part ;
// - et cela vaut aussi pour une zone LOCALE. Elle était dispensée de la
//   confirmation : le PATCH partait sans le champ, le serveur le refusait, et le
//   réglage n'était jamais enregistré. C'est le défaut corrigé ici.
//
// Le faux serveur reproduit la garde réelle (`fixed_volume_confirmation_required`
// dans `tune-server/src/routes/zones.rs`) : 409 sans le champ.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import ZoneConfigModal from '../../components/partages/ZoneConfigModal.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { zones } from '../stores/zones';
import { dialogs } from '../stores/dialogs';
import { t } from '../i18n';
import type { Zone } from '../types';

const DELAI = 60_000;

const HQP = { id: 4, name: 'Zone 1', output_type: 'hqplayer', output_device_id: 'hqplayer-1', volume: 0.3, state: 'stopped', fixed_volume: false } as unknown as Zone;
const LOCALE = { id: 7, name: 'Bureau', output_type: 'local', output_device_id: 'local:dac-1', volume: 0.3, state: 'stopped', fixed_volume: false } as unknown as Zone;

/** Corps des PATCH /zones/{id} reçus par le faux serveur. */
let patchs: { id: number; corps: any; statut: number }[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/** Les PATCH qui demandent d'ARMER le volume fixe. */
const armements = () => patchs.filter((p) => p.corps?.fixed_volume === true);

beforeEach(() => {
  patchs = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const m = u.match(/\/zones\/(\d+)(\?|$)/);
    if (m && init?.method === 'PATCH') {
      const corps = JSON.parse(String(init.body ?? '{}'));
      const id = Number(m[1]);
      const zone = [HQP, LOCALE].find((z) => z.id === id)!;
      if (corps.fixed_volume === true && !zone.fixed_volume && corps.confirm_full_volume !== true) {
        patchs.push({ id, corps, statut: 409 });
        return json({ error: 'full_volume_confirmation_required' }, 409);
      }
      patchs.push({ id, corps, statut: 200 });
      return json({ ...zone, fixed_volume: corps.fixed_volume });
    }
    if (/\/zones(\?|$)/.test(u)) return json([HQP, LOCALE]);
    return json(/\/(profiles|devices|playlists|shortcuts|groups)(\?|$)/.test(u) ? [] : {});
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  zones.set([HQP, LOCALE]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ecranReglagesParZone(): Promise<HTMLElement> {
  v2SettingsTarget.set({ tab: 'devices', section: 'perZone' } as any);
  monte = mount(SettingsV2, { target: hote!, props: {} });
  flushSync();
  await attendre();
  return hote!;
}

function caseVolumeFixe(racine: HTMLElement, id: number): HTMLInputElement {
  const carte = racine.querySelector<HTMLElement>(`#zc-${id}`);
  expect(carte, `carte de la zone ${id} absente`).not.toBeNull();
  const libelle = get(t)('v2.lbl.fixedVolume' as any);
  const label = Array.from(carte!.querySelectorAll('label.zf.chk')).find(
    (l) => l.querySelector('span')?.textContent?.trim() === libelle,
  );
  expect(label, 'case « Volume fixe » absente').toBeTruthy();
  return label!.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

async function cocher(el: HTMLInputElement) {
  el.checked = true;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await attendre();
}

async function taper(racine: HTMLElement, texte: string) {
  const champ = racine.querySelector<HTMLInputElement>('.fvbox input');
  expect(champ, 'la boîte « tapez 100 » ne s’est pas ouverte').not.toBeNull();
  champ!.value = texte;
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
  await attendre();
  return champ!;
}

const boutonConfirmer = (racine: HTMLElement) => racine.querySelector<HTMLButtonElement>('.fvbox button.lnk.danger')!;
const boutonAnnuler = (racine: HTMLElement) => racine.querySelector<HTMLButtonElement>('.fvbox button.lnk:not(.danger)')!;

describe('#2243 — Réglages par zone : le volume fixe part avec l’accord donné, jamais sans', () => {
  for (const zone of [HQP, LOCALE]) {
    const nom = zone.output_type === 'local' ? 'zone LOCALE' : 'zone HQPlayer (réseau)';

    it(`🔴 ${nom} : cocher seul n’arme rien, la boîte « tapez 100 » s’ouvre`, { timeout: DELAI }, async () => {
      const el = await ecranReglagesParZone();
      await cocher(caseVolumeFixe(el, zone.id as number));
      expect(armements()).toEqual([]);
      expect(el.querySelector('.fvbox'), 'aucune demande d’accord').not.toBeNull();
    });

    it(`🔴 ${nom} : « 100 » puis Confirmer envoie confirm_full_volume: true, et le serveur l’enregistre`, { timeout: DELAI }, async () => {
      const el = await ecranReglagesParZone();
      await cocher(caseVolumeFixe(el, zone.id as number));
      await taper(el, '100');
      boutonConfirmer(el).click();
      await attendre();
      expect(armements()).toEqual([
        { id: zone.id, corps: { fixed_volume: true, confirm_full_volume: true }, statut: 200 },
      ]);
      expect(get(zones).find((z) => z.id === zone.id)?.fixed_volume).toBe(true);
    });

    it(`${nom} : Annuler, ou une autre saisie que 100, n’envoie aucun armement`, { timeout: DELAI }, async () => {
      const el = await ecranReglagesParZone();
      await cocher(caseVolumeFixe(el, zone.id as number));
      const champ = await taper(el, '10');
      expect(boutonConfirmer(el).disabled).toBe(true);
      champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await attendre();
      boutonAnnuler(el).click();
      await attendre();
      expect(armements()).toEqual([]);
    });
  }

  it('décocher reste immédiat, sans accord demandé', { timeout: DELAI }, async () => {
    zones.set([{ ...HQP, fixed_volume: true } as Zone, LOCALE]);
    HQP.fixed_volume = true;
    try {
      const el = await ecranReglagesParZone();
      const c = caseVolumeFixe(el, HQP.id as number);
      c.checked = false;
      c.dispatchEvent(new Event('change', { bubbles: true }));
      await attendre();
      expect(patchs).toEqual([{ id: HQP.id, corps: { fixed_volume: false }, statut: 200 }]);
    } finally {
      HQP.fixed_volume = false;
    }
  });
});

describe('#2243 — panneau de zone (clic droit) : zone locale', () => {
  function ouvrirPanneau(zone: Zone) {
    monte = mount(ZoneConfigModal, {
      target: hote!,
      props: { zone: { ...zone }, allZones: [zone], groups: [], onClose: () => {}, onDelete: () => {}, onGroupChanged: () => {}, onRenamed: () => {} },
    });
    flushSync();
    const libelle = get(t)('settings.fixedVolume' as any);
    const label = Array.from(hote!.querySelectorAll('label.zc-toggle')).find(
      (l) => l.querySelector('span')?.textContent?.trim() === libelle,
    );
    expect(label, 'interrupteur « Volume fixe » absent du panneau').toBeTruthy();
    return label!.querySelector('input[type="checkbox"]') as HTMLInputElement;
  }

  it('🔴 accord donné : le PATCH porte confirm_full_volume: true', { timeout: DELAI }, async () => {
    const accord = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    await cocher(ouvrirPanneau(LOCALE));
    expect(accord).toHaveBeenCalledTimes(1);
    expect(accord.mock.calls[0][1]).toEqual({ danger: true });
    expect(armements()).toEqual([
      { id: LOCALE.id, corps: { fixed_volume: true, confirm_full_volume: true }, statut: 200 },
    ]);
  });

  it('🔴 accord refusé : aucune requête, et la case se décoche', { timeout: DELAI }, async () => {
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const c = ouvrirPanneau(LOCALE);
    await cocher(c);
    expect(patchs).toEqual([]);
    expect(c.checked).toBe(false);
  });
});
