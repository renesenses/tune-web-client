// Browser audio playback store
// Manages an HTML5 <audio> element for zones with output_type === 'browser'.
// The server streams audio via its existing HTTP streamer; this store simply
// points the <audio> element at the stream URL and wires play/pause/seek/volume.

import { writable, get } from 'svelte/store';
import { currentZone, syncZone } from './zones';
import { seekPositionMs, startSeekTimer, stopSeekTimer } from './nowPlaying';
import * as api from '../api';
import { sourceDuLecteur } from '../urlDeFluxNavigateur';
import { fluxParLeRelais } from '../bridge';

// The singleton <audio> element used for browser playback
let audioElement: HTMLAudioElement | null = null;

// Propriétaire de la source réellement chargée, indépendant de la zone
// affichée. Inconnu quand un appelant ne fournit pas son identifiant (#1171).
let sourceZoneId: number | null = null;

// Current stream URL loaded into the audio element
export const browserStreamUrl = writable<string | null>(null);

// Whether browser audio is actively playing
export const browserAudioPlaying = writable<boolean>(false);

// Browser audio volume (0..1)
export const browserAudioVolume = writable<number>(1.0);

/** Returns true if the given zone should use browser-local audio */
export function isBrowserZone(zone: { output_type?: string } | null | undefined): boolean {
  return zone?.output_type === 'browser';
}

/**
 * 🔴 #2108 — L'ÉLÉMENT AUDIO NE PARLE QUE POUR SA ZONE.
 *
 * Levente Toth, fil forum 2108 (1.0.0-rc1, Linux) : « If two zones are playing
 * at the same time, Zone 1's play bar is jumping every second forward and
 * back ». Zone 1 : sortie locale ; zone 2 : le navigateur.
 *
 * `seekPositionMs` est UN nombre pour toute l'application : la position de la
 * zone AFFICHÉE (barre de transport, carte de la zone courante). Or cet élément
 * y écrivait son `currentTime` à chaque `timeupdate` — quatre fois par
 * seconde — quelle que soit la zone à l'écran. La zone 2 jouant dans ce
 * navigateur pendant qu'on regardait la zone 1, la barre de la zone 1 prenait
 * la position de la zone 2 ; le `playback.position` suivant de la zone 1,
 * à plus de deux secondes de là, la ramenait à sa place (`v2Live`, seuil de
 * dérive) ; puis le `timeupdate` suivant la renvoyait. Va-et-vient permanent,
 * sans effet sur le son : c'est exactement le constat.
 *
 * Même défaut pour le minuteur : une pause de la zone navigateur arrêtait le
 * minuteur de la zone locale affichée, et sa fin de morceau faisait passer la
 * zone AFFICHÉE au titre suivant.
 *
 * La règle : l'élément ne pilote la barre que si la zone affichée est celle
 * dont il joue la source. Propriétaire inconnu (appelant qui ne fournit pas
 * l'identifiant, #1171) : on retombe sur l'ancien critère — la zone affichée
 * sort-elle sur le navigateur ?
 */
function pilotLaBarreAffichee(): boolean {
  const affichee = get(currentZone) as { id?: number; output_type?: string } | null;
  if (sourceZoneId !== null) return affichee?.id === sourceZoneId;
  return isBrowserZone(affichee);
}

/** La zone à qui appartient le média chargé — repli : la zone affichée si elle sort ici. */
function zoneDeLaSource(): number | null {
  if (sourceZoneId !== null) return sourceZoneId;
  const affichee = get(currentZone) as { id?: number; output_type?: string } | null;
  return isBrowserZone(affichee) && typeof affichee?.id === 'number' ? affichee.id : null;
}

/**
 * 🔴 #5975 — UNE PISTE EN ÉCHEC NE DOIT PAS ARRÊTER LA FILE.
 *
 * Alex Campbell, fil forum 2178 (1.0.0-rc2 Docker, Safari 18.6, zone « This
 * computer ») : « 'tttroys playlist' still fails to either player the first
 * track or skip to the next available working track ». Le gestionnaire
 * `error` journalisait, passait `browserAudioPlaying` à faux, et s'arrêtait :
 * ni `api.next`, ni saut. Sur la zone navigateur, une piste illisible figeait
 * donc toute la file, alors que les autres zones passent à la suivante.
 *
 * Garde-fou contre la boucle : si toutes les pistes échouent (file en
 * répétition, format que le navigateur ne décode jamais…), on s'arrête après
 * `MAX_ECHECS_CONSECUTIFS` sauts sans un seul `playing` entre eux. La fin de
 * file, elle, s'arrête d'elle-même : le serveur répond `status: "stopped"`
 * (`end_of_queue`) et on ne recharge rien.
 */
export const MAX_ECHECS_CONSECUTIFS = 5;
let echecsConsecutifs = 0;
let sautEnCours = false;

async function sauterLaPisteEnErreur(zoneId: number | null): Promise<void> {
  if (zoneId == null || sautEnCours) return;
  echecsConsecutifs += 1;
  if (echecsConsecutifs > MAX_ECHECS_CONSECUTIFS) {
    console.warn(
      `Browser audio: ${MAX_ECHECS_CONSECUTIFS} sauts sans une piste lisible, arrêt de la file (#5975)`,
    );
    // On rend la main : l'élément est vidé (et le compteur remis à zéro par
    // `browserStop`), si bien qu'aucune erreur tardive ne relance la série,
    // et qu'un prochain lancement repart d'un compteur neuf.
    browserStop();
    return;
  }
  sautEnCours = true;
  try {
    const res = await api.next(zoneId);
    if (res?.status === 'stopped') return; // fin de file
    const z = await api.getZone(zoneId);
    syncZone(z);
    if (isBrowserZone(z) && z.stream_url && z.state !== 'stopped') {
      browserPlay(z.stream_url, true, z.id);
    }
  } catch {
    /* non-fatal */
  } finally {
    sautEnCours = false;
  }
}

/** Get or create the singleton audio element */
function getAudio(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.crossOrigin = 'anonymous';
    audioElement.preload = 'none';

    audioElement.addEventListener('playing', () => {
      if (deverrouillageEnCours) return;
      browserAudioPlaying.set(true);
      echecsConsecutifs = 0;
      if (pilotLaBarreAffichee()) startSeekTimer();
    });

    audioElement.addEventListener('pause', () => {
      if (deverrouillageEnCours) return;
      browserAudioPlaying.set(false);
      if (pilotLaBarreAffichee()) stopSeekTimer();
    });

    audioElement.addEventListener('ended', async () => {
      if (deverrouillageEnCours) return;
      browserAudioPlaying.set(false);
      // La zone dont le morceau vient de finir — pas forcément celle qu'on
      // regarde (#2108). Capturée AVANT le premier `await`.
      const zoneId = zoneDeLaSource();
      if (pilotLaBarreAffichee()) stopSeekTimer();
      // Auto-advance to next track.
      //
      // api.next() returns only { status, queue_position } — no zone, no
      // stream_url — so the previous `api.next().then(syncZone)` was a no-op
      // (syncZone matched on an undefined id) and the browser never started the
      // next track: playback stopped at every track boundary (Rhorn, web UI).
      // Re-fetch the zone to get the next track's stream_url and play it with
      // force:true, since the server serves the next track under the SAME
      // per-zone stream URL — without the forced reload the element replays the
      // just-ended buffer ("repeat instead of advance", Elie).
      if (zoneId != null) {
        try {
          await api.next(zoneId);
          const z = await api.getZone(zoneId);
          syncZone(z);
          if (isBrowserZone(z) && z.stream_url) {
            browserPlay(z.stream_url, true, z.id);
          }
        } catch {
          /* non-fatal */
        }
      }
    });

    audioElement.addEventListener('timeupdate', () => {
      if (audioElement && pilotLaBarreAffichee()) {
        seekPositionMs.set(Math.floor(audioElement.currentTime * 1000));
      }
    });

    audioElement.addEventListener('error', () => {
      if (deverrouillageEnCours) return;
      const erreur = audioElement?.error;
      console.error('Browser audio error:', erreur);
      browserAudioPlaying.set(false);
      if (pilotLaBarreAffichee()) stopSeekTimer();
      // #5975 — une piste illisible ne doit pas arrêter la file : on passe à
      // la suivante, comme les autres zones. Seulement pour une vraie erreur
      // média sur une source chargée (un arrêt vide la source sans erreur).
      if (!erreur || !audioElement?.src || get(browserStreamUrl) === null) return;
      void sauterLaPisteEnErreur(zoneDeLaSource());
    });
  }
  return audioElement;
}

/**
 * Load and play a stream URL in the browser.
 *
 * `force` reloads the element even when the URL string is unchanged. On a
 * track change the server may serve the next track under the SAME per-zone
 * stream URL; without a forced reload, `audio.play()` on the just-ended element
 * replayed the OLD buffered track — the album "repeated instead of advancing"
 * (Elie, browser output). Track-change callers pass `force: true`.
 */
export function browserPlay(streamUrl: string, force = false, zoneId?: number | null) {
  const audio = getAudio();
  const currentUrl = get(browserStreamUrl);
  // Une URL de TUNE part en relatif pour joindre l'hôte que le navigateur a su
  // atteindre (le serveur annonce son IP de LAN, pas forcément joignable
  // derrière un proxy ou un NAT). Une URL TIERCE garde son domaine : le lui
  // retirer faisait demander `bcbits.com/stream/…` à Tune, qui répondait par
  // son repli SPA — `200 text/html`, « Failed to init decoder » (#2076).
  // La règle exacte, et les lignes du serveur qui la fondent, vivent dans
  // `urlDeFluxNavigateur.ts` : elle est pure, donc éprouvable sans DOM.
  //
  // Par le pont, l'adresse du réseau local ne mène nulle part : elle devient
  // la route de flux du relais, jeton compris (essai en 5G du 09/10/2026).
  const relativeUrl =
    fluxParLeRelais(streamUrl) ??
    sourceDuLecteur(streamUrl, typeof location !== 'undefined' ? location.origin : null);
  if (force || currentUrl !== relativeUrl) {
    // Une vraie source remplace le silence du déverrouillage iOS : ses
    // événements comptent de nouveau, et le son ne reste pas en sourdine.
    deverrouillageEnCours = false;
    audio.muted = false;
    // Cache-bust when the URL is unchanged so the element fetches the new
    // track instead of replaying its buffered contents.
    audio.src =
      force && currentUrl === relativeUrl
        ? relativeUrl + (relativeUrl.includes('?') ? '&' : '?') + '_t=' + Date.now()
        : relativeUrl;
    sourceZoneId = typeof zoneId === 'number' && Number.isInteger(zoneId) ? zoneId : null;
    audio.load();
    browserStreamUrl.set(relativeUrl);
  }
  audio.volume = get(browserAudioVolume);
  audio.play().catch((e) => {
    console.warn('Browser audio play failed (may need user gesture):', e);
  });
}

/**
 * iOS Safari : l'élément audio ne joue qu'après un `play()` né d'un geste.
 *
 * Par le pont, entre l'appui sur Lecture et le `browserPlay` qui suit, il y a
 * l'aller-retour `POST /zones/{id}/play` par le relais : plus d'une seconde
 * en 5G. Safari a alors oublié le geste et refuse `play()`
 * (`NotAllowedError`) — la zone « joue » sur le serveur, le téléphone se tait.
 *
 * Au PREMIER geste sur la page, on fait jouer à l'élément un silence de
 * quelques octets, en sourdine, puis on le rend vide : WebKit lève la
 * restriction pour cet élément, et les `play()` suivants passent, geste ou
 * non. Rien n'est fait si l'élément a déjà une source.
 */
const SILENCE_WAV =
  // Un dixième de seconde de silence (WAV 8 bits, 8 kHz, mono).
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
let deverrouillageEnCours = false;

export function deverrouillerAuPremierGeste(cible: EventTarget = document): void {
  const gestes = ['touchend', 'pointerup', 'click', 'keydown'];
  const unFois = () => {
    for (const g of gestes) cible.removeEventListener(g, unFois, true);
    const audio = getAudio();
    if (audio.src || get(browserStreamUrl) !== null) return;
    deverrouillageEnCours = true;
    audio.muted = true;
    audio.src = SILENCE_WAV;
    const fin = () => {
      deverrouillageEnCours = false;
      audio.muted = false;
      // 🔴 Le geste qui déverrouille est souvent CELUI qui lance la lecture :
      // le `browserPlay` du bouton peut avoir posé la vraie source avant que
      // ce silence ait fini de démarrer. On ne vide alors RIEN — sinon on
      // couperait le flux qu'on vient d'ouvrir.
      if (audio.src !== SILENCE_WAV) return;
      audio.pause();
      audio.removeAttribute('src');
    };
    try {
      const p = audio.play();
      if (p && typeof p.then === 'function') p.then(fin, fin);
      else fin();
    } catch {
      fin();
    }
  };
  for (const g of gestes) cible.addEventListener(g, unFois, true);
}

/** Pause browser audio */
export function browserPause() {
  const audio = getAudio();
  audio.pause();
}

/**
 * L'élément a-t-il encore une source jouable, ou faut-il la recharger ?
 *
 * Pendant une pause, le navigateur cesse de lire la réponse HTTP et finit par
 * lâcher la connexion. La session de flux côté serveur est à consommateur
 * unique : on ne peut pas la reprendre en cours de route. `audio.play()` sur
 * un élément dans cet état ne produit alors aucun son — et aucune erreur non
 * plus, ce qui est le pire des deux mondes (Alex, « No sound », 0.9.68 Linux :
 * pause, retour au navigateur, Lecture, silence).
 *
 * Les trois états qui imposent un rechargement :
 *   - pas de source du tout ;
 *   - l'élément porte une erreur média ;
 *   - `readyState === HAVE_NOTHING` (0) : plus une seule donnée en réserve.
 *
 * Une pause courte laisse l'élément avec son tampon et un `readyState` ≥ 1 :
 * on reprend alors sans recharger, sinon on ferait repartir le morceau du
 * début à chaque pause.
 */
export function needsSourceReload(audio: {
  src?: string;
  error?: unknown;
  readyState?: number;
}): boolean {
  if (!audio.src) return true;
  if (audio.error) return true;
  return (audio.readyState ?? 0) === 0;
}

/**
 * Resume browser audio.
 *
 * `streamUrl` est l'URL courante de la zone, quand l'appelant la connaît. Sans
 * elle on ne peut que tenter la reprise à l'aveugle — c'est ce que faisait
 * cette fonction, et c'était l'asymétrie du bug : le chemin événementiel
 * (App.svelte) re-pointait bien l'élément sur `stream_url`, le bouton Lecture
 * non.
 */
export function browserResume(streamUrl?: string | null, zoneId?: number | null) {
  const audio = getAudio();
  if (streamUrl) {
    // Source morte pendant la pause → on la redemande au serveur. Sinon on
    // délègue à browserPlay, qui recharge si l'URL a changé et se contente de
    // relancer si elle est identique : c'est exactement ce que faisait déjà le
    // chemin événementiel, et il ne faut pas le perdre.
    browserPlay(streamUrl, needsSourceReload(audio), zoneId);
    return;
  }
  if (audio.src) {
    audio.play().catch((e) => {
      console.warn('Browser audio resume failed:', e);
    });
  }
}

/** Stop browser audio and clear the source */
export function browserStop() {
  const audio = getAudio();
  // Décidé AVANT d'oublier le propriétaire : arrêter la zone navigateur ne doit
  // pas figer la barre d'une autre zone affichée (#2108).
  const pilote = pilotLaBarreAffichee();
  sourceZoneId = null;
  echecsConsecutifs = 0;
  audio.pause();
  audio.removeAttribute('src');
  audio.load(); // reset
  browserStreamUrl.set(null);
  browserAudioPlaying.set(false);
  if (pilote) stopSeekTimer();
}

/** Un arrêt serveur ne doit atteindre que le média de cette zone. */
export function browserStopForZone(zoneId: number): boolean {
  if (!audioElement || sourceZoneId === null || sourceZoneId !== zoneId) return false;
  browserStop();
  return true;
}

/**
 * La position que joue l'élément, en ms, s'il joue la zone `zoneId` — sinon
 * `null` (fil 1476 : seul l'onglet connaît la position d'une zone navigateur).
 */
export function browserPositionMsPour(zoneId: number): number | null {
  if (!audioElement || sourceZoneId !== zoneId) return null;
  const t = audioElement.currentTime;
  return Number.isFinite(t) ? Math.floor(t * 1000) : null;
}

/** Seek to a position in milliseconds */
export function browserSeek(positionMs: number) {
  const audio = getAudio();
  if (audio.duration && isFinite(audio.duration)) {
    audio.currentTime = positionMs / 1000;
    seekPositionMs.set(positionMs);
  }
}

/** Set browser audio volume (0..1) */
export function browserSetVolume(volume: number) {
  browserAudioVolume.set(volume);
  const audio = getAudio();
  audio.volume = Math.max(0, Math.min(1, volume));
}

/** Clean up the audio element (call on app destroy) */
export function browserAudioDestroy() {
  sourceZoneId = null;
  echecsConsecutifs = 0;
  sautEnCours = false;
  if (audioElement) {
    audioElement.pause();
    audioElement.removeAttribute('src');
    audioElement.load();
    audioElement = null;
  }
  browserStreamUrl.set(null);
  browserAudioPlaying.set(false);
}
