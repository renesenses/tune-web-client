<script lang="ts">
  /**
   * Page d'une source de la rubrique « Sources » — tune-server-rust#5065.
   *
   * CD : l'écran existant `LectureCdV2`, réemployé tel quel (#4863) — la
   * rubrique y mène d'ailleurs directement (vue `lecturecd`), comme la carte
   * `cd` des Extensions. Ce renvoi-ci ne sert que si un CD est ouvert par son
   * identifiant.
   *
   * Entrée, entrée virtuelle, HDMI : nom, type, fréquence, canaux, niveau,
   * état, autorisation, et un grand bouton « Écouter sur <zone> » qui appelle
   * `POST /sources/{id}/jouer`, puis relit la zone pour la barre de lecture.
   *
   * La page ne sonde rien : tout arrive par `sources.changed` (liste complète),
   * que la barre latérale écoute déjà. L'indicateur de niveau suit donc le
   * rythme du serveur, sans animation.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { currentZoneId, currentZone, syncZone } from '../../lib/stores/zones';
  import {
    sources, sourceCourante, jouerSource, sourceEcoutable, frequenceSource, remplissageNiveau,
    ICONES_SOURCE,
  } from '../../lib/sources';
  import LectureCdV2 from './LectureCdV2.svelte';
  import '../../styles/tune-v2.css';

  const source = $derived(($sources ?? []).find((s) => s.id === $sourceCourante) ?? null);

  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  async function ecouter() {
    const zid = $currentZoneId;
    const s = source;
    if (zid == null || !s || occupe) return;
    occupe = true;
    erreur = null;
    try {
      await jouerSource(s.id, zid);
      // La barre de lecture suit la zone : on lui donne l'état tout de suite.
      try { syncZone(await api.getZone(zid)); } catch { /* le flux temps réel suivra */ }
    } catch {
      erreur = $t('v2.sources.playFailed' as any);
    }
    occupe = false;
  }

  const frequence = $derived(frequenceSource(source?.detail?.frequence));
  const canaux = $derived(typeof source?.detail?.canaux === 'number' ? source.detail.canaux : null);
  const niveauDb = $derived(typeof source?.detail?.niveau_db === 'number' ? source.detail.niveau_db : null);
  const remplissage = $derived(remplissageNiveau(niveauDb));
  const nomZone = $derived($currentZone?.name ?? '');
</script>

{#if source?.type === 'cd'}
  <LectureCdV2 />
{:else}
  <section class="v2-source tune-v2">
    <header class="v2-top">
      <div class="v2-titres">
        <div class="v2-eyebrow">{$t('v2.sources.title' as any)}</div>
        <h1>{source?.nom ?? $t('v2.sources.title' as any)}</h1>
      </div>
    </header>

    <div class="scroll">
      {#if $sources === null}
        <div class="state">{$t('v2.tool.loading' as any)}</div>
      {:else if !source}
        <div class="state disparue">{$t('v2.sources.gone' as any)}</div>
      {:else}
        <div class="carte">
          <div class="pic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d={ICONES_SOURCE[source.type]} /></svg>
          </div>
          <dl class="fiche">
            <dt>{$t('v2.sources.typeLabel' as any)}</dt>
            <dd class="type">{$t(`v2.sources.type.${source.type}` as any)}</dd>
            <dt>{$t('v2.sources.stateLabel' as any)}</dt>
            <dd class="etat"><span class="pastille e-{source.etat}"></span>{$t(`v2.sources.etat.${source.etat}` as any)}</dd>
            <dt>{$t('v2.sources.frequency' as any)}</dt>
            <dd class="frequence">{frequence ?? '—'}</dd>
            <dt>{$t('v2.sources.channels' as any)}</dt>
            <dd class="canaux">{canaux ?? '—'}</dd>
            <dt>{$t('v2.sources.permission' as any)}</dt>
            <dd class="autorisation">{source.etat === 'autorisation_refusee'
              ? $t('v2.sources.permissionRefused' as any)
              : $t('v2.sources.permissionGranted' as any)}</dd>
          </dl>
        </div>

        <div class="niveau" aria-label={$t('v2.sources.level' as any)}>
          <span class="lib">{$t('v2.sources.level' as any)}</span>
          <div class="jauge" role="meter" aria-valuemin={-60} aria-valuemax={0}
            aria-valuenow={niveauDb ?? undefined} aria-label={$t('v2.sources.level' as any)}>
            <div class="rempli" style:width="{remplissage ?? 0}%"></div>
          </div>
          <span class="db">{niveauDb === null ? '—' : `${niveauDb.toFixed(1)} dB`}</span>
        </div>

        {#if source.etat === 'autorisation_refusee'}
          <div class="refus" role="alert">
            <p>{$t('v2.sources.permissionDenied' as any)}</p>
            <p class="chemin">{$t('v2.sources.permissionWhere' as any)}</p>
          </div>
        {:else if source.etat === 'non_pris_en_charge'}
          <div class="state encadre">{$t('v2.sources.unsupported' as any)}</div>
        {:else if source.etat === 'indisponible'}
          <div class="state encadre">{$t('v2.sources.unavailable' as any)}</div>
        {/if}

        <div class="actions">
          <button class="go ecouter" disabled={$currentZoneId == null || occupe || !sourceEcoutable(source)}
            onclick={ecouter}>
            {occupe ? '…' : nomZone
              ? $t('v2.sources.listenOn' as any).replace('{zone}', nomZone)
              : $t('v2.sources.listen' as any)}
          </button>
          {#if $currentZoneId == null}<span class="note">{$t('v2.art.noZone' as any)}</span>{/if}
        </div>
        {#if erreur}<div class="err" role="alert">{erreur}</div>{/if}
      {/if}
    </div>
  </section>
{/if}

<style>
  .v2-source{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; display:flex; flex-direction:column; gap:16px; max-width:720px}
  .state{color:var(--v2-txt3); font-size:13px}
  .disparue,.encadre{padding:14px 16px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface2); color:var(--v2-txt2)}
  .carte{display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap}
  .pic{width:96px; height:96px; border-radius:16px; background:var(--v2-surface2); color:var(--v2-acc1);
    display:grid; place-items:center; flex:none}
  .pic svg{width:48px; height:48px}
  .fiche{display:grid; grid-template-columns:max-content 1fr; gap:6px 16px; margin:0; font-size:13px; min-width:0}
  .fiche dt{color:var(--v2-txt3)}
  .fiche dd{margin:0; color:var(--v2-txt); display:flex; align-items:center; gap:8px}
  .pastille{width:8px; height:8px; border-radius:50%; background:var(--v2-txt3); flex:none}
  .e-signal{background:var(--v2-ok, #3ecf8e)}
  .e-disque{background:var(--v2-acc1)}
  .e-silence{background:var(--v2-txt3)}
  .e-vide{background:transparent; box-shadow:inset 0 0 0 1.5px var(--v2-txt3)}
  .e-autorisation_refusee{background:var(--v2-danger)}
  .e-non_pris_en_charge,.e-indisponible{background:var(--v2-line2)}
  .niveau{display:flex; align-items:center; gap:12px; font-size:12.5px}
  .niveau .lib{color:var(--v2-txt3); min-width:60px}
  .jauge{flex:1; max-width:360px; height:8px; border-radius:var(--v2-r-pill); background:var(--v2-surface2); overflow:hidden}
  /* Pas de transition : la valeur suit le rythme des événements du serveur. */
  .rempli{height:100%; background:linear-gradient(90deg,var(--v2-acc1),var(--v2-acc2))}
  .db{font:11.5px var(--v2-mono); color:var(--v2-txt2); min-width:64px}
  .refus{padding:12px 16px; border-radius:12px; border:1px solid var(--v2-danger-bd); color:var(--v2-danger); font-size:13px}
  .refus p{margin:0}
  .refus .chemin{margin-top:6px; color:var(--v2-txt2)}
  .actions{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .go{height:48px; padding:0 28px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 14px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.35; cursor:not-allowed}
  .note{font-size:11.5px; color:var(--v2-txt3)}
  .err{padding:10px 14px; border-radius:10px; font-size:12.5px; border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
</style>
