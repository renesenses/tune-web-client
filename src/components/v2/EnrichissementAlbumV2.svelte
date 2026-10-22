<script lang="ts">
  /**
   * #4805 lot 1 — l'enrichissement d'un album de la BIBLIOTHÈQUE, d'après
   * MetaRust, de Xavier Joly (code offert à Tune le 05/10/2026).
   *
   *  - COMPLÉTUDE : « il manque les pistes 7 et 8 (disque 2) » par rapport à
   *    l'édition MusicBrainz retenue. Lu hors réseau (la release gardée en
   *    base) : ouvrir la fiche ne coûte aucune requête MusicBrainz.
   *  - DISCOGS : quand MusicBrainz n'a pas identifié l'album, une recherche par
   *    code-barres ou n° de catalogue. Ce sont des PROPOSITIONS : rien n'est
   *    écrit sans « Accepter », et l'acceptation ne remplit que le vide.
   *  - BPM : Wikidata d'abord, puis une estimation sur le signal. La balise
   *    du fichier passe toujours devant, et n'est jamais réécrite.
   *  - INSTRUMENTS : la fiche Wikidata des musiciens crédités sans
   *    instrument ; ils s'affichent ensuite dans les Crédits.
   */
  import * as api from '../../lib/api';
  import LiensExternes from './LiensExternes.svelte';
  import { t, locale } from '../../lib/i18n';
  import {
    phraseDesManquantes,
    phrasePochettePlusNette,
    propositionsEnAttente,
    bpmAffiche,
    type Completude,
    type PropositionGardee,
    type BpmPiste,
  } from '../../lib/enrichissementAlbum';

  interface PisteAffichee {
    id?: number | null;
    title?: string | null;
    track_number?: number | null;
    disc_number?: number | null;
  }
  interface Props {
    albumId: number;
    pistes: PisteAffichee[];
    /** La pochette en place (lot 2) : sans elle, pas de « plus nette ». */
    pochette?: string | null;
    /** Appelé avec la nouvelle adresse quand une pochette plus nette est posée. */
    onPochette?: (hash: string) => void;
  }
  let { albumId, pistes, pochette = null, onPochette }: Props = $props();

  let completude = $state<Completude | null>(null);
  let propositions = $state<PropositionGardee[]>([]);
  let bpm = $state<BpmPiste[]>([]);
  let bpmOuvert = $state(false);
  let occupe = $state<'' | 'discogs' | 'bpm' | 'instruments' | 'decision' | 'pochette'>('');
  let message = $state('');
  let avecCredits = $state(true);

  const plusieursDisques = $derived(pistes.some((p) => (p.disc_number ?? 1) > 1));
  // Conditions de Discogs : une proposition de plus de six heures ne montre
  // plus son contenu (lot 2).
  const enAttente = $derived(propositionsEnAttente(propositions).fraiches);
  const perimees = $derived(propositionsEnAttente(propositions).perimees);
  const bpmConnus = $derived(bpm.filter((b) => b.bpm != null).length);
  const bpmParPiste = $derived(new Map(bpm.map((b) => [b.track_id, b])));

  $effect(() => {
    const id = albumId;
    let vivant = true;
    completude = null;
    message = '';
    api.getAlbumCompleteness(id)
      .then((c) => {
        if (!vivant) return;
        completude = c;
        if (c.status === 'not_identified') {
          api.getAlbumDiscogsProposals(id)
            .then((r) => { if (vivant) propositions = r.proposals ?? []; })
            .catch(() => { /* serveur antérieur : pas de section */ });
        }
      })
      .catch(() => { /* serveur antérieur : la fiche reste telle quelle */ });
    api.getAlbumBpm(id)
      .then((r) => { if (vivant) bpm = r.tracks ?? []; })
      .catch(() => {});
    return () => { vivant = false; };
  });

  function statutDe(e: unknown): number | undefined {
    return (e as { status?: number } | null)?.status;
  }

  async function chercherDiscogs() {
    occupe = 'discogs';
    message = '';
    try {
      const r = await api.searchAlbumDiscogs(albumId);
      if (r.proposal) {
        const liste = await api.getAlbumDiscogsProposals(albumId);
        propositions = liste.proposals ?? [];
      } else {
        message = $t('v2.discogs.nothingFound');
      }
    } catch (e) {
      const s = statutDe(e);
      message = s === 412 ? $t('v2.discogs.noToken')
        : s === 422 ? $t('v2.discogs.noCode')
        : s === 409 ? $t('v2.discogs.alreadyIdentified')
        : $t('v2.discogs.unavailable');
    } finally {
      occupe = '';
    }
  }

  async function decider(p: PropositionGardee, accepter: boolean) {
    occupe = 'decision';
    message = '';
    try {
      if (accepter) {
        const r = await api.acceptDiscogsProposal(albumId, p.proposition.discogs_id, avecCredits);
        message = $t('v2.discogs.accepted')
          .replace('{set}', String(r.result.champs_poses.length))
          .replace('{kept}', String(r.result.champs_gardes.length))
          .replace('{tracks}', String(r.result.pistes_creditees));
      } else {
        await api.rejectDiscogsProposal(albumId, p.proposition.discogs_id);
      }
      const liste = await api.getAlbumDiscogsProposals(albumId);
      propositions = liste.proposals ?? [];
    } catch (e) {
      const corps = (e as { corps?: { error?: string } } | null)?.corps;
      message = corps?.error === 'proposition_perimee' ? $t('v2.discogs.stale') : $t('v2.discogs.unavailable');
      if (corps?.error === 'proposition_perimee') {
        api.getAlbumDiscogsProposals(albumId)
          .then((r) => { propositions = r.proposals ?? []; })
          .catch(() => {});
      }
    } finally {
      occupe = '';
    }
  }

  async function pochettePlusNette() {
    occupe = 'pochette';
    message = '';
    try {
      const r = await api.chercherPochettePlusNette(albumId);
      message = phrasePochettePlusNette(r, (k) => $t(k as any));
      if (r.enriched && r.hash) onPochette?.(r.hash);
    } catch {
      message = $t('v2.cover.failed' as any);
    } finally {
      occupe = '';
    }
  }

  async function estimerBpm() {
    occupe = 'bpm';
    message = '';
    try {
      const r = await api.estimateAlbumBpm(albumId);
      bpm = r.tracks ?? [];
      bpmOuvert = true;
    } catch {
      message = $t('v2.bpm.failed');
    } finally {
      occupe = '';
    }
  }

  async function instruments() {
    occupe = 'instruments';
    message = '';
    try {
      const r = await api.enrichAlbumInstruments(albumId);
      message = $t('v2.instruments.done').replace('{n}', String(r.result?.avec_instruments ?? 0));
    } catch {
      message = $t('v2.instruments.failed');
    } finally {
      occupe = '';
    }
  }

  function sourceBpm(b: BpmPiste | undefined): string {
    switch (b?.source) {
      case 'balise': return $t('v2.bpm.sourceTag');
      case 'wikidata': return $t('v2.bpm.sourceWikidata');
      case 'signal': return $t('v2.bpm.sourceSignal');
      default: return '';
    }
  }
</script>

<section class="enrichissement" data-enrichissement-album>
  <!-- tune-server-rust#6001 — ProgArchives / Metal Archives / AllMusic. -->
  <LiensExternes cle={albumId} charger={api.getAlbumExternalLinks} />
  {#if completude?.status === 'incomplete' && completude.missing?.length}
    <p class="manque" data-completude="incomplete"
      title={completude.missing.map((m) => m.titre).join(' · ')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      {phraseDesManquantes(completude.missing, plusieursDisques, (k) => $t(k), $locale)}
      <span class="mesure">{$t('v2.completeness.count').replace('{present}', String(completude.present ?? 0)).replace('{expected}', String(completude.expected ?? 0))}</span>
    </p>
  {:else if completude?.status === 'complete'}
    <p class="complet" data-completude="complete">
      {$t('v2.completeness.complete').replace('{n}', String(completude.expected ?? 0))}
    </p>
  {/if}
  {#if completude?.duplicates?.length}
    <p class="manque" data-completude="duplicates">
      {$t('v2.completeness.duplicates').replace('{n}', String(completude.duplicates.length))}
    </p>
  {/if}

  <div class="gestes">
    <button class="ghost" onclick={estimerBpm} disabled={occupe !== ''} title={$t('v2.bpm.estimateTip')}>
      {occupe === 'bpm' ? $t('v2.bpm.estimating') : $t('v2.bpm.estimate')}
    </button>
    {#if bpmConnus > 0}
      <button class="ghost" onclick={() => (bpmOuvert = !bpmOuvert)} aria-expanded={bpmOuvert}>
        {$t('v2.bpm.known').replace('{n}', String(bpmConnus)).replace('{total}', String(bpm.length))}
      </button>
    {/if}
    <button class="ghost" onclick={instruments} disabled={occupe !== ''} title={$t('v2.instruments.tip')}>
      {occupe === 'instruments' ? $t('v2.instruments.running') : $t('v2.instruments.fetch')}
    </button>
    {#if pochette}
      <button class="ghost" data-pochette-plus-nette onclick={pochettePlusNette} disabled={occupe !== ''} title={$t('v2.cover.sharperTip' as any)}>
        {occupe === 'pochette' ? $t('v2.cover.searching' as any) : $t('v2.cover.sharper' as any)}
      </button>
    {/if}
    {#if completude?.status === 'not_identified'}
      <button class="ghost" data-discogs-chercher onclick={chercherDiscogs} disabled={occupe !== ''} title={$t('v2.discogs.searchTip')}>
        {occupe === 'discogs' ? $t('v2.discogs.searching') : $t('v2.discogs.search')}
      </button>
    {/if}
  </div>

  {#if message}<p class="message" role="status">{message}</p>{/if}

  {#if bpmOuvert && bpm.length}
    <ul class="bpm" data-bpm-liste>
      {#each pistes as p (p.id)}
        {@const b = p.id != null ? bpmParPiste.get(p.id) : undefined}
        <li>
          <span class="no">{p.track_number ?? ''}</span>
          <span class="titre" title={p.title ?? ''}>{p.title ?? ''}</span>
          <span class="valeur">{bpmAffiche(b) ? `${bpmAffiche(b)} BPM` : '—'}</span>
          <span class="source">{sourceBpm(b)}</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#each perimees as p (p.proposition.discogs_id)}
    <!-- Plus de six heures : le contenu Discogs ne s'affiche plus. -->
    <p class="message" data-proposition-perimee={p.proposition.discogs_id}>{$t('v2.discogs.stale' as any)}</p>
  {/each}

  {#each enAttente as p (p.proposition.discogs_id)}
    <div class="proposition" data-proposition-discogs={p.proposition.discogs_id}>
      <p class="tete-prop">
        {$t('v2.discogs.proposal')}
        <a href={p.proposition.url} target="_blank" rel="noopener noreferrer">{p.proposition.titre ?? p.proposition.url}</a>
      </p>
      <dl>
        {#if p.proposition.annee}<dt>{$t('v2.discogs.year')}</dt><dd>{p.proposition.annee}</dd>{/if}
        {#if p.proposition.label}<dt>{$t('v2.discogs.label')}</dt><dd>{p.proposition.label}</dd>{/if}
        {#if p.proposition.catalog_number}<dt>{$t('v2.discogs.catno')}</dt><dd>{p.proposition.catalog_number}</dd>{/if}
        <dt>{$t('v2.discogs.credits')}</dt><dd>{p.proposition.credits_album.length + p.proposition.pistes.reduce((n, x) => n + (x.credits?.length ?? 0), 0)}</dd>
      </dl>
      <p class="regle">{$t('v2.discogs.rule')}</p>
      <label class="option"><input type="checkbox" bind:checked={avecCredits} /> {$t('v2.discogs.withCredits')}</label>
      <div class="gestes">
        <button class="ghost" onclick={() => decider(p, true)} disabled={occupe !== ''}>{$t('v2.discogs.accept')}</button>
        <button class="ghost" onclick={() => decider(p, false)} disabled={occupe !== ''}>{$t('v2.discogs.reject')}</button>
      </div>
      <p class="attribution">{$t('v2.discogs.attribution')}</p>
    </div>
  {/each}
</section>

<style>
  .enrichissement { display: flex; flex-direction: column; gap: 8px; margin: 8px 0 4px; }
  .manque, .complet, .message, .regle, .attribution { margin: 0; font-size: 13px; }
  .manque { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--tune-warning, #d97706); }
  .manque svg { width: 16px; height: 16px; flex: none; }
  .mesure { color: var(--tune-text-muted); font-size: 12px; }
  .complet, .message, .regle, .attribution { color: var(--tune-text-muted); }
  .attribution { font-size: 11px; }
  .gestes { display: flex; flex-wrap: wrap; gap: 6px; }
  .ghost {
    padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    background: transparent; color: var(--tune-text);
    border: 1px solid var(--tune-border, rgba(127, 127, 127, 0.3));
  }
  .ghost:disabled { opacity: 0.5; cursor: default; }
  .bpm { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  .bpm li { display: grid; grid-template-columns: 32px minmax(0, 1fr) 80px 90px; gap: 8px; }
  .bpm .no, .bpm .source { color: var(--tune-text-muted); }
  .bpm .titre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .proposition {
    border: 1px solid var(--tune-border, rgba(127, 127, 127, 0.3)); border-radius: 8px;
    padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
  }
  .tete-prop { margin: 0; font-size: 13px; font-weight: 600; }
  .tete-prop a { color: var(--tune-accent); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0; font-size: 13px; }
  dt { color: var(--tune-text-muted); }
  dd { margin: 0; }
  .option { font-size: 12px; display: flex; align-items: center; gap: 6px; }
</style>
