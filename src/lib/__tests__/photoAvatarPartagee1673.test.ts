// @vitest-environment jsdom
//
// #1673 — « Profile picture set up on machine A, doesn't show on machine B or
// C » (Levente Toth, ticket support 181, 0.9.166, Linux).
//
// ## Ce qui a été MESURÉ avant d'écrire une ligne
//
// Le doute de la fiche d'issue était réel : la photo est-elle locale au
// navigateur (et alors elle ne voyage jamais, et le correctif est un chantier),
// ou passe-t-elle par le serveur ? Relevé sur le serveur d'essai
// (`192.168.1.18:8888`, 27/09/2026) :
//
//   - `GET /api/v1/system/config` rend bien `ui_preferences`, et il est rangé
//     PAR PROFIL : l'en-tête `X-Profile-Id: 2` rend `"language":"fr"` là où le
//     profil 1 rend `"en"` ;
//   - un `PATCH` portant `avatarImage` en donnée URL de 12 023 octets est
//     accepté (`{"ok":true}`, HTTP 200) et RELU INTACT — même longueur, même
//     préfixe — et il reste invisible du profil voisin.
//
// Donc le transport EXISTE et il fonctionne. La photo a bien un chemin pour
// aller de la machine A à la machine B, dès lors que les deux ouvrent le même
// serveur avec le même profil. Le défaut n'est pas dans le rangement : il est
// dans la RELECTURE.
//
// ## Le défaut
//
// `syncPreferencesFromServer` fusionne `{ ...defaults, ...server, ...local }`
// dès qu'un blob local existe : le LOCAL gagne, clé par clé. Or
// `createPreferences` sérialise le blob ENTIER à chaque émission, dès la
// première ouverture — donc toute machine ayant affiché Tune une seule fois
// porte `avatarImage: ''` dans son `localStorage`. Ce `''` n'est pas un choix,
// c'est le défaut ; et il écrase la photo que le serveur porte, à chaque
// chargement, pour toujours.
//
// C'est exactement le piège que #5065 avait déjà traité pour `sourcesBarre` :
// une valeur locale encore indécise ne doit pas effacer le choix fait sur un
// autre poste. La photo tombait dans le même trou.
//
// 🔴 `avatarCompte` voyage AVEC l'image, jamais sans : `photoAAfficher` refuse
// d'afficher une photo dont le propriétaire ne correspond pas au compte ouvert
// (`proprietaireAvatar.ts`). Adopter l'image en laissant le `''` local ferait
// une photo reçue et jamais montrée — un vert qui ne garde rien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const STORAGE_KEY = 'tune-preferences';

/** Une vraie donnée URL d'image : le filtre `estDataUrlImage` du magasin
 *  écarte tout le reste, des deux côtés (relecture locale ET blob serveur). */
const PHOTO = 'data:image/webp;base64,UklGRhYAAABXRUJQVlA4TAoAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

/** Le blob qu'une machine écrit dès sa PREMIÈRE ouverture : complet, avec tous
 *  les défauts — dont `avatarImage: ''`. Ce n'est pas un cas de bord, c'est
 *  l'état de toute machine B qui a déjà affiché Tune une fois. */
function blobLocalSansPhoto(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    theme: 'midnight', language: 'en', volumeDisplay: 'percent',
    avatarImage: '', avatarCompte: '', ...extra,
  });
}

/** Le `fetch` du magasin : deux lectures (`system/config`, puis la zone par
 *  défaut) et les écritures `PATCH`, qu'on absorbe. */
function serveurQuiPorte(prefs: Record<string, unknown>) {
  return vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('system/config')) {
      return {
        ok: true, status: 200,
        json: async () => ({ ui_preferences: JSON.stringify(prefs) }),
        text: async () => '',
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as unknown as Response;
  });
}

async function magasinApresSynchro(prefsServeur: Record<string, unknown>) {
  vi.stubGlobal('fetch', serveurQuiPorte(prefsServeur));
  vi.resetModules();
  const mod = await import('../stores/preferences');
  await mod.syncPreferencesFromServer();
  return get(mod.preferences);
}

describe('#1673 — la photo suit le profil, pas le navigateur', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('🔴 machine B, déjà ouverte une fois : la photo du serveur ARRIVE', async () => {
    // Le cas de terrain de Levente Toth. Sans le correctif, le `avatarImage: ''`
    // du blob local gagne et la bulle reste en dégradé, à jamais.
    localStorage.setItem(STORAGE_KEY, blobLocalSansPhoto());
    const p = await magasinApresSynchro({
      theme: 'midnight', avatarImage: PHOTO, avatarCompte: 'toth.levente@gmail.com',
    });
    expect(
      p.avatarImage,
      'la photo posée sur la machine A reste invisible sur la machine B : le blob local l’écrase',
    ).toBe(PHOTO);
  });

  it('🔴 et son PROPRIÉTAIRE arrive avec elle, sinon elle ne s’affiche pas', async () => {
    // `photoAAfficher` compare `avatarCompte` à l'identité du compte ouvert :
    // une image adoptée avec un propriétaire vide serait reçue et jamais
    // montrée. Le vert serait faux.
    localStorage.setItem(STORAGE_KEY, blobLocalSansPhoto());
    const p = await magasinApresSynchro({
      avatarImage: PHOTO, avatarCompte: 'toth.levente@gmail.com',
    });
    expect(p.avatarCompte).toBe('toth.levente@gmail.com');
  });

  it('la photo CHOISIE ICI n’est pas écrasée par celle du serveur', async () => {
    // Contre-épreuve de la règle : le local ne perd pas la main. Ce qu'on
    // adopte, c'est une absence, pas un choix.
    const MIENNE = 'data:image/png;base64,iVBORw0KGgo=';
    localStorage.setItem(STORAGE_KEY, blobLocalSansPhoto({
      avatarImage: MIENNE, avatarCompte: 'moi@exemple.fr',
    }));
    const p = await magasinApresSynchro({
      avatarImage: PHOTO, avatarCompte: 'toth.levente@gmail.com',
    });
    expect(p.avatarImage).toBe(MIENNE);
    expect(p.avatarCompte).toBe('moi@exemple.fr');
  });

  it('un serveur SANS photo ne pose pas de propriétaire orphelin', async () => {
    localStorage.setItem(STORAGE_KEY, blobLocalSansPhoto());
    const p = await magasinApresSynchro({ theme: 'light', avatarImage: '', avatarCompte: '' });
    expect(p.avatarImage).toBe('');
    expect(p.avatarCompte).toBe('');
  });

  it('🔴 une photo ABÎMÉE venue du serveur n’est toujours pas adoptée', async () => {
    // Le filtre `estDataUrlImage` garde l'attribut `src` de la bulle. Le
    // correctif passe APRÈS lui : il ne doit pas rouvrir la porte qu'il ferme.
    localStorage.setItem(STORAGE_KEY, blobLocalSansPhoto());
    const p = await magasinApresSynchro({
      avatarImage: 'data:text/html;base64,PHNjcmlwdD4=', avatarCompte: 'attaquant@exemple.fr',
    });
    expect(p.avatarImage, 'une valeur distante non-image atteint le `src` de la bulle').toBe('');
  });

  it('le reste du blob local est rendu intact', async () => {
    // Sans ça, « la photo arrive » pourrait être obtenu en écrasant tout le
    // local par le serveur — ce qui casserait tous les autres réglages.
    localStorage.setItem(STORAGE_KEY, blobLocalSansPhoto({ theme: 'light', volumeDisplay: 'dB' }));
    const p = await magasinApresSynchro({
      theme: 'midnight', volumeDisplay: 'percent', avatarImage: PHOTO, avatarCompte: 'x@y.fr',
    });
    expect(p.theme).toBe('light');
    expect(p.volumeDisplay).toBe('dB');
    expect(p.avatarImage).toBe(PHOTO);
  });
});
