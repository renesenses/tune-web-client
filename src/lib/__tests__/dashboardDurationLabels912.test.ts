// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DashboardView from '../../components/DashboardView.svelte';
import { locale, type Locale } from '../i18n';
import * as api from '../api';

vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  getDashboard: vi.fn(async () => ({
    totals: { plays: 4, listening_ms: 95000, unique_tracks: 4, unique_artists: 2 },
    completion: { completed: 3, skipped: 1, avg_listened_ms: 23750 },
    top_artists: [], top_tracks: [], top_albums: [], top_radios: [],
    by_genre: [], by_source: [], by_zone: [], trend: [], hourly: [],
  })),
  getGenreTree: vi.fn(async () => ({ tree: {} })),
  getLibraryStats: vi.fn(async () => ({ tracks: 4, albums: 2, artists: 2 })),
  getTopArtists: vi.fn(async () => []), getTopTracks: vi.fn(async () => []),
  getTopMixes: vi.fn(async () => []), getRadioPicks: vi.fn(async () => []),
}));

let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target?.remove();
  locale.set('fr');
  vi.clearAllMocks();
});

describe('#912 — recorded duration labels in the mounted dashboard', () => {
  it.each([
    ['fr', 'Durées enregistrées dans l’historique', '30 s et plus', 'Moins de 30 s'],
    ['en', 'Durations recorded in history', '30 s or more', 'Less than 30 s'],
    ['de', 'Im Verlauf gespeicherte Dauern', '30 s oder mehr', 'Weniger als 30 s'],
    ['es', 'Duraciones registradas en el historial', '30 s o más', 'Menos de 30 s'],
    ['it', 'Durate registrate nella cronologia', '30 s o più', 'Meno di 30 s'],
    ['ja', '履歴に記録された長さ', '30秒以上', '30秒未満'],
    ['ko', '기록에 저장된 길이', '30초 이상', '30초 미만'],
    ['zh', '历史记录中的时长', '30 秒及以上', '少于 30 秒'],
    ['ro', 'Durate înregistrate în istoric', '30 s sau mai mult', 'Mai puțin de 30 s'],
    ['sv', 'Längder registrerade i historiken', '30 s eller mer', 'Mindre än 30 s'],
    ['hu', 'Az előzményekben rögzített időtartamok', 'Legalább 30 mp', 'Kevesebb mint 30 mp'],
  ])('%s names both inclusive/exclusive groups without claiming completion', async (language, title, over, under) => {
    locale.set(language as Locale);
    target = document.createElement('div');
    document.body.appendChild(target);
    component = mount(DashboardView, { target });
    flushSync();
    await vi.waitFor(() => {
      flushSync();
      expect(target.querySelector('.completion-legend')).not.toBeNull();
    });
    const card = target.querySelector('.completion-bar')!.parentElement!;
    expect(card.querySelector('h3')?.textContent).toBe(title);
    expect(card.querySelector('.completion-legend')?.textContent).toContain(over + ' · 3');
    expect(card.querySelector('.completion-legend')?.textContent).toContain(under + ' · 1');
    // The server counts and relative widths are preserved, not reinterpreted.
    expect((card.querySelector('.completion-completed') as HTMLElement).style.width).toBe('75%');
    expect((card.querySelector('.completion-skipped') as HTMLElement).style.width).toBe('25%');
    expect(api.getDashboard).toHaveBeenCalledWith('30d', { topN: 20 });
  });
});
