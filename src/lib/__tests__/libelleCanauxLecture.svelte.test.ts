// @vitest-environment jsdom
//
// LE LIBELLÉ DE CANAL SOUS LA POCHETTE — demande de Bertrand, 28/09/2026 :
// « ajouter un libellé de canal (surtout pour le multicanal) dans la vue
// Lecture en cours sous la pochette ».
//
// Deux choses distinctes, et ces témoins gardent les deux :
//
//  1. les deux VOIES de l'instrument sont nommées — `L` et `R`, écrites dans
//     la toile, EN FACE de leur barre ;
//  2. la DISPOSITION de canaux de la piste (`5.1`, `7.1.4 Atmos`…) se lit à
//     côté, quand elle est connue.
//
// 🔴 Le témoin qui compte vraiment est celui du CADRAGE. Le 27/09, le cadran
// du Grand écran a été livré mal centré en hauteur — « Vumètres mal centrés…
// en hauteur !! » — parce que sa cote avait été recopiée d'une surface où
// l'écart ne se voyait pas. Un libellé qui flotte à côté de sa barre serait
// exactement le même défaut, et aucune garde du dépôt ne regarde des pixels.
// Celui-ci compare la position du TEXTE à celle de la BARRE, dessinées toutes
// deux pour de vrai.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CreteMetre from '../../components/partages/CreteMetre.svelte';
import { LIBELLES_CANAUX, policeLibelleCanal } from '../peakMetre';
import { libelleCanaux } from '../canauxPiste';
import { currentZoneId } from '../stores/zones';
import { handleAudioLevelsEvent } from '../stores/audioLevels';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

// ---------------------------------------------------------------------------
// Une toile qui ENREGISTRE, translation comprise
// ---------------------------------------------------------------------------

interface Trace {
  op: 'fillRect' | 'fillText' | 'arc';
  x: number;
  y: number;
  l?: number;
  h?: number;
  texte?: string;
}

/**
 * Le dessin décale l'instrument de la gouttière (`ctx.translate`). Un stub qui
 * ignorerait la translation lirait des abscisses fausses et validerait
 * n'importe quoi : celui-ci la suit, `save` / `restore` compris.
 */
function toileEnregistreuse() {
  const traces: Trace[] = [];
  let dx = 0;
  const pile: number[] = [];
  const ctx = {
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    clearRect() {},
    save() { pile.push(dx); },
    restore() { dx = pile.pop() ?? 0; },
    translate(x: number) { dx += x; },
    setTransform() {},
    beginPath() {},
    fill() {},
    // Une lettre étroite : le test ne dépend pas de la police du système, mais
    // la gouttière doit rester proportionnelle à ce que la mesure rend.
    measureText(s: string) { return { width: s.length * 7 }; },
    fillRect(x: number, y: number, l: number, h: number) {
      traces.push({ op: 'fillRect', x: dx + x, y, l, h });
    },
    fillText(texte: string, x: number, y: number) {
      traces.push({ op: 'fillText', x: dx + x, y, texte });
    },
    arc(x: number, y: number, r: number) {
      traces.push({ op: 'arc', x: dx + x, y, l: r });
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  );
  return traces;
}

const LARGEUR = 600;
const HAUTEUR = 26;

let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;
let horloge = 1000;

/** Monte l'instrument et rend UNE image. */
function dessiner(props: { style: 'dat' | 'lamps'; libelles?: boolean }): Trace[] {
  const traces = toileEnregistreuse();
  monte = mount(CreteMetre, {
    target: hote,
    props: { hauteur: HAUTEUR, largeur: LARGEUR, joue: true, ...props },
  });
  flushSync();
  // Une seule image suffit : on mesure une géométrie, pas une balistique.
  horloge += 100;
  for (const r of [...file.values()]) { file.clear(); r(horloge); }
  flushSync();
  return traces;
}

let file: Map<number, (t: number) => void>;
let prochainId: number;

beforeEach(() => {
  file = new Map();
  prochainId = 1;
  horloge = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    const id = prochainId++;
    file.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { file.delete(id); });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(performance, 'now').mockImplementation(() => horloge);
  currentZoneId.set(4242);
  handleAudioLevelsEvent({
    zone_id: 4242, rms_left_db: -18, rms_right_db: -18,
    peak_left_db: -12, peak_right_db: -20,
  });
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  handleAudioLevelsEvent({ zone_id: 4242 });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('🔴 le libellé tombe EN FACE de sa voie — pas à côté', () => {
  it('bargraphe : `L` et `R` sont centrés sur leur barre, au pixel', () => {
    const traces = dessiner({ style: 'dat', libelles: true });

    const textes = traces.filter((t) => t.op === 'fillText');
    expect(textes.map((t) => t.texte), 'les deux voies ne sont pas nommées')
      .toEqual(['L', 'R']);

    // Les deux RAILS : les seuls rectangles larges. Les segments d'un décibel
    // font un soixantième de la course, les témoins OVER en font 26.
    const rails = traces.filter((t) => t.op === 'fillRect' && (t.l ?? 0) > 200);
    expect(rails, 'les deux rails du bargraphe sont introuvables').toHaveLength(2);

    for (let ch = 0; ch < 2; ch++) {
      const centreDuRail = rails[ch].y + (rails[ch].h ?? 0) / 2;
      expect(
        textes[ch].y,
        `« ${textes[ch].texte} » est à ${textes[ch].y}, sa barre est centrée sur ${centreDuRail}`,
      ).toBeCloseTo(centreDuRail, 5);
    }
  });

  it('lampes : même règle, et l’autre géométrie — les voies y sont CENTRÉES', () => {
    // Les deux visuels ne posent pas leurs voies au même endroit : le
    // bargraphe part du haut, les lampes sont centrées sur la hauteur. Une
    // formule recopiée pour l'un serait fausse pour l'autre.
    const traces = dessiner({ style: 'lamps', libelles: true });
    const textes = traces.filter((t) => t.op === 'fillText');
    const lampes = traces.filter((t) => t.op === 'arc');
    expect(textes).toHaveLength(2);
    expect(lampes).toHaveLength(2);
    for (let ch = 0; ch < 2; ch++) {
      expect(textes[ch].y, `« ${textes[ch].texte} » ne tombe pas sur sa lampe`)
        .toBeCloseTo(lampes[ch].y, 5);
    }
  });

  it('l’instrument est DÉCALÉ de la gouttière : il ne s’écrit jamais dessus', () => {
    const traces = dessiner({ style: 'dat', libelles: true });
    const textes = traces.filter((t) => t.op === 'fillText');
    const rails = traces.filter((t) => t.op === 'fillRect' && (t.l ?? 0) > 200);
    // `measureText` rend 7 px par caractère ci-dessus ; une lettre + l'écart.
    const finDuTexte = Math.max(...textes.map((t) => t.x)) + 7;
    for (const rail of rails) {
      expect(rail.x, 'le rail démarre sur le libellé').toBeGreaterThanOrEqual(finDuTexte);
    }
  });

  it('sans `libelles`, RIEN ne change : la barre de lecture garde sa largeur', () => {
    // La barre de lecture (56 px) et l'aperçu des Réglages n'ont pas la place
    // de deux lettres de plus. Le défaut doit donc rendre exactement le dessin
    // d'avant — gouttière nulle, rail collé au bord.
    const traces = dessiner({ style: 'dat' });
    expect(traces.filter((t) => t.op === 'fillText'), 'un libellé non demandé est écrit')
      .toHaveLength(0);
    const rails = traces.filter((t) => t.op === 'fillRect' && (t.l ?? 0) > 200);
    expect(rails).toHaveLength(2);
    for (const rail of rails) expect(rail.x).toBe(0);
  });

  it('la police ne descend jamais sous son plancher', () => {
    // Deux lettres de 6 px sont deux taches. Le plancher est celui du cadran
    // (`MIN_CANAL`), et les deux tailles utilisées tombent dessus.
    expect(policeLibelleCanal(26)).toBeGreaterThanOrEqual(9);
    expect(policeLibelleCanal(8), 'un instrument minuscule écrase le texte').toBe(9);
    expect(policeLibelleCanal(60), 'un grand instrument garde un texte minuscule').toBe(20);
  });
});

describe('🔴 `L` / `R` ne se traduisent pas — c’est un repère d’instrument', () => {
  it('les mêmes lettres que les cadrans, qui les portent déjà', () => {
    expect(LIBELLES_CANAUX).toEqual(['L', 'R']);
    // Traduire ici ferait cohabiter deux conventions pour un même fait sur un
    // même écran : des aiguilles marquées `L`/`R` dans la barre de lecture et,
    // trois centimètres plus haut, un bargraphe marqué `G`/`D`.
    for (const f of ['src/components/partages/VuMetreCanal.svelte',
                     'src/components/v2-heritage/TvVuMeters.svelte']) {
      const src = lire(f);
      expect(src, `${f} ne porte plus 'L' / 'R'`).toMatch(/'L'\s*:\s*'R'/);
    }
  });

  it('le crête-mètre n’apprend pas l’i18n pour deux lettres', () => {
    const src = lire('src/components/partages/CreteMetre.svelte');
    expect(src, "le crête-mètre s'est mis à traduire ses repères").not.toContain("from '../../lib/i18n'");
  });
});

describe('la disposition de canaux — ce que le SERVEUR en dit', () => {
  const t = (cle: string) => ({
    'zoneConfig.channels_surround51': '5.1',
    'zoneConfig.channels_surround714': '7.1.4 (Atmos / Auro-3D)',
    'zoneConfig.channels_surround916': '9.1.6 (Atmos / Auro-3D)',
    'zoneConfig.channels_immersive24': '24 canaux',
  } as Record<string, string>)[cle] ?? cle;

  it('mono et stéréo : AUCUNE pastille — le serveur n’en donne pas', () => {
    // `ChannelLayout::badge()` rend `None` pour mono et stéréo, et c'est voulu.
    // Un disque stéréo n'a pas de disposition à annoncer.
    expect(libelleCanaux(null, t)).toBeNull();
    expect(libelleCanaux(undefined, t)).toBeNull();
    expect(libelleCanaux('', t)).toBeNull();
  });

  it('le multicanal passe par le vocabulaire que le client possède déjà', () => {
    expect(libelleCanaux('5.1', t)).toBe('5.1');
    // Le serveur écrit « 7.1.4 Atmos / Auro-3D » ; le client dit
    // « 7.1.4 (Atmos / Auro-3D) » dans les onze langues du sélecteur de
    // canaux. C'est cette forme qui gagne.
    expect(libelleCanaux('7.1.4 Atmos / Auro-3D', t)).toBe('7.1.4 (Atmos / Auro-3D)');
    expect(libelleCanaux('9.1.6 Atmos / Auro-3D', t)).toBe('9.1.6 (Atmos / Auro-3D)');
    // Un serveur antérieur à tune-server-rust#5576 écrit encore « 7.1.4 Atmos »
    // et « 9.1.6 Auro-3D » : même clé, donc le même libellé à deux formats.
    expect(libelleCanaux('7.1.4 Atmos', t)).toBe('7.1.4 (Atmos / Auro-3D)');
    expect(libelleCanaux('9.1.6 Auro-3D', t)).toBe('9.1.6 (Atmos / Auro-3D)');
    // Et surtout : « Immersive 24ch » n'est pas du français.
    expect(libelleCanaux('Immersive 24ch', t)).toBe('24 canaux');
  });

  it('un badge INCONNU est rendu tel quel, jamais avalé', () => {
    // Serveur plus récent que ce client : mieux vaut un libellé anglais
    // qu'aucun libellé. C'est déjà le parti pris de « Sortie réelle » dans les
    // Réglages.
    expect(libelleCanaux('22.2 NHK', t)).toBe('22.2 NHK');
  });

  it('une clé sans traduction retombe sur le badge, pas sur la clé', () => {
    // `$t` rend la CLÉ quand elle manque : afficher
    // « zoneConfig.channels_surround71 » en toutes lettres serait pire que rien.
    expect(libelleCanaux('7.1', (cle) => cle)).toBe('7.1');
  });

  it('🔴 les sept clés existent dans les ONZE langues', () => {
    const cles = [
      'channels_surround51', 'channels_surround71', 'channels_surround514',
      'channels_surround714', 'channels_surround916',
      'channels_immersive24', 'channels_immersive32',
    ];
    const langues = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
    for (const langue of langues) {
      const src = lire(`src/lib/locales/${langue}.ts`);
      for (const cle of cles) {
        expect(src, `${langue} n'a pas zoneConfig.${cle}`).toContain(`zoneConfig.${cle}`);
      }
      // tune-server-rust#5576 — 7.1.4 et 9.1.6 nomment les DEUX formats.
      expect(src, `${langue} : 7.1.4 ne nomme qu'un format`).toContain('"zoneConfig.channels_surround714": "7.1.4 (Atmos / Auro-3D)"');
      expect(src, `${langue} : 9.1.6 ne nomme qu'un format`).toContain('"zoneConfig.channels_surround916": "9.1.6 (Atmos / Auro-3D)"');
    }
  });
});

describe('la fiche « Lecture en cours » — le branchement', () => {
  const src = lire('src/components/partages/NowPlaying.svelte');

  it('🔴 ne fait PAS un appel de plus : la valeur vient de celui du DR', () => {
    // L'état de zone ne porte pas les canaux (relevé sur le .18 le 28/09) ;
    // `GET /library/tracks/{id}` les porte, et la fiche l'appelle déjà pour le
    // Dynamic Range. Un second `api.getTrack` serait une requête gratuite à
    // chaque changement de piste.
    const effets = src.split('api.getTrack(id)').length - 1;
    expect(effets, `${effets} appels à getTrack : un seul doit subsister`).toBe(1);
    const bloc = src.slice(src.indexOf('api.getTrack(id)'));
    expect(bloc.slice(0, 600)).toContain('badgeCanaux = t.channel_badge ?? null');
  });

  it('une réponse tardive ne pose pas les canaux sous la piste SUIVANTE', () => {
    // Le défaut classique de cette forme : la réponse revient après un
    // changement de piste. La garde d'identifiant existe déjà pour le DR ;
    // elle doit couvrir les deux.
    const bloc = src.slice(src.indexOf('api.getTrack(id)'));
    const garde = bloc.indexOf('normalizedTrack?.id !== id');
    const pose = bloc.indexOf('badgeCanaux = t.channel_badge');
    expect(garde, "la garde d'identifiant a disparu").toBeGreaterThan(-1);
    expect(garde, 'les canaux sont posés AVANT la garde').toBeLessThan(pose);
  });

  it('demande les libellés à l’instrument, et n’affiche la pastille que si elle existe', () => {
    expect(src).toContain('libelles />');
    expect(src).toContain('{#if libelleDesCanaux}');
  });
});
