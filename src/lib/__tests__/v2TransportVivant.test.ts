/**
 * La barre de transport du nouveau client doit être ALIMENTÉE.
 *
 * ## Le défaut
 *
 * `?v2` monte `ShellV2` À LA PLACE de `App.svelte`. Or c'est `App` qui possède
 * toute la plomberie temps réel : WebSocket, rafraîchissement des zones,
 * minuteur de progression, report de la répétition et de l'aléatoire.
 * `bootstrapV2` ne charge que du STATIQUE, une fois, au montage.
 *
 * Constaté par Bertrand le 01/09/2026, la barre historique une fois montée dans
 * le shell v2 : « la barre de progression est mal branchée ainsi que le statut
 * des boutons ». Elle n'était pas mal branchée — personne ne l'alimentait.
 *
 * ## Trois manques distincts, et il faut les trois
 *
 * `currentTrack` et `playbackState` DÉRIVENT de `currentZone`, donc de `zones` :
 * ils suivent tout seuls, à condition que `zones` bouge.
 *
 *  1. la liste des zones ne se rafraîchissait pas → piste et état figés ;
 *  2. le minuteur ne tournait pas → la barre n'avançait jamais ;
 *  3. répétition et aléatoire n'arrivent QUE par l'événement `snapshot` — ni
 *     `/zones` ni `/zones/{id}` ne les portent. Sans lui, ces deux boutons
 *     restent éternellement sur leur valeur par défaut.
 *
 * Corriger un seul des trois laisse une barre à moitié vivante — plus
 * trompeuse qu'une barre morte, parce qu'elle a l'air de fonctionner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const live = () => lire('../v2Live.ts');
const shell = () => lire('../../components/v2/ShellV2.svelte');

describe('Nouveau client — le transport est alimenté', () => {
  it('la coquille démarre le raccordement, et l’arrête au démontage', () => {
    const src = shell();
    expect(src.includes('demarrerTransportV2'), 'le raccordement n’est plus démarré').toBe(true);
    // `$effect(() => demarrerTransportV2())` : la valeur rendue EST le nettoyage.
    // Sans elle, le minuteur et l'abonnement survivent au démontage.
    expect(
      /\$effect\(\(\) => demarrerTransportV2\(\)\)/.test(src),
      'le retour de nettoyage est perdu : minuteur et abonnements survivraient au démontage.',
    ).toBe(true);
  });

  it('les zones sont rafraîchies en direct', () => {
    const src = live();
    expect(src.includes('tuneWS.connect()'), 'le WebSocket n’est plus connecté').toBe(true);
    expect(src.includes("type === 'zone.updated'"), 'la mise à jour groupée des zones a disparu').toBe(true);
    expect(src.includes('zones.set('), 'les zones ne sont plus écrites').toBe(true);
  });

  it('le minuteur de progression tourne, et se corrige sans osciller', () => {
    const src = live();
    expect(src.includes('startSeekTimer()'), 'le minuteur n’est plus démarré').toBe(true);
    expect(src.includes('stopSeekTimer()'), 'le minuteur n’est plus arrêté hors lecture').toBe(true);
    // Sans filtre de dérive, chaque point du serveur ferait sauter la barre au
    // lieu de la laisser glisser.
    expect(
      /DERIVE_MAX_MS\s*=\s*2000/.test(src),
      'le filtre de dérive a disparu ou changé : la barre oscillerait à chaque point serveur.',
    ).toBe(true);
  });

  it('répétition et aléatoire suivent le `snapshot`, seule source', () => {
    const src = live();
    expect(src.includes("type === 'snapshot'"), 'le snapshot n’est plus écouté').toBe(true);
    expect(src.includes('repeatMode.set('), 'la répétition n’est plus reportée').toBe(true);
    expect(src.includes('shuffleEnabled.set('), 'l’aléatoire n’est plus reporté').toBe(true);
  });

  it('les charges partielles sont FUSIONNÉES, pas écrasées', () => {
    // Un `snapshot` peut ne porter que l'un des deux. Écraser l'autre avec
    // `undefined` éteindrait un bouton allumé.
    expect(
      live().includes('mergeTransport(transportParZone.get(z.id), zone)'),
      'la fusion a disparu : une charge partielle éteindrait le bouton qu’elle ne mentionne pas.',
    ).toBe(true);
  });

  it('un serveur muet ne vide pas l’écran', () => {
    // Recharger les zones peut échouer. Vider `zones` afficherait « aucune
    // zone » — un écran vide qui ressemble à une réponse.
    const src = live();
    const i = src.indexOf('async function rechargerZones');
    const bloc = src.slice(i, src.indexOf('\n}', i));
    expect(bloc.includes('catch'), 'l’échec de rechargement n’est plus rattrapé').toBe(true);
    expect(
      /catch\s*\{[^}]*zones\.set/.test(bloc),
      'l’échec vide les zones : l’écran annoncerait « aucune zone » sur une simple coupure.',
    ).toBe(false);
  });
});

/**
 * « Lecture en cours » doit être atteignable depuis la coquille v2.
 *
 * L'écran n'y avait jamais été monté. Tant que le shell portait `PlayerV2`,
 * cela ne se voyait pas : cette barre-là ne proposait pas de l'ouvrir. Mais la
 * barre historique, elle, offre DEUX chemins — clic sur la piste
 * (`activeView.set('nowplaying')`) et, en mobile, `mobileNowPlayingOpen`.
 *
 * Résultat, signalé par Bertrand : « où est passée la vue Lecture en cours ? ».
 * Elle n'avait pas disparu — le clic tombait dans le repli « À venir ».
 *
 * Le garde tient les deux voies : en corriger une seule laisserait un chemin
 * mort, et c'est précisément le genre de moitié qu'on ne remarque pas.
 */
describe('Nouveau client — la vue « Lecture en cours »', () => {
  it('la vue plein écran est montée', () => {
    const src = shell();
    expect(src.includes("$activeView === 'nowplaying'"), 'la vue n’est plus routée').toBe(true);
    expect(src.includes('<NowPlaying />'), 'le composant n’est plus monté').toBe(true);
  });

  it('la voie mobile est écoutée', () => {
    // La barre pose ce drapeau au lieu de changer de vue. Sans écoute, le
    // geste ne produit rien du tout.
    expect(
      shell().includes('{#if $mobileNowPlayingOpen}'),
      'le drapeau mobile n’est plus écouté : le geste tactile ne mènerait nulle part.',
    ).toBe(true);
  });

  it('l’ouverture mobile offre une sortie', () => {
    // Une surcouche plein écran sans fermeture piège l'utilisateur.
    const src = shell();
    expect(src.includes('mobileNowPlayingOpen.set(false)'), 'aucun moyen de refermer la surcouche').toBe(true);
  });
});

/**
 * Le curseur de progression doit RESTER où on le pose.
 *
 * Bertrand, 02/09/2026 : « le slider ne marche pas ».
 *
 * ## La cause
 *
 * Tout `playback.*` déclenchait un rechargement complet de `/zones`. Après un
 * déplacement, la réponse arrivait avec l'ANCIENNE position ; l'écart dépassait
 * le seuil de dérive, et la barre revenait en arrière. On glissait le curseur,
 * il sautait à sa place d'avant.
 *
 * ## Trois branches manquaient, et chacune coûtait autre chose
 *
 *  1. `playback.seek` — le saut confirmé par le serveur, à appliquer tel quel ;
 *  2. `playback.position` — arrive en continu ; la relire par `/zones` faisait
 *     une requête par point ;
 *  3. `playback.audio_levels` — plusieurs trames par SECONDE, chacune
 *     déclenchant une requête complète. C'est le premier poste de dépense de
 *     l'écran, et il ne servait à rien : l'événement porte déjà tout.
 */
describe('Nouveau client — le curseur de progression', () => {
  it('un déplacement confirmé s’applique, sans relire les zones', () => {
    const src = live();
    const i = src.indexOf("type === 'playback.seek'");
    expect(i, 'la branche du déplacement a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 420);
    expect(bloc.includes('seekPositionMs.set'), 'la position n’est plus posée').toBe(true);
    expect(
      bloc.includes('rechargerZones'),
      'le déplacement relit les zones : la réponse arriverait avec l’ancienne position et la barre reviendrait en arrière.',
    ).toBe(false);
  });

  it('les niveaux audio ne déclenchent AUCUNE requête', () => {
    const src = live();
    const i = src.indexOf("type === 'playback.audio_levels'");
    expect(i, 'les niveaux audio ne sont plus traités').toBeGreaterThan(-1);
    // Ils doivent être traités AVANT la branche générique, sinon la requête
    // part quand même.
    expect(i, 'les niveaux sont traités après une branche qui recharge').toBeLessThan(
      src.indexOf("type.startsWith('playback.')"),
    );
    const bloc = src.slice(i, i + 240);
    expect(bloc.includes('handleAudioLevelsEvent'), 'l’analyseur n’est plus alimenté').toBe(true);
    expect(bloc.includes('return'), 'la branche ne coupe plus : la requête partirait quand même').toBe(true);
  });

  it('la position en continu est filtrée, pas rechargée', () => {
    const src = live();
    const i = src.indexOf("type === 'playback.position'");
    expect(i, 'la branche de position a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 400);
    expect(bloc.includes('DERIVE_MAX_MS'), 'le filtre de dérive a disparu').toBe(true);
    expect(bloc.includes('rechargerZones'), 'chaque point serveur déclenche une requête complète').toBe(false);
  });

  it('un événement de zone GROUPÉE est reconnu', () => {
    // Une zone groupée reçoit les événements sous l'identifiant de la meneuse.
    // Ne comparer que les identifiants la laisserait sans progression.
    expect(
      live().includes('function concerneLaZoneCourante'),
      'la reconnaissance de zone a disparu : une zone groupée n’avancerait plus.',
    ).toBe(true);
    expect(live().includes('courante.group_id'), 'le groupe n’est plus pris en compte').toBe(true);
  });
});

/**
 * La file d'attente n'était JAMAIS chargée sous `?v2`.
 *
 * Seul `App` appelait `fetchQueue`. `upNextCount` valait donc éternellement
 * zéro : la barre annonçait « rien à venir » sur une file pleine, et le bouton
 * « suivant » s'en sert pour se désactiver.
 */
describe('Nouveau client — la file d’attente', () => {
  it('elle est chargée, et rechargée au changement de zone', () => {
    const src = live();
    expect(src.includes('api.getQueue('), 'la file n’est plus lue').toBe(true);
    expect(src.includes('queueTracks.set('), 'les pistes ne sont plus écrites').toBe(true);
    const i = src.indexOf('currentZoneId.subscribe');
    expect(
      src.slice(i, i + 400).includes('rechargerFile()'),
      'changer de zone garderait le « à venir » de la zone précédente.',
    ).toBe(true);
  });

  it('une file illisible ne s’annonce pas vide', () => {
    // Vider la file éteindrait le bouton « suivant » sur une simple coupure.
    const src = live();
    const i = src.indexOf('async function rechargerFile');
    const bloc = src.slice(i, src.indexOf('\n}', i));
    expect(bloc.includes('catch'), 'l’échec n’est plus rattrapé').toBe(true);
    expect(/catch\s*\{[^}]*queueTracks\.set/.test(bloc), 'l’échec vide la file').toBe(false);
  });
});

/**
 * Le volume peut changer AILLEURS — depuis l'appareil, ou un autre client.
 */
describe('Nouveau client — le volume', () => {
  it('un changement venu d’ailleurs est répercuté', () => {
    expect(
      live().includes("type === 'zone.volume_changed'"),
      'le curseur de volume resterait sur la dernière valeur posée ici.',
    ).toBe(true);
  });

  it('une zone qui apparaît ou disparaît rafraîchit la liste', () => {
    const src = live();
    for (const e of ['zone.created', 'zone.deleted', 'zone.offline', 'zone.recovered']) {
      expect(src.includes(`type === '${e}'`), `l’événement ${e} n’est plus traité`).toBe(true);
    }
  });
});

/**
 * Un état écrit dans un `$effect` doit être DÉCLARÉ AVANT lui.
 *
 * Vécu le 02/09/2026 sur l'écran Podcasts : `topErreur` était écrit dans un
 * effet qui s'exécute au montage, et déclaré vingt lignes plus bas. L'effet
 * touchait une variable pas encore initialisée, levait une `ReferenceError`
 * AVANT de lancer la requête, et `topLoading` restait à `true` pour toujours —
 * « Chargement du palmarès… » éternel, sans erreur visible à l'écran.
 *
 * Le piège est propre aux runes : rien dans le typage ne l'attrape, et
 * `svelte-check` ne l'a pas vu non plus.
 */
describe('Podcasts — l’attente ne peut plus être éternelle', () => {
  const src = () => lire('../../components/v2/PodcastsV2.svelte');

  it('l’état d’erreur est déclaré avant l’effet qui l’écrit', () => {
    const s = src();
    const decl = s.indexOf('let topErreur = $state');
    const ecrit = s.indexOf('topErreur = null;');
    expect(decl, 'l’état d’erreur a disparu').toBeGreaterThan(-1);
    expect(ecrit, 'l’effet ne réinitialise plus l’erreur').toBeGreaterThan(-1);
    expect(
      decl,
      'la déclaration est passée APRÈS son écriture : l’effet lèverait au montage et l’attente serait éternelle.',
    ).toBeLessThan(ecrit);
  });

  it('un appel qui ne revient pas finit par le dire', () => {
    const s = src();
    expect(/DELAI_MS\s*=\s*15000/.test(s), 'le délai a disparu').toBe(true);
    expect(s.includes('avecDelai(api.getTopPodcasts('), 'le palmarès attend sans limite').toBe(true);
    expect(s.includes('avecDelai(api.getDiscoverPodcasts())'), 'la sélection attend sans limite').toBe(true);
    // Et il le DIT : un « aucun podcast » sur une panne se lit comme un
    // catalogue vide, et on cherche au mauvais endroit.
    expect(s.includes('v2.pod.topTimeout'), 'l’échec ne se distingue plus d’un catalogue vide').toBe(true);
  });

  it('un seul « Tous » dans les genres', () => {
    // `PODCAST_GENRES` commence déjà par `{ id: null, key: 'podcasts.genre.all' }`.
    expect(
      src().includes("$t('podcasts.genre.all' as any)}</button>"),
      'un second bouton « Tous » est revenu à côté de celui de la liste.',
    ).toBe(false);
  });
});
