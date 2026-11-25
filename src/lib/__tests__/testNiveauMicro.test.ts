// @vitest-environment jsdom
//
// rc14 (Didier) — le test de niveau du micro avant la mesure, contre le
// greffon serveur simulé d'après ses routes (tune-server-rust#9529,
// `plugins/tune-calibration/src/niveau.rs`) :
//
//   POST   /niveaux       202 { id, mode, zone_id, alerte_asio }
//                        409 test_niveau_en_cours | zone_sans_sortie_active
//   GET    /niveaux/{id}  { etat, vumetre, bruit, verdict, code, alerte_asio, … }
//   DELETE /niveaux/{id}  annulation
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { t } from '../i18n';
import { dialogs } from '../stores/dialogs';
import { currentZoneId, zones } from '../stores/zones';
import { licenseState } from '../stores/license';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import {
  SUIVI, SUIVI_NIVEAU, zoneCorrectionPiece, dbfs, fractionVumetre, texteVerdict, valeursVerdict,
  LIBELLES_MOTIFS_NIVEAU, type VerdictNiveau, type MotifNiveau,
} from '../correctionPiece';
import TestNiveauMicro from '../../components/v2/TestNiveauMicro.svelte';
import CorrectionPieceV2 from '../../components/v2/CorrectionPieceV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

const ZONE = 3120;
const EXT = '/api/v1/ext/calibration';

function reponse(status: number, corps: unknown): Response {
  const texte = corps === undefined ? '' : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

const PLAGE = { crete_max_dbfs: -3, rsb_min_db: 10, rsb_conseille_db: 20 };
function verdict(jugement: VerdictNiveau['jugement'], motif: MotifNiveau, crete = -17.6, rsb = 49.8): VerdictNiveau {
  return {
    jugement, motif, signal: { crete_dbfs: crete, rms_dbfs: crete - 12.4 }, bruit: { crete_dbfs: -72, rms_dbfs: -80 },
    rsb_db: rsb, plage: PLAGE, message: 'phrase du serveur',
  };
}
function avancement(etat: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'n1-1', mode: 'signal', zone_id: ZONE, entree: 'umik', voie_micro: 0, etat, depuis_s: 1, duree_prevue_s: 7.4,
    vumetre: { crete_dbfs: -12.34, rms_dbfs: -24.5, crete_max_dbfs: -9.1 }, bruit: null, verdict: null,
    alerte_asio: false, avertissements: [], ...extra,
  };
}

interface Appel { url: string; method: string; corps: any }
let appels: Appel[];
let lancement: { status: number; corps: unknown };
let etats: unknown[];

function simulerHote() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url).split('?')[0];
    const method = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url: u, method, corps: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (u.endsWith('/api/v1/plugins')) {
      return reponse(200, [
        { name: 'calibration', installed: true, enabled: true, loaded: true, premium: true },
        { name: 'equalizer', installed: true, enabled: true, loaded: true, premium: true },
      ]);
    }
    if (u.endsWith(`${EXT}/microphones`)) {
      return reponse(200, { pile: 'wasapi', frequence_requise: 48000, etalonnages: [], entrees: [
        { nom: 'Microphone (US-366)', id: 'umik', canaux: 2, frequence_courante: 48000, virtuelle: false, mesurable: true },
      ] });
    }
    if (u.endsWith(`${EXT}/niveaux`) && method === 'POST') return reponse(lancement.status, lancement.corps);
    if (u.endsWith(`${EXT}/niveaux/n1-1`) && method === 'DELETE') {
      etats = [avancement('annulee')];
      return reponse(200, { id: 'n1-1', annulation_demandee: true });
    }
    if (u.endsWith(`${EXT}/niveaux/n1-1`)) return reponse(200, etats.length > 1 ? etats.shift() : etats[0]);
    if (u.endsWith(`${EXT}/mesures`)) return reponse(200, { mesures: [] });
    if (u.endsWith(`${EXT}/sessions/__sonde__`) || /\/sessions\//.test(u)) return reponse(404, { error: 'autre' });
    return reponse(200, /\/(zones|devices|presets|profiles)(\?|$)/.test(u) ? [] : {});
  }));
}

let cible: HTMLDivElement;
let monte: Record<string, unknown> | null = null;
let occupe: boolean[];

beforeEach(() => {
  appels = [];
  occupe = [];
  lancement = { status: 202, corps: { id: 'n1-1', mode: 'signal', zone_id: ZONE, alerte_asio: false } };
  etats = [avancement('bruit_de_fond'), avancement('signal'), avancement('terminee', { verdict: verdict('bon', 'bon') })];
  SUIVI_NIVEAU.intervalleMs = 2;
  SUIVI.intervalleMs = 5;
  simulerHote();
  vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  SUIVI_NIVEAU.intervalleMs = 150;
  SUIVI.intervalleMs = 1000;
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  zones.set([]);
  zoneCorrectionPiece.set(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition() || Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 2));
  }
}
const q = (sel: string) => cible.querySelector(sel) as HTMLElement | null;
const texte = (cle: string) => get(t)(cle as any);
const tr = (k: string) => texte(k);

function monterSeul(props: Partial<{ zoneId: number | null; entree: string | null; occupe: boolean }> = {}) {
  monte = mount(TestNiveauMicro, {
    target: cible,
    props: {
      zoneId: ZONE, zoneNom: 'Salon', entree: 'umik', voie: 1, verrouille: false, occupe: false,
      erreurDe: (cle: string, e: any) => ({ cle, cause: e?.corps?.message ?? null, code: e?.corps?.error ?? null }),
      onOccupe: (o: boolean) => occupe.push(o),
      ...props,
    },
  });
  flushSync();
}

describe('rc14 — tester le niveau', () => {
  it('lance le signal sur la zone choisie, suit le vumètre, puis annonce le verdict', async () => {
    monterSeul();
    (q('[data-room="tester-niveau"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="verdict"]'));
    expect(dialogs.confirm).toHaveBeenCalledOnce();
    const [post] = appels.filter((a) => a.method === 'POST' && a.url.endsWith(`${EXT}/niveaux`));
    expect(post.corps).toEqual({ mode: 'signal', entree: 'umik', voie_micro: 1, zone_id: ZONE });
    // Vumètre : valeurs lisibles et jauge accessible.
    expect(q('[data-room="vumetre-crete"]')!.textContent).toBe('−12.3');
    expect(q('[data-room="vumetre-rms"]')!.textContent).toBe('−24.5');
    const jauge = q('[data-room="vumetre"]')!;
    expect(jauge.getAttribute('role')).toBe('meter');
    expect(jauge.getAttribute('aria-valuenow')).toBe('-12');
    expect(jauge.getAttribute('aria-valuetext')).toContain('−12.3');
    // Verdict annoncé, dans une zone `role="status"`.
    const annonce = q('[data-room="verdict-annonce"]')!;
    expect(annonce.getAttribute('role')).toBe('status');
    expect(annonce.getAttribute('aria-live')).toBe('polite');
    const v = q('[data-room="verdict"]')!;
    expect(v.dataset.jugement).toBe('bon');
    expect(v.textContent).toContain(texteVerdict(verdict('bon', 'bon'), tr));
    expect(q('[data-room="verdict-valeurs"]')!.textContent).toContain('−80.0');
    expect(q('[data-room="etat-niveau"]')!.dataset.etat).toBe('terminee');
    // Occupé pendant le test, libre ensuite.
    expect(occupe).toContain(true);
    expect(occupe.at(-1)).toBe(false);
  });

  it.each([
    ['trop_fort', 'saturation', -0.4],
    ['trop_fort', 'trop_fort', -2.1],
    ['trop_faible', 'rsb_insuffisant', -40],
    ['trop_faible', 'signal_absent', -110],
    ['trop_faible', 'entree_muette', -120],
  ] as const)('verdict %s (%s) : la phrase traduite et ses valeurs', async (jugement, motif, crete) => {
    etats = [avancement('terminee', { verdict: verdict(jugement, motif, crete, 6) })];
    monterSeul();
    (q('[data-room="tester-niveau"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="verdict"]'));
    const v = q('[data-room="verdict"]')!;
    expect(v.dataset.jugement).toBe(jugement);
    expect(v.dataset.motif).toBe(motif);
    const phrase = texteVerdict(verdict(jugement, motif, crete, 6), tr);
    expect(phrase).not.toMatch(/\{\w+\}/);
    expect(phrase).not.toBe(LIBELLES_MOTIFS_NIVEAU[motif]);
    expect(v.textContent).toContain(phrase);
  });

  it('écoute seule : rien à confirmer, pas de zone exigée, et Arrêter annule', async () => {
    etats = [avancement('ecoute', { mode: 'ecoute' })];
    monterSeul();
    (q('[data-room="ecouter-micro"]') as HTMLButtonElement).click();
    await jusqua(() => q('[data-room="etat-niveau"]')?.dataset.etat === 'ecoute' && !!q('[data-room="vumetre"]'));
    expect(dialogs.confirm).not.toHaveBeenCalled();
    expect(appels.find((a) => a.method === 'POST')!.corps).toMatchObject({ mode: 'ecoute', entree: 'umik', voie_micro: 1 });
    expect((q('[data-room="tester-niveau"]') as HTMLButtonElement).disabled).toBe(true);
    (q('[data-room="arreter-niveau"]') as HTMLButtonElement).click();
    await jusqua(() => q('[data-room="etat-niveau"]')?.dataset.etat === 'annulee');
    expect(appels.filter((a) => a.method === 'DELETE' && a.url.endsWith(`${EXT}/niveaux/n1-1`))).toHaveLength(1);
    expect(q('[data-room="arreter-niveau"]')).toBeNull();
  });

  it('fil de Didier : la zone en ASIO est signalée', async () => {
    lancement = { status: 202, corps: { id: 'n1-1', mode: 'ecoute', zone_id: ZONE, alerte_asio: true } };
    etats = [avancement('ecoute', { alerte_asio: true })];
    monterSeul();
    (q('[data-room="ecouter-micro"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="alerte-asio"]'));
    expect(q('[data-room="alerte-asio"]')!.textContent).toBe(texte('v2.room.lvlAsio'));
  });

  it('micro figé : le code du serveur est traduit', async () => {
    etats = [avancement('erreur', { code: 'micro_fige', peripherique: 'wasapi:{mic}', message: 'x' })];
    monterSeul();
    (q('[data-room="ecouter-micro"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="erreur-niveau"]'));
    expect(q('[data-room="erreur-niveau"]')!.textContent).toContain(texte('v2.room.errMicFrozen').replace('{micro}', 'wasapi:{mic}'));
  });

  it('zone sans sortie active (409) : la cause du serveur', async () => {
    lancement = { status: 409, corps: { error: 'zone_sans_sortie_active', message: 'Cette zone n’a pas de sortie active', params: { device: 'SmartDX1' } } };
    monterSeul();
    (q('[data-room="tester-niveau"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="erreur-niveau"]'));
    expect(q('[data-room="erreur-niveau"]')!.dataset.roomErreur).toBe('zone_sans_sortie_active');
    expect(q('[data-room="erreur-niveau"]')!.textContent).toContain('Cette zone n’a pas de sortie active');
    expect(q('[data-room="vumetre"]')).toBeNull();
  });

  it('sans zone, seul « Écouter le micro » reste possible ; une mesure en cours bloque les deux', () => {
    monterSeul({ zoneId: null });
    expect((q('[data-room="tester-niveau"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q('[data-room="ecouter-micro"]') as HTMLButtonElement).disabled).toBe(false);
    unmount(monte!);
    monterSeul({ occupe: true });
    expect((q('[data-room="tester-niveau"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q('[data-room="ecouter-micro"]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('rc14 — dans l’écran Correction de pièce', () => {
  it('le bloc est sous le choix du micro ; pendant le test, ni choix ni mesure', async () => {
    etats = [avancement('ecoute', { mode: 'ecoute' })];
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'premium' }));
    zones.set([{ id: ZONE, name: 'Salon', state: 'stopped' } as any]);
    currentZoneId.set(ZONE);
    zoneCorrectionPiece.set({ id: ZONE, name: 'Salon' });
    monte = mount(CorrectionPieceV2, { target: cible });
    await jusqua(() => !(q('fieldset[data-room]') as HTMLFieldSetElement | null)?.disabled);
    (q('[data-onglet="micro"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="ecouter-micro"]') && !!q('[data-room="mesurer"]'));
    expect((q('[data-room="mesurer"]') as HTMLButtonElement).disabled).toBe(false);
    (q('[data-room="ecouter-micro"]') as HTMLButtonElement).click();
    await jusqua(() => q('[data-room="etat-niveau"]')?.dataset.etat === 'ecoute');
    expect((q('[data-room="mesurer"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q('select[data-room="entree"]') as HTMLSelectElement).disabled).toBe(true);
    expect(appels.find((a) => a.method === 'POST' && a.url.endsWith(`${EXT}/niveaux`))!.corps)
      .toMatchObject({ mode: 'ecoute', entree: 'umik', voie_micro: 0, zone_id: ZONE });
  });
});

describe('rc14 — outils et textes', () => {
  it('dBFS et jauge', () => {
    expect(dbfs(-12.34)).toBe('−12.3');
    expect(dbfs(null)).toBe('–');
    expect(fractionVumetre(0)).toBe(1);
    expect(fractionVumetre(-60)).toBe(0);
    expect(fractionVumetre(-120)).toBe(0);
    expect(fractionVumetre(-30)).toBeCloseTo(0.5);
    expect(valeursVerdict(verdict('bon', 'bon'), tr)).not.toMatch(/\{\w+\}/);
  });

  const CLES = ['lvlTitle', 'lvlIntro', 'lvlTest', 'lvlListen', 'lvlStop', 'lvlConfirm', 'lvlMeterText', 'lvlPeak', 'lvlRms',
    'lvlStPreparing', 'lvlStNoise', 'lvlStSignal', 'lvlStListen', 'lvlStDone', 'lvlStCancelled', 'lvlStError',
    'lvlGood', 'lvlTooQuiet', 'lvlNoSignal', 'lvlTooLoud', 'lvlSaturation', 'lvlInputMuted', 'lvlAsio', 'lvlValues', 'errLevelTest'];
  it.each(ONZE_LANGUES)('%s : chaque texte existe, avec ses marques', (code) => {
    const d = dictionnaire(code);
    const fr = dictionnaire('fr');
    for (const c of CLES) {
      const k = `v2.room.${c}`;
      expect(d[k], `${code} : ${k}`).toBeTruthy();
      const marques = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(marques(d[k]), `${code} : ${k}`).toEqual(marques(fr[k]));
    }
    expect(d['v2.room.lvlAsio']).toContain('ASIO');
    expect(d['v2.room.lvlAsio']).toContain('WASAPI');
  });
});
