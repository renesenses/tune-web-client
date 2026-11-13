/**
 * tune-server-rust#8676 — « Remplacer le chemin » d'un dossier de musique
 * (Réglages › Bibliothèque). Fil forum 2799 : base restaurée depuis une autre
 * machine, musique sous un autre chemin.
 *
 * Le geste en deux temps : l'aperçu (rien n'est écrit), puis la confirmation,
 * qui renvoie au serveur le nombre de pistes montré.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import RemplacerCheminDossier from '../../components/partages/RemplacerCheminDossier.svelte';
import { lignesDApercu, messageDeFin, messageDeRefus } from '../remplacerChemin';
import { ONZE_LANGUES, dictionnaire, fr as frBrut } from './onzeDictionnaires';

const fr = frBrut as Record<string, string>;
const trFr = (k: string) => fr[k] ?? k;

const CLES = [
  'Button', 'Hint', 'NewPath', 'Browse', 'Preview', 'Apply', 'Cancel', 'Summary', 'Sampled', 'Missing',
  'Done', 'RefusInvalid', 'RefusNoTracks', 'RefusNoneFound', 'RefusConflicts', 'RefusScan', 'RefusStale', 'Error',
].map((k) => `settings.moveFolder${k}`);

describe('libellés', () => {
  it.each(ONZE_LANGUES)('les libellés existent en %s, variables comprises', (langue) => {
    const d = dictionnaire(langue) as Record<string, string>;
    for (const cle of CLES) {
      expect(d[cle], `${cle} manque en ${langue}`).toBeTruthy();
      const attendues = (fr[cle].match(/\{\w+\}/g) ?? []).sort();
      expect((d[cle].match(/\{\w+\}/g) ?? []).sort(), `${cle} en ${langue}`).toEqual(attendues);
    }
  });
});

describe('messages', () => {
  it('chaque refus du serveur a son message', () => {
    expect(messageDeRefus({ refusal: 'none_found', new_prefix: '/data/m' }, trFr)).toContain('/data/m');
    expect(messageDeRefus({ refusal: 'no_tracks', old_prefix: '/mnt/M' }, trFr)).toContain('/mnt/M');
    expect(messageDeRefus({ refusal: 'conflicts', conflicts: 4 }, trFr)).toContain('4');
    expect(messageDeRefus({ refusal: 'invalid_prefix' }, trFr)).toBe(fr['settings.moveFolderRefusInvalid']);
    expect(messageDeRefus({ error: 'scan_running' }, trFr)).toBe(fr['settings.moveFolderRefusScan']);
    expect(messageDeRefus({ error: 'confirmation_mismatch' }, trFr)).toBe(fr['settings.moveFolderRefusStale']);
    expect(messageDeRefus({ can_apply: true, tracks: 3 }, trFr)).toBeNull();
  });

  it("l'aperçu dit combien de pistes, combien retrouvées, et montre les manquantes", () => {
    const l = lignesDApercu({
      old_prefix: '/mnt/M', new_prefix: '/data/m', tracks: 1200, checked: 1000, found: 998, sampled: true,
      missing_examples: [{ old: '/mnt/M/a.flac', new: '/data/m/a.flac' }],
    }, trFr);
    expect(l.resume).toContain('1200');
    expect(l.resume).toContain('998');
    expect(l.resume).toContain('/mnt/M');
    expect(l.echantillon).toBe(fr['settings.moveFolderSampled']);
    expect(l.manquants).toEqual(['/data/m/a.flac']);
  });

  it('la fin dit comment revenir en arrière', () => {
    const m = messageDeFin({ applied: true, tracks_updated: 3, old_prefix: '/mnt/M', new_prefix: '/data/m' }, trFr);
    expect(m).toContain('/mnt/M');
    expect(m).toContain('/data/m');
    expect(m).toContain('3');
  });
});

// ─── Le composant, contre un serveur simulé ─────────────────────────────────

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const appels: { url: string; corps: any }[] = [];
let reponseApercu: () => Response;

beforeEach(() => {
  appels.length = 0;
  reponseApercu = () => json({
    old_prefix: '/mnt/M', new_prefix: '/data/m', tracks: 3, checked: 3, found: 2, missing: 1,
    sampled: false, missing_examples: [{ old: '/mnt/M/c.flac', new: '/data/m/c.flac' }],
    conflicts: 0, refusal: null, can_apply: true,
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, corps: init?.body ? JSON.parse(String(init.body)) : null });
    if (u.endsWith('/system/music-dirs/move/preview')) return reponseApercu();
    if (u.endsWith('/system/music-dirs/move')) {
      return json({ applied: true, old_prefix: '/mnt/M', new_prefix: '/data/m', tracks_updated: 3, dirs: ['/data/m'] });
    }
    return json({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

function monter(onRemplace = vi.fn()) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(RemplacerCheminDossier, { target: hote, props: { dossier: '/mnt/M', onRemplace } });
  flushSync();
  return { el: hote, onRemplace };
}

function bouton(el: HTMLElement, cle: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => x.textContent?.trim() === fr[cle]);
  expect(b, `bouton ${cle}`).toBeTruthy();
  return b!;
}

describe('Remplacer le chemin, à l’écran', () => {
  it('aperçu puis confirmation avec le nombre montré', { timeout: 30_000 }, async () => {
    const { el, onRemplace } = monter();
    bouton(el, 'settings.moveFolderButton').click();
    flushSync();
    const champ = el.querySelector<HTMLInputElement>('[data-reglage="remplacer-chemin"] input')!;
    expect(champ.value).toBe('/mnt/M');
    champ.value = '/data/m';
    champ.dispatchEvent(new Event('input'));
    flushSync();
    bouton(el, 'settings.moveFolderPreview').click();
    await attendre();
    expect(appels.at(-1)).toEqual({
      url: expect.stringContaining('/system/music-dirs/move/preview'),
      corps: { old_prefix: '/mnt/M', new_prefix: '/data/m' },
    });
    expect(el.textContent).toContain('/data/m/c.flac');
    // Rien n'est appliqué avant la confirmation.
    expect(appels.some((a) => a.url.endsWith('/system/music-dirs/move'))).toBe(false);
    bouton(el, 'settings.moveFolderApply').click();
    await attendre();
    const application = appels.find((a) => a.url.endsWith('/system/music-dirs/move'));
    expect(application?.corps).toEqual({ old_prefix: '/mnt/M', new_prefix: '/data/m', confirm_tracks: 3 });
    expect(onRemplace).toHaveBeenCalledWith(['/data/m']);
    expect(el.textContent).toContain(messageDeFin({ tracks_updated: 3, old_prefix: '/mnt/M', new_prefix: '/data/m' }, trFr));
  });

  it("un aperçu refusé ne propose pas d'appliquer", { timeout: 30_000 }, async () => {
    reponseApercu = () => json({ old_prefix: '/mnt/M', new_prefix: '/x', tracks: 3, checked: 3, found: 0, refusal: 'none_found', can_apply: false });
    const { el } = monter();
    bouton(el, 'settings.moveFolderButton').click();
    flushSync();
    bouton(el, 'settings.moveFolderPreview').click();
    await attendre();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe(messageDeRefus({ refusal: 'none_found', new_prefix: '/x' }, trFr));
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.trim() === fr['settings.moveFolderApply'])).toBe(false);
  });
});
