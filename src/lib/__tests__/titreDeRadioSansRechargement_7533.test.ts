// Un nouveau titre de radio ne recharge pas le flux du navigateur — #7533.
//
// Fil 2461 (Bilou, zone navigateur sous Windows) : « coupure systématique au
// chargement de la pochette ». Fil 2559, point 6 (FabienM, Firefox) :
// « micro-coupure du son au changement de vignette du titre écouté ».
//
// Le serveur annonce le titre que la station vient de lancer par
// `playback.track_changed` (`tune-core/src/poller/radio.rs` →
// `update_now_playing`), avec `source: "radio"` et le MÊME flux. La règle
// #1171 rechargeait de force l'élément <audio> à chaque `track_changed` :
// le direct était coupé et rouvert à chaque titre, au moment exact où la
// pochette changeait.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appliquerEvenementAudioNavigateur,
  estUnTitreDeRadio,
  type ActionsAudioNavigateur,
} from '../audioNavigateurSync';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function espion() {
  const vus: string[] = [];
  const actions: ActionsAudioNavigateur = {
    jouer: (src, forcer) => vus.push(`jouer(${src},${forcer})`),
    pause: () => vus.push('pause'),
    reprendre: (src) => vus.push(`reprendre(${src ?? '-'})`),
    arreter: () => vus.push('arreter'),
  };
  return { vus, actions };
}

const ZONE = { id: 18, stream_url: 'http://lan/flux' };
const navigateur = () => true;
const source = () => 'http://lan/flux';

// Ce que `now_playing_event_data` envoie pour un titre de radio.
const TITRE_DE_RADIO = {
  zone_id: 18,
  title: 'Nouveau titre',
  artist_name: 'Artiste',
  album_title: 'Jammin Vibez',
  source: 'radio',
  stream_id: '9046b19e-8046-493c-81e5-77286db266ff',
  duration_ms: 0,
  track_id: null,
};

describe('#7533 — titre de radio annoncé par la station', () => {
  it('🔴 ne FORCE PAS le rechargement du flux', () => {
    const { vus, actions } = espion();
    appliquerEvenementAudioNavigateur(
      'playback.track_changed',
      ZONE,
      navigateur,
      source,
      actions,
      TITRE_DE_RADIO,
    );
    // `browserPlay(src, false)` ne recharge que si l'adresse a changé.
    expect(vus).toEqual(['jouer(http://lan/flux,false)']);
  });

  it('une piste suivante (fichier, service) force toujours le rechargement (Elie)', () => {
    const { vus, actions } = espion();
    for (const src of ['local', 'qobuz', 'tidal']) {
      appliquerEvenementAudioNavigateur(
        'playback.track_changed',
        ZONE,
        navigateur,
        source,
        actions,
        { ...TITRE_DE_RADIO, source: src, track_id: 42 },
      );
    }
    expect(vus).toEqual([
      'jouer(http://lan/flux,true)',
      'jouer(http://lan/flux,true)',
      'jouer(http://lan/flux,true)',
    ]);
  });

  it('sans données d’événement, la règle #1171 reste celle d’avant', () => {
    const { vus, actions } = espion();
    appliquerEvenementAudioNavigateur('playback.track_changed', ZONE, navigateur, source, actions);
    expect(vus).toEqual(['jouer(http://lan/flux,true)']);
  });

  it('estUnTitreDeRadio ne lit que `source`', () => {
    expect(estUnTitreDeRadio(TITRE_DE_RADIO)).toBe(true);
    expect(estUnTitreDeRadio({ source: 'local' })).toBe(false);
    expect(estUnTitreDeRadio(null)).toBe(false);
    expect(estUnTitreDeRadio(undefined)).toBe(false);
    expect(estUnTitreDeRadio('radio')).toBe(false);
  });

  it('🔴 la coquille passe les données de l’événement à la règle', () => {
    const v2 = sansCommentaires(lire('src/lib/v2Live.ts'));
    const debut = v2.indexOf('appliquerEvenementAudioNavigateur(');
    expect(debut).toBeGreaterThan(-1);
    const appel = v2.slice(debut, v2.indexOf(');', v2.indexOf('arreter:', debut)) + 2);
    expect(appel).toMatch(/event\?\.data,?\s*\)/);
  });
});
