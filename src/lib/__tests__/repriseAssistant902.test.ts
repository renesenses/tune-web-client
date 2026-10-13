// @vitest-environment jsdom
//
// #902 — l'assistant de première installation propose de restaurer la
// dernière sauvegarde du compte, et n'écrase RIEN sans confirmation.
//
// Ce que ces témoins tiennent, écran MONTÉ avec un `fetch` simulé (on lit ce
// qui s'affiche et les requêtes qui partent vraiment) :
//
//  1. l'offre montre la dernière sauvegarde (date, machine) avec « Restaurer »
//     et « Plus tard » — et au montage, ni aperçu ni restauration ne part ;
//  2. « Restaurer » demande le secret quand la clé de ce serveur n'ouvre pas
//     l'instantané, puis montre le CONTENU compté par le serveur
//     (`/cloud/preview`) ; `/cloud/restore` ne part qu'à la confirmation ;
//  3. « Plus tard » et « Annuler » ne restaurent rien et vident le secret ;
//  4. un mauvais secret ramène au champ, sans restaurer ;
//  5. un serveur sans aperçu (404) confirme quand même, sans le détail ;
//  6. clé locale : pas de secret demandé, ni envoyé ;
//  7. serveur pas encore relié : l'assistant propose de relier le compte ;
//  8. le secret ne paraît ni dans une URL ni dans le stockage du navigateur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import OnboardingWizard from '../../components/partages/OnboardingWizard.svelte';
import { lignesDuResume, lireResume, corpsApercu, type EtatSauvegardeCloud, type InstantaneCloud } from '../sauvegardeCloud';
import { dictionnaire } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const SECRET = 'phrase-de-passe-tres-longue-42';

type Requete = { methode: string; url: string; corps: string | null };
let requetes: Requete[] = [];
let etat: EtatSauvegardeCloud;
let instantanes: InstantaneCloud[];
let apercu: { status: number; corps: unknown };
let sso: unknown;
let stockes: string[] = [];

const RESUME = {
  created_at: '2026-10-12T08:30:00Z', server_version: '1.0.0-rc4',
  settings: 37, zones: 2, zone_names: ['Salon', 'Bureau'], profiles: 1,
  playlists: 3, favorites: 40, radios: 5, eq_presets: 2, service_tokens: ['discogs_token'],
};
const RAPPORT = {
  settings_written: 37, zones_created: 2, zones_updated: 0, profiles_created: 1,
  profiles_without_password: [], playlists_restored: 3, playlists_replaced: 0,
  favorites_restored: 40, radios_restored: 5, service_tokens_restored: ['discogs_token'], warnings: [],
};

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function etatDe(p: Partial<EtatSauvegardeCloud> = {}): EtatSauvegardeCloud {
  return {
    premium: true, account_linked: true, enabled: false, key_configured: false,
    last_backup_at: null, last_attempt_at: null, last_error: null,
    pending_since: null, debounce_minutes: 10, max_snapshots: 3, ...p,
  };
}

function instantane(p: Partial<InstantaneCloud> = {}): InstantaneCloud {
  return {
    id: 9, server_id: 'srv-windows', server_label: 'Windows', key_id: '0123456789abcdef', format_version: 1,
    size_bytes: 48_000, created_at: '2026-10-12T08:31:00Z', this_server: false, local_key: false, ...p,
  };
}

beforeEach(() => {
  requetes = [];
  stockes = [];
  etat = etatDe();
  instantanes = [instantane()];
  apercu = { status: 200, corps: { summary: RESUME } };
  sso = { configured: true, connected: false };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const methode = (init?.method ?? 'GET').toUpperCase();
    requetes.push({ methode, url, corps: typeof init?.body === 'string' ? init.body : null });
    if (url.includes('/system/config-backup/cloud/status')) return json(etat);
    if (url.includes('/system/config-backup/cloud/snapshots')) return json({ backups: instantanes, max: 3 });
    if (url.includes('/system/config-backup/cloud/preview') && methode === 'POST') return json(apercu.corps, apercu.status);
    if (url.includes('/system/config-backup/cloud/restore') && methode === 'POST') {
      return json({ success: true, key_adopted: true, report: RAPPORT });
    }
    if (url.includes('/cloud/sso/status')) return json(sso);
    if (url.includes('/browse/roots')) return json({ roots: [] });
    return json({});
  }));
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    stockes.push(`${k}=${v}`);
    return original.call(this, k, v);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

async function attendre(cond: () => boolean, essais = 80) {
  for (let i = 0; i < essais && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
}

async function monter() {
  const cible = document.createElement('div');
  document.body.appendChild(cible);
  const c = mount(OnboardingWizard, { target: cible, props: { onComplete: () => {} } });
  await attendre(() => requetes.some((r) => r.url.includes('/cloud/')));
  await attendre(() => false, 15);
  return { c, cible };
}

const carte = (cible: HTMLElement) => cible.querySelector('.reprise-cloud') as HTMLElement | null;
const bouton = (cible: HTMLElement, sel: string) => cible.querySelector(`.reprise-cloud ${sel}`) as HTMLButtonElement | null;
const parti = (bout: string) => requetes.filter((r) => r.url.includes(bout));

function saisir(cible: HTMLElement, valeur: string) {
  const champ = cible.querySelector('.reprise-cloud input[type="password"]') as HTMLInputElement;
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

function aucunSecretHorsDuCorps() {
  for (const r of requetes) expect(r.url, `secret dans une URL : ${r.url}`).not.toContain(SECRET);
  for (const s of stockes) expect(s, 'secret écrit dans le stockage du navigateur').not.toContain(SECRET);
}

describe('assistant #902 — offre de reprise', () => {
  it('montre la dernière sauvegarde avec « Restaurer » et « Plus tard », sans rien envoyer', async () => {
    const { c, cible } = await monter();
    expect(carte(cible)?.textContent).toContain(fr['cloudBackup.onboardingTitle']);
    expect(carte(cible)?.textContent, 'la machine d’origine est nommée').toContain('Windows');
    expect(bouton(cible, '.reprise-restaurer')?.textContent?.trim()).toBe(fr['cloudBackup.restore']);
    expect(bouton(cible, '.reprise-plus-tard-btn')?.textContent?.trim()).toBe(fr['cloudBackup.onboardingLater']);
    expect(parti('/cloud/preview')).toEqual([]);
    expect(parti('/cloud/restore')).toEqual([]);
    unmount(c);
  });

  it('Restaurer → secret → contenu résumé → la restauration NE part qu’à la confirmation', async () => {
    const { c, cible } = await monter();
    bouton(cible, '.reprise-restaurer')!.click();
    flushSync();
    expect(cible.querySelector('.reprise-cloud input[type="password"]'), 'le secret est demandé').not.toBeNull();
    expect(parti('/cloud/preview'), 'rien ne part avant le secret').toEqual([]);
    saisir(cible, SECRET);
    bouton(cible, '.reprise-restaurer')!.click();
    await attendre(() => !!bouton(cible, '.reprise-confirmer'));

    const a = parti('/cloud/preview');
    expect(a).toHaveLength(1);
    expect(a[0].methode).toBe('POST');
    expect(JSON.parse(a[0].corps!)).toEqual({ id: 9, secret: SECRET });
    const texte = carte(cible)!.textContent ?? '';
    expect(texte).toContain(fr['cloudBackup.summaryZones'].replace('{n}', '2'));
    expect(texte, 'les zones sont nommées').toContain('Salon, Bureau');
    expect(texte).toContain(fr['cloudBackup.summaryEq'].replace('{n}', '2'));
    expect(texte).toContain(fr['cloudBackup.summaryDiscogs']);
    expect(texte).toContain(fr['cloudBackup.passwordsWarning']);
    expect(parti('/cloud/restore'), 'restauré sans confirmation').toEqual([]);

    bouton(cible, '.reprise-confirmer')!.click();
    await attendre(() => parti('/cloud/restore').length > 0);
    expect(JSON.parse(parti('/cloud/restore')[0].corps!)).toEqual({ id: 9, mode: 'replace', secret: SECRET });
    await attendre(() => (carte(cible)?.textContent ?? '').includes(fr['cloudBackup.onboardingDone']));
    expect(carte(cible)?.textContent).toContain(fr['cloudBackup.onboardingDone']);
    aucunSecretHorsDuCorps();
    unmount(c);
  });

  it('« Plus tard » ne restaure rien, vide le secret et dit où retrouver la sauvegarde', async () => {
    const { c, cible } = await monter();
    bouton(cible, '.reprise-restaurer')!.click();
    flushSync();
    saisir(cible, SECRET);
    bouton(cible, '.reprise-plus-tard-btn')!.click();
    flushSync();
    expect(carte(cible), 'l’offre s’efface').toBeNull();
    expect(cible.textContent).toContain(fr['cloudBackup.onboardingLaterNote']);
    expect(parti('/cloud/preview')).toEqual([]);
    expect(parti('/cloud/restore')).toEqual([]);
    expect(cible.querySelector('input[type="password"]')).toBeNull();
    aucunSecretHorsDuCorps();
    unmount(c);
  });

  it('« Annuler » à la confirmation ne restaure rien', async () => {
    instantanes = [instantane({ local_key: true, this_server: true })];
    const { c, cible } = await monter();
    bouton(cible, '.reprise-restaurer')!.click();
    await attendre(() => !!bouton(cible, '.reprise-confirmer'));
    [...carte(cible)!.querySelectorAll('button')].find((b) => b.textContent?.trim() === fr['common.cancel'])!.click();
    flushSync();
    expect(bouton(cible, '.reprise-restaurer'), 'retour à l’offre').not.toBeNull();
    expect(parti('/cloud/restore')).toEqual([]);
    unmount(c);
  });

  it('clé locale : aucun secret demandé ni envoyé', async () => {
    instantanes = [instantane({ local_key: true, this_server: true })];
    const { c, cible } = await monter();
    bouton(cible, '.reprise-restaurer')!.click();
    await attendre(() => !!bouton(cible, '.reprise-confirmer'));
    expect(JSON.parse(parti('/cloud/preview')[0].corps!)).toEqual({ id: 9, secret: null });
    bouton(cible, '.reprise-confirmer')!.click();
    await attendre(() => parti('/cloud/restore').length > 0);
    expect(JSON.parse(parti('/cloud/restore')[0].corps!)).toEqual({ id: 9, mode: 'replace', secret: null });
    unmount(c);
  });

  it('mauvais secret : retour au champ vidé, message, aucune restauration', async () => {
    apercu = { status: 400, corps: { error: 'wrong_secret' } };
    const { c, cible } = await monter();
    bouton(cible, '.reprise-restaurer')!.click();
    flushSync();
    saisir(cible, SECRET);
    bouton(cible, '.reprise-restaurer')!.click();
    await attendre(() => (carte(cible)?.textContent ?? '').includes(fr['cloudBackup.wrongSecret']));
    expect(carte(cible)?.textContent).toContain(fr['cloudBackup.wrongSecret']);
    expect((cible.querySelector('.reprise-cloud input[type="password"]') as HTMLInputElement).value).toBe('');
    expect(bouton(cible, '.reprise-confirmer')).toBeNull();
    expect(parti('/cloud/restore')).toEqual([]);
    unmount(c);
  });

  it('serveur sans aperçu (404) : confirmation quand même, sans le détail', async () => {
    instantanes = [instantane({ local_key: true })];
    apercu = { status: 404, corps: { error: 'not_found' } };
    const { c, cible } = await monter();
    bouton(cible, '.reprise-restaurer')!.click();
    await attendre(() => !!bouton(cible, '.reprise-confirmer'));
    expect(carte(cible)?.textContent).toContain(fr['cloudBackup.summaryUnavailable']);
    expect(parti('/cloud/restore')).toEqual([]);
    unmount(c);
  });
});

describe('assistant #902 — « une fois le compte connecté »', () => {
  it('pas relié, SSO configuré : propose de relier le compte, sans lister', async () => {
    etat = etatDe({ account_linked: false, premium: false });
    const { c, cible } = await monter();
    await attendre(() => !!cible.querySelector('.reprise-relier'));
    expect(cible.querySelector('.reprise-relier')?.textContent).toContain(fr['cloudBackup.onboardingConnect']);
    expect(carte(cible)).toBeNull();
    expect(parti('/cloud/snapshots'), 'la liste est gardée Premium : pas d’appel').toEqual([]);
    unmount(c);
  });

  it('pas relié, SSO non configuré : rien', async () => {
    etat = etatDe({ account_linked: false });
    sso = { configured: false, connected: false };
    const { c, cible } = await monter();
    await attendre(() => parti('/cloud/sso/status').length > 0);
    await attendre(() => false, 10);
    expect(cible.querySelector('.reprise-relier')).toBeNull();
    unmount(c);
  });
});

describe('sauvegardeCloud — résumé', () => {
  it('lireResume rejette un corps sans résumé (serveur antérieur)', () => {
    expect(lireResume({})).toBeNull();
    expect(lireResume(null)).toBeNull();
    expect(lireResume({ summary: { settings: 'x' } })).toBeNull();
  });
  it('les lignes sautent les zéros et nomment les zones', () => {
    const r = lireResume({ summary: { ...RESUME, playlists: 0, service_tokens: [] } })!;
    const cles = lignesDuResume(r).map((l) => l.cle);
    expect(cles).not.toContain('cloudBackup.summaryPlaylists');
    expect(cles).not.toContain('cloudBackup.summaryDiscogs');
    expect(lignesDuResume(r).find((l) => l.cle === 'cloudBackup.summaryZones')?.detail).toBe('Salon, Bureau');
  });
  it('corpsApercu : un secret vide n’est pas envoyé', () => {
    expect(corpsApercu(3, '  ')).toEqual({ id: 3, secret: null });
    expect(corpsApercu(3, SECRET)).toEqual({ id: 3, secret: SECRET });
  });
});
