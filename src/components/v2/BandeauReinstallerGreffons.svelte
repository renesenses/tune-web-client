<script lang="ts">
  /**
   * Bandeau « Réinstaller » des greffons payants (tune-server-rust#4861).
   *
   * Une ancienne migration du serveur a pu retirer le crossfeed, le
   * convertisseur et le Dé-ploc d'un compte Premium vu comme Free au
   * démarrage. Le serveur ne sait pas distinguer ce retrait d'une
   * désinstallation voulue : il ne répare donc rien d'office, il PROPOSE, et
   * l'utilisateur tranche.
   *
   * - La liste vient du serveur (`ids`), déjà filtrée : compte ayant le droit,
   *   greffon non installé, pas refusé. Vide ⇒ rien n'est affiché, et c'est
   *   toujours le cas pour un compte Free.
   * - « Réinstaller » passe par la route d'installation existante de chaque
   *   greffon, puis relit le signal.
   * - « Ignorer » mémorise le refus côté serveur : le bandeau ne revient plus
   *   pour ces greffons.
   * - Une lecture en échec (serveur plus ancien, panne) ne montre RIEN : pas
   *   de bandeau fantôme. Un geste en échec le dit clairement.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';

  let { onReinstalle }: { onReinstalle?: (redemarrage: boolean) => void } = $props();

  /** Les greffons que ce bandeau sait nommer : les trois greffons payants. */
  const NOMS: Record<string, string> = {
    crossfeed: 'v2.nav.crossfeed',
    converter: 'v2.nav.converter',
    declick: 'v2.nav.declick',
  };

  let ids = $state<string[]>([]);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);

  const noms = $derived(ids.map((id) => $t(NOMS[id] as any)).join(', '));

  function retenir(liste: string[] | undefined): string[] {
    return (liste ?? []).filter((id) => id in NOMS);
  }

  async function relire(): Promise<void> {
    try {
      ids = retenir((await api.getSuggestionReinstallationGreffons())?.ids);
    } catch {
      ids = [];
    }
  }
  $effect(() => { relire(); });

  async function reinstaller(): Promise<void> {
    if (occupe || !ids.length) return;
    occupe = true;
    erreur = null;
    let redemarrage = false;
    let reussis = 0;
    for (const id of ids) {
      try {
        const r = await api.installPlugin(id);
        if (r?.restart_required) redemarrage = true;
        reussis++;
      } catch {
        erreur = $t('v2.plug.reinstallFailed' as any);
      }
    }
    await relire();
    occupe = false;
    if (reussis) onReinstalle?.(redemarrage);
  }

  async function ignorer(): Promise<void> {
    if (occupe || !ids.length) return;
    occupe = true;
    erreur = null;
    try {
      ids = retenir((await api.ignorerSuggestionReinstallationGreffons(ids))?.ids);
    } catch {
      erreur = $t('v2.plug.reinstallDismissFailed' as any);
      await relire();
    }
    occupe = false;
  }
</script>

{#if erreur}
  <div class="bri-err" role="alert">
    {erreur}
    <button onclick={() => (erreur = null)} aria-label={$t('v2.common.close' as any)}>×</button>
  </div>
{/if}
{#if ids.length}
  <div class="bri" role="status" data-greffons={ids.join(',')}>
    <p>{$t('v2.plug.reinstallPrompt' as any).replace('{names}', noms)}</p>
    <div class="bri-actions">
      <button class="bri-ok" disabled={occupe} onclick={reinstaller}>{$t('v2.plug.reinstall' as any)}</button>
      <button class="bri-non" disabled={occupe} onclick={ignorer}>{$t('v2.plug.reinstallIgnore' as any)}</button>
    </div>
  </div>
{/if}

<style>
  .bri,.bri-err{display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:0 30px 10px; padding:9px 14px; border-radius:10px; font-size:12.5px}
  .bri{border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .bri p{margin:0; flex:1; min-width:16ch}
  .bri-actions{display:flex; gap:8px; flex:0 0 auto}
  .bri-ok{height:30px; padding:0 14px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .bri-non{height:30px; padding:0 14px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; font:600 12px var(--v2-sans)}
  .bri-ok:disabled,.bri-non:disabled{opacity:.45; cursor:default}
  .bri-err{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .bri-err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}
</style>
