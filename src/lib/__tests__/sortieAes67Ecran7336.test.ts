// @vitest-environment jsdom
//
// Sortie AES67 — l'ÉCRAN d'état (tune-server-rust#7336, étape E3), monté pour
// de vrai contre une API simulée qui suit le contrat de l'issue :
//
//   GET /api/v1/ext/aes67 → { premium, etape, reference_horloge, horloge_calee,
//                             ptp{…}, flux[…], sorties[…] }
//
// Témoins : réponse calée, REPLI sur l'horloge locale (avec sa raison), sans
// Premium, `sorties` absent (E2), greffon absent (404, section retirée), SDP
// repliable, et pas de relecture quand l'onglet est caché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import { presenceSortieAes67 } from '../stores/sortieAes67';
import { normaliserSortieAes67 } from '../sortieAes67';
import SortieAes67V2 from '../../components/v2/SortieAes67V2.svelte';

function reponse(status: number, corps: unknown): Response {
  const texte = corps === undefined ? '' : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

const SDP = 'v=0\r\no=- 1 2 IN IP4 192.168.1.20\r\ns=Salon\r\nc=IN IP4 239.69.1.10/16\r\nm=audio 5004 RTP/AVP 98\r\na=rtpmap:98 L24/48000/2\r\n';

const PTP_CALE = {
  actif: true, etat_port: 'esclave', calee: true, repli_horloge_locale: false, raison_du_repli: null,
  maitre: '00-1D-C1-FF-FE-12-34-56', domaine: 0, decalage_ns: 1200, delai_moyen_ns: 35000,
  frequence_ppm: 40.1, sauts: 0, generation: 2, derniere_sync_il_y_a_ms: 120, horodatage: 'logiciel',
  identite: 'x', erreur: null,
};

const FLUX = { id: 'salon', nom: 'Salon', adresse: '239.69.1.10', port: 5004, canaux: 2, cadence: 48000,
  interface: null, ttl: 16, dscp: 34, volume_logiciel: false };

const SORTIE = {
  id: 'salon', device_id: 'aes67:salon', annoncee: true, transport: 'lecture', sdp: SDP, version_sdp: 2,
  emission: { paquets: 1000, trames: 48000, retard_max_us: 300, sous_alimentations: 0, resynchronisations: 0, erreurs_d_envoi: 0 },
};

const CALE = {
  premium: true, etape: 'E3', reference_horloge: 'ptp=IEEE1588-2008:00-1D-C1-FF-FE-12-34-56:0',
  horloge_calee: true, ptp: PTP_CALE, flux: [FLUX], sorties: [SORTIE],
};

let hote: { status: number; corps: unknown };
let appels: string[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  appels = [];
  hote = { status: 200, corps: CALE };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    appels.push(String(url));
    return reponse(hote.status, hote.corps);
  }));
  presenceSortieAes67.set('inconnue');
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible?.remove();
  cible = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 0));
  }
}
const q = <T extends Element = HTMLElement>(sel: string) => cible!.querySelector(sel) as T | null;
const texte = (cle: string) => get(t)(cle as any);
async function monter(condition: () => boolean) {
  monte = mount(SortieAes67V2, { target: cible! });
  await jusqua(condition);
}

describe('Sortie AES67 — écran d’état', () => {
  it('réponse calée : calage, port, maître, décalage en µs, flux, format, SAP, transport, émission', async () => {
    await monter(() => !!q('[data-aes67-un-flux]'));
    expect(appels[0]).toContain('/api/v1/ext/aes67');
    expect(q('[data-aes67-calage]')?.textContent).toContain(texte('aes67.ptp.locked'));
    expect(q('[data-aes67-repli]'), 'un repli annoncé alors que le PTP est calé').toBeNull();
    expect(q('[data-aes67-port]')?.textContent).toContain(texte('aes67.port.esclave'));
    expect(q('[data-aes67-horloge]')?.textContent).toContain('00-1D-C1-FF-FE-12-34-56');
    expect(q('[data-aes67-decalage]')?.textContent).toMatch(/1[.,]2\s*µs/);
    expect(q('[data-aes67-reference]')?.textContent).toContain('ptp=IEEE1588-2008');
    const flux = q('[data-aes67-un-flux="salon"]')!;
    expect(flux.textContent).toContain('Salon');
    expect(flux.textContent).toContain('239.69.1.10:5004');
    expect(q('[data-aes67-format]')?.textContent).toMatch(/L24.*48\s*kHz.*2/);
    expect(q('[data-aes67-sap]')?.textContent).toContain(texte('aes67.stream.announced'));
    expect(q('[data-aes67-transport]')?.textContent).toContain(texte('aes67.transport.lecture'));
    expect(q('[data-aes67-emission]')?.textContent).toMatch(/1[\s  .,]?000/);
    expect(q('[data-aes67-emission]')?.textContent).toContain('300 µs');
  });

  it('le SDP est un bloc repliable en monospace, fermé par défaut', async () => {
    await monter(() => !!q('[data-aes67-sdp]'));
    const d = q<HTMLDetailsElement>('[data-aes67-sdp]')!;
    expect(d.open).toBe(false);
    expect(d.querySelector('pre')?.textContent).toContain('a=rtpmap:98 L24/48000/2');
    expect(d.querySelector('summary')?.textContent).toContain(texte('aes67.sdp.title'));
  });

  it('🔴 REPLI sur l’horloge locale : dit en clair, avec sa raison, et PTP « non calé »', async () => {
    hote.corps = {
      ...CALE, reference_horloge: 'local', horloge_calee: false,
      ptp: { ...PTP_CALE, etat_port: 'ecoute', calee: false, repli_horloge_locale: true, raison_du_repli: 'aucun maître vu', maitre: null },
    };
    await monter(() => !!q('[data-aes67-repli]'));
    const repli = q('[data-aes67-repli]')!;
    expect(repli.textContent).toContain(texte('aes67.fallback.title'));
    expect(repli.textContent).toContain('aucun maître vu');
    expect(repli.getAttribute('role')).toBe('alert');
    expect(q('[data-aes67-calage]')?.textContent).toContain(texte('aes67.ptp.notLocked'));
    expect(q('[data-aes67-reference]')?.textContent).toBe('local');
  });

  it('sans Premium : le dit, lien de l’offre, aucun flux', async () => {
    hote.corps = { premium: false, etape: 'E3', sorties: [], flux: [] };
    await monter(() => !!q('[data-aes67-premium]'));
    const p = q('[data-aes67-premium]')!;
    expect(p.textContent).toContain(texte('aes67.premiumRequired'));
    expect(p.querySelector('a')?.getAttribute('href')).toBe('https://mozaiklabs.fr/pricing');
    expect(q('[data-aes67-un-flux]')).toBeNull();
  });

  it('`sorties` absent (étape E2) et `ptp` réduit : l’écran se rend sans casser', async () => {
    hote.corps = { premium: true, etape: 'E2', reference_horloge: 'local', flux: [FLUX], ptp: { actif: false, etat_port: 'desactive' } };
    await monter(() => !!q('[data-aes67-un-flux]'));
    expect(q('[data-aes67-un-flux="salon"]')?.textContent).toContain('239.69.1.10:5004');
    expect(q('[data-aes67-emission]')).toBeNull();
    expect(q('[data-aes67-sdp]')).toBeNull();
    expect(q('[data-aes67-port]')?.textContent).toContain(texte('aes67.port.desactive'));
    expect(cible!.textContent).not.toContain('undefined');
    expect(cible!.textContent).not.toContain('NaN');
  });

  it('greffon absent (404) : la section se retire, sans erreur à l’écran', async () => {
    hote = { status: 404, corps: { error: 'not_found' } };
    await monter(() => get(presenceSortieAes67) === 'absente');
    expect(get(presenceSortieAes67)).toBe('absente');
    expect(q('[data-aes67-un-flux]')).toBeNull();
  });

  it('relit toutes les 2 s, mais PAS quand l’onglet est caché', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const visibilite = vi.spyOn(document, 'visibilityState', 'get');
      visibilite.mockReturnValue('visible');
      monte = mount(SortieAes67V2, { target: cible! });
      await jusqua(() => appels.length >= 1);
      const base = appels.length;
      vi.advanceTimersByTime(2000);
      await jusqua(() => appels.length > base);
      expect(appels.length).toBe(base + 1);
      visibilite.mockReturnValue('hidden');
      vi.advanceTimersByTime(6000);
      await new Promise((r) => setTimeout(r, 0));
      expect(appels.length).toBe(base + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('normaliserSortieAes67 — contrat tolérant', () => {
  it('une réponse vide ou inattendue donne des listes vides, jamais d’exception', () => {
    for (const brut of [undefined, null, 'x', [], {}]) {
      const e = normaliserSortieAes67(brut);
      expect(e.flux).toEqual([]);
      expect(e.sorties).toEqual([]);
      expect(e.ptp).toBeNull();
    }
  });
});
