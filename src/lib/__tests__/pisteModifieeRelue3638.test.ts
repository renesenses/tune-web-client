// @vitest-environment jsdom
//
// Métadonnées — renesenses/tune-server-rust#3638 : la piste que l'on vient de
// modifier gardait son ancien affichage.
//
// Les deux bouts, relevés au tag v0.9.142 :
//
//   • `PUT /library/tracks/{id}` — comme `PATCH /metadata/tracks/{id}` et
//     `POST /metadata/tracks/{id}/edit`, servis par le MÊME gestionnaire
//     `edit_track` — termine sur `Json(json!({ "status": "ok", "track_id": id }))`
//     (`tune-server/src/routes/metadata.rs:607`). Ni `id`, ni `title`, ni
//     aucun champ de `Track`.
//   • `api.updateTrack` la déclarait `Track`, `TrackEditModal` passait cette
//     réponse à `onSaved`, et `LibraryView.handleTrackSaved:421-430` appariait
//     ses deux listes sur `updated.id`. `undefined` n'égale l'`id` d'aucune
//     piste : les deux `map` recopiaient la liste À L'IDENTIQUE.
//
// 🔴 CES TÉMOINS APPELLENT, ILS NE LISENT PAS. On monte le vrai modale, on
// stube `fetch` avec la réponse LITTÉRALE du serveur — l'accusé de réception,
// pas un `Track` —, on tape un titre, on clique « Enregistrer », et on regarde
// les URL réellement émises ainsi que l'objet remis à `onSaved`. Faire rendre
// un `Track` au serveur maquillerait le défaut : c'est justement pour cela que
// le stub n'en rend pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TrackEditModal from '../../components/TrackEditModal.svelte';
import type { Track } from '../types';

const ID = 42;

/** La piste telle qu'elle est à l'ouverture du modale. */
const PISTE: Track = {
  id: ID,
  title: 'Ancien titre',
  album_id: 7,
  album_title: 'Kind of Blue',
  artist_id: 3,
  artist_name: 'Miles Davis',
  track_number: 1,
  genre: 'Jazz',
  year: 1959,
};

/** Ce que `edit_track` rend VRAIMENT — metadata.rs:607. */
const ACCUSE_DE_RECEPTION = { status: 'ok', track_id: ID };

/** Ce que `GET /library/tracks/{id}` rend : la piste relue, complète. */
const PISTE_RELUE: Track = { ...PISTE, title: 'Nouveau titre' };

let appels: { url: string; method: string; body: string | null }[] = [];
let recu: Track[] = [];

/** Une seule catégorie étendue, un seul champ, activé. */
const CATEGORIES = {
  categories: [
    { name: 'Divers', fields: [{ key: 'mood', label: 'Ambiance', enabled: true }] },
  ],
};

function corpsPour(url: string, method: string): unknown {
  if (url.includes('/system/settings/metadata-fields')) return CATEGORIES;
  if (/\/library\/tracks\/\d+\/metadata$/.test(url)) return method === 'GET' ? {} : { status: 'ok' };
  if (/\/library\/tracks\/\d+$/.test(url)) {
    return method === 'PUT' ? ACCUSE_DE_RECEPTION : PISTE_RELUE;
  }
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

function poserModale(): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TrackEditModal, {
    target: hote,
    props: {
      track: PISTE,
      onClose: () => {},
      onSaved: (t: Track) => recu.push(t),
    },
  });
  flushSync();
  return hote;
}

/** Le champ « Titre » est le premier `input[type=text]` du modale. */
function saisirTitre(el: HTMLElement, valeur: string) {
  const champ = el.querySelector('.fields input[type="text"]') as HTMLInputElement;
  expect(champ, 'le champ Titre a disparu du modale').not.toBeNull();
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

async function enregistrer(el: HTMLElement) {
  const bouton = el.querySelector('.btn-save') as HTMLButtonElement;
  expect(bouton, "le bouton d'enregistrement a disparu").not.toBeNull();
  bouton.click();
  for (let i = 0; i < 6; i++) await respirer();
  flushSync();
}

beforeEach(() => {
  appels = [];
  recu = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ url: String(url), method, body: (init?.body as string) ?? null });
      const corps = corpsPour(String(url), method);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#3638 — la piste modifiée est relue avant de rafraîchir la liste', () => {
  it("écrit bien la modification par PUT /library/tracks/{id}", async () => {
    const el = poserModale();
    await respirer();
    flushSync();
    saisirTitre(el, 'Nouveau titre');
    await enregistrer(el);

    const puts = appels.filter((a) => a.method === 'PUT' && /\/library\/tracks\/42$/.test(a.url));
    expect(
      puts.length,
      `l'écriture n'a pas eu lieu ; appels vus : ${appels.map((a) => `${a.method} ${a.url}`).join(' | ')}`,
    ).toBe(1);
    expect(JSON.parse(puts[0].body!)).toEqual({ title: 'Nouveau titre' });
  });

  it('RELIT la piste après avoir écrit, et dans cet ordre', async () => {
    const el = poserModale();
    await respirer();
    flushSync();
    saisirTitre(el, 'Nouveau titre');
    await enregistrer(el);

    const surLaPiste = appels
      .filter((a) => /\/library\/tracks\/42$/.test(a.url))
      .map((a) => a.method);
    expect(
      surLaPiste,
      "la piste n'est pas relue après l'écriture — l'écran garde son objet en mémoire",
    ).toEqual(['PUT', 'GET']);
  });

  it("remet à l'appelant une PISTE, pas l'accusé de réception du serveur", async () => {
    const el = poserModale();
    await respirer();
    flushSync();
    saisirTitre(el, 'Nouveau titre');
    await enregistrer(el);

    expect(recu.length, 'onSaved n’a pas été appelé').toBe(1);
    // Le cœur du ticket : `LibraryView.handleTrackSaved` apparie ses deux
    // listes sur `updated.id`. Avec l'accusé `{status, track_id}` il vaut
    // `undefined`, aucune ligne ne correspond, et les `map` recopient la liste
    // telle quelle. Vérifier `track_id` à la place ne garderait RIEN : c'est
    // `id` que le consommateur lit.
    expect(recu[0].id).toBe(ID);
    expect(recu[0].title).toBe('Nouveau titre');
    expect((recu[0] as unknown as Record<string, unknown>).status).toBeUndefined();
  });

  it('relit aussi quand SEULES les métadonnées étendues ont changé', async () => {
    // Elles sont écrites par une AUTRE route (`PUT /library/tracks/{id}/metadata`)
    // et APRÈS celle-ci. `onSaved` ne vivait que dans la branche des champs de
    // base : modifier une seule métadonnée étendue ne rafraîchissait donc
    // rien du tout, même si l'écriture aboutissait.
    const el = poserModale();
    await respirer();
    flushSync();
    const champEtendu = el.querySelector('.ext-category input[type="text"]') as HTMLInputElement;
    expect(champEtendu, 'le champ étendu ne s’est pas rendu').not.toBeNull();
    champEtendu.value = 'Contemplatif';
    champEtendu.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await enregistrer(el);

    expect(appels.filter((a) => a.method === 'PUT' && /\/library\/tracks\/42$/.test(a.url)).length)
      .toBe(0);
    expect(appels.filter((a) => a.method === 'PUT' && a.url.endsWith('/tracks/42/metadata')).length)
      .toBe(1);
    expect(recu.length, 'aucun rafraîchissement après une modification étendue').toBe(1);
    expect(recu[0].id).toBe(ID);
  });

  it("ne relit RIEN quand rien n'a changé — pas de requête inutile", async () => {
    const el = poserModale();
    await respirer();
    flushSync();
    await enregistrer(el);

    expect(appels.filter((a) => /\/library\/tracks\/42$/.test(a.url) && a.method === 'GET').length)
      .toBe(0);
    expect(recu.length).toBe(0);
  });
});
