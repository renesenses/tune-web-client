// @vitest-environment jsdom
//
// web#2760 — Alex (rc11, interface en anglais) : la ligne de tâche de fond de
// la barre latérale affichait « Fetching credits… — Crédits 16/150 ». Le nom
// de la tâche passe par une clé (#2610) ; la sous-phase (`progress.detail`)
// était recopiée telle que le serveur l'écrit, en français
// (`update_progress(…, "Crédits")`, tune-server `routes/library/credits.rs`).
//
// Le témoin monte la VRAIE barre latérale avec la tâche telle que le serveur
// la publie, en anglais, et lit la ligne affichée.
//
// Contre-épreuve : sur `origin/main`, la ligne contient « Crédits ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Sidebar from '../../components/v2/Sidebar.svelte';
import { tachesDeFond } from '../stores/tachesDeFond';
import { locale } from '../i18n';
import { libellePhase } from '../tachesDeFond';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const TACHE = {
  id: 'credits_enrich_auto', label: 'Crédits (passe automatique)', kind: 'credits',
  progress: { processed: 16, total: 150, detail: 'Crédits' },
};

async function monterBarre() {
  monte = mount(Sidebar as never, { target: hote! }) as Record<string, unknown>;
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as never);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as never);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    // `GET /system/background-tasks` relu au montage (`Sidebar`, l.394) :
    // la tâche telle que le serveur la publie.
    json: async () => ({ tasks: [TACHE] }), text: async () => JSON.stringify({ tasks: [TACHE] }),
  } as unknown as Response)));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  tachesDeFond.set([]);
  locale.set('fr');
  vi.unstubAllGlobals();
});

describe('web#2760 — la ligne de tâche de fond parle une seule langue', () => {
  it('🔴 anglais : « Fetching credits… — Credits 16/150 », sans « Crédits »', async () => {
    locale.set('en');
    tachesDeFond.set([TACHE] as never);
    await monterBarre();
    const ligne = hote!.querySelector('.taches');
    expect(ligne, 'ligne de tâche absente — témoin sans objet').not.toBeNull();
    const texte = ligne!.textContent ?? '';
    expect(texte).toContain('Fetching credits');
    expect(texte, 'la sous-phase reste en français (#2760)').not.toContain('Crédits');
    expect(texte).toContain('Credits 16/150');
  });

  it('français : inchangé', async () => {
    locale.set('fr');
    tachesDeFond.set([TACHE] as never);
    await monterBarre();
    expect(hote!.querySelector('.taches')?.textContent ?? '').toContain('Crédits 16/150');
  });

  it('un nom propre inconnu reste tel quel ; sans traducteur, le texte du serveur', () => {
    const tr = (c: string) => `«${c}»`;
    expect(libellePhase('MusicBrainz', tr)).toBe('MusicBrainz');
    expect(libellePhase('Métadonnées', tr)).toBe('«app.task.phase.metadata»');
    expect(libellePhase('Crédits')).toBe('Crédits');
    expect(libellePhase('  ', tr)).toBe('');
  });
});
