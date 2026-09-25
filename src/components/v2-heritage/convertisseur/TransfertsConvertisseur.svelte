<script lang="ts">
  /**
   * Onglet « Transferts » du greffon Playlists converter (tune-server-rust#4740).
   *
   * Transfert simple (une playlist) ou par lot (plusieurs) d'un service vers
   * un autre. La règle de l'épique #4715 est tenue PAR L'ÉCRAN autant que par
   * le greffon : le bouton qui verse n'existe pas tant qu'aucun aperçu n'est
   * affiché, et il reste éteint tant que l'accord n'est pas coché. Changer la
   * source, la cible ou la sélection jette l'aperçu : on n'accepte jamais un
   * aperçu qui ne décrit plus ce qu'on demande.
   *
   * La bibliothèque locale peut être une SOURCE, pas une cible : le greffon la
   * refuse (`cible_locale_non_supportee`), elle n'est donc pas proposée.
   */
  import * as api from '../../../lib/api';
  import type { Playlist, StreamingPlaylist } from '../../../lib/types';
  import { t as tr } from '../../../lib/i18n';
  import { isPremium } from '../../../lib/stores/license';
  import { errText } from '../../../lib/utils';
  import { cleRaison, nomService, playlistsDuService } from '../../../lib/convertisseurPlaylists';

  interface Props {
    localPlaylists: Playlist[];
    streamingPlaylists: Record<string, StreamingPlaylist[]>;
  }
  let { localPlaylists, streamingPlaylists }: Props = $props();

  let source = $state('');
  let cible = $state('');
  let choisies = $state<string[]>([]);
  let apercu = $state<api.ReponseLotConvertisseur | null>(null);
  let accord = $state(false);
  let resultat = $state<api.ReponseLotConvertisseur | null>(null);
  let enCours = $state(false);
  let erreur = $state<string | null>(null);
  let refusPremium = $state(false);
  let lots = $state<api.EnTeteLotConvertisseur[]>([]);

  const services: string[] = $derived(Object.keys(streamingPlaylists));
  const sources: string[] = $derived(['local', ...services]);
  const cibles: string[] = $derived(services.filter((s) => s !== source));
  const candidates = $derived(playlistsDuService(source, localPlaylists, streamingPlaylists));

  function libelleService(s: string): string {
    return s === 'local' ? $tr('plconv.bibliotheque') : nomService(s);
  }

  function libelleEtat(etat: string): string {
    const cle = `plconv.etat.${etat}`;
    const v = $tr(cle);
    return v === cle ? etat : v;
  }

  function retenir(e: unknown) {
    refusPremium = (e as { status?: number } | null)?.status === 402;
    erreur = refusPremium ? '' : (errText(e) ?? '');
  }

  /** Tout changement de la demande rend l'aperçu caduc. */
  function oublierApercu() {
    apercu = null;
    accord = false;
    resultat = null;
    erreur = null;
  }

  function changerSource(v: string) {
    source = v;
    choisies = [];
    if (cible === v) cible = '';
    oublierApercu();
  }

  function changerCible(v: string) {
    cible = v;
    oublierApercu();
  }

  function basculer(id: string) {
    choisies = choisies.includes(id) ? choisies.filter((x) => x !== id) : [...choisies, id];
    oublierApercu();
  }

  async function demanderApercu() {
    if (!source || !cible || choisies.length === 0) return;
    enCours = true;
    oublierApercu();
    try {
      apercu = await api.convertisseurApercu({
        source_service: source,
        cible_service: cible,
        playlists: [...choisies],
      });
    } catch (e) {
      retenir(e);
    }
    enCours = false;
  }

  async function transferer() {
    // Double verrou : le bouton n'existe qu'avec un aperçu et ne s'allume
    // qu'avec l'accord ; la fonction ne part pas sans eux non plus.
    if (!apercu || !accord) return;
    enCours = true;
    erreur = null;
    try {
      resultat = await api.convertisseurTransferer(apercu.lot.lot_id);
      void chargerLots();
    } catch (e) {
      retenir(e);
    }
    enCours = false;
  }

  async function reprendre(lotId: string) {
    enCours = true;
    erreur = null;
    try {
      resultat = await api.convertisseurReprendre(lotId);
      void chargerLots();
    } catch (e) {
      retenir(e);
    }
    enCours = false;
  }

  async function chargerLots() {
    try {
      const r = await api.convertisseurLots();
      lots = r?.lots ?? [];
    } catch {
      lots = [];
    }
  }

  $effect(() => {
    if ($isPremium) void chargerLots();
  });
</script>

<section class="conv" data-onglet="conv-transferts">
  {#if !$isPremium}
    <p class="conv-premium">{$tr('plconv.premium')}</p>
  {:else}
    <h3 class="conv-titre">{$tr('plconv.transferts.titre')}</h3>
    <p class="conv-aide">{$tr('plconv.transferts.aide')}</p>

    <div class="conv-ligne">
      <label class="conv-champ">
        <span>{$tr('plconv.source')}</span>
        <select class="conv-source" value={source} onchange={(e) => changerSource(e.currentTarget.value)}>
          <option value="">{$tr('plconv.choisir')}</option>
          {#each sources as s (s)}
            <option value={s}>{libelleService(s)}</option>
          {/each}
        </select>
      </label>
      <label class="conv-champ">
        <span>{$tr('plconv.cible')}</span>
        <select class="conv-cible" value={cible} onchange={(e) => changerCible(e.currentTarget.value)}>
          <option value="">{$tr('plconv.choisir')}</option>
          {#each cibles as s (s)}
            <option value={s}>{libelleService(s)}</option>
          {/each}
        </select>
      </label>
    </div>

    {#if source}
      {#if candidates.length === 0}
        <p class="conv-vide">{$tr('plconv.aucunePlaylist')}</p>
      {:else}
        <p class="conv-aide">{$tr('plconv.transferts.choisir')}</p>
        <ul class="conv-choix">
          {#each candidates as pl (pl.id)}
            <li>
              <label>
                <input
                  type="checkbox"
                  data-playlist={pl.id}
                  checked={choisies.includes(pl.id)}
                  onchange={() => basculer(pl.id)}
                />
                <span>{pl.nom}</span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}

    <button
      class="conv-btn conv-voir-apercu"
      disabled={!source || !cible || choisies.length === 0 || enCours}
      onclick={demanderApercu}
    >{$tr('plconv.voirApercu')}</button>

    {#if erreur !== null}
      <p class="conv-erreur" role="alert">{refusPremium ? $tr('plconv.premium') : erreur || $tr('plconv.erreurGenerique')}</p>
    {/if}

    {#if apercu}
      <div class="conv-bloc conv-apercu">
        <h4>{$tr('plconv.apercu')}</h4>
        <p class="conv-aide">{$tr('plconv.rienNestEcrit')}</p>
        <p class="conv-resume">
          {$tr('plconv.transferts.resume')
            .replace('{playlists}', String(apercu.resume.playlists))
            .replace('{appariees}', String(apercu.resume.appariees))
            .replace('{titres}', String(apercu.resume.titres))
            .replace('{introuvables}', String(apercu.resume.introuvables))}
        </p>
        {#each apercu.lot.playlists as pl (pl.rang)}
          <div class="conv-pl">
            <div class="conv-pl-tete">
              <strong>{pl.source_nom}</strong>
              <span class="conv-discret">{$tr('plconv.transferts.creeeSous').replace('{nom}', pl.cible_nom)}</span>
            </div>
            <div class="conv-discret">
              {$tr('plconv.transferts.compte')
                .replace('{appariees}', String(pl.appariees.length))
                .replace('{total}', String(pl.total))}
            </div>
            {#if pl.introuvables.length > 0}
              <details class="conv-introuvables">
                <summary>{$tr('plconv.introuvables').replace('{n}', String(pl.introuvables.length))}</summary>
                <ul>
                  {#each pl.introuvables as i, k (k)}
                    <li>
                      {$tr('plconv.titreArtiste').replace('{titre}', i.source_titre).replace('{artiste}', i.source_artiste)}
                      <span class="conv-raison">{$tr(cleRaison(i.raison?.code))}</span>
                    </li>
                  {/each}
                </ul>
              </details>
            {/if}
          </div>
        {/each}

        {#if !resultat}
          <label class="conv-accord">
            <input
              type="checkbox"
              class="conv-accord-case"
              checked={accord}
              onchange={(e) => (accord = e.currentTarget.checked)}
            />
            <span>{$tr('plconv.transferts.accord')}</span>
          </label>
          <button class="conv-btn conv-primaire conv-verser" disabled={!accord || enCours} onclick={transferer}>
            {$tr('plconv.transferts.verser')}
          </button>
        {/if}
      </div>
    {/if}

    {#if resultat}
      <div class="conv-bloc conv-resultat">
        <h4>{$tr('plconv.transferts.fait')}</h4>
        <p class="conv-resume">
          {$tr('plconv.transferts.verses')
            .replace('{versees}', String(resultat.resume.versees))
            .replace('{appariees}', String(resultat.resume.appariees))}
        </p>
        {#each resultat.lot.playlists as pl (pl.rang)}
          <div class="conv-pl">
            <strong>{pl.cible_nom}</strong>
            <span class="conv-etat">{libelleEtat(pl.etat)}</span>
            {#if pl.erreur}<span class="conv-erreur">{pl.erreur}</span>{/if}
          </div>
        {/each}
        {#if resultat.lot.playlists.some((p) => p.etat === 'interrompu')}
          <button class="conv-btn" disabled={enCours} onclick={() => reprendre(resultat!.lot.lot_id)}>
            {$tr('plconv.transferts.reprendre')}
          </button>
        {/if}
      </div>
    {/if}

    {#if lots.length > 0}
      <div class="conv-bloc conv-lots">
        <h4>{$tr('plconv.transferts.precedents')}</h4>
        <ul>
          {#each lots as lot (lot.lot_id)}
            <li class="conv-lot">
              <span>{libelleService(lot.source_service)}</span>
              <span class="conv-discret">{$tr('plconv.versService').replace('{service}', libelleService(lot.cible_service))}</span>
              <span class="conv-etat">{libelleEtat(lot.etat)}</span>
              {#if lot.etat === 'interrompu'}
                <button class="conv-btn" disabled={enCours} onclick={() => reprendre(lot.lot_id)}>
                  {$tr('plconv.transferts.reprendre')}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
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
  .conv-ligne { display: flex; flex-wrap: wrap; gap: 12px; }
  .conv-champ { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--tune-text-secondary); }
  .conv-champ select { min-width: 180px; padding: 6px 8px; border: 1px solid var(--tune-border); border-radius: 6px; background: var(--tune-surface); color: var(--tune-text); }
  .conv-choix { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
  .conv-choix label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--tune-text); cursor: pointer; }
  .conv-btn { align-self: flex-start; padding: 6px 14px; border: 1px solid var(--tune-border); border-radius: 6px; background: none; color: var(--tune-text); cursor: pointer; font-size: 13px; }
  .conv-btn:disabled { opacity: 0.5; cursor: default; }
  .conv-primaire { background: var(--tune-accent); border-color: var(--tune-accent); color: var(--tune-bg); }
  .conv-erreur { margin: 0; color: var(--tune-danger, #ef4444); font-size: 13px; }
  .conv-bloc { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--tune-border); border-radius: 8px; }
  .conv-bloc h4 { margin: 0; font-size: 14px; color: var(--tune-text); }
  .conv-bloc ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--tune-text); }
  .conv-resume { margin: 0; font-size: 13px; color: var(--tune-text); }
  .conv-pl { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; border-top: 1px solid var(--tune-border); }
  .conv-pl-tete { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
  .conv-introuvables summary { cursor: pointer; font-size: 12px; color: var(--tune-text-secondary); }
  .conv-raison { margin-left: 6px; font-size: 12px; color: var(--tune-text-muted); }
  .conv-accord { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--tune-text); }
  .conv-etat { font-size: 12px; color: var(--tune-text-secondary); }
  .conv-lots ul { list-style: none; padding: 0; }
  .conv-lot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 4px 0; }
</style>
