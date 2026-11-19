// @vitest-environment jsdom
// web#3270 (tune-server-rust#9166, go de Bertrand du 19/11/2026) — « Ma
// collection physique » : un disque déjà rapproché d'un album de service
// garde « Chercher sur les services », sous le libellé « Changer la
// correspondance ». La fenêtre relance la recherche, met la correspondance
// actuelle en évidence, la REMPLACE par un autre résultat ou la RETIRE
// (après confirmation).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CorrespondanceServicesModale from '../../components/v2/CorrespondanceServicesModale.svelte';
import CollectionPhysiqueV2 from '../../components/v2/CollectionPhysiqueV2.svelte';
import {
  aUneCorrespondance, cleBoutonRecherche, cleErreur, collectionPhysiquePlugin, correspondanceACorriger,
  estCorrespondanceActuelle, peutChercherSurLesServices, raisonDuDisque, RAISONS,
  type Disque, type PropositionService,
} from '../collectionPhysique';
import { dialogs } from '../stores/dialogs';
import { activeView } from '../stores/navigation';
import { ficheAlbumService } from '../stores/streaming';
import { detailOuvert } from '../historiqueCoquille';
import { locale, preparerLocale } from '../i18n';
import fr from '../locales/fr';
import * as dictionnaires from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function souffler(n = 20) {
  for (let i = 0; i < n; i++) { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

const T42 = { service: 'tidal', id: 'T-42', titre: 'Giving My Love', artiste: 'Janice McClain', par: 'artiste_titre' as const };

function disque(p: Partial<Disque> = {}): Disque {
  return {
    instance_id: 5, release_id: 1050, artiste: 'Janice McClain', titre: 'Giving My Love / Brazil',
    annee: 1979, labels: [], numeros_catalogue: [], formats: ['Vinyl'], precisions: [],
    format: 'vinyle', lien_discogs: 'https://www.discogs.com/release/1050', pochette: false,
    bibliotheque: null, streaming: [T42], etat: 'streaming', copie: null, proposer_extraction: false,
    ...p,
  };
}

function prop(service: string, id: string, p: Partial<PropositionService> = {}): PropositionService {
  return { service, id, titre: `Album ${id}`, artiste: 'Janice McClain', par: 'artiste_titre', score: 80, exact: false, ...p };
}

const PROPOSITIONS = [prop('tidal', 'T-42', { exact: true, score: 100 }), prop('tidal', 'T-99'), prop('qobuz', 'Q-1')];
const REMPLACE = disque({ streaming: [{ service: 'tidal', id: 'T-99', titre: 'Album T-99', artiste: 'Janice McClain', par: 'manuel' }] });
const RETIRE = disque({ streaming: [], streaming_retires: ['tidal'], etat: 'nulle_part', raison: 'correspondance_retiree' });

let appels: { methode: string; url: string; corps: unknown }[] = [];
let collection: any;
let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Headers({ 'Content-Type': 'application/json' }),
  text: async () => JSON.stringify(corps), json: async () => corps,
}) as unknown as Response;

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  appels = [];
  try { localStorage.clear(); } catch { /* indisponible */ }
  locale.set('fr');
  ficheAlbumService.set(null);
  detailOuvert.set(null);
  collectionPhysiquePlugin.set(null);
  collection = {
    statut: 'ok', nom_utilisateur: 'exemple',
    compteurs: { total: 2, par_etat: { bibliotheque: 0, streaming: 1, nulle_part: 1, a_verifier: 0 } },
    disques: [disque(), disque({ instance_id: 6, release_id: 7, titre: 'Inconnu', streaming: [], etat: 'nulle_part', raison: 'aucun_candidat' })],
  };
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const methode = (init?.method ?? 'GET').toUpperCase();
    appels.push({ methode, url, corps: init?.body ? JSON.parse(String(init.body)) : null });
    if (methode === 'GET' && /\/disques\/1050\/services$/.test(url)) {
      const meilleure = PROPOSITIONS[0];
      return reponse({ release_id: 1050, services: ['qobuz', 'tidal'], sans_reponse: [], meilleure, propositions: PROPOSITIONS });
    }
    if (methode === 'PUT' && /\/disques\/1050\/streaming$/.test(url)) return reponse({ disque: REMPLACE });
    if (methode === 'DELETE' && /\/disques\/1050\/streaming\/tidal$/.test(url)) return reponse({ disque: RETIRE });
    if (url.includes('/ext/collection-physique/reglages')) return reponse({ nom_utilisateur: 'exemple', jeton: 'personnel' });
    if (url.includes('/ext/collection-physique/etat')) {
      return reponse({ nom_utilisateur: 'exemple', avancement: { en_cours: false, etape: null, fait: 0, total: 0 },
        disques: 2, tronquee: false, liste_lue_le: Math.floor(Date.now() / 1000), derniere_synchro: 1793361925,
        derniere_erreur: null, affinage_musicbrainz: { en_cours: false, restants: 0 } });
    }
    if (url.includes('/ext/collection-physique/collection')) return reponse(collection);
    return reponse([]);
  }));
  hote = document.createElement('div');
  document.body.append(hote);
  activeView.set('collectionphysique');
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } }
  monte = null;
  hote.remove();
  document.querySelectorAll('[data-correspondance-services]').forEach((e) => e.closest('.fond')?.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('web#3270 — quand et sous quel libellé la recherche s’offre', () => {
  it('« Changer la correspondance » sur un disque rapproché, « Chercher à nouveau » après un retrait', () => {
    expect(peutChercherSurLesServices(disque())).toBe(true);
    expect(aUneCorrespondance(disque())).toBe(true);
    expect(correspondanceACorriger(disque())).toBe(true);
    expect(cleBoutonRecherche(disque())).toBe('collectionPhysique.correspondance.changer');
    expect(cleBoutonRecherche(RETIRE)).toBe('collectionPhysique.correspondance.chercherANouveau');
    expect(correspondanceACorriger(RETIRE)).toBe(true);
    // Contre-épreuve : un disque jamais rapproché garde la recherche en ligne.
    const jamais = disque({ streaming: [], etat: 'nulle_part' });
    expect(correspondanceACorriger(jamais)).toBe(false);
    expect(cleBoutonRecherche(jamais)).toBe('collectionPhysique.recherche.bouton');
  });

  it('la correspondance actuelle se reconnaît par service ET identifiant', () => {
    expect(estCorrespondanceActuelle(disque(), prop('tidal', 'T-42'))).toBe(true);
    expect(estCorrespondanceActuelle(disque(), prop('tidal', 'T-99'))).toBe(false);
    expect(estCorrespondanceActuelle(disque(), prop('qobuz', 'T-42'))).toBe(false);
  });

  it('la raison « retirée à la main » se dit', () => {
    expect(RAISONS).toContain('correspondance_retiree');
    expect(raisonDuDisque(RETIRE)).toEqual({ cle: 'collectionPhysique.raison.correspondance_retiree', n: null });
  });
});

describe('web#3270 — la fenêtre « Correspondance sur les services »', () => {
  it('🔴 relance la recherche et met la correspondance actuelle en évidence', async () => {
    monte = mount(CorrespondanceServicesModale, { target: hote, props: { disque: disque(), onClose: () => {}, onChange: () => {} } });
    await souffler();
    expect(appels[0].url).toMatch(/\/ext\/collection-physique\/disques\/1050\/services$/);
    expect(document.querySelector('[data-correspondance-actuelle="tidal"]')?.textContent).toContain('Giving My Love');
    const lignes = [...document.querySelectorAll('[data-propositions] [data-proposition]')];
    expect(lignes.map((l) => l.getAttribute('data-proposition'))).toEqual(['tidal:T-42', 'tidal:T-99', 'qobuz:Q-1']);
    const actuelle = document.querySelector('[data-proposition="tidal:T-42"]')!;
    expect(actuelle.classList.contains('actuelle')).toBe(true);
    expect(actuelle.querySelector('[data-marque-actuelle]')?.textContent).toBe(fr['collectionPhysique.correspondance.marqueActuelle']);
    expect(actuelle.querySelector('[data-remplacer]'), 'on ne remplace pas une correspondance par elle-même').toBeNull();
    expect(document.querySelector('[data-remplacer="tidal:T-99"]')?.textContent?.trim()).toBe(fr['collectionPhysique.correspondance.remplacer']);
    // Qobuz n'a pas de correspondance : « Choisir », pas « Remplacer ».
    expect(document.querySelector('[data-remplacer="qobuz:Q-1"]')?.textContent?.trim()).toBe(fr['collectionPhysique.correspondance.choisir']);

    document.querySelector<HTMLButtonElement>('[data-chercher-a-nouveau]')!.click();
    await souffler();
    expect(appels.filter((a) => a.url.endsWith('/disques/1050/services'))).toHaveLength(2);
  });

  it('🔴 « Remplacer » envoie le résultat choisi et rend le disque relu', async () => {
    const recus: Disque[] = [];
    monte = mount(CorrespondanceServicesModale, { target: hote, props: { disque: disque(), onClose: () => {}, onChange: (d: Disque) => recus.push(d) } });
    await souffler();
    document.querySelector<HTMLButtonElement>('[data-remplacer="tidal:T-99"]')!.click();
    await souffler();
    const put = appels.find((a) => a.methode === 'PUT')!;
    expect(put.url).toMatch(/\/disques\/1050\/streaming$/);
    expect(put.corps).toEqual({ service: 'tidal', id: 'T-99', titre: 'Album T-99', artiste: 'Janice McClain' });
    expect(recus).toEqual([REMPLACE]);
    // La nouvelle correspondance est maintenant l'actuelle.
    expect(document.querySelector('[data-proposition="tidal:T-99"]')!.classList.contains('actuelle')).toBe(true);
    expect(document.querySelector('[data-proposition="tidal:T-42"] [data-remplacer]')).not.toBeNull();
  });

  it('🔴 « Retirer » demande confirmation ; refusée, rien ne part', async () => {
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const recus: Disque[] = [];
    monte = mount(CorrespondanceServicesModale, { target: hote, props: { disque: disque(), onClose: () => {}, onChange: (d: Disque) => recus.push(d) } });
    await souffler();
    document.querySelector<HTMLButtonElement>('[data-retirer-correspondance="tidal"]')!.click();
    await souffler();
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(String(confirmer.mock.calls[0][0])).toContain('TIDAL');
    expect(appels.some((a) => a.methode === 'DELETE')).toBe(false);

    confirmer.mockResolvedValue(true);
    document.querySelector<HTMLButtonElement>('[data-retirer-correspondance="tidal"]')!.click();
    await souffler();
    const del = appels.find((a) => a.methode === 'DELETE')!;
    expect(del.url).toMatch(/\/disques\/1050\/streaming\/tidal$/);
    expect(recus).toEqual([RETIRE]);
    expect(document.querySelector('[data-sans-correspondance]')?.textContent).toBe(fr['collectionPhysique.correspondance.vide']);
  });
});

describe('web#3270 — l’écran monté', () => {
  it('🔴 un disque rapproché montre « Changer la correspondance », qui ouvre la fenêtre', async () => {
    monte = mount(CollectionPhysiqueV2 as any, { target: hote });
    await souffler(40);
    const b = hote.querySelector<HTMLButtonElement>('[data-disque="1050"] [data-changer-correspondance]');
    expect(b, 'pas de bouton sur un disque déjà rapproché').not.toBeNull();
    expect(b!.textContent?.trim()).toBe(fr['collectionPhysique.correspondance.changer']);
    // Contre-épreuve : le disque jamais rapproché garde « Chercher sur les services ».
    expect(hote.querySelector('[data-disque="7"] [data-changer-correspondance]')).toBeNull();
    expect(hote.querySelector('[data-disque="7"] [data-chercher-services]')?.textContent?.trim()).toBe(fr['collectionPhysique.recherche.bouton']);
    b!.click();
    await souffler();
    expect(document.querySelector('[data-correspondance-services="1050"]')).not.toBeNull();
  });
});

describe('web#3270 — i18n', () => {
  it('chaque libellé existe dans les seize langues', () => {
    expect(cleErreur('corps_invalide')).toBe('collectionPhysique.erreur.corps_invalide');
    const cles = Object.keys(fr).filter((k) => k.startsWith('collectionPhysique.correspondance.')
      || /correspondance_retiree$|erreur\.corps_invalide$/.test(k));
    expect(cles.length).toBe(15);
    for (const langue of dictionnaires.ONZE_LANGUES) {
      const dico = (dictionnaires as unknown as Record<string, Record<string, string>>)[langue];
      for (const cle of cles) expect(dico[cle], `${langue} : ${cle}`).toBeTruthy();
      expect(dico['collectionPhysique.correspondance.retirerConfirmer'], langue).toContain('{service}');
      expect(dico['collectionPhysique.correspondance.retirerConfirmer'], langue).toContain('{titre}');
    }
    expect(dictionnaires.ONZE_LANGUES).toContain('tr');
  });
});
