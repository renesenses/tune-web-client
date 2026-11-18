// @vitest-environment jsdom
// web#3175 — Métadonnées › Albums douteux (fil 2685, rc12) : la note d'en-tête
// disait toujours « Vérifiez chaque nom identifié avant de le valider. », même
// sans rien à valider. Les seules actions de validation (« Poser l'artiste »,
// « Écrire l'artiste du dossier ») n'existent que pour une piste SANS ARTISTE
// dont le dossier donne un nom. La consigne n'est plus dite qu'à ce moment-là.
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
}));

const dict = fr as Record<string, string>;
let pistes: PisteDouteuse[] = [];

const piste = (id: number, reasons: string[], extra: Partial<PisteDouteuse> = {}): PisteDouteuse => ({
  id, title: `T${id}`, album_title: 'Album', album_id: 10, artist_name: null,
  duration_ms: 2000, file_path: `/m/T${id}.flac`, reasons, ...extra,
} as PisteDouteuse);

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  locale.set('fr');
  vi.clearAllMocks();
  vi.mocked(api.listMetadataProposals).mockResolvedValue({ proposals: [], pending: 0, auto_apply: false });
  vi.mocked(api.getDoubtfulTracks).mockImplementation(async () => ({ items: pistes, total: pistes.length, can_ignore: true }));
  vi.mocked(api.getAlertesDouteusesIgnorees).mockResolvedValue([]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined;
  hote.remove();
  vi.restoreAllMocks();
});

async function ouvrirNote(): Promise<string> {
  composant = mount(MetadataV2, { target: hote });
  flushSync();
  [...hote.querySelectorAll<HTMLButtonElement>('.tabs button')]
    .find((b) => b.textContent?.includes(fr['v2.meta.tabDoubtful']))!.click();
  await vi.waitFor(() => {
    flushSync();
    expect(hote.querySelectorAll('.pistes-douteuses li[data-piste-id]').length).toBe(pistes.length);
  });
  return [...hote.querySelectorAll('.scroll > .note')].map((n) => (n.textContent ?? '').trim()).join(' | ');
}

describe('web#3175 — consigne de vérification des Albums douteux', () => {
  it('rien à valider (piste très courte, album manquant) : le constat seul, sans consigne', async () => {
    pistes = [piste(1, ['very_short']), piste(2, ['missing_album'], { album_title: null, album_id: null })];
    const note = await ouvrirNote();
    expect(note).toContain(dict['v2.meta.dArtistIntro'].replace('{count}', '2'));
    expect(note).not.toContain(dict['v2.meta.dArtistVerify']);
    expect(note).not.toMatch(/valider|vérifiez/i);
  });

  it('un artiste trouvé dans le dossier : la consigne est dite, avec l’action qu’elle vise', async () => {
    pistes = [piste(1, ['missing_artist'], { folder_artist: 'Pink Floyd' } as Partial<PisteDouteuse>), piste(2, ['very_short'])];
    const note = await ouvrirNote();
    expect(note).toContain(dict['v2.meta.dArtistIntro'].replace('{count}', '2'));
    expect(note).toContain(dict['v2.meta.dArtistVerify']);
  });
});
