// @vitest-environment jsdom
//
// renesenses/tune-web-client#860 — FabienM, fil forum 1749, point 8, v0.9.145 :
//
//   « Menu Streaming: Bandcamp: j'ai activé mon compte et j'ai maintenant
//     2 onglets. Il faut les fusionner »
//
// Sa capture montre la rangée `[Bandcamp fabienm] [Qobuz Fabien] [Youtube]
// [Bandcamp]` — le premier avec son pseudo et les sous-onglets Éditorial /
// Playlists / Favoris, le dernier sans pseudo avec Découvrir / Genres /
// Ma collection.
//
// ## Reproduit à la source, pas déduit
//
// Sur le .18, le 12/09/2026, compte Bandcamp lié :
//
//     GET /api/v1/streaming/services
//     → "bandcamp": {"enabled": true, "authenticated": true, "username": "berthos"}
//     GET /api/v1/ext/bandcamp/tags  → 200, 11 405 octets
//
// Les deux conditions sont donc vraies en même temps, et la rangée d'origine
// les additionnait sans se demander si elles nommaient le même service.
//
// ## 🔴 Ce qu'un test du seul module NE VERRAIT PAS
//
// Une garde posée uniquement sur `ongletsStreaming()` resterait VERTE si
// quelqu'un remettait `[...connected, ...(bandcampLive ? [BANDCAMP] : [])]`
// dans `StreamingV2.svelte` : la fonction serait toujours juste, simplement
// plus appelée. C'est le défaut de ce dépôt — le code existe, personne ne
// l'appelle. Le témoin décisif de ce fichier MONTE donc l'écran réel, sert les
// deux réponses ci-dessus par `fetch`, et COMPTE LES BOUTONS DU DOM. Il ne lit
// aucune ligne de source : débrancher le dédoublonnage le fait rougir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import {
  BANDCAMP_EXT,
  BANDCAMP_SVC,
  ongletInitial,
  ongletsStreaming,
  pseudoOnglet,
  servicesConnectes,
  type EtatService,
} from '../ongletsStreaming';

/** Monter `StreamingV2` compile un composant de plus de mille lignes. */
vi.setConfig({ testTimeout: 30_000 });

/**
 * L'état exact rendu par le .18 le 12/09/2026, compte Bandcamp lié.
 * `deezer` et `spotify` y sont pour le témoin : non authentifiés, ils ne
 * doivent produire aucun onglet.
 */
const SERVICES_DU_18: Record<string, EtatService> = {
  bandcamp: { enabled: true, authenticated: true, username: 'berthos' },
  deezer: { enabled: true, authenticated: false, username: null },
  qobuz: { enabled: true, authenticated: true, username: 'Bertrand' },
  spotify: { enabled: false, authenticated: false, username: null },
  tidal: { enabled: true, authenticated: true, username: null },
  youtube: { enabled: true, authenticated: true, username: null },
};

describe('#860 — le module : Bandcamp n’entre qu’une fois dans la rangée', () => {
  it('compte lié + extension vivante ⇒ UN seul onglet Bandcamp', () => {
    const onglets = ongletsStreaming(SERVICES_DU_18, true);
    const bandcamps = onglets.filter((o) => o === BANDCAMP_SVC || o === BANDCAMP_EXT);
    expect(
      bandcamps,
      `la rangée porte ${bandcamps.length} onglet(s) Bandcamp : ${onglets.join(', ')}`,
    ).toEqual([BANDCAMP_EXT]);
  });

  it('TÉMOIN — extension muette : l’onglet générique reste, seul', () => {
    // L'extension peut être installée sans être chargée. Le service générique
    // est alors le seul Bandcamp disponible : le retirer ferait disparaître
    // Bandcamp de l'écran, ce qui serait pire que le doublon.
    const onglets = ongletsStreaming(SERVICES_DU_18, false);
    expect(onglets).toContain(BANDCAMP_SVC);
    expect(onglets).not.toContain(BANDCAMP_EXT);
  });

  it('TÉMOIN — compte NON lié + extension vivante : l’onglet extension seul', () => {
    const sansCompte = { ...SERVICES_DU_18, bandcamp: { enabled: true, authenticated: false } };
    const onglets = ongletsStreaming(sansCompte, true);
    expect(onglets).toContain(BANDCAMP_EXT);
    expect(onglets).not.toContain(BANDCAMP_SVC);
  });

  it('les autres services ne sont pas touchés, et les non connectés restent dehors', () => {
    const onglets = ongletsStreaming(SERVICES_DU_18, true);
    expect(onglets).toEqual([BANDCAMP_EXT, 'qobuz', 'tidal', 'youtube']);
    expect(servicesConnectes(SERVICES_DU_18)).not.toContain('deezer');
    expect(servicesConnectes(SERVICES_DU_18)).not.toContain('spotify');
  });

  it('l’onglet garde sa PLACE : lier son compte ne le fait pas sauter en fin de rangée', () => {
    // `bandcamp` est premier dans la réponse du serveur. S'il partait en
    // dernier une fois le compte lié, l'onglet changerait de place sous le
    // curseur pour une raison qu'aucun écran n'explique.
    expect(ongletsStreaming(SERVICES_DU_18, true)[0]).toBe(BANDCAMP_EXT);
  });

  it('le pseudo suit l’onglet qui survit', () => {
    expect(pseudoOnglet(BANDCAMP_EXT, SERVICES_DU_18)).toBe('berthos');
    expect(pseudoOnglet('qobuz', SERVICES_DU_18)).toBe('Bertrand');
    expect(pseudoOnglet('tidal', SERVICES_DU_18)).toBeNull();
  });

  it('l’onglet initial est pris dans la rangée AFFICHÉE, jamais dans `services`', () => {
    // Le calcul d'origine — « le premier service connecté » — rendait
    // `bandcamp`, la clé même que le dédoublonnage retire.
    const initial = ongletInitial(SERVICES_DU_18, true);
    expect(initial).toBe(BANDCAMP_EXT);
    expect(ongletsStreaming(SERVICES_DU_18, true)).toContain(initial!);
  });
});

// ---------------------------------------------------------------------------
// Le témoin qui compte les boutons RÉELLEMENT rendus.
// ---------------------------------------------------------------------------

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Les 27 genres que `/ext/bandcamp/tags` sert réellement — trois suffisent. */
const TAGS_BANDCAMP = {
  tags: ['rock', 'jazz', 'electronic'],
  genres: [
    { slug: 'rock', label: 'Rock', sous_genres: [] },
    { slug: 'jazz', label: 'Jazz', sous_genres: [] },
  ],
};

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/**
 * Le serveur du .18 : Bandcamp authentifié ET extension vivante.
 * `extensionMuette` coupe `/ext/bandcamp/tags` pour le témoin inverse.
 */
function serveur(opts: { extensionMuette?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/ext\/bandcamp\/tags/.test(u)) {
        if (opts.extensionMuette) throw new Error('extension non chargée');
        return reponse(TAGS_BANDCAMP);
      }
      if (/\/streaming\/services/.test(u)) return reponse(SERVICES_DU_18);
      // Tout le reste — éditorial, playlists, favoris — rend vide : l'écran
      // n'est pas jugé sur son contenu ici, seulement sur sa rangée d'onglets.
      return reponse([]);
    }),
  );
}

/** Les libellés des boutons de la rangée de services, dans l'ordre du DOM. */
function ongletsRendus(): string[] {
  return Array.from(hote!.querySelectorAll('nav.svcs > button')).map((b) =>
    (b.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('#860 — l’écran monté ne rend qu’UNE tuile Bandcamp', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverInerte as any);
    if (!('IntersectionObserver' in globalThis)) {
      vi.stubGlobal('IntersectionObserver', ResizeObserverInerte as any);
    }
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    if (monte) {
      try {
        unmount(monte);
      } catch {
        /* le démontage n'est pas le sujet du témoin */
      }
      monte = null;
    }
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function monterEcran(opts: { extensionMuette?: boolean } = {}) {
    serveur(opts);
    const { default: StreamingV2 } = await import('../../components/v2/StreamingV2.svelte');
    monte = mount(StreamingV2 as any, { target: hote! });
    // Deux requêtes en `Promise.allSettled`, puis les chargements de panneau.
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      flushSync();
      if (ongletsRendus().length) break;
    }
    flushSync();
  }

  it('🔴 la rangée porte UN bouton Bandcamp, pas deux', async () => {
    await monterEcran();
    const rendus = ongletsRendus();
    const bandcamps = rendus.filter((l) => /bandcamp/i.test(l));
    expect(
      bandcamps.length,
      `la rangée rendue est [${rendus.join(' | ')}] — elle porte ${bandcamps.length} onglet(s) Bandcamp`,
    ).toBe(1);
  });

  it('et cet unique onglet porte le pseudo du compte lié', async () => {
    await monterEcran();
    // 🔴 On compare la LISTE, pas le premier trouvé. Un `find()` aurait attrapé
    // l'onglet générique — qui porte lui aussi le pseudo — et serait resté vert
    // avec deux onglets à l'écran : le témoin aurait raté exactement ce qu'il
    // est censé voir.
    const bandcamps = ongletsRendus().filter((l) => /bandcamp/i.test(l));
    expect(
      bandcamps,
      `les onglets Bandcamp rendus sont [${bandcamps.join(' | ')}]`,
    ).toEqual(['Bandcamp berthos']);
  });

  it('TÉMOIN — les autres services gardent chacun le leur', async () => {
    await monterEcran();
    const rendus = ongletsRendus();
    expect(rendus.filter((l) => /qobuz/i.test(l)).length).toBe(1);
    expect(rendus.filter((l) => /youtube/i.test(l)).length).toBe(1);
    expect(rendus.some((l) => /deezer/i.test(l))).toBe(false);
  });

  it('TÉMOIN — extension muette : Bandcamp reste à l’écran, une fois', async () => {
    // Sans ce témoin, « supprimer tout onglet Bandcamp » passerait le premier
    // test : zéro n'est pas deux. Ce qu'on veut est UN, dans les deux cas.
    await monterEcran({ extensionMuette: true });
    const rendus = ongletsRendus();
    expect(
      rendus.filter((l) => /bandcamp/i.test(l)).length,
      `rangée rendue : [${rendus.join(' | ')}]`,
    ).toBe(1);
  });

  it('l’onglet ouvert au montage est CELUI de l’extension, pas la clé retirée', async () => {
    await monterEcran();
    const allume = hote!.querySelector('nav.svcs > button.on');
    expect(allume, 'aucun onglet n’est allumé : `active` désigne une clé absente de la rangée').not
      .toBeNull();

    // 🔴 « un onglet est allumé » ne suffit pas : avec `active = 'bandcamp'`,
    // la clé que le dédoublonnage retire, un bouton pouvait rester allumé et le
    // témoin rester vert. Ce qui tranche est la rangée des SOUS-onglets : elle
    // dit laquelle des deux moitiés est réellement ouverte.
    //   extension → Découvrir / Genres / Ma collection   (/ext/bandcamp/*)
    //   générique → Éditorial / Playlists / Favoris      (/streaming/bandcamp/*)
    const sous = Array.from(hote!.querySelectorAll('nav.subs > button')).map((b) =>
      (b.textContent ?? '').trim(),
    );
    expect(
      sous,
      `sous-onglets rendus : [${sous.join(' | ')}] — ce sont ceux de l’onglet GÉNÉRIQUE, ` +
        'donc `active` ne désigne pas l’onglet de l’extension',
    ).toContain('Découvrir');
    expect(sous).not.toContain('Éditorial');
  });
});
