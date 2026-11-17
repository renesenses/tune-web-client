// @vitest-environment jsdom
// renesenses/tune-server-rust#8958 (Didier, fil 2685 ; go de Bertrand du 17/11)
// — Albums douteux : « C'est normal » sur une alerte. Le serveur mémorise le
// choix (la piste, ou tout l'album pour un artiste manquant) et ne la rend
// plus ; l'écran relit la liste, propose d'annuler, et montre les alertes
// ignorées avec « Signaler de nouveau ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MetadataV2 from '../../components/v2/MetadataV2.svelte';
import * as api from '../api';
import { locale } from '../i18n';
import type { PisteDouteuse } from '../artisteDepuisChemin';
import { fr } from './onzeDictionnaires';

vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  listMetadataProposals: vi.fn(),
  getDoubtfulTracks: vi.fn(),
  getAlertesDouteusesIgnorees: vi.fn(),
  ignorerAlerteDouteuse: vi.fn(),
  retablirAlerteDouteuse: vi.fn(),
}));

const dict = fr as Record<string, string>;

/** Un faux serveur : la piste 1 (album « Bruitages », sans artiste, 2 s) et la
 *  piste 2 (sans album). Il retire les raisons ignorées, comme le vrai. */
type Ign = api.AlerteDouteuseIgnoree;
let ignorees: Ign[];
let avecPortees: boolean;
let peutIgnorer: boolean | undefined;
function pistes(): PisteDouteuse[] {
  const base = [
    { id: 1, album_id: 10, title: 'Pluie', album_title: 'Bruitages', reasons: ['missing_artist', 'very_short'],
      ignore_scopes: { missing_artist: 'album', very_short: 'track' } as Record<string, 'track' | 'album'> },
    { id: 2, album_id: null, title: 'Bip', album_title: null, reasons: ['missing_album'],
      ignore_scopes: { missing_album: 'track' } as Record<string, 'track' | 'album'> },
  ];
  return base
    .map((p) => {
      const reasons = p.reasons.filter((r) => !ignorees.some((i) => i.reason === r
        && ((i.scope === 'track' && i.key === `/m/${p.title}.flac`) || (i.scope === 'album' && i.title === p.album_title))));
      const scopes = Object.fromEntries(reasons.map((r) => [r, p.ignore_scopes[r]]));
      return {
        id: p.id, title: p.title, album_title: p.album_title, album_id: p.album_id, artist_name: null,
        duration_ms: 2000, file_path: `/m/${p.title}.flac`, reasons,
        ...(avecPortees ? { ignore_scopes: scopes } : {}),
      } as PisteDouteuse;
    })
    .filter((p) => p.reasons.length);
}

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  locale.set('fr');
  vi.clearAllMocks();
  ignorees = [];
  avecPortees = true;
  peutIgnorer = true;
  vi.mocked(api.listMetadataProposals).mockResolvedValue({ proposals: [], pending: 0, auto_apply: false });
  vi.mocked(api.getDoubtfulTracks).mockImplementation(async () => {
    const p = pistes(); return { items: p, total: p.length, can_ignore: peutIgnorer };
  });
  vi.mocked(api.getAlertesDouteusesIgnorees).mockImplementation(async () => ignorees.map((i) => ({
    ...i, found: true,
    track_title: i.scope === 'track' ? (i.key.includes('Pluie') ? 'Pluie' : 'Bip') : null,
    album_title: i.scope === 'album' ? 'Bruitages' : null, track_count: i.scope === 'album' ? 7 : undefined,
  })));
  vi.mocked(api.ignorerAlerteDouteuse).mockImplementation(async (trackId, reason) => {
    const scope: 'track' | 'album' = trackId === 1 && reason === 'missing_artist' ? 'album' : 'track';
    const a = scope === 'album'
      ? { scope, key: '/m', title: 'Bruitages', reason }
      : { scope, key: `/m/${trackId === 1 ? 'Pluie' : 'Bip'}.flac`, title: '', reason };
    ignorees = [...ignorees, { ...a, ignored_at: 1 }];
    return { ...a, added: true };
  });
  vi.mocked(api.retablirAlerteDouteuse).mockImplementation(async (a) => {
    ignorees = ignorees.filter((i) => !(i.scope === a.scope && i.key === a.key && i.title === a.title && i.reason === a.reason));
    return { removed: true };
  });
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined;
  hote.remove();
  vi.restoreAllMocks();
});

async function ouvrir() {
  composant = mount(MetadataV2, { target: hote });
  flushSync();
  [...hote.querySelectorAll<HTMLButtonElement>('.tabs button')]
    .find((b) => b.textContent?.includes(fr['v2.meta.tabDoubtful']))!.click();
  await vi.waitFor(() => {
    flushSync();
    expect(hote.querySelectorAll('.pistes-douteuses li[data-piste-id]').length).toBe(2);
  });
}

const ligne = (id: number) => hote.querySelector('[data-piste-id="' + id + '"]');
const bouton = (id: number, raison: string) =>
  ligne(id)?.querySelector<HTMLButtonElement>(`li[data-raison="${raison}"] button.normal`) ?? null;

describe('Albums douteux : marquer une alerte comme normale (#8958)', () => {
  it('chaque alerte a son geste, libellé selon la portée que donne le serveur', async () => {
    await ouvrir();
    expect(bouton(1, 'missing_artist')?.textContent).toContain(dict['v2.meta.dIgnoreAlbum']);
    expect(bouton(1, 'very_short')?.textContent).toContain(dict['v2.meta.dIgnoreTrack']);
    expect(bouton(2, 'missing_album')?.textContent).toContain(dict['v2.meta.dIgnoreTrack']);
  });

  it('contre-épreuve : un serveur sans `ignore_scopes` (plus ancien) — aucun geste offert', async () => {
    avecPortees = false;
    await ouvrir();
    expect(hote.querySelectorAll('button.normal').length).toBe(0);
    expect(ligne(1)?.textContent).toContain(dict['v2.meta.dReasonArtist']);
  });

  it('ignorer : appel au serveur, liste corrigée SUR PLACE (aucune relecture), « Annuler » la rend', async () => {
    await ouvrir();
    expect(api.getDoubtfulTracks).toHaveBeenCalledTimes(1);
    bouton(1, 'very_short')!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(api.ignorerAlerteDouteuse).toHaveBeenCalledWith(1, 'very_short');
      expect(bouton(1, 'very_short')).toBeNull();
    });
    // L'autre alerte de la piste reste : seule celle-ci est normale.
    expect(bouton(1, 'missing_artist')).not.toBeNull();
    expect(api.getDoubtfulTracks, 'pas de relecture des pages').toHaveBeenCalledTimes(1);
    const bilan = hote.querySelector('[data-bilan-ignore]')!;
    expect(bilan.textContent).toContain(
      dict['v2.meta.dIgnoredDone'].replace('{reason}', dict['v2.meta.dReasonShort']).replace('{name}', 'Pluie'),
    );
    [...bilan.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(dict['v2.meta.dUndo']))!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(api.retablirAlerteDouteuse).toHaveBeenCalledWith({ scope: 'track', key: '/m/Pluie.flac', title: '', reason: 'very_short' });
      expect(bouton(1, 'very_short')).not.toBeNull();
    });
    expect(hote.querySelector('[data-bilan-ignore]')).toBeNull();
    expect(api.getDoubtfulTracks, 'annuler non plus ne relit pas').toHaveBeenCalledTimes(1);
  });

  it('la liste des ignorées se déplie, nomme l’album, et « Signaler de nouveau » remet l’alerte', async () => {
    await ouvrir();
    expect(hote.querySelector('[data-alertes-ignorees]')).toBeNull();
    bouton(1, 'missing_artist')!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(hote.querySelector('[data-alertes-ignorees]')).not.toBeNull();
    });
    const section = hote.querySelector('[data-alertes-ignorees]')!;
    const bascule = section.querySelector<HTMLButtonElement>('button')!;
    expect(bascule.textContent).toContain(dict['v2.meta.dIgnoredShow'].replace('{count}', '1'));
    bascule.click();
    flushSync();
    const li = section.querySelector('li[data-portee="album"]')!;
    expect(li.textContent).toContain('Bruitages');
    expect(li.textContent).toContain(dict['v2.meta.dIgnoredScopeAlbum'].replace('{count}', '7'));
    expect(li.textContent).toContain(dict['v2.meta.dReasonArtist']);
    [...li.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(dict['v2.meta.dRestore']))!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(api.retablirAlerteDouteuse).toHaveBeenCalledWith({ scope: 'album', key: '/m', title: 'Bruitages', reason: 'missing_artist' });
      expect(bouton(1, 'missing_artist')).not.toBeNull();
      expect(hote.querySelector('[data-alertes-ignorees]')).toBeNull();
    });
  });

  it('la liste des ignorées reste accessible quand plus rien n’est douteux', async () => {
    ignorees = [
      { scope: 'album', key: '/m', title: 'Bruitages', reason: 'missing_artist', ignored_at: 1 },
      { scope: 'track', key: '/m/Pluie.flac', title: '', reason: 'very_short', ignored_at: 1 },
      { scope: 'track', key: '/m/Bip.flac', title: '', reason: 'missing_album', ignored_at: 1 },
    ];
    composant = mount(MetadataV2, { target: hote });
    flushSync();
    [...hote.querySelectorAll<HTMLButtonElement>('.tabs button')]
      .find((b) => b.textContent?.includes(fr['v2.meta.tabDoubtful']))!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(hote.textContent).toContain(dict['v2.meta.noDoubtful']);
      expect(hote.querySelector('[data-alertes-ignorees]')?.textContent)
        .toContain(dict['v2.meta.dIgnoredShow'].replace('{count}', '3'));
    });
    // Une alerte d'une séance passée : seul le serveur sait où elle revient,
    // la liste est relue (discrètement).
    const section = hote.querySelector('[data-alertes-ignorees]')!;
    section.querySelector<HTMLButtonElement>('button')!.click();
    flushSync();
    const bip = [...section.querySelectorAll('li')].find((li) => li.textContent?.includes('Bip'))!;
    [...bip.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(dict['v2.meta.dRestore']))!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(ligne(2)).not.toBeNull();
    });
    expect(api.getDoubtfulTracks).toHaveBeenCalledTimes(2);
  });
});

describe('Albums douteux : réservé à l’administrateur (#8958)', () => {
  it('le serveur dit `can_ignore: false` : aucun bouton, une note le dit', async () => {
    peutIgnorer = false;
    await ouvrir();
    expect(hote.querySelectorAll('button.normal').length).toBe(0);
    expect(hote.querySelector('[data-ignore-reserve]')?.textContent).toContain(dict['v2.meta.dIgnoreAdminOnly']);
  });

  it('contre-épreuve : `can_ignore: true` — pas de note', async () => {
    await ouvrir();
    expect(hote.querySelector('[data-ignore-reserve]')).toBeNull();
    expect(hote.querySelectorAll('button.normal').length).toBe(3);
  });

  it('un 403 au geste : message clair, les boutons disparaissent', async () => {
    await ouvrir();
    vi.mocked(api.ignorerAlerteDouteuse).mockRejectedValueOnce(Object.assign(new Error('admin role required'), { status: 403 }));
    bouton(2, 'missing_album')!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(hote.textContent).toContain(dict['v2.meta.dIgnoreForbidden']);
      expect(hote.querySelectorAll('button.normal').length).toBe(0);
    });
    expect(ligne(2)).not.toBeNull();
  });
});

describe('API des alertes ignorées (#8958)', () => {
  it('les chemins et corps attendus par le serveur', async () => {
    const vrai = await vi.importActual<typeof import('../api')>('../api');
    const f = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0, removed: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', f);
    await vrai.ignorerAlerteDouteuse(12, 'very_short');
    await vrai.retablirAlerteDouteuse({ scope: 'album', key: '/m/Fx', title: 'Bruitages', reason: 'missing_artist' });
    expect(await vrai.getAlertesDouteusesIgnorees()).toEqual([]);
    const appels = f.mock.calls.map((c: any[]) => [String(c[0]), c[1]?.method ?? 'GET', c[1]?.body ?? null]);
    expect(appels[0][0]).toMatch(/\/metadata\/doubtful\/ignored$/);
    expect(appels[0][1]).toBe('POST');
    expect(JSON.parse(appels[0][2])).toEqual({ track_id: 12, reason: 'very_short' });
    expect(appels[1][0]).toMatch(/\/metadata\/doubtful\/ignored$/);
    expect(appels[1][1]).toBe('DELETE');
    expect(JSON.parse(appels[1][2])).toEqual({ scope: 'album', key: '/m/Fx', title: 'Bruitages', reason: 'missing_artist' });
    expect(appels[2][0]).toMatch(/\/metadata\/doubtful\/ignored$/);
    vi.unstubAllGlobals();
  });
});
