// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const flux = vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
  return { abonnes: new Set<(e: any) => void>(), sondage: false };
});
vi.mock('../websocket', () => ({ tuneWS: {
  connect() {}, setCurrentZoneId() {},
  get isPolling() { return flux.sondage; },
  onEvent(h: (e: any) => void) { flux.abonnes.add(h); return () => flux.abonnes.delete(h); },
} }));

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { locale } from '../i18n';
import { DELAI_SUIVI_POCHETTES } from '../suiviPochettes';

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let posts: number;
let repondre: () => Promise<Response>;
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});
async function stabiliser() {
  for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
}
function pousser(type: string, data?: unknown) {
  for (const h of [...flux.abonnes]) h({ type, data });
  flushSync();
}
const bouton = () => hote.querySelector<HTMLButtonElement>('[data-recherche-pochettes] button')!;
const statut = () => hote.querySelector('[data-suivi-pochettes]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
async function monter() {
  v2SettingsTarget.set({ tab: 'library', section: 'enrichment' });
  composant = mount(SettingsV2, { target: hote }); flushSync(); await stabiliser();
  expect(bouton(), 'la vraie ligne de recherche de pochettes doit être visible').not.toBeNull();
}
async function lancer() { bouton().click(); flushSync(); await stabiliser(); }
function differerReponse() {
  let terminer!: (r: Response) => void;
  const attente = new Promise<Response>((r) => { terminer = r; });
  repondre = () => attente;
  return () => terminer(json({ status: 'accepted' }, 202));
}

beforeEach(async () => {
  vi.useFakeTimers(); posts = 0; flux.abonnes.clear(); flux.sondage = false;
  locale.set('fr'); preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  hote = document.createElement('div'); document.body.appendChild(hote);
  repondre = async () => json({ status: 'accepted' }, 202);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    if (chemin === '/api/v1/library/artwork/rescan' && init?.method === 'POST') { posts++; return repondre(); }
    const corps = /\/(devices|outputs|stereo-pairs|group-delays|profiles|playlists|shortcuts|groups|directories)$|\/devices\/all$/.test(chemin) ? []
      : chemin.endsWith('/system/diagnostics') ? { zones_doublons: [] }
      : chemin.endsWith('tune-tested.json') ? { version: 1, count: 0, devices: [] } : {};
    return json(corps);
  }));
  await monter();
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); v2SettingsTarget.set(null);
  flux.abonnes.clear(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers();
});

describe('#2491 — la vraie ligne Réglages/Bibliothèque suit la recherche', () => {
  it('le 202 reste une acceptation ; seuls les événements donnent le bilan', async () => {
    await lancer(); expect(posts).toBe(1); expect(bouton().disabled).toBe(true);
    expect(statut()).toContain('Demande acceptée'); expect(statut()).not.toContain('terminée');
    pousser('library.artwork.progress', { current: 4, total: 10, found: 2 });
    expect(statut()).toContain('4/10'); expect(statut()).toContain('Pochettes trouvées : 2');
    expect(hote.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('4');
    pousser('library.artwork.completed', { current: 10, total: 10, found: 3 });
    expect(statut()).toContain('Recherche terminée'); expect(statut()).toContain('Pochettes trouvées : 3');
    expect(bouton().disabled).toBe(false);
  });

  it.each([0, 5])('une fin sans pochette le dit explicitement (%s albums)', async (total) => {
    await lancer(); pousser('library.artwork.completed', { current: total, total, found: 0 });
    expect(statut()).toContain('aucune pochette trouvée'); expect(statut()).toContain(`Albums examinés : ${total}`);
    expect(bouton().disabled).toBe(false);
  });

  it('la fin partielle du garde serveur ne devient pas un succès intégral', async () => {
    await lancer(); pousser('library.artwork.completed', { current: 3, total: 10, found: 2 });
    expect(statut()).toContain('Bilan partiel'); expect(statut()).toContain('3/10');
    expect(statut()).not.toContain('Recherche terminée'); expect(bouton().disabled).toBe(false);
  });

  it('sans événement, le résultat devient inconnu et non terminé', async () => {
    await lancer(); await vi.advanceTimersByTimeAsync(DELAI_SUIVI_POCHETTES + 1); flushSync();
    expect(statut()).toContain('Aucun suivi reçu'); expect(statut()).toContain('peut continuer côté serveur');
    expect(statut()).not.toContain('Recherche terminée'); expect(bouton().disabled).toBe(false); expect(posts).toBe(1);
  });

  it('chaque progression crédible repousse le délai de perte du suivi', async () => {
    await lancer(); await vi.advanceTimersByTimeAsync(DELAI_SUIVI_POCHETTES - 1);
    pousser('library.artwork.progress', { current: 2, total: 10, found: 1 });
    await vi.advanceTimersByTimeAsync(DELAI_SUIVI_POCHETTES - 1); flushSync();
    expect(statut()).toContain('2/10'); expect(bouton().disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(2); flushSync(); expect(statut()).toContain('Aucun suivi reçu');
  });

  it.each(['_disconnected', '_polling_started'])('%s indique une rupture sans arrêter le serveur', async (type) => {
    await lancer(); pousser(type);
    expect(statut()).toContain('Suivi interrompu'); expect(statut()).toContain('résultat inconnu');
    expect(bouton().disabled).toBe(false); pousser('_connected');
    expect(statut()).toContain('Suivi interrompu');
    pousser('library.artwork.progress', { current: 1, total: 2, found: 0 });
    expect(statut()).toContain('1/2'); expect(bouton().disabled).toBe(true);
  });

  it('le repli HTTP sans événements ne prétend pas suivre la tâche', async () => {
    flux.sondage = true; await lancer();
    expect(statut()).toContain('Aucun suivi reçu'); expect(bouton().disabled).toBe(false);
  });

  it('un refus HTTP n’annonce pas une recherche lancée', async () => {
    repondre = async () => json({ error: 'refus_synthetique' }, 500); await lancer();
    expect(statut()).toContain('Lancement impossible'); expect(statut()).not.toContain('Demande acceptée');
    expect(bouton().disabled).toBe(false);
  });

  it('une fin rapide reçue avant le 202 reste affichée après sa réponse', async () => {
    const terminer = differerReponse(); await lancer(); expect(statut()).toContain('Envoi de la demande');
    pousser('library.artwork.completed', { current: 0, total: 0, found: 0 });
    terminer(); await stabiliser();
    expect(statut()).toContain('aucune pochette trouvée'); expect(bouton().disabled).toBe(false);
  });

  it('une autre passe ou des compteurs incohérents n’inventent pas un résultat', async () => {
    await lancer();
    pousser('library.enrichment.completed', { current: 10, total: 10, found: 10 });
    for (const data of [{ current: '1', total: 2, found: 0 }, { current: 4, total: 2, found: 0 }, { current: 1, total: 2, found: 3 }]) {
      pousser('library.artwork.completed', data);
    }
    expect(statut()).toContain('Demande acceptée'); expect(bouton().disabled).toBe(true);
  });

  it('un double clic ne crée pas une seconde demande', async () => {
    differerReponse(); bouton().click(); flushSync();
    bouton().dispatchEvent(new MouseEvent('click', { bubbles: true })); await stabiliser(); expect(posts).toBe(1);
  });

  it('un 202 tardif après perte du suivi ne réactive pas un faux état occupé', async () => {
    const terminer = differerReponse(); await lancer();
    await vi.advanceTimersByTimeAsync(DELAI_SUIVI_POCHETTES + 1); flushSync();
    terminer(); await stabiliser(); expect(statut()).toContain('Aucun suivi reçu'); expect(bouton().disabled).toBe(false);
  });

  it('démonter nettoie les abonnements ; une réponse tardive ne touche pas le nouvel écran', async () => {
    const terminer = differerReponse(); await lancer(); const anciens = [...flux.abonnes];
    await unmount(composant!); composant = undefined; expect(flux.abonnes.size).toBe(0);
    await monter(); terminer();
    for (const h of anciens) h({ type: 'library.artwork.completed', data: { current: 1, total: 1, found: 1 } });
    await stabiliser(); expect(statut()).toBe(''); expect(bouton().disabled).toBe(false);
  });

  it('un corps de réponse non reconnu ne devient pas une acceptation inventée', async () => {
    repondre = async () => json({ status: 'inconnu' }); await lancer(); expect(statut()).toContain('Aucun suivi reçu');
  });
});
