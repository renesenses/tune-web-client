// @vitest-environment jsdom
//
// #2702 dans l'écran v2 — « les morceaux ne s'enchaînent pas sur Bandcamp ».
//
// Sevy Tabroc, 0.9.119 macOS : « Je choisis un album / je lance le premier
// titre / à la fin du morceau, le prochain ne s'enchaîne pas. »
//
// 🔴 CE N'ÉTAIT PAS LA DÉTECTION DE FIN DE PISTE, C'ÉTAIT LA FILE.
// `StreamingV2` envoyait une piste distante seule — `{source, source_id}` où
// `source_id` est l'URL d'extrait mp3-128. Ce chemin termine par
// `update_queue_info(zone, 0, 1)` : une file d'EXACTEMENT une piste, où il n'y
// a jamais de suivante.
//
// La correction existe et est fusionnée : `lib/bandcampLecture`. Elle servait
// l'écran Bandcamp de l'ANCIENNE interface, et n'avait AUCUN appelant dans
// `src/components/v2/` — « écrit, pas branché », une fois de plus.
//
// Ce témoin regarde CE QUI PART SUR LE RÉSEAU, pas le texte du composant : une
// garde qui lirait le source resterait verte sur un appel débranché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { corpsDeLectureBandcamp, corpsDeLectureCollection } from '../bandcampLecture';

const ARTICLE = {
  url: 'https://sevy.bandcamp.com/album/nuit',
  titre: 'Nuit',
  artiste: 'Sevy',
  pochette: 'https://f4.bcbits.com/img/a123_16.jpg',
  extrait: 'https://t4.bcbits.com/stream/abc/mp3-128/1?token=zz',
};

describe("#2702 — ce que l'écran doit envoyer pour qu'une file existe", () => {
  it("un article qui porte son adresse part en ALBUM, pas en piste seule", () => {
    // C'est le corps que le serveur sait développer : `get_album_tracks`
    // rouvre la page et écrit la file AVANT la lecture.
    const corps = corpsDeLectureBandcamp(
      { url: ARTICLE.url, title: ARTICLE.titre, artist: ARTICLE.artiste,
        tracks: [{ stream_url: ARTICLE.extrait, title: ARTICLE.titre }] },
      0,
    );
    expect(corps).toEqual({
      source: 'bandcamp',
      streaming_album_id: ARTICLE.url,
      start_index: 0,
    });
    // 🔴 Surtout PAS `source_id` : c'est lui qui produisait la file d'une piste.
    expect(corps).not.toHaveProperty('source_id');
  });

  it("SANS adresse d'album, le repli reste une piste seule — mieux que rien", () => {
    const corps = corpsDeLectureBandcamp(
      { url: null, tracks: [{ stream_url: ARTICLE.extrait, title: 'Isolée' }] },
      0,
    );
    expect(corps).toMatchObject({ source: 'bandcamp', source_id: ARTICLE.extrait });
    expect(corps).not.toHaveProperty('streaming_album_id');
  });

  it('sans adresse NI extrait, aucun corps : un corps vide ferait « reprendre la lecture »', () => {
    expect(corpsDeLectureBandcamp({ url: null, tracks: [] }, 0)).toBeNull();
    expect(corpsDeLectureCollection({ url: '' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Le branchement, mesuré sur le réseau.
// ---------------------------------------------------------------------------
let corpsEnvoyes: any[] = [];

beforeEach(() => {
  corpsEnvoyes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    if (init?.body) { try { corpsEnvoyes.push(JSON.parse(init.body)); } catch { /* pas du JSON */ } }
    const corps = /\/(zones|profiles|devices|playlists|shortcuts)(\?|\/|$)/.test(String(url)) ? [] : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('#2702 — les trois portes de StreamingV2 passent par la même décision', () => {
  it("le composant n'envoie plus JAMAIS l'extrait comme identifiant nominal", async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const sv = readFileSync(resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'), 'utf-8');
    /*
     * ⚠️ CE TÉMOIN A ÉTÉ RENFORCÉ APRÈS UNE CONTRE-ÉPREUVE QUI N'A PAS MORDU.
     *
     * Il cherchait d'abord la chaîne exacte de l'ancien corps, virgule
     * comprise. En rétablissant le défaut sans cette virgule, le témoin est
     * resté VERT — il gardait une ponctuation, pas un comportement. C'est très
     * exactement la faiblesse que `menuPiste` et `routageArtiste` documentent :
     * une garde qui lit du texte ne prouve rien.
     *
     * Il porte désormais sur l'ABSENCE de tout envoi d'extrait comme
     * identifiant nominal, quelle que soit l'écriture.
     */
    const envoisExtrait = sv.match(/source_id:\s*String\(it\.extrait\)/g) ?? [];
    expect(envoisExtrait, `l'extrait repart comme identifiant : ${envoisExtrait.length} envoi(s)`)
      .toHaveLength(0);
    // Les trois portes appellent la décision.
    expect(sv).toContain('const corps = corpsDeLectureBandcamp(');
    expect(sv).toContain('const corps = corpsDeLectureCollection({ url: a?.url ?? a?.source_id ?? null });');
    expect(sv).toContain("if (zid != null && svc === BANDCAMP) { playBc(piste); return; }");
    // 🔴 Et l'exclusion qui rendait tout cela impossible est levée.
    expect(sv).not.toContain("if (zid == null || !active || active === BANDCAMP) return;");
    expect(sv).not.toContain('svc === BANDCAMP || !sid) return;');
  });
});
