// @vitest-environment jsdom
//
// rc14 (Rémi, GO de Bertrand) — la marge (headroom) réglable dans TESS :
// Automatique, ou manuelle de −12 à 0 dB par pas de 0,5 dB. Le panneau dit
// la valeur RÉELLEMENT appliquée (l'étape `headroom` du chemin résolu par le
// serveur), ou pourquoi elle ne l'est pas : PURE la contourne, une sortie
// réseau sans égaliseur ne l'exécute pas. Le serveur est prouvé par
// `marge_manuelle_appliquee_et_contournee_par_pure_rc14` (tune-server-rust).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PanneauHeadroomTess from '../../components/v2/tess/PanneauHeadroomTess.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { avecHeadroom, headroomDe, minimumDuCurseur, HEADROOM_CURSEUR_MIN } from '../tessPanneaux';
import type { ChaineTess, EtapeTess } from '../tess';

const FR = lFr as Record<string, string>;
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

function etape(effective: boolean, reason: string | null = null): EtapeTess {
  return {
    code: 'headroom', plugin_id: null, fixed: true, requested: true, effective, reason,
    detail: null, params: { mode: 'manual', db: -6.5 }, latency_frames: null,
  } as EtapeTess;
}
function monter(props: Record<string, any>) {
  const onChange = vi.fn();
  composant = mount(PanneauHeadroomTess, { target: hote, props: { onChange, zoneId: 7, ...props } as any });
  flushSync();
  return onChange;
}
const curseur = () => hote.querySelector<HTMLInputElement>('[data-tess-headroom-db]')!;

beforeEach(() => {
  locale.set('fr');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined;
  hote.remove();
  vi.unstubAllGlobals();
});

describe('marge manuelle : bornes et pas', () => {
  it('le curseur va de −12 à 0 dB par 0,5 dB ; une valeur enregistrée plus basse l’élargit', () => {
    expect(HEADROOM_CURSEUR_MIN).toBe(-12);
    expect(minimumDuCurseur(-6.5)).toBe(-12);
    expect(minimumDuCurseur(-18)).toBe(-18);
    expect(minimumDuCurseur(-12.25)).toBe(-12.5);
    expect(minimumDuCurseur(Number.NaN)).toBe(-12);
    monter({ headroom: { auto: false, db: -6.5 }, effectifDb: -6.5, etape: etape(true) });
    expect([curseur().min, curseur().max, curseur().step]).toEqual(['-12', '0', '0.5']);
    expect(curseur().value).toBe('-6.5');
  });

  it('une valeur choisie part telle quelle, arrondie au demi-décibel', () => {
    const onChange = monter({ headroom: { auto: false, db: -6.5 }, effectifDb: -6.5, etape: etape(true) });
    curseur().value = '-7.5';
    curseur().dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ auto: false, db: -7.5 });
    const c: ChaineTess = { version: 1, plugins: [], fixed: { headroom: { mode: 'auto' } } } as any;
    expect(avecHeadroom(c, { auto: false, db: -7.3 }).fixed!.headroom).toEqual({ mode: 'manual', db: -7.5 });
    expect(headroomDe(avecHeadroom(c, { auto: false, db: -18 }))).toEqual({ auto: false, db: -18 });
  });

  it('Automatique / manuel : l’interrupteur bascule', () => {
    const onChange = monter({ headroom: { auto: true, db: -3 }, effectifDb: 0, etape: null });
    expect(curseur()).toBeNull();
    expect(hote.querySelector('[data-tess-headroom-applique]'), 'automatique : pas de ligne « appliquée »').toBeNull();
    hote.querySelector<HTMLElement>('[data-tess-headroom-auto]')!.click();
    flushSync();
    expect(onChange).toHaveBeenCalledWith({ auto: false, db: -3 });
  });
});

describe('marge manuelle : la valeur réellement appliquée', () => {
  it('appliquée : la valeur du serveur', () => {
    monter({ headroom: { auto: false, db: -6.5 }, effectifDb: -6.5, etape: etape(true), egaliseurActif: false });
    const l = hote.querySelector('[data-tess-headroom-applique]')!;
    expect(l.getAttribute('data-tess-headroom-applique')).toBe('oui');
    expect(l.textContent).toBe(FR['tess.headroom.applied'].replace('{db}', '−6.5 dB'));
    expect(hote.querySelector('[data-tess-headroom-note-manuel]')!.textContent).toBe(FR['tess.headroom.manualNoteNoEq']);
  });

  it('PURE la contourne : « non appliquée », avec le motif', () => {
    monter({ headroom: { auto: false, db: -6.5 }, effectifDb: 0, etape: etape(false, 'pure_mode'), egaliseurActif: true });
    const l = hote.querySelector('[data-tess-headroom-applique]')!;
    expect(l.getAttribute('data-tess-headroom-applique')).toBe('non');
    expect(l.textContent).toBe(FR['tess.headroom.notApplied'].replace('{reason}', FR['tess.reason.pure_mode']));
    expect(hote.querySelector('[data-tess-headroom-note-manuel]')!.textContent).toBe(FR['tess.headroom.manualNoteEq']);
  });

  it('sortie réseau sans égaliseur : le motif du serveur, traduit', () => {
    monter({ headroom: { auto: false, db: -6.5 }, effectifDb: 0, etape: etape(false, 'not_applied_on_transport') });
    expect(hote.querySelector('[data-tess-headroom-applique]')!.textContent)
      .toBe(FR['tess.headroom.notApplied'].replace('{reason}', FR['tess.reason.not_applied_on_transport']));
  });
});
