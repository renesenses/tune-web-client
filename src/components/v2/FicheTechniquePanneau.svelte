<script lang="ts">
  /**
   * La FICHE TECHNIQUE d'une piste — tune-server-rust#8160.
   *
   * Ouverte depuis le menu « … » d'une piste de la bibliothèque, partout où il
   * existe (listes, fiche album, Lecture en cours). Une route réunit les
   * sections datées (`lib/ficheTechnique`) ; l'écran n'en montre AUCUNE vide :
   * une piste de service sans fichier n'a que son format et sa provenance.
   *
   * - Spectrogramme : l'image conservée par le serveur, chargée en `Blob`
   *   (l'en-tête d'authentification ne voyage pas par `<img src>`), avec son
   *   état (à jour, périmé, absent) et le bouton « Recalculer ».
   * - Forme d'onde : place réservée à l'étude #8159, rien n'est calculé.
   * - Note personnelle : le composant `MesNotes`, éditable sur place.
   */
  import { portail } from '../../lib/portail';
  import { t, locale } from '../../lib/i18n';
  import MesNotes from '../partages/MesNotes.svelte';
  import { chargerSpectrogramme } from '../../lib/spectrogramme';
  import {
    chargerFicheTechnique, recalculerSpectrogramme, sectionsVisibles, ErreurFiche,
    cleSourceDr, cleVerdictHiRes, cleVerdictIntegrite, cleEtatSpectrogramme,
    dateLisible, frequenceLisible, tailleLisible,
    type FicheTechnique, type GenreErreurFiche,
  } from '../../lib/ficheTechnique';

  interface Props {
    trackId: number;
    titre?: string;
    onClose: () => void;
  }
  let { trackId, titre = '', onClose }: Props = $props();

  type Etat =
    | { v: 'chargement' }
    | { v: 'fiche'; fiche: FicheTechnique }
    | { v: 'erreur'; genre: GenreErreurFiche };
  let etat = $state<Etat>({ v: 'chargement' });
  let image = $state<string | null>(null);
  let calcul = $state<'repos' | 'encours' | 'echec'>('repos');
  let controle: AbortController | null = null;

  const fiche = $derived(etat.v === 'fiche' ? etat.fiche : null);
  const sections = $derived(fiche ? sectionsVisibles(fiche) : []);
  const langue = $derived($locale ?? 'fr');
  const spectro = $derived(fiche?.spectrogramme ?? null);

  function liberer() {
    if (image) URL.revokeObjectURL(image);
    image = null;
  }

  async function chargerImage(f: FicheTechnique) {
    liberer();
    const s = f.spectrogramme;
    if (!s || s.etat !== 'a_jour') return;
    controle?.abort();
    const c = new AbortController();
    controle = c;
    try {
      const blob = await chargerSpectrogramme(trackId, { largeur: s.largeur, hauteur: s.hauteur, signal: c.signal });
      if (!c.signal.aborted) image = URL.createObjectURL(blob);
    } catch {
      // L'image manque : la section garde son état et son bouton.
    }
  }

  async function charger() {
    etat = { v: 'chargement' };
    try {
      const f = await chargerFicheTechnique(trackId);
      etat = { v: 'fiche', fiche: f };
      void chargerImage(f);
    } catch (e) {
      etat = { v: 'erreur', genre: e instanceof ErreurFiche ? e.genre : 'reseau' };
    }
  }

  async function recalculer() {
    if (!fiche) return;
    calcul = 'encours';
    try {
      const s = await recalculerSpectrogramme(trackId);
      const f = { ...fiche, spectrogramme: s };
      etat = { v: 'fiche', fiche: f };
      calcul = 'repos';
      await chargerImage(f);
    } catch {
      calcul = 'echec';
    }
  }

  $effect(() => {
    void trackId;
    void charger();
    return () => { controle?.abort(); liberer(); };
  });

  function fermer() {
    controle?.abort();
    liberer();
    onClose();
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); }
  }

  function date(cle: string, iso: string | null | undefined): string | null {
    const d = dateLisible(iso, langue);
    return d ? $t(cle as any).replace('{date}', d) : null;
  }

  function duree(ms: number): string {
    const s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail
  onclick={(e) => { e.stopPropagation(); fermer(); }}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('fiche.title' as any)} tabindex="-1"
    onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>{$t('fiche.title' as any)}</h2>
      {#if titre}<p class="src">{titre}</p>{/if}
      <button class="x" onclick={fermer} aria-label={$t('v2.common.close' as any)}>×</button>
    </header>

    {#if etat.v === 'chargement'}
      <p class="etat" role="status" aria-live="polite">{$t('fiche.loading' as any)}</p>
    {:else if etat.v === 'erreur'}
      <p class="etat" role="alert">{$t((etat.genre === 'indisponible' ? 'fiche.unavailable' : 'fiche.error') as any)}</p>
      {#if etat.genre === 'reseau'}
        <button class="bouton" onclick={charger}>{$t('fiche.retry' as any)}</button>
      {/if}
    {:else if fiche}
      {#each sections as cle (cle)}
        <section class="bloc" data-section={cle}>
          {#if cle === 'format' && fiche.format}
            <h3>{$t('fiche.section.format' as any)}</h3>
            <dl>
              {#if fiche.format.codec}<dt>{$t('fiche.codec' as any)}</dt><dd>{fiche.format.codec.toUpperCase()}</dd>{/if}
              {#if fiche.format.sample_rate}<dt>{$t('fiche.sampleRate' as any)}</dt><dd>{frequenceLisible(fiche.format.sample_rate, langue)}</dd>{/if}
              {#if fiche.format.bit_depth}<dt>{$t('fiche.bitDepth' as any)}</dt><dd>{$t('fiche.bits' as any).replace('{n}', String(fiche.format.bit_depth))}</dd>{/if}
              {#if fiche.format.channels}<dt>{$t('fiche.channels' as any)}</dt><dd>{fiche.format.channels}</dd>{/if}
              {#if fiche.format.bitrate_kbps}<dt>{$t('fiche.bitrate' as any)}</dt><dd>{$t('fiche.kbps' as any).replace('{n}', String(fiche.format.bitrate_kbps))}</dd>{/if}
              {#if fiche.format.duration_ms}<dt>{$t('fiche.duration' as any)}</dt><dd>{duree(fiche.format.duration_ms)}</dd>{/if}
              {#if fiche.format.file_size}<dt>{$t('fiche.size' as any)}</dt><dd>{tailleLisible(fiche.format.file_size, langue)}</dd>{/if}
            </dl>
            {#if date('fiche.fileModifiedOn', fiche.format.fichier_modifie_le)}
              <p class="date">{date('fiche.fileModifiedOn', fiche.format.fichier_modifie_le)}</p>
            {/if}
          {:else if cle === 'spectrogramme' && spectro}
            <h3>{$t('fiche.section.spectro' as any)}</h3>
            <p class="etat-section" data-etat={spectro.etat}>{$t(cleEtatSpectrogramme(spectro.etat) as any)}</p>
            {#if image && spectro.etat === 'a_jour'}
              <img class="image" src={image} alt={$t('spectro.alt' as any).replace('{title}', titre)} />
              <p class="date">{$t('spectro.axes' as any)}</p>
            {/if}
            {#if spectro.calcule_le}
              <p class="date">{date('fiche.computedOn', spectro.calcule_le)}</p>
            {/if}
            {#if calcul === 'encours'}
              <p class="etat" role="status" aria-live="polite">{$t('spectro.loading' as any)}</p>
            {:else}
              {#if calcul === 'echec'}<p class="etat" role="alert">{$t('fiche.spectro.failed' as any)}</p>{/if}
              <button class="bouton" onclick={recalculer}>
                {$t((spectro.etat === 'absent' ? 'fiche.spectro.compute' : 'fiche.spectro.recompute') as any)}
              </button>
            {/if}
          {:else if cle === 'formeDOnde'}
            <h3>{$t('fiche.section.waveform' as any)}</h3>
            <div class="reserve" aria-hidden="true"></div>
            <p class="date">{$t('fiche.waveform.soon' as any)}</p>
          {:else if cle === 'dynamicRange' && fiche.dynamic_range}
            <h3>{$t('fiche.section.dr' as any)}</h3>
            <p class="valeur">{$t('fiche.dr.value' as any).replace('{n}', String(fiche.dynamic_range.valeur))}</p>
            <p>{$t(cleSourceDr(fiche.dynamic_range.source) as any)}</p>
            {#if fiche.dynamic_range.mesure_le}<p class="date">{date('fiche.measuredOn', fiche.dynamic_range.mesure_le)}</p>{/if}
          {:else if cle === 'fauxHires' && fiche.faux_hires}
            <h3>{$t('fiche.section.hires' as any)}</h3>
            <p class="valeur">{$t(cleVerdictHiRes(fiche.faux_hires.verdict) as any)}</p>
            <dl>
              {#if fiche.faux_hires.bits_effectifs}<dt>{$t('fiche.hires.effectiveBits' as any)}</dt><dd>{$t('fiche.bits' as any).replace('{n}', String(fiche.faux_hires.bits_effectifs))}</dd>{/if}
              {#if fiche.faux_hires.coupure_hz}<dt>{$t('fiche.hires.cutoff' as any)}</dt><dd>{frequenceLisible(fiche.faux_hires.coupure_hz, langue)}</dd>{/if}
            </dl>
            {#if fiche.faux_hires.mesure_le}<p class="date">{date('fiche.measuredOn', fiche.faux_hires.mesure_le)}</p>{/if}
          {:else if cle === 'integrite' && fiche.integrite}
            <h3>{$t('fiche.section.integrity' as any)}</h3>
            <p class="valeur">{$t(cleVerdictIntegrite(fiche.integrite.verdict) as any)}</p>
            {#if fiche.integrite.erreur}<p class="detail">{fiche.integrite.erreur}</p>{/if}
            <p>{$t((fiche.integrite.mode === 'quick' ? 'fiche.integrity.quick' : 'fiche.integrity.full') as any)}</p>
            {#if fiche.integrite.fichier_change_depuis}<p class="etat-section" data-etat="perime">{$t('fiche.integrity.changed' as any)}</p>{/if}
            {#if fiche.integrite.audite_le}<p class="date">{date('fiche.auditedOn', fiche.integrite.audite_le)}</p>{/if}
          {:else if cle === 'provenance' && fiche.provenance}
            <h3>{$t('fiche.section.provenance' as any)}</h3>
            <dl>
              {#if fiche.provenance.source}<dt>{$t('fiche.prov.source' as any)}</dt><dd>{fiche.provenance.source}</dd>{/if}
              {#if fiche.provenance.balises_lues_du_fichier}<dt>{$t('fiche.prov.tags' as any)}</dt><dd>{$t('fiche.prov.tagsFromFile' as any)}</dd>{/if}
              {#if fiche.provenance.champs_tenus?.length}<dt>{$t('fiche.prov.held' as any)}</dt><dd>{fiche.provenance.champs_tenus.join(', ')}</dd>{/if}
              {#if fiche.provenance.isrc}<dt>{$t('fiche.prov.isrc' as any)}</dt><dd>{fiche.provenance.isrc}</dd>{/if}
              {#if fiche.provenance.musicbrainz_recording_id}<dt>{$t('fiche.prov.mbid' as any)}</dt><dd class="code">{fiche.provenance.musicbrainz_recording_id}</dd>{/if}
              {#if fiche.provenance.source_id}<dt>{$t('fiche.prov.sourceId' as any)}</dt><dd class="code">{fiche.provenance.source_id}</dd>{/if}
              {#if fiche.provenance.credits?.length}
                <dt>{$t('fiche.prov.credits' as any)}</dt>
                <dd>{fiche.provenance.credits.map((c) => `${c.source ?? $t('fiche.dr.sourceUnknown' as any)} (${c.nombre})`).join(', ')}</dd>
              {/if}
            </dl>
            {#if fiche.provenance.fichier_modifie_le}<p class="date">{date('fiche.fileModifiedOn', fiche.provenance.fichier_modifie_le)}</p>{/if}
          {:else if cle === 'note'}
            <h3>{$t('fiche.section.note' as any)}</h3>
            <MesNotes type="track" id={trackId} />
            {#if fiche.note?.maj_le}<p class="date">{date('fiche.updatedOn', fiche.note.maj_le)}</p>{/if}
          {/if}
        </section>
      {/each}
    {/if}
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center;
    background:rgba(0,0,0,.5); padding:20px}
  .panneau{position:relative; width:min(900px, 100%); max-height:min(86vh, 900px); overflow:auto;
    background:var(--v2-surface, var(--tune-surface, #1b1b1f));
    border:1px solid var(--v2-line2, var(--tune-border, #333));
    border-radius:var(--v2-r-card, 12px); padding:18px 20px 20px;
    box-shadow:var(--v2-sh-pop, 0 12px 40px rgba(0,0,0,.5))}
  header{position:relative; padding-right:32px; margin-bottom:10px}
  h2{font:700 16px var(--v2-sans, inherit); color:var(--v2-txt, var(--tune-text, inherit))}
  h3{font:600 13.5px var(--v2-sans, inherit); color:var(--v2-txt, var(--tune-text, inherit)); margin-bottom:6px}
  .src{margin-top:3px; font:12.5px var(--v2-sans, inherit); color:var(--v2-txt3, var(--tune-text-secondary, inherit))}
  .x{position:absolute; top:-4px; right:-6px; width:28px; height:28px; border:0; background:transparent;
    color:var(--v2-txt3, inherit); font-size:20px; line-height:1; cursor:pointer; border-radius:6px}
  .x:hover{background:var(--v2-hover, rgba(255,255,255,.06)); color:var(--v2-txt, inherit)}
  .bloc{padding:12px 0; border-top:1px solid var(--v2-line2, var(--tune-border, #333));
    font:13px var(--v2-sans, inherit); color:var(--v2-txt2, var(--tune-text, inherit))}
  dl{display:grid; grid-template-columns:max-content 1fr; gap:4px 14px; margin:4px 0}
  dt{color:var(--v2-txt3, var(--tune-text-secondary, inherit))}
  dd{margin:0; overflow-wrap:anywhere}
  .code{font-family:var(--v2-mono, monospace); font-size:12px}
  .valeur{font-weight:600; color:var(--v2-txt, var(--tune-text, inherit))}
  .detail{font-size:12px; color:var(--v2-txt3, inherit)}
  .date{font-size:12px; color:var(--v2-txt3, var(--tune-text-secondary, inherit)); margin-top:4px}
  .etat{font:13px var(--v2-sans, inherit); color:var(--v2-txt3, inherit); padding:8px 0}
  .etat-section{margin-bottom:6px}
  .etat-section[data-etat="perime"]{color:var(--v2-warn, var(--tune-warning, inherit))}
  .image{display:block; width:100%; height:auto; border-radius:6px; background:#000; margin:6px 0}
  .reserve{height:48px; border:1px dashed var(--v2-line2, var(--tune-border, #333)); border-radius:6px}
  .bouton{margin-top:8px; border:1px solid var(--v2-acc1, var(--tune-accent, currentColor)); background:transparent;
    color:var(--v2-acc1, var(--tune-accent, currentColor)); border-radius:999px; padding:6px 14px;
    font:600 13px var(--v2-sans, inherit); cursor:pointer}
  .bouton:hover{background:var(--v2-hover, rgba(255,255,255,.06))}
  .bouton:focus-visible,.x:focus-visible{outline:2px solid var(--v2-acc1, var(--tune-accent, currentColor)); outline-offset:2px}
</style>
