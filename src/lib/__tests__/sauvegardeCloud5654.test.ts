// @vitest-environment jsdom
//
// Sauvegarde des personnalisations dans le cloud — suite web de
// renesenses/tune-server-rust#5654 et de renesenses/tune-web-client#902.
//
// Le serveur Tune prend seul des instantanés chiffrés (trois par machine et
// cinq machines par compte gardés chez mozaiklabs) et sait les restaurer.
// Ces témoins tiennent ce que l'écran promet :
//
//  1. l'assistant de première installation ne propose « Reprendre vos
//     personnalisations » que si le serveur est RELIÉ au compte, PREMIUM, et
//     qu'au moins un instantané existe — et il le propose alors vraiment ;
//  2. la phrase de passe et la clé de secours ne vont QUE dans le corps d'un
//     POST : ni dans une URL, ni dans le stockage du navigateur ;
//  3. le mode envoyé est celui que l'utilisateur a choisi (Réglages), et
//     `replace` dans l'assistant (machine neuve) ;
//  4. les clés nouvelles existent dans les onze langues, placeholders compris ;
//  5. les profils reviennent SANS leur mot de passe : l'écran le dit AVANT la
//     restauration, et le bilan nomme les profils concernés ;
//  6. les anciennes routes cloud-push / cloud-pull / cloud-status ne sont
//     appelées nulle part.
//
// 🔴 Les écrans sont MONTÉS avec un `fetch` simulé : on lit ce qui s'affiche
// et les requêtes qui partent vraiment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import OnboardingWizard from '../../components/partages/OnboardingWizard.svelte';
import SauvegardeCloudV2 from '../../components/v2/SauvegardeCloudV2.svelte';
import * as api from '../api';
import {
  offreDeReprise,
  instantaneParDefaut,
  motifPhraseRefusee,
  corpsRestauration,
  profilsSansMotDePasse,
  RefusSauvegarde,
  type EtatSauvegardeCloud,
  type InstantaneCloud,
} from '../sauvegardeCloud';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const SECRET = 'phrase-de-passe-tres-longue-42';

type Requete = { methode: string; url: string; corps: string | null };
let requetes: Requete[] = [];
let etat: EtatSauvegardeCloud;
let instantanes: InstantaneCloud[];
/** Réponse de la restauration : statut et corps. */
let restauration: { status: number; corps: unknown };

const RAPPORT = {
  settings_written: 12, zones_created: 2, zones_updated: 0, profiles_created: 1,
  profiles_without_password: ['ana'],
  playlists_restored: 3, playlists_replaced: 0, favorites_restored: 40, radios_restored: 5,
  warnings: [],
};

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function etatDe(p: Partial<EtatSauvegardeCloud> = {}): EtatSauvegardeCloud {
  return {
    premium: true, account_linked: true, enabled: true, key_configured: true,
    last_backup_at: '2026-10-06T08:00:00Z', last_attempt_at: null, last_error: null,
    pending_since: null, debounce_minutes: 10, max_snapshots: 3, ...p,
  };
}

function instantane(p: Partial<InstantaneCloud> = {}): InstantaneCloud {
  return {
    id: 7, server_id: 'srv-a', server_label: 'Salon', key_id: '0123456789abcdef', format_version: 1,
    size_bytes: 48_000, created_at: '2026-10-06T08:00:00Z', this_server: false, local_key: false, ...p,
  };
}

function repondre(methode: string, url: string): Response {
  if (url.includes('/system/config-backup/cloud/status')) return json(etat);
  if (url.includes('/system/config-backup/cloud/snapshots')) return json({ backups: instantanes, max: 3 });
  if (url.includes('/system/config-backup/cloud/restore') && methode === 'POST') {
    return json(restauration.corps, restauration.status);
  }
  if (url.includes('/system/config-backup/cloud/enable') && methode === 'POST') {
    return json({ success: true, recovery_key: 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789', key_id: '0123456789abcdef' });
  }
  if (url.includes('/browse/roots')) return json({ roots: [] });
  if (url.includes('/streaming')) return json({});
  return json({});
}

let stockes: string[] = [];

beforeEach(() => {
  requetes = [];
  stockes = [];
  etat = etatDe();
  instantanes = [instantane({ id: 7, created_at: '2026-10-05T08:00:00Z' }), instantane({ id: 9, created_at: '2026-10-06T21:00:00Z' })];
  restauration = { status: 200, corps: { success: true, key_adopted: true, report: RAPPORT } };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const methode = (init?.method ?? 'GET').toUpperCase();
    requetes.push({ methode, url, corps: typeof init?.body === 'string' ? init.body : null });
    return repondre(methode, url);
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

async function attendre(cond: () => boolean, essais = 60) {
  for (let i = 0; i < essais && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
}

function aucunSecretHorsDuCorps() {
  for (const r of requetes) expect(r.url, `secret dans une URL : ${r.url}`).not.toContain(SECRET);
  for (const s of stockes) expect(s, 'secret écrit dans le stockage du navigateur').not.toContain(SECRET);
  expect(JSON.stringify(localStorage)).not.toContain(SECRET);
  expect(JSON.stringify(sessionStorage)).not.toContain(SECRET);
}

// ── Décisions pures ────────────────────────────────────────────────

describe('offreDeReprise — trois conditions, toutes nécessaires', () => {
  const liste = { backups: [instantane()], max: 3 };
  it('reliée + Premium + un instantané : proposée', () => {
    expect(offreDeReprise(etatDe(), liste)).toBe(true);
  });
  it('non reliée : rien', () => {
    expect(offreDeReprise(etatDe({ account_linked: false }), liste)).toBe(false);
  });
  it('pas Premium : rien', () => {
    expect(offreDeReprise(etatDe({ premium: false }), liste)).toBe(false);
  });
  it('aucun instantané : rien — une offre vers une liste vide est une impasse', () => {
    expect(offreDeReprise(etatDe(), { backups: [], max: 3 })).toBe(false);
    expect(offreDeReprise(null, liste)).toBe(false);
  });
  it('par défaut, le plus récent', () => {
    expect(instantaneParDefaut([
      instantane({ id: 1, created_at: '2026-10-01T00:00:00Z' }),
      instantane({ id: 2, created_at: '2026-10-03T00:00:00Z' }),
      instantane({ id: 3, created_at: '2026-10-02T00:00:00Z' }),
    ])?.id).toBe(2);
  });
  it('la phrase de passe : 10 caractères et deux saisies identiques', () => {
    expect(motifPhraseRefusee('court', 'court')).toBe('cloudBackup.passphraseTooShort');
    expect(motifPhraseRefusee(SECRET, SECRET + 'x')).toBe('cloudBackup.passphraseMismatch');
    expect(motifPhraseRefusee(SECRET, SECRET)).toBeNull();
  });
  it('un secret vide n’est pas envoyé', () => {
    expect(corpsRestauration(3, 'merge', '  ')).toEqual({ id: 3, mode: 'merge', secret: null });
  });
});

// ── API ────────────────────────────────────────────────────────────

describe('api — le secret ne voyage que dans le corps du POST', () => {
  it('restoreCloudBackup : POST, mode et secret dans le corps, rien dans l’URL', async () => {
    await api.restoreCloudBackup(9, 'replace', SECRET);
    const r = requetes.find((q) => q.url.includes('/cloud/restore'))!;
    expect(r.methode).toBe('POST');
    expect(JSON.parse(r.corps!)).toEqual({ id: 9, mode: 'replace', secret: SECRET });
    aucunSecretHorsDuCorps();
  });

  it('enableCloudBackup : la phrase de passe dans le corps, rien dans l’URL', async () => {
    const r = await api.enableCloudBackup(SECRET);
    expect(r.recovery_key).toBeTruthy();
    const q = requetes.find((x) => x.url.includes('/cloud/enable'))!;
    expect(JSON.parse(q.corps!)).toEqual({ passphrase: SECRET });
    aucunSecretHorsDuCorps();
  });

  it('un 400 wrong_secret devient un refus nommé, pas une panne', async () => {
    restauration = { status: 400, corps: { error: 'wrong_secret' } };
    const e = await api.restoreCloudBackup(9, 'merge', 'mauvais').catch((x) => x);
    expect(e).toBeInstanceOf(RefusSauvegarde);
    expect((e as RefusSauvegarde).code).toBe('wrong_secret');
  });
});

// ── Assistant de première installation (#902) ──────────────────────

describe('assistant — « Reprendre vos personnalisations »', () => {
  const TITRE = dictionnaire('fr')['cloudBackup.onboardingTitle'];

  async function monterAssistant() {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(OnboardingWizard, { target: cible, props: { onComplete: () => {} } });
    await attendre(() => requetes.some((r) => r.url.includes('/cloud/')));
    await attendre(() => false, 15);
    return { c, cible };
  }

  it('reliée + Premium + instantanés : l’offre est là, et restaure en `replace`', async () => {
    const { c, cible } = await monterAssistant();
    expect(cible.textContent).toContain(TITRE);
    expect(
      cible.querySelector('.reprise-cloud .reprise-alerte')?.textContent,
      'l’avertissement « sans mot de passe » est là AVANT le geste',
    ).toContain(dictionnaire('fr')['cloudBackup.passwordsWarning']);
    const select = cible.querySelector('.reprise-cloud select') as HTMLSelectElement;
    expect(select.value, 'le plus récent par défaut').toBe('9');
    const champ = cible.querySelector('.reprise-cloud input[type="password"]') as HTMLInputElement;
    champ.value = SECRET;
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    (cible.querySelector('.reprise-cloud button') as HTMLButtonElement).click();
    await attendre(() => requetes.some((r) => r.url.includes('/cloud/restore')));
    const r = requetes.find((q) => q.url.includes('/cloud/restore'))!;
    expect(JSON.parse(r.corps!)).toEqual({ id: 9, mode: 'replace', secret: SECRET });
    await attendre(() => (cible.textContent ?? '').includes(dictionnaire('fr')['cloudBackup.onboardingDone']));
    expect(cible.textContent).toContain(dictionnaire('fr')['cloudBackup.onboardingDone']);
    expect(cible.textContent).toContain(dictionnaire('fr')['cloudBackup.reportNoPassword'].replace('{names}', 'ana'));
    aucunSecretHorsDuCorps();
    unmount(c);
  });

  for (const [cas, regler] of [
    ['non reliée', () => { etat = etatDe({ account_linked: false }); }],
    ['pas Premium', () => { etat = etatDe({ premium: false }); }],
    ['aucun instantané', () => { instantanes = []; }],
  ] as const) {
    it(`${cas} : aucune offre`, async () => {
      regler();
      const { c, cible } = await monterAssistant();
      expect(cible.textContent).not.toContain(TITRE);
      // L'offre de fichier (#1390) reste là.
      expect(cible.textContent).toContain(dictionnaire('fr')['onboarding.restoreTitle']);
      unmount(c);
    });
  }

  it('serveur antérieur (404) : aucune offre, aucun cri', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requetes.push({ methode: (init?.method ?? 'GET').toUpperCase(), url, corps: null });
      if (url.includes('/cloud/')) return new Response('not found', { status: 404 });
      return repondre('GET', url);
    }));
    const { c, cible } = await monterAssistant();
    expect(cible.textContent).not.toContain(TITRE);
    unmount(c);
  });
});

// ── Réglages › Système › Sauvegarde dans le cloud ──────────────────

describe('Réglages — le mode envoyé est celui choisi', () => {
  async function monterReglages() {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(SauvegardeCloudV2, { target: cible });
    await attendre(() => !!cible.querySelector('.liste li'));
    return { c, cible };
  }

  for (const mode of ['merge', 'replace'] as const) {
    it(`choisir « ${mode} » envoie « ${mode} »`, async () => {
      instantanes = [instantane({ id: 4, local_key: true, this_server: true })];
      const { c, cible } = await monterReglages();
      (cible.querySelector('.liste li button') as HTMLButtonElement).click();
      flushSync();
      const radio = cible.querySelector(`input[type="radio"][value="${mode}"]`) as HTMLInputElement;
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      flushSync();
      // Clé locale : aucun champ secret demandé.
      expect(cible.querySelector('.boite input[type="password"]')).toBeNull();
      expect(
        cible.querySelector('.boite .alerte')?.textContent,
        'l’avertissement « sans mot de passe » est là AVANT le geste',
      ).toContain(dictionnaire('fr')['cloudBackup.passwordsWarning']);
      const lancer = [...cible.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === dictionnaire('fr')['cloudBackup.confirmRestore'],
      )!;
      lancer.click();
      await attendre(() => requetes.some((r) => r.url.includes('/cloud/restore')));
      const r = requetes.find((q) => q.url.includes('/cloud/restore'))!;
      expect(JSON.parse(r.corps!)).toEqual({ id: 4, mode, secret: null });
      const nomme = dictionnaire('fr')['cloudBackup.reportNoPassword'].replace('{names}', 'ana');
      await attendre(() => (cible.textContent ?? '').includes(nomme));
      expect(cible.textContent, 'le bilan nomme les profils sans mot de passe').toContain(nomme);
      unmount(c);
    });
  }

  it('wrong_secret : le champ secret reste, le message le dit, le secret est vidé', async () => {
    instantanes = [instantane({ id: 5, local_key: false })];
    restauration = { status: 400, corps: { error: 'wrong_secret' } };
    const { c, cible } = await monterReglages();
    (cible.querySelector('.liste li button') as HTMLButtonElement).click();
    flushSync();
    const champ = cible.querySelector('.boite input[type="password"]') as HTMLInputElement;
    expect(champ, 'clé d’une autre machine : le secret est demandé d’emblée').not.toBeNull();
    champ.value = SECRET;
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    [...cible.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === dictionnaire('fr')['cloudBackup.confirmRestore'])!
      .click();
    await attendre(() => (cible.textContent ?? '').includes(dictionnaire('fr')['cloudBackup.wrongSecret']));
    expect(cible.textContent).toContain(dictionnaire('fr')['cloudBackup.wrongSecret']);
    await tick();
    expect((cible.querySelector('.boite input[type="password"]') as HTMLInputElement).value).toBe('');
    aucunSecretHorsDuCorps();
    unmount(c);
  });

  it('Premium absent : l’écran le dit et ne liste rien', async () => {
    etat = etatDe({ premium: false });
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(SauvegardeCloudV2, { target: cible });
    await attendre(() => (cible.textContent ?? '').includes(dictionnaire('fr')['cloudBackup.statePremium']));
    expect(cible.textContent).toContain(dictionnaire('fr')['cloudBackup.statePremium']);
    expect(requetes.some((r) => r.url.includes('/cloud/snapshots'))).toBe(false);
    unmount(c);
  });
});

// ── Onze langues ───────────────────────────────────────────────────

describe('i18n — les clés de la sauvegarde dans les onze langues', () => {
  const fr = dictionnaire('fr');
  const cles = Object.keys(fr).filter((k) => k.startsWith('cloudBackup.'));

  it('le français les porte toutes, et les écrans n’en citent aucune absente', () => {
    expect(cles.length).toBeGreaterThan(40);
    const sources = [
      'src/components/v2/SauvegardeCloudV2.svelte',
      'src/components/partages/OnboardingWizard.svelte',
      'src/lib/sauvegardeCloud.ts',
    ].map((f) => readFileSync(resolve(process.cwd(), f), 'utf-8')).join('\n');
    const citees = [...new Set(sources.match(/cloudBackup\.[A-Za-z]+/g) ?? [])];
    expect(citees.filter((k) => !(k in fr))).toEqual([]);
  });

  it('chaque langue a chaque clé, non vide, avec les mêmes placeholders', () => {
    const fautes: string[] = [];
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of cles) {
        const v = d[k];
        if (typeof v !== 'string' || !v.trim()) { fautes.push(`${l}.${k} absente`); continue; }
        const ph = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join();
        if (ph(v) !== ph(fr[k])) fautes.push(`${l}.${k} placeholders`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it('la section « Sauvegarde » est déclarée dans Système et rendue par les Réglages', () => {
    const carte = readFileSync(resolve(process.cwd(), 'src/lib/v2Settings.ts'), 'utf-8');
    expect(carte).toMatch(/id: 'backup',\s+titleKey: 'cloudBackup\.title'/);
    const reglages = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(reglages).toMatch(/s\.id === 'backup'\}\s*<SauvegardeCloudV2 \/>/);
  });
});

// ── Mots de passe des profils ──────────────────────────────────────

describe('profilsSansMotDePasse — le bilan nomme les profils à protéger', () => {
  const bilan = (noms?: unknown) => ({ ...RAPPORT, profiles_without_password: noms as string[] | undefined });

  it('triés, sans doublon ni nom vide', () => {
    expect(profilsSansMotDePasse(bilan(['zoe', 'ana', 'zoe', ' ']))).toEqual(['ana', 'zoe']);
  });
  it('serveur antérieur (champ absent) ou bilan nul : liste vide', () => {
    expect(profilsSansMotDePasse(bilan(undefined))).toEqual([]);
    expect(profilsSansMotDePasse(null)).toEqual([]);
  });
});

// ── Anciennes routes ───────────────────────────────────────────────

describe('anciennes routes cloud-push / cloud-pull / cloud-status', () => {
  it('aucune source du client ne les appelle', () => {
    const fichiers: string[] = [];
    const parcourir = (d: string) => {
      for (const n of readdirSync(d)) {
        const f = join(d, n);
        if (statSync(f).isDirectory()) { if (n !== '__tests__') parcourir(f); }
        else if (/\.(ts|svelte)$/.test(n)) fichiers.push(f);
      }
    };
    parcourir(resolve(process.cwd(), 'src'));
    expect(fichiers.length).toBeGreaterThan(100);
    const trouvees = fichiers.filter((f) => /cloud-(push|pull|status)/.test(readFileSync(f, 'utf-8')));
    expect(trouvees).toEqual([]);
  });
});
