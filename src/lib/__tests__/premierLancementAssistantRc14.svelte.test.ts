// @vitest-environment jsdom
//
// Retour de Rémi sur la rc13 (GO de Bertrand, rc14) — l'assistant de première
// installation, MONTÉ avec un `fetch` simulé qui tient le rôle du serveur.
//
//  1. « Services activés » ne nomme QUE les services connectés. Sur une
//     installation neuve, le serveur publie `enabled: true` pour Tidal, Deezer
//     et YouTube sans aucun compte : le résumé affichait « Deezer, Tidal,
//     Youtube » alors que rien n'était configuré.
//  2. Le dossier choisi dans l'assistant est ENREGISTRÉ. « Parcourir » →
//     « Choisir ce dossier » ne faisait que recopier le chemin dans le champ ;
//     « Suivant » partait sans rien envoyer au serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import OnboardingWizard from '../../components/partages/OnboardingWizard.svelte';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { dictionnaire } from './onzeDictionnaires';

type Requete = { methode: string; url: string; corps: string | null };
let requetes: Requete[] = [];
/** Les dossiers de musique tenus par le « serveur ». */
let dossiers: string[] = [];
let services: Record<string, { enabled: boolean; authenticated: boolean }> = {};

const fr = dictionnaire('fr');

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function repondre(methode: string, url: string, corps: string | null): Response {
  const chemin = url.split('?')[0];
  if (chemin.endsWith('/system/browse-dirs/estimate')) return json({ path: '/srv/Musique', audio_files: 120, folders: 8, complete: true });
  if (chemin.endsWith('/system/browse-dirs')) {
    return json({ current: '/srv', parent: null, dirs: [{ name: 'Musique', path: '/srv/Musique', has_children: false }] });
  }
  if (chemin.endsWith('/system/music-dirs') && methode === 'POST') {
    const { path } = JSON.parse(corps ?? '{}');
    if (!dossiers.includes(path)) dossiers.push(path);
    return json({ dirs: dossiers });
  }
  if (chemin.endsWith('/library/browse')) {
    return json({ roots: dossiers.map((p) => ({ name: p.split('/').pop(), path: p, track_count: 0 })) });
  }
  if (chemin.endsWith('/streaming/services')) return json(services);
  return json({});
}

beforeEach(() => {
  requetes = [];
  dossiers = [];
  services = {
    deezer: { enabled: true, authenticated: false },
    tidal: { enabled: true, authenticated: false },
    youtube: { enabled: true, authenticated: false },
    spotify: { enabled: false, authenticated: false },
  };
  localStorage.clear();
  locale.set('fr');
  vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const methode = (init?.method ?? 'GET').toUpperCase();
    const corps = typeof init?.body === 'string' ? init.body : null;
    requetes.push({ methode, url, corps });
    return repondre(methode, url, corps);
  }));
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

function bouton(cible: HTMLElement, texte: string): HTMLButtonElement {
  const b = [...cible.querySelectorAll('button')].find((x) => x.textContent?.trim() === texte);
  if (!b) throw new Error(`bouton « ${texte} » introuvable`);
  return b as HTMLButtonElement;
}

async function monter() {
  const cible = document.createElement('div');
  document.body.appendChild(cible);
  const c = mount(OnboardingWizard, { target: cible, props: { onComplete: () => {} } });
  await attendre(() => requetes.some((r) => r.url.includes('/streaming/services')));
  await attendre(() => false, 10);
  return { c, cible };
}

/**
 * Jusqu'à l'étape des dossiers, QUEL QUE SOIT son rang : l'assistant peut
 * gagner des étapes avant elle (« Accès administrateur », web#3421). Les
 * étapes intermédiaires sont passées par leur bouton « Passer ».
 */
async function versLesDossiers(cible: HTMLElement) {
  bouton(cible, fr['onboarding.getStarted']).click();
  for (let i = 0; i < 5 && !cible.querySelector('.add-dir-form'); i++) {
    await attendre(() => !!cible.querySelector('.add-dir-form') || !!cible.querySelector('.step-actions'));
    if (cible.querySelector('.add-dir-form')) break;
    const passer = cible.querySelector('.step-actions .btn-skip') as HTMLButtonElement | null;
    const suivant = cible.querySelector('.step-actions .btn-primary') as HTMLButtonElement | null;
    (passer ?? suivant)?.click();
    await attendre(() => !!cible.querySelector('.add-dir-form'), 20);
  }
  expect(cible.querySelector('.add-dir-form'), 'étape des dossiers atteinte').not.toBeNull();
}

const posts = () => requetes.filter((r) => r.methode === 'POST' && r.url.split('?')[0].endsWith('/system/music-dirs'));

describe('assistant — le dossier choisi est enregistré (de bout en bout)', () => {
  it('« Parcourir » → choisir un dossier : il est envoyé au serveur et listé', async () => {
    const { c, cible } = await monter();
    await versLesDossiers(cible);
    bouton(cible, fr['ingest.browse']).click();
    await attendre(() => !!document.querySelector('.folder-modal .dir-row .dir-item'));
    (document.querySelector('.folder-modal .dir-row .dir-item') as HTMLButtonElement).click();
    flushSync();
    (document.querySelector('.folder-modal .select-btn') as HTMLButtonElement).click();
    await attendre(() => posts().length > 0 && !!cible.querySelector('.music-dir-item'));

    expect(posts().length, 'le choix part au serveur').toBe(1);
    expect(JSON.parse(posts()[0].corps!)).toEqual({ path: '/srv/Musique' });
    expect(dossiers).toEqual(['/srv/Musique']);
    expect(cible.querySelector('.music-dir-path')?.textContent).toBe('/srv/Musique');
    expect(document.querySelector('.folder-modal'), 'l’explorateur est refermé').toBeNull();

    // « Suivant » n'envoie rien de plus : le champ est vide.
    bouton(cible, fr['onboarding.next']).click();
    await attendre(() => !cible.querySelector('.add-dir-form'));
    expect(posts().length).toBe(1);
    unmount(c);
  });

  it('un chemin saisi puis « Suivant » est enregistré avant d’avancer', async () => {
    const { c, cible } = await monter();
    await versLesDossiers(cible);
    const champ = cible.querySelector('.add-dir-form input') as HTMLInputElement;
    champ.value = '/srv/Musique';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    bouton(cible, fr['onboarding.next']).click();
    await attendre(() => posts().length > 0 && !!cible.querySelector('.service-list'));
    expect(JSON.parse(posts()[0].corps!)).toEqual({ path: '/srv/Musique' });
    expect(dossiers).toEqual(['/srv/Musique']);
    expect(cible.querySelector('.service-list'), 'l’étape SUIVANTE (services) est atteinte').not.toBeNull();
    unmount(c);
  });

  it('confirmation déclinée : rien n’est envoyé et l’assistant reste sur les dossiers', async () => {
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const { c, cible } = await monter();
    await versLesDossiers(cible);
    const champ = cible.querySelector('.add-dir-form input') as HTMLInputElement;
    champ.value = '/srv/Musique';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    bouton(cible, fr['onboarding.next']).click();
    await attendre(() => false, 20);
    expect(posts().length).toBe(0);
    expect(cible.querySelector('.add-dir-form'), 'on reste à l’étape des dossiers').not.toBeNull();
    unmount(c);
  });

  it('« Retour » depuis les dossiers mène à l’étape PRÉCÉDENTE (l’accès administrateur), pas à l’accueil', async () => {
    const { c, cible } = await monter();
    await versLesDossiers(cible);
    bouton(cible, fr['common.back']).click();
    await attendre(() => !cible.querySelector('.add-dir-form'));
    expect(cible.querySelector('[data-etape-administrateur]'), 'étape administrateur (web#3421)').not.toBeNull();
    unmount(c);
  });
});

describe('assistant — « Services activés » ne nomme que les services connectés', () => {
  async function versLeScan(cible: HTMLElement) {
    await versLesDossiers(cible);
    bouton(cible, fr['onboarding.next']).click();
    await attendre(() => !!cible.querySelector('.service-list'));
    bouton(cible, fr['onboarding.next']).click();
    await attendre(() => !cible.querySelector('.service-list'));
  }

  it('installation neuve : Deezer, Tidal et YouTube « activés » sans compte ne sont PAS annoncés', async () => {
    const { c, cible } = await monter();
    await versLeScan(cible);
    expect(cible.textContent).not.toContain(fr['onboarding.summaryServices']);
    for (const nom of ['Deezer', 'Tidal', 'Youtube']) {
      expect(cible.querySelector('.scan-summary')?.textContent ?? '').not.toContain(nom);
    }
    unmount(c);
  });

  it('contre-épreuve : un service connecté est annoncé, et lui seul', async () => {
    services = { ...services, qobuz: { enabled: true, authenticated: true } };
    const { c, cible } = await monter();
    await versLeScan(cible);
    const resume = [...cible.querySelectorAll('.scan-summary')].find((e) => e.textContent?.includes(fr['onboarding.summaryServices']));
    expect(resume, 'le résumé des services est là').toBeTruthy();
    expect(resume!.querySelector('.scan-summary-value')?.textContent).toBe('Qobuz');
    unmount(c);
  });
});
