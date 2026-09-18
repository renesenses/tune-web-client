<script lang="ts">
  /**
   * La gestion des profils, dans les Réglages de la coquille v2.
   *
   * Bertrand, 16/09/2026 : « L'écran de gestion des profils existe-t-il ? »
   * Non, pas dans la v2 : `ProfilesSettings.svelte` n'est monté que par
   * `SettingsView` (interface actuelle), et `ProfileSelector` par `Sidebar`.
   * La v2 ne savait que BASCULER (menu avatar, à partir de deux profils) —
   * jamais créer, renommer, recolorer ni supprimer. Sur une installation
   * fraîche, à un seul profil, la bascule ne s'affiche même pas : il n'y
   * avait donc aucun chemin vers un deuxième profil sans repasser par
   * l'ancienne interface.
   *
   * Même store, mêmes gestes que l'écran v1 (`createProfile`, `updateProfile`,
   * `deleteProfile`, `selectProfile`) : rien n'est réécrit côté données, seule
   * la présentation suit les jetons v2. Les règles tenues :
   *
   *   - le message d'échec de création nomme la VRAIE cause (Premium, nom
   *     pris, autre) — `motifEchecCreationProfil.test.ts` ;
   *   - « Supprimer » n'apparaît qu'à partir de deux profils : on ne supprime
   *     jamais le dernier ;
   *   - la création est réservée au Premium, et on le dit, sans envoyer à la
   *     caisse pour une coupure réseau.
   */
  import { profiles, currentProfileId, createProfile, deleteProfile, updateProfile, selectProfile, type MotifEchecCreation, type Profile } from '../../lib/stores/profile';
  import { dialogs } from '../../lib/stores/dialogs';
  import { isPremium } from '../../lib/stores/license';
  import { t } from '../../lib/i18n';

  const COULEURS_AVATAR = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#3b82f6'];

  const MESSAGE_ECHEC: Record<MotifEchecCreation, string> = {
    premium: 'profiles.premiumRequired',
    'nom-pris': 'profiles.nameTaken',
    autre: 'profiles.createFailed',
  };

  let nouveauNom = $state('');
  let nouvelleCouleur = $state(COULEURS_AVATAR[0]);
  let creation = $state(false);
  let erreurCreation = $state('');

  /** Le nom à écrire : `display_name` (le prénom) avant `name` (l'identifiant
   *  de connexion — le serveur y range l'adresse). Même règle que le menu
   *  avatar ; et jamais `undefined.charAt` sur un profil sans nom. */
  const nomDuProfil = (p: Profile): string => p.display_name?.trim() || p.name || '';
  const initiale = (s: string): string => (s.trim().charAt(0) || '?').toUpperCase();

  let enEdition = $state<number | null>(null);
  let nomEdite = $state('');
  let couleurEditee = $state('');

  async function creer() {
    const nom = nouveauNom.trim();
    if (!nom || creation) return;
    creation = true; erreurCreation = '';
    const r = await createProfile(nom, nouvelleCouleur);
    creation = false;
    if (r.ok) {
      nouveauNom = '';
      nouvelleCouleur = COULEURS_AVATAR[Math.floor(Math.random() * COULEURS_AVATAR.length)];
    } else {
      erreurCreation = $t(MESSAGE_ECHEC[r.motif] as any);
    }
  }
  // Parité avec l'écran v1 : le champ édite `name`, ce que `updateProfile` écrit.
  function editer(p: Profile) { enEdition = p.id; nomEdite = p.name ?? ''; couleurEditee = p.avatar_color; }
  async function enregistrer() {
    if (enEdition === null) return;
    const nom = nomEdite.trim();
    if (nom) await updateProfile(enEdition, nom, couleurEditee);
    enEdition = null;
  }
  async function supprimer(p: Profile) {
    if (!(await dialogs.confirm($t('profiles.confirmDelete').replace('{name}', nomDuProfil(p)), { danger: true }))) return;
    await deleteProfile(p.id);
  }
</script>

<p class="hint">{$t('profiles.hint')}</p>

<ul class="liste">
  {#each $profiles as p (p.id)}
    <li class="profil" class:actif={p.id === $currentProfileId}>
      {#if enEdition === p.id}
        <span class="rond" style="background:{couleurEditee}">{initiale(nomEdite)}</span>
        <input class="txt" bind:value={nomEdite} onkeydown={(e) => e.key === 'Enter' && enregistrer()} />
        <span class="couleurs">
          {#each COULEURS_AVATAR as c (c)}
            <button class="pt" class:choisi={couleurEditee === c} style="background:{c}" onclick={() => (couleurEditee = c)} aria-label={c}></button>
          {/each}
        </span>
        <button class="lnk" onclick={enregistrer}>{$t('common.save')}</button>
        <button class="lnk" onclick={() => (enEdition = null)}>{$t('common.cancel')}</button>
      {:else}
        <button class="principal" onclick={() => selectProfile(p.id)} aria-current={p.id === $currentProfileId ? 'true' : undefined}>
          <span class="rond" style="background:{p.avatar_color}">{initiale(nomDuProfil(p))}</span>
          <span class="nom">{nomDuProfil(p)}</span>
          {#if p.id === $currentProfileId}<span class="badge">{$t('profiles.active')}</span>{/if}
        </button>
        <button class="lnk" onclick={() => editer(p)}>{$t('common.edit')}</button>
        {#if $profiles.length > 1}
          <button class="lnk danger" onclick={() => supprimer(p)}>{$t('common.delete')}</button>
        {/if}
      {/if}
    </li>
  {/each}
</ul>

<div class="creer">
  <h4>{$t('profiles.createTitle')}</h4>
  {#if $isPremium}
    <div class="rangee">
      <span class="rond" style="background:{nouvelleCouleur}">{initiale(nouveauNom)}</span>
      <input class="txt" placeholder={$t('profiles.namePlaceholder')} bind:value={nouveauNom} onkeydown={(e) => e.key === 'Enter' && creer()} />
      <span class="couleurs">
        {#each COULEURS_AVATAR as c (c)}
          <button class="pt" class:choisi={nouvelleCouleur === c} style="background:{c}" onclick={() => (nouvelleCouleur = c)} aria-label={c}></button>
        {/each}
      </span>
      <button class="lnk prim" disabled={!nouveauNom.trim() || creation} onclick={creer}>
        {creation ? $t('common.loading') : $t('profiles.createButton')}
      </button>
    </div>
    {#if erreurCreation}<p class="err">{erreurCreation}</p>{/if}
  {:else}
    <p class="premium">{$t('profiles.premiumRequired')}</p>
  {/if}
</div>

<style>
  .hint{margin:4px 0 12px; font-size:12.5px; line-height:1.5; color:var(--v2-txt3)}
  .liste{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px}
  .profil{display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 10px; border-radius:11px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2)}
  .profil.actif{border-color:var(--v2-acc2)}
  .principal{display:flex; align-items:center; gap:10px; flex:1; min-width:0; padding:0; border:0; background:transparent;
    color:var(--v2-txt); cursor:pointer; text-align:left; font:13.5px var(--v2-sans)}
  .rond{width:32px; height:32px; border-radius:50%; flex:0 0 auto; display:flex; align-items:center; justify-content:center;
    color:#fff; font:600 13px var(--v2-sans)}
  .nom{font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .badge{font:600 10px var(--v2-sans); padding:2px 8px; border-radius:999px; background:var(--v2-acc2); color:#fff}
  .txt{height:34px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-bg);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 11px; outline:none; flex:1; min-width:140px}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .couleurs{display:flex; gap:5px}
  .pt{width:18px; height:18px; border-radius:50%; border:2px solid transparent; padding:0; cursor:pointer}
  .pt.choisi{border-color:var(--v2-txt)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .lnk:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk:disabled{opacity:.45; cursor:default}
  .lnk.prim{background:var(--v2-acc2); border-color:transparent; color:#fff}
  .lnk.danger{color:var(--v2-danger, #ef4444)}
  .creer{margin-top:16px; padding-top:14px; border-top:1px solid var(--v2-line2)}
  .creer h4{margin:0 0 10px; font:600 13px var(--v2-sans); color:var(--v2-txt)}
  .rangee{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .err{margin:8px 0 0; font-size:12px; color:var(--v2-danger, #ef4444)}
  .premium{margin:0; padding:10px 12px; border-radius:11px; font-size:12.5px; color:var(--v2-txt2);
    border:1px solid rgba(245,158,11,.35); background:rgba(245,158,11,.08)}
</style>
