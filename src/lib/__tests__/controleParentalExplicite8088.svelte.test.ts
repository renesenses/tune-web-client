// @vitest-environment jsdom
// tune-server-rust#8088 — contrôle parental : la case « Masquer les contenus
// explicites » de la politique d'un profil, et le refus de lecture qu'elle
// provoque (403 `parental_explicit_refused`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PolitiqueParentaleV2 from '../../components/v2/PolitiqueParentaleV2.svelte';
import * as api from '../api';
import { locale, t } from '../i18n';
import { notifications } from '../stores/notifications';

const ENFANT = { id: 2, name: 'lea', display_name: 'Léa', avatar_color: '#10b981', is_admin: false };

const posee = (extra: Record<string, unknown> = {}) => ({
  profile_id: 2, superviseur_id: 1, revision: 3, maj_le: '2026-11-07T10:00:00Z',
  politique: { artistes_bloques: [], radios_autorisees: null, podcasts_autorises: null, ...extra },
});

type Appel = { methode: string; corps: any };
let appels: Appel[];
let serveur: (a: Appel) => { statut: number; corps?: unknown };
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

async function stabiliser() {
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const derniereNotification = () => { const l = get(notifications); return l[l.length - 1]?.message; };

beforeEach(() => {
  locale.set('fr'); appels = [];
  for (const n of get(notifications)) notifications.dismiss(n.id);
  serveur = () => ({ statut: 404, corps: { error: 'politique_parentale_absente' } });
  hote = document.createElement('div'); document.body.appendChild(hote);
  localStorage.setItem('tune-profile-id', '1');
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    const a: Appel = { methode: options?.method ?? 'GET', corps: options?.body ? JSON.parse(String(options.body)) : null };
    appels.push(a);
    const r = serveur(a);
    return new Response(JSON.stringify(r.corps ?? {}), { status: r.statut, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); vi.unstubAllGlobals(); localStorage.clear(); locale.set('fr');
});

async function monter() {
  composant = mount(PolitiqueParentaleV2, { target: hote, props: { profil: ENFANT as any } });
  flushSync(); await stabiliser();
}
const put = () => appels.find((a) => a.methode === 'PUT')!;

describe('#8088 — la case « Masquer les contenus explicites »', () => {
  it('s’affiche avec son libellé et la phrase qui dit ce qui est masqué', async () => {
    await monter();
    const section = q('[data-parental]').textContent ?? '';
    expect(section).toContain('Masquer les contenus explicites');
    expect(section).toContain('seuls les contenus marqués explicites par le service ou par une balise sont masqués'.replace(/^s/, 'S'));
    expect(q<HTMLInputElement>('[data-parental-explicite]').checked).toBe(false);
  });

  it('cochée, elle part dans la politique du PUT', async () => {
    await monter();
    serveur = (a) => a.methode === 'PUT' ? { statut: 200, corps: posee({ masquer_explicite: true }) } : { statut: 404 };
    q<HTMLInputElement>('[data-parental-explicite]').click(); flushSync();
    q('[data-parental-enregistrer]').click(); await stabiliser();
    expect(put().corps.politique.masquer_explicite).toBe(true);
    // Relue depuis la réponse du serveur : la case reste cochée.
    expect(q<HTMLInputElement>('[data-parental-explicite]').checked).toBe(true);
  });

  it('lue cochée, décochée, elle part à false (et non omise, qui garderait l’ancienne valeur côté écran)', async () => {
    serveur = (a) => a.methode === 'GET' ? { statut: 200, corps: posee({ masquer_explicite: true }) } : { statut: 200, corps: posee({ masquer_explicite: false }) };
    await monter();
    const coche = q<HTMLInputElement>('[data-parental-explicite]');
    expect(coche.checked).toBe(true);
    coche.click(); flushSync();
    q('[data-parental-enregistrer]').click(); await stabiliser();
    expect(put().corps.politique.masquer_explicite).toBe(false);
  });

  it('jamais cochée, le champ n’est pas envoyé (un serveur antérieur le refuserait)', async () => {
    await monter();
    serveur = (a) => a.methode === 'PUT' ? { statut: 200, corps: posee() } : { statut: 404 };
    q('[data-parental-enregistrer]').click(); await stabiliser();
    expect('masquer_explicite' in put().corps.politique).toBe(false);
  });
});

describe('#8088 — le refus de lecture d’un contenu explicite', () => {
  const refus = (corps: Record<string, unknown>) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corps), {
    status: 403, statusText: 'Forbidden', headers: { 'Content-Type': 'application/json' },
  })));

  it('affiche la phrase du serveur, et le dit à l’appelant', async () => {
    const phrase = 'Ce titre est marqué explicite : le contrôle parental de ce profil en interdit la lecture.';
    refus({ error: 'parental_explicit_refused', code: 'parental_explicit_refused', message: phrase });
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(derniereNotification()).toBe(phrase);
    expect(err.message).toBe(phrase);
    expect(err.dejaAnnonce).toBe(true);
  });

  it('sans phrase du serveur, la phrase locale dans la langue de l’interface', async () => {
    locale.set('en');
    refus({ error: 'parental_explicit_refused', code: 'parental_explicit_refused' });
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    const attendu = get(t)('playback.errorParentalExplicit' as any);
    expect(attendu).toContain('explicit');
    expect(derniereNotification()).toBe(attendu);
    expect(err.message).toBe(attendu);
  });
});
