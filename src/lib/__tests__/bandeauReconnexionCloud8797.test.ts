// @vitest-environment jsdom
//
// tune-server-rust#8797 — le bandeau « Connexion à mozaiklabs.fr expirée »,
// MONTÉ pour de vrai. Le serveur expose déjà l'état dans
// `GET /cloud/sso/status` (`reconnect_required`, `reconnect_required_since`) ;
// sur `main`, aucun code ne le lisait : le composant n'existe pas et la
// collecte de ce fichier échoue.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

vi.mock('../api', async (orig) => {
  const vrai = await orig<typeof import('../api')>();
  return { ...vrai, apiFetch: vi.fn() };
});
const relais = vi.hoisted(() => ({ actif: false }));
vi.mock('../bridge', async (orig) => {
  const vrai = await orig<typeof import('../bridge')>();
  return { ...vrai, ssoDisponible: () => !relais.actif };
});

import * as api from '../api';
import BandeauReconnexionCloud from '../../components/v2/BandeauReconnexionCloud.svelte';
import { locale } from '../i18n';
import { etatReconnexion, reconnexionCloud, reconnexionMasquee } from '../reconnexionCloud';

const lire = vi.mocked(api.apiFetch);

let hote: HTMLElement;
let composant: Record<string, any> | null = null;

async function laisserFiler(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await tick();
  }
  flushSync();
}

async function monter(): Promise<void> {
  composant = mount(BandeauReconnexionCloud, { target: hote });
  flushSync();
  await laisserFiler();
}

const bandeau = () => hote.querySelector('.reco');
const bouton = () => hote.querySelector<HTMLButtonElement>('.reco-ok');

const REFUS = {
  configured: true,
  connected: false,
  reconnect_required: true,
  reconnect_required_since: '2026-11-12T08:30:00Z',
  user: { email: 'a@b.c' },
  details_hidden: false,
};

beforeEach(() => {
  locale.set('fr');
  relais.actif = false;
  reconnexionCloud.set(null);
  reconnexionMasquee.set(false);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  lire.mockReset();
});
afterEach(() => {
  if (composant) unmount(composant);
  composant = null;
  hote.remove();
  vi.useRealTimers();
});

describe('bandeau « Connexion à mozaiklabs.fr expirée » (#8797)', () => {
  it('lit la route existante, sans en créer de nouvelle', async () => {
    lire.mockResolvedValue(REFUS);
    await monter();
    expect(lire).toHaveBeenCalledWith('/cloud/sso/status');
  });

  it('affiché quand le site a refusé la session, avec la date et « Se reconnecter »', async () => {
    lire.mockResolvedValue(REFUS);
    await monter();
    expect(bandeau()).not.toBeNull();
    const texte = bandeau()!.textContent ?? '';
    expect(texte).toContain('mozaiklabs.fr');
    expect(texte).toContain('2026');
    // Le texte dit de NE PAS passer par « Se déconnecter ».
    expect(texte).toContain('Se déconnecter');
    expect(bouton()?.textContent?.trim()).toBe('Se reconnecter');
  });

  it('masqué : session valide, serveur plus ancien, panne', async () => {
    lire.mockResolvedValue({ configured: true, connected: true, reconnect_required: false });
    await monter();
    expect(bandeau()).toBeNull();
    unmount(composant!);

    lire.mockResolvedValue({ configured: true, connected: true });
    await monter();
    expect(bandeau()).toBeNull();
    unmount(composant!);

    lire.mockRejectedValue(new Error('hors ligne'));
    await monter();
    expect(bandeau()).toBeNull();
  });

  it('masqué : compte du serveur non montré à cet appareil (details_hidden)', async () => {
    lire.mockResolvedValue({ ...REFUS, user: null, details_hidden: true });
    await monter();
    expect(bandeau()).toBeNull();
  });

  it('par l’accès à distance : le texte du relais remplace le bouton', async () => {
    relais.actif = true;
    lire.mockResolvedValue(REFUS);
    await monter();
    expect(bandeau()).not.toBeNull();
    expect(bouton()).toBeNull();
    expect(hote.querySelector('.reco-relais')?.textContent).toContain('accès à distance');
  });

  it('« Se reconnecter » suit le chemin de relierCompteCloud (drapeau puis authorize)', async () => {
    lire.mockResolvedValue(REFUS);
    await monter();
    const ancien = window.location;
    const faux = { href: '' } as Location;
    Object.defineProperty(window, 'location', { configurable: true, value: faux });
    try {
      localStorage.removeItem('tune_sso_pending');
      bouton()!.click();
      expect(faux.href).toMatch(/^\/api\/v1\/cloud\/sso\/authorize(\?|$)/);
      expect(localStorage.getItem('tune_sso_pending')).not.toBeNull();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: ancien });
    }
  });

  it('relu toutes les minutes : un refus survenu après le chargement se voit', async () => {
    vi.useFakeTimers();
    lire.mockResolvedValue({ configured: true, connected: true, reconnect_required: false });
    await monter();
    expect(bandeau()).toBeNull();
    lire.mockResolvedValue(REFUS);
    await vi.advanceTimersByTimeAsync(60_000);
    await laisserFiler();
    expect(bandeau()).not.toBeNull();
  });

  it('la croix le masque pour cet onglet', async () => {
    lire.mockResolvedValue(REFUS);
    await monter();
    hote.querySelector<HTMLButtonElement>('.reco-x')!.click();
    flushSync();
    expect(bandeau()).toBeNull();
  });
});

describe('etatReconnexion', () => {
  it('ne retient que reconnect_required vrai, et la date si elle est donnée', () => {
    expect(etatReconnexion(REFUS)).toEqual({ depuis: '2026-11-12T08:30:00Z' });
    expect(etatReconnexion({ ...REFUS, reconnect_required_since: null })).toEqual({ depuis: null });
    expect(etatReconnexion({ connected: true })).toBeNull();
    expect(etatReconnexion(null)).toBeNull();
  });
});
