// @vitest-environment jsdom
//
// Tune Circle (décision du 19/11/2026) : sur un serveur dont l'authentification
// est active, seules les sessions administrateur modifient le cercle, et un
// client passé par le relais ne fait que lire. Le serveur refuse en 403
// `circle.admin_required` ou `circle.remote_read_only` ; l'écran dit une phrase
// claire et désactive ses gestes d'écriture au lieu d'afficher une erreur.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin, motifCercle, revoquerContact } from '../circle';
import {
  cercleLectureSeule, motifLectureSeuleDuCode, noterRefusDeDroit, verifierDroitsCercle,
  CODE_ADMIN_REQUIS, CODE_LECTURE_SEULE_A_DISTANCE,
} from '../circleDroits';
import fr from '../locales/fr';

const rep = (status: number, corps?: unknown): Response => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => corps, text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
}) as unknown as Response;

/** Le refus que le serveur rend aux écritures (`null` : il les accepte). */
let refus: string | null = null;
let ecrits: string[] = [];

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  vi.useFakeTimers();
  refus = null; ecrits = [];
  cercleLectureSeule.set(null);
  circlePlugin.set(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (u.includes('/ext/circle')) {
      const chemin = u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, '');
      if (method !== 'GET') {
        ecrits.push(`${method} ${chemin}`);
        return refus ? rep(403, { error: refus, code: refus, message: 'refus', message_key: 'k' }) : rep(200, { ok: true });
      }
      if (chemin === '') {
        return rep(200, {
          members: [{ user_id: 7, name: 'Alice', since: '2026-09-01T10:00:00Z' }], sent: [],
          received: [{ id: 21, name_or_email: 'Denis', created_at: '2026-09-21T08:00:00Z', expires_at: '2026-12-21T08:00:00Z' }],
          circles: [{ id: 1, name: 'Amis', member_ids: [7] }],
        });
      }
      if (chemin === '/library-sync') return rep(200, { last_sync: null });
      if (chemin === '/contacts/locations' || chemin === '/world/points' || chemin === '/shared-with-me' || chemin === '/blocks') return rep(200, []);
      return rep(404, { error: 'not_found' });
    }
    if (u.endsWith('/plugins')) return rep(200, [{ name: 'circle', installed: true, enabled: true }]);
    return rep(200, {});
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
});
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  vi.unstubAllGlobals(); vi.useRealTimers();
});
async function laisserFaire() { for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); } }
async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CircleV2 as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}

describe('les deux codes de refus', () => {
  it('sont reconnus, et eux seuls', () => {
    expect(motifLectureSeuleDuCode(CODE_ADMIN_REQUIS)).toBe('admin');
    expect(motifLectureSeuleDuCode(CODE_LECTURE_SEULE_A_DISTANCE)).toBe('distant');
    expect(motifLectureSeuleDuCode('admin role required')).toBeNull();
    expect(motifLectureSeuleDuCode('not_available_remotely')).toBeNull();
    expect(noterRefusDeDroit('circle.not_found')).toBeNull();
    expect(get(cercleLectureSeule)).toBeNull();
  });

  it('ont leur phrase dans les motifs du cercle', () => {
    expect(motifCercle({ status: 403, code: CODE_ADMIN_REQUIS }).cle).toBe('v2.circle.err.adminRequired');
    expect(motifCercle({ status: 403, code: CODE_LECTURE_SEULE_A_DISTANCE }).cle).toBe('v2.circle.err.remoteReadOnly');
    expect((fr as Record<string, string>)['v2.circle.err.adminRequired']).toMatch(/administrateur/);
    expect((fr as Record<string, string>)['v2.circle.err.remoteReadOnly']).toMatch(/réseau local/);
  });

  it('un 403 du serveur dit la phrase de l’interface et met l’écran en lecture seule', async () => {
    refus = CODE_ADMIN_REQUIS;
    let err: any = null;
    try { await revoquerContact(7); } catch (e) { err = e; }
    expect(err?.status).toBe(403);
    expect(err?.code).toBe(CODE_ADMIN_REQUIS);
    expect(err?.message).toBe((fr as Record<string, string>)['v2.circle.err.adminRequired']);
    expect(get(cercleLectureSeule)).toBe('admin');
  });
});

describe('verifierDroitsCercle', () => {
  it('relais : lecture seule sans rien demander', async () => {
    const lireMoi = vi.fn();
    expect(await verifierDroitsCercle(lireMoi, () => true, () => 'jeton')).toBe('distant');
    expect(lireMoi).not.toHaveBeenCalled();
    expect(get(cercleLectureSeule)).toBe('distant');
  });

  it('session d’un profil non administrateur : lecture seule', async () => {
    expect(await verifierDroitsCercle(async () => ({ role: 'user' }), () => false, () => 'jeton')).toBe('admin');
  });

  it('administrateur, authentification coupée ou /auth/me en échec : gestes offerts', async () => {
    expect(await verifierDroitsCercle(async () => ({ role: 'admin' }), () => false, () => 'jeton')).toBeNull();
    const lireMoi = vi.fn();
    expect(await verifierDroitsCercle(lireMoi, () => false, () => null)).toBeNull();
    expect(lireMoi).not.toHaveBeenCalled();
    expect(await verifierDroitsCercle(async () => { throw new Error('x'); }, () => false, () => 'jeton')).toBeNull();
    expect(await verifierDroitsCercle(async () => ({ error: 'profile not found' }) as never, () => false, () => 'jeton')).toBeNull();
    expect(get(cercleLectureSeule)).toBeNull();
  });
});

describe('écran Tune Circle', () => {
  it('gestes offerts par défaut', async () => {
    const el = await poser();
    expect(el.querySelector('.lecture-seule')).toBeNull();
    expect(el.querySelector('.inviter-entete')).not.toBeNull();
    expect((el.querySelector('button.accepter') as HTMLButtonElement).disabled).toBe(false);
    expect((el.querySelector('button.revoquer') as HTMLButtonElement).disabled).toBe(false);
  });

  it('après un refus de droit : la phrase, et les gestes d’écriture désactivés ou masqués', async () => {
    refus = CODE_ADMIN_REQUIS;
    const el = await poser();
    expect(el.querySelector('.lecture-seule')).toBeNull();
    // Un geste d'écriture refusé par le serveur (ici, par l'API du cercle).
    await revoquerContact(7).catch(() => undefined);
    expect(ecrits).toEqual(['DELETE /members/7']);
    await laisserFaire();
    const bandeau = el.querySelector('.lecture-seule');
    expect(bandeau?.textContent?.trim()).toBe((fr as Record<string, string>)['v2.circle.err.adminRequired']);
    expect(el.querySelector('.inviter-entete')).toBeNull();
    expect(el.querySelector('.bloc.inviter')).toBeNull();
    expect(el.querySelector('.ajouter-membre')).toBeNull();
    for (const sel of ['button.accepter', 'button.refuser', 'button.revoquer', 'button.renommer', 'button.supprimer']) {
      const b = el.querySelector(sel) as HTMLButtonElement | null;
      expect(b, sel).not.toBeNull();
      expect(b!.disabled, sel).toBe(true);
    }
  });

  it('client distant : lecture seule dès l’ouverture, phrase du relais', async () => {
    cercleLectureSeule.set('distant');
    const el = await poser();
    // `verifierDroitsCercle` relit l'état au montage : ici, page hors relais et
    // sans session, il le remet à `null` — on repose l'état du relais ensuite.
    cercleLectureSeule.set('distant');
    await laisserFaire();
    expect(el.querySelector('.lecture-seule')?.textContent?.trim()).toBe((fr as Record<string, string>)['v2.circle.err.remoteReadOnly']);
    expect((el.querySelector('button.accepter') as HTMLButtonElement).disabled).toBe(true);
  });
});
