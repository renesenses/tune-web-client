// @vitest-environment jsdom
//
// tune-server-rust#4805 (13/10/2026) — Réglages ▸ Enrichissement : la passe de
// nuit de l'identification, MONTÉE avec un `fetch` simulé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import IdentificationNuitV2 from '../../components/v2/IdentificationNuitV2.svelte';
import { lireReglageNuit } from '../identificationNuit';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

type Requete = { methode: string; chemin: string; corps: string | null };
let requetes: Requete[] = [];
let reglage: Record<string, unknown> | null;
let ecritureEchoue = false;

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  ecritureEchoue = false;
  reglage = {
    active: false,
    fenetre: { debut: 2, fin: 6 },
    delai_entre_albums_s: 10,
    refus_en_attente: 718,
    derniere_nuit: null,
  };
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const chemin = String(typeof url === 'string' ? url : url?.url ?? '').replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const methode = String(init?.method ?? 'GET').toUpperCase();
    requetes.push({ methode, chemin, corps: init?.body ?? null });
    if (chemin.endsWith('/library/identify-all/nuit')) {
      if (reglage === null) return json({ error: 'not found' }, 404);
      if (methode === 'POST') {
        if (ecritureEchoue) return json({ error: 'forbidden' }, 403);
        reglage = { ...reglage, active: JSON.parse(init.body).active };
      }
      return json(reglage);
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

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(IdentificationNuitV2, { target: hote });
  flushSync();
  await attendre();
  return hote;
}

describe('Réglages ▸ passe de nuit de l\'identification (#4805)', () => {
  it('éteinte par défaut : l\'interrupteur est décoché, la file d\'attente est dite', async () => {
    const h = await monter();
    const ligne = h.querySelector('[data-identification-nuit]');
    expect(ligne?.textContent).toContain(fr['v2.nuit.title']);
    expect(ligne?.textContent).toContain('718 album(s) en attente');
    expect(ligne?.textContent).toContain('Entre 2 h et 6 h');
    expect((h.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
  });

  it('l\'interrupteur allume la passe par POST { active: true }', async () => {
    const h = await monter();
    (h.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await attendre();
    const post = requetes.find((r) => r.methode === 'POST');
    expect(post?.chemin.endsWith('/library/identify-all/nuit')).toBe(true);
    expect(JSON.parse(post!.corps!)).toEqual({ active: true });
    expect((h.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
  });

  it('un refus d\'écriture est dit, et l\'état relu reste éteint', async () => {
    ecritureEchoue = true;
    const h = await monter();
    (h.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await attendre();
    expect(h.querySelector('[data-identification-nuit-erreur]')?.textContent).toBe(fr['v2.nuit.saveFailed']);
    expect((h.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
  });

  it('face à un serveur sans la route, la ligne est absente', async () => {
    reglage = null;
    const h = await monter();
    expect(h.querySelector('[data-identification-nuit]')).toBeNull();
  });

  it('le bilan de la dernière nuit est lu', () => {
    const r = lireReglageNuit({
      active: true,
      fenetre: { debut: 2, fin: 6 },
      refus_en_attente: 3,
      derniere_nuit: { date: '2026-10-14', total: 9, traites: 9, identifies: 4, encore_refuses: 2, raison: 'terminee' },
    });
    expect(r?.derniereNuit?.identifies).toBe(4);
    expect(lireReglageNuit({})).toBeNull();
  });
});
