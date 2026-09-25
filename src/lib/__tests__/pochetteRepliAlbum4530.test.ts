// @vitest-environment jsdom
//
// #4530 — « Lecture en cours : la grande pochette reste le placeholder pour
// chaque titre d'un album dont la pochette est un Cover.jpg posé à côté des
// FLAC — la vignette « À suivre » du MÊME album, elle, la rend » (Didier,
// fil 1851, Windows, sortie locale SMSL SU-8 ; « idem pour moi » de Jean
// Valjean en 0.9.156, réponse 6536).
//
// ## Ce qui est déjà corrigé, et ce qui restait
//
// La moitié serveur est livrée depuis la v0.9.158 : `advance_queue_metadata`
// garde le condensat brut au lieu de le passer par `resolve_cover_url`, qui
// fabriquait `http://<ip-lan>:8888/api/v1/library/artwork/<condensat>`
// (#4446, PR #4485). C'est ce qui expliquait l'asymétrie exacte décrite par
// Jean Valjean : la pochette est là sur le titre lancé, absente sur tous ceux
// atteints par l'avance.
//
// La moitié CLIENT, elle, est restée ouverte et le commentaire du 19/09 la
// nomme : « `AlbumArt.svelte` ne retente pas le repli par `albumId` quand une
// `coverPath` non vide échoue au chargement — une ceinture qui aurait masqué
// ce défaut. »
//
// ## Pourquoi la ceinture vaut mieux qu'un correctif de plus côté serveur
//
// Les producteurs d'une `coverPath` illisible sont plusieurs, et il en reste :
//
//  * le chemin **DoP** de `resolve_local.rs` alimente toujours
//    `habillage.cover_path` par `resolve_cover_url` — noté dans l'issue comme
//    une porte restée ouverte au tag ;
//  * une file **reprise** d'une version antérieure porte encore l'adresse LAN
//    d'alors, qui peut ne plus exister ;
//  * un condensat qui rend 404.
//
// Dans les trois cas, `artworkUrl` voit une URL absolue, la fait passer par le
// relais d'illustration, et la garde d'adresse de #4260 refuse le LAN
// (`artwork_proxy_hote_refuse`). L'image échoue, et l'écran renonçait — alors
// que l'`albumId` lui était déjà passé et que la vignette « À suivre » s'en
// sert, elle, sans difficulté.
//
// ## Ce que ce témoin mesure
//
// Le composant est MONTÉ et l'évènement `error` de son `<img>` est déclenché,
// comme le navigateur le fait sur une pochette injoignable. On regarde le
// `src` qui en résulte et ce qui part sur le réseau — pas une ligne de source.
//
// ## ⛔ Ce qu'il n'établit PAS
//
// Que l'URL absolue soit bien ce qui échoue chez Didier et Jean Valjean :
// aucun des deux n'a fourni de console. La ceinture rattrape TOUTE `coverPath`
// illisible, quelle qu'en soit la cause — c'est précisément pour ça qu'elle
// vaut sans ce diagnostic.
//
// Refs renesenses/tune-server-rust#4530
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AlbumArt from '../../components/partages/AlbumArt.svelte';

/** L'URL absolue que le serveur fabriquait — et que le relais refuse. */
const URL_LAN = 'http://192.168.1.18:8888/api/v1/library/artwork/c9b9f3adf2a78c5e';
/** Le condensat que l'album, lui, porte en base. */
const CONDENSAT_ALBUM = 'a1b2c3d4e5f60789';

let urls: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

/** Chaque cas utilise son propre identifiant : `getAlbumCoverPath` met en cache. */
let prochainId = 6100;

function poser(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumArt, { target: hote, props: props as never });
  flushSync();
  return hote;
}

const img = () => hote?.querySelector('img') ?? null;
const placeholder = () => hote?.querySelector('.placeholder') ?? null;
const respirer = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  urls = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const u = String(url);
    urls.push(`${init?.method ?? 'GET'} ${u}`);
    // L'album, lui, sait quoi montrer : c'est toute la question.
    const corps = /\/library\/albums\/\d+/.test(u)
      ? { id: prochainId, title: 'So Far So Good', cover_path: CONDENSAT_ALBUM }
      : {};
    return Promise.resolve(
      new Response(JSON.stringify(corps), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});

afterEach(() => {
  if (monte) unmount(monte as never);
  hote?.remove();
  monte = null;
  hote = null;
  vi.unstubAllGlobals();
});

describe('#4530 — une pochette illisible retombe sur celle de l’album', () => {
  it('🔴 LE CAS : une coverPath non vide qui échoue ne laisse plus le placeholder', async () => {
    const albumId = prochainId++;
    poser({ coverPath: URL_LAN, albumId, size: 440, alt: 'Run To You' });

    const avant = img();
    expect(avant, 'le composant doit d’abord tenter la coverPath fournie').toBeTruthy();
    // Le navigateur le fait tout seul quand le relais refuse l'adresse LAN.
    avant!.dispatchEvent(new Event('error'));
    flushSync();
    await respirer();
    flushSync();

    expect(
      urls.some((u) => u.includes(`/library/albums/${albumId}`)),
      'l’album n’a même pas été interrogé : l’écran renonce alors qu’il tient ' +
        'l’identifiant dont la vignette « À suivre » se sert (#4530)',
    ).toBe(true);
    expect(
      placeholder(),
      'la grande pochette reste l’image de remplacement — c’est la capture de Didier',
    ).toBeNull();
    expect(img()?.getAttribute('src')).toContain(CONDENSAT_ALBUM);
  });

  it('sans albumId, le placeholder reste la seule issue', async () => {
    poser({ coverPath: URL_LAN, albumId: null, size: 440 });
    img()!.dispatchEvent(new Event('error'));
    flushSync();
    await respirer();
    flushSync();

    expect(urls, 'rien à demander : aucun identifiant d’album').toEqual([]);
    expect(placeholder(), 'sans repli possible, le placeholder est juste').toBeTruthy();
  });

  it('un repli qui échoue à son tour ne reboucle pas', async () => {
    const albumId = prochainId++;
    poser({ coverPath: URL_LAN, albumId, size: 440 });

    img()!.dispatchEvent(new Event('error'));
    flushSync();
    await respirer();
    flushSync();
    // La pochette de l'album échoue elle aussi — disque absent, 404.
    img()!.dispatchEvent(new Event('error'));
    flushSync();
    await respirer();
    flushSync();

    expect(placeholder(), 'les deux sources ont échoué : le placeholder est juste').toBeTruthy();
    expect(
      urls.filter((u) => u.includes(`/library/albums/${albumId}`)).length,
      'une requête par `onerror` serait une boucle sans fin',
    ).toBe(1);
  });

  it('une pochette qui CHARGE ne déclenche aucune requête d’album', async () => {
    // La ceinture ne doit rien coûter au cas nominal.
    const albumId = prochainId++;
    poser({ coverPath: 'c9b9f3adf2a78c5e', albumId, size: 440 });
    await respirer();
    expect(img()?.getAttribute('src')).toContain('c9b9f3adf2a78c5e');
    expect(urls, 'aucune requête tant que rien n’échoue').toEqual([]);
  });
});
