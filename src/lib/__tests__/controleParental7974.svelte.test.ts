// @vitest-environment jsdom
// Contrôle parental, étape 2 (tune-server-rust#7974, application #8046) : les
// plages horaires et le budget d'écoute dans l'écran du profil, et l'affichage
// du refus de lecture (403 `parental_lease_refused`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import PolitiqueParentaleV2 from '../../components/v2/PolitiqueParentaleV2.svelte';
import * as api from '../api';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { messageRefusParental } from '../refusParental';
import {
  budgetDepuisSaisie, budgetVersSaisie, cleErreur, erreurPlage, erreurPlages, plagesPourServeur,
} from '../politiqueParentale';

const ENFANT = { id: 2, name: 'lea', display_name: 'Léa', avatar_color: '#10b981', is_admin: false };

type Appel = { route: string; methode: string; corps: any };
let appels: Appel[];
let serveur: (a: Appel) => { statut: number; corps?: unknown };
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

async function stabiliser() {
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const qa = (s: string) => [...document.querySelectorAll<HTMLElement>(s)];
function saisir(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
}
const vide = () => ({ statut: 404, corps: { error: 'politique_parentale_absente' } });

beforeEach(() => {
  locale.set('fr'); appels = [];
  serveur = vide;
  hote = document.createElement('div'); document.body.appendChild(hote);
  localStorage.setItem('tune-profile-id', '1');
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const u = new URL(String(url), window.location.href);
    const a: Appel = {
      route: u.pathname + u.search, methode: options?.method ?? 'GET',
      corps: options?.body ? JSON.parse(String(options.body)) : null,
    };
    appels.push(a);
    const r = serveur(a);
    return new Response(r.statut === 204 ? null : JSON.stringify(r.corps ?? {}), {
      status: r.statut, headers: { 'Content-Type': 'application/json' },
    });
  }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); vi.unstubAllGlobals(); localStorage.clear();
  for (const n of get(notifications)) notifications.dismiss(n.id);
});

async function monter() {
  composant = mount(PolitiqueParentaleV2, { target: hote, props: { profil: ENFANT as any } });
  flushSync(); await stabiliser();
}
const put = () => appels.find((a) => a.methode === 'PUT');
const enregistre = (extra = {}) => (a: Appel) => a.methode === 'PUT'
  ? { statut: 200, corps: { profile_id: 2, superviseur_id: 1, revision: 1, maj_le: 'x', politique: a.corps.politique, ...extra } }
  : vide();

describe('étape 2 — saisie et enregistrement', () => {
  it('une plage et un budget : le corps envoyé est exact', async () => {
    serveur = enregistre();
    await monter();
    q('[data-parental-plage-ajouter]').click(); flushSync();
    // Par défaut lundi à vendredi 17:00-19:00 ; on garde mardi, jeudi, samedi.
    for (const j of [1, 3, 5, 2, 4, 6]) q<HTMLInputElement>(`[data-parental-plage="0"] [data-parental-jour="${j}"]`).click();
    flushSync();
    saisir(q<HTMLInputElement>('[data-parental-debut]'), '08:30');
    saisir(q<HTMLInputElement>('[data-parental-fin]'), '10:00');
    saisir(q<HTMLInputElement>('[data-parental-jour-h]'), '1');
    saisir(q<HTMLInputElement>('[data-parental-jour-m]'), '30');
    saisir(q<HTMLInputElement>('[data-parental-semaine-h]'), '6');
    q('[data-parental-enregistrer]').click(); await stabiliser();
    expect(put()!.corps).toEqual({
      revision: 0,
      politique: {
        artistes_bloques: [],
        radios_autorisees: null,
        podcasts_autorises: null,
        plages_horaires: [{ jours: [2, 4, 6], debut: '08:30', fin: '10:00' }],
        budget_quotidien_minutes: 90,
        budget_hebdomadaire_minutes: 360,
      },
    });
    expect(q('[data-parental-message]').textContent).toContain('Règles enregistrées');
  });

  it('plusieurs plages : ajout et suppression de la première', async () => {
    serveur = enregistre();
    await monter();
    q('[data-parental-plage-ajouter]').click(); q('[data-parental-plage-ajouter]').click(); flushSync();
    expect(qa('[data-parental-plage]').length).toBe(2);
    saisir(qa('[data-parental-debut]')[1] as HTMLInputElement, '12:00');
    saisir(qa('[data-parental-fin]')[1] as HTMLInputElement, '13:00');
    qa('[data-parental-plage-retirer]')[0].click(); flushSync();
    expect(qa('[data-parental-plage]').length).toBe(1);
    q('[data-parental-enregistrer]').click(); await stabiliser();
    expect(put()!.corps.politique.plages_horaires).toEqual([{ jours: [1, 2, 3, 4, 5], debut: '12:00', fin: '13:00' }]);
  });

  it('relit les règles posées dans les champs, et vider les budgets les retire', async () => {
    serveur = (a) => a.methode === 'GET'
      ? { statut: 200, corps: { profile_id: 2, superviseur_id: 1, revision: 4, maj_le: 'x', politique: {
        artistes_bloques: [], radios_autorisees: null, podcasts_autorises: null,
        plages_horaires: [{ jours: [6, 7], debut: '09:00', fin: '11:15' }],
        budget_quotidien_minutes: 75, budget_hebdomadaire_minutes: null } } }
      : enregistre()(a);
    await monter();
    expect(q<HTMLInputElement>('[data-parental-debut]').value).toBe('09:00');
    expect(q<HTMLInputElement>('[data-parental-jour-h]').value).toBe('1');
    expect(q<HTMLInputElement>('[data-parental-jour-m]').value).toBe('15');
    expect(q<HTMLInputElement>('[data-parental-semaine-h]').value).toBe('');
    expect(q<HTMLInputElement>('[data-parental-plage="0"] [data-parental-jour="7"]').checked).toBe(true);
    expect(q<HTMLInputElement>('[data-parental-plage="0"] [data-parental-jour="1"]').checked).toBe(false);
    saisir(q<HTMLInputElement>('[data-parental-jour-h]'), '');
    saisir(q<HTMLInputElement>('[data-parental-jour-m]'), '');
    q('[data-parental-enregistrer]').click(); await stabiliser();
    expect(put()!.corps.revision).toBe(4);
    expect(put()!.corps.politique.budget_quotidien_minutes).toBeNull();
    expect(put()!.corps.politique.plages_horaires).toEqual([{ jours: [6, 7], debut: '09:00', fin: '11:15' }]);
  });
});

describe('étape 2 — validation (rien n’est envoyé)', () => {
  async function ajouterPlage(debut: string, fin: string) {
    await monter();
    q('[data-parental-plage-ajouter]').click(); flushSync();
    saisir(q<HTMLInputElement>('[data-parental-debut]'), debut);
    saisir(q<HTMLInputElement>('[data-parental-fin]'), fin);
  }

  it('fin avant début (ou égale) : message, bouton bloqué', async () => {
    await ajouterPlage('19:00', '17:00');
    expect(q('[data-parental-plage-erreur]').textContent).toContain('après l’heure de début');
    expect(q<HTMLButtonElement>('[data-parental-enregistrer]').disabled).toBe(true);
    q('[data-parental-enregistrer]').click(); await stabiliser();
    expect(put()).toBeUndefined();
    saisir(q<HTMLInputElement>('[data-parental-fin]'), '19:00');
    expect(q('[data-parental-plage-erreur]').textContent).toContain('après l’heure de début');
  });

  it('aucun jour coché : message', async () => {
    await ajouterPlage('08:00', '09:00');
    for (const j of [1, 2, 3, 4, 5]) q<HTMLInputElement>(`[data-parental-jour="${j}"]`).click();
    flushSync();
    expect(q('[data-parental-plage-erreur]').textContent).toContain('au moins un jour');
    expect(q<HTMLButtonElement>('[data-parental-enregistrer]').disabled).toBe(true);
  });

  it.each([
    ['0', '0', 'supérieur à zéro'],
    ['', '0', 'supérieur à zéro'],
    ['-1', '', 'supérieur à zéro'],
    ['1,5', '', 'supérieur à zéro'],
    ['25', '', 'dépasser 24 h'],
  ])('budget du jour %s h %s min : refusé', async (h, m, attendu) => {
    await monter();
    saisir(q<HTMLInputElement>('[data-parental-jour-h]'), h);
    saisir(q<HTMLInputElement>('[data-parental-jour-m]'), m);
    expect(q('[data-parental-budget-erreur]').textContent).toContain(attendu);
    expect(q<HTMLButtonElement>('[data-parental-enregistrer]').disabled).toBe(true);
    expect(put()).toBeUndefined();
  });

  it('budget de la semaine au-delà de 168 h : refusé', async () => {
    await monter();
    saisir(q<HTMLInputElement>('[data-parental-semaine-h]'), '169');
    expect(q('[data-parental-budget-erreur]').textContent).toContain('dépasser 168 h');
  });

  it('aides : minutes seules acceptées, bornes, erreurs du serveur dites', () => {
    expect(budgetDepuisSaisie('', '45', 1440, 'x')).toEqual({ minutes: 45, erreur: null });
    expect(budgetDepuisSaisie('', '', 1440, 'x')).toEqual({ minutes: null, erreur: null });
    expect(budgetDepuisSaisie('24', '0', 1440, 'x').minutes).toBe(1440);
    expect(budgetDepuisSaisie('24', '1', 1440, 'trop').erreur).toBe('trop');
    expect(budgetVersSaisie(90)).toEqual({ h: '1', m: '30' });
    expect(erreurPlage({ jours: [1], debut: '08:00', fin: '08:00' })).toBe('parental.hours.errOrder');
    expect(erreurPlage({ jours: [1], debut: '', fin: '08:00' })).toBe('parental.hours.errTime');
    expect(erreurPlages(Array.from({ length: 65 }, () => ({ jours: [1], debut: '08:00', fin: '09:00' })))).toBe('parental.hours.errTooMany');
    expect(plagesPourServeur([{ jours: [3, 1, 3], debut: '08:00', fin: '09:00' }])[0].jours).toEqual([1, 3]);
    expect(cleErreur({ status: 422, code: 'budget_quotidien_invalide' })).toBe('parental.budget.errDaily');
    expect(cleErreur({ status: 422, code: 'plage_horaire_jour_invalide' })).toBe('parental.hours.errDay');
  });
});

describe('étape 2 — le refus de lecture (403 parental_lease_refused)', () => {
  const refus = (reason: string, extra = {}) => ({
    error: 'parental_lease_refused', code: 'parental_lease_refused', reason, message: 'phrase serveur', ...extra,
  });
  const dernier = () => get(notifications).at(-1)?.message;
  function stub(corps: unknown, statut = 403) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corps), {
      status: statut, headers: { 'Content-Type': 'application/json' },
    })));
  }

  it.each([
    ['hors_plage', 'Lecture hors des horaires autorisés.'],
    ['budget_quotidien_epuise', 'Budget d’écoute épuisé pour aujourd’hui.'],
    ['budget_hebdomadaire_epuise', 'Budget d’écoute épuisé pour cette semaine.'],
    ['politique_illisible', 'ne peuvent pas être lues'],
    ['raison_future', 'Lecture non permise pour ce profil.'],
  ])('raison %s : toast traduit, message d’erreur identique, jamais le code', async (reason, attendu) => {
    stub(refus(reason));
    const err: any = await api.play(7, { track_id: 1 }).catch((e) => e);
    expect(dernier()).toContain(attendu);
    expect(err.message).toBe(dernier());
    expect(err.dejaAnnonce).toBe(true);
    for (const brut of ['parental_lease_refused', 'hors_plage', 'budget_', 'phrase serveur', '403']) {
      expect(dernier()).not.toContain(brut);
    }
  });

  it('suit la langue de l’interface', async () => {
    locale.set('en');
    stub(refus('hors_plage'));
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(dernier()).toBe('Playback outside the allowed hours.');
  });

  it('la reprise après pause est refusée de la même façon', async () => {
    stub(refus('budget_quotidien_epuise'));
    await api.resume(7).catch(() => {});
    expect(dernier()).toContain('Budget d’écoute épuisé');
  });

  it('contre-épreuve : un autre 403, ou un 403 sans ce code, ne devient pas ce message', async () => {
    stub({ error: 'politique_parentale_reservee_au_superviseur' });
    await api.play(7, { track_id: 1 }).catch(() => {});
    expect(dernier() ?? '').not.toMatch(/horaires autorisés|Budget d’écoute/);
    expect(messageRefusParental('autre', { code: 'autre', reason: 'hors_plage' })).toBeNull();
    expect(messageRefusParental(undefined, null)).toBeNull();
  });
});
