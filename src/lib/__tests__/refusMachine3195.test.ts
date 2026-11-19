// @vitest-environment jsdom
//
// web#3195 — sous Tune OS, « Éteindre » et « Redémarrer » la machine
// affichaient le code brut « auth_required » : `applianceFetch` jetait
// `new Error(json.error)`. La garde serveur `AdminOuCetteMachine`
// (tune-server-rust, `auth.rs`) répond, sur `/appliance/shutdown` et
// `/appliance/reboot` :
//
//  - authentification coupée, appel du réseau :
//      403 { error: "auth_required", reason: "not_local" | "port80_relay", message: "…" }
//  - authentification active, compte non administrateur :
//      403 { error: "admin role required" }
//
// Les témoins passent par la VRAIE `applianceShutdown` / `applianceReboot`
// (faux `fetch`), puis par `messageEchecActionMachine`, ce que les deux
// boutons de Réglages affichent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { applianceReboot, applianceShutdown } from '../api';
import { locale, t } from '../i18n';
import { messageEchecActionMachine } from '../refusHorsMachine';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const tr = (cle: string) => (get(t) as (c: string) => string)(cle);

function repondre(status: number, corps: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } }),
  ));
}

const NOT_LOCAL = {
  error: 'auth_required',
  reason: 'not_local',
  message: 'This action requires authentication to be enabled, or a call from this machine (localhost).',
  caller: '192.168.1.20',
  relayed: false,
};
const PORT80 = { ...NOT_LOCAL, reason: 'port80_relay', message: 'This appliance relays port 80…' };
const ADMIN = { error: 'admin role required' };

beforeEach(() => { locale.set('fr'); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('#3195 — applianceFetch jette la phrase, pas le code brut', () => {
  it('🔴 contre-épreuve : applianceShutdown refusé → phrase traduite, avec code, status et corps', async () => {
    repondre(403, NOT_LOCAL);
    const e: any = await applianceShutdown().catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).not.toBe('auth_required');
    expect(e.message).not.toContain('auth_required');
    expect(e.message).toContain(tr('machineAction.notLocal'));
    expect(e.code).toBe('auth_required');
    expect(e.status).toBe(403);
    expect(e.corps?.reason).toBe('not_local');
    // Le brut n'est pas perdu : il part dans le « Détails » replié.
    expect(e.detail).toContain('auth_required');
  });

  it('une autre erreur serveur ne montre pas non plus son code brut', async () => {
    repondre(500, { error: 'systemctl_failed' });
    const e: any = await applianceReboot().catch((x) => x);
    expect(e.message).not.toBe('systemctl_failed');
    expect(e.status).toBe(500);
    // Générique, mais dit : le bouton ne reste pas grisé en silence.
    expect(messageEchecActionMachine(e, tr)).toBe(e.message);
  });
});

describe('#3195 — Éteindre / Redémarrer : une phrase par raison du refus', () => {
  for (const [nom, appel] of [['Éteindre', applianceShutdown], ['Redémarrer', applianceReboot]] as const) {
    it(`${nom} — not_local : dit d'activer l'authentification, et où`, async () => {
      repondre(403, NOT_LOCAL);
      const msg = messageEchecActionMachine(await appel().catch((x) => x), tr)!;
      expect(msg).toBe(`${tr('machineAction.notLocal')} ${tr('machineAction.whereToEnable')}`);
      expect(msg).not.toContain('auth_required');
    });

    it(`${nom} — port80_relay : oriente vers l'activation de l'authentification`, async () => {
      repondre(403, PORT80);
      const msg = messageEchecActionMachine(await appel().catch((x) => x), tr)!;
      expect(msg).toBe(`${tr('machineAction.port80Relay')} ${tr('machineAction.whereToEnable')}`);
      // L'écran existant ActivationAuthV2 : Réglages > Système > Authentification.
      expect(msg).toContain(tr('authActivation.title'));
      expect(msg).not.toContain('auth_required');
      expect(msg).not.toContain('relays port 80');
    });

    it(`${nom} — admin requis : la phrase traduite, pas « admin role required »`, async () => {
      repondre(403, ADMIN);
      const e: any = await appel().catch((x) => x);
      expect(e.code).toBe('admin_required');
      const msg = messageEchecActionMachine(e, tr)!;
      expect(msg).toBe(tr('machineAction.adminRequired'));
      expect(msg).not.toContain('admin role required');
    });
  }

  it('coupure de transport pendant l’extinction : rien à dire (attendue)', () => {
    expect(messageEchecActionMachine(new TypeError('Failed to fetch'), tr)).toBeNull();
  });

  it('en anglais aussi', async () => {
    locale.set('en');
    repondre(403, ADMIN);
    const msg = messageEchecActionMachine(await applianceShutdown().catch((x) => x), tr)!;
    expect(msg).toBe('Only an administrator account can shut down or restart the machine. Sign in with an administrator account.');
  });
});

describe('#3195 — 16 langues', () => {
  it('machineAction.adminRequired existe dans les 16 dictionnaires', () => {
    expect(ONZE_LANGUES.length).toBe(16);
    for (const l of ONZE_LANGUES) expect(dictionnaire(l)['machineAction.adminRequired'], l).toBeTruthy();
  });
});
