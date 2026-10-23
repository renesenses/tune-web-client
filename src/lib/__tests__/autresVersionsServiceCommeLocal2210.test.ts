// @vitest-environment jsdom
//
// web#2210 — fil 2302, point 18 (FabienM, rc6) : « L'action "autres versions"
// d'un titre de service (Qobuz/Bandcamp) ne donne pas la même fenêtre qu'un
// titre de sa bibliothèque. Il faut harmoniser les fenêtres, prendre celle du
// local comme référence » — et sans le bandeau « Jouée par défaut ».
//
// On monte le VRAI panneau deux fois : par `trackId` (titre local, réponse
// regroupée du serveur) et par `parTitre` (titre de service). Les deux doivent
// rendre la même structure : sections `.groupe`, lignes `.membre`, menu « … ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VersionsPistePanneau from '../../components/v2/VersionsPistePanneau.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { groupesParTitre } from '../groupesParTitre';

const GROUPES_LOCAL = {
  track_id: 700, title: 'Lovely Day', artist_name: 'Bill Withers', rule: 'quality', rule_origin: 'profile',
  groups: [{
    identity: 'isrc', isrc: 'USSM17700001', musicbrainz_recording_id: null, contains_reference: true, default: 1,
    members: [
      { source: 'local', track_id: 700, source_id: null, title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie',
        album_id: 44, cover_path: null, kind: 'reference', duration_ms: 255000, isrc: 'USSM17700001', musicbrainz_recording_id: null,
        quality: { format: 'FLAC', sample_rate: 44100, bit_depth: 16 }, available: true, link: 'isrc', is_reference: true, is_default: false },
      { source: 'qobuz', track_id: null, source_id: 'q1', title: 'Lovely Day', artist_name: 'Bill Withers', album_title: 'Menagerie (Remaster)',
        album_id: 'qa1', cover_path: null, kind: 'version', duration_ms: 255000, isrc: 'USSM17700001', musicbrainz_recording_id: null,
        quality: { format: 'FLAC', sample_rate: 96000, bit_depth: 24 }, available: true, link: 'isrc', is_reference: false, is_default: true },
    ],
  }],
};

const piste = (o: Record<string, unknown>) => ({ title: 'Lovely Day', artist_name: 'Bill Withers', duration_ms: 255000, ...o });
const FEDEREE = {
  local: { tracks: [piste({ id: 700, album_id: 44, album_title: 'Menagerie', source: 'local' })], albums: [], artists: [] },
  services: {
    qobuz: { tracks: [
      piste({ source: 'qobuz', source_id: 'q-origine', album_id: 'qa0', album_title: 'Menagerie' }),
      piste({ source: 'qobuz', source_id: 'q2', album_id: 'qa2', album_title: 'Live at Carnegie Hall', duration_ms: 301000 }),
    ], albums: [], artists: [] },
  },
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const souffler = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };

beforeEach(() => {
  locale.set('fr');
  preferences.update((p) => ({ ...p, ordreAutresVersions: 'pertinence' }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const c = /\/versions\/groups/.test(url) ? GROUPES_LOCAL : /\/search\?q=/.test(url) ? FEDEREE : {};
    return {
      ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(c), json: async () => c,
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

async function ouvrir(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(VersionsPistePanneau, { target: hote, props: { onClose: () => {}, titre: 'Lovely Day', ...props } as any });
  await souffler();
}
function structure() {
  return {
    groupes: document.querySelectorAll('.panneau .groupes .groupe').length,
    membres: document.querySelectorAll('.panneau .groupes .groupe .membre').length,
    menus: document.querySelectorAll('.panneau .membre button.mv').length,
    tuiles: document.querySelectorAll('.panneau .tuile').length,
  };
}

describe('web#2210 — « Autres versions » d’un titre de service : la fenêtre d’un titre local', () => {
  it('témoin : le titre local rend des sections et des lignes', async () => {
    await ouvrir({ trackId: 700 });
    const s = structure();
    expect(s.groupes).toBeGreaterThan(0);
    expect(s.membres).toBe(2);
    expect(s.tuiles).toBe(0);
  });

  it('🔴 le titre de service rend la MÊME structure : sections, lignes, menu « … », aucune tuile', async () => {
    await ouvrir({ parTitre: { titre: 'Lovely Day', artiste: 'Bill Withers', source: 'qobuz', source_id: 'q-origine' } });
    const s = structure();
    expect(s.tuiles, 'la fenêtre d’un titre de service est restée en tuiles plates').toBe(0);
    expect(s.membres).toBe(2); // la locale et le live ; l'origine est écartée
    expect(s.groupes).toBe(2);
    expect(s.menus).toBe(2);
    const textes = [...document.querySelectorAll('.membre .ti')].map((e) => e.textContent?.trim());
    expect(textes).toEqual(['Menagerie', 'Live at Carnegie Hall']);
    // La section se dit par ce qui la distingue, durée comprise (5:01).
    expect(document.querySelectorAll('.groupe h3')[1].textContent).toContain('5:01');
  });

  it('🔴 aucun bandeau « Jouée par défaut » pour un titre de service', async () => {
    await ouvrir({ parTitre: { titre: 'Lovely Day', artiste: 'Bill Withers', source: 'qobuz', source_id: 'q-origine' } });
    expect(document.querySelectorAll('.par-defaut').length).toBe(0);
    expect(document.querySelectorAll('.membre.defaut').length).toBe(0);
  });

  it('le passage à la forme regroupée garde l’ordre réglé et ne désigne aucun défaut', () => {
    const g = groupesParTitre({
      title: 'x', artist_name: 'y', played_album: '',
      versions: [{ track_id: 1, album_id: 2, album_title: 'A', cover_path: null, duration_ms: 1000 }],
      streaming: [
        { service: 'bandcamp', source_id: 'b', title: 'x', artist_name: 'y', album_title: 'B', album_id: null, cover_path: null, kind: 'version' },
        { service: 'qobuz', source_id: 'q', title: 'x', artist_name: 'y', album_title: 'Q', album_id: null, cover_path: null, kind: 'version' },
      ],
    }, 'source');
    expect(g.groups.map((x) => x.members[0].album_title)).toEqual(['A', 'Q', 'B']);
    expect(g.groups.every((x) => x.default === null && x.members.every((m) => !m.is_default))).toBe(true);
  });
});
