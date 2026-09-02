<script lang="ts">
  /**
   * Modifier une station de radio.
   *
   * Demandé par Bertrand le 02/09/2026 : « un bouton edit sur une radio aurait
   * un sens ». Il en a un, et plus qu'ailleurs : une station se règle à la
   * main. Son flux change d'adresse, son logo n'est pas toujours celui qu'on
   * veut, et son genre est souvent absent de l'annuaire dont elle vient.
   *
   * Les champs sont EXACTEMENT ceux que `PUT /radios/{id}` accepte. En offrir
   * d'autres mentirait ; en offrir moins obligerait à passer par l'écran
   * actuel.
   *
   * Déplacée à la racine du document, comme les autres surcouches ouvertes
   * depuis une vignette : `.pa` porte `overflow: hidden` et la carte est
   * contenue, donc une `position: fixed` s'y ferait enfermer.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { notifications } from '../../lib/stores/notifications';
  import type { RadioStation } from '../../lib/types';

  interface Props {
    radio: RadioStation;
    onClose: () => void;
    onSaved?: (maj: RadioStation) => void;
  }
  let { radio, onClose, onSaved }: Props = $props();

  let nom = $state(radio.name ?? '');
  let flux = $state(radio.stream_url ?? '');
  let logo = $state(radio.logo_url ?? '');
  let genre = $state(radio.genre ?? '');
  let pays = $state(radio.country ?? '');
  let site = $state(radio.homepage_url ?? '');
  let travail = $state(false);

  const modifie = $derived(
    nom !== (radio.name ?? '') ||
      flux !== (radio.stream_url ?? '') ||
      logo !== (radio.logo_url ?? '') ||
      genre !== (radio.genre ?? '') ||
      pays !== (radio.country ?? '') ||
      site !== (radio.homepage_url ?? ''),
  );

  async function valider(e: Event) {
    e.preventDefault();
    if (!nom.trim() || !flux.trim() || travail || radio.id == null) return;
    travail = true;
    try {
      const maj = await api.updateRadio(radio.id, {
        name: nom.trim(),
        stream_url: flux.trim(),
        logo_url: logo.trim(),
        genre: genre.trim(),
        country: pays.trim(),
        homepage_url: site.trim(),
      });
      onSaved?.(maj);
      onClose();
    } catch (err: any) {
      // On NE ferme pas : fermer sur échec ferait croire à un enregistrement.
      notifications.error(err?.message ?? $t('common.error' as any));
    }
    travail = false;
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('v2.radio.edit' as any)}
    onclick={(e) => e.stopPropagation()}>
    <h2>{$t('v2.radio.edit' as any)}</h2>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>

    <form onsubmit={valider}>
      <label><span>{$t('v2.radio.name' as any)}</span><input bind:value={nom} required /></label>
      <!-- Le FLUX est ce qui fait la station : sans lui il n'y a rien à
           écouter, d'où `required` comme sur le nom. -->
      <label><span>{$t('v2.radio.stream' as any)}</span><input bind:value={flux} required type="url" /></label>
      <div class="deux">
        <label><span>{$t('v2.radio.genre' as any)}</span><input bind:value={genre} /></label>
        <label><span>{$t('v2.radio.country' as any)}</span><input bind:value={pays} /></label>
      </div>
      <label><span>{$t('v2.radio.logo' as any)}</span><input bind:value={logo} type="url" /></label>
      <label><span>{$t('v2.radio.site' as any)}</span><input bind:value={site} type="url" /></label>

      <div class="pied">
        <button type="button" class="sec" onclick={onClose}>{$t('common.cancel' as any)}</button>
        <button type="submit" class="pri" disabled={travail || !nom.trim() || !flux.trim() || !modifie}>
          {$t('common.save' as any)}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center;
    background:rgba(0,0,0,.55); padding:20px}
  .panneau{position:relative; width:min(460px,100%); max-height:86vh; overflow-y:auto;
    background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-card); padding:20px 22px 22px; font-family:var(--v2-sans)}
  h2{font-size:17px; font-weight:700; margin-bottom:16px}
  .fermer{position:absolute; top:12px; right:12px; width:28px; height:28px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt3); font-size:20px; line-height:1; cursor:pointer}
  .fermer:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  label{display:block; margin-bottom:11px}
  label span{display:block; margin-bottom:5px; font:600 11px var(--v2-mono); letter-spacing:.06em;
    text-transform:uppercase; color:var(--v2-txt3)}
  input{width:100%; box-sizing:border-box; background:var(--v2-bg); border:1px solid var(--v2-line2);
    border-radius:8px; color:var(--v2-txt); font:inherit; font-size:13.5px; padding:8px 10px}
  input:focus{outline:2px solid var(--v2-acc1); outline-offset:-1px}
  .deux{display:grid; grid-template-columns:1fr 1fr; gap:10px}
  .pied{display:flex; justify-content:flex-end; gap:8px; margin-top:16px}
  .pied button{border-radius:8px; font:600 13px var(--v2-sans); padding:8px 14px; cursor:pointer}
  .sec{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2)}
  .sec:hover{color:var(--v2-txt)}
  .pri{border:0; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .pri:disabled{opacity:.5; cursor:default}
</style>
