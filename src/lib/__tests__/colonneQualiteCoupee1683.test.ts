// @vitest-environment jsdom
//
// web#1683, point 2 — Levente, fil 1998 : « The Quality column seems to have a
// fixed width and when there's a longer quality label, it cuts the right
// side. » Les captures du ticket 187 : « HI-RES MAX · FLAC 19 » au lieu de
// « … 192/24 », en Essentiel comme en Expert. La colonne était à 132 px.
//
// jsdom ne fait AUCUNE mise en page : on ne peut pas mesurer la pastille. Le
// témoin tient donc deux choses vérifiables :
//  1. la largeur de la colonne couvre la pastille la plus longue qu'on sait
//     produire, estimée par un modèle de chasse PRUDENT (majuscules 10 px) ;
//  2. dans le tableau, la pastille est montée en mode `ajuste` — au-delà de la
//     colonne, le détail s'abrège avec infobulle au lieu d'être tranché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { PAR_CLE, modeEnTableau, type Colonne } from '../colonnesPistes';
import { formatCompactQuality, getQualityTier, getQualityTierLabel } from '../utils';

/** Plancher en px d'une largeur de colonne (`196px` ou `minmax(196px,…)`). */
function plancherPx(c: Colonne): number {
  const m = /^(?:minmax\()?([0-9.]+)px/.exec(c.largeur);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Largeur estimée d'une pastille (`QualityBadge`, 10 px, capitales).
 * Chasse prudente : 7,6 px par caractère du palier (graisse 800, interlettre
 * 0,6), 6,6 px pour le détail (graisse 500, interlettre 0,4), étoile 7 px,
 * deux gouttières de 4 px, 14 px de marge intérieure et 2 px de bordure.
 */
function largeurPastille(piste: Parameters<typeof formatCompactQuality>[0]): number {
  const palier = getQualityTierLabel(getQualityTier(piste as any));
  const detail = formatCompactQuality(piste);
  const etoile = getQualityTier(piste as any) === 'hires_max' ? 7 + 4 : 0;
  return palier.length * 7.6 + etoile + 4 + detail.length * 6.6 + 14 + 2;
}

const PISTES_LONGUES = [
  { format: 'flac', sample_rate: 192000, bit_depth: 24 }, // la capture de Levente
  { format: 'aiff', sample_rate: 352800, bit_depth: 24 },
  { format: 'alac', sample_rate: 176400, bit_depth: 24 },
  { format: 'flac', sample_rate: 384000, bit_depth: 32 },
];

describe('web#1683 point 2 — la colonne Qualité ne coupe plus la pastille', () => {
  it('🔴 la colonne couvre la pastille la plus longue qu’on produit', () => {
    const colonne = plancherPx(PAR_CLE.quality);
    for (const p of PISTES_LONGUES) {
      const besoin = largeurPastille(p);
      expect(colonne, `« ${getQualityTierLabel(getQualityTier(p as any))} ${formatCompactQuality(p)} » demande ~${Math.round(besoin)} px`)
        .toBeGreaterThanOrEqual(besoin);
    }
  });

  it('CONTRE-ÉPREUVE : l’ancienne largeur de 132 px est bien refusée par le modèle', () => {
    const ancienne = plancherPx({ ...PAR_CLE.quality, largeur: '132px' });
    expect(ancienne).toBe(132);
    // La pastille de la capture — sinon le modèle ne mesure rien.
    expect(largeurPastille(PISTES_LONGUES[0])).toBeGreaterThan(ancienne);
  });

  it('la colonne reste en pixels (pas d’`auto`) : en-tête et lignes restent alignés', () => {
    expect(PAR_CLE.quality.largeur).not.toMatch(/auto|content/);
  });
});

describe('web#1683 point 2 — au-delà, la pastille s’abrège au lieu d’être tranchée', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => [], text: async () => '[]',
    }) as unknown as Response));
    preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  function poser(props: Record<string, unknown>) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ListePistesV2, { target: hote, props: props as any });
    flushSync();
    return hote;
  }

  it('le niveau mesuré rend bien le tableau — sinon le témoin ne mesure rien', () => {
    expect(modeEnTableau('beginner')).toBe(true);
  });

  it('🔴 la pastille du tableau est bornée par sa cellule, infobulle comprise', () => {
    const el = poser({
      pistes: [{ id: 1, title: 'What’s Going On', artist_name: 'Marvin Gaye', source: 'local',
        format: 'flac', sample_rate: 192000, bit_depth: 24 }],
      onLire: () => {},
    });
    const pastille = el.querySelector('.tbl .trow .quality-badge');
    expect(pastille, 'le tableau ne rend pas de pastille Qualité').not.toBeNull();
    expect(pastille!.classList.contains('ajuste'),
      'la pastille déborde de sa cellule et se fait trancher (web#1683)').toBe(true);
    expect(pastille!.getAttribute('title') ?? '', 'plus d’infobulle pour lire le libellé complet')
      .toMatch(/192/);
  });
});
