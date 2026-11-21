<script lang="ts">
  import { notifierErreur } from '../../lib/notifierErreur';
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
  import { champsRadioAEnvoyer, champsSurchargeAEnvoyer } from '../../lib/champsRadio';
  import { estDeLAnnuaire } from '../../lib/mesRadios';
  import { notifications } from '../../lib/stores/notifications';
  import { dialogs } from '../../lib/stores/dialogs';
  import type { RadioStation } from '../../lib/types';

  /**
   * La MÊME modale sert à créer et à modifier (Bertrand, 04/09/2026).
   *
   * `radio.id == null` veut dire « nouvelle station ». Les six champs, la
   * validation et le traitement d'erreur sont identiques dans les deux cas :
   * une seconde modale de création aurait divergé de celle-ci dès la première
   * correction — c'est le raisonnement qui a déjà fait reprendre `TransportBar`
   * et `RendererConfig` telles quelles.
   *
   * L'écran v2 ne savait pas créer de station et renvoyait au client actuel
   * (« Ajoutez-en depuis l'écran Radio actuel »), alors que `api.createRadio`
   * existe et n'avait qu'un appelant, en v1.
   */
  interface Props {
    /** Station à modifier, ou un gabarit sans `id` pour en créer une. */
    radio: RadioStation;
    onClose: () => void;
    onSaved?: (maj: RadioStation) => void;
    /** Station supprimée : l'appelant la retire de sa liste. */
    onDeleted?: (id: number) => void;
  }
  let { radio, onClose, onSaved, onDeleted }: Props = $props();

  let nom = $state(radio.name ?? '');
  let flux = $state(radio.stream_url ?? '');
  let logo = $state(radio.logo_url ?? '');
  let genre = $state(radio.genre ?? '');
  let pays = $state(radio.country ?? '');
  let site = $state(radio.homepage_url ?? '');
  let travail = $state(false);

  const creation = $derived(radio.id == null);

  /*
   * web#2795 (décision de Bertrand, 11/11) — une station de l'ANNUAIRE se
   * modifie de nouveau, mais CHEZ SOI : le nom affiché, le logo et le flux. La
   * fiche de l'annuaire n'est jamais modifiée et son relevé n'écrase pas la
   * surcharge ; « Revenir à la fiche de l'annuaire » l'efface. Le genre, le
   * pays et le site restent ceux de la fiche ; retirer la station se fait par
   * « Retirer de Mes radios », sur sa vignette.
   */
  const surcharge = $derived(!creation && estDeLAnnuaire(radio));

  async function revenirALaFiche() {
    const id = radio.id;
    if (id == null || travail) return;
    travail = true;
    try {
      const maj = await api.revenirALaFiche(id);
      onSaved?.(maj);
      notifications.success($t('v2.radio.revertedToDirectory' as any));
      onClose();
    } catch (err: any) {
      notifierErreur($t('common.error' as any), err, { motifSeul: true });
    } finally {
      travail = false;
    }
  }

  /** Supprimer la station — porté de l'ancien écran Radios, seul à le permettre. */
  async function supprimer() {
    // #6473 — l'`id` est lu AVANT l'attente : si la modale se ferme pendant la
    // confirmation, la prop `radio` passe à `null` et `radio.id` levait une
    // TypeError au lieu de supprimer la station que l'utilisateur confirme.
    const id = radio.id;
    if (id == null) return;
    if (!(await dialogs.confirm($t('radio.deleteConfirm' as any), { danger: true }))) return;
    travail = true;
    try {
      await api.deleteRadio(id);
      onDeleted?.(id);
    } catch (e: any) {
      notifierErreur($t('common.error' as any), e, { motifSeul: true });
    } finally {
      travail = false;
    }
  }

  /*
   * Téléverser une image comme pochette de la station — porté de l'ancien
   * écran Radios, seul à le permettre. Ici on ne pouvait que coller une URL :
   * un logo qu'on a sur son disque restait inutilisable. La route écrit tout
   * de suite, indépendamment du formulaire ; l'adresse rendue remplace le
   * champ « logo ».
   */
  let televersement = $state(false);
  async function televerserPochette(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f || radio.id == null) return;
    televersement = true;
    try {
      const maj = await api.uploadRadioCover(radio.id, f);
      logo = maj.logo_url ?? logo;
      onSaved?.(maj);
      notifications.success($t('radio.coverUploaded' as any));
    } catch (err: any) {
      notifierErreur($t('common.error' as any), err, { motifSeul: true });
    } finally {
      televersement = false;
    }
  }

  /*
   * tune-server-rust#8452 — Cover+ pour CETTE station : la pochette du titre
   * en cours, retrouvée d'après son titre quand la station n'en donne pas.
   * Actif par défaut. Comme le téléversement, la case écrit tout de suite,
   * hors du formulaire. `null` : réglage pas encore lu (serveur antérieur).
   */
  let coverPlus = $state<boolean | null>(null);
  let coverPlusTravail = $state(false);
  $effect(() => {
    const id = radio.id;
    if (id == null) return;
    let vivant = true;
    api.getRadioCoverPlus(id)
      .then((r) => { if (vivant) coverPlus = r.enabled; })
      .catch(() => { /* serveur sans Cover+ : la case reste cachée */ });
    return () => { vivant = false; };
  });
  async function basculerCoverPlus(e: Event) {
    const id = radio.id;
    const voulu = (e.currentTarget as HTMLInputElement).checked;
    if (id == null || coverPlusTravail) return;
    coverPlusTravail = true;
    try {
      coverPlus = (await api.setRadioCoverPlus(id, voulu)).enabled;
    } catch (err: any) {
      notifierErreur($t('common.error' as any), err, { motifSeul: true });
    } finally {
      coverPlusTravail = false;
    }
  }

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
    if (!nom.trim() || !flux.trim() || travail) return;
    travail = true;
    try {
      // Le nom et le flux suffisent à créer ; les quatre autres champs sont
      // envoyés vides plutôt qu'omis, comme à la modification.
      //
      // 🔴 #870 — À LA MODIFICATION, une adresse non touchée n'est PAS
      // envoyée : c'est la seule façon d'atteindre la garde de compatibilité
      // du serveur, qui ne sonde que ce qui est proposé. Sans cela, une
      // station enregistrée avant #3578 n'était plus modifiable du tout.
      const saisi = {
        name: nom.trim(),
        stream_url: flux.trim(),
        logo_url: logo.trim(),
        genre: genre.trim(),
        country: pays.trim(),
        homepage_url: site.trim(),
      };
      const maj = creation
        ? await api.createRadio(saisi)
        : await api.updateRadio(
            radio.id as number,
            surcharge
              ? champsSurchargeAEnvoyer(saisi, { stream_url: radio.stream_url })
              : champsRadioAEnvoyer(saisi, { stream_url: radio.stream_url }),
          );
      onSaved?.(maj);
      onClose();
    } catch (err: any) {
      // On NE ferme pas : fermer sur échec ferait croire à un enregistrement.
      notifierErreur($t('common.error' as any), err, { motifSeul: true });
    }
    travail = false;
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={creation ? $t('v2.radio.create' as any) : $t('v2.radio.edit' as any)}
    onclick={(e) => e.stopPropagation()}>
    <h2>{creation ? $t('v2.radio.create' as any) : $t('v2.radio.edit' as any)}</h2>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>

    <form onsubmit={valider}>
      <label><span>{$t('v2.radio.name' as any)}</span><input bind:value={nom} required /></label>
      <!-- Le FLUX est ce qui fait la station : sans lui il n'y a rien à
           écouter, d'où `required` comme sur le nom. -->
      <label><span>{$t('v2.radio.stream' as any)}</span><input bind:value={flux} required type="url" /></label>
      {#if !surcharge}
        <div class="deux">
          <label><span>{$t('v2.radio.genre' as any)}</span><input bind:value={genre} /></label>
          <label><span>{$t('v2.radio.country' as any)}</span><input bind:value={pays} /></label>
        </div>
      {/if}
      <label><span>{$t('v2.radio.logo' as any)}</span><input bind:value={logo} type="url" /></label>
      {#if !creation}
        <label class="fichier">
          <span>{televersement ? $t('radio.uploadingCover' as any) : $t('radio.orClickToUpload' as any)}</span>
          <input type="file" accept="image/*" onchange={televerserPochette} disabled={televersement} />
        </label>
      {/if}
      {#if !creation && coverPlus != null}
        <label class="case" data-cover-plus-reglage>
          <input type="checkbox" checked={coverPlus} disabled={coverPlusTravail} onchange={basculerCoverPlus} />
          <span class="case-texte">
            <strong>{$t('v2.radio.coverPlusSetting' as any)}</strong>
            <small>{$t('v2.radio.coverPlusHint' as any)}</small>
          </span>
        </label>
      {/if}
      {#if surcharge}
        <p class="aide">{$t('v2.radio.overrideHint' as any)}</p>
      {:else}
        <label><span>{$t('v2.radio.site' as any)}</span><input bind:value={site} type="url" /></label>
      {/if}

      <div class="pied">
        {#if surcharge && radio.surcharge_locale}
          <button type="button" class="sec" disabled={travail} onclick={revenirALaFiche}>{$t('v2.radio.revertToDirectory' as any)}</button>
          <span class="pousse"></span>
        {:else if !creation && !surcharge}
          <button type="button" class="sec danger" disabled={travail} onclick={supprimer}>{$t('common.delete' as any)}</button>
          <span class="pousse"></span>
        {/if}
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
  h2{font-size:calc(17px * var(--v2-txt-echelle, 1)); font-weight:700; margin-bottom:16px}
  .fermer{position:absolute; top:12px; right:12px; width:28px; height:28px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt3); font-size:calc(20px * var(--v2-txt-echelle, 1)); line-height:1; cursor:pointer}
  .fermer:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  label{display:block; margin-bottom:11px}
  label span{display:block; margin-bottom:5px; font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.06em;
    text-transform:uppercase; color:var(--v2-txt3)}
  input{width:100%; box-sizing:border-box; background:var(--v2-bg); border:1px solid var(--v2-line2);
    border-radius:8px; color:var(--v2-txt); font:inherit; font-size:calc(13.5px * var(--v2-txt-echelle, 1)); padding:8px 10px}
  input:focus{outline:2px solid var(--v2-acc1); outline-offset:-1px}
  .case{display:flex; align-items:flex-start; gap:9px; margin:4px 0 12px; cursor:pointer}
  .case input{width:auto; margin-top:2px; flex:none}
  .case .case-texte{display:block; margin:0; text-transform:none; letter-spacing:0; font:inherit}
  .case strong{display:block; font-size:calc(13px * var(--v2-txt-echelle, 1)); font-weight:600; color:var(--v2-txt)}
  .case small{display:block; margin-top:2px; font-size:calc(12px * var(--v2-txt-echelle, 1)); line-height:1.4; color:var(--v2-txt3)}
  .aide{margin:2px 0 4px; font-size:calc(12px * var(--v2-txt-echelle, 1)); line-height:1.45; color:var(--v2-txt3)}
  .pied{flex-wrap:wrap}
  .deux{display:grid; grid-template-columns:1fr 1fr; gap:10px}
  .pied{display:flex; justify-content:flex-end; gap:8px; margin-top:16px}
  .pied button{border-radius:8px; font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:8px 14px; cursor:pointer}
  .sec{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2)}
  .sec.danger:hover:not(:disabled){color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .pousse{flex:1}
  .sec:hover{color:var(--v2-txt)}
  .pri{border:0; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .pri:disabled{opacity:.5; cursor:default}
</style>
