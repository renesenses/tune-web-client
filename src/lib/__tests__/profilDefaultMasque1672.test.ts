// @vitest-environment jsdom
//
// renesenses/tune-web-client#1672 — LE PROFIL « DEFAULT » EST MASQUÉ DÈS
// QU'UN PROFIL PERSONNEL EXISTE, ET N'A JAMAIS DE SUPPRIMER.
//
// Levente Toth, ticket 182 (27/09/2026) : Réglages > Profils montrait
// « Default » et « Levente Toth », chacun avec Edit et Delete. Le Delete de
// Default partait en `DELETE /profiles/1`, que le serveur refuse toujours
// (`tune-core/src/db/profile_repo.rs` : `if id == 1 { return Err("cannot
// delete default profile") }` → 400). Go de Bertrand le 27/09 : masquer
// Default des sélecteurs et de la liste dès qu'un profil personnel existe, le
// garder visible s'il est SEUL, et plus aucun Supprimer sur lui.
//
// 🔴 CES TÉMOINS MONTENT LE VRAI ÉCRAN `ProfilsV2` et lisent le DOM : le nom
// affiché et les boutons Supprimer. Les fonctions pures sont lues par
// `import * as` pour que, sur `main`, leur absence fasse rougir SON témoin sans
// empêcher le fichier de se charger : les témoins du rendu rougissent alors
// pour la vraie raison — « Default » affiché, et un Supprimer dessus.
//
// Contre-épreuve : `ProfilsV2.svelte` remis sur `$profiles` (sans
// `visibleProfiles` ni `profilSupprimable`) fait rougir les témoins du rendu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as magasin from '../stores/profile';
import { profiles, currentProfileId } from '../stores/profile';
import ProfilsV2 from '../../components/v2/ProfilsV2.svelte';

const DEFAULT = { id: 1, name: 'Default', avatar_color: '#6366f1' };
const LEVENTE = { id: 2, name: 'Levente Toth', avatar_color: '#22c55e' };
const ANNA = { id: 3, name: 'Anna', avatar_color: '#f59e0b' };

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => reponse([])));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

function rendre(liste: typeof DEFAULT[], actif: number) {
  profiles.set(liste);
  currentProfileId.set(actif);
  monte = mount(ProfilsV2, { target: hote! });
  flushSync();
  const lignes = [...hote!.querySelectorAll('ul.liste > li')];
  return {
    noms: lignes.map((li) => li.querySelector('.nom')?.textContent?.trim() ?? ''),
    /** Le nom de chaque ligne qui porte un bouton Supprimer. */
    supprimables: lignes
      .filter((li) => li.querySelector('button.lnk.danger'))
      .map((li) => li.querySelector('.nom')?.textContent?.trim() ?? ''),
  };
}

describe('web#1672 — Default masqué dès qu’un profil personnel existe', () => {
  it('deux profils : Default n’est pas listé, et aucun Supprimer ne le vise', () => {
    const { noms, supprimables } = rendre([DEFAULT, LEVENTE], LEVENTE.id);
    expect(noms).toEqual(['Levente Toth']);
    expect(supprimables).not.toContain('Default');
  });

  it('trois profils : les deux personnels restent supprimables, Default n’apparaît pas', () => {
    const { noms, supprimables } = rendre([DEFAULT, LEVENTE, ANNA], ANNA.id);
    expect(noms).toEqual(['Levente Toth', 'Anna']);
    expect(supprimables).toEqual(['Levente Toth', 'Anna']);
  });

  it('Default seul : il reste visible, sans Supprimer', () => {
    const { noms, supprimables } = rendre([DEFAULT], DEFAULT.id);
    expect(noms).toEqual(['Default']);
    expect(supprimables).toEqual([]);
  });

  it('le profil est masqué, pas retiré : le magasin le garde', () => {
    rendre([DEFAULT, LEVENTE], LEVENTE.id);
    expect(magasin.visibleProfiles, 'visibleProfiles absent').toBeTruthy();
    let vus: { id: number }[] = [];
    const stop = magasin.visibleProfiles.subscribe((v) => { vus = v; });
    stop();
    expect(vus.map((p) => p.id)).toEqual([2]);
    let tous: { id: number }[] = [];
    profiles.subscribe((v) => { tous = v; })();
    expect(tous.map((p) => p.id)).toEqual([1, 2]);
  });

  it('les règles pures : masquage, repli quand Default est seul, Default jamais supprimable', () => {
    expect(typeof magasin.profilsVisibles, 'profilsVisibles absente').toBe('function');
    expect(magasin.profilsVisibles([DEFAULT, LEVENTE]).map((p) => p.id)).toEqual([2]);
    expect(magasin.profilsVisibles([DEFAULT]).map((p) => p.id)).toEqual([1]);
    expect(magasin.profilsVisibles([]).length).toBe(0);
    expect(magasin.profilSupprimable(DEFAULT)).toBe(false);
    expect(magasin.profilSupprimable(LEVENTE)).toBe(true);
  });

  it('le menu de l’avatar liste les profils VISIBLES, pas le magasin brut', () => {
    const menu = readFileSync(
      fileURLToPath(new URL('../../components/v2/AvatarMenu.svelte', import.meta.url)), 'utf8');
    const boucle = menu.indexOf('{#each $visibleProfiles as p (p.id)}');
    expect(boucle, 'le menu ne parcourt pas visibleProfiles').toBeGreaterThan(-1);
    expect(menu.includes('{#each $profiles as p'), 'le menu parcourt encore $profiles').toBe(false);
  });
});
