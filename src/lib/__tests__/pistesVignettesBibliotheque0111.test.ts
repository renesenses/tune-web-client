// @vitest-environment jsdom
/**
 * Retour de Bertrand le 01/11/2026, .18 en v5, Bibliothèque › Pistes
 * (53 454 titres) : « de petites pochettes sur chaque ligne », et trois
 * défauts sur la même capture.
 *
 *  1. la vignette : présente dans la Bibliothèque, absente sur la fiche d'un
 *     album dont toutes les pistes partagent la pochette ;
 *  2. « Serveur absent » : seulement si le serveur UPnP est réellement absent ;
 *  3. « 0 Divers » : le tableau rend l'artiste tel que le serveur l'envoie,
 *     sans rien y accoler ;
 *  4. le bandeau de mise à jour ne propose pas une rc9 à une `1.0.0-dev`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, unmount, flushSync } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { pochettesDePisteDistinctes } from '../pochetteDePisteDistincte';
import { etatSourceUpnp } from '../stores/disponibiliteUpnp';
import { valeurColonne } from '../colonnesPistes';
import { majProposee, estVersionDeDeveloppement } from '../versions';
import { normaliserVerificationMaj } from '../miseAJour';

const POCHETTE = 'afaa1676dba0ff09cade2b9082038da1661148e6775c35209a704987c2eadd3e';

/** Forme relevée sur le .18 (`/api/v1/library/tracks?limit=20`, 01/11/2026). */
const PISTE = {
  id: 175001,
  title: 'Mariam Matrem',
  artist_name: 'Divers',
  album_artist: 'Divers',
  album_id: 18445,
  album_title: 'MIRRORS OF TIME',
  cover_path: POCHETTE,
  duration_ms: 265706,
  format: 'dsd',
  sample_rate: 2822400,
  bit_depth: 1,
  track_number: 0,
  disc_number: 1,
  source: 'local',
} as any;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
function poser(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ListePistesV2, { target: hote, props });
  flushSync();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [], text: async () => '[]',
  })));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('1 — petites pochettes dans Bibliothèque › Pistes', () => {
  const lib = readFileSync(resolve(process.cwd(), 'src/components/v2/LibraryV2.svelte'), 'utf-8');

  it('les DEUX listes de l’onglet Pistes (paginée et chargée) demandent la vignette', () => {
    const appels = lib.match(/<ListePistesV2[\s\S]*?\/>/g) ?? [];
    const pistes = appels.filter((a) => /pistes=\{(lignesPagine|visibleTracks)\}/.test(a));
    expect(pistes).toHaveLength(2);
    for (const a of pistes) expect(a).toMatch(/\bpochetteEnTableau\b/);
  });

  it('la vignette est petite, différée, et de taille réservée', () => {
    const el = poser({ pistes: [PISTE], onLire: () => {}, pochetteEnTableau: true });
    const vig = el.querySelector('.tbl .trow .titre .tvig .album-art') as HTMLElement | null;
    expect(vig, 'aucune vignette dans la cellule du titre').not.toBeNull();
    expect(vig!.style.width).toBe('36px');
    expect(vig!.style.height).toBe('36px');
    const img = vig!.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('loading')).toBe('lazy');
    // La plus petite case du serveur, pas l'original.
    expect(img!.getAttribute('src') ?? '').toMatch(/size=\d+/);
  });

  it('la vignette n’ajoute pas de colonne : en-tête et lignes restent alignés', () => {
    const el = poser({ pistes: [PISTE], onLire: () => {}, pochetteEnTableau: true });
    const enTete = el.querySelectorAll('.tbl .thead .th').length;
    expect(el.querySelector('.tbl .trow')!.children.length).toBe(enTete);
  });

  it('contre-épreuve — fiche d’album à pochette unique : pas de vignette', () => {
    const pistesAlbum = Array.from({ length: 12 }, (_, i) => ({ ...PISTE, id: i + 1 }));
    const montrer = pochettesDePisteDistinctes(pistesAlbum, POCHETTE);
    expect(montrer).toBe(false);
    const el = poser({ pistes: pistesAlbum, onLire: () => {}, pochetteEnTableau: montrer });
    expect(el.querySelector('.tbl .trow')).not.toBeNull();
    expect(el.querySelector('.tbl .trow .titre .album-art')).toBeNull();
  });
});

describe('2 — « Serveur absent » seulement si la source est réellement absente', () => {
  const UDN = 'uuid:9e933823-6c5a-40ae-b00c-86bdc3a5bd88';
  const sourceId = `${UDN}|3df5c5f50b819ff0`;
  const registre = (s: Record<string, unknown>) => ({
    connu: true,
    serveurs: new Map([[UDN, { id: UDN, name: 'Tune Server', active: true, ...s } as any]]),
  });

  it('serveur présent et joignable : « present », jamais « absent »', () => {
    expect(etatSourceUpnp(sourceId, registre({ presence: 'present', reachable: true })).etat).toBe('present');
  });

  it('serveur annoncé mais pas encore sondé : « stale », pas « absent »', () => {
    expect(etatSourceUpnp(sourceId, registre({ presence: 'present', reachable: false })).etat).toBe('stale');
  });

  it('registre pas encore chargé : « unknown », pas « absent »', () => {
    expect(etatSourceUpnp(sourceId, { connu: false, serveurs: new Map() }).etat).toBe('unknown');
  });

  it('contre-épreuve — le cas du .18 (disparition confirmée) : « absent »', () => {
    // Le serveur 9e933823 était un Tune du .15, qui ne répond plus :
    // `presence: absent`, `disparition_confirmee`,
    // `last_seen_at` 06/10. Le badge dit vrai.
    expect(etatSourceUpnp(sourceId, registre({
      presence: 'absent', reachable: false, absence_reason: 'disparition_confirmee',
    })).etat).toBe('absent');
  });

  it('le tableau ne pose le badge que sur une piste UPnP', () => {
    const el = poser({ pistes: [PISTE], onLire: () => {} });
    expect(el.querySelector('.disponibilite')).toBeNull();
  });
});

describe('3 — l’artiste sans « 0 » accolé', () => {
  it('track_number à 0 ne se colle pas à l’artiste', () => {
    expect(valeurColonne(PISTE, 'artist')).toBe('Divers');
    const el = poser({ pistes: [PISTE], onLire: () => {} });
    const cellules = [...el.querySelectorAll('.tbl .trow .td')].map((c) => c.textContent?.trim() ?? '');
    expect(cellules).toContain('Divers');
    expect(cellules.some((c) => /^0\s*Divers/.test(c))).toBe(false);
  });

  it('contre-épreuve — un nom qui COMMENCE par un chiffre reste intact', () => {
    // « 0 Divers », « 1 JAZZ », « 2 CLASSIQUE » sont dans les étiquettes des
    // fichiers du .18 (tri par dossier). Le client ne retranche rien : il
    // amputerait « 2 Unlimited » ou « 10cc ».
    expect(valeurColonne({ ...PISTE, artist_name: '0 Divers' }, 'artist')).toBe('0 Divers');
    expect(valeurColonne({ ...PISTE, artist_name: '10cc' }, 'artist')).toBe('10cc');
  });
});

describe('4 — pas de bandeau pour une version plus récente que la release', () => {
  it('1.0.0-dev (construite sur la rc10) ne se voit pas proposer la rc9', () => {
    expect(estVersionDeDeveloppement('1.0.0-dev')).toBe(true);
    expect(majProposee('1.0.0-dev', '1.0.0-rc9')).toBe(false);
    expect(majProposee('1.0.0-dev', '1.0.0')).toBe(false);
    expect(majProposee('1.0.0-dev.3+abc', '1.0.0-rc10')).toBe(false);
  });

  it('la réponse du .18 est corrigée à la normalisation (bandeau ET Réglages)', () => {
    const n = normaliserVerificationMaj({ current: '1.0.0-dev', latest: '1.0.0-rc9', update_available: true });
    expect(n!.update_available).toBe(false);
  });

  it('contre-épreuve — une vraie nouveauté reste proposée', () => {
    expect(majProposee('1.0.0-dev', '1.0.1')).toBe(true);
    expect(majProposee('0.9.169-dev', '1.0.0-rc9')).toBe(true);
    expect(majProposee('1.0.0-rc8', '1.0.0-rc9')).toBe(true);
    expect(majProposee('1.0.0-rc9', '1.0.0-rc9')).toBe(false);
    expect(estVersionDeDeveloppement('1.0.0-rc9')).toBe(false);
    const n = normaliserVerificationMaj({ current: '1.0.0-rc8', latest: '1.0.0-rc9', update_available: false });
    expect(n!.update_available).toBe(true);
  });
});
