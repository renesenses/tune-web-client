<script lang="ts">
  /**
   * Zones — nouveau client (direction Levente).
   *
   * Niveau Avancé. Une zone = une destination sonore. C'est l'écran qui
   * décide OÙ la musique sort, d'où le soin mis à dire la vérité sur l'état
   * de chaque sortie.
   *
   * `output_reach` (#1499) répond à une question que `online` ne pose pas :
   * « le son a-t-il une destination ? ». Une zone navigateur est toujours
   * `online`, même quand aucun onglet n'écoute — c'est précisément le cas
   * `browser_unattended`. Absent des serveurs < 0.9.70 : l'absence vaut `ok`,
   * on ne signale donc pas une panne imaginaire sur un serveur ancien.
   *
   * Densité :
   *   Avancé → choisir la zone active, volume, renommer, créer, supprimer.
   *   Expert → type de sortie, volume fixe, plafond de fréquence, DSD.
   */
  import * as api from '../../lib/api';
  import { zones, currentZoneId } from '../../lib/stores/zones';
  import { chargerLesZones, etatDesZones, listeVraimentVide } from '../../lib/chargementDesZones';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import type { Zone, StereoPairInfo } from '../../lib/types';
  import { t } from '../../lib/i18n';
  import { zonesAppairables, parametresPaire, voieDeLaZone } from '../../lib/pairesStereo';
  import '../../styles/tune-v2.css';
  import { appareilDeLaZone, lireVueZones, ecrireVueZones, type VueZones } from '../../lib/vueZones';
  import { chargerCatalogueTuneTested, indexer, appareilTuneTeste, type AppareilTuneTested } from '../../lib/tuneTested';
  import BadgeTuneTested from './BadgeTuneTested.svelte';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import { candidatsNouvelleZone, libelleCandidat, type CandidatZone } from '../../lib/appareilsNouvelleZone';

  /**
   * Grille ou liste. La GRILLE est le défaut — c'est la vue demandée — et la
   * liste reste disponible : elle porte la densité experte (drapeaux de zone,
   * volume fin) que des cartes de 230 px ne tiennent pas.
   */
  let vue = $state<VueZones>('grille');
  $effect(() => { vue = lireVueZones(); });
  function choisirVue(v: VueZones) { vue = v; ecrireVueZones(v); }

  // Le catalogue Tune tested : une requête par navigateur et par jour, cache
  // compris. L'effet ne lit RIEN de ce qu'il écrit.
  let indexTuneTested = $state<Map<string, AppareilTuneTested>>(new Map());
  $effect(() => {
    chargerCatalogueTuneTested()
      .then((c) => { indexTuneTested = indexer(c); })
      .catch(() => { /* le badge se tait, l'écran s'affiche */ });
  });
  const tuneTestedDe = (z: Zone): AppareilTuneTested | null => appareilTuneTeste(indexTuneTested, z);

  /** La ligne « appareil » d'une carte, ou le type de sortie à défaut. Mesuré
   *  sur le .18 : neuf zones sur quatorze n'ont aucune identité. */
  function appareilOuSortie(z: Zone): string {
    return appareilDeLaZone(z) ?? (OUTPUTS[z.output_type ?? 'local'] ?? String(z.output_type ?? ''));
  }
  /** Le type de sortie en surtitre, seulement quand l'appareil est nommé —
   *  sinon la carte écrirait deux fois la même chose. */
  function sortieSecondaire(z: Zone): string | null {
    return appareilDeLaZone(z) ? (OUTPUTS[z.output_type ?? 'local'] ?? null) : null;
  }

  const level = $derived($preferences.settingsLevel);
  const showExpert = $derived(atLeast(level, 'expert'));

  let busy = $state(false);
  let error = $state<string | null>(null);
  let renaming = $state<number | null>(null);
  let draft = $state('');
  let creating = $state(false);
  let newName = $state('');
  /**
   * L'APPAREIL de la nouvelle zone — obligatoire depuis tune-server-rust #3835 :
   * sans lui, `POST /zones` répond `zone_sans_appareil`. Voir
   * `lib/appareilsNouvelleZone`.
   */
  let candidats = $state<CandidatZone[]>([]);
  let choix = $state('');
  const candidatChoisi = $derived(candidats.find((c) => c.cle === choix) ?? null);
  async function ouvrirCreation() {
    creating = true;
    choix = '';
    const [locaux, decouverts] = await Promise.all([
      api.getAudioDevices().catch(() => []),
      api.getDevices().catch(() => []),
    ]);
    candidats = candidatsNouvelleZone(locaux, decouverts, $zones, $t('zone.browserOutput' as any));
  }
  function fermerCreation() {
    creating = false;
    newName = '';
    choix = '';
  }
  let confirmDelete = $state<number | null>(null);

  /**
   * Paires stéréo — deux zones, une voie chacune.
   *
   * La fonction existait côté serveur (`/zones/stereo-pair`) et dans le client
   * actuel ; elle n'avait jamais été reprise ici. Mesure sur le .18 le
   * 04/09/2026 : `GET /zones/stereo-pairs` répond 200, six zones DLNA sont
   * appairables, aucune paire n'existe.
   *
   * DLNA SEULEMENT, comme dans le client actuel : l'appairage repose sur deux
   * renderers qu'on pilote séparément, et le serveur ne connaît ce découpage
   * que là.
   *
   * On demande EXPLICITEMENT quelle zone tient la voie gauche. Le client
   * actuel déduit gauche et droite de l'ordre de sélection dans un `Set` —
   * l'ordre d'insertion, invisible à l'écran. Se tromper de voie ne se voit
   * pas : la scène stéréo est simplement inversée, et rien ne le dit.
   */
  let paires = $state<StereoPairInfo[]>([]);
  let formPaire = $state(false);
  let zoneGauche = $state<number | null>(null);
  let zoneDroite = $state<number | null>(null);
  let nomPaire = $state('');

  const appairables = $derived(zonesAppairables($zones));
  const params = $derived(parametresPaire($zones, zoneGauche, zoneDroite, nomPaire));

  async function chargerPaires() {
    // Un serveur qui ne connaît pas la route ne doit pas faire rougir l'écran :
    // la section disparaît, le reste des zones continue de fonctionner.
    try { paires = await api.listStereoPairs(); }
    catch { paires = []; }
  }
  $effect(() => { void chargerPaires(); });

  function voie(z: Zone): 'left' | 'right' | null {
    return voieDeLaZone(paires, z.id);
  }

  function creerPaire() {
    const p = params;
    if (!p) return;
    formPaire = false; nomPaire = ''; zoneGauche = null; zoneDroite = null;
    act(async () => {
      await api.createStereoPair(p.nom, p.appareilGauche, p.appareilDroit);
      await chargerPaires();
    });
  }
  function defairePaire(pairId: string) {
    act(async () => {
      await api.dissolveStereoPair(pairId);
      await chargerPaires();
    });
  }
  /** Nom proposé : les deux zones, dans l'ordre des voies. */
  function nomPropose() {
    const g = $zones.find((z) => z.id === zoneGauche)?.name;
    const d = $zones.find((z) => z.id === zoneDroite)?.name;
    if (g && d && !nomPaire.trim()) nomPaire = `${g} + ${d}`;
  }

  async function refresh() {
    // #1096 : la liste n'est écrasée que si le chargement a RÉUSSI, et
    // `etatDesZones` porte la différence entre « vide » et « pas chargée ».
    const liste = await chargerLesZones((zs) => zones.set(zs));
    if (liste === null) { error = $t('v2.zone.unreachable' as any); return; }
    error = null;
    chargerDoublons();
  }

  // DUP-1 : deux zones pour un même appareil. Le diagnostic les nomme (phase
  // 0) ; l'écran propose de fusionner la zone hors ligne dans sa jumelle en
  // ligne (phase 1), et dit depuis quand une zone ne répond plus (phase 2).
  let doublons = $state<import('../../lib/api').ZonesDoublon[]>([]);
  let confirmMerge = $state<number | null>(null);
  async function chargerDoublons() {
    try { doublons = await api.getZonesDoublons(); } catch { doublons = []; }
  }
  /** La zone EN LIGNE qui porte déjà l'appareil de `z`, si `z` est hors ligne. */
  function jumelle(z: Zone): { id: number; name: string } | null {
    if (z.id == null || z.online !== false) return null;
    for (const g of doublons) {
      const zs = g.zones ?? [];
      if (!zs.some((x) => x.id === z.id)) continue;
      const cible = zs.find((x) => x.id !== z.id && x.online);
      if (cible) return { id: cible.id, name: cible.name };
    }
    return null;
  }
  function presenceTxt(z: Zone): string | null {
    switch (z.presence) {
      case 'eteinte_recemment': return $t('v2.zone.presenceRecent' as any);
      case 'absente_depuis':
        return $t('v2.zone.presenceAbsent' as any).replace('{days}', String(z.jours_absente ?? '?'));
      case 'jamais_vue': return $t('v2.zone.presenceNever' as any);
      default: return null;
    }
  }
  function fusionner(z: Zone, cible: { id: number; name: string }, e: MouseEvent) {
    e.stopPropagation();
    if (confirmMerge !== z.id) { confirmMerge = z.id ?? null; return; }
    confirmMerge = null;
    act(async () => {
      await api.mergeZoneInto(z.id as number, cible.id);
      if ($currentZoneId === z.id) currentZoneId.set(cible.id);
      await chargerDoublons();
    });
  }

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    try { await fn(); await refresh(); }
    catch (e: any) { error = e?.message ?? 'Action impossible.'; }
    busy = false;
  }

  function select(z: Zone) {
    if (z.id != null) currentZoneId.set(z.id);
  }
  function startRename(z: Zone, e: MouseEvent) {
    e.stopPropagation();
    renaming = z.id; draft = z.name;
  }
  function commitRename(z: Zone) {
    const name = draft.trim();
    renaming = null;
    if (!name || name === z.name || z.id == null) return;
    act(() => api.renameZone(z.id as number, name));
  }
  function create() {
    const c = candidatChoisi;
    if (!c) return;
    // Sans nom saisi, la zone prend celui de l'appareil — le geste de l'ancienne
    // interface depuis la liste des appareils.
    const name = newName.trim() || c.nom;
    fermerCreation();
    act(() => api.createZone(name, c.outputType, c.deviceId));
  }
  /** Suppression en DEUX temps : une zone supprimée emporte sa file et sa
   *  configuration, et rien ne la restaure. Le premier clic arme, le second
   *  applique. */
  function askDelete(z: Zone, e: MouseEvent) {
    e.stopPropagation();
    confirmDelete = confirmDelete === z.id ? null : z.id;
  }
  function doDelete(z: Zone, e: MouseEvent) {
    e.stopPropagation();
    confirmDelete = null;
    if (z.id == null) return;
    act(async () => {
      await api.deleteZone(z.id as number);
      // La zone active vient d'être supprimée : on ne laisse pas l'interface
      // pointer sur un identifiant mort.
      if ($currentZoneId === z.id) currentZoneId.set(null);
    });
  }
  /*
   * CHANGER LA SORTIE d'une zone, et TOUT SUPPRIMER — deux gestes portés de
   * l'écran actuel (`ZoneManagerView`) avant la phase 5 (web#1257).
   *
   * La sortie : `PATCH /zones/{id}` avec `output_type` + `output_device_id`.
   * Aucun écran v2 n'envoyait ces deux champs : la route était atteinte (le
   * mode WAV y passe), le CHAMP ne l'était pas. Les appareils proposés sont
   * ceux de la création de zone (`candidatsNouvelleZone`), la zone elle-même
   * retirée du calcul — sans quoi son propre appareil serait exclu comme
   * « déjà lié ».
   *
   * Tout supprimer : `DELETE /zones`. Le serveur efface aussi les marques
   * d'activation, ce qui remet le quota de l'offre Free à zéro — c'est pour
   * cela que le geste existe. Deux temps, comme la suppression d'une zone.
   */
  let sortieDe = $state<number | null>(null);
  let sortieCandidats = $state<CandidatZone[]>([]);
  let sortieChoix = $state('');
  async function ouvrirSortie(z: Zone, e: MouseEvent) {
    e.stopPropagation();
    if (z.id == null) return;
    if (sortieDe === z.id) { sortieDe = null; return; }
    sortieDe = z.id;
    sortieChoix = '';
    sortieCandidats = [];
    const [locaux, decouverts] = await Promise.all([
      api.getAudioDevices().catch(() => []),
      api.getDevices().catch(() => []),
    ]);
    sortieCandidats = candidatsNouvelleZone(
      locaux, decouverts, $zones.filter((x) => x.id !== z.id), $t('zone.browserOutput' as any),
    );
  }
  function appliquerSortie(z: Zone) {
    const c = sortieCandidats.find((x) => x.cle === sortieChoix);
    if (!c || z.id == null) return;
    sortieDe = null;
    act(() => api.changeZoneOutput(z.id as number, c.outputType, c.deviceId ?? null));
  }
  let confirmTout = $state(false);
  function toutSupprimer() {
    confirmTout = false;
    act(async () => {
      await api.deleteAllZones();
      currentZoneId.set(null);
    });
  }

  function setVol(z: Zone, v: number) {
    if (z.id == null) return;
    zones.update((l) => l.map((x) => (x.id === z.id ? { ...x, volume: v } : x)));
    api.setVolume(z.id, v / 100).catch(() => { error = 'Volume refusé.'; refresh(); });
  }

  const OUTPUTS: Record<string, string> = {
    local: 'Sortie locale', dlna: 'DLNA', openhome: 'OpenHome', airplay: 'AirPlay',
    airplay2: 'AirPlay 2', chromecast: 'Chromecast', bluos: 'BluOS', snapcast: 'Snapcast',
    sonos: 'Sonos', squeezebox: 'Squeezebox', browser: 'Navigateur',
    // Un sigle, comme DLNA — #1003.
    oaat: 'OAAT',
  };
  /**
   * L'avertissement d'une zone — `txt` est la PASTILLE (deux mots), `long`
   * l'infobulle (la phrase). #1006, Bertrand : « Hors ligne et Éteinte
   * récemment en petits badges » — les phrases entières faisaient des
   * bandeaux pleine largeur sur la carte.
   */
  function reach(z: Zone): { cls: string; txt: string; long: string } | null {
    // Absent = `ok` : ne pas inventer une panne sur un serveur < 0.9.70.
    const r = z.output_reach ?? 'ok';
    if (r === 'no_output') return { cls: 'bad', txt: $t('v2.zone.badgeNoOutput' as any), long: $t('v2.zone.noOutputLong' as any) };
    if (r === 'browser_unattended') return { cls: 'warn', txt: $t('v2.zone.badgeBrowser' as any), long: $t('v2.zones.browserUnattended' as any) };
    if (z.online === false) return { cls: 'bad', txt: $t('v2.zone.badgeOffline' as any), long: $t('v2.zone.badgeOffline' as any) };
    return null;
  }

  /** #1006 — la pochette de la carte ouvre « Lecture en cours » SUR cette zone. */
  function ouvrirLecture(z: Zone) {
    select(z);
    activeView.set('nowplaying');
  }
  /** #1006 — le lien vers les réglages DE CETTE zone (Réglages → Appareils → Par zone). */
  function reglagesDeLaZone(z: Zone) {
    v2SettingsTarget.set({ tab: 'devices', section: 'perZone', zone: z.id ?? undefined });
    activeView.set('settings');
  }
</script>

<section class="v2-zones tune-v2">
  <!-- En-tête harmonisé : `.v2-top` / `.v2-actions` / `.v2-btn` vivent dans
       `styles/tune-v2.css`, une seule fois pour tous les écrans. L'ordre est
       le même partout : titre, puis actions secondaires, puis L'action
       primaire — une seule pleine par écran. -->
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.lbl.audioOutputs' as any)}</div>
      <h1>{$t('nav.zonemanager' as any)}</h1>
    </div>
    <div class="v2-actions">
      <div class="bascule" role="group" aria-label={$t('v2.zones.viewSwitch' as any)}>
        <button class="v2-btn" class:on={vue === 'grille'} aria-pressed={vue === 'grille'}
          onclick={() => choisirVue('grille')} title={$t('v2.zones.viewGrid' as any)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
          {$t('v2.zones.viewGrid' as any)}
        </button>
        <button class="v2-btn" class:on={vue === 'liste'} aria-pressed={vue === 'liste'}
          aria-describedby={vue === 'grille' && $zones.length ? 'zones-list-help' : undefined}
          onclick={() => choisirVue('liste')} title={$t('v2.zones.viewList' as any)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
          {$t('v2.zones.viewList' as any)}
        </button>
      </div>
      {#if creating}
        <div class="newz">
          <!-- svelte-ignore a11y_autofocus -->
          <select class="sel" bind:value={choix} aria-label={$t('zone.selectDevice' as any)}>
            <option value="" disabled>{$t('zone.selectDevice' as any)}</option>
            {#each [['navigateur', 'v2.zone.groupBrowser'], ['local', 'v2.zone.groupLocal'], ['reseau', 'v2.zone.groupNetwork']] as [g, cle] (g)}
              {@const dansGroupe = candidats.filter((c) => c.groupe === g)}
              {#if dansGroupe.length}
                <optgroup label={$t(cle as any)}>
                  <!-- #1234 — le nom ET le protocole : deux entrées du même
                       appareil ne se distinguaient par rien. -->
                  {#each dansGroupe as c (c.cle)}<option value={c.cle}>{libelleCandidat(c)}</option>{/each}
                </optgroup>
              {/if}
            {/each}
          </select>
          <input bind:value={newName} placeholder={candidatChoisi?.nom ?? $t('v2.zone.namePlaceholder' as any)} autofocus
            onkeydown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') fermerCreation(); }} />
          <button class="v2-btn primaire" onclick={create} disabled={!candidatChoisi}>{$t('v2.zone.create' as any)}</button>
          <button class="v2-btn" onclick={fermerCreation}>{$t('common.cancel' as any)}</button>
        </div>
      {:else}
        <button class="v2-btn primaire" onclick={ouvrirCreation}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          {$t('zone.newZone' as any)}
        </button>
      {/if}
    </div>
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  <div class="scroll">
    {#if !$zones.length && !listeVraimentVide($etatDesZones, $zones.length)}
      <!-- #1096 — tant que la liste n'a pas été CHARGÉE, une liste vide ne dit
           rien du serveur : on ne prétend pas qu'il n'y a aucune zone, et on
           n'invite pas à en recréer une qui existe peut-être déjà. -->
      <div class="state">
        {$etatDesZones === 'echec' ? $t('v2.zone.unreachable' as any) : $t('common.loading' as any)}
        {#if $etatDesZones === 'echec'}
          <button class="v2-btn" onclick={refresh}>{$t('zone.retry' as any)}</button>
        {/if}
      </div>
    {:else if !$zones.length}
      <div class="state">{$t('v2.zone.none' as any)}</div>
    {:else if vue === 'grille'}
      <p id="zones-list-help" class="list-help">{$t('v2.zones.listActionsHelp' as any).replace('{view}', $t('v2.zones.viewList' as any))}</p>
      <!--
        Vue GRILLE — quatre colonnes, de grosses cartes.

        Ce qu'une carte porte, et dans cet ordre : la POCHETTE de ce qui joue
        (cliquable, elle ouvre Lecture en cours sur cette zone), l'état (le
        point), le NOM, l'APPAREIL, les BADGES (Tune tested, hors ligne,
        éteinte récemment, aucune sortie — en pastilles, la phrase en
        infobulle), ce qui joue, puis le volume et le lien vers les réglages
        de la zone. Les gestes destructifs (renommer, supprimer, fusionner)
        restent à la LISTE : une carte qu'on clique pour activer une zone ne
        doit pas porter une corbeille à portée de pouce.

        🔴 #1006 — la carte n'est PLUS un seul <button> : une pochette
        cliquable et un lien dans un bouton, c'est du balisage invalide que
        les navigateurs défont. Elle est découpée comme `PochetteActions` et
        les cartes de la Recherche : le bouton d'activation (`.cpick`) et les
        autres cibles sont FRÈRES.

        Mesuré sur le .18 avant de dessiner : neuf zones sur quatorze n'ont
        aucune identité d'appareil. La carte retombe alors sur le type de
        sortie — c'est `appareilOuSortie`, dans `lib/vueZones`.
      -->
      <div class="grille">
        {#each $zones as z (z.id)}
          {@const r = reach(z)}
          {@const teste = tuneTestedDe(z)}
          {@const np = z.current_track}
          <div class="carte" class:active={z.id === $currentZoneId} class:offline={z.online === false}>
            <div class="ctete">
              {#if np?.cover_path || np?.album_id}
                <button class="cpoch" onclick={() => ouvrirLecture(z)}
                  title={$t('v2.zone.openNowPlaying' as any)} aria-label={$t('v2.zone.openNowPlaying' as any)}>
                  <AlbumArt coverPath={np?.cover_path ?? null} albumId={np?.album_id ?? null} size={64} alt={np?.title ?? ''} />
                </button>
              {/if}
              <button class="cpick" onclick={() => select(z)} aria-label={`Activer ${z.name}`}>
                <span class="chaut">
                  <span class="dot" class:on={z.id === $currentZoneId}></span>
                  {#if sortieSecondaire(z)}<span class="cot">{sortieSecondaire(z)}</span>{/if}
                  {#if z.is_default}<span class="cdef">{$t('v2.zone.default' as any)}</span>{/if}
                </span>
                <span class="cnom">{z.name}</span>
                <span class="cappareil" class:muet={!appareilDeLaZone(z)}>{appareilOuSortie(z)}</span>
                <span class="cbadges">
                  {#if teste}<BadgeTuneTested taille="sm" />{/if}
                  {#if r}<span class="rc {r.cls}" title={r.long}>{r.txt}</span>{/if}
                  {#if presenceTxt(z)}<span class="rc warn" title={presenceTxt(z)}>{presenceTxt(z)}</span>{/if}
                  {#if voie(z)}<span class="voie">{voie(z) === 'left' ? $t('v2.zone.leftChannel' as any) : $t('v2.zone.rightChannel' as any)}</span>{/if}
                </span>
                {#if np?.title}
                  <span class="cnp" title={`${np.title}${np.artist_name ? ' — ' + np.artist_name : ''}`}>♪ {np.title}{#if np.artist_name}<span class="cna"> — {np.artist_name}</span>{/if}</span>
                {/if}
              </button>
            </div>
            <div class="cvol">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7"/></svg>
              <input type="range" min="0" max="100" step="1" value={Math.round((z.volume ?? 0) * 100)}
                oninput={(e) => setVol(z, Number((e.currentTarget as HTMLInputElement).value))}
                aria-label={`Volume de ${z.name}`} />
              <span class="vn">{Math.round((z.volume ?? 0) * 100)}</span>
              <button class="creg" onclick={() => reglagesDeLaZone(z)}
                title={$t('v2.zone.openSettings' as any)} aria-label={$t('v2.zone.openSettings' as any)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="list">
        {#each $zones as z (z.id)}
          {@const r = reach(z)}
          <div class="zone" class:active={z.id === $currentZoneId}>
            <button class="pick" onclick={() => select(z)} aria-label={`Activer ${z.name}`}>
              <span class="dot" class:on={z.id === $currentZoneId}></span>
              <span class="zmeta">
                {#if renaming === z.id}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input class="rn" bind:value={draft} autofocus
                    onclick={(e) => e.stopPropagation()}
                    onblur={() => commitRename(z)}
                    onkeydown={(e) => { if (e.key === 'Enter') commitRename(z); if (e.key === 'Escape') renaming = null; }} />
                {:else}
                  <span class="zn">{z.name}{#if z.is_default}<em>{$t('v2.zone.default' as any)}</em>{/if}</span>
                {/if}
                <span class="zi">
                  {#if showExpert}<span class="ot">{OUTPUTS[z.output_type ?? 'local'] ?? z.output_type}</span>{/if}
                  {#if z.current_track?.title}<span class="np">♪ {z.current_track.title}</span>{/if}
                  {#if voie(z)}<span class="voie">{voie(z) === 'left' ? $t('v2.zone.leftChannel' as any) : $t('v2.zone.rightChannel' as any)}</span>{/if}
                  {#if r}<span class="rc {r.cls}">{r.txt}</span>{/if}
                  {#if presenceTxt(z)}<span class="rc warn">{presenceTxt(z)}</span>{/if}
                </span>
              </span>
            </button>

            <span class="vol">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7"/></svg>
              <input type="range" min="0" max="100" step="1" value={Math.round((z.volume ?? 0) * 100)}
                oninput={(e) => setVol(z, Number((e.currentTarget as HTMLInputElement).value))}
                aria-label={`Volume de ${z.name}`} />
              <span class="vn">{Math.round((z.volume ?? 0) * 100)}</span>
            </span>

            {#if showExpert}
              <span class="flags">
                {#if z.fixed_volume}<span class="fl">{$t('v2.lbl.fixedVolume' as any)}</span>{/if}
                {#if z.max_sample_rate}<span class="fl">≤ {Math.round(z.max_sample_rate / 100) / 10} kHz</span>{/if}
                {#if z.dsd_mode && z.dsd_mode !== 'auto'}<span class="fl">DSD {z.dsd_mode}</span>{/if}
              </span>
            {/if}

            <span class="zacts">
              {#if jumelle(z)}
                {@const j = jumelle(z)}
                <button class="merge" class:armed={confirmMerge === z.id} onclick={(e) => fusionner(z, j!, e)} disabled={busy}>
                  {confirmMerge === z.id ? $t('v2.zone.mergeConfirm' as any) : $t('v2.zone.mergeInto' as any).replace('{name}', j!.name)}
                </button>
              {/if}
              <button class:armed-sortie={sortieDe === z.id} onclick={(e) => ouvrirSortie(z, e)} disabled={busy}
                aria-label={$t('zone.changeOutput' as any)} title={$t('zone.changeOutput' as any)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>
              </button>
              <button onclick={(e) => startRename(z, e)} disabled={busy} aria-label="Renommer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
              </button>
              {#if confirmDelete === z.id}
                <button class="danger armed" onclick={(e) => doDelete(z, e)} disabled={busy}>{$t('v2.meta.confirm' as any)}</button>
                <button onclick={(e) => askDelete(z, e)} aria-label="Annuler">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              {:else}
                <button class="danger" onclick={(e) => askDelete(z, e)} disabled={busy} aria-label="Supprimer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
                </button>
              {/if}
            </span>
          </div>
          {#if sortieDe === z.id}
            <div class="sortie">
              <span class="cl">{$t('zone.changeOutput' as any)}</span>
              <select class="sel" bind:value={sortieChoix} aria-label={$t('zone.selectDevice' as any)}>
                <option value="" disabled>{$t('zone.selectDevice' as any)}</option>
                {#each [['navigateur', 'v2.zone.groupBrowser'], ['local', 'v2.zone.groupLocal'], ['reseau', 'v2.zone.groupNetwork']] as [g, cle] (g)}
                  {@const dansGroupe = sortieCandidats.filter((c) => c.groupe === g)}
                  {#if dansGroupe.length}
                    <optgroup label={$t(cle as any)}>
                      {#each dansGroupe as c (c.cle)}<option value={c.cle}>{libelleCandidat(c)}</option>{/each}
                    </optgroup>
                  {/if}
                {/each}
              </select>
              <button class="v2-btn primaire" onclick={() => appliquerSortie(z)} disabled={busy || !sortieChoix}>{$t('v2.meta.confirm' as any)}</button>
              <button class="v2-btn" onclick={() => (sortieDe = null)}>{$t('common.cancel' as any)}</button>
            </div>
          {/if}
        {/each}
      </div>
      {#if showExpert}
        <div class="tout">
          {#if confirmTout}
            <span class="cl">{$t('zone.deleteAllConfirm' as any)}</span>
            <button class="v2-btn danger armed" onclick={toutSupprimer} disabled={busy}>{$t('v2.meta.confirm' as any)}</button>
            <button class="v2-btn" onclick={() => (confirmTout = false)}>{$t('common.cancel' as any)}</button>
          {:else}
            <button class="v2-btn danger" onclick={() => (confirmTout = true)} disabled={busy}
              title={$t('zone.deleteAllHint' as any)}>{$t('zone.deleteAll' as any)}</button>
          {/if}
        </div>
      {/if}
    {/if}

    <!--
      Les paires stéréo valent pour LES DEUX vues : elles sont sorties de la
      branche « liste » quand la grille est arrivée, sinon la vue par défaut
      les aurait fait disparaître sans que rien ne le dise.

        Les paires stéréo vivent SOUS la liste, pas dans la carte d'une zone :
        une paire n'appartient à aucune des deux, elle les relie. La poser dans
        l'une des cartes obligerait à choisir laquelle, et à mentir sur l'autre.

        Niveau Expert : appairer deux renderers est un geste d'installation,
        pas un réglage d'écoute quotidien.
      -->
      {#if showExpert && (paires.length || appairables.length >= 2)}
        <section class="paires">
          <div class="ph">
            <span class="cl">{$t('v2.zone.stereoPairs' as any)}</span>
            {#if !formPaire && appairables.length >= 2}
              <button class="v2-btn" onclick={() => (formPaire = true)}>{$t('v2.zone.pairCreate' as any)}</button>
            {/if}
          </div>
          <p class="phint">{$t('v2.zone.pairHint' as any)}</p>

          {#if formPaire}
            <div class="pform">
              <label class="pf">
                <span>{$t('v2.zone.leftChannel' as any)}</span>
                <select class="sel" bind:value={zoneGauche} onchange={nomPropose}>
                  <option value={null}>{$t('v2.zone.pickZone' as any)}</option>
                  {#each appairables as z (z.id)}<option value={z.id} disabled={z.id === zoneDroite}>{z.name}</option>{/each}
                </select>
              </label>
              <label class="pf">
                <span>{$t('v2.zone.rightChannel' as any)}</span>
                <select class="sel" bind:value={zoneDroite} onchange={nomPropose}>
                  <option value={null}>{$t('v2.zone.pickZone' as any)}</option>
                  {#each appairables as z (z.id)}<option value={z.id} disabled={z.id === zoneGauche}>{z.name}</option>{/each}
                </select>
              </label>
              <label class="pf grow">
                <span>{$t('v2.zone.pairName' as any)}</span>
                <input class="txt" bind:value={nomPaire} placeholder={$t('v2.zone.pairName' as any)} />
              </label>
              <button class="v2-btn primaire" disabled={!params || busy} onclick={creerPaire}>{$t('v2.zone.create' as any)}</button>
              <button class="v2-btn" onclick={() => { formPaire = false; nomPaire = ''; zoneGauche = null; zoneDroite = null; }}>{$t('v2.zone.cancel' as any)}</button>
            </div>
          {/if}

          {#if paires.length}
            <div class="plist">
              {#each paires as p (p.stereo_pair_id)}
                <div class="pitem">
                  <span class="pn">
                    <b>{p.left_zone?.name ?? '—'}</b> <em>{$t('v2.zone.leftChannel' as any)}</em>
                    <span class="plus">+</span>
                    <b>{p.right_zone?.name ?? '—'}</b> <em>{$t('v2.zone.rightChannel' as any)}</em>
                  </span>
                  <button class="v2-btn danger" disabled={busy} onclick={() => defairePaire(p.stereo_pair_id)}>{$t('v2.zone.pairDissolve' as any)}</button>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
  </div>
</section>

<style>
  .paires{margin:26px 0 0; padding:16px 18px; border-radius:12px; border:1px solid var(--v2-line)}
  .paires .ph{display:flex; align-items:baseline; gap:14px}
  .paires .cl{font:600 12px var(--v2-mono); letter-spacing:.05em; color:var(--v2-acc1)}
  .phint{margin-top:6px; font-size:12.5px; line-height:1.55; color:var(--v2-txt3)}
  .pform{display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-top:14px}
  .pf{display:flex; flex-direction:column; gap:5px}
  .pf.grow{flex:1; min-width:180px}
  .pf > span{font:600 10.5px var(--v2-mono); letter-spacing:.05em; color:var(--v2-txt3); text-transform:uppercase}
  .plist{margin-top:14px; display:flex; flex-direction:column; gap:8px}
  .pitem{display:flex; align-items:center; justify-content:space-between; gap:14px;
    padding:9px 12px; border-radius:9px; background:var(--v2-bg)}
  .pn{font-size:13px; display:flex; align-items:center; gap:7px; flex-wrap:wrap}
  .pn em{font:10.5px var(--v2-mono); color:var(--v2-txt3); font-style:normal}
  .pn .plus{color:var(--v2-txt3)}
  .voie{font:10.5px var(--v2-mono); color:var(--v2-acc1)}
  /* Reprises telles quelles des Réglages v2 : mêmes contrôles, même dessin.
     Les styles Svelte sont portés par composant, il n'y a pas de feuille
     commune où les poser sans les rendre globales. */
  .sel{height:34px; min-width:180px; border-radius:9px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:13px var(--v2-sans); padding:0 10px; outline:none; cursor:pointer}
  .sel:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .txt{height:34px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 11px; outline:none; width:100%}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .v2-zones{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .newz{display:flex; gap:8px; flex-wrap:wrap; align-items:center}
  .newz input{height:40px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-acc2); background:var(--v2-surface2);
    color:var(--v2-txt); font:14px var(--v2-sans); padding:0 16px; outline:none; width:230px}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; border:1px solid var(--v2-danger-bd); background:var(--v2-acc-soft)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px 0; color:var(--v2-txt3)}
  .list-help{margin:0 0 12px; color:var(--v2-txt3); font-size:13px; line-height:1.5}
  .list{display:flex; flex-direction:column; gap:8px}

  /* ── Vue GRILLE ────────────────────────────────────────────────────────
     « grille du genre 4 colonnes » : quatre, littéralement, et non un
     `auto-fill` qui en donnerait six sur un 27 pouces et deux sur le portable.
     Le nombre de colonnes descend par paliers, la carte garde sa taille.
     Mesuré sur l'écran de Bertrand (viewport ≈ 1314 px, barre latérale 270) :
     quatre colonnes de ~234 px. */
  .grille{display:grid; gap:16px; grid-template-columns:repeat(4, minmax(0, 1fr))}
  @media (max-width:1200px){ .grille{grid-template-columns:repeat(3, minmax(0, 1fr))} }
  @media (max-width:900px){ .grille{grid-template-columns:repeat(2, minmax(0, 1fr))} }
  @media (max-width:620px){ .grille{grid-template-columns:1fr} }

  .carte{display:flex; flex-direction:column; border-radius:var(--v2-r-md);
    border:1px solid var(--v2-line); background:var(--v2-surface2); overflow:hidden;
    transition:border-color .15s, box-shadow .15s}
  .carte:hover{border-color:var(--v2-line2)}
  .carte.active{border-color:var(--v2-acc1); box-shadow:0 0 0 1px var(--v2-acc1) inset, 0 0 22px var(--v2-glow)}
  /* Hors ligne : la carte s'efface, mais son texte reste lisible — on ne cache
     pas une zone en panne, on la montre éteinte. */
  .carte.offline .cnom, .carte.offline .cappareil{opacity:.6}

  /* #1006 — la tête de carte : pochette à gauche (si quelque chose joue),
     bouton d'activation à droite. Deux cibles SŒURS, jamais imbriquées. */
  .ctete{display:flex; align-items:stretch; gap:0; flex:1; min-width:0}
  .cpoch{flex:0 0 auto; padding:15px 0 12px 14px; border:0; background:transparent; cursor:pointer;
    display:flex; align-items:flex-start}
  .cpoch:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:-3px}
  .cpoch :global(.album-art){border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,.35); transition:transform .15s}
  .cpoch:hover :global(.album-art){transform:scale(1.04)}
  .cpick{display:flex; flex-direction:column; align-items:flex-start; gap:0;
    padding:15px 16px 12px; border:0; background:transparent; color:inherit;
    text-align:left; cursor:pointer; width:100%; flex:1; min-width:0}
  .cpick:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:-3px}

  .chaut{display:flex; align-items:center; gap:9px; width:100%; min-height:18px}
  .cot{font:600 9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .cdef{margin-left:auto; font:600 9.5px var(--v2-mono); letter-spacing:.06em;
    text-transform:uppercase; color:var(--v2-acc1)}

  .cnom{margin-top:9px; font:700 17px var(--v2-sans); line-height:1.25; color:var(--v2-txt);
    width:100%; overflow-wrap:anywhere}
  /* L'appareil, la ligne demandée. `muet` = on n'a que le type de sortie :
     neuf zones sur quatorze sur le .18. On le dit en gris, sans le déguiser
     en modèle. */
  .cappareil{margin-top:4px; font:12.5px var(--v2-sans); color:var(--v2-txt2); width:100%; overflow-wrap:anywhere}
  .cappareil.muet{color:var(--v2-txt3)}
  /* #1006 — les badges en PASTILLES, sur une seule rangée qui replie. */
  .cbadges{margin-top:9px; display:flex; flex-wrap:wrap; align-items:center; gap:6px; width:100%}
  .cbadges:empty{display:none}

  .cnp{margin-top:10px; font:12px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%}
  .cna{color:var(--v2-txt3)}

  .cvol{display:flex; align-items:center; gap:10px; padding:10px 16px 13px;
    border-top:1px solid var(--v2-line)}
  .cvol svg{width:15px; height:15px; color:var(--v2-txt3); flex:0 0 auto}
  .cvol input[type=range]{flex:1; min-width:0; accent-color:var(--v2-acc1); cursor:pointer}
  .cvol .vn{font:11.5px var(--v2-mono); color:var(--v2-txt3); width:24px; text-align:right; flex:0 0 auto}
  /* #1006 — le lien vers les réglages de la zone, au bout de la rangée du volume. */
  .creg{flex:0 0 auto; width:26px; height:26px; display:grid; place-items:center; border-radius:8px;
    border:1px solid transparent; background:transparent; color:var(--v2-txt3); cursor:pointer; padding:0}
  .creg svg{width:15px; height:15px; color:inherit}
  .creg:hover{color:var(--v2-txt); border-color:var(--v2-line2); background:var(--v2-surface)}
  .creg:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:1px}

  /* La bascule grille / liste : deux boutons d'action ordinaires, celui qui
     est actif porte la teinte. Pas un troisième dessin de bouton. */
  .bascule{display:flex; gap:6px}
  .bascule .v2-btn.on{border-color:var(--v2-acc2); color:var(--v2-acc-tint); background:var(--v2-acc-soft)}
  @media (max-width:820px){ .bascule .v2-btn{padding:0 11px} }

  .zone{display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; align-items:center; gap:18px;
    padding:12px 16px; border-radius:13px; border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .zone.active{border-color:var(--v2-acc2); background:var(--v2-acc-soft)}
  .pick{display:flex; align-items:center; gap:13px; min-width:0; border:0; background:transparent; color:inherit;
    cursor:pointer; text-align:left; padding:0; font-family:inherit}
  .dot{width:11px; height:11px; border-radius:50%; flex:0 0 auto; border:2px solid var(--v2-line2); background:transparent}
  .dot.on{border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .zmeta{display:flex; flex-direction:column; gap:4px; min-width:0}
  .zn{font-size:15px; font-weight:700; display:flex; align-items:center; gap:9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .zn em{font:9.5px var(--v2-mono); font-style:normal; letter-spacing:.1em; text-transform:uppercase;
    color:var(--v2-txt3); border:1px solid var(--v2-line2); border-radius:999px; padding:2px 7px}
  .zi{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .ot{font:10px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc2)}
  .np{font:11.5px var(--v2-sans); color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:280px}
  .rc{font:10px var(--v2-mono); padding:2px 8px; border-radius:999px}
  .rc.bad{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .rc.warn{color:var(--v2-acc-tint); border:1px solid var(--v2-acc2)}
  .rn{font-size:15px; font-weight:700; background:var(--v2-bg); border:1px solid var(--v2-acc2); border-radius:8px;
    color:var(--v2-txt); padding:3px 9px; outline:none; width:220px; font-family:inherit}

  .vol{display:flex; align-items:center; gap:10px; flex:0 0 auto}
  .vol svg{width:16px; height:16px; color:var(--v2-txt3)}
  .vol input{width:130px; accent-color:var(--v2-acc1)}
  .vn{font:11px var(--v2-mono); color:var(--v2-txt3); width:24px; text-align:right}

  .flags{display:flex; gap:6px; flex:0 0 auto}
  .fl{font:9.5px var(--v2-mono); color:var(--v2-txt3); border:1px solid var(--v2-line2); border-radius:999px; padding:3px 8px}

  .zacts{display:flex; gap:5px; flex:0 0 auto}
  .zacts button{height:28px; min-width:28px; padding:0 8px; border-radius:8px; border:1px solid transparent;
    background:transparent; color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center;
    font:600 11px var(--v2-sans)}
  .zacts button:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-line2)}
  .zacts button:disabled{opacity:.4; cursor:default}
  .zacts .danger:hover:not(:disabled){color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .zacts .armed{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .zacts svg{width:14px; height:14px}
  .zacts .armed-sortie{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .sortie{display:flex; gap:8px; flex-wrap:wrap; align-items:center; padding:8px 12px 12px 40px}
  .sortie .cl, .tout .cl{font-size:12.5px; color:var(--v2-txt2)}
  .tout{display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; padding:14px 0 4px}
  .tout .danger{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .zacts .merge{padding:0 10px; font-size:12px; white-space:nowrap}
</style>
