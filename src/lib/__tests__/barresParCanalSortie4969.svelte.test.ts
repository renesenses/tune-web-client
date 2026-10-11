// @vitest-environment jsdom
//
// tune-server-rust#4969 (rc4) — le bargraphe multicanal suit ce qui SORT.
//
// 🔴 Banc sur le VRAI `AudioVisualizer`, nourri des trames que publie le
// serveur pour le fichier synthétique 5.1 de son banc
// (`orchestrator/niveaux_par_canal_de_sortie_4969.rs`) : six segments, UN
// seul canal sonore à la fois, à −6 dBFS. Chaque trame doit allumer UNE
// barre, la bonne, nommée par son repère (FL…BR, non traduit) et décrite
// en toutes lettres dans la langue de l'écran (infobulle et accessibilité).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import AudioVisualizer from '../../components/partages/AudioVisualizer.svelte';
import { handleAudioLevelsEvent } from '../stores/audioLevels';
import { currentZoneId } from '../stores/zones';
import { locale, t } from '../i18n';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const ZONE = 49690;
const NOMS_5_1 = ['FL', 'FR', 'FC', 'LFE', 'BL', 'BR'];
let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | null = null;

/** La trame du segment où seul le canal `sonore` porte du signal. */
function trameUnCanal(sonore: number, champs: Record<string, unknown> = { output_channels: 6 }) {
  handleAudioLevelsEvent({
    zone_id: ZONE, channels: 6,
    rms_left_db: -96, rms_right_db: -96, peak_left_db: -96, peak_right_db: -96,
    channel_levels: NOMS_5_1.map((_, c) =>
      c === sonore
        ? { rms_db: -9.03, peak_db: -6.02, over: false }
        : { rms_db: -96, peak_db: -96, over: false },
    ),
    channel_names: NOMS_5_1,
    ...champs,
  });
  flushSync();
}

function barres(): HTMLElement[] {
  const groupe = hote.querySelector('[data-testid="barres-par-canal"]');
  expect(groupe, 'aucune barre par canal affichée').not.toBeNull();
  return [...groupe!.querySelectorAll<HTMLElement>('[data-canal]')];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true }) as unknown as CanvasRenderingContext2D,
  );
  locale.set('fr');
  currentZoneId.set(ZONE);
  hote = document.createElement('div');
  document.body.append(hote);
  monte = mount(AudioVisualizer, { target: hote, props: { playing: true, mode: 'spectrum' } });
  flushSync();
});

afterEach(async () => {
  if (monte) await unmount(monte);
  monte = null;
  hote.remove();
  locale.set('fr');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('#4969 — un canal à la fois, chaque barre suit le bon canal', () => {
  it('🔴 chacun des six segments allume sa seule barre, nommée et décrite', () => {
    for (let c = 0; c < NOMS_5_1.length; c++) {
      trameUnCanal(c);
      const b = barres();
      expect(b.map((x) => x.getAttribute('data-canal'))).toEqual(NOMS_5_1);
      const allumees = b.flatMap((x, i) => (x.classList.contains('muet') ? [] : [i]));
      expect(allumees, `segment du canal ${NOMS_5_1[c]}`).toEqual([c]);
      const nomComplet = get(t)(`player.channelName.${NOMS_5_1[c]}`);
      expect(b[c].getAttribute('title'), `infobulle de ${NOMS_5_1[c]}`).toBe(nomComplet);
      expect(b[c].getAttribute('aria-label')).toBe(nomComplet);
    }
    expect(barres()[3].getAttribute('title')).toBe('Caisson de basses (LFE)');
  });

  it('🔴 des niveaux mesurés à la SORTIE se disent tels', () => {
    trameUnCanal(0);
    const groupe = hote.querySelector('[data-testid="barres-par-canal"]')!;
    expect(groupe.getAttribute('aria-label')).toBe('Niveau par voie de sortie');
    // Un serveur d'avant la rc4 (ou un rendu réseau) : l'ordre de la source.
    trameUnCanal(0, {});
    expect(hote.querySelector('[data-testid="barres-par-canal"]')!.getAttribute('aria-label')).toBe(
      'Niveau par canal',
    );
  });

  it('🔴 le nom en toutes lettres suit la langue, le repère ne bouge pas', () => {
    locale.set('en');
    trameUnCanal(2);
    const b = barres();
    expect(b[2].getAttribute('data-canal')).toBe('FC');
    expect(b[2].textContent?.trim()).toBe('FC');
    expect(b[2].getAttribute('title')).toBe('Center');
  });

  it('🔴 les dix libellés existent dans les onze langues', () => {
    const cles = ['player.channelLevelsOutput', ...['FL', 'FR', 'FC', 'LFE', 'BL', 'BR', 'BC', 'SL', 'SR'].map(
      (n) => `player.channelName.${n}`,
    )];
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const cle of cles) {
        expect(typeof d[cle] === 'string' && d[cle].length > 0, `${langue} : ${cle}`).toBe(true);
      }
    }
  });
});
