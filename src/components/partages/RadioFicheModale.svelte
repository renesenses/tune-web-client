<script lang="ts">
  /**
   * La fiche de la station qui joue : logo, description, site web (rapport de
   * Rémi, RC7, #2398 — le nom de la station n'ouvrait rien, la description
   * n'existait que sur mozaiklabs.fr/radios).
   *
   * La station est cherchée d'abord dans « Mes radios » (par flux, puis par
   * nom), puis dans l'annuaire : une station écoutée depuis l'annuaire sans
   * être ajoutée a aussi sa fiche.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { ficheDeStation, trouverStation, type FicheStation } from '../../lib/ficheStation';
  import { fold } from '../../lib/utils';
  import AlbumArt from './AlbumArt.svelte';

  let { np, onClose }: {
    np: { source_id?: string | null; album_title?: string | null };
    onClose: () => void;
  } = $props();

  let fiche = $state<FicheStation | null>(null);
  let etat = $state<'charge' | 'ok' | 'inconnue'>('charge');

  $effect(() => {
    let vivant = true;
    (async () => {
      try {
        const miennes = (await api.getRadios({ limit: 500 })) ?? [];
        const r = trouverStation(miennes, np);
        if (r) { if (vivant) { fiche = ficheDeStation(r); etat = 'ok'; } return; }
        const nom = np.album_title ?? '';
        if (nom) {
          const a = await api.getAnnuaireRadios({ q: nom, limit: 20 });
          const f = a.items.find((x) => fold(x.name) === fold(nom));
          if (f && vivant) {
            fiche = { nom: f.name, logo: f.logo_url ?? null, genre: f.genre ?? null,
              pays: f.country_code ?? null, description: f.description ?? null, site: f.website_url ?? null };
            etat = 'ok';
            return;
          }
        }
      } catch { /* la fiche reste « inconnue » */ }
      if (vivant) etat = 'inconnue';
    })();
    return () => { vivant = false; };
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={np.album_title ?? ''}
    onclick={(e) => e.stopPropagation()}>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>
    {#if etat === 'charge'}
      <p class="vide">{$t('v2.radio.loading' as any)}</p>
    {:else if fiche}
      <div class="tete">
        <span class="logo"><AlbumArt coverPath={fiche.logo} albumId={null} size={0} alt={fiche.nom} fallbackInitials={fiche.nom.slice(0, 1)} /></span>
        <div>
          <h2>{fiche.nom}</h2>
          {#if fiche.genre || fiche.pays}<p class="meta">{[fiche.genre, fiche.pays].filter(Boolean).join(' · ')}</p>{/if}
        </div>
      </div>
      {#if fiche.description}<p class="desc">{fiche.description}</p>{/if}
      {#if fiche.site}
        <a class="site" href={fiche.site} target="_blank" rel="noopener noreferrer">{$t('v2.radio.fiche.site' as any)}</a>
      {/if}
      {#if !fiche.description && !fiche.site}<p class="vide">{$t('v2.radio.fiche.nothing' as any)}</p>{/if}
    {:else}
      <h2>{np.album_title}</h2>
      <p class="vide">{$t('v2.radio.fiche.unknown' as any)}</p>
    {/if}
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center; background:rgba(0,0,0,.55); padding:20px}
  .panneau{position:relative; width:min(440px,100%); max-height:86vh; overflow-y:auto;
    background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-card); padding:20px 22px 22px; font-family:var(--v2-sans)}
  .fermer{position:absolute; top:12px; right:12px; width:28px; height:28px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt3); font-size:20px; line-height:1; cursor:pointer}
  .fermer:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .tete{display:flex; gap:14px; align-items:center; margin-bottom:12px; padding-right:24px}
  .logo{display:block; width:64px; height:64px; flex:none; border-radius:10px; overflow:hidden}
  h2{font-size:17px; font-weight:700}
  .meta{font:12px var(--v2-sans); color:var(--v2-txt2); margin-top:2px}
  .desc{font:13.5px/1.5 var(--v2-sans); color:var(--v2-txt); margin:8px 0}
  .site{display:inline-block; margin-top:6px; color:var(--v2-acc2); font:600 13px var(--v2-sans)}
  .vide{color:var(--v2-txt3); font:13px var(--v2-sans); margin-top:8px}
</style>
