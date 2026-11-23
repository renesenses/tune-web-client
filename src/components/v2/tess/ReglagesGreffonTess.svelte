<script lang="ts">
  /**
   * Colonne de droite de l'écran TESS : le greffon choisi (maquette A1).
   *
   * En-tête (nom, case « On », description) et « × Remove plugin » ici ; le
   * corps des réglages vient des panneaux SANS sélecteur de zone du lot W2a
   * (égaliseurs, crossfeed, réaffectation) et du lot W3 (convolution,
   * Declick temps réel). Tant qu'ils ne sont pas fusionnés, l'emplacement
   * `data-tess-panneau` le dit.
   */
  import { t } from '../../../lib/i18n';
  import { libelleOuRepli, type LienGreffonTess } from '../../../lib/tess';
  import PanneauConvolution from './PanneauConvolution.svelte';

  let {
    lien,
    nom,
    zoneId = null,
    bloque = null,
    occupe = false,
    onToggle,
    onRemove,
  }: {
    lien: LienGreffonTess;
    nom: string;
    zoneId?: number | null;
    bloque?: string | null;
    occupe?: boolean;
    onToggle: (id: string, actif: boolean) => void;
    onRemove: (id: string) => void;
  } = $props();

  const tr = (k: string) => $t(k as any);
  const description = $derived(libelleOuRepli(tr(`tess.desc.${lien.id}`), `tess.desc.${lien.id}`, ''));
</script>

<section class="reglages" aria-labelledby="tess-reglages-titre" data-tess-reglages={lien.id}>
  <header class="tete">
    <h2 id="tess-reglages-titre">{nom}</h2>
    <label class="on">
      <span>{$t('tess.on' as any)}</span>
      <input type="checkbox" checked={lien.enabled} disabled={occupe || bloque != null}
             onchange={(e) => {
               const c = e.currentTarget as HTMLInputElement;
               const voulu = c.checked;
               c.checked = lien.enabled;
               onToggle(lien.id, voulu);
             }} />
    </label>
  </header>
  {#if description}<p class="desc">{description}</p>{/if}
  {#if bloque}<p class="bloque" role="note">{bloque}</p>{/if}

  {#if lien.id === 'convolution' && zoneId != null}
    <PanneauConvolution {zoneId} />
  {:else}
    <div class="panneau" data-tess-panneau={lien.id}>{$t('tess.pluginSettingsSoon' as any)}</div>
  {/if}

  <div class="pied">
    <button class="retirer" disabled={occupe} onclick={() => onRemove(lien.id)}>× {$t('tess.removePlugin' as any)}</button>
  </div>
</section>

<style>
  .reglages{border:1px solid var(--v2-line); border-radius:16px; background:var(--v2-surface); padding:22px 26px;
    display:flex; flex-direction:column; gap:14px; min-width:0}
  .tete{display:flex; align-items:center; justify-content:space-between; gap:12px}
  .tete h2{font-size:calc(24px * var(--v2-txt-echelle, 1)); font-weight:700; margin:0}
  .on{display:inline-flex; align-items:center; gap:8px; color:var(--v2-txt2); cursor:pointer}
  .on input{width:20px; height:20px; accent-color:var(--v2-acc1)}
  .desc{margin:0; color:var(--v2-txt2); line-height:1.5; max-width:70ch}
  .bloque{margin:0; padding:10px 12px; border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-txt2)}
  .panneau{border:1px dashed var(--v2-line2); border-radius:12px; padding:22px; color:var(--v2-txt3); text-align:center}
  .pied{display:flex; justify-content:flex-end}
  .retirer{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); border-radius:var(--v2-r-pill);
    padding:9px 16px; cursor:pointer; font:inherit}
  .retirer:disabled{opacity:.5; cursor:default}
</style>
