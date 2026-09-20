/**
 * État VIVANT de la lecture pour le nouveau client.
 *
 * ## Pourquoi ce fichier existe
 *
 * `v2Bootstrap` charge les données STATIQUES — zones, albums, appareils,
 * profils, licence — une fois, au montage. Il ne raccorde rien de vivant.
 *
 * Or `?v2` monte `ShellV2` À LA PLACE de `App.svelte`, et c'est `App` qui
 * possède toute la plomberie temps réel : connexion WebSocket, rafraîchissement
 * des zones, minuteur de progression, report de la répétition et de la lecture
 * aléatoire. Rien de tout cela ne tournait dans le nouveau client.
 *
 * Constaté par Bertrand le 01/09/2026, la barre de transport historique une
 * fois montée dans le shell v2 : « la barre de progression est mal branchée
 * ainsi que le statut des boutons ». Elle n'était pas mal branchée — personne
 * ne l'alimentait.
 *
 * ## Ce qui manquait, exactement
 *
 * `currentTrack` et `playbackState` DÉRIVENT de `currentZone`, donc de `zones`.
 * Ils se mettent à jour tout seuls… à condition que `zones` bouge. Chargé une
 * fois et jamais rafraîchi, l'écran restait figé sur l'état du montage.
 *
 * Trois manques distincts, et il faut les trois :
 *
 *  1. **La liste des zones** ne se rafraîchissait pas → piste et état de
 *     lecture figés (`zone.updated`).
 *  2. **Le minuteur de progression** ne tournait pas → la barre n'avançait
 *     jamais, même en lecture.
 *  3. **Répétition et aléatoire** n'arrivent QUE par l'événement `snapshot` —
 *     ni `/zones` ni `/zones/{id}` ne les portent. Sans lui, ces deux boutons
 *     affichent éternellement leur valeur par défaut.
 *
 * ## Ce que ce module n'est PAS
 *
 * Ce n'est pas un fork du gestionnaire d'événements d'`App` : c'est le
 * sous-ensemble qui fait vivre le TRANSPORT. Les branches propres à l'app
 * historique — YouTube, zones navigateur, onboarding — n'y sont pas, et n'ont
 * rien à y faire.
 *
 * ⚠️ La fenêtre de grâce, elle, EST ici depuis le 09/09/2026, et ce n'est pas
 * une entorse : elle est indissociable de l'ÉCHEC DE LECTURE, qui ne pouvait
 * pas rester dehors (#3732, #3737). Voir la branche `zone.playback_error`.
 *
 * Le jour où `App` extraira sa boucle complète dans un module partagé, ce
 * fichier disparaîtra au profit de celui-là. En attendant, il est court et
 * délibérément limité.
 */
import { get } from 'svelte/store';
import * as api from './api';
import { tuneWS } from './websocket';
import {
  zones,
  currentZone,
  currentZoneId,
  playPendingUntil,
  suppressedByPlayGrace,
} from './stores/zones';
import { queueTracks, queuePosition, queueLength } from './stores/queue';
import { handleAudioLevelsEvent } from './stores/audioLevels';
import { notifications } from './stores/notifications';
import { healthStatus } from './stores/health';
import { niveauApresAlerte } from './santeServeur';
import { tachesDeFond } from './stores/tachesDeFond';
import { t } from './i18n';
import { signalerErreurServeur } from './echecLecture';
import { playbackHistory } from './stores/history';
import { noterSiDebutDEcoute } from './historiqueEcoutes';
import { appliquerEvenementAudioNavigateur } from './audioNavigateurSync';
import { isBrowserZone, browserPlay, browserPause, browserResume, browserStop } from './stores/browserAudio';
import { urlFlux } from './bridge';
import {
  seekPositionMs,
  startSeekTimer,
  stopSeekTimer,
  repeatMode,
  shuffleEnabled,
  nowPlayingToTrack,
} from './stores/nowPlaying';
import { mergeTransport, type TransportState } from './transportSync';
import {
  positionApresReleve,
  clePisteEnCours,
  type SuiviPosition,
} from './positionLecture';
import { positionFileAnnoncee } from './suiviPisteEnCours';
import { doitRechargerLaFile } from './rechargementFile';

/**
 * Écart au-delà duquel la position du serveur corrige l'interpolation locale.
 *
 * En dessous, on garde l'horloge locale : le minuteur avance en continu, là où
 * les points du serveur arrivent par sauts. Corriger à chaque point ferait
 * osciller la barre au lieu de la faire glisser. Même valeur qu'`App`.
 */
const DERIVE_MAX_MS = 2000;

/** Dernier transport connu par zone — les charges utiles sont PARTIELLES. */
const transportParZone = new Map<number, TransportState>();

/**
 * Applique répétition et aléatoire d'une zone, si c'est la zone courante.
 *
 * Le fusionnement est nécessaire : un `snapshot` peut ne porter que l'un des
 * deux, et écraser l'autre avec `undefined` éteindrait un bouton allumé.
 */
function transportDepuisZone(zone: unknown): void {
  const z = zone as { id?: unknown } | null;
  if (!z || typeof z.id !== 'number') return;
  const fusion = mergeTransport(transportParZone.get(z.id), zone);
  transportParZone.set(z.id, fusion);
  if (z.id !== get(currentZoneId)) return;
  if (fusion.repeat) repeatMode.set(fusion.repeat);
  if (typeof fusion.shuffle === 'boolean') shuffleEnabled.set(fusion.shuffle);
}

/**
 * Aplatit le sous-objet `quality` des sources de streaming.
 *
 * Le serveur le rend imbriqué pour Qobuz et consorts, alors que l'interface lit
 * `format` / `sample_rate` / `bit_depth` à plat. Sans cela, la ligne technique
 * de la barre reste vide sur tout ce qui vient d'un service.
 */
function aplatirQualite(zoneList: any[]): void {
  for (const z of zoneList) {
    const q = z?.current_track?.quality;
    if (!q || typeof q !== 'object') continue;
    const t = z.current_track;
    if (q.codec && !t.format) t.format = String(q.codec).toLowerCase();
    if (q.sample_rate && !t.sample_rate) t.sample_rate = q.sample_rate;
    if (q.bit_depth && !t.bit_depth) t.bit_depth = q.bit_depth;
    if (q.channels && !t.channels) t.channels = q.channels;
  }
}

/**
 * L'événement concerne-t-il la zone qu'on regarde ?
 *
 * Le GROUPE compte : une zone groupée reçoit les événements de la zone
 * meneuse, sous l'identifiant de celle-ci. Ne comparer que les identifiants
 * laisserait une zone groupée sans progression — même règle qu'`App`.
 */
function concerneLaZoneCourante(event: any): boolean {
  const id = event?.data?.zone_id ?? event?.zone_id;
  const courante = get(currentZone) as { id?: number; group_id?: number | null } | null;
  if (!courante) return false;
  if (courante.id === id) return true;
  if (courante.group_id == null) return false;
  const emettrice = (get(zones) as any[]).find((z) => z?.id === id);
  return emettrice?.group_id === courante.group_id;
}

/**
 * La piste à laquelle la position affichée appartient — #954.
 *
 * Sans ce souvenir, impossible de savoir qu'un relevé parle encore du morceau
 * PRÉCÉDENT. Réinitialisé au débranchement, pour qu'une coquille remontée ne
 * compare pas à la piste d'une session d'avant.
 */
let suivi: SuiviPosition = { clePiste: null, positionMs: 0 };

/** Repartir de la piste que joue la zone qu'on vient de choisir — #954. */
function suiviDeZone(id: number | null | undefined): void {
  const z = (get(zones) as any[]).find((x) => x?.id === id);
  suivi = { clePiste: clePisteEnCours(z), positionMs: 0 };
}

/** Minuteur et position, pour la zone courante uniquement. */
function suivreProgression(zoneList: any[]): void {
  const id = get(currentZoneId);
  const zone = id != null ? zoneList.find((z) => z?.id === id) : null;
  if (!zone) return;

  /**
   * 🔴 #954 — LA POSITION EST REFUSÉE TANT QU'ELLE PARLE DE L'ANCIENNE PISTE.
   *
   * Mesuré sur la .18 le 13/09/2026 : au `next`, l'objet de zone reste
   * incohérent une à deux secondes — `queue_position` a déjà avancé,
   * `current_track` et `position_ms` portent encore le morceau d'avant. Cette
   * fonction recopiait la position telle quelle : la barre montrait donc 68 s
   * sur un titre qui venait de commencer. « The timeline will stay in the same
   * place. »
   *
   * `App.svelte` tenait déjà la moitié de cette règle (`seekPositionMs.set(0)`
   * sur `playback.track_changed`) ; cette coquille n'en avait rien. La règle
   * vit maintenant dans `lib/positionLecture`, partagée.
   */
  const d = positionApresReleve(suivi, zone, get(seekPositionMs), DERIVE_MAX_MS);
  suivi = d.suivi;
  if (zone.state === 'playing') startSeekTimer(); else stopSeekTimer();
  if (d.ecrire) seekPositionMs.set(d.suivi.positionMs);
}

/**
 * Recharge la file d'attente de la zone courante.
 *
 * Elle n'était JAMAIS chargée sous `?v2` : `App` seul appelait `fetchQueue`.
 * Résultat, `upNextCount` valait éternellement zéro — la barre de transport
 * annonçait « rien à venir » sur une file pleine, et le bouton « suivant »
 * s'en servait pour se désactiver.
 */
async function rechargerFile(): Promise<void> {
  const zone = get(currentZone) as { id?: number } | null;
  if (!zone?.id) return;
  try {
    const q = await api.getQueue(zone.id);
    queuePosition.set(q.position);
    queueTracks.set(q.tracks);
    queueLength.set(q.length);
  } catch {
    // File momentanément illisible : on garde la précédente plutôt que
    // d'annoncer une file vide, ce qui éteindrait le bouton « suivant ».
  }
}

/**
 * Dernier échec annoncé, pour ne pas empiler douze fois le même bandeau.
 *
 * Mesuré chez le testeur du 09/09 : douze clics en quatorze minutes, douze
 * `zone.playback_error` RIGOUREUSEMENT identiques. Le conteneur de bandeaux
 * n'en empile que trois proprement ; au-delà ils se recouvrent. Remplacer le
 * silence par un mur de bandeaux identiques serait un autre défaut.
 *
 * La fenêtre est courte exprès : deux échecs distants de plus de trois
 * secondes sont deux gestes de l'utilisateur, et chacun mérite sa réponse.
 */
let dernierEchec: { texte: string; a: number } | null = null;
const REPETITION_MS = 3000;

function dejaAnnonce(texte: string): boolean {
  const maintenant = Date.now();
  if (dernierEchec && dernierEchec.texte === texte && maintenant - dernierEchec.a < REPETITION_MS) {
    return true;
  }
  dernierEchec = { texte, a: maintenant };
  return false;
}

/** Recharge les zones depuis l'API — après un événement qui change la piste. */
async function rechargerZones(): Promise<void> {
  try {
    const liste = await api.getZones();
    aplatirQualite(liste as any[]);
    zones.set(liste);
    suivreProgression(liste as any[]);
  } catch {
    // Serveur momentanément muet : on garde l'état précédent plutôt que de
    // vider l'écran. Le prochain événement corrigera.
  }
}

/**
 * Raccorde le transport au serveur. Rend la fonction d'arrêt.
 *
 * À appeler une fois, au montage de la coquille v2.
 */
export function demarrerTransportV2(): () => void {
  tuneWS.connect();

  // Le poller doit savoir quelle zone suivre, sinon il ne remonte pas sa file.
  const desabonnerZone = currentZoneId.subscribe((id) => {
    tuneWS.setCurrentZoneId(id);
    // Changer de zone change de file : sans cela, la barre garderait le
    // « à venir » de la zone précédente.
    void rechargerFile();
    // Et change de PISTE : le souvenir suit, sinon le premier relevé de la
    // nouvelle zone passerait pour « même piste » (#954).
    //
    // 🔴 Posé APRÈS `rechargerFile()`, et le commentaire tenu court : la garde
    // de `v2TransportVivant` vérifie que cet appel reste à moins de quatre
    // cents caractères du `subscribe`. Une première version l'avait poussé
    // dehors — le comportement n'avait pas bougé, la garde ne le voyait plus.
    suiviDeZone(id);
  });

  const desabonnerEvents = tuneWS.onEvent((event: any) => {
    const type = event?.type as string | undefined;
    if (!type) return;

    // Alerte de santé du serveur — portée d'`App.svelte`, que cette coquille ne
    // monte pas : un serveur en état critique ne se signalait nulle part.
    if (type === 'system.health_alert' && event.data) {
      const niveau = event.data.level;
      const message = event.data.message || get(t)('sidebar.serverStatus');
      healthStatus.update((cur) => niveauApresAlerte(cur, niveau));
      if (niveau === 'critical') notifications.error(message, 10000);
      else if (niveau === 'warning') notifications.info(message, 6000);
      return;
    }

    // Tâches de fond (#2227) — portées d'`App.svelte`, que cette coquille ne
    // monte pas. La barre latérale en tire sa ligne « enrichissement en cours ».
    if (type === 'system.background_tasks') {
      tachesDeFond.set(Array.isArray(event.data?.tasks) ? event.data.tasks : []);
      return;
    }

    // Répétition et aléatoire : le `snapshot` en est la SEULE source.
    if (type === 'snapshot' && Array.isArray(event.data?.zones)) {
      for (const z of event.data.zones) transportDepuisZone(z);
      return;
    }

    // Mise à jour groupée des zones — l'état de lecture et la piste en vivent.
    if (type === 'zone.updated' && Array.isArray(event.data?.zones)) {
      const liste = event.data.zones as any[];
      aplatirQualite(liste);
      zones.set(liste);
      for (const z of liste) transportDepuisZone(z);
      suivreProgression(liste);
      return;
    }

    // 🔴 Les NIVEAUX audio arrivent en continu — plusieurs trames par seconde.
    //
    // Ils tombaient dans la branche générique `playback.*`, qui recharge
    // `/zones` : une requête complète par trame de vumètre. C'est le premier
    // poste de dépense de cet écran, et il ne servait à rien — l'événement
    // porte déjà tout ce que l'analyseur affiche.
    //
    // Traité EN PREMIER et suivi d'un `return`, comme dans `App` : toute
    // branche placée avant lui paierait le même prix.
    if (type === 'playback.audio_levels') {
      handleAudioLevelsEvent(event.data);
      return;
    }

    // 🔴 L'ÉCHEC DE LECTURE — le canal que la coquille v2 n'écoutait PAS.
    //
    // #3732 / #3737 : `?v2` monte `ShellV2` À LA PLACE de `App`, et la seule
    // branche du client qui affichait un échec vivait dans `App.svelte`. Un
    // `grep -c "playback\|error"` sur ce fichier rendait 0 : DAC absent, refus
    // exclusif, sortie disparue, `400 no tracks to play` — rien n'atteignait
    // l'écran, alors que le serveur pousse un message complet, qui NOMME
    // l'appareil demandé et les endpoints disponibles.
    //
    // Le serveur Rust émet `zone.playback_error` ; le serveur embarqué iPad
    // émet `playback.error`. Les deux, comme `App` le fait — sans quoi
    // l'événement Rust n'entrerait dans aucune branche, puisqu'il ne commence
    // même pas par `playback.`.
    //
    // ⚠️ Placé AVANT le bloc générique `playback.*`, qui se contenterait de
    // recharger les zones en silence.
    if (type === 'zone.playback_error' || type === 'playback.error') {
      const zoneId = event?.data?.zone_id as number | null | undefined;
      // La fenêtre de grâce, telle que la v1 la tient (#1146) : pendant les
      // trente secondes qui suivent un Lire, une erreur PASSAGÈRE est le
      // pré-transcodage HI-RES qui travaille encore, pas une panne.
      //
      // `fatal` la contourne, et c'est tout l'enjeu : un périphérique audio
      // qui refuse de s'ouvrir ne guérira pas, et le serveur le rapporte en
      // moins d'une seconde — donc en PLEIN dans la fenêtre. L'y taire
      // afficherait « chargement… » puis plus rien du tout, puisque cette
      // erreur-là n'est émise qu'une fois et que la zone s'arrête juste après.
      if (suppressedByPlayGrace(zoneId, event?.data?.fatal === true)) {
        notifications.info(get(t)('common.loading'));
        void rechargerZones();
        return;
      }
      const brut = event?.data?.message || event?.data?.error || '';
      if (!dejaAnnonce(`${brut}|${event?.data?.track_title ?? ''}`)) {
        signalerErreurServeur(event?.data);
      }
      void rechargerZones();
      return;
    }

    // Le volume peut changer AILLEURS — depuis l'appareil lui-même, ou depuis
    // un autre client. Sans cela, le curseur de la barre reste sur la dernière
    // valeur qu'on lui a donnée soi-même.
    if (type === 'zone.volume_changed' && event.data?.zone_id !== undefined) {
      const { zone_id, volume } = event.data;
      zones.update((liste: any[]) =>
        liste.map((z) => (z?.id === zone_id ? { ...z, volume } : z)),
      );
      return;
    }

    // Une zone qui apparaît, disparaît ou revient change la LISTE : la relire
    // est le seul moyen d'en connaître l'état complet.
    if (
      type === 'zone.created' ||
      type === 'zone.deleted' ||
      type === 'zone.offline' ||
      type === 'zone.recovered'
    ) {
      void rechargerZones();
      return;
    }

    // 🔴 Le DÉPLACEMENT est confirmé par le serveur : on saute, sans relire.
    //
    // C'est ici que le curseur de progression était cassé. Tout `playback.*`
    // déclenchait un rechargement complet de `/zones` ; la réponse arrivait
    // avec l'ANCIENNE position, l'écart dépassait le seuil de dérive, et la
    // barre revenait en arrière. On glissait le curseur et il sautait à sa
    // place d'avant — « le slider ne marche pas » (Bertrand, 02/09/2026).
    if (type === 'playback.seek' && event.data?.position_ms !== undefined) {
      if (concerneLaZoneCourante(event)) {
        seekPositionMs.set(event.data.position_ms);
        startSeekTimer();
      }
      return;
    }

    // La position courante arrive en continu. La relire par `/zones` faisait
    // une requête par point — une tempête d'appels pour une valeur que
    // l'événement porte déjà.
    if (type === 'playback.position' && event.data?.position_ms !== undefined) {
      if (
        concerneLaZoneCourante(event) &&
        Math.abs(get(seekPositionMs) - event.data.position_ms) > DERIVE_MAX_MS
      ) {
        seekPositionMs.set(event.data.position_ms);
        startSeekTimer();
      }
      return;
    }

    // Les autres événements de lecture changent la PISTE ou la file : eux
    // demandent bien une relecture, l'événement ne la porte pas.
    if (type.startsWith('playback.')) {
      // La lecture a VRAIMENT démarré : on ferme la fenêtre de grâce, sans quoi
      // une erreur survenue plus tard dans les trente secondes passerait encore
      // pour « chargement… ». `App` fait exactement cela (#1146) ; ici rien ne
      // le faisait, car `rechargerZones()` écrit `zones` en bloc au lieu de
      // passer par `syncZone`.
      const zid = event?.data?.zone_id;
      if (zid != null && (type === 'playback.started' || type === 'playback.track_changed')) {
        playPendingUntil.delete(zid);
      }
      void rechargerZones().then(() => {
        /**
         * 🔴 #889 — L'HISTORIQUE LOCAL, QUE CETTE COQUILLE N'ÉCRIVAIT PAS.
         *
         * Reivax66, fil « Historique radio », 08/09/2026 : « Les morceaux
         * écoutés avec les radios live ne figurent plus dans l'historique
         * depuis le 06/09/2026. »
         *
         * L'écran fusionne le serveur et le magasin local. Le serveur n'écrit
         * pas la radio — une écoute y est indexée sur un identifiant de
         * `tracks`, qu'un titre de radio n'a pas. La radio ne tenait donc QUE
         * par le magasin local, dont l'unique écrivain vivait dans
         * `App.svelte` — que `?v2` ne monte jamais. D'où la forme exacte du
         * symptôme : les pistes locales restent, la radio disparaît.
         *
         * APRÈS le rechargement, pas avant : c'est lui qui pose la nouvelle
         * piste dans `currentZone`. Noter avant reviendrait à réécrire
         * l'ANCIENNE, et donc à la dédoublonner contre elle-même.
         *
         * La règle vit dans `historiqueEcoutes`, partagée avec `App` : deux
         * copies divergeraient au premier correctif — ce qui vient
         * précisément d'arriver.
         */
        const courante = get(currentZone) as any;
        const emettrice = (get(zones) as any[]).find((z) => z?.id === zid);

        /**
         * 🔴 #1171 — L'AUDIO NAVIGATEUR, QUE CETTE COQUILLE NE PILOTAIT PAS.
         *
         * Bilou, fil 1770 (0.9.148, Windows) : « vider la file d'attente ne
         * coupe pas la lecture en cours ». Quand la zone sort sur le
         * navigateur, c'est un élément `<audio>` local qui joue : le serveur ne
         * peut pas l'arrêter, il émet `playback.stopped` et c'est au client
         * d'appeler `browserStop()`.
         *
         * Cet appel vivait dans `App.svelte`, que `?v2` ne monte jamais. Ni
         * l'arrêt, ni la pause, ni la reprise, ni le rechargement au changement
         * de piste n'atteignaient donc l'élément. Même défaut que #889, au même
         * endroit — la règle est partagée, pas recopiée.
         *
         * APRÈS `rechargerZones()` : c'est lui qui rafraîchit `stream_url`, et
         * le changement de piste en a besoin.
         */
        appliquerEvenementAudioNavigateur(
          type,
          emettrice,
          (zz) => isBrowserZone(zz as any),
          (zz) => urlFlux((zz as any)?.stream_url, (zz as any)?.stream_url_remote) ?? undefined,
          {
            jouer: (src, forcer) => browserPlay(src, forcer),
            pause: () => browserPause(),
            reprendre: (src) => browserResume(src),
            arreter: () => browserStop(),
          },
        );

        noterSiDebutDEcoute(
          type, zid, courante, emettrice,
          nowPlayingToTrack,
          (piste, nom) => playbackHistory.add(piste, nom),
        );
      });

      /**
       * 🔴 #1126 — LA FILE RECHARGÉE EN ENTIER À CHAQUE ÉVÉNEMENT.
       *
       * Ici se trouvait un `void rechargerFile()` SANS condition : pause,
       * reprise, volume, changement d'état — chacun redemandait la file
       * complète et réécrivait `queueTracks` en bloc. Alex Campbell,
       * 20/09/2026, playlist Qobuz de 1454 titres : « that seems to break my
       * session ». Mesuré sur sa file : onze événements d'une lecture
       * ordinaire, huit rechargements complets, 336 Ko chacun — 2688 Ko pour
       * une lecture qui n'a rien changé à la file.
       *
       * L'ancienne interface l'évitait explicitement, et le disait :
       * « no fetchQueue() here — playback.started/track_changed already
       * refetch the queue above, and playback.resumed never changes it »
       * (`App.svelte`, #1126). La bascule v2 a perdu la note avec l'écran.
       *
       * Le serveur porte `queue_position` DANS l'événement, et le fait exprès
       * depuis #1096 : une avance de piste ne déplace qu'un pointeur. On le
       * prend tel quel, sans le moindre aller-retour.
       *
       * La garde vit dans `rechargementFile`, et elle est écrite à l'envers —
       * elle liste ce qui NE change pas la file. Un événement neuf recharge
       * donc par défaut : couper trop produirait une file qui ment, ce qui ne
       * se voit pas.
       */
      const positionAnnoncee = positionFileAnnoncee(event.data);
      if (positionAnnoncee !== null && concerneLaZoneCourante(event)) {
        queuePosition.set(positionAnnoncee);
      }
      if (doitRechargerLaFile(type, positionAnnoncee !== null)) void rechargerFile();
    }
  });

  return () => {
    desabonnerEvents?.();
    desabonnerZone?.();
    stopSeekTimer();
    // Le souvenir de la piste suivie meurt avec le branchement : une coquille
    // remontée comparerait sinon à la piste d'une session d'avant, et refuserait
    // le premier relevé pour rien.
    suivi = { clePiste: null, positionMs: 0 };
  };
}
