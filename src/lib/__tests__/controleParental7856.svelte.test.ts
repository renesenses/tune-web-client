// @vitest-environment jsdom
// Contrôle parental, étape 1 (tune-server-rust#7856, routes #7898) : l'écran
// qui pose, montre et retire les règles d'un profil, dans Réglages › Profils.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PolitiqueParentaleV2 from '../../components/v2/PolitiqueParentaleV2.svelte';
import ProfilsV2 from '../../components/v2/ProfilsV2.svelte';
import { locale } from '../i18n';
import { profiles, currentProfileId } from '../stores/profile';
import { dialogs } from '../stores/dialogs';
import {
  artistesDepuisLignes, cleErreur, lignes, ligneArtiste, peutSuperviser,
} from '../politiqueParentale';

const ENFANT = { id: 2, name: 'lea', display_name: 'Léa', avatar_color: '#10b981', is_admin: false };
const ADMIN = { id: 1, name: 'papa', display_name: 'Papa', avatar_color: '#6366f1', is_admin: true };

const posee = (extra: Record<string, unknown> = {}) => ({
  profile_id: 2, superviseur_id: 1, revision: 3, maj_le: '2026-11-07T10:00:00Z',
  politique: {
    artistes_bloques: [{ id: 7, nom: 'Groupe Interdit' }, { id: 9 }],
    radios_autorisees: ['http://radio.test/flux'],
    podcasts_autorises: null,
    plages_horaires: [{ jours: [1, 2], debut: '18:00', fin: '20:00' }],
    budget_quotidien_minutes: 90,
    ...extra,
  },
});

type Appel = { route: string; methode: string; corps: any; profil: string | null };
let appels: Appel[];
let serveur: (a: Appel) => { statut: number; corps?: unknown };
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

async function stabiliser() {
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
function saisir(el: HTMLTextAreaElement, v: string) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); flushSync(); }

beforeEach(() => {
  locale.set('fr'); appels = [];
  // Hors politique, les autres routes de la page (favoris…) répondent par une liste vide.
  serveur = (a) => a.route.includes('politique-parentale')
    ? { statut: 404, corps: { error: 'politique_parentale_absente' } } : { statut: 200, corps: [] };
  hote = document.createElement('div'); document.body.appendChild(hote);
  localStorage.setItem('tune-profile-id', '1');
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const u = new URL(String(url), window.location.href);
    const h = new Headers(options?.headers as HeadersInit);
    const a: Appel = {
      route: u.pathname + u.search, methode: options?.method ?? 'GET',
      corps: options?.body ? JSON.parse(String(options.body)) : null, profil: h.get('X-Profile-Id'),
    };
    appels.push(a);
    const r = serveur(a);
    return new Response(r.statut === 204 ? null : JSON.stringify(r.corps ?? {}), {
      status: r.statut, headers: { 'Content-Type': 'application/json' },
    });
  }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); vi.unstubAllGlobals(); localStorage.clear();
});

async function monter(props = { profil: ENFANT as any }) {
  composant = mount(PolitiqueParentaleV2, { target: hote, props });
  flushSync(); await stabiliser();
}

describe('contrôle parental — l’appel API', () => {
  it('lit la politique du profil visé, avec l’identité de l’administrateur', async () => {
    await monter();
    expect(appels[0]).toMatchObject({ methode: 'GET', route: '/api/v1/profiles/2/politique-parentale', profil: '1' });
  });

  it('crée à la révision 0, et envoie nom, listes blanches et rien d’autre d’inventé', async () => {
    await monter();
    saisir(q<HTMLTextAreaElement>('[data-parental-artistes]'), ' Groupe Interdit \n\n#42\nGroupe Interdit');
    q<HTMLInputElement>('[data-parental-radios-restreintes]').click(); flushSync();
    saisir(q<HTMLTextAreaElement>('[data-parental-radios]'), 'http://radio.test/flux');
    serveur = (a) => a.methode === 'PUT' ? { statut: 200, corps: { ...posee(), revision: 1 } } : { statut: 404 };
    q('[data-parental-enregistrer]').click(); await stabiliser();
    const put = appels.find((a) => a.methode === 'PUT')!;
    expect(put.route).toBe('/api/v1/profiles/2/politique-parentale');
    expect(put.corps).toEqual({
      revision: 0,
      politique: {
        artistes_bloques: [{ nom: 'Groupe Interdit' }, { id: 42 }],
        radios_autorisees: ['http://radio.test/flux'],
        podcasts_autorises: null,
      },
    });
    expect(q('[data-parental-message]').textContent).toContain('Règles enregistrées');
  });

  it('remplace à la révision lue ET renvoie plages et budgets de l’étape 2 sans les perdre', async () => {
    serveur = (a) => a.methode === 'GET' ? { statut: 200, corps: posee() } : { statut: 200, corps: { ...posee(), revision: 4 } };
    await monter();
    saisir(q<HTMLTextAreaElement>('[data-parental-artistes]'), 'Groupe Interdit');
    q('[data-parental-enregistrer]').click(); await stabiliser();
    const put = appels.find((a) => a.methode === 'PUT')!;
    expect(put.corps.revision).toBe(3);
    expect(put.corps.politique.plages_horaires).toEqual([{ jours: [1, 2], debut: '18:00', fin: '20:00' }]);
    expect(put.corps.politique.budget_quotidien_minutes).toBe(90);
    // L'identifiant d'un artiste déjà posé survit à la réécriture de sa ligne.
    expect(put.corps.politique.artistes_bloques).toEqual([{ id: 7, nom: 'Groupe Interdit' }]);
  });

  it('retire à la révision lue, après confirmation, et revient à l’état vide', async () => {
    serveur = (a) => a.methode === 'GET' ? { statut: 200, corps: posee() } : { statut: 204 };
    await monter();
    const confirm = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    q('[data-parental-retirer]').click(); await stabiliser();
    expect(confirm).toHaveBeenCalled();
    const del = appels.find((a) => a.methode === 'DELETE')!;
    expect(del.route).toBe('/api/v1/profiles/2/politique-parentale?revision=3');
    expect(q('[data-parental-etat]').textContent).toContain('Aucune règle posée');
    expect(document.querySelector('[data-parental-retirer]')).toBeNull();
  });

  it('annuler la confirmation ne retire rien', async () => {
    serveur = () => ({ statut: 200, corps: posee() });
    await monter();
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    q('[data-parental-retirer]').click(); await stabiliser();
    expect(appels.some((a) => a.methode === 'DELETE')).toBe(false);
  });
});

describe('contrôle parental — l’affichage', () => {
  it('état vide : dit que rien ne change pour le profil et propose de poser', async () => {
    await monter();
    expect(q('[data-parental-etat]').textContent).toContain('Aucune règle posée');
    expect(q('[data-parental-enregistrer]').textContent).toContain('Poser les règles');
    expect(document.querySelector('[data-parental-retirer]')).toBeNull();
    expect(q<HTMLTextAreaElement>('[data-parental-artistes]').value).toBe('');
  });

  it('montre les règles posées : artistes (nom ou #id), liste blanche, note sur l’étape 2', async () => {
    serveur = () => ({ statut: 200, corps: posee() });
    await monter();
    expect(q('[data-parental-etat]').textContent).toContain('Des règles sont posées');
    expect(q<HTMLTextAreaElement>('[data-parental-artistes]').value).toBe('Groupe Interdit\n#9');
    expect(q<HTMLInputElement>('[data-parental-radios-restreintes]').checked).toBe(true);
    expect(q<HTMLTextAreaElement>('[data-parental-radios]').value).toBe('http://radio.test/flux');
    expect(q<HTMLInputElement>('[data-parental-podcasts-restreints]').checked).toBe(false);
    expect(q('[data-parental-etape2]').textContent).toContain('s’appliquent');
    expect(q('[data-parental-retirer]')).not.toBeNull();
  });

  it('une liste blanche vide est signalée : le profil ne verrait rien', async () => {
    await monter();
    q<HTMLInputElement>('[data-parental-podcasts-restreints]').click(); flushSync();
    expect(q('[data-parental]').textContent).toContain('ne verra aucun élément');
  });
});

describe('contrôle parental — les erreurs', () => {
  it.each([
    [403, { error: 'politique_parentale_reservee_au_superviseur' }, 'administrateur ou le superviseur'],
    [422, { error: 'profil_administrateur_non_supervisable' }, 'administrateur ne se place pas sous supervision'],
    [422, { error: 'plage_horaire_vide' }, 'après l’heure de début'],
    [422, { error: 'regle_inconnue' }, 'refusées par le serveur'],
    [500, { error: 'politique_parentale_indisponible' }, 'n’ont pas pu être lues ou enregistrées'],
  ])('écriture refusée en %i (%j) : message traduit, jamais le code machine', async (statut, corps, attendu) => {
    await monter();
    serveur = (a) => a.methode === 'PUT' ? { statut, corps } : { statut: 404, corps: { error: 'politique_parentale_absente' } };
    q('[data-parental-enregistrer]').click(); await stabiliser();
    const e = q('[data-parental-erreur]').textContent!;
    expect(e).toContain(attendu);
    expect(e).not.toContain('politique_parentale');
  });

  it('409 révision périmée : dit pourquoi ET relit les règles du serveur', async () => {
    await monter();
    let lectures = 0;
    serveur = (a) => {
      if (a.methode === 'PUT') return { statut: 409, corps: { error: 'revision_perimee' } };
      lectures++; return { statut: 200, corps: posee({ budget_quotidien_minutes: 30 }) };
    };
    q('[data-parental-enregistrer]').click(); await stabiliser();
    expect(lectures).toBe(1);
    expect(q('[data-parental-erreur]').textContent).toContain('modifiées entre-temps');
    expect(q<HTMLTextAreaElement>('[data-parental-artistes]').value).toBe('Groupe Interdit\n#9');
  });

  it('lecture refusée (403) : message et bouton Réessayer', async () => {
    serveur = () => ({ statut: 403, corps: { error: 'politique_parentale_reservee_au_superviseur' } });
    await monter();
    expect(q('[data-parental-erreur]').textContent).toContain('administrateur ou le superviseur');
    serveur = () => ({ statut: 200, corps: posee() });
    q<HTMLButtonElement>('.lnk').click(); await stabiliser();
    expect(q('[data-parental-etat]').textContent).toContain('Des règles sont posées');
  });
});

describe('contrôle parental — où ça se voit (Réglages › Profils)', () => {
  async function ouvrirProfils(actifId: number, liste: any[]) {
    profiles.set(liste); currentProfileId.set(actifId);
    composant = mount(ProfilsV2, { target: hote });
    flushSync(); await stabiliser();
  }

  it('un administrateur voit le bouton sur un autre profil, pas sur le sien ni sur un administrateur', async () => {
    await ouvrirProfils(1, [ADMIN, ENFANT, { ...ADMIN, id: 3, name: 'maman' }]);
    expect(document.querySelector('[data-parental-bascule="2"]')).not.toBeNull();
    expect(document.querySelector('[data-parental-bascule="1"]')).toBeNull();
    expect(document.querySelector('[data-parental-bascule="3"]')).toBeNull();
  });

  it('le bouton ouvre la section du profil et lit sa politique', async () => {
    serveur = (a) => a.route.includes('politique-parentale') ? { statut: 200, corps: posee() } : { statut: 200, corps: [] };
    await ouvrirProfils(1, [ADMIN, ENFANT]);
    q('[data-parental-bascule="2"]').click(); await stabiliser();
    expect(q('[data-parental="2"]')).not.toBeNull();
    expect(appels.some((a) => a.route === '/api/v1/profiles/2/politique-parentale')).toBe(true);
  });

  it('un profil qui n’est pas administrateur ne voit rien, et rien n’est demandé au serveur', async () => {
    await ouvrirProfils(2, [ADMIN, ENFANT]);
    expect(document.querySelector('[data-parental-bascule]')).toBeNull();
    expect(appels.some((a) => a.route.includes('politique-parentale'))).toBe(false);
  });
});

describe('contrôle parental — les aides', () => {
  it('peutSuperviser : administrateur, autre profil, non administrateur', () => {
    expect(peutSuperviser(ADMIN, ENFANT)).toBe(true);
    expect(peutSuperviser(ADMIN, ADMIN)).toBe(false);
    expect(peutSuperviser(ENFANT, ADMIN)).toBe(false);
    expect(peutSuperviser(undefined, ENFANT)).toBe(false);
    expect(peutSuperviser({ id: 1 }, ENFANT)).toBe(false);
  });
  it('lignes : rognées, sans vides ni doublons', () => {
    expect(lignes(' a \r\n\nb\na\n')).toEqual(['a', 'b']);
  });
  it('artistes : reprend l’existant (id compris), #n = identifiant seul, sinon un nom', () => {
    const ex = [{ id: 7, nom: 'The  Doors' }];
    expect(artistesDepuisLignes('the doors\n#5\nQueen', ex)).toEqual([ex[0], { id: 5 }, { nom: 'Queen' }]);
    expect(ligneArtiste({ id: 9 })).toBe('#9');
  });
  it('cleErreur : un statut, un code, une phrase', () => {
    expect(cleErreur({ status: 409 })).toBe('parental.err.stale');
    expect(cleErreur({ status: 422, code: 'politique_trop_longue' })).toBe('parental.err.tooLong');
    expect(cleErreur(new Error('x'))).toBe('parental.err.generic');
  });
});
