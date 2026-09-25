<script lang="ts">
  /**
   * Onglet « Snapshots » du greffon Playlists converter (tune-server-rust#4903).
   *
   * Copies datées d'une playlist — prises à la main, ou par le greffon avant
   * tout transfert, tout retour en arrière, toute synchro. On les liste par
   * playlist, on en lit le contenu, et on peut REVENIR à l'une d'elles.
   *
   * Le retour en arrière ne supprime RIEN — l'hôte n'en a pas la capacité :
   *   - `completer` rajoute ce qui a disparu et LISTE ce qui est en trop
   *     (`a_retirer_par_vous`) : c'est à l'utilisateur de le retirer lui-même,
   *     chez le service ;
   *   - `recreer` crée une NOUVELLE playlist, l'ancienne reste intacte.
   * Il se fait toujours en deux temps, aperçu puis accord, et l'`avertissement`
   * du greffon est affiché tel qu'il le rend.
   */
  import * as api from '../../../lib/api';
  import type { Playlist, StreamingPlaylist } from '../../../lib/types';
  import { t as tr } from '../../../lib/i18n';
  import { isPremium } from '../../../lib/stores/license';
  import { errText } from '../../../lib/utils';
  import { dateConvertisseur, nomService, playlistsDuService } from '../../../lib/convertisseurPlaylists';

  interface Props {
    localPlaylists: Playlist[];
    streamingPlaylists: Record<string, StreamingPlaylist[]>;
  }
  let { localPlaylists, streamingPlaylists }: Props = $props();

  type ApercuRestauration = Awaited<ReturnType<typeof api.convertisseurApercuRestauration>>;
  type Restauration = Awaited<ReturnType<typeof api.convertisseurRestaurer>>;

  let gardees = $state<api.PlaylistSnapshotsConvertisseur[]>([]);
  let retention = $state(10);
  let ouverte = $state<api.PlaylistSnapshotsConvertisseur | null>(null);
  let snapshots = $state<api.EnTeteSnapshotConvertisseur[]>([]);
  let consulte = $state<api.SnapshotConvertisseur | null>(null);
  let aRestaurer = $state<api.EnTeteSnapshotConvertisseur | null>(null);
  let mode = $state<api.ModeRestauration>('completer');
  let apercu = $state<ApercuRestauration | null>(null);
  let accord = $state(false);
  let restauration = $state<Restauration | null>(null);
  let enCours = $state(false);
  let erreur = $state<string | null>(null);
  let refusPremium = $state(false);

  // Prendre un snapshot à la main.
  let prendreService = $state('');
  let prendrePlaylist = $state('');
  const services: string[] = $derived(['local', ...Object.keys(streamingPlaylists)]);
  const candidates = $derived(playlistsDuService(prendreService, localPlaylists, streamingPlaylists));

  function libelleService(s: string): string {
    return s === 'local' ? $tr('plconv.bibliotheque') : nomService(s);
  }

  /** `manuel`, `avant_transfert:lot-N`, `avant_restauration:plan-N`, `avant_synchro:lien-N`. */
  function libelleMotif(motif: string): string {
    const [genre, ref] = motif.split(':');
    const cle = `plconv.motif.${genre}`;
    const v = $tr(cle);
    return v === cle ? motif : v.replace('{ref}', ref ?? '');
  }

  function retenir(e: unknown) {
    refusPremium = (e as { status?: number } | null)?.status === 402;
    erreur = refusPremium ? '' : (errText(e) ?? '');
  }

  async function chargerGardees() {
    try {
      const r = await api.convertisseurPlaylistsGardees();
      gardees = r?.playlists ?? [];
      if (r?.retention_par_playlist) retention = r.retention_par_playlist;
    } catch (e) {
      retenir(e);
    }
  }

  async function ouvrir(pl: api.PlaylistSnapshotsConvertisseur) {
    ouverte = pl;
    consulte = null;
    fermerRestauration();
    erreur = null;
    await relireSnapshots(pl);
  }

  async function relireSnapshots(pl: api.PlaylistSnapshotsConvertisseur) {
    try {
      const r = await api.convertisseurSnapshots(pl.service, pl.playlist_id);
      snapshots = r?.snapshots ?? [];
    } catch (e) {
      snapshots = [];
      retenir(e);
    }
  }

  async function consulter(s: api.EnTeteSnapshotConvertisseur) {
    erreur = null;
    try {
      consulte = (await api.convertisseurSnapshot(s.snapshot_id)).snapshot;
    } catch (e) {
      retenir(e);
    }
  }

  function preparerRestauration(s: api.EnTeteSnapshotConvertisseur) {
    aRestaurer = s;
    mode = 'completer';
    apercu = null;
    accord = false;
    restauration = null;
    erreur = null;
  }

  function fermerRestauration() {
    aRestaurer = null;
    apercu = null;
    accord = false;
    restauration = null;
  }

  function changerMode(m: api.ModeRestauration) {
    mode = m;
    // Un aperçu calculé pour un autre mode ne décrit plus ce qu'on accepterait.
    apercu = null;
    accord = false;
  }

  async function demanderApercu() {
    if (!aRestaurer) return;
    enCours = true;
    erreur = null;
    try {
      apercu = await api.convertisseurApercuRestauration(aRestaurer.snapshot_id, mode);
    } catch (e) {
      retenir(e);
    }
    enCours = false;
  }

  async function restaurer() {
    if (!apercu || !accord) return;
    enCours = true;
    erreur = null;
    try {
      restauration = await api.convertisseurRestaurer(apercu.plan.plan_id);
      // Le greffon a pris un snapshot de l'état courant avant d'écrire : la
      // liste s'allonge. On la relit SANS refermer le compte rendu.
      if (ouverte) void relireSnapshots(ouverte);
    } catch (e) {
      retenir(e);
    }
    enCours = false;
  }

  async function prendre() {
    if (!prendreService || !prendrePlaylist) return;
    const nom = candidates.find((p) => p.id === prendrePlaylist)?.nom;
    enCours = true;
    erreur = null;
    try {
      await api.convertisseurPrendreSnapshot(prendreService, prendrePlaylist, nom);
      await chargerGardees();
    } catch (e) {
      retenir(e);
    }
    enCours = false;
  }

  $effect(() => {
    if ($isPremium) void chargerGardees();
  });
</script>

<section class="conv" data-onglet="conv-snapshots">
  {#if !$isPremium}
    <p class="conv-premium">{$tr('plconv.premium')}</p>
  {:else}
    <h3 class="conv-titre">{$tr('plconv.snapshots.titre')}</h3>
    <p class="conv-aide">{$tr('plconv.snapshots.aide').replace('{n}', String(retention))}</p>

    <div class="conv-ligne">
      <label class="conv-champ">
        <span>{$tr('plconv.service')}</span>
        <select
          class="conv-prendre-service"
          value={prendreService}
          onchange={(e) => { prendreService = e.currentTarget.value; prendrePlaylist = ''; }}
        >
          <option value="">{$tr('plconv.choisir')}</option>
          {#each services as s (s)}
            <option value={s}>{libelleService(s)}</option>
          {/each}
        </select>
      </label>
      <label class="conv-champ">
        <span>{$tr('plconv.playlist')}</span>
        <select
          class="conv-prendre-playlist"
          value={prendrePlaylist}
          onchange={(e) => (prendrePlaylist = e.currentTarget.value)}
        >
          <option value="">{$tr('plconv.choisir')}</option>
          {#each candidates as pl (pl.id)}
            <option value={pl.id}>{pl.nom}</option>
          {/each}
        </select>
      </label>
      <button class="conv-btn conv-prendre" disabled={!prendreService || !prendrePlaylist || enCours} onclick={prendre}>
        {$tr('plconv.snapshots.prendre')}
      </button>
    </div>

    {#if erreur !== null}
      <p class="conv-erreur" role="alert">{refusPremium ? $tr('plconv.premium') : erreur || $tr('plconv.erreurGenerique')}</p>
    {/if}

    {#if gardees.length === 0}
      <p class="conv-vide">{$tr('plconv.snapshots.aucun')}</p>
    {:else}
      <ul class="conv-gardees">
        {#each gardees as pl (pl.service + '/' + pl.playlist_id)}
          <li>
            <button
              class="conv-lien-playlist"
              class:active={ouverte?.service === pl.service && ouverte?.playlist_id === pl.playlist_id}
              onclick={() => ouvrir(pl)}
            >
              <strong>{pl.nom || pl.playlist_id}</strong>
              <span class="conv-discret">{libelleService(pl.service)}</span>
              <span class="conv-discret">
                {$tr('plconv.snapshots.compte')
                  .replace('{n}', String(pl.snapshots))
                  .replace('{date}', dateConvertisseur(pl.dernier_le_ms))}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if ouverte}
      <div class="conv-bloc conv-snapshots-liste">
        <h4>{ouverte.nom || ouverte.playlist_id}</h4>
        {#each snapshots as s (s.snapshot_id)}
          <div class="conv-snapshot" data-snapshot={s.snapshot_id}>
            <span>{dateConvertisseur(s.pris_le_ms)}</span>
            <span class="conv-discret">{libelleMotif(s.motif)}</span>
            <span class="conv-discret">{$tr('plconv.pistes').replace('{n}', String(s.total))}</span>
            <button class="conv-btn conv-consulter" onclick={() => consulter(s)}>{$tr('plconv.snapshots.consulter')}</button>
            <button class="conv-btn conv-revenir" onclick={() => preparerRestauration(s)}>{$tr('plconv.snapshots.revenir')}</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if consulte}
      <div class="conv-bloc conv-contenu">
        <h4>{$tr('plconv.snapshots.contenu').replace('{date}', dateConvertisseur(consulte.pris_le_ms))}</h4>
        <ol>
          {#each consulte.pistes as p, k (k)}
            <li>{$tr('plconv.titreArtiste').replace('{titre}', p.titre).replace('{artiste}', p.artiste)}</li>
          {/each}
        </ol>
      </div>
    {/if}

    {#if aRestaurer}
      <div class="conv-bloc conv-restauration">
        <h4>{$tr('plconv.snapshots.revenirTitre').replace('{date}', dateConvertisseur(aRestaurer.pris_le_ms))}</h4>
        <label class="conv-mode">
          <input type="radio" name="conv-mode" value="completer" checked={mode === 'completer'} onchange={() => changerMode('completer')} />
          <span>{$tr('plconv.snapshots.modeCompleter')}</span>
        </label>
        <label class="conv-mode">
          <input type="radio" name="conv-mode" value="recreer" checked={mode === 'recreer'} onchange={() => changerMode('recreer')} />
          <span>{$tr('plconv.snapshots.modeRecreer')}</span>
        </label>
        {#if !restauration}
          <button class="conv-btn conv-voir-apercu" disabled={enCours} onclick={demanderApercu}>{$tr('plconv.voirApercu')}</button>
        {/if}

        {#if apercu && !restauration}
          <p class="conv-aide">{$tr('plconv.rienNestEcrit')}</p>
          {#if apercu.plan.avertissement}
            <p class="conv-avertissement">{apercu.plan.avertissement}</p>
          {/if}
          <p class="conv-resume">
            {$tr('plconv.snapshots.aRajouter').replace('{n}', String(apercu.a_rajouter.length))}
          </p>
          {#if apercu.a_rajouter.length > 0}
            <ul class="conv-a-rajouter">
              {#each apercu.a_rajouter as p, k (k)}
                <li>{$tr('plconv.titreArtiste').replace('{titre}', p.titre).replace('{artiste}', p.artiste)}</li>
              {/each}
            </ul>
          {/if}
          {#if apercu.a_retirer_par_vous.length > 0}
            <p class="conv-resume">{$tr('plconv.snapshots.aRetirerParVous').replace('{n}', String(apercu.a_retirer_par_vous.length))}</p>
            <ul class="conv-a-retirer">
              {#each apercu.a_retirer_par_vous as p, k (k)}
                <li>{$tr('plconv.titreArtiste').replace('{titre}', p.titre).replace('{artiste}', p.artiste)}</li>
              {/each}
            </ul>
          {/if}
          <label class="conv-accord">
            <input type="checkbox" class="conv-accord-case" checked={accord} onchange={(e) => (accord = e.currentTarget.checked)} />
            <span>{$tr('plconv.snapshots.accord')}</span>
          </label>
          <button class="conv-btn conv-primaire conv-appliquer" disabled={!accord || enCours} onclick={restaurer}>
            {$tr('plconv.snapshots.appliquer')}
          </button>
        {/if}

        {#if restauration}
          <p class="conv-resume">
            {#if restauration.plan.playlist_recreee_id}
              {$tr('plconv.snapshots.recreee').replace('{nom}', restauration.plan.nom)}
            {:else}
              {$tr('plconv.snapshots.rajoutees').replace('{n}', String(restauration.plan.rajoutees.length))}
            {/if}
          </p>
          {#if restauration.plan.avertissement}
            <p class="conv-avertissement">{restauration.plan.avertissement}</p>
          {/if}
          {#if restauration.a_retirer_par_vous.length > 0}
            <p class="conv-resume">{$tr('plconv.snapshots.aRetirerParVous').replace('{n}', String(restauration.a_retirer_par_vous.length))}</p>
            <ul class="conv-a-retirer">
              {#each restauration.a_retirer_par_vous as p, k (k)}
                <li>{$tr('plconv.titreArtiste').replace('{titre}', p.titre).replace('{artiste}', p.artiste)}</li>
              {/each}
            </ul>
          {/if}
        {/if}
        <button class="conv-btn" onclick={fermerRestauration}>{$tr('plconv.fermer')}</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .conv { display: flex; flex-direction: column; gap: 12px; }
  .conv-titre { margin: 0; font-size: 16px; font-weight: 600; color: var(--tune-text); }
  .conv-aide, .conv-discret { margin: 0; font-size: 12px; color: var(--tune-text-secondary); }
  .conv-premium { margin: 0; padding: 22px; text-align: center; color: var(--tune-text-secondary); }
  .conv-vide { margin: 0; color: var(--tune-text-muted); font-size: 13px; }
  .conv-ligne { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .conv-champ { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--tune-text-secondary); }
  .conv-champ select { min-width: 180px; padding: 6px 8px; border: 1px solid var(--tune-border); border-radius: 6px; background: var(--tune-surface); color: var(--tune-text); }
  .conv-btn { align-self: flex-start; padding: 6px 14px; border: 1px solid var(--tune-border); border-radius: 6px; background: none; color: var(--tune-text); cursor: pointer; font-size: 13px; }
  .conv-btn:disabled { opacity: 0.5; cursor: default; }
  .conv-primaire { background: var(--tune-accent); border-color: var(--tune-accent); color: var(--tune-bg); }
  .conv-erreur { margin: 0; color: var(--tune-danger, #ef4444); font-size: 13px; }
  .conv-gardees { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .conv-lien-playlist { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; width: 100%; padding: 8px 10px; border: 1px solid var(--tune-border); border-radius: 6px; background: none; color: var(--tune-text); cursor: pointer; text-align: left; }
  .conv-lien-playlist.active { border-color: var(--tune-accent); }
  .conv-bloc { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--tune-border); border-radius: 8px; }
  .conv-bloc h4 { margin: 0; font-size: 14px; color: var(--tune-text); }
  .conv-bloc ul, .conv-bloc ol { margin: 0; padding-left: 18px; font-size: 13px; color: var(--tune-text); }
  .conv-snapshot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 4px 0; border-top: 1px solid var(--tune-border); }
  .conv-mode, .conv-accord { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--tune-text); }
  .conv-resume { margin: 0; font-size: 13px; color: var(--tune-text); }
  .conv-avertissement { margin: 0; padding: 8px 10px; border-left: 3px solid var(--tune-accent); font-size: 13px; color: var(--tune-text); }
  .conv-a-retirer { color: var(--tune-text-secondary); }
</style>
