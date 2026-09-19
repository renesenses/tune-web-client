<script lang="ts">
  /**
   * Multiroom synchronisé OAAT — portage d'`OaatGroupsPanel`, que la phase 5
   * supprime avec `ZoneManagerView`.
   *
   * Un groupe OAAT relie des points de diffusion Tune (Tune Bridge) joués en
   * synchronisation. Créer, supprimer, ajouter ou retirer un point, régler le
   * volume du groupe et celui de chaque point : les huit routes de
   * `/zone-manager/oaat-groups`.
   *
   * Le serveur répond souvent 200 avec `{ error }` (point injoignable à la
   * création — #1779 —, groupe inconnu, OAAT non compilé) : un 200 n'est donc
   * PAS un succès, on lit `error` à chaque réponse. L'ancien panneau le
   * faisait pour l'ajout d'un point seulement ; la création annonçait « créé »
   * sur un refus.
   *
   * Les curseurs de volume envoient après 200 ms de repos : un glissé ne doit
   * pas produire cinquante requêtes.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';

  interface PointOaat { endpoint_id: string; name: string; addr: string; state: string; volume_offset: number; effective_volume: number }
  interface GroupeOaat { id: string; name: string; endpoints: { host: string; port: number }[] }
  interface EtatOaat { streaming: boolean; multiroom: boolean; master_volume: number; endpoints: PointOaat[] }

  const PORT_DEFAUT = 9740;

  let groupes = $state<GroupeOaat[]>([]);
  let etats = $state<Record<string, EtatOaat>>({});
  let charge = $state(false);
  let erreur = $state<string | null>(null);
  let ouvert = $state<string | null>(null);

  let formulaire = $state(false);
  let nom = $state('');
  let hote = $state('');
  let port = $state(PORT_DEFAUT);
  let enAttente = $state<{ host: string; port: number }[]>([]);
  let ajoutPour = $state<string | null>(null);
  let ajoutHote = $state('');
  let ajoutPort = $state(PORT_DEFAUT);

  /** Un 200 qui porte `error` est un refus : on le lève comme tel. */
  function verifier<T>(r: T): T {
    const e = (r as any)?.error;
    if (e) throw new Error(String(e));
    return r;
  }

  async function rafraichirEtat(id: string) {
    try {
      const s = await api.getOaatGroupStatus(id);
      if (s && !s.error) etats = { ...etats, [id]: s };
    } catch { /* l'état manque, la ligne reste */ }
  }

  async function charger() {
    try {
      const r = await api.getOaatGroups();
      groupes = r?.oaat_groups ?? [];
      erreur = null;
      await Promise.all(groupes.map((g) => rafraichirEtat(g.id)));
    } catch {
      erreur = $t('v2.oaat.loadError' as any);
    }
    charge = true;
  }
  $effect(() => { void charger(); });

  function ajouterEnAttente() {
    if (!hote.trim()) return;
    enAttente = [...enAttente, { host: hote.trim(), port: Number(port) || PORT_DEFAUT }];
    hote = ''; port = PORT_DEFAUT;
  }

  async function creer() {
    if (!nom.trim() || !enAttente.length) return;
    try {
      verifier(await api.createOaatGroup(nom.trim(), enAttente));
      notifications.success(nom.trim());
      formulaire = false; nom = ''; enAttente = [];
      await charger();
    } catch (e: any) {
      notifications.error(e?.message || $t('common.error' as any));
    }
  }

  async function supprimer(id: string) {
    try {
      verifier(await api.deleteOaatGroup(id));
      await charger();
    } catch (e: any) {
      notifications.error(e?.message || $t('common.error' as any));
    }
  }

  async function ajouterPoint(id: string) {
    if (!ajoutHote.trim()) return;
    try {
      verifier(await api.addOaatEndpoint(id, ajoutHote.trim(), Number(ajoutPort) || PORT_DEFAUT));
      ajoutPour = null; ajoutHote = ''; ajoutPort = PORT_DEFAUT;
      await rafraichirEtat(id);
    } catch (e: any) {
      notifications.error(e?.message || $t('common.error' as any));
    }
  }

  async function retirerPoint(id: string, point: string) {
    try {
      verifier(await api.removeOaatEndpoint(id, point));
      await rafraichirEtat(id);
    } catch (e: any) {
      notifications.error(e?.message || $t('common.error' as any));
    }
  }

  const minuteries: Record<string, ReturnType<typeof setTimeout>> = {};
  function differer(cle: string, envoi: () => Promise<unknown>, id: string) {
    clearTimeout(minuteries[cle]);
    minuteries[cle] = setTimeout(async () => {
      try { verifier(await envoi()); } catch (e: any) { notifications.error(e?.message || $t('common.error' as any)); }
      await rafraichirEtat(id);
    }, 200);
  }
  const volumeGroupe = (id: string, v: number) => differer(id, () => api.setOaatGroupVolume(id, v), id);
  const volumePoint = (id: string, p: string, v: number) =>
    differer(`${id}:${p}`, () => api.setOaatEndpointVolume(id, p, v), id);
  $effect(() => () => { for (const m of Object.values(minuteries)) clearTimeout(m); });
</script>

<section class="oaat">
  <div class="ph">
    <span class="cl">{$t('v2.oaat.title' as any)}</span>
    {#if !formulaire}
      <button class="v2-btn nouveau" onclick={() => (formulaire = true)}>{$t('v2.oaat.newGroup' as any)}</button>
    {/if}
  </div>
  <p class="phint">{$t('v2.oaat.hint' as any)}</p>

  {#if formulaire}
    <div class="form">
      <input class="txt large" bind:value={nom} placeholder={$t('v2.oaat.groupName' as any)} aria-label={$t('v2.oaat.groupName' as any)} />
      {#each enAttente as p, i (i)}
        <div class="point">
          <span class="mono">{p.host}:{p.port}</span>
          <button class="v2-btn" onclick={() => (enAttente = enAttente.filter((_, j) => j !== i))}>{$t('v2.oaat.remove' as any)}</button>
        </div>
      {/each}
      <div class="ligne">
        <input class="txt hote" bind:value={hote} placeholder={$t('v2.oaat.host' as any)} aria-label={$t('v2.oaat.host' as any)}
          onkeydown={(e) => { if (e.key === 'Enter') ajouterEnAttente(); }} />
        <input class="txt port" type="number" min="1" max="65535" bind:value={port} aria-label="Port" />
        <button class="v2-btn ajouter" onclick={ajouterEnAttente} disabled={!hote.trim()}>{$t('v2.oaat.addEndpoint' as any)}</button>
      </div>
      <div class="ligne">
        <button class="v2-btn primaire creer" onclick={creer} disabled={!nom.trim() || !enAttente.length}>
          {$t('v2.oaat.create' as any).replace('{n}', String(enAttente.length))}
        </button>
        <button class="v2-btn" onclick={() => { formulaire = false; nom = ''; enAttente = []; }}>{$t('common.cancel' as any)}</button>
      </div>
    </div>
  {/if}

  {#if erreur}
    <div class="errline">{erreur}</div>
  {:else if charge && !groupes.length}
    <p class="phint">{$t('v2.oaat.none' as any)}</p>
  {/if}

  {#each groupes as g (g.id)}
    {@const s = etats[g.id]}
    <div class="groupe">
      <div class="gtete">
        <button class="gnom" onclick={() => (ouvert = ouvert === g.id ? null : g.id)} aria-expanded={ouvert === g.id}>
          {g.name}
          <span class="compte">{$t('v2.oaat.endpoints' as any).replace('{n}', String(s?.endpoints?.length ?? g.endpoints?.length ?? 0))}</span>
          {#if s?.streaming}<span class="badge">{$t('v2.oaat.streaming' as any)}</span>{/if}
        </button>
        <button class="v2-btn danger supprimer" onclick={() => supprimer(g.id)}>{$t('common.delete' as any)}</button>
      </div>
      {#if ouvert === g.id && s}
        <label class="vol">
          <span>{$t('v2.oaat.masterVolume' as any)}</span>
          <input type="range" min="0" max="100" value={s.master_volume}
            oninput={(e) => volumeGroupe(g.id, Number((e.currentTarget as HTMLInputElement).value))} />
          <span class="mono">{s.master_volume}</span>
        </label>
        {#each s.endpoints ?? [] as p (p.endpoint_id)}
          <div class="point">
            <span class="etat" data-etat={p.state}>{p.state}</span>
            <span class="pn">{p.name}</span>
            <span class="mono">{p.addr}</span>
            <input type="range" min="0" max="100" value={p.effective_volume} aria-label={`Volume ${p.name}`}
              oninput={(e) => volumePoint(g.id, p.endpoint_id, Number((e.currentTarget as HTMLInputElement).value))} />
            <span class="mono">{p.effective_volume}</span>
            <button class="v2-btn retirer" onclick={() => retirerPoint(g.id, p.endpoint_id)}>{$t('v2.oaat.remove' as any)}</button>
          </div>
        {/each}
        {#if ajoutPour === g.id}
          <div class="ligne">
            <input class="txt hote" bind:value={ajoutHote} placeholder={$t('v2.oaat.host' as any)} aria-label={$t('v2.oaat.host' as any)} />
            <input class="txt port" type="number" min="1" max="65535" bind:value={ajoutPort} aria-label="Port" />
            <button class="v2-btn primaire" onclick={() => ajouterPoint(g.id)} disabled={!ajoutHote.trim()}>{$t('v2.oaat.addEndpoint' as any)}</button>
            <button class="v2-btn" onclick={() => (ajoutPour = null)}>{$t('common.cancel' as any)}</button>
          </div>
        {:else}
          <button class="v2-btn ajout-point" onclick={() => (ajoutPour = g.id)}>{$t('v2.oaat.addEndpoint' as any)}</button>
        {/if}
      {/if}
    </div>
  {/each}
</section>

<style>
  .oaat{margin-top:22px}
  .ph{display:flex; align-items:center; justify-content:space-between; gap:10px}
  .cl{font:700 11px var(--v2-sans); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .phint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); margin:8px 0 0}
  .errline{margin-top:8px; font-size:12px; color:var(--v2-danger)}
  .form{margin-top:10px; padding:12px 14px; border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface2)}
  .ligne{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px}
  .txt{height:32px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-surface);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 10px; outline:none}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .txt.large{width:100%; max-width:360px}
  .txt.hote{width:190px}
  .txt.port{width:86px; font-family:var(--v2-mono)}
  .groupe{margin-top:10px; padding:10px 12px; border:1px solid var(--v2-line); border-radius:10px}
  .gtete{display:flex; align-items:center; justify-content:space-between; gap:10px}
  .gnom{display:flex; align-items:center; gap:10px; background:transparent; border:0; padding:0; cursor:pointer;
    font:600 13px var(--v2-sans); color:var(--v2-txt)}
  .compte{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .badge{font:600 10px var(--v2-sans); padding:2px 8px; border-radius:999px; border:1px solid var(--v2-acc2); color:var(--v2-acc-tint)}
  .vol{display:flex; align-items:center; gap:10px; margin-top:10px; font-size:12px; color:var(--v2-txt2)}
  .vol input, .point input{accent-color:var(--v2-acc1)}
  .point{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:8px; font-size:12.5px; color:var(--v2-txt2)}
  .pn{font-weight:600; color:var(--v2-txt)}
  .etat{font:600 10px var(--v2-mono); color:var(--v2-txt3)}
  .etat[data-etat="streaming"], .etat[data-etat="ready"]{color:var(--v2-acc-tint)}
  .etat[data-etat="disconnected"]{color:var(--v2-danger)}
  .mono{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .v2-btn{height:30px; padding:0 13px; font-size:11.5px}
  .ajout-point{margin-top:10px}
</style>
