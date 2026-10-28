// @vitest-environment jsdom
// #2306 : traverser la vraie réponse HTTP, le client et les quatre écrans.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AssistantIaReglagesV2 from '../../components/v2/AssistantIaReglagesV2.svelte';
import SuggestionsIaAlbumV2 from '../../components/v2/SuggestionsIaAlbumV2.svelte';
import SuggestionsIaLotV2 from '../../components/v2/SuggestionsIaLotV2.svelte';
import PlaylistParPhraseV2 from '../../components/v2/PlaylistParPhraseV2.svelte';
import { locale } from '../i18n';

const neRienFaire = () => {};
const ecrans = [
  { nom: 'Réglages', composant: AssistantIaReglagesV2, props: {},
    racine: '[data-assistant-ia-reglages]', route: '/reglages', methode: 'GET' },
  { nom: 'Suggestions album', composant: SuggestionsIaAlbumV2,
    props: { albumId: 17, onClose: neRienFaire, onChange: neRienFaire },
    racine: '[data-suggestions-ia]', route: '/albums/17/suggestions', methode: 'POST' },
  { nom: 'Suggestions lot', composant: SuggestionsIaLotV2,
    props: { albumIds: [17, 23], onClose: neRienFaire, onChange: neRienFaire },
    racine: '[data-suggestions-ia-lot]', route: '/lot/suggestions', methode: 'POST' },
  { nom: 'Playlist par phrase', composant: PlaylistParPhraseV2,
    props: { onClose: neRienFaire, onPropose: neRienFaire },
    racine: '[data-playlist-par-phrase]', route: '/playlist', methode: 'POST' },
];
const echecs = [
  { nom: 'motif du fournisseur sur HTTP 503', statut: 503,
    corps: { ok: false, error: 'erreur_fournisseur', motif: 'Model not found' },
    attendu: 'Le fournisseur a renvoyé une erreur : réessayez. Motif donné par le fournisseur : « Model not found »' },
  { nom: 'clé sans espace de travail sur HTTP 400', statut: 400,
    corps: { ok: false, error: 'cle_sans_espace_de_travail', motif: 'not scoped to a workspace' },
    attendu: 'Cette clé Anthropic n’est rattachée à aucun espace de travail : créez-en une dans un espace de travail (console.anthropic.com › API keys). Motif donné par le fournisseur : « not scoped to a workspace »' },
  { nom: 'ancien serveur sans motif sur HTTP 429', statut: 429,
    corps: { ok: false, error: 'quota' },
    attendu: 'Quota ou crédit épuisé chez le fournisseur.' },
];

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let reponse: (typeof echecs)[number];
let appels: { route: string; methode: string; corps: unknown }[];
async function stabiliser() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  locale.set('fr'); appels = [];
  hote = document.createElement('div'); document.body.appendChild(hote);
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const route = new URL(String(url), window.location.href).pathname;
    appels.push({ route, methode: options?.method ?? 'GET',
      corps: options?.body ? JSON.parse(String(options.body)) : null });
    return new Response(JSON.stringify({ ...reponse.corps, message: 'Message brut du serveur' }), {
      status: reponse.statut, headers: { 'Content-Type': 'application/json' },
    });
  }));
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); vi.unstubAllGlobals();
});

describe.each(ecrans)('#2306 — $nom monté', (ecran) => {
  it.each(echecs)('$nom', async (echec) => {
    reponse = echec;
    composant = mount(ecran.composant as any, { target: hote, props: ecran.props });
    flushSync(); await stabiliser();
    const panneau = document.querySelector<HTMLElement>(ecran.racine)!;
    expect(panneau).not.toBeNull();
    if (ecran.nom === 'Suggestions lot') {
      panneau.querySelector<HTMLButtonElement>('[data-ia-lot-lancer]')!.click();
    } else if (ecran.nom === 'Playlist par phrase') {
      const phrase = panneau.querySelector<HTMLTextAreaElement>('[data-ia-phrase]')!;
      phrase.value = 'Du jazz calme'; phrase.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      panneau.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
    await stabiliser();
    expect(appels).toHaveLength(1);
    expect(appels[0].route).toBe(`/api/v1/ext/assistant-ia${ecran.route}`);
    expect(appels[0].methode).toBe(ecran.methode);
    if (ecran.nom === 'Playlist par phrase') expect(appels[0].corps).toEqual({ phrase: 'Du jazz calme', cible: 'playlist' });
    const alerte = panneau.querySelector('[role="alert"]');
    expect(alerte, 'la réponse HTTP fonctionnelle doit arriver au vrai écran').not.toBeNull();
    expect(alerte!.textContent?.trim()).toBe(echec.attendu);
    expect(alerte!.textContent).not.toContain('Message brut du serveur');
  });
});
