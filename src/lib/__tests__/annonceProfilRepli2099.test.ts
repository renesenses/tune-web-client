// @vitest-environment jsdom
//
// web#2099 (FabienM, fil forum 2236, point 11, 1.0.0-rc4) — « j'ai créé une
// playlist locale et en effaçant mon cache du navigateur, elle a disparu ».
//
// La playlist est en base, sous le profil d'avant : le cache vidé, le client
// est reparti sur un autre profil SANS RIEN DIRE. Désormais, quand plusieurs
// profils existent et que celui du navigateur a été oublié (ou a disparu),
// le profil choisi s'annonce : « Profil : X ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import sourceAmorcage from '../v2Bootstrap.ts?raw';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const PROFILS = [
  { id: 1, name: 'Default', avatar_color: '#000' },
  { id: 2, name: 'fabien@exemple.fr', display_name: 'Fabien', avatar_color: '#111' },
  { id: 3, name: 'marie', avatar_color: '#222' },
];

function serveur(liste: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const charge = /\/profiles$/.test(url) ? liste : [];
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
}

/** Charge les modules À NEUF : `profile.ts` lit le localStorage à son import. */
async function demarrer(memorise: string | null, liste: unknown[]) {
  localStorage.clear();
  if (memorise != null) localStorage.setItem('tune-profile-id', memorise);
  serveur(liste);
  vi.resetModules();
  const i18n = await import('../i18n');
  i18n.locale.set('fr');
  const profil = await import('../stores/profile');
  const annonce = await import('../annonceProfilRepli');
  const { notifications } = await import('../stores/notifications');
  await profil.loadProfiles();
  annonce.annoncerProfilDeRepli();
  return { profil, messages: get(notifications).map((n) => n.message) };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('#2099 — un profil choisi à la place d’un profil oublié se dit', () => {
  it('🔴 cache vidé, plusieurs profils : « Profil : Fabien » s’annonce', async () => {
    const { profil, messages } = await demarrer(null, PROFILS);
    expect(get(profil.currentProfileId)).toBe(2);
    expect(messages).toEqual([fr['profiles.fallbackNotice'].replace('{name}', 'Fabien')]);
  });

  it('🔴 le profil retenu a disparu : le profil de repli s’annonce aussi', async () => {
    const { messages } = await demarrer('9', PROFILS);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('Fabien');
  });

  it('le profil retenu existe : rien à dire', async () => {
    const { profil, messages } = await demarrer('3', PROFILS);
    expect(get(profil.currentProfileId)).toBe(3);
    expect(messages).toEqual([]);
  });

  it('un seul profil visible : aucune ambiguïté, rien à dire', async () => {
    const { messages } = await demarrer(null, PROFILS.slice(0, 2));
    expect(messages).toEqual([]);
  });

  it('l’amorçage v2 appelle l’annonce après le chargement des profils', () => {
    // tune-server-rust#6454 — le chargement passe par la reprise
    // (`chargerLesProfilsAvecReprise`) ; l'annonce vit dans `apresLeProfil`,
    // appelée seulement une fois le premier essai réussi, ou à la fin de la
    // reprise.
    const bloc = (nom: string) => {
      const corps = sourceAmorcage.slice(sourceAmorcage.indexOf(`async function ${nom}(`));
      return corps.slice(0, corps.indexOf('\n}\n'));
    };
    expect(bloc('apresLeProfil')).toContain('annoncerProfilDeRepli()');
    const charge = bloc('loadProfile');
    const reprise = charge.indexOf('chargerLesProfilsAvecReprise()');
    expect(reprise).toBeGreaterThan(-1);
    expect(charge.indexOf('if (await premier)')).toBeGreaterThan(reprise);
    expect(charge.indexOf('await apresLeProfil()')).toBeGreaterThan(charge.indexOf('if (await premier)'));
    expect(charge).toContain('void fin.then(apresLeProfil)');
  });
});
