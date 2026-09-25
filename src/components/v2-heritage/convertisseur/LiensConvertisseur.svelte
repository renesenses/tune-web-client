<script lang="ts">
  /**
   * Onglet « Synchro » du greffon Playlists converter (tune-server-rust#4904).
   *
   * Un LIEN tient deux playlists à jour : deux services différents, ou un
   * service et la bibliothèque locale ; sens unique ou double. Il n'écrit que
   * des AJOUTS : une piste disparue d'un côté est signalée au journal, jamais
   * retirée de l'autre.
   *
   * La première synchro d'un lien passe par un aperçu accepté. L'écran ne
   * devine pas quand : il demande la synchro, et si le greffon répond 409
   * `apercu_requis` (ou `accord_requis`), il ouvre l'aperçu — c'est le greffon
   * qui sait si le lien a déjà été synchronisé.
   *
   * Supprimer un lien ne touche à AUCUNE des deux playlists (le greffon le
   * dit : `playlists_touchees: false`) ; la confirmation le dit aussi.
   */
  import * as api from '../../../lib/api';
  import type { Playlist, StreamingPlaylist } from '../../../lib/types';
  import { t as tr } from '../../../lib/i18n';
  import { isPremium } from '../../../lib/stores/license';
  import { dialogs } from '../../../lib/stores/dialogs';
  import { errText } from '../../../lib/utils';
  import {
    CADENCES_PROPOSEES,
    cleRaison,
    codeConvertisseur,
    dateConvertisseur,
    nomService,
    playlistsDuService,
  } from '../../../lib/convertisseurPlaylists';

  interface Props {
    localPlaylists: Playlist[];
    streamingPlaylists: Record<string, StreamingPlaylist[]>;
  }
  let { localPlaylists, streamingPlaylists }: Props = $props();

  let liens = $state<api.LienConvertisseur[]>([]);
  let charge = $state(false);
  let occupe = $state<string | null>(null);
  let erreur = $state<string | null>(null);
  let refusPremium = $state(false);

  // Aperçu de la première synchro.
  let apercu = $state<{ lienId: string; plan: api.PlanLienConvertisseur } | null>(null);
  let accord = $state(false);

  // Dernier compte rendu de synchro, par lien.
  let comptesRendus = $state<Record<string, api.EntreeJournalLienConvertisseur>>({});
  // Journal ouvert.
  let journalOuvert = $state<string | null>(null);
  let journal = $state<api.EntreeJournalLienConvertisseur[]>([]);

  // Création d'un lien.
  let aService = $state('');
  let aPlaylist = $state('');
  let bService = $state('');
  let bPlaylist = $state('');
  let sens = $state<api.SensLien>('a_vers_b');
  let cadence = $state(0);

  const services: string[] = $derived(['local', ...Object.keys(streamingPlaylists)]);
  const candidatesA = $derived(playlistsDuService(aService, localPlaylists, streamingPlaylists));
  const candidatesB = $derived(playlistsDuService(bService, localPlaylists, streamingPlaylists));
  const creationPossible: boolean = $derived(
    !!aService && !!aPlaylist && !!bService && !!bPlaylist && aService !== bService,
  );

  function libelleService(s: string): string {
    return s === 'local' ? $tr('plconv.bibliotheque') : nomService(s);
  }

  function extremite(e: api.ExtremiteLienConvertisseur): string {
    return $tr('plconv.liens.extremite')
      .replace('{nom}', e.nom || e.playlist_id)
      .replace('{service}', libelleService(e.service));
  }

  function libelle(prefixe: string, valeur: string): string {
    const cle = `${prefixe}.${valeur}`;
    const v = $tr(cle);
    return v === cle ? valeur : v;
  }

  function libelleCadence(minutes: number): string {
    if (minutes === 0) return $tr('plconv.cadence.demande');
    if (minutes < 60) return $tr('plconv.cadence.minutes').replace('{n}', String(minutes));
    if (minutes < 1440) return $tr('plconv.cadence.heures').replace('{n}', String(minutes / 60));
    return $tr('plconv.cadence.jours').replace('{n}', String(minutes / 1440));
  }

  function cadencesPour(l: api.LienConvertisseur): number[] {
    const liste: number[] = [...CADENCES_PROPOSEES];
    return liste.includes(l.cadence_minutes) ? liste : [...liste, l.cadence_minutes].sort((x, y) => x - y);
  }

  function retenir(e: unknown) {
    refusPremium = (e as { status?: number } | null)?.status === 402;
    erreur = refusPremium ? '' : (errText(e) ?? '');
  }

  function remplacer(l: api.LienConvertisseur) {
    liens = liens.map((x) => (x.lien_id === l.lien_id ? l : x));
  }

  async function chargerLiens() {
    try {
      const r = await api.convertisseurLiens();
      liens = r?.liens ?? [];
    } catch (e) {
      retenir(e);
    }
    charge = true;
  }

  async function creer() {
    if (!creationPossible) return;
    const nomA = candidatesA.find((p) => p.id === aPlaylist)?.nom;
    const nomB = candidatesB.find((p) => p.id === bPlaylist)?.nom;
    occupe = 'creation';
    erreur = null;
    try {
      const r = await api.convertisseurCreerLien({
        a: { service: aService, playlist_id: aPlaylist, ...(nomA ? { nom: nomA } : {}) },
        b: { service: bService, playlist_id: bPlaylist, ...(nomB ? { nom: nomB } : {}) },
        sens,
        cadence_minutes: cadence,
      });
      liens = [...liens, r.lien];
      aPlaylist = '';
      bPlaylist = '';
    } catch (e) {
      retenir(e);
    }
    occupe = null;
  }

  async function ouvrirApercu(lienId: string) {
    erreur = null;
    try {
      const r = await api.convertisseurApercuLien(lienId);
      apercu = { lienId, plan: r.plan };
      accord = false;
    } catch (e) {
      retenir(e);
    }
  }

  /**
   * Synchro à la demande. Sur un lien jamais synchronisé, le greffon répond
   * 409 `apercu_requis` / `accord_requis` : on ouvre alors l'aperçu au lieu
   * d'afficher une erreur — c'est le parcours, pas une panne.
   */
  async function synchroniser(l: api.LienConvertisseur) {
    occupe = l.lien_id;
    erreur = null;
    let code: string | null = null;
    try {
      const r = await api.convertisseurSynchroniserLien(l.lien_id);
      remplacer(r.lien);
      comptesRendus = { ...comptesRendus, [l.lien_id]: r.entree };
    } catch (e) {
      code = codeConvertisseur(e);
      if (code !== 'apercu_requis' && code !== 'accord_requis') retenir(e);
    }
    occupe = null;
    if (code === 'apercu_requis' || code === 'accord_requis') await ouvrirApercu(l.lien_id);
  }

  async function accepterApercu() {
    if (!apercu || !accord) return;
    const lienId = apercu.lienId;
    occupe = lienId;
    erreur = null;
    try {
      const r = await api.convertisseurSynchroniserLien(lienId, true);
      remplacer(r.lien);
      comptesRendus = { ...comptesRendus, [lienId]: r.entree };
      apercu = null;
      accord = false;
    } catch (e) {
      retenir(e);
    }
    occupe = null;
  }

  async function basculerPause(l: api.LienConvertisseur) {
    occupe = l.lien_id;
    erreur = null;
    try {
      remplacer((await api.convertisseurPauseLien(l.lien_id, l.etat !== 'en_pause')).lien);
    } catch (e) {
      retenir(e);
    }
    occupe = null;
  }

  async function changerCadence(l: api.LienConvertisseur, minutes: number) {
    occupe = l.lien_id;
    erreur = null;
    try {
      remplacer((await api.convertisseurReglerLien(l.lien_id, minutes)).lien);
    } catch (e) {
      retenir(e);
    }
    occupe = null;
  }

  async function basculerJournal(l: api.LienConvertisseur) {
    if (journalOuvert === l.lien_id) {
      journalOuvert = null;
      return;
    }
    journalOuvert = l.lien_id;
    journal = [];
    try {
      journal = (await api.convertisseurJournalLien(l.lien_id)).entrees ?? [];
    } catch (e) {
      retenir(e);
    }
  }

  /** Retire le LIEN. Aucune route de playlist n'est appelée : les deux playlists restent telles quelles. */
  async function supprimer(l: api.LienConvertisseur) {
    const ok = await dialogs.confirm($tr('plconv.liens.confirmerSuppression'), { danger: true });
    if (!ok) return;
    occupe = l.lien_id;
    erreur = null;
    try {
      await api.convertisseurSupprimerLien(l.lien_id);
      liens = liens.filter((x) => x.lien_id !== l.lien_id);
      if (apercu?.lienId === l.lien_id) apercu = null;
      if (journalOuvert === l.lien_id) journalOuvert = null;
    } catch (e) {
      retenir(e);
    }
    occupe = null;
  }

  $effect(() => {
    if ($isPremium) void chargerLiens();
  });
</script>

<section class="conv" data-onglet="conv-synchro">
  {#if !$isPremium}
    <p class="conv-premium">{$tr('plconv.premium')}</p>
  {:else}
    <h3 class="conv-titre">{$tr('plconv.liens.titre')}</h3>
    <p class="conv-aide">{$tr('plconv.liens.aide')}</p>

    <div class="conv-bloc conv-creation">
      <h4>{$tr('plconv.liens.nouveau')}</h4>
      <div class="conv-ligne">
        <label class="conv-champ">
          <span>{$tr('plconv.liens.cote').replace('{cote}', 'A')}</span>
          <select class="conv-a-service" value={aService} onchange={(e) => { aService = e.currentTarget.value; aPlaylist = ''; }}>
            <option value="">{$tr('plconv.choisir')}</option>
            {#each services as s (s)}<option value={s}>{libelleService(s)}</option>{/each}
          </select>
          <select class="conv-a-playlist" value={aPlaylist} onchange={(e) => (aPlaylist = e.currentTarget.value)}>
            <option value="">{$tr('plconv.choisir')}</option>
            {#each candidatesA as pl (pl.id)}<option value={pl.id}>{pl.nom}</option>{/each}
          </select>
        </label>
        <label class="conv-champ">
          <span>{$tr('plconv.liens.cote').replace('{cote}', 'B')}</span>
          <select class="conv-b-service" value={bService} onchange={(e) => { bService = e.currentTarget.value; bPlaylist = ''; }}>
            <option value="">{$tr('plconv.choisir')}</option>
            {#each services as s (s)}<option value={s}>{libelleService(s)}</option>{/each}
          </select>
          <select class="conv-b-playlist" value={bPlaylist} onchange={(e) => (bPlaylist = e.currentTarget.value)}>
            <option value="">{$tr('plconv.choisir')}</option>
            {#each candidatesB as pl (pl.id)}<option value={pl.id}>{pl.nom}</option>{/each}
          </select>
        </label>
        <label class="conv-champ">
          <span>{$tr('plconv.liens.sens')}</span>
          <select class="conv-sens" value={sens} onchange={(e) => (sens = e.currentTarget.value as api.SensLien)}>
            <option value="a_vers_b">{$tr('plconv.sens.a_vers_b')}</option>
            <option value="deux_sens">{$tr('plconv.sens.deux_sens')}</option>
          </select>
        </label>
        <label class="conv-champ">
          <span>{$tr('plconv.liens.cadence')}</span>
          <select class="conv-cadence" value={String(cadence)} onchange={(e) => (cadence = Number(e.currentTarget.value))}>
            {#each CADENCES_PROPOSEES as c (c)}<option value={String(c)}>{libelleCadence(c)}</option>{/each}
          </select>
        </label>
      </div>
      {#if aService && bService && aService === bService}
        <p class="conv-aide">{$tr('plconv.liens.memeService')}</p>
      {/if}
      <p class="conv-aide">{$tr('plconv.liens.premiereSynchro')}</p>
      <button class="conv-btn conv-creer" disabled={!creationPossible || occupe !== null} onclick={creer}>
        {$tr('plconv.liens.creer')}
      </button>
    </div>

    {#if erreur !== null}
      <p class="conv-erreur" role="alert">{refusPremium ? $tr('plconv.premium') : erreur || $tr('plconv.erreurGenerique')}</p>
    {/if}

    {#if charge && liens.length === 0}
      <p class="conv-vide">{$tr('plconv.liens.aucun')}</p>
    {/if}

    {#each liens as l (l.lien_id)}
      <div class="conv-bloc conv-lien" data-lien={l.lien_id}>
        <div class="conv-lien-tete">
          <strong>{extremite(l.a)}</strong>
          <span class="conv-discret">{libelle('plconv.sens', l.sens)}</span>
          <strong>{extremite(l.b)}</strong>
        </div>
        <div class="conv-lien-etat">
          <span class="conv-etat">{libelle('plconv.lienEtat', l.etat)}</span>
          {#if l.derniere_synchro_ms}
            <span class="conv-discret">{$tr('plconv.liens.derniere').replace('{date}', dateConvertisseur(l.derniere_synchro_ms))}</span>
          {/if}
          {#if l.prochaine_synchro_ms && l.etat === 'actif' && l.cadence_minutes > 0}
            <span class="conv-discret">{$tr('plconv.liens.prochaine').replace('{date}', dateConvertisseur(l.prochaine_synchro_ms))}</span>
          {/if}
        </div>
        {#if l.derniere_erreur}
          <p class="conv-erreur">{l.derniere_erreur}</p>
        {/if}
        <div class="conv-actions">
          <button class="conv-btn conv-synchroniser" disabled={occupe !== null || l.etat === 'en_pause'} onclick={() => synchroniser(l)}>
            {$tr('plconv.liens.synchroniser')}
          </button>
          <button class="conv-btn conv-pause" disabled={occupe !== null} onclick={() => basculerPause(l)}>
            {l.etat === 'en_pause' ? $tr('plconv.liens.reprendre') : $tr('plconv.liens.pause')}
          </button>
          <label class="conv-champ conv-champ-ligne">
            <span>{$tr('plconv.liens.cadence')}</span>
            <select
              class="conv-cadence-lien"
              value={String(l.cadence_minutes)}
              disabled={occupe !== null}
              onchange={(e) => changerCadence(l, Number(e.currentTarget.value))}
            >
              {#each cadencesPour(l) as c (c)}<option value={String(c)}>{libelleCadence(c)}</option>{/each}
            </select>
          </label>
          <button class="conv-btn conv-journal" onclick={() => basculerJournal(l)}>{$tr('plconv.liens.journal')}</button>
          <button class="conv-btn conv-supprimer" disabled={occupe !== null} onclick={() => supprimer(l)}>
            {$tr('plconv.liens.supprimer')}
          </button>
        </div>

        {#if apercu && apercu.lienId === l.lien_id}
          <div class="conv-apercu-lien">
            <h4>{$tr('plconv.liens.apercuTitre')}</h4>
            <p class="conv-aide">{$tr('plconv.rienNestEcrit')}</p>
            <p class="conv-resume">
              {$tr('plconv.liens.apercuResume')
                .replace('{ajouts}', String(apercu.plan.ajouts.length))
                .replace('{deja}', String(apercu.plan.deja_presentes))
                .replace('{introuvables}', String(apercu.plan.introuvables.length))}
            </p>
            {#if apercu.plan.ajouts.length > 0}
              <ul class="conv-ajouts">
                {#each apercu.plan.ajouts as a, k (k)}
                  <li>
                    {$tr('plconv.titreArtiste').replace('{titre}', a.titre).replace('{artiste}', a.artiste)}
                    <span class="conv-discret">{$tr('plconv.liens.vers').replace('{cote}', a.vers === 'a' ? extremite(l.a) : extremite(l.b))}</span>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if apercu.plan.introuvables.length > 0}
              <details class="conv-introuvables">
                <summary>{$tr('plconv.introuvables').replace('{n}', String(apercu.plan.introuvables.length))}</summary>
                <ul>
                  {#each apercu.plan.introuvables as i, k (k)}
                    <li>
                      {$tr('plconv.titreArtiste').replace('{titre}', i.titre).replace('{artiste}', i.artiste)}
                      <span class="conv-discret">{$tr(cleRaison(i.raison?.code))}</span>
                    </li>
                  {/each}
                </ul>
              </details>
            {/if}
            {#if apercu.plan.disparues.length > 0}
              <p class="conv-resume">{$tr('plconv.liens.disparues').replace('{n}', String(apercu.plan.disparues.length))}</p>
              <ul class="conv-disparues">
                {#each apercu.plan.disparues as d, k (k)}
                  <li>{$tr('plconv.titreArtiste').replace('{titre}', d.titre).replace('{artiste}', d.artiste)}</li>
                {/each}
              </ul>
            {/if}
            <label class="conv-accord">
              <input type="checkbox" class="conv-accord-case" checked={accord} onchange={(e) => (accord = e.currentTarget.checked)} />
              <span>{$tr('plconv.liens.accord')}</span>
            </label>
            <div class="conv-actions">
              <button class="conv-btn conv-primaire conv-accepter" disabled={!accord || occupe !== null} onclick={accepterApercu}>
                {$tr('plconv.liens.accepter')}
              </button>
              <button class="conv-btn" onclick={() => { apercu = null; accord = false; }}>{$tr('plconv.fermer')}</button>
            </div>
          </div>
        {/if}

        {#if comptesRendus[l.lien_id]}
          {@const cr = comptesRendus[l.lien_id]}
          <p class="conv-resume conv-compte-rendu">
            {$tr('plconv.journal.compte')
              .replace('{ajoutees}', String(cr.ajoutees))
              .replace('{introuvables}', String(cr.introuvables))}
            <span class="conv-discret">{libelle('plconv.statut', cr.statut)}</span>
          </p>
        {/if}

        {#if journalOuvert === l.lien_id}
          <div class="conv-journal-liste">
            <h4>{$tr('plconv.liens.journal')}</h4>
            {#if journal.length === 0}
              <p class="conv-vide">{$tr('plconv.journal.vide')}</p>
            {/if}
            {#each journal as en (en.numero)}
              <div class="conv-entree">
                <div class="conv-lien-etat">
                  <span>{dateConvertisseur(en.quand_ms)}</span>
                  <span class="conv-discret">{libelle('plconv.declencheur', en.declencheur)}</span>
                  <span class="conv-etat">{libelle('plconv.statut', en.statut)}</span>
                </div>
                <p class="conv-resume">
                  {$tr('plconv.journal.compte')
                    .replace('{ajoutees}', String(en.ajoutees))
                    .replace('{introuvables}', String(en.introuvables))}
                </p>
                {#if en.disparues_signalees.length > 0}
                  <p class="conv-resume">{$tr('plconv.liens.disparues').replace('{n}', String(en.disparues_signalees.length))}</p>
                  <ul class="conv-disparues">
                    {#each en.disparues_signalees as d, k (k)}
                      <li>{$tr('plconv.titreArtiste').replace('{titre}', d.titre).replace('{artiste}', d.artiste)}</li>
                    {/each}
                  </ul>
                {/if}
                {#if en.echecs.length > 0}
                  <p class="conv-resume">{$tr('plconv.journal.echecs').replace('{n}', String(en.echecs.length))}</p>
                  <ul class="conv-echecs">
                    {#each en.echecs as m, k (k)}<li>{m}</li>{/each}
                  </ul>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
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
  .conv-champ-ligne { flex-direction: row; align-items: center; }
  .conv-champ select { min-width: 160px; padding: 6px 8px; border: 1px solid var(--tune-border); border-radius: 6px; background: var(--tune-surface); color: var(--tune-text); }
  .conv-btn { padding: 6px 14px; border: 1px solid var(--tune-border); border-radius: 6px; background: none; color: var(--tune-text); cursor: pointer; font-size: 13px; }
  .conv-btn:disabled { opacity: 0.5; cursor: default; }
  .conv-primaire { background: var(--tune-accent); border-color: var(--tune-accent); color: var(--tune-bg); }
  .conv-erreur { margin: 0; color: var(--tune-danger, #ef4444); font-size: 13px; }
  .conv-bloc { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--tune-border); border-radius: 8px; }
  .conv-bloc h4 { margin: 0; font-size: 14px; color: var(--tune-text); }
  .conv-bloc ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--tune-text); }
  .conv-lien-tete, .conv-lien-etat, .conv-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .conv-etat { font-size: 12px; color: var(--tune-text-secondary); }
  .conv-resume { margin: 0; font-size: 13px; color: var(--tune-text); }
  .conv-accord { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--tune-text); }
  .conv-apercu-lien, .conv-journal-liste { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px solid var(--tune-border); }
  .conv-entree { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; border-top: 1px solid var(--tune-border); }
  .conv-introuvables summary { cursor: pointer; font-size: 12px; color: var(--tune-text-secondary); }
  .conv-disparues { color: var(--tune-text-secondary); }
</style>
