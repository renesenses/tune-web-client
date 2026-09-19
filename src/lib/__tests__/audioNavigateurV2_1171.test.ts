// L'audio navigateur obéit au serveur dans les DEUX coquilles — #1171.
//
// Bilou, fil 1770 (0.9.148, Windows) : « vider la file d'attente ne coupe pas
// la lecture en cours ». Quand la zone sort sur le navigateur, c'est un élément
// <audio> local qui joue : le serveur ne peut pas l'arrêter, il émet
// `playback.stopped` et c'est au client d'appeler `browserStop()`.
//
// Cet appel vivait dans `App.svelte`, que `ShellV2` ne monte jamais. Vérifié
// sur `main` le 19/09/2026 : `grep browserStop src/` ne rendait que
// `App.svelte` et la définition. Ni l'arrêt, ni la pause, ni la reprise, ni le
// rechargement au changement de piste n'atteignaient l'élément dans la nouvelle
// coquille. Même défaut que #889, au même endroit.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appliquerEvenementAudioNavigateur,
  type ActionsAudioNavigateur,
} from '../audioNavigateurSync';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

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

const ZONE = { id: 1, stream_url: 'http://lan/flux' };
const navigateur = () => true;
const source = () => 'http://lan/flux';

describe('la règle elle-même', () => {
  it('🔴 vider la file ARRÊTE l’élément audio', () => {
    const { vus, actions } = espion();
    appliquerEvenementAudioNavigateur('playback.stopped', ZONE, navigateur, source, actions);
    expect(vus).toEqual(['arreter']);
  });

  it('pause, reprise et démarrage suivent aussi', () => {
    const { vus, actions } = espion();
    for (const t of ['playback.paused', 'playback.resumed', 'playback.started']) {
      appliquerEvenementAudioNavigateur(t, ZONE, navigateur, source, actions);
    }
    expect(vus).toEqual(['pause', 'reprendre(http://lan/flux)', 'jouer(http://lan/flux,false)']);
  });

  it('🔴 un changement de piste FORCE le rechargement', () => {
    // Le serveur sert la piste suivante sous la MÊME adresse : sans le
    // rechargement forcé, l'élément rejoue le tampon qui vient de finir —
    // l'album « se répète » (Elie).
    const { vus, actions } = espion();
    appliquerEvenementAudioNavigateur('playback.track_changed', ZONE, navigateur, source, actions);
    expect(vus).toEqual(['jouer(http://lan/flux,true)']);
  });

  it('une zone qui ne sort PAS sur le navigateur n’est pas touchée', () => {
    // Les autres sorties sont pilotées par le serveur : agir ici couperait une
    // lecture qu'il tient déjà.
    const { vus, actions } = espion();
    appliquerEvenementAudioNavigateur('playback.stopped', ZONE, () => false, source, actions);
    expect(vus).toEqual([]);
  });

  it('les événements qui ne concernent pas l’élément ne font rien', () => {
    // `playback.position` arrive en continu : y réagir rechargerait le flux
    // plusieurs fois par seconde.
    const { vus, actions } = espion();
    for (const t of ['playback.position', 'queue.updated', 'zone.updated']) {
      appliquerEvenementAudioNavigateur(t, ZONE, navigateur, source, actions);
    }
    expect(vus).toEqual([]);
  });

  it('sans zone, rien ne se passe', () => {
    const { vus, actions } = espion();
    appliquerEvenementAudioNavigateur('playback.stopped', null, navigateur, source, actions);
    expect(vus).toEqual([]);
  });

  it('sans adresse de flux, on ne joue pas dans le vide', () => {
    const { vus, actions } = espion();
    appliquerEvenementAudioNavigateur(
      'playback.started',
      ZONE,
      navigateur,
      () => undefined,
      actions,
    );
    expect(vus).toEqual([]);
  });
});

describe('les DEUX coquilles la tiennent', () => {
  it('🔴 la nouvelle coquille l’applique — c’est tout le défaut', () => {
    const v2 = sansCommentaires(lire('src/lib/v2Live.ts'));
    expect(v2).toContain("from './audioNavigateurSync'");
    // L'appel doit OUVRIR l'instruction : `if (false) appliquer…` laissait
    // passer un `toContain` tout en débranchant la règle. C'est le piège qu'un
    // grep ne voit pas — on épingle donc le début de ligne.
    expect(v2).toMatch(/\n\s*appliquerEvenementAudioNavigateur\(/);
    expect(v2).not.toMatch(/\bif\s*\([^)]*\)\s*appliquerEvenementAudioNavigateur\(/);
  });

  it('l’ancienne aussi, et par le MÊME module', () => {
    const app = sansCommentaires(lire('src/App.svelte'));
    expect(app).toContain('appliquerEvenementAudioNavigateur(');
  });

  it('🔴 aucune des deux ne garde sa propre copie de la règle', () => {
    // Deux copies divergeraient au premier correctif — c'est exactement ce qui
    // s'est produit pour l'historique d'écoute (#889).
    for (const f of ['src/App.svelte', 'src/lib/v2Live.ts']) {
      const src = sansCommentaires(lire(f));
      expect(src, `${f} ne doit plus décider lui-même`).not.toMatch(
        /if \(type === 'playback\.stopped'\)/,
      );
    }
  });
});
