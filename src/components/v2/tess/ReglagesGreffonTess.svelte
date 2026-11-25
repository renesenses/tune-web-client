<script lang="ts">
  /**
   * Colonne de droite de l'écran TESS : le greffon choisi (maquette A1).
   *
   * En-tête (nom, case « On », description) et « × Remove plugin » ici ; le
   * corps des réglages est `PanneauGreffonTess` (lot W2 : égaliseurs,
   * crossfeed, réaffectation), sauf la convolution : `PanneauConvolution`
   * (lot W3, jeu de filtres de la zone).
   */
  import { t } from '../../../lib/i18n';
  import { libelleOuRepli, type LienGreffonTess } from '../../../lib/tess';
  import PanneauGreffonTess from './PanneauGreffonTess.svelte';
  import PanneauConvolution from './PanneauConvolution.svelte';
  import PanneauCasqueOpra from './PanneauCasqueOpra.svelte';
  import { genrePanneau } from '../../../lib/tessPanneaux';

  let {
    lien,
    nom,
    zoneId = null,
    bloque = null,
    verrou = null,
    ecranHistorique = null,
    titreEcranHistorique = '',
    occupe = false,
    onToggle,
    onRemove,
    onChange,
    onOuvrirEcran,
    onInstall = null,
    installation = false,
  }: {
    lien: LienGreffonTess;
    nom: string;
    zoneId?: number | null;
    bloque?: string | null;
    /** Greffon Premium sans licence : réglages en lecture seule, avec ce motif. */
    verrou?: string | null;
    ecranHistorique?: string | null;
    /** Le nom de l'écran que « Réglages avancés » ouvre (infobulle). */
    titreEcranHistorique?: string;
    occupe?: boolean;
    onToggle: (id: string, actif: boolean) => void;
    onRemove: (id: string) => void;
    onChange: (id: string, reglages: Record<string, unknown>) => void;
    onOuvrirEcran?: () => void;
    /** rc14 — greffon pas encore installé : le bouton « Installer » (sinon `null`). */
    onInstall?: (() => void) | null;
    /** L'installation est en cours. */
    installation?: boolean;
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
  {#if bloque && bloque !== verrou}<p class="bloque" role="note">{bloque}</p>{/if}
  {#if onInstall}
    <div class="installer">
      <button class="installer-btn" data-tess-installer={lien.id} disabled={occupe || installation}
              onclick={() => onInstall?.()}>
        {installation ? $t('tess.installing' as any) : $t('tess.install' as any)}
      </button>
    </div>
  {/if}

  {#if lien.id === 'convolution' && zoneId != null}
    <!-- Lot W3 : le jeu de filtres de la zone ; le verrou vient du serveur (W2). -->
    <PanneauConvolution {zoneId} {verrou} />
  {:else if genrePanneau(lien.id) === 'eq-casque'}
    <!-- rc14 : le greffon « Casque », un profil OPRA (recherche, courbe, niveau). -->
    <PanneauCasqueOpra {lien} {verrou} {onChange} />
  {:else}
    <PanneauGreffonTess {lien} {verrou} {ecranHistorique} {titreEcranHistorique} {onChange} {onOuvrirEcran} />
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
  .pied{display:flex; justify-content:flex-end}
  .installer{display:flex}
  .installer-btn{border:0; background:var(--v2-acc1); color:var(--v2-on-acc); border-radius:var(--v2-r-pill);
    font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:8px 16px; cursor:pointer}
  .installer-btn:disabled{opacity:.5; cursor:default}
  .retirer{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); border-radius:var(--v2-r-pill);
    padding:9px 16px; cursor:pointer; font:inherit}
  .retirer:disabled{opacity:.5; cursor:default}
</style>
