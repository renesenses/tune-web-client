// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getContinueListening: vi.fn(), resumeListening: vi.fn(), play: vi.fn() }));
vi.mock('../api', async (original) => ({ ...await original<typeof import('../api')>(), ...mocks }));
import { widgetParId } from '../accueilWidgets';
import { sousTitreReprise } from '../reprendreEcoute';
const ctx: any = { zones: [], albums: [], limite: 50 };
beforeEach(() => { mocks.resumeListening.mockResolvedValue({ id: 1 }); });

describe('Reprendre l’écoute : le conteneur repris est nommé (tune-server-rust#7588)', () => {
  it.each([['album', 'Kind of Blue'], ['playlist', 'Ma playlist'], ['podcast', 'Le Podcast']])('%s : le nom du conteneur figure sur la carte', async (type, nom) => {
    mocks.getContinueListening.mockResolvedValue([{ context_type: type, title: nom, last_track_title: 'Dernier titre', artist_name: 'Miles', cover_path: 'x', resume_key: 'k' }]);
    const rows = await widgetParId('reprendre')!.charger(ctx);
    expect(rows[0].titre).toBe('Dernier titre');
    expect(rows[0].sous).toContain(nom);
  });
  it('sans dernier titre, le nom n’est pas répété', () => {
    expect(sousTitreReprise({ context_type: 'album', title: 'A', artist_name: 'X' })).toBe('X');
    expect(sousTitreReprise({ context_type: 'album', title: 'A', last_track_title: 'A', artist_name: 'X' })).toBe('X');
  });
});
