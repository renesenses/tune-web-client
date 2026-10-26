// @vitest-environment jsdom
//
// renesenses/tune-server-rust#6545 — notes et écoutes de la communauté.
//
// 1. La ligne « ★ 4,2 (37 notes) · 1 240 écoutes dans la communauté » sous
//    « Ma note », tirée de `GET /library/albums/{id}/community` ; rien quand
//    le serveur n'est pas relié, que le site ne répond pas ou que le seuil de
//    trois personnes n'est pas atteint.
// 2. Le consentement « Partager mes notes et mes écoutes avec la communauté
//    (anonymement) » dans Réglages › Système › Cloud : séparé de « Mes
//    écoutes », décoché par défaut, écrit par PATCH.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import AlbumRating from '../../components/partages/AlbumRating.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { CLE_PARTAGE_COMMUNAUTAIRE, ligneCommunautaire } from '../notesCommunautaires';
import { CLE_ECOUTES_AU_COMPTE } from '../ecoutesAuCompte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const tFr = (k: string) => fr[k] ?? k;
const espaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]+/g, ' ');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let config: Record<string, unknown>;
let communaute: unknown;
let communauteEchoue = false;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  patchs.length = 0;
  communauteEchoue = false;
  config = { music_dirs: [], [CLE_ECOUTES_AU_COMPTE]: false, [CLE_PARTAGE_COMMUNAUTAIRE]: false };
  communaute = {
    available: true,
    rating: { average: 4.2, count: 37 },
    listens: { count: 1240, listeners: 12 },
  };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      Object.assign(config, corps);
      return json({ ok: true });
    }
    if (/\/library\/albums\/\d+\/community/.test(u)) {
      return communauteEchoue ? json({}, 500) : json(communaute);
    }
    if (/\/library\/albums\/\d+\/rating/.test(u)) return json({ rating: 4, note: '' });
    if (/\/system\/config(\?|$)/.test(u)) return json(config);
    if (/\/cloud\/sso\/status/.test(u)) {
      return json({ configured: true, connected: true, user: { display_name: 'Alice', email: 'alice@example.test' } });
    }
    if (/\/cloud\/telemetry\/status/.test(u)) return json({ enabled: true, env_override: false });
    if (/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u)) return json([]);
    return json({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#6545 — la ligne communautaire', () => {
  it('compose « ★ 4,2 (37 notes) · 1 240 écoutes dans la communauté »', () => {
    expect(espaces(ligneCommunautaire(communaute as any, 'fr', tFr)))
      .toBe('★ 4,2 (37 notes) · 1 240 écoutes dans la communauté');
  });

  it('une partie absente (sous le seuil) n\'est pas affichée', () => {
    expect(espaces(ligneCommunautaire({ available: true, rating: null, listens: { count: 1240, listeners: 3 } }, 'fr', tFr)))
      .toBe('1 240 écoutes dans la communauté');
    expect(espaces(ligneCommunautaire({ available: true, rating: { average: 3, count: 3 }, listens: null }, 'fr', tFr)))
      .toBe('★ 3,0 (3 notes) dans la communauté');
  });

  it('rien quand le serveur ne sait rien, ou que les deux parties sont nulles', () => {
    expect(ligneCommunautaire(null, 'fr', tFr)).toBeNull();
    expect(ligneCommunautaire({ available: false, rating: null, listens: null }, 'fr', tFr)).toBeNull();
    // Un serveur qui dit « indisponible » n'est jamais cru sur ses chiffres.
    expect(ligneCommunautaire({ available: false, rating: { average: 4, count: 5 }, listens: null } as any, 'fr', tFr)).toBeNull();
    expect(ligneCommunautaire({ available: true, rating: null, listens: null }, 'fr', tFr)).toBeNull();
  });

  it('les libellés existent dans les douze langues, avec leurs marques', () => {
    expect(ONZE_LANGUES.length).toBe(15);
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      expect(d['library.communityRating'], code).toContain('{average}');
      expect(d['library.communityRating'], code).toContain('{count}');
      expect(d['library.communityListens'], code).toContain('{count}');
      expect(d['library.communityLine'], code).toContain('{parts}');
      expect(d['settings.communityShare'], code).toBeTruthy();
      expect(d['settings.communityShareHint'], code).toBeTruthy();
    }
  });
});

async function ficheAlbum(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumRating, { target: hote, props: { albumId: 10 } });
  flushSync();
  await attendre();
  return hote;
}

describe('#6545 — sur la fiche d\'album, sous « Ma note »', () => {
  it('affiche la ligne de la communauté', { timeout: 60_000 }, async () => {
    const h = await ficheAlbum();
    const l = h.querySelector('[data-communaute="album"]');
    expect(l, 'aucune ligne communautaire').not.toBeNull();
    expect(espaces(l!.textContent)).toBe('★ 4,2 (37 notes) · 1 240 écoutes dans la communauté');
    expect(h.querySelectorAll('.star-btn').length).toBe(5);
  });

  it('rien sous le seuil, rien si le serveur ne répond pas — et « Ma note » reste là', { timeout: 60_000 }, async () => {
    communaute = { available: true, rating: null, listens: null };
    let h = await ficheAlbum();
    expect(h.querySelector('[data-communaute="album"]')).toBeNull();
    unmount(monte!); hote!.remove();

    communauteEchoue = true;
    h = await ficheAlbum();
    expect(h.querySelector('[data-communaute="album"]')).toBeNull();
    expect(h.querySelectorAll('.star-btn.filled').length).toBe(4);
  });
});

async function ouvrirSysteme(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  expect(hote.textContent).toContain(fr['settings.telemetry']);
  return hote;
}

const caseCommunaute = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${CLE_PARTAGE_COMMUNAUTAIRE}"]`);
const caseEcoutes = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>(`input[type="checkbox"][data-cle="${CLE_ECOUTES_AU_COMPTE}"]`);

describe('#6545 — le consentement, dans Réglages › Système › Cloud', () => {
  it('séparé de « Mes écoutes », décoché par défaut, avec son texte', { timeout: 60_000 }, async () => {
    const h = await ouvrirSysteme();
    expect(caseCommunaute(h), 'aucune bascule communautaire').not.toBeNull();
    expect(caseEcoutes(h)).not.toBeNull();
    expect(caseCommunaute(h)).not.toBe(caseEcoutes(h));
    expect(caseCommunaute(h)!.checked).toBe(false);
    expect(h.textContent).toContain(fr['settings.communityShare']);
    expect(h.textContent).toContain(fr['settings.communityShareHint']);
  });

  it('cocher envoie PATCH de SA clé, et seulement elle', { timeout: 60_000 }, async () => {
    const h = await ouvrirSysteme();
    caseCommunaute(h)!.click();
    await attendre();
    expect(patchs).toContainEqual({ [CLE_PARTAGE_COMMUNAUTAIRE]: true });
    // Le consentement ne touche jamais l'envoi « Mes écoutes ».
    expect(patchs.some((p) => CLE_ECOUTES_AU_COMPTE in p)).toBe(false);
    expect(caseCommunaute(h)!.checked).toBe(true);
    expect(caseEcoutes(h)!.checked).toBe(false);
  });

  it('un serveur qui ne publie pas la clé : pas de case', { timeout: 60_000 }, async () => {
    delete config[CLE_PARTAGE_COMMUNAUTAIRE];
    const h = await ouvrirSysteme();
    expect(caseCommunaute(h)).toBeNull();
  });
});
