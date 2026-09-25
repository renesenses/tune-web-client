// @vitest-environment jsdom
//
// Greffon « Playlists converter » (tune-server-rust#4715) branché dans le
// gestionnaire de playlists — Bertrand, GO du 24/09/2026.
//
// 🔴 CES GARDES REGARDENT LE RENDU ET LE RÉSEAU, PAS LE FICHIER. On monte
// l'écran (ou l'onglet), on clique, et on lit ce qui est peint et ce qui est
// PARTI vers le serveur. Les règles tenues :
//
//   1. Sans greffon chargé, aucun onglet du greffon ; avec, les trois.
//   2. Aucun transfert ne part sans aperçu affiché ET accord coché.
//   3. Un retour en arrière montre ce que Tune ne supprime pas
//      (`a_retirer_par_vous`) et l'`avertissement` du greffon.
//   4. Un 409 `apercu_requis` à la première synchro ouvre l'aperçu.
//   5. Supprimer un lien n'appelle AUCUNE route de playlist.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import TransfertsConvertisseur from '../../components/v2-heritage/convertisseur/TransfertsConvertisseur.svelte';
import SnapshotsConvertisseur from '../../components/v2-heritage/convertisseur/SnapshotsConvertisseur.svelte';
import LiensConvertisseur from '../../components/v2-heritage/convertisseur/LiensConvertisseur.svelte';
import { locale } from '../i18n';
import { fr } from './onzeDictionnaires';
import {
  playlists,
  playlistsLoaded,
  pendingPlaylistId,
  streamingPlaylistsCache,
  streamingPlaylistsLoaded,
} from '../stores/playlists';
import { currentProfileId } from '../stores/profile';
import { licenseState } from '../stores/license';
import { convertisseurGreffon } from '../stores/convertisseurPlaylists';
import { dialogs } from '../stores/dialogs';
import { codeConvertisseur } from '../convertisseurPlaylists';

// Monter la vue de 4 000 lignes compile beaucoup : un délai court donnerait
// un rouge de CHARGE, pas de contenu.
vi.setConfig({ testTimeout: 60_000 });

const F = fr as Record<string, string>;
const PREFIXE = '/plugins/playlists-converter';

type Appel = { url: string; methode: string; corps: unknown };
let appels: Appel[] = [];
/** Réponses du faux serveur : `(url, méthode, corps) → [statut, corps]`, ou `undefined` pour le repli. */
let routeur: (url: string, methode: string, corps: unknown) => [number, unknown] | undefined = () => undefined;

function repli(url: string): unknown {
  if (/\/playlists(\?|$)/.test(url)) return [{ id: 42, name: 'Nocturnes', track_count: 1 }];
  if (url.includes('/streaming/services')) return {};
  return [];
}

function installerFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: string, init?: RequestInit) => {
      const url = String(entree);
      const methode = (init?.method ?? 'GET').toUpperCase();
      let corps: unknown = null;
      try { corps = init?.body ? JSON.parse(String(init.body)) : null; } catch { corps = init?.body; }
      appels.push({ url, methode, corps });
      const [statut, reponse] = routeur(url, methode, corps) ?? [200, repli(url)];
      const texte = JSON.stringify(reponse);
      return {
        ok: statut >= 200 && statut < 300,
        status: statut,
        statusText: String(statut),
        headers: new Map([['content-type', 'application/json']]),
        json: async () => JSON.parse(texte),
        text: async () => texte,
      } as unknown as Response;
    }),
  );
}

const appelsDuGreffon = (suffixe: string) => appels.filter((a) => a.url.includes(`${PREFIXE}${suffixe}`));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 4) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function monter(composant: any, props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props });
  flushSync();
  await souffler();
  return hote;
}

function choisir(racine: HTMLElement, selecteur: string, valeur: string) {
  const s = racine.querySelector<HTMLSelectElement>(selecteur);
  expect(s, `${selecteur} absent`).not.toBeNull();
  s!.value = valeur;
  s!.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

function cocher(el: HTMLInputElement | null) {
  expect(el).not.toBeNull();
  el!.checked = true;
  el!.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

const PROPS = {
  localPlaylists: [{ id: 42, name: 'Nocturnes', track_count: 1 }],
  streamingPlaylists: {
    qobuz: [{ source_id: 'q-1', name: 'Jazz du soir', track_count: 3, duration_ms: 0, source: 'qobuz' }],
    tidal: [{ source_id: 't-9', name: 'Matin', track_count: 2, duration_ms: 0, source: 'tidal' }],
  },
};

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  appels = [];
  routeur = () => undefined;
  licenseState.update((s) => ({ ...s, tier: 'premium' }));
  convertisseurGreffon.set(null);
  localStorage.clear();
  locale.set('fr');
  pendingPlaylistId.set(null);
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal(
    'WebSocket',
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    } as unknown as typeof WebSocket,
  );
  installerFetch();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  convertisseurGreffon.set(null);
  locale.set('fr');
  pendingPlaylistId.set(null);
  currentProfileId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Gestionnaire de playlists : les onglets du greffon Playlists converter', () => {
  const ONGLETS = ['conv-transferts', 'conv-snapshots', 'conv-synchro'];
  const greffon = (etat: Record<string, unknown>) => (url: string) =>
    /\/plugins$/.test(url) ? ([200, [{ name: 'playlists-converter', type: 'wasm', installed: true, ...etat }]] as [number, unknown]) : undefined;

  it('🔴 sans greffon, aucun onglet du greffon (la rangée reste réduite à Playlists)', async () => {
    routeur = (url) => (/\/plugins$/.test(url) ? [200, [{ name: 'bandcamp', enabled: true }]] : undefined);
    const el = await monter(PlaylistManagerView, { onAddToPlaylist: () => {} });
    await souffler(4);
    expect(appels.some((a) => /\/plugins$/.test(a.url)), "la liste des greffons n'a pas été lue").toBe(true);
    for (const o of ONGLETS) expect(el.querySelector(`button.pm-tab[data-onglet="${o}"]`), o).toBeNull();
  });

  it('🔴 installé mais pas CHARGÉ (redémarrage attendu) : toujours masqué', async () => {
    routeur = greffon({ enabled: true, loaded: false, restart_required: true });
    const el = await monter(PlaylistManagerView, { onAddToPlaylist: () => {} });
    await souffler(4);
    for (const o of ONGLETS) expect(el.querySelector(`button.pm-tab[data-onglet="${o}"]`), o).toBeNull();
  });

  it('🔴 greffon installé, activé et chargé : Transferts, Snapshots et Synchro apparaissent', async () => {
    routeur = greffon({ enabled: true, loaded: true });
    const el = await monter(PlaylistManagerView, { onAddToPlaylist: () => {} });
    await souffler(4);
    const libelles = [...el.querySelectorAll<HTMLButtonElement>('button.pm-tab')].map((b) => b.textContent?.trim());
    expect(libelles).toContain(F['plconv.ongletTransferts']);
    expect(libelles).toContain(F['plconv.ongletSnapshots']);
    expect(libelles).toContain(F['plconv.ongletSynchro']);
    // Sauvegarde et Collaboratives ne reviennent PAS avec le greffon.
    expect(libelles).not.toContain(F['playlistManager.tabBackup']);
    expect(libelles).not.toContain(F['playlistManager.tabCollab']);
    // Et l'onglet ouvre bien le panneau du greffon.
    el.querySelector<HTMLButtonElement>('button.pm-tab[data-onglet="conv-synchro"]')!.click();
    await souffler(4);
    expect(el.querySelector('[data-onglet="conv-synchro"].conv')).not.toBeNull();
    expect(appelsDuGreffon('/liens').length).toBeGreaterThan(0);
  });
});

describe('Transferts : aucun versement sans aperçu accepté', () => {
  const LOT = {
    resume: { lot_id: 'lot-1', etat: 'apercu', playlists: 1, titres: 3, appariees: 2, introuvables: 1, versees: 0 },
    lot: {
      lot_id: 'lot-1',
      source_service: 'qobuz',
      cible_service: 'tidal',
      etat: 'apercu',
      playlists: [
        {
          rang: 0,
          source_playlist_id: 'q-1',
          source_nom: 'Jazz du soir',
          cible_nom: 'Jazz du soir',
          total: 3,
          appariees: [],
          introuvables: [
            { source_titre: 'Remaster', source_artiste: 'Trio', source_duree_ms: 1, raison: { code: 'duree_hors_tolerance', ecart_ms: 9000 } },
          ],
          versees: [],
          etat: 'apercu',
        },
      ],
    },
  };

  it('🔴 le bouton qui verse n’existe pas sans aperçu, reste éteint sans accord, et rien ne part avant', async () => {
    routeur = (url) => {
      if (url.includes(`${PREFIXE}/apercu`)) return [200, LOT];
      if (url.includes(`${PREFIXE}/transfert`)) return [200, { ...LOT, resume: { ...LOT.resume, etat: 'termine', versees: 2 } }];
      if (url.includes(`${PREFIXE}/lots`)) return [200, { count: 0, lots: [] }];
      return undefined;
    };
    const el = await monter(TransfertsConvertisseur, PROPS);

    choisir(el, 'select.conv-source', 'qobuz');
    cocher(el.querySelector<HTMLInputElement>('input[data-playlist="q-1"]'));
    choisir(el, 'select.conv-cible', 'tidal');
    await souffler();
    // Tout est choisi, mais aucun aperçu : pas de bouton pour verser.
    expect(el.querySelector('.conv-verser'), 'bouton de transfert présent SANS aperçu').toBeNull();

    el.querySelector<HTMLButtonElement>('.conv-voir-apercu')!.click();
    await souffler();
    expect(appelsDuGreffon('/apercu')).toHaveLength(1);
    expect(appelsDuGreffon('/apercu')[0].corps).toEqual({ source_service: 'qobuz', cible_service: 'tidal', playlists: ['q-1'] });
    expect(el.textContent).toContain(F['plconv.raison.duree_hors_tolerance']);

    const verser = el.querySelector<HTMLButtonElement>('.conv-verser');
    expect(verser, "l'aperçu ne propose pas de transférer").not.toBeNull();
    expect(verser!.disabled, 'transfert possible sans accord').toBe(true);
    verser!.click();
    await souffler();
    expect(appelsDuGreffon('/transfert'), 'un transfert est parti sans accord').toHaveLength(0);

    cocher(el.querySelector<HTMLInputElement>('.conv-accord-case'));
    expect(el.querySelector<HTMLButtonElement>('.conv-verser')!.disabled).toBe(false);
    el.querySelector<HTMLButtonElement>('.conv-verser')!.click();
    await souffler();
    expect(appelsDuGreffon('/transfert')).toHaveLength(1);
    expect(appelsDuGreffon('/transfert')[0].corps).toEqual({ lot_id: 'lot-1', accord: true });
  });

  it('🔴 changer la sélection après l’aperçu le rend caduc : le bouton disparaît', async () => {
    routeur = (url) => (url.includes(`${PREFIXE}/apercu`) ? [200, LOT] : url.includes('/lots') ? [200, { count: 0, lots: [] }] : undefined);
    const el = await monter(TransfertsConvertisseur, PROPS);
    choisir(el, 'select.conv-source', 'qobuz');
    cocher(el.querySelector<HTMLInputElement>('input[data-playlist="q-1"]'));
    choisir(el, 'select.conv-cible', 'tidal');
    el.querySelector<HTMLButtonElement>('.conv-voir-apercu')!.click();
    await souffler();
    expect(el.querySelector('.conv-verser')).not.toBeNull();
    // Décocher : l'aperçu ne décrit plus la demande.
    const c = el.querySelector<HTMLInputElement>('input[data-playlist="q-1"]')!;
    c.checked = false;
    c.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(el.querySelector('.conv-verser')).toBeNull();
  });

  it('la bibliothèque locale n’est pas proposée comme CIBLE (le greffon la refuse)', async () => {
    const el = await monter(TransfertsConvertisseur, PROPS);
    choisir(el, 'select.conv-source', 'qobuz');
    const cibles = [...el.querySelectorAll<HTMLOptionElement>('select.conv-cible option')].map((o) => o.value);
    expect(cibles).toEqual(['', 'tidal']);
  });
});

describe('Snapshots : le retour en arrière dit ce que Tune ne supprime pas', () => {
  const ENTETE = {
    snapshot_id: 'snap-1-0', service: 'qobuz', playlist_id: 'q-1', nom: 'Jazz du soir',
    pris_le_ms: 1_758_000_000_000, motif: 'avant_transfert:lot-1', total: 2, pages: 1, empreinte: 'x',
  };
  const AVERTISSEMENT = "Les pistes manquantes seront rajoutées en fin de playlist. Tune ne supprime jamais rien chez un service : les 1 piste(s) de « à retirer par vous » sont à retirer vous-même, depuis l'application du service, si vous le souhaitez.";
  const PLAN = {
    plan_id: 'plan-1', snapshot_id: 'snap-1-0', mode: 'completer', service: 'qobuz', playlist_id: 'q-1', nom: 'Jazz du soir',
    calcule_le_ms: 1, etat: 'apercu', a_rajouter_ids: ['a'], a_retirer_par_vous_ids: ['z'], deja_presentes: 1, rajoutees: [],
    avertissement: AVERTISSEMENT,
  };

  it('🔴 aperçu : avertissement + « à retirer vous-même chez le service » ; rien n’est appliqué sans accord', async () => {
    routeur = (url, methode) => {
      if (url.includes(`${PREFIXE}/snapshots?service=qobuz&playlist_id=q-1`)) return [200, { count: 1, snapshots: [ENTETE], retention_par_playlist: 10 }];
      if (url.endsWith(`${PREFIXE}/snapshots`)) {
        return [200, { count: 1, playlists: [{ service: 'qobuz', playlist_id: 'q-1', nom: 'Jazz du soir', snapshots: 1, dernier_le_ms: 1 }], retention_par_playlist: 10 }];
      }
      if (url.includes(`${PREFIXE}/snapshot/restauration/apercu`)) {
        return [200, {
          plan: PLAN,
          a_rajouter: [{ id: 'a', titre: 'Revenante', artiste: 'Trio', duree_ms: 1, isrc: '' }],
          a_retirer_par_vous: [{ id: 'z', titre: 'Intruse', artiste: 'Quartet', duree_ms: 1, isrc: '' }],
        }];
      }
      if (url.includes(`${PREFIXE}/snapshot/restauration`) && methode === 'POST') {
        return [200, { plan: { ...PLAN, etat: 'termine', rajoutees: ['a'] }, a_retirer_par_vous: [{ id: 'z', titre: 'Intruse', artiste: 'Quartet', duree_ms: 1, isrc: '' }] }];
      }
      return undefined;
    };
    const el = await monter(SnapshotsConvertisseur, PROPS);
    el.querySelector<HTMLButtonElement>('.conv-lien-playlist')!.click();
    await souffler();
    expect(el.textContent).toContain(F['plconv.motif.avant_transfert'].replace('{ref}', 'lot-1'));
    el.querySelector<HTMLButtonElement>('.conv-revenir')!.click();
    flushSync();
    el.querySelector<HTMLButtonElement>('.conv-voir-apercu')!.click();
    await souffler();

    const aperçu = appelsDuGreffon('/snapshot/restauration/apercu');
    expect(aperçu).toHaveLength(1);
    expect(aperçu[0].corps).toEqual({ snapshot_id: 'snap-1-0', mode: 'completer' });
    expect(el.querySelector('.conv-avertissement')?.textContent).toContain(AVERTISSEMENT);
    const aRetirer = el.querySelector('.conv-a-retirer');
    expect(aRetirer, '« à retirer par vous » non affiché').not.toBeNull();
    expect(aRetirer!.textContent).toContain('Intruse');
    expect(el.textContent).toContain(F['plconv.snapshots.aRetirerParVous'].replace('{n}', '1'));

    const appliquer = el.querySelector<HTMLButtonElement>('.conv-appliquer')!;
    expect(appliquer.disabled, 'retour en arrière possible sans accord').toBe(true);
    appliquer.click();
    await souffler();
    expect(appels.filter((a) => a.url.endsWith(`${PREFIXE}/snapshot/restauration`))).toHaveLength(0);

    cocher(el.querySelector<HTMLInputElement>('.conv-accord-case'));
    el.querySelector<HTMLButtonElement>('.conv-appliquer')!.click();
    await souffler();
    const fait = appels.filter((a) => a.url.endsWith(`${PREFIXE}/snapshot/restauration`));
    expect(fait).toHaveLength(1);
    expect(fait[0].corps).toEqual({ plan_id: 'plan-1', accord: true });
    // Le compte rendu garde la liste : c'est toujours à l'utilisateur de les retirer.
    expect(el.querySelector('.conv-a-retirer')?.textContent).toContain('Intruse');
  });

  it('le mode « recréer » est proposé et part tel quel', async () => {
    routeur = (url) => {
      if (url.includes('/snapshots?')) return [200, { count: 1, snapshots: [ENTETE], retention_par_playlist: 10 }];
      if (url.endsWith(`${PREFIXE}/snapshots`)) return [200, { count: 1, playlists: [{ service: 'qobuz', playlist_id: 'q-1', nom: 'Jazz du soir', snapshots: 1, dernier_le_ms: 1 }], retention_par_playlist: 10 }];
      if (url.includes('/restauration/apercu')) return [200, { plan: { ...PLAN, mode: 'recreer' }, a_rajouter: [], a_retirer_par_vous: [] }];
      return undefined;
    };
    const el = await monter(SnapshotsConvertisseur, PROPS);
    el.querySelector<HTMLButtonElement>('.conv-lien-playlist')!.click();
    await souffler();
    el.querySelector<HTMLButtonElement>('.conv-revenir')!.click();
    flushSync();
    cocher(el.querySelector<HTMLInputElement>('input[type="radio"][value="recreer"]'));
    el.querySelector<HTMLButtonElement>('.conv-voir-apercu')!.click();
    await souffler();
    expect(appelsDuGreffon('/snapshot/restauration/apercu')[0].corps).toEqual({ snapshot_id: 'snap-1-0', mode: 'recreer' });
  });
});

describe('Synchro : liens auto-sync', () => {
  const LIEN = {
    lien_id: 'lien-1',
    a: { service: 'qobuz', playlist_id: 'q-1', nom: 'Jazz du soir' },
    b: { service: 'local', playlist_id: '42', nom: 'Nocturnes' },
    sens: 'a_vers_b', cadence_minutes: 0, etat: 'attente_premier_apercu', premiere_synchro_faite: false,
    cree_le_ms: 1, journal_compteur: 0,
  };
  const PLAN = {
    lien_id: 'lien-1', calcule_le_ms: 1,
    ajouts: [{ de: 'a', vers: 'b', source_id: 'x', titre: 'Nouvelle', artiste: 'Trio', cible_id: '7' }],
    introuvables: [], disparues: [{ disparue_de: 'a', id_disparu: 'd', toujours_dans: 'b', id_restant: '8', titre: 'Partie', artiste: 'Duo' }],
    deja_presentes: 3, introuvables_connues: 0,
  };
  const ENTREE = {
    numero: 1, quand_ms: 2, declencheur: 'premiere', statut: 'ok', ajoutees: 1, ajouts: [], introuvables: 0,
    introuvables_detail: [], disparues_signalees: [], echecs: [], snapshots: ['snap-1-0'],
  };

  it('🔴 409 `apercu_requis` à la première synchro : l’aperçu s’ouvre, puis l’accord part', async () => {
    routeur = (url, _m, corps) => {
      if (url.endsWith(`${PREFIXE}/liens`)) return [200, { count: 1, liens: [LIEN] }];
      if (url.includes(`${PREFIXE}/lien/synchroniser`)) {
        if ((corps as { accord?: boolean })?.accord === true) {
          return [200, { lien: { ...LIEN, etat: 'actif', premiere_synchro_faite: true }, entree: ENTREE }];
        }
        return [409, { error: "apercu_requis : la première synchronisation du lien lien-1 exige un aperçu" }];
      }
      if (url.includes(`${PREFIXE}/lien/apercu`)) return [200, { plan: PLAN }];
      return undefined;
    };
    const el = await monter(LiensConvertisseur, PROPS);
    expect(el.textContent).toContain(F['plconv.lienEtat.attente_premier_apercu']);
    el.querySelector<HTMLButtonElement>('.conv-synchroniser')!.click();
    await souffler(6);

    expect(appelsDuGreffon('/lien/synchroniser')).toHaveLength(1);
    expect(appelsDuGreffon('/lien/apercu'), "l'aperçu n'a pas été demandé après le 409").toHaveLength(1);
    const panneau = el.querySelector('.conv-apercu-lien');
    expect(panneau, "l'aperçu ne s'est pas ouvert").not.toBeNull();
    expect(panneau!.textContent).toContain('Nouvelle');
    // Les pistes disparues sont SIGNALÉES, avec la consigne « à retirer vous-même ».
    expect(panneau!.textContent).toContain(F['plconv.liens.disparues'].replace('{n}', '1'));
    // Le 409 est le parcours, pas une panne : pas de bandeau d'erreur.
    expect(el.querySelector('.conv-erreur[role="alert"]')).toBeNull();

    const accepter = el.querySelector<HTMLButtonElement>('.conv-accepter')!;
    expect(accepter.disabled).toBe(true);
    cocher(el.querySelector<HTMLInputElement>('.conv-accord-case'));
    el.querySelector<HTMLButtonElement>('.conv-accepter')!.click();
    await souffler();
    const synchros = appelsDuGreffon('/lien/synchroniser');
    expect(synchros).toHaveLength(2);
    expect(synchros[1].corps).toEqual({ lien_id: 'lien-1', accord: true });
    expect(el.querySelector('.conv-apercu-lien')).toBeNull();
    expect(el.textContent).toContain(F['plconv.lienEtat.actif']);
  });

  it('🔴 supprimer un lien n’appelle AUCUNE route de playlist, et la confirmation le dit', async () => {
    routeur = (url) => {
      if (url.endsWith(`${PREFIXE}/liens`)) return [200, { count: 1, liens: [{ ...LIEN, etat: 'actif', premiere_synchro_faite: true }] }];
      if (url.includes(`${PREFIXE}/lien/supprimer`)) return [200, { lien_id: 'lien-1', supprime: true, playlists_touchees: false }];
      return undefined;
    };
    const confirmer = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    const el = await monter(LiensConvertisseur, PROPS);
    const avant = appels.length;
    el.querySelector<HTMLButtonElement>('.conv-supprimer')!.click();
    await souffler(6);

    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(confirmer.mock.calls[0][0]).toBe(F['plconv.liens.confirmerSuppression']);
    const partis = appels.slice(avant);
    expect(partis.map((a) => `${a.methode} ${a.url}`)).toEqual([`POST /api/v1${PREFIXE}/lien/supprimer`]);
    expect(partis[0].corps).toEqual({ lien_id: 'lien-1' });
    expect(partis.some((a) => a.methode === 'DELETE')).toBe(false);
    expect(el.querySelector('[data-lien="lien-1"]')).toBeNull();
  });

  it('refuser la confirmation ne supprime rien', async () => {
    routeur = (url) => (url.endsWith(`${PREFIXE}/liens`) ? [200, { count: 1, liens: [LIEN] }] : undefined);
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    const el = await monter(LiensConvertisseur, PROPS);
    el.querySelector<HTMLButtonElement>('.conv-supprimer')!.click();
    await souffler();
    expect(appelsDuGreffon('/lien/supprimer')).toHaveLength(0);
    expect(el.querySelector('[data-lien="lien-1"]')).not.toBeNull();
  });

  it('créer un lien service ↔ bibliothèque envoie les deux extrémités, le sens et la cadence', async () => {
    routeur = (url) => {
      if (url.endsWith(`${PREFIXE}/liens`)) return [200, { count: 0, liens: [], lien: LIEN }];
      return undefined;
    };
    const el = await monter(LiensConvertisseur, PROPS);
    choisir(el, 'select.conv-a-service', 'qobuz');
    choisir(el, 'select.conv-a-playlist', 'q-1');
    choisir(el, 'select.conv-b-service', 'local');
    choisir(el, 'select.conv-b-playlist', '42');
    choisir(el, 'select.conv-sens', 'deux_sens');
    choisir(el, 'select.conv-cadence', '1440');
    el.querySelector<HTMLButtonElement>('.conv-creer')!.click();
    await souffler();
    const creation = appels.find((a) => a.methode === 'POST' && a.url.endsWith(`${PREFIXE}/liens`));
    expect(creation?.corps).toEqual({
      a: { service: 'qobuz', playlist_id: 'q-1', nom: 'Jazz du soir' },
      b: { service: 'local', playlist_id: '42', nom: 'Nocturnes' },
      sens: 'deux_sens',
      cadence_minutes: 1440,
    });
  });
});

describe('codeConvertisseur : le code est le préfixe de la phrase du greffon', () => {
  it('lit le code depuis `code` (apiError y range `body.error`) puis depuis le message', () => {
    expect(codeConvertisseur({ code: 'apercu_requis : la première synchronisation…' })).toBe('apercu_requis');
    expect(codeConvertisseur(new Error('accord_requis : rien n’est écrit'))).toBe('accord_requis');
    expect(codeConvertisseur(new Error('Server error'))).toBeNull();
    expect(codeConvertisseur(null)).toBeNull();
  });
});
