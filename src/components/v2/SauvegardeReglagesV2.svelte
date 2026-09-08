<script lang="ts">
  /**
   * « Et je veux un bouton sur l'UI de Tune sauvegarder mes réglages en
   * local ! » — Bertrand, 08/09/2026. Et sa contrepartie, la récupération.
   *
   * ## Deux portes de sortie, et ce n'est pas un luxe
   *
   * Le téléchargement passe par un `<a download>` et un `Blob`. Dans une
   * webview embarquée (weblet iOS/macOS), ce clic peut ne RIEN produire — ni
   * fichier, ni erreur : c'est exactement le défaut #166 qui avait fait bannir
   * les boîtes natives du dépôt. D'où le bouton « Copier » à côté, et le
   * champ de collage en face : ce qui ne peut pas transiter par un fichier
   * transite par le presse-papiers.
   *
   * ## On MONTRE avant d'écrire
   *
   * Une récupération écrit sur des appareils. L'écran affiche donc d'abord ce
   * qui changerait, zone par zone, et dit comment chaque zone a été reconnue —
   * par sa sortie (sûr) ou par son nom (faible). Un appariement muet finirait
   * par poser les réglages du Lindemann dans le Sonos.
   *
   * L'aperçu est DÉRIVÉ des zones : après application, il se recalcule tout
   * seul et affiche « rien à changer ». C'est la contre-épreuve, à l'écran.
   */
  import { zones } from '../../lib/stores/zones';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { dateSimple } from '../../lib/dates';
  import { notifications } from '../../lib/stores/notifications';
  import {
    construireSauvegarde, serialiser, nomFichierSauvegarde, lireSauvegarde,
    apparier, corpsPatch, resume,
    type Sauvegarde, type RaisonRefus, type ValeurReglage,
  } from '../../lib/reglagesAppareilLocal';

  let texteColle = $state('');
  let sauvegarde = $state<Sauvegarde | null>(null);
  let erreur = $state<RaisonRefus | null>(null);
  let copie = $state(false);
  let application = $state(false);

  // Dérivé, jamais posé à la main : après l'écriture, `zones` change et
  // l'aperçu redit de lui-même ce qu'il reste à faire.
  const apercu = $derived(sauvegarde ? apparier(sauvegarde, $zones) : null);
  const bilan = $derived(apercu ? resume(apercu) : null);

  const CLE_ERREUR: Record<RaisonRefus, string> = {
    illisible: 'v2.dev.backupErrUnreadable',
    pas_un_fichier_tune: 'v2.dev.backupErrNotTune',
    version_future: 'v2.dev.backupErrFuture',
    aucune_zone: 'v2.dev.backupErrEmpty',
  };

  function contenu(): string {
    return serialiser(construireSauvegarde($zones));
  }

  function sauvegarder() {
    const blob = new Blob([contenu()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichierSauvegarde();
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Révoqué au tour suivant : révoquer tout de suite annule le
    // téléchargement sur certains navigateurs.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(contenu());
      copie = true;
      setTimeout(() => { copie = false; }, 2000);
    } catch {
      notifications.error($t('common.error' as any));
    }
  }

  function examiner(texte: string) {
    const l = lireSauvegarde(texte);
    if (!l.ok) { erreur = l.raison; sauvegarde = null; return; }
    erreur = null;
    sauvegarde = l.sauvegarde;
  }

  async function ouvrirFichier(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    // Remis à zéro : sans cela, rouvrir DEUX FOIS le même fichier ne déclenche
    // aucun `change`, et l'écran paraît mort.
    input.value = '';
    if (!f) return;
    try { examiner(await f.text()); }
    catch { erreur = 'illisible'; sauvegarde = null; }
  }

  function abandonner() {
    sauvegarde = null;
    erreur = null;
    texteColle = '';
  }

  async function appliquer() {
    if (!apercu) return;
    application = true;
    let faites = 0;
    try {
      for (const a of apercu) {
        if (!a.zone || a.zone.id == null) continue;
        const corps = corpsPatch(a.changements);
        if (!Object.keys(corps).length) continue;
        await api.updateZoneReglages(a.zone.id, corps);
        faites += 1;
      }
      zones.set(await api.getZones());
      notifications.success($t('v2.dev.backupApplied' as any).replace('{n}', String(faites)));
    } catch {
      notifications.error($t('common.error' as any));
    } finally {
      application = false;
    }
  }

  /** `dlna_native_flac = true` : le nom du serveur, tel quel — c'est celui que
   *  portent aussi les préréglages communautaires et le catalogue. */
  function valeur(v: ValeurReglage): string {
    if (v === null) return '—';
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    return String(v);
  }
</script>

<div class="sv">
  <p class="hint">{$t('v2.dev.backupIntro' as any)}</p>

  <div class="inline">
    <button class="lnk" onclick={sauvegarder} disabled={!$zones.length}>{$t('v2.dev.backupSave' as any)}</button>
    <button class="lnk" onclick={copier} disabled={!$zones.length}>
      {copie ? $t('v2.set.copied' as any) : $t('v2.set.copy' as any)}
    </button>
    <label class="lnk fichier">
      {$t('v2.dev.backupOpen' as any)}
      <input type="file" accept="application/json,.json" onchange={ouvrirFichier} />
    </label>
  </div>

  <textarea
    class="colle"
    rows="2"
    placeholder={$t('v2.dev.backupPaste' as any)}
    bind:value={texteColle}
  ></textarea>
  <div class="inline">
    <button class="lnk" disabled={!texteColle.trim()} onclick={() => examiner(texteColle)}>
      {$t('v2.dev.backupRead' as any)}
    </button>
  </div>

  {#if erreur}
    <div class="errline">{$t(CLE_ERREUR[erreur] as any)}</div>
  {/if}

  {#if apercu && bilan}
    <div class="apercu">
      <p class="titre">{$t('v2.dev.backupFrom' as any).replace('{date}', $dateSimple(sauvegarde?.exporte_le))}</p>
      <p class="hint">
        {$t('v2.dev.backupSummary' as any)
          .replace('{found}', String(bilan.zonesTrouvees))
          .replace('{total}', String(bilan.zonesDuFichier))
          .replace('{changes}', String(bilan.changements))}
      </p>

      {#each apercu as a (a.entree.nom + (a.entree.output_device_id ?? ''))}
        <div class="ligne" class:absente={!a.zone}>
          <span class="nom">{a.zone?.name ?? a.entree.nom}</span>
          {#if !a.zone}
            <span class="etat">{$t('v2.dev.backupAbsent' as any)}</span>
          {:else if a.methode === 'nom'}
            <span class="etat faible">{$t('v2.dev.backupByName' as any)}</span>
          {/if}
          {#if a.zone && a.changements.length}
            <ul class="chg">
              {#each a.changements as c (c.cle)}
                <li class:main={!c.applicable}>
                  <code>{c.cle}</code>
                  <span class="av">{valeur(c.avant)}</span>
                  <span class="fl">→</span>
                  <span class="ap">{valeur(c.apres)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}

      {#if bilan.aLaMain}
        <p class="monote">{$t('v2.dev.backupManual' as any)}</p>
      {/if}

      {#if bilan.changements === 0}
        <p class="hint ok">{$t('v2.dev.backupNothing' as any)}</p>
      {/if}

      <div class="inline">
        <button class="lnk" disabled={application || bilan.changements === 0} onclick={appliquer}>
          {application ? $t('common.applying' as any) : $t('common.apply' as any)}
        </button>
        <button class="lnk" onclick={abandonner}>{$t('common.cancel' as any)}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .sv { display: flex; flex-direction: column; gap: 10px; }
  .inline { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .hint { margin: 0; font-size: 13px; color: var(--v2-txt3); }
  .hint.ok { color: var(--v2-acc1); }
  .monote { margin: 4px 0 0; font-size: 12px; color: var(--v2-acc2); }
  .errline { font-size: 13px; color: var(--v2-danger); }

  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled { opacity: 0.45; cursor: default; }

  /* Le sélecteur de fichier natif est illisible d'un navigateur à l'autre :
     on le masque et c'est le label qui porte le bouton. */
  .fichier { position: relative; overflow: hidden; }
  .fichier input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

  .colle {
    width: 100%; box-sizing: border-box; resize: vertical;
    background: var(--v2-surface2); color: var(--v2-txt);
    border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 8px; font-size: 12px; font-family: var(--v2-mono);
  }

  .apercu {
    border: 1px solid var(--v2-line); border-radius: 8px;
    padding: 12px; display: flex; flex-direction: column; gap: 8px;
  }
  .titre { margin: 0; font-size: 13px; font-weight: 600; }
  .ligne { display: flex; flex-direction: column; gap: 3px; }
  .ligne.absente { opacity: 0.55; }
  .nom { font-size: 13px; font-weight: 600; }
  .etat { font-size: 12px; color: var(--v2-txt3); }
  .etat.faible { color: var(--v2-acc2); }

  .chg { list-style: none; margin: 0; padding: 0 0 0 12px; display: flex; flex-direction: column; gap: 2px; }
  .chg li { display: flex; gap: 6px; align-items: baseline; font-size: 12px; }
  .chg li.main { opacity: 0.6; text-decoration: line-through; }
  .chg code { font-family: var(--v2-mono); color: var(--v2-txt3); }
  .av { color: var(--v2-txt3); }
  .fl { color: var(--v2-txt3); }
  .ap { color: var(--v2-acc1); font-weight: 600; }
</style>
