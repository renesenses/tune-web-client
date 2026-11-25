// @vitest-environment jsdom
//
// TESS (C4, rc14) — la mesure de la pièce à PLUSIEURS positions, montée pour
// de vrai dans `CorrectionPieceV2` contre le greffon `calibration` simulé
// d'après ses routes (tune-server-rust, lot `batch/tess-20261118`, commit
// c1965ced6, `plugins/tune-calibration/src/routes.rs` et `session.rs`) :
//
//   GET  /sessions                       { sessions: Vue[] }  — 404 sur rc13
//   POST /zones/{z}/sessions             201 Vue
//   POST /sessions/{id}/positions        202 { session, position, id, zone_id }
//   GET  /mesures/{id}, DELETE           avancement, annulation (mesure ordinaire)
//   GET  /sessions/{id}                  Vue : positions, etats, moyenne (≥ 3 dont la centrale)
//   POST /sessions/{id}/correction       Proposition
//   POST /sessions/{id}/correction/profil  201
//   POST /comparaisons                   ComparaisonAB
//   GET  /sessions/{id}/export           document v2
//   POST /sessions/import                201 Vue + version_lue ; 409 unsupported_version
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { currentZoneId, zones } from '../stores/zones';
import { licenseState } from '../stores/license';
import { dialogs } from '../stores/dialogs';
import { t } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import {
  SUIVI, zoneCorrectionPiece, capaciteSessions, positionsBornees, prochainePosition, causeRejet, nomExportSession,
  type VueSession,
} from '../correctionPiece';
import CorrectionPieceV2 from '../../components/v2/CorrectionPieceV2.svelte';
import MesureMultiPositions from '../../components/v2/MesureMultiPositions.svelte';

vi.setConfig({ testTimeout: 30_000 });

const ZONE = 2706;
const EXT = '/api/v1/ext/calibration';
const FREQS = Array.from({ length: 40 }, (_, i) => 20 * Math.pow(2, i / 12));

function reponse(status: number, corps: unknown): Response {
  const texte = corps === undefined ? '' : JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => texte,
  } as unknown as Response;
}

const resultat = (niveau: number) => ({
  frequence: 48000, niveau_joue_dbfs: niveau, salves: [],
  ri: { retard_ms: 4, crete_dbfs: -10, rsb_db: 55, trames: 1, crete_a_la_trame: 1 },
  reponse: { lissage: '1/12', freqs_hz: FREQS, db: FREQS.map((f) => (Math.abs(f - 42) < 6 ? 8 : 0)) },
  rt60: [], etalonnage: 'UMIK-1 7012345',
  traitements_zone: { egaliseur: false, correction_ir: false, pure: false, volume_fixe: false },
  avertissements: [], duree_analyse_ms: 300,
});

function proposition(id: string) {
  const bandes = [{ freq: 42.9, gain: -4, q: 4.3, type: 'peak' }];
  return {
    id, zone_id: ZONE, bandes, zone_hz: [20, 500], pic_avant_db: 8, pic_apres_db: 4,
    courbes: { freqs_hz: FREQS, mesure_db: FREQS.map(() => 0), cible_db: FREQS.map(() => 0), corrigee_db: FREQS.map(() => 0) },
    avertissements: ['position 3 écartée : niveau décalé'],
  };
}

/** Une session telle que le greffon la tient (`Session`), et ses mesures. */
interface SessionSimulee {
  id: string; zone_id: number | null; positions_prevues: number; centrale: number;
  positions: { index: number; mesure_id: string; essai: number; etiquette?: string }[];
  importee?: VueSession;
}
interface MesureSimulee { id: string; etats: string[]; index: number; essai: number }

type Appel = { url: string; method: string; corps: any };
let appels: Appel[];
let sessions: Map<string, SessionSimulee>;
let mesures: Map<string, MesureSimulee>;
let sessions404: boolean;
let importRefus: { status: number; corps: unknown } | null;
let compteur = 0;
let compteurSessions = 0;
/** Les états que parcourt une mesure lancée (réglable par test). */
let etatsMesure: string[];
/** Pannes réseau à simuler sur le suivi d'une mesure (`GET /mesures/{id}`). */
let pannesReseau = 0;

/** Position 4 (index 3), au PREMIER essai, est décalée de +9,2 dB : rejet par le niveau. */
function vue(s: SessionSimulee): VueSession {
  if (s.importee) return s.importee;
  const terminees = s.positions.filter((p) => mesures.get(p.mesure_id)!.etats.length === 1 && mesures.get(p.mesure_id)!.etats[0] === 'terminee');
  const positions = s.positions.map((p) => {
    const fini = terminees.includes(p);
    return { index: p.index, mesure_id: p.mesure_id, entree: 'umik', ...(fini ? { resultat: resultat(-20) } : {}) };
  });
  const etats = s.positions.map((p) => {
    const m = mesures.get(p.mesure_id)!;
    return { index: p.index, mesure_id: p.mesure_id, etat: m.etats[0] };
  });
  const base = { version: 2, id: s.id, zone_id: s.zone_id, positions_prevues: s.positions_prevues, centrale: s.centrale,
    config: { ponderation: { poids_central: 2 }, moyenne: 'puissance', rejet: { seuil_db: 6, facteur: 3, niveau_db: 6, f_lo_hz: 20, f_hi_hz: 500 } },
    positions, etats };
  if (terminees.length < 3 || !terminees.some((p) => p.index === s.centrale)) {
    return { ...base, moyenne_indisponible: `${terminees.length} position(s) mesurée(s) sur ${s.positions_prevues} : 3 au moins pour une moyenne` } as VueSession;
  }
  const verdicts = terminees.map((p) => {
    const aberrante = p.index === 3 && p.essai === 1;
    return {
      index: p.index, poids: p.index === s.centrale ? 2 : 1, ecart_median_db: aberrante ? 2.1 : 1.3,
      decalage_niveau_db: aberrante ? 9.2 : 0.4, rejetee: aberrante,
      ...(aberrante ? { motif: 'niveau décalé de +9.2 dB par rapport aux autres positions (tolérance ±6.0 dB) : micro couvert, tourné, ou gain changé ? Refaire cette position' } : {}),
    };
  });
  return {
    ...base,
    moyenne: { positions_retenues: verdicts.filter((v) => !v.rejetee).length, seuil_rejet_db: 6, verdicts,
      freqs_hz: FREQS, db: FREQS.map((f) => (Math.abs(f - 42) < 6 ? 7 : 0)), avertissements: [] },
  } as VueSession;
}

function simulerHote() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url).split('?')[0];
    const method = (init?.method ?? 'GET').toUpperCase();
    const corps = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, corps });
    if (u.endsWith('/api/v1/plugins')) {
      return reponse(200, [
        { name: 'calibration', installed: true, enabled: true, loaded: true, premium: true },
        { name: 'equalizer', installed: true, enabled: true, loaded: true, premium: true },
      ]);
    }
    if (u.endsWith(`${EXT}/microphones`)) {
      return reponse(200, { pile: 'alsa', frequence_requise: 48000, etalonnages: ['UMIK-1 7012345'], entrees: [
        { nom: 'UMIK-1', id: 'umik', canaux: 1, frequence_courante: 48000, frequences: [48000], bits_servis: 24, virtuelle: false, mesurable: true },
      ] });
    }
    if (u.endsWith(`${EXT}/mesures`) && method === 'GET') {
      const enCours = [...mesures.values()].filter((m) => !['terminee', 'annulee', 'erreur', 'refusee'].includes(m.etats[0]));
      return reponse(200, { mesures: enCours.map((m) => ({ id: m.id, zone_id: ZONE, entree: 'umik', etat: m.etats[0], salves: [], depuis_s: 1, progression: 0.3, avertissements: [] })) });
    }
    // Serveur rc13 : aucune route de session (404 du routeur, sans code du greffon).
    if (sessions404 && u.includes(`${EXT}/sessions`)) return reponse(404, undefined);
    if (u.endsWith(`${EXT}/sessions`) && method === 'GET') {
      return reponse(200, { sessions: [...sessions.values()].map(vue) });
    }
    const cree = /\/ext\/calibration\/zones\/(\d+)\/sessions$/.exec(u);
    if (cree && method === 'POST') {
      if (!(corps.positions >= 3 && corps.positions <= 9)) return reponse(400, { error: 'session_invalide', message: `${corps.positions} positions : entre 3 et 9` });
      const s: SessionSimulee = { id: `s${++compteurSessions}-1763700000`, zone_id: Number(cree[1]), positions_prevues: corps.positions, centrale: corps.centrale ?? 0, positions: [] };
      sessions.set(s.id, s);
      return reponse(201, vue(s));
    }
    if (u.endsWith(`${EXT}/sessions/import`) && method === 'POST') {
      if (importRefus) return reponse(importRefus.status, importRefus.corps);
      const id = `s${++compteurSessions}-import`;
      const doc = corps as VueSession;
      const s: SessionSimulee = { id, zone_id: doc.zone_id, positions_prevues: doc.positions_prevues, centrale: doc.centrale, positions: [] };
      s.importee = { ...doc, id, etats: doc.positions.map((p) => ({ index: p.index, mesure_id: p.mesure_id, etat: 'terminee' as const })), version_lue: 2 };
      sessions.set(id, s);
      return reponse(201, s.importee);
    }
    const pos = /\/ext\/calibration\/sessions\/([^/]+)\/positions$/.exec(u);
    if (pos && method === 'POST') {
      const s = sessions.get(decodeURIComponent(pos[1]));
      if (!s) return reponse(404, { error: 'session_inconnue', message: 'aucune session' });
      const index = corps.index;
      const essai = s.positions.filter((p) => p.index === index).length ? (s.positions.find((p) => p.index === index)!.essai + 1) : 1;
      const id = `m${++compteur}-1763700000`;
      mesures.set(id, { id, etats: [...etatsMesure], index, essai });
      s.positions = s.positions.filter((p) => p.index !== index).concat({ index, mesure_id: id, essai }).sort((a, b) => a.index - b.index);
      return reponse(202, { session: s.id, position: index, id, zone_id: s.zone_id });
    }
    const mes = /\/ext\/calibration\/mesures\/([^/]+)$/.exec(u);
    if (mes) {
      if (method === 'GET' && pannesReseau > 0) { pannesReseau--; throw new TypeError('Failed to fetch'); }
      const m = mesures.get(decodeURIComponent(mes[1]));
      if (!m) return reponse(404, { error: 'mesure_inconnue', message: 'aucune mesure' });
      if (method === 'DELETE') {
        m.etats = ['annulee'];
        return reponse(200, { id: m.id, annulation_demandee: true, etat: { etat: 'annulee' } });
      }
      const etat = m.etats.length > 1 ? m.etats.shift()! : m.etats[0];
      return reponse(200, { id: m.id, zone_id: ZONE, entree: 'umik', etat, salves: [], depuis_s: 2,
        progression: etat === 'terminee' ? 1 : 0.5, avertissements: [] });
    }
    const exp = /\/ext\/calibration\/sessions\/([^/]+)\/export$/.exec(u);
    if (exp) {
      const s = sessions.get(decodeURIComponent(exp[1]))!;
      const { etats: _e, moyenne: _m, moyenne_indisponible: _i, ...doc } = vue(s) as any;
      return reponse(200, doc);
    }
    const cor = /\/ext\/calibration\/sessions\/([^/]+)\/correction$/.exec(u);
    if (cor && method === 'POST') return reponse(200, proposition(decodeURIComponent(cor[1])));
    const prof = /\/ext\/calibration\/sessions\/([^/]+)\/correction\/profil$/.exec(u);
    if (prof && method === 'POST') {
      return reponse(201, { id: prof[1], zone_id: ZONE, profil: {}, proposition: proposition(prof[1]), estimation: false,
        appliquer: `/api/v1/room-correction/profiles/${ZONE}/apply` });
    }
    const lue = /\/ext\/calibration\/sessions\/([^/]+)$/.exec(u);
    if (lue && method === 'GET') {
      const s = sessions.get(decodeURIComponent(lue[1]));
      return s ? reponse(200, vue(s)) : reponse(404, { error: 'session_inconnue', message: 'aucune session' });
    }
    if (u.endsWith(`${EXT}/comparaisons`) && method === 'POST') {
      return reponse(200, {
        bande_hz: [20, 500],
        avant: { ecart_type_db: 4.2, ecart_type_creux_db: 1.1, creux_max_db: 6.3, pic_max_db: 8.1, ecart_cible_db: 3.9 },
        apres: { ecart_type_db: 2.1, ecart_type_creux_db: 1.0, creux_max_db: 6.0, pic_max_db: 3.2, ecart_cible_db: 1.8 },
        freqs_hz: FREQS, avant_db: FREQS.map(() => 1), apres_db: FREQS.map(() => 0), difference_db: FREQS.map(() => -1),
        amelioree: true,
      });
    }
    if (u.endsWith(`/api/v1/room-correction/profiles/${ZONE}/apply`) && method === 'POST') {
      return reponse(200, { applied: true, zone_id: String(ZONE), filter_count: 1, applied_live: true });
    }
    return reponse(200, /\/(zones|devices|presets|profiles)(\?|$)/.test(u) ? [] : {});
  }));
}

let cible: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  appels = [];
  sessions = new Map();
  mesures = new Map();
  sessions404 = false;
  importRefus = null;
  compteurSessions = 0;
  etatsMesure = ['salve', 'balayage', 'analyse', 'terminee'];
  pannesReseau = 0;
  SUIVI.intervalleMs = 2;
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

async function jusqua(condition: () => boolean, borne = 10000): Promise<void> {
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
const clic = (sel: string) => { const b = q(sel) as HTMLButtonElement; expect(b, sel).toBeTruthy(); b.click(); flushSync(); };

async function ongletMicro() {
  monte = mount(CorrectionPieceV2, { target: cible! });
  await jusqua(() => appels.some((a) => a.url.endsWith('/api/v1/plugins')));
  await jusqua(() => !(q('fieldset[data-room]') as HTMLFieldSetElement | null)?.disabled);
  clic('[data-onglet="micro"]');
  await jusqua(() => !!q('select[data-room="entree"]') && appels.some((a) => a.url.endsWith(`${EXT}/sessions/sonde-capacite`)));
  flushSync();
}

const ligne = (role: string, i: number) => `[data-multi-role="${role}"] [data-multi-position="${i}"]`;
async function mesurerPosition(role: string, i: number) {
  clic(`${ligne(role, i)} button[data-multi="mesurer"], ${ligne(role, i)} button[data-multi="refaire"]`);
  await jusqua(() => q(ligne(role, i))?.getAttribute('data-etat') === 'terminee' && !q('[data-multi="annuler"]'));
  expect(q(ligne(role, i))!.getAttribute('data-etat'), `position ${i}`).toBe('terminee');
}

describe('TESS — mesure à plusieurs positions, parcours complet', () => {
  it('🔴 création, 5 positions dont une écartée puis refaite, correction, application, vérification, comparaison, export', async () => {
    await ongletMicro();
    // La capacité est là : le choix du type de mesure paraît, « plusieurs » par défaut.
    expect(q('[data-room="mode-micro"]')).toBeTruthy();
    expect(q('[data-mode-micro="plusieurs"]')!.classList.contains('on')).toBe(true);
    expect(q('[data-room="mesurer"]'), 'le bouton de la mesure à une position est remplacé').toBeNull();
    // M1 — la sonde est légère : jamais la liste complète des sessions à l'ouverture.
    expect(appels.filter((a) => a.url.endsWith(`${EXT}/sessions`))).toHaveLength(0);
    expect(appels.filter((a) => a.url.endsWith(`${EXT}/sessions/sonde-capacite`))).toHaveLength(1);

    // 1. Préparation : 5 par défaut, consigne et schéma.
    const nombre = q('input[data-multi="nombre"]') as HTMLInputElement;
    expect(nombre.value).toBe('5');
    expect(q('[data-multi="consigne"]')!.textContent).toBe(texte('v2.room.multiHow'));
    expect(texte('v2.room.multiHow')).toContain('30 à 50 cm');
    expect(cible!.querySelectorAll('[data-multi="schema"] circle.pt')).toHaveLength(5);
    // Hors bornes : ramené à 3 … 9.
    nombre.value = '12';
    nombre.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(cible!.querySelectorAll('[data-multi="schema"] circle.pt')).toHaveLength(9);
    nombre.value = '5';
    nombre.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    // 2. Création de la session.
    clic('[data-multi="commencer"]');
    await jusqua(() => !!q('[data-multi-role="session"]'));
    expect(appelsA(`${EXT}/zones/${ZONE}/sessions`).map((a) => a.corps)).toEqual([{ positions: 5, centrale: 0 }]);
    expect(cible!.querySelectorAll('[data-multi-role="session"] [data-multi-position]')).toHaveLength(5);
    expect(q(ligne('session', 0))!.textContent).toContain(texte('v2.room.multiCentral'));

    // Position 1 : la confirmation nomme la position et la place d'écoute.
    await mesurerPosition('session', 0);
    const confirme = vi.mocked(dialogs.confirm);
    expect(String(confirme.mock.calls.at(-1)![0])).toBe(
      texte('v2.room.multiConfirm').replace('{n}', '1').replace('{lieu}', texte('v2.room.multiCentral'))
        .replace('{orientation}', texte('v2.room.micAimUnknown')).replace('{zone}', 'Salon'));
    const [premiere] = appelsA('/positions');
    expect(premiere.corps).toEqual({ entree: 'umik', voie_micro: 0, etalonnage: null, index: 0 });
    // L'avancement est suivi par la route des mesures.
    expect(appels.filter((a) => a.method === 'GET' && /\/ext\/calibration\/mesures\/m/.test(a.url)).length).toBeGreaterThanOrEqual(3);
    expect(q('[data-multi="moyenne-attente"]')).toBeTruthy();

    for (const i of [1, 2, 3, 4]) await mesurerPosition('session', i);
    expect(appelsA('/positions').map((a) => a.corps.index)).toEqual([0, 1, 2, 3, 4]);

    // La position 4 (index 3) est écartée, et la RAISON est dite, traduite.
    await jusqua(() => q(ligne('session', 3))?.getAttribute('data-rejetee') === 'oui');
    const rejet = q(`${ligne('session', 3)} [data-multi="rejet"]`)!;
    expect(rejet.getAttribute('data-cause')).toBe('niveau');
    expect(rejet.textContent).toContain(texte('v2.room.multiRejected'));
    expect(rejet.textContent).toContain(texte('v2.room.multiRejectLevel').replace('{d}', '9.2'));
    expect(q(`${ligne('session', 2)} [data-multi="resultat"]`)!.textContent).toContain(texte('v2.room.multiMeasured'));
    expect(q('[data-multi="moyenne"]')!.textContent).toBe(texte('v2.room.multiAverage').replace('{n}', '4').replace('{total}', '5'));

    // 3. Correction proposée sur la moyenne.
    await jusqua(() => !!q('[data-multi="parcours"] [data-room="proposition"]'));
    const [prop] = appelsA(`/sessions/s1-1763700000/correction`);
    expect(prop.corps).toEqual({ cible: { type: 'plate' } });

    // La position écartée se refait : elle rentre dans la moyenne.
    await mesurerPosition('session', 3);
    await jusqua(() => q(ligne('session', 3))?.getAttribute('data-rejetee') === 'non');
    expect(appelsA('/positions').at(-1)!.corps.index).toBe(3);
    expect(q('[data-multi="moyenne"]')!.textContent).toBe(texte('v2.room.multiAverage').replace('{n}', '5').replace('{total}', '5'));

    // Application : profil de la SESSION, puis le geste qui écrit l'égaliseur.
    clic('[data-multi="parcours"] [data-room="appliquer"]');
    await jusqua(() => !!q('[data-room="appliquee"]'));
    expect(appelsA('/sessions/s1-1763700000/correction/profil')).toHaveLength(1);
    expect(appelsA(`/api/v1/room-correction/profiles/${ZONE}/apply`)).toHaveLength(1);

    // 4. Vérification : une seconde session, puis la comparaison avant / après.
    clic('[data-multi="verifier"]');
    await jusqua(() => !!q('[data-multi-role="verification"]'));
    expect(appelsA(`${EXT}/zones/${ZONE}/sessions`).at(-1)!.corps).toEqual({ positions: 5, centrale: 0 });
    for (const i of [0, 1, 2]) await mesurerPosition('verification', i);
    await jusqua(() => !!q('[data-multi="comparaison"]'));
    const [ab] = appelsA(`${EXT}/comparaisons`);
    expect(ab.corps).toEqual({ avant: 's1-1763700000', apres: 's2-1763700000', cible: { type: 'plate' } });
    const comp = q('[data-multi="comparaison"]')!;
    expect(comp.getAttribute('data-amelioree')).toBe('oui');
    expect(q('[data-multi="verdict-ab"]')!.textContent!.trim()).toBe(texte('v2.room.multiCompareBetter'));
    expect(q('[data-indicateur="ecart_type"]')!.textContent).toBe(`${texte('v2.room.multiIndRegularity')}4.2 dB2.1 dB`);
    expect(q('[data-indicateur="pic"]')!.textContent).toContain('8.1 dB');
    expect(q('[data-indicateur="creux"]')!.textContent).toContain('6.0 dB');
    expect(q('[data-indicateur="cible"]')!.textContent).toContain('1.8 dB');

    // 5. Export : un fichier JSON, le document v2 du serveur.
    const blobs: Blob[] = [];
    const noms: string[] = [];
    const U = URL as unknown as Record<string, unknown>;
    const origine = { c: U.createObjectURL, r: U.revokeObjectURL };
    U.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:tune'; });
    U.revokeObjectURL = vi.fn();
    onTestFinished(() => { U.createObjectURL = origine.c; U.revokeObjectURL = origine.r; });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { noms.push(this.download); });
    clic('[data-multi="exporter"]');
    await jusqua(() => noms.length > 0);
    expect(appelsA('/sessions/s1-1763700000/export', 'GET')).toHaveLength(1);
    expect(noms[0]).toMatch(/^tune-mesure-pieces-2706-\d{8}-\d{4}-s1-1763700000\.json$/);
    const doc = JSON.parse(await blobs[0].text());
    expect(doc).toMatchObject({ version: 2, id: 's1-1763700000', zone_id: ZONE, positions_prevues: 5 });
    expect(doc.positions).toHaveLength(5);
  });

  it('une position en cours s’annule ; elle reste à mesurer', async () => {
    await ongletMicro();
    clic('[data-multi="commencer"]');
    await jusqua(() => !!q('[data-multi-role="session"]'));
    // La mesure ne finit jamais : on l'annule.
    etatsMesure = ['balayage'];
    clic(`${ligne('session', 0)} button[data-multi="mesurer"]`);
    await jusqua(() => mesures.size > 0);
    const m = [...mesures.values()].at(-1)!;
    await jusqua(() => !!q('[data-multi="annuler"]') && !!q('[data-multi="avancement"] progress'));
    // Le micro ne se change pas pendant la mesure.
    expect((q('select[data-room="entree"]') as HTMLSelectElement).disabled).toBe(true);
    clic('[data-multi="annuler"]');
    await jusqua(() => q(ligne('session', 0))?.getAttribute('data-etat') === 'annulee');
    expect(appels.filter((a) => a.method === 'DELETE' && a.url.endsWith(`/mesures/${m.id}`))).toHaveLength(1);
    expect(q(`${ligne('session', 0)} button[data-multi="mesurer"]`)).toBeTruthy();
    expect((q('select[data-room="entree"]') as HTMLSelectElement).disabled).toBe(false);
  });
});

describe('TESS — import d’une session', () => {
  function deposerFichier(contenu: string) {
    const input = q('input[data-multi="importer"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'mesure.json', text: async () => contenu }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
  }
  const DOC = {
    version: 2, id: 's9-1763000000', zone_id: 77, positions_prevues: 3, centrale: 0,
    config: { rejet: { niveau_db: 6 } },
    positions: [0, 1, 2].map((i) => ({ index: i, mesure_id: `m${i}`, entree: 'umik', resultat: resultat(-20) })),
  };

  it('une session d’une AUTRE zone se consulte, sans bouton de mesure ni d’application', async () => {
    await ongletMicro();
    deposerFichier(JSON.stringify(DOC));
    await jusqua(() => !!q('[data-multi="lecture-seule"]'));
    expect(appelsA(`${EXT}/sessions/import`)[0].corps).toEqual(DOC);
    expect(cible!.querySelectorAll('[data-multi-role="session"] [data-multi-position]')).toHaveLength(3);
    expect(q('[data-multi-role="session"] button[data-multi="mesurer"]')).toBeNull();
    expect(q('[data-multi-role="session"] button[data-multi="refaire"]')).toBeNull();
    expect(q('[data-multi="parcours"] [data-room="proposition"]')).toBeNull();
    expect(appels.some((a) => /\/sessions\/[^/]+\/correction/.test(a.url))).toBe(false);
  });

  it('un document d’une version plus récente : le message le dit', async () => {
    importRefus = { status: 409, corps: { error: 'unsupported_version', message: 'session au format 3 : ce serveur lit jusqu\'au format 2' } };
    await ongletMicro();
    deposerFichier(JSON.stringify({ ...DOC, version: 3 }));
    await jusqua(() => !!q('[data-multi="parcours"] [role="alert"]'));
    expect(q('[data-multi="parcours"] [role="alert"]')!.textContent).toContain(texte('v2.room.multiErrImportVersion'));
    expect(q('[data-multi="preparation"]')).toBeTruthy();
  });

  it('un fichier illisible n’est pas envoyé', async () => {
    await ongletMicro();
    deposerFichier('pas du json');
    await jusqua(() => !!q('[data-multi="parcours"] [role="alert"]'));
    expect(q('[data-multi="parcours"] [role="alert"]')!.textContent).toContain(texte('v2.room.multiErrImport'));
    expect(appelsA(`${EXT}/sessions/import`)).toHaveLength(0);
  });
});

describe('TESS — capacité absente : l’écran d’avant, inchangé', () => {
  it('🔴 serveur rc13 (GET /sessions → 404) : ni choix ni parcours, la mesure à une position reste', async () => {
    sessions404 = true;
    await ongletMicro();
    expect(q('[data-room="mode-micro"]')).toBeNull();
    expect(q('[data-multi="parcours"]')).toBeNull();
    expect(q('[data-room="mesurer"]')).toBeTruthy();
    // Le 404 de la sonde ne fait pas croire à un greffon à redémarrer.
    expect(q('[data-room-motif="a_redemarrer"]')).toBeNull();
    expect((q('fieldset[data-room="micro"]') as HTMLFieldSetElement).disabled).toBe(false);
  });

  it('réponse qui n’est pas une liste de sessions : caché aussi', async () => {
    expect(capaciteSessions({})).toBe(false);
    expect(capaciteSessions(null)).toBe(false);
    expect(capaciteSessions({ sessions: [] })).toBe(true);
  });

  it('avec la capacité, « Une seule position » rend l’écran d’avant', async () => {
    await ongletMicro();
    clic('[data-mode-micro="une"]');
    expect(q('[data-multi="parcours"]')).toBeNull();
    expect(q('[data-room="mesurer"]')).toBeTruthy();
  });
});

describe('TESS — Premium', () => {
  it('sans Premium, l’écran est verrouillé et le parcours n’est pas proposé', async () => {
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'free' }));
    monte = mount(CorrectionPieceV2, { target: cible! });
    await jusqua(() => appels.some((a) => a.url.endsWith('/api/v1/plugins')));
    clic('[data-onglet="micro"]');
    await jusqua(() => !!q('[data-room-motif="premium"]'));
    expect((q('fieldset[data-room="micro"]') as HTMLFieldSetElement).disabled).toBe(true);
    expect(appels.some((a) => a.url.includes(`${EXT}/sessions`))).toBe(false);
    expect(q('[data-multi="parcours"]')).toBeNull();
  });
});

describe('TESS — règles pures', () => {
  const base = (etats: VueSession['etats'], positions: VueSession['positions'] = []): VueSession =>
    ({ version: 2, id: 's1', zone_id: ZONE, positions_prevues: 5, centrale: 0, positions, etats } as VueSession);

  it('positionsBornees : 3 … 9, 5 par défaut', () => {
    expect([positionsBornees(1), positionsBornees(12), positionsBornees('7'), positionsBornees('x')]).toEqual([3, 9, 7, 5]);
  });
  it('prochainePosition : la première libre, une position en cours ne l’est pas, une annulée l’est', () => {
    expect(prochainePosition(base([]))).toBe(0);
    expect(prochainePosition(base([{ index: 0, etat: 'balayage' }]))).toBe(1);
    expect(prochainePosition(base([{ index: 0, etat: 'annulee' }]))).toBe(0);
    const toutes = [0, 1, 2, 3, 4].map((i) => ({ index: i, resultat: resultat(-20) as any }));
    expect(prochainePosition(base([], toutes))).toBeNull();
  });
  it('causeRejet : le niveau d’abord, au-delà de la tolérance de la session ; sinon la forme', () => {
    const s = { ...base([]), config: { rejet: { niveau_db: 6 } } };
    const v = { index: 3, poids: 1, ecart_median_db: 9, rejetee: true };
    expect(causeRejet({ ...v, decalage_niveau_db: -7 }, s)).toBe('niveau');
    expect(causeRejet({ ...v, decalage_niveau_db: 2 }, s)).toBe('forme');
    expect(causeRejet({ ...v, decalage_niveau_db: 7 }, { ...s, config: { rejet: { niveau_db: 8 } } })).toBe('forme');
  });
  it('nomExportSession : zone, date, id assaini', () => {
    expect(nomExportSession({ id: 's1-17/../x', zone_id: 3 }, new Date('2026-11-24T09:05:00Z'))).toBe('tune-mesure-pieces-3-20261124-0905-s1-17x.json');
  });
});

describe('TESS — textes dans les seize langues', () => {
  it.each(ONZE_LANGUES)('%s', (code) => {
    const fr = dictionnaire('fr');
    const d = dictionnaire(code);
    const cles = Object.keys(fr).filter((k) => k.startsWith('v2.room.multi'));
    expect(cles.length).toBe(54);
    for (const k of cles) {
      expect(d[k], `${code} : ${k}`).toBeTruthy();
      for (const ph of fr[k].match(/\{\w+\}/g) ?? []) expect(d[k], `${code} : ${k} ${ph}`).toContain(ph);
    }
  });
});

describe('TESS — robustesse (relecture de #3322 : B1, B2, M2–M6)', () => {
  async function lancerSansFin() {
    await ongletMicro();
    clic('[data-multi="commencer"]');
    await jusqua(() => !!q('[data-multi-role="session"]'));
    etatsMesure = ['balayage'];
    clic(`${ligne('session', 0)} button[data-multi="mesurer"]`);
    await jusqua(() => !!q('[data-multi="annuler"]'));
    expect((q('select[data-room="entree"]') as HTMLSelectElement).disabled).toBe(true);
    return [...mesures.values()].at(-1)!;
  }

  it('🔴 B1 — onglet quitté pendant une mesure puis repris : le parcours reprend, et l’écran se débloque à la fin', async () => {
    const m = await lancerSansFin();
    clic('[data-onglet="simulation"]');
    clic('[data-onglet="micro"]');
    // Repris dans le parcours à plusieurs positions, pas comme une mesure à une position.
    await jusqua(() => !!q('[data-multi="avancement"]'));
    expect(q('[data-mode-micro="plusieurs"]')!.classList.contains('on')).toBe(true);
    expect(q('[data-room="avancement"]')).toBeNull();
    m.etats = ['terminee'];
    await jusqua(() => q(ligne('session', 0))?.getAttribute('data-etat') === 'terminee' && !q('[data-multi="annuler"]'));
    expect((q('select[data-room="entree"]') as HTMLSelectElement).disabled).toBe(false);
    expect((q(`${ligne('session', 1)} button[data-multi="mesurer"]`) as HTMLButtonElement).disabled).toBe(false);
    expect((q('[data-mode-micro="une"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('🔴 B1 — le parcours démonté pendant une mesure rend la main (onOccupe(false)) et ne suit plus rien (M2)', async () => {
    const occupe = vi.fn();
    sessions.set('s7-1', { id: 's7-1', zone_id: ZONE, positions_prevues: 3, centrale: 0, positions: [] });
    etatsMesure = ['balayage'];
    const p = mount(MesureMultiPositions, { target: cible!, props: {
      zoneId: ZONE, zoneNom: 'Salon', verrouille: false, demande: { entree: 'umik', voie_micro: 0, etalonnage: null },
      application: 'repos', erreurDe: () => null, onAppliquer: vi.fn(), onOccupe: occupe, onReinitialiser: vi.fn(),
      memoire: { a: 's7-1', b: null }, onMemoire: vi.fn(),
    } });
    await jusqua(() => !!q(`${ligne('session', 0)} button[data-multi="mesurer"]`));
    clic(`${ligne('session', 0)} button[data-multi="mesurer"]`);
    await jusqua(() => !!q('[data-multi="annuler"]'));
    expect(occupe).toHaveBeenLastCalledWith(true);
    unmount(p);
    expect(occupe).toHaveBeenLastCalledWith(false);
    const avant = appels.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(appels.length, 'le suivi continue après le démontage').toBe(avant);
  });

  it('🔴 B2 — serveur redémarré pendant le suivi (404 mesure_inconnue) : message clair, écran débloqué', async () => {
    await lancerSansFin();
    mesures.clear();
    sessions.clear();
    await jusqua(() => !!q('[data-multi="parcours"] [role="alert"]'));
    expect(q('[data-multi="parcours"] [role="alert"]')!.getAttribute('data-room-erreur')).toBe('mesure_inconnue');
    expect(q('[data-multi="parcours"] [role="alert"]')!.textContent).toContain(texte('v2.room.multiErrLost'));
    expect(texte('v2.room.multiErrLost')).toContain('export');
    expect(q('[data-multi="annuler"]')).toBeNull();
    expect((q('select[data-room="entree"]') as HTMLSelectElement).disabled).toBe(false);
    expect((q('[data-multi="nouvelle"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('🔴 B2 — panne réseau passagère : le suivi se relance et la mesure aboutit', async () => {
    await ongletMicro();
    clic('[data-multi="commencer"]');
    await jusqua(() => !!q('[data-multi-role="session"]'));
    pannesReseau = 3;
    await mesurerPosition('session', 0);
    expect(pannesReseau).toBe(0);
    expect(q('[data-multi="parcours"] [role="alert"]')).toBeNull();
  });

  it('B2 — panne réseau durable : abandon après les relances, écran débloqué', async () => {
    await ongletMicro();
    clic('[data-multi="commencer"]');
    await jusqua(() => !!q('[data-multi-role="session"]'));
    pannesReseau = 1000;
    clic(`${ligne('session', 0)} button[data-multi="mesurer"]`);
    await jusqua(() => !!q('[data-multi="parcours"] [role="alert"]'), 15000);
    expect(q('[data-multi="parcours"] [role="alert"]')!.textContent).toContain(texte('v2.room.errMeasure'));
    expect(1000 - pannesReseau).toBe(5);
    expect((q('select[data-room="entree"]') as HTMLSelectElement).disabled).toBe(false);
  });

  it('M3 — « Mesurer » est verrouillé pendant le POST d’une position', async () => {
    await ongletMicro();
    clic('[data-multi="commencer"]');
    await jusqua(() => !!q('[data-multi-role="session"]'));
    let liberer!: () => void;
    vi.mocked(dialogs.confirm).mockImplementationOnce(() => new Promise((r) => { liberer = () => r(true); }));
    clic(`${ligne('session', 0)} button[data-multi="mesurer"]`);
    expect((q(`${ligne('session', 1)} button[data-multi="mesurer"]`) as HTMLButtonElement).disabled).toBe(true);
    liberer();
    await jusqua(() => q(ligne('session', 0))?.getAttribute('data-etat') === 'terminee');
  });

  it('M6 — un fichier de plus de 4 Mio est refusé sans être lu', async () => {
    await ongletMicro();
    const lire = vi.fn(async () => '{}');
    const input = q('input[data-multi="importer"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'gros.json', size: 5 * 1024 * 1024, text: lire }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await jusqua(() => !!q('[data-multi="parcours"] [role="alert"]'));
    expect(q('[data-multi="parcours"] [role="alert"]')!.textContent).toContain(texte('v2.room.multiErrImportTooBig').replace('{mo}', '4'));
    expect(lire).not.toHaveBeenCalled();
    expect(appelsA(`${EXT}/sessions/import`)).toHaveLength(0);
  });

  it('M5 — un document v1 (une seule position) n’offre pas la vérification', async () => {
    sessions.set('s8-1', { id: 's8-1', zone_id: ZONE, positions_prevues: 1, centrale: 0, positions: [],
      importee: { version: 2, id: 's8-1', zone_id: ZONE, positions_prevues: 1, centrale: 0, positions: [{ index: 0, mesure_id: 'm0', resultat: resultat(-20) as any }],
        etats: [{ index: 0, mesure_id: 'm0', etat: 'terminee' }],
        moyenne: { positions_retenues: 1, seuil_rejet_db: 6, verdicts: [], freqs_hz: FREQS, db: FREQS.map(() => 0), avertissements: [] } } });
    monte = mount(MesureMultiPositions, { target: cible!, props: {
      zoneId: ZONE, zoneNom: 'Salon', verrouille: false, demande: { entree: 'umik', voie_micro: 0, etalonnage: null },
      application: 'repos', erreurDe: () => null, onAppliquer: vi.fn(), onOccupe: vi.fn(), onReinitialiser: vi.fn(),
      memoire: { a: 's8-1', b: null }, onMemoire: vi.fn(),
    } });
    await jusqua(() => !!q('[data-multi="moyenne"]'));
    expect(q('[data-multi="verifier"]')).toBeNull();
  });
});
