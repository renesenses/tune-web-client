// @vitest-environment jsdom
//
// web#2706 — l'écran « Correction de pièce », monté pour de vrai contre le
// greffon serveur `calibration` simulé d'après ses routes
// (tune-server-rust, `plugins/tune-calibration/src/routes.rs`, monté sous
// `/api/v1/ext/calibration`) :
//
//   POST /simulations                         201 Simulation + id
//   POST /simulations/{id}/correction         200 Proposition (+ id, zone_id, estimation)
//   POST /simulations/{id}/correction/profil  201 { id, zone_id, profil, proposition, appliquer }
//   GET  /microphones                         200 { pile, frequence_requise, entrees, etalonnages }
//                                             503 capture_indisponible
//   POST /zones/{zone}/mesures                202 { id, zone_id }
//   GET  /mesures, /mesures/{id}              avancement (etat aplati)
//   DELETE /mesures/{id}                      annulation
//   GET  /mesures/{id}/resultat               Resultat
//   tout le greffon : 402 premium_required sans licence
//
// et `POST /api/v1/room-correction/profiles/{zone}/apply` (#7642), le geste
// qui écrit l'égaliseur de la zone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { currentZoneId, zones } from '../stores/zones';
import { licenseState } from '../stores/license';
import { dialogs } from '../stores/dialogs';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import {
  SUIVI, SURFACES, zoneCorrectionPiece, entreeSimulation, placementType, presenceCalibration, coteHorsBornes,
  PIECE_DEFAUT, SURFACES_DEFAUT,
} from '../correctionPiece';
import CorrectionPieceV2 from '../../components/v2/CorrectionPieceV2.svelte';

vi.setConfig({ testTimeout: 20_000 });

const ZONE = 2706;
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

const FREQS = Array.from({ length: 40 }, (_, i) => 20 * Math.pow(2, i / 12));
/** `modes::Simulation` sérialisée, plus l'`id` que la route ajoute. */
const SIMULATION = {
  id: 'sim-1',
  entree: {},
  estimation: true,
  volume_m3: 50,
  rt60_sabine_s: 0.48,
  f_schroeder_hz: 196,
  modes: [
    { frequence_hz: 34.3, type: 'axial', indices: [1, 0, 0], q: 9.1, t60_s: 0.92, couplage: -0.81 },
    { frequence_hz: 42.875, type: 'axial', indices: [0, 1, 0], q: 8.2, t60_s: 0.88, couplage: 0.05 },
    { frequence_hz: 54.9, type: 'tangentiel', indices: [1, 1, 0], q: 11.3, t60_s: 0.71, couplage: 0.62 },
  ],
  reponse: { freqs_hz: FREQS, db: FREQS.map((f) => (Math.abs(f - 42) < 6 ? 8 : 0)) },
  avertissements: ['estimation sans micro : pièce rectangulaire, murs idéalisés et enceintes ponctuelles ; à confirmer par une mesure au micro'],
};
/** `correction::Proposition`. */
function proposition(id: string, bandes = [{ freq: 42.9, gain: -4, q: 4.3, type: 'peak' }]) {
  return {
    id, zone_id: ZONE, estimation: true,
    bandes,
    egaliseur: { enabled: true, bands: bandes, headroom_mode: 'auto' },
    zone_hz: [20, 300], bandes_max: 3, coupe_max_db: 4, coupe_cumulee_db: -4, gain_max_db: 0,
    decalage_cible_db: 0, depassement_avant_db: 8, depassement_apres_db: 4, pic_avant_db: 8, pic_apres_db: 4,
    courbes: {
      freqs_hz: FREQS,
      mesure_db: FREQS.map((f) => (Math.abs(f - 42) < 6 ? 8 : 0)),
      cible_db: FREQS.map(() => 0),
      corrigee_db: FREQS.map((f) => (Math.abs(f - 42) < 6 ? 4 : 0)),
    },
    export_filtres: 'Filter Settings file',
    avertissements: [],
  };
}

type Appel = { url: string; method: string; corps: any };
interface Hote {
  plugins: unknown[];
  premium402: boolean;
  simulation: { status: number; corps: unknown };
  microphones: { status: number; corps: unknown };
  etats: string[];
  mesures: unknown[];
}
let hote: Hote;
let appels: Appel[];
let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const FICHE_ACTIVE = { name: 'calibration', installed: true, enabled: true, loaded: true, premium: true };
const EQ_ACTIF = { name: 'equalizer', installed: true, enabled: true, loaded: true, premium: true };

function simulerHote() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url).split('?')[0];
    const method = (init?.method ?? 'GET').toUpperCase();
    const corps = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, corps });
    if (u.includes(EXT) && hote.premium402) {
      return reponse(402, { error: 'premium_required', code: 'room_correction', feature: 'Room Correction', message: 'Room Correction requires Tune Premium' });
    }
    if (u.endsWith('/api/v1/plugins/equalizer/install') && method === 'POST') return reponse(200, { success: true, message: 'ok', restart_required: true });
    if (u.endsWith('/api/v1/plugins')) return reponse(200, hote.plugins);
    if (u.endsWith(`${EXT}/simulations`) && method === 'POST') return reponse(hote.simulation.status, hote.simulation.corps);
    const sc = /\/(simulations|mesures)\/([^/]+)\/correction$/.exec(u);
    if (sc && method === 'POST') return reponse(200, proposition(decodeURIComponent(sc[2])));
    const sp = /\/(simulations|mesures)\/([^/]+)\/correction\/profil$/.exec(u);
    if (sp && method === 'POST') {
      return reponse(201, {
        id: sp[2], zone_id: ZONE, profil: { name: `Estimation ${sp[2]}`, zone_id: String(ZONE), filters: [] },
        proposition: proposition(sp[2]), estimation: sp[1] === 'simulations',
        appliquer: `/api/v1/room-correction/profiles/${ZONE}/apply`,
      });
    }
    if (u.endsWith(`/api/v1/room-correction/profiles/${ZONE}/apply`) && method === 'POST') {
      return reponse(200, { applied: true, zone_id: String(ZONE), profile_name: 'Estimation sim-1', filter_count: 1, applied_live: true, portee: 'immediate' });
    }
    if (u.endsWith(`${EXT}/microphones`)) return reponse(hote.microphones.status, hote.microphones.corps);
    if (u.endsWith(`${EXT}/zones/${ZONE}/mesures`) && method === 'POST') return reponse(202, { id: 'm-1', zone_id: ZONE });
    if (u.endsWith(`${EXT}/mesures`)) return reponse(200, { mesures: hote.mesures });
    if (u.endsWith(`${EXT}/mesures/m-1`) && method === 'DELETE') {
      return reponse(200, { id: 'm-1', annulation_demandee: true, etat: { etat: 'annulee' } });
    }
    if (u.endsWith(`${EXT}/mesures/m-1`)) {
      const etat = hote.etats.length > 1 ? hote.etats.shift()! : hote.etats[0];
      return reponse(200, { id: 'm-1', zone_id: ZONE, entree: 'umik', etat, salves: [], depuis_s: 3, progression: etat === 'terminee' ? 1 : 0.4, avertissements: [] });
    }
    if (u.endsWith(`${EXT}/mesures/m-1/resultat`)) {
      return reponse(200, {
        id: 'm-1', zone_id: ZONE, entree: 'umik', frequence: 48000, niveau_joue_dbfs: -20, salves: [],
        ri: { retard_ms: 4, crete_dbfs: -10, rsb_db: 60, trames: 1, crete_a_la_trame: 1 },
        reponse: { lissage: '1/12', freqs_hz: FREQS, db: FREQS.map(() => 0) },
        rt60: [{ centre_hz: 125, edt_s: 0.5, t20_s: 0.45, t30_s: 0.42, dynamique_db: 40 }],
        etalonnage: null, traitements_zone: { egaliseur: false, correction_ir: false, pure: false, volume_fixe: false },
        avertissements: [], duree_analyse_ms: 300,
      });
    }
    return reponse(200, /\/(zones|devices|presets|profiles)(\?|$)/.test(u) ? [] : {});
  }));
}

beforeEach(() => {
  appels = [];
  hote = {
    plugins: [FICHE_ACTIVE, EQ_ACTIF],
    premium402: false,
    simulation: { status: 201, corps: SIMULATION },
    microphones: {
      status: 200,
      corps: {
        pile: 'alsa', frequence_requise: 48000, etalonnages: ['UMIK-1 7012345'],
        entrees: [
          { nom: 'UMIK-1', id: 'umik', canaux: 1, frequence_courante: 48000, frequences: [48000], bits_servis: 24, virtuelle: false, mesurable: true },
          { nom: 'BlackHole', id: 'bh', canaux: 2, frequence_courante: 48000, frequences: [48000], bits_servis: 32, virtuelle: true, mesurable: true },
        ],
      },
    },
    etats: ['balayage', 'analyse', 'terminee'],
    mesures: [],
  };
  SUIVI.intervalleMs = 5;
  simulerHote();
  vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
  licenseState.update((s) => ({ ...s, loaded: true, tier: 'premium' }));
  zones.set([{ id: ZONE, name: 'Salon', state: 'stopped' } as any]);
  currentZoneId.set(ZONE);
  zoneCorrectionPiece.set({ id: ZONE, name: 'Salon' });
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible?.remove();
  cible = null;
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  zones.set([]);
  zoneCorrectionPiece.set(null);
  SUIVI.intervalleMs = 1000;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await new Promise((r) => setTimeout(r, 2));
  }
}
const q = (sel: string) => cible!.querySelector(sel) as HTMLElement | null;
const texte = (cle: string) => get(t)(cle as any);
const appelsA = (fin: string, method = 'POST') => appels.filter((a) => a.method === method && a.url.endsWith(fin));
async function monter() {
  monte = mount(CorrectionPieceV2, { target: cible! });
  await jusqua(() => appels.some((a) => a.url.endsWith('/api/v1/plugins')));
  await jusqua(() => !(q('fieldset[data-room]') as HTMLFieldSetElement | null)?.disabled);
}
function saisir(sel: string, valeur: string, evenement = 'input') {
  const el = q(sel) as HTMLInputElement | HTMLSelectElement;
  el.value = valeur;
  el.dispatchEvent(new Event(evenement, { bubbles: true }));
  flushSync();
}

describe('web#2706 — corps de la simulation', () => {
  it('six surfaces et trois dimensions, positions dans la pièce, zone jointe', () => {
    const e = entreeSimulation(PIECE_DEFAUT, SURFACES_DEFAUT, 7);
    expect(Object.keys(e.surfaces).sort()).toEqual([...SURFACES].sort());
    expect(e.zone_id).toBe(7);
    for (const p of [e.auditeur, ...e.enceintes]) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(5);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(4);
      expect(p.z).toBeGreaterThanOrEqual(0); expect(p.z).toBeLessThanOrEqual(2.5);
    }
    // Les mêmes bornes que `modes::valider` : 1,5–20 m, hauteur 10 m au plus.
    expect(coteHorsBornes({ longueur_m: 1.4, largeur_m: 4, hauteur_m: 2.5 })).toBe('longueur_m');
    expect(coteHorsBornes({ longueur_m: 5, largeur_m: 4, hauteur_m: 11 })).toBe('hauteur_m');
    expect(coteHorsBornes(PIECE_DEFAUT)).toBeNull();
    // La plus petite pièce admise garde ses enceintes à plus de 10 cm de l'écoute.
    const petit = placementType({ longueur_m: 1.5, largeur_m: 1.5, hauteur_m: 1.5 });
    for (const s of petit.enceintes) {
      expect(Math.hypot(s.x - petit.auditeur.x, s.y - petit.auditeur.y, s.z - petit.auditeur.z)).toBeGreaterThan(0.1);
    }
  });

  it('présence du greffon lue dans GET /plugins', () => {
    expect(presenceCalibration([FICHE_ACTIVE])).toBe('actif');
    expect(presenceCalibration([{ name: 'calibration', installed: false, enabled: false, loaded: false }])).toBe('a_installer');
    expect(presenceCalibration([{ name: 'calibration', installed: true, enabled: true, loaded: false }])).toBe('a_redemarrer');
    expect(presenceCalibration([{ name: 'equalizer' }])).toBe('absent');
  });
});

describe('web#2706 — calibration sans micro', () => {
  it('la simulation produit les modes puis la cible de correction', async () => {
    await monter();
    saisir('input[data-dim="longueur_m"]', '6');
    saisir('select[data-surface="sol"]', 'reflechissante', 'change');
    (q('[data-room="simuler"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="proposition"]'));

    const [sim] = appelsA(`${EXT}/simulations`);
    expect(sim, 'POST /simulations absent').toBeTruthy();
    expect(sim.corps.piece).toEqual({ longueur_m: 6, largeur_m: 4, hauteur_m: 2.5 });
    expect(sim.corps.surfaces.sol).toBe('reflechissante');
    expect(sim.corps.surfaces.plafond).toBe('amortie');
    expect(sim.corps.enceintes).toHaveLength(2);
    expect(sim.corps.zone_id).toBe(ZONE);

    const [corr] = appelsA(`${EXT}/simulations/sim-1/correction`);
    expect(corr, 'POST /simulations/{id}/correction absent').toBeTruthy();
    expect(corr.corps).toEqual({ cible: { type: 'plate' } });

    // Modes listés (axial, tangentiel), le mode couplé marqué, la cible tracée.
    const lignes = [...cible!.querySelectorAll('[data-room="modes"] tbody tr')];
    expect(lignes).toHaveLength(3);
    expect(lignes[0].textContent).toContain('34.3 Hz');
    expect(lignes[0].textContent).toContain(texte('v2.room.modeAxial'));
    expect(lignes[0].classList.contains('fort')).toBe(true);
    expect(lignes[1].classList.contains('fort')).toBe(false);
    expect(q('[data-room="proposition"] polyline.cible')).toBeTruthy();
    expect(q('[data-room="proposition"] polyline.corrigee')).toBeTruthy();
    expect(q('[data-room="bandes"]')!.textContent).toContain('43 Hz');
    expect(q('[data-room="bandes"]')!.textContent).toContain('-4.0 dB');
  });

  it('changer de cible recalcule la proposition', async () => {
    await monter();
    (q('[data-room="simuler"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-cible="harman"]'));
    (q('[data-cible="harman"]') as HTMLButtonElement).click();
    await jusqua(() => appelsA(`${EXT}/simulations/sim-1/correction`).length === 2);
    expect(appelsA(`${EXT}/simulations/sim-1/correction`)[1].corps).toEqual({ cible: { type: 'harman' } });
  });

  it('« Appliquer » enregistre le profil de la zone PUIS l’applique à son égaliseur', async () => {
    await monter();
    (q('[data-room="simuler"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="appliquer"]'));
    (q('[data-room="appliquer"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="appliquee"]'));

    expect(dialogs.confirm).toHaveBeenCalledOnce();
    const profil = appelsA(`${EXT}/simulations/sim-1/correction/profil`);
    expect(profil).toHaveLength(1);
    expect(profil[0].corps).toEqual({ cible: { type: 'plate' }, zone_id: ZONE });
    const app = appelsA(`/api/v1/room-correction/profiles/${ZONE}/apply`);
    expect(app).toHaveLength(1);
    const ordre = appels.map((a) => a.url);
    expect(ordre.findIndex((u) => u.endsWith('/correction/profil'))).toBeLessThan(ordre.findIndex((u) => u.endsWith('/apply')));
    expect(q('[data-room="appliquee"]')!.textContent).toContain('Salon');
  });

  it('« Appliquer » annulé au dialogue : rien n’est écrit', async () => {
    (dialogs.confirm as any).mockResolvedValue(false);
    await monter();
    (q('[data-room="simuler"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="appliquer"]'));
    (q('[data-room="appliquer"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));
    expect(appels.some((a) => a.url.endsWith('/correction/profil') || a.url.endsWith('/apply'))).toBe(false);
  });

  it('une erreur du serveur s’affiche avec sa cause', async () => {
    hote.simulation = { status: 400, corps: { error: 'simulation_invalide', message: "enceinte 1 : à moins de 10 cm de l'auditeur" } };
    await monter();
    (q('[data-room="simuler"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room-erreur]'));
    const err = q('[data-room-erreur]')!;
    expect(err.getAttribute('data-room-erreur')).toBe('simulation_invalide');
    expect(err.textContent).toContain(texte('v2.room.errSimulation'));
    expect(q('[data-room="cause"]')!.textContent).toBe("enceinte 1 : à moins de 10 cm de l'auditeur");
    expect(q('[data-room="proposition"]')).toBeNull();
  });

  it('une dimension hors bornes est signalée et n’envoie rien', async () => {
    await monter();
    saisir('input[data-dim="hauteur_m"]', '12');
    expect(q('[data-room="hors-bornes"]')).toBeTruthy();
    expect((q('[data-room="simuler"]') as HTMLButtonElement).disabled).toBe(true);
    expect(appelsA(`${EXT}/simulations`)).toHaveLength(0);
  });
});

describe('web#2706 — Premium', () => {
  it('sans licence : l’écran est là, avec la mention Premium, et verrouillé', async () => {
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'free' }));
    monte = mount(CorrectionPieceV2, { target: cible! });
    await jusqua(() => !!q('[data-room-motif="premium"]'));
    expect(q('h1')!.textContent).toContain(texte('v2.zone.roomCorrection'));
    expect(q('[data-room-motif="premium"]')!.textContent).toContain(texte('v2.room.premium'));
    expect((q('fieldset[data-room="simulation"]') as HTMLFieldSetElement).disabled).toBe(true);
    expect(q('[data-room="badge-premium"]')).toBeTruthy();
  });

  it('un 402 du greffon verrouille aussi, quoi que dise la licence lue', async () => {
    hote.premium402 = true;
    await monter();
    (q('[data-room="simuler"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room-motif="premium"]'));
    expect((q('fieldset[data-room="simulation"]') as HTMLFieldSetElement).disabled).toBe(true);
  });
});

describe('web#2706 — greffon absent ou à installer', () => {
  it('pas installé : l’écran le dit et propose de l’installer', async () => {
    hote.plugins = [{ name: 'calibration', installed: false, enabled: false, loaded: false }];
    monte = mount(CorrectionPieceV2, { target: cible! });
    await jusqua(() => !!q('[data-room-motif="a_installer"]'));
    expect(q('[data-room="installer"]')).toBeTruthy();
    expect((q('fieldset[data-room="simulation"]') as HTMLFieldSetElement).disabled).toBe(true);
  });
});

describe('web#2719 — greffon equalizer manquant', () => {
  async function jusquAppliquer() {
    await monter();
    (q('[data-room="simuler"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="appliquer"]'));
  }

  it('égaliseur présent : pas d’avertissement, « Appliquer » inchangé', async () => {
    await jusquAppliquer();
    expect(q('[data-room-motif="egaliseur"]')).toBeNull();
    (q('[data-room="appliquer"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="appliquee"]'));
    expect((dialogs.confirm as any).mock.calls[0][0]).toBe(texte('v2.room.applyConfirm').replace('{zone}', 'Salon'));
    expect(appelsA(`/api/v1/room-correction/profiles/${ZONE}/apply`)).toHaveLength(1);
  });

  it('égaliseur absent : avertissement, installation proposée, rien n’est appliqué sans confirmation', async () => {
    hote.plugins = [FICHE_ACTIVE];
    (dialogs.confirm as any).mockResolvedValue(false);
    await jusquAppliquer();
    expect(q('[data-room-motif="egaliseur"]')).toBeTruthy();
    expect(q('[data-room-motif="egaliseur"]')!.textContent).toContain(texte('v2.room.eqMissing'));
    expect(q('[data-room="installer-egaliseur"]')).toBeTruthy();
    (q('[data-room="appliquer"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));
    expect((dialogs.confirm as any).mock.calls[0][0]).toBe(texte('v2.room.eqApplyConfirm').replace('{zone}', 'Salon'));
    expect(appels.some((a) => a.url.endsWith('/correction/profil') || a.url.endsWith('/apply'))).toBe(false);
  });

  it('égaliseur absent, confirmé : l’application a lieu', async () => {
    hote.plugins = [FICHE_ACTIVE, { name: 'equalizer', installed: true, enabled: false }];
    await jusquAppliquer();
    expect(q('[data-room-motif="egaliseur"]')!.textContent).toContain(texte('v2.room.eqInactive'));
    expect(q('[data-room="installer-egaliseur"]')).toBeNull();
    (q('[data-room="appliquer"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="appliquee"]'));
    expect(appelsA(`/api/v1/room-correction/profiles/${ZONE}/apply`)).toHaveLength(1);
  });

  it('« Installer l’Égaliseur » appelle la route d’installation et demande le redémarrage', async () => {
    hote.plugins = [FICHE_ACTIVE, { name: 'equalizer', installed: false, enabled: false }];
    await monter();
    await jusqua(() => !!q('[data-room="installer-egaliseur"]'));
    (q('[data-room="installer-egaliseur"]') as HTMLButtonElement).click();
    await jusqua(() => q('[data-room-motif="egaliseur"]')?.getAttribute('data-egaliseur') === 'a_redemarrer');
    expect(appelsA('/api/v1/plugins/equalizer/install')).toHaveLength(1);
    expect(q('[data-room-motif="egaliseur"]')!.textContent).toContain(texte('v2.room.eqRestart'));
  });
});

describe('web#2706 — mesure au micro', () => {
  async function ongletMicro() {
    await monter();
    (q('[data-onglet="micro"]') as HTMLButtonElement).click();
    flushSync();
  }

  it('sans micro sur le serveur, l’écran le dit clairement', async () => {
    hote.microphones = { status: 200, corps: { pile: 'alsa', frequence_requise: 48000, etalonnages: [], entrees: [
      { nom: 'BlackHole', id: 'bh', canaux: 2, frequence_courante: 48000, virtuelle: true, mesurable: true },
    ] } };
    await ongletMicro();
    await jusqua(() => !!q('[data-room-motif="nomic"]'));
    expect(q('[data-room-motif="nomic"]')!.textContent).toBe(texte('v2.room.noMic'));
    expect(q('[data-room="mesurer"]')).toBeNull();
  });

  // #8490 (Xavier Joly, 11/11) : « réglez-le à {hz} Hz » — `replace` ne
  // remplaçait que le premier des deux {hz} ; et un format ILLISIBLE
  // (frequence_courante absente, UMIK-1 en S24_3LE #8489) était présenté
  // comme une mauvaise fréquence.
  it('#8490 — micro à une autre fréquence : les deux {hz} sont remplacés', async () => {
    hote.microphones = { status: 200, corps: { pile: 'alsa', frequence_requise: 48000, etalonnages: [], entrees: [
      { nom: 'UMIK-1', id: 'umik', canaux: 2, frequence_courante: 44100, virtuelle: false, mesurable: false },
    ] } };
    await ongletMicro();
    await jusqua(() => !!q('[data-room="frequence"]'));
    const avert = q('[data-room="frequence"]')!.textContent!.trim();
    expect(avert).not.toContain('{hz}');
    expect(avert).toBe(texte('v2.room.micRate').replaceAll('{hz}', '48000'));
    expect(avert.match(/48000/g)).toHaveLength(2);
  });

  it('#8490 — format du micro illisible : pas de « ne capte pas à 48000 Hz », la vraie cause', async () => {
    hote.microphones = { status: 200, corps: { pile: 'alsa', frequence_requise: 48000, etalonnages: [], entrees: [
      { nom: 'UMIK-1', id: 'umik', canaux: 0, frequence_courante: null, virtuelle: false, mesurable: false },
    ] } };
    await ongletMicro();
    await jusqua(() => !!q('[data-room="frequence"]'));
    const avert = q('[data-room="frequence"]')!.textContent!.trim();
    expect(avert).toBe(texte('v2.room.micFormatUnknown'));
    expect(avert).not.toContain('48000');
    expect(avert).not.toBe('v2.room.micFormatUnknown');
  });

  it('#8490 — micro à 48 kHz : aucun avertissement', async () => {
    await ongletMicro();
    await jusqua(() => !!q('[data-room="mesurer"]'));
    expect(q('[data-room="frequence"]')).toBeNull();
  });

  it('capture indisponible (503) : même message, et la cause du serveur', async () => {
    hote.microphones = { status: 503, corps: { error: 'capture_indisponible', message: 'aucun périphérique de capture' } };
    await ongletMicro();
    await jusqua(() => !!q('[data-room-motif="nomic"]'));
    expect(q('[data-room="cause"]')!.textContent).toBe('aucun périphérique de capture');
  });

  it('micro et étalonnage choisis, mesure suivie jusqu’au résultat et à la correction', async () => {
    await ongletMicro();
    await jusqua(() => !!q('[data-room="mesurer"]'));
    // Le micro virtuel n'est pas proposé.
    expect([...cible!.querySelectorAll('select[data-room="entree"] option')].map((o) => o.textContent)).toEqual(['UMIK-1']);
    saisir('select[data-room="etalonnage"]', 'UMIK-1 7012345', 'change');
    (q('[data-room="mesurer"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="proposition"]'));

    const [lance] = appelsA(`${EXT}/zones/${ZONE}/mesures`);
    expect(lance.corps).toMatchObject({ entree: 'umik', voie_micro: 0, etalonnage: 'UMIK-1 7012345' });
    expect(appels.filter((a) => a.url.endsWith(`${EXT}/mesures/m-1`) && a.method === 'GET').length).toBeGreaterThanOrEqual(3);
    expect(appels.some((a) => a.url.endsWith(`${EXT}/mesures/m-1/resultat`))).toBe(true);
    expect(appelsA(`${EXT}/mesures/m-1/correction`)[0].corps).toEqual({ cible: { type: 'plate' } });
    expect(q('[data-room="rt60"]')!.textContent).toContain('0.42 s');

    (q('[data-room="appliquer"]') as HTMLButtonElement).click();
    await jusqua(() => !!q('[data-room="appliquee"]'));
    expect(appelsA(`${EXT}/mesures/m-1/correction/profil`)).toHaveLength(1);
    expect(appelsA(`/api/v1/room-correction/profiles/${ZONE}/apply`)).toHaveLength(1);
  });

  it('une mesure en cours s’annule', async () => {
    hote.etats = ['balayage'];
    await ongletMicro();
    await jusqua(() => !!q('[data-room="mesurer"]'));
    (q('[data-room="mesurer"]') as HTMLButtonElement).click();
    await jusqua(() => q('[data-room="avancement"]')?.getAttribute('data-etat') === 'balayage');
    expect(q('[data-room="avancement"] progress')).toBeTruthy();
    (q('[data-room="annuler"]') as HTMLButtonElement).click();
    await jusqua(() => q('[data-room="avancement"]')?.getAttribute('data-etat') === 'annulee');
    expect(appelsA(`${EXT}/mesures/m-1`, 'DELETE')).toHaveLength(1);
  });
});

describe('web#2706 — chemin depuis le menu de zone, et le FIR', () => {
  it('le menu de zone ouvre cet écran ; l’écran garde un lien vers l’import FIR', async () => {
    const zonesV2 = readFileSync(resolve(process.cwd(), 'src/components/v2/ZonesV2.svelte'), 'utf-8');
    expect(zonesV2).toMatch(/correction:\s*\(\)\s*=>\s*correctionDeLaZone\(z\)/);
    expect(zonesV2).toMatch(/activeView\.set\('roomcorrection'\)/);
    const shell = readFileSync(resolve(process.cwd(), 'src/components/v2/ShellV2.svelte'), 'utf-8');
    expect(shell).toMatch(/\$activeView === 'roomcorrection'\}\s*<CorrectionPieceV2 \/>/);

    await monter();
    (q('[data-room="fir"]') as HTMLButtonElement).click();
    expect(get(activeView)).toBe('settings');
    expect(get(v2SettingsTarget)).toEqual({ tab: 'devices', section: 'perZone', zone: ZONE, bloc: 'fir' });
    v2SettingsTarget.set(null);
  });
});

describe('web#2706 — textes', () => {
  it('chaque texte de l’écran existe dans les quinze langues', () => {
    const fr = dictionnaire('fr');
    const cles = Object.keys(fr).filter((k) => k.startsWith('v2.room.'));
    expect(cles.length).toBeGreaterThan(80);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of cles) expect(d[k], `${l} : ${k}`).toBeTruthy();
    }
  });
});
