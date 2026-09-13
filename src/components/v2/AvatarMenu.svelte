<script lang="ts">
  /**
   * Menu avatar (coin haut-droit) du nouveau client.
   *
   * Abrite le sélecteur de NIVEAU D'INTERFACE (Essential / Advanced / Expert),
   * caché par défaut : on n'expose la profondeur de l'UI que sur ouverture du
   * menu. Le choix écrit dans `preferences.settingsLevel` — même réglage
   * synchronisé que la vue Réglages, donc un seul curseur pour toute l'app.
   * Défaut : Essential (débutant) pour tous.
   */
  import { onMount } from 'svelte';
  import { activeView } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { LEVEL_LABEL_KEYS, type SettingsLevel } from '../../lib/uiLevel';
  import { V2_THEMES, type V2Theme } from '../../lib/v2Theme';
  import { t } from '../../lib/i18n';
  import { choisirInterface } from '../../lib/interfaceChoisie';
  import { get } from 'svelte/store';
  import { searchSettings, tabLabel, type V2SettingsHit } from '../../lib/v2Settings';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import * as api from '../../lib/api';
  import {
    peutChoisirPhoto, photoAAfficher, proprietairePourNouvellePhoto,
    type EtatCompte,
  } from '../../lib/proprietaireAvatar';
  import { notifications } from '../../lib/stores/notifications';
  import { avatarDepuisFichier, AvatarRefuse, CLE_MESSAGE } from '../../lib/avatarLocal';
  import { profiles, currentProfileId, type Profile } from '../../lib/stores/profile';
  import { basculerVers } from '../../lib/basculeDeProfil';

  const LEVELS: SettingsLevel[] = ['beginner', 'intermediate', 'expert'];
  let open = $state(false);
  const level = $derived($preferences.settingsLevel);

  // ── Identité du compte cloud ──────────────────────────────────────────────
  //
  // L'en-tête du menu affichait « Bertrand » / « MozaikLabs » EN DUR. Chez tout
  // autre utilisateur, le menu nommait donc Bertrand. On lit le MÊME contrat
  // que la vue Réglages v1 (`loadCloudStatus`) : `GET /cloud/sso/status` rend
  // `{ configured, connected, user: { email, display_name, avatar_url } }`.
  //
  // Non connecté, on n'invente aucun nom : l'en-tête le dit, et l'entrée
  // « Se déconnecter » disparaît — proposer de quitter une session qui n'existe
  // pas est exactement le genre de bouton qui ment.
  let ssoConnected = $state(false);
  let ssoConfigured = $state(false);
  let ssoName = $state('');
  let ssoEmail = $state('');
  let ssoAvatar = $state('');
  let signingOut = $state(false);

  async function loadSso() {
    try {
      const sso: any = await api.apiFetch('/cloud/sso/status');
      ssoConfigured = !!sso?.configured;
      if (sso?.connected && sso?.user) {
        ssoConnected = true;
        ssoName = sso.user.display_name || sso.user.email || '';
        ssoEmail = sso.user.email || '';
        ssoAvatar = sso.user.avatar_url || '';
        return;
      }
    } catch {
      // Serveur muet ou hors ligne : on reste sur l'état « non connecté »
      // plutôt que d'afficher une identité qu'on ne tient de personne. Et on
      // ne propose pas de se connecter — on ne sait même pas si le nuage
      // existe sur ce serveur.
      ssoConfigured = false;
    }
    ssoConnected = false;
    ssoName = '';
    ssoEmail = '';
    ssoAvatar = '';
  }

  // Une fois au montage — la PASTILLE de l'avatar dit l'état du compte même
  // menu fermé, elle a donc besoin du statut tout de suite — puis relu à CHAQUE
  // ouverture : la session peut avoir été fermée ailleurs (autre onglet, écran
  // Réglages v1, expiration) pendant que le menu restait monté.
  onMount(() => {
    void loadSso();
  });
  $effect(() => {
    if (open) void loadSso();
  });

  /**
   * Ouvrir la session cloud.
   *
   * Le menu savait dire « non connecté » et retirer « Se déconnecter » — mais
   * n'offrait AUCUN moyen d'entrer. Un état sans issue : l'utilisateur lit son
   * statut et ne peut rien en faire.
   *
   * Même chemin que le client actuel : le serveur redirige vers « / » sans
   * indicateur, donc on pose un drapeau AVANT de partir. `localStorage` avec
   * horodatage, parce que `sessionStorage` ne survit pas de façon fiable à une
   * chaîne de redirections inter-origines (ITP de Safari, navigateurs mobiles) ;
   * les deux sont posés, l'un rattrape l'autre.
   */
  function signIn() {
    try { localStorage.setItem('tune_sso_pending', Date.now().toString()); } catch {}
    try { sessionStorage.setItem('tune_sso_pending', '1'); } catch {}
    window.location.href = '/api/v1/cloud/sso/authorize';
  }

  async function signOut() {
    signingOut = true;
    try {
      await api.ssoDisconnect();
      await loadSso();
      notifications.success(get(t)('settings.cloudDisconnected'));
      close();
    } catch (e: any) {
      notifications.error(e?.message ?? get(t)('common.error'));
    }
    signingOut = false;
  }

  // ── La photo qu'on choisit soi-même ──────────────────────────────────────
  //
  // La bulle n'avait qu'une source : le compte mozaiklabs.fr. Sur un serveur
  // personnel sans nuage configuré, il n'existait AUCUN moyen de se donner une
  // image, et deux testeurs l'ont demandé à un jour d'intervalle (fils 1681 et
  // 1676, issue #893). Le fichier est recadré et réduit par `lib/avatarLocal`,
  // puis rangé dans les préférences — le serveur Tune n'a pas de route
  // d'avatar, rien n'est téléversé.
  //
  // La photo locale PRIME sur celle du compte : elle est un choix explicite,
  // l'autre est héritée. C'est aussi ce qui permet de remplacer une photo
  // mozaiklabs qu'on ne peut pas changer depuis ici.
  let champFichier = $state<HTMLInputElement | null>(null);
  let envoiPhoto = $state(false);
  // Une photo locale que CE navigateur ne sait pas décoder — un WebP écrit
  // ailleurs sur un moteur qui l'ignore. On l'écarte pour la session, sans
  // jamais l'effacer : la supprimer repartirait en `PATCH` et détruirait chez
  // tout le monde une image parfaitement lisible ailleurs.
  let photoLocaleCassee = $state(false);

  /**
   * L'identité du compte ouvert : l'adresse de courriel, son nom d'affichage à
   * défaut. C'est la clé à laquelle la photo est attachée.
   */
  const identiteCompte = $derived(ssoEmail || ssoName);

  /**
   * 🔴 #893 — l'état du compte, tel que le serveur le décrit.
   *
   * `configured` sépare « pas de compte OUVERT » de « pas de compte
   * POSSIBLE ». Sur un serveur sans nuage — celui des deux demandeurs, fils
   * 1681 et 1676 — personne ne peut jamais se connecter : refuser la photo
   * faute de compte revenait à la refuser pour toujours.
   */
  const etatCompte = $derived<EtatCompte>({
    configured: ssoConfigured,
    connected: ssoConnected,
    identite: identiteCompte,
  });

  /**
   * 🔴 La photo n'est montrée QUE si elle appartient au compte ouvert.
   *
   * Les préférences sont rangées par installation, pas par compte. Sans ce
   * recoupement, la photo survivait à la déconnexion — elle restait affichée
   * dans le coin de l'écran alors qu'il n'y avait plus personne — et le compte
   * suivant ouvert sur la même machine héritait de celle du précédent. Se
   * déconnecter rend le dégradé ; se reconnecter rend la photo.
   */
  const photoLocale = $derived(
    photoAAfficher(etatCompte, {
      image: $preferences.avatarImage ?? '',
      compte: $preferences.avatarCompte ?? '',
    }),
  );
  const photo = $derived((photoLocaleCassee ? '' : photoLocale) || ssoAvatar);

  // Une photo fraîchement choisie doit être réessayée, même si la précédente
  // avait échoué : sans ça, le drapeau d'échec collerait à la nouvelle.
  $effect(() => {
    if (photoLocale) photoLocaleCassee = false;
  });

  /**
   * Le geste principal : un clic sur le ROND DU PANNEAU ouvre l'explorateur.
   *
   * Déconnecté, on refuse en disant pourquoi. La photo est attachée à un
   * compte : en poser une sans compte produirait une image aussitôt masquée,
   * c'est-à-dire un bouton qui ne fait rien de visible. Et « Se connecter » est
   * juste en dessous, dans le même panneau.
   */
  function ouvrirExplorateur() {
    // #893 — le refus ne vaut que si un compte est POSSIBLE. Sans nuage
    // configuré, la photo est locale et n'appartient à personne.
    if (peutChoisirPhoto(etatCompte) === 'connexion') {
      notifications.error(get(t)('settings.avatarSignInFirst'));
      return;
    }
    champFichier?.click();
  }

  async function choisirPhoto(e: Event) {
    const champ = e.currentTarget as HTMLInputElement;
    const fichier = champ.files?.[0];
    // 🔴 On vide le champ TOUT DE SUITE. Un `<input type="file">` ne relève
    // `change` que si la valeur change : rechoisir le même fichier après
    // l'avoir retiré ne déclencherait plus rien, et le bouton paraîtrait mort.
    champ.value = '';
    if (!fichier) return;
    envoiPhoto = true;
    try {
      const url = await avatarDepuisFichier(fichier);
      // La photo et SON propriétaire s'écrivent ensemble : une photo sans
      // compte ne s'afficherait jamais, et un compte sans photo est l'état
      // normal. Les séparer laisserait une fenêtre où l'un existe sans l'autre.
      // #893 — sans nuage, la photo n'est attachée à personne : elle doit
      // survivre, puisqu'aucun compte ne viendra jamais la réclamer.
      preferences.update((p) => ({
        ...p, avatarImage: url, avatarCompte: proprietairePourNouvellePhoto(etatCompte),
      }));
      notifications.success(get(t)('settings.avatarSaved'));
    } catch (err) {
      // Le motif du refus est porté par l'exception : on dit QUOI corriger.
      // Un « échec » sans cause renvoie l'utilisateur réessayer le même
      // fichier, indéfiniment.
      const cle = err instanceof AvatarRefuse ? CLE_MESSAGE[err.motif] : CLE_MESSAGE.lecture;
      notifications.error(get(t)(cle));
    }
    envoiPhoto = false;
  }

  function retirerPhoto() {
    preferences.update((p) => ({ ...p, avatarImage: '', avatarCompte: '' }));
    notifications.success(get(t)('settings.avatarRemoved'));
  }

  /**
   * Le nom à écrire.
   *
   * `name` est l'IDENTIFIANT de connexion — le serveur y range l'adresse de
   * courriel — et `display_name` le prénom. Afficher `name` mettrait
   * « matteo@mozaiklabs.fr » dans une liste de personnes.
   */
  function nomDuProfil(p: Profile): string {
    return p.display_name?.trim() || p.name;
  }

  /**
   * Basculer RECHARGE la page — voir `lib/basculeDeProfil` pour le pourquoi.
   * On ne ferme donc pas le panneau : il n'y en aura plus.
   */
  function basculer(id: number) {
    basculerVers(get(currentProfileId), id);
  }

  function setLevel(l: SettingsLevel) {
    preferences.update((p) => ({ ...p, settingsLevel: l }));
  }
  const theme = $derived($preferences.v2Theme);
  function setTheme(t: V2Theme) {
    preferences.update((p) => ({ ...p, v2Theme: t }));
  }
  // Recherche de réglages : lit la MÊME carte que l'écran Réglages v2
  // (lib/v2Settings), donc l'index ne peut pas diverger de l'écran réel.
  // On résout les clés i18n pour chercher sur les libellés affichés — un
  // utilisateur tape « me suivre », pas « settings.followMe ».
  let q = $state('');
  const hits = $derived<V2SettingsHit[]>(searchSettings(q, (k) => $t(k as any)));

  function openSetting(h: V2SettingsHit) {
    v2SettingsTarget.set({ tab: h.tab.id, section: h.section.id });
    activeView.set('settings');
    q = '';
    close();
  }

  function toggle() { open = !open; if (!open) q = ''; }
  function close() { open = false; }
  function onDocClick(e: MouseEvent) {
    const cible = e.target as HTMLElement | null;
    // 🔴 Un élément que le clic vient de FAIRE DISPARAÎTRE n'a plus d'ancêtre :
    // Svelte l'a détaché avant que ce gestionnaire de fenêtre ne s'exécute,
    // `closest('.avwrap')` rend null, et le menu se referme comme si on avait
    // cliqué dehors. Mesuré sur « Retirer » (#893), qui s'efface lui-même dès
    // que la photo est retirée : le panneau se fermait sur son propre bouton.
    if (cible && !cible.isConnected) return;
    if (!cible?.closest('.avwrap')) open = false;
  }
</script>

<svelte:window onclick={onDocClick} />

<div class="avwrap tune-v2">
  <button class="avatar" class:linked={ssoConnected} onclick={toggle} aria-label={$t('settings.accountMenu' as any)} aria-haspopup="menu" aria-expanded={open}>
    <!-- La photo affichée : celle qu'on a choisie soi-même d'abord, celle du
         compte mozaiklabs.fr à défaut. En `<img>` et non en `background-image` :
         l'URL vient du serveur, la coller dans du CSS l'exposerait à une
         échappée hors de `url(…)`. Un `<img>` ne peut porter qu'une source.
         `onerror` remet le dégradé : une photo injoignable — hébergeur muet,
         fichier supprimé — laisserait sinon un rond vide, pire que pas de
         photo du tout. Une photo LOCALE illisible est seulement écartée pour la
         session : l'effacer la détruirait aussi sur les appareils qui la
         lisent très bien. -->
    {#if photo}
      <img class="avimg" src={photo} alt=""
        onerror={() => { if (photoLocale && !photoLocaleCassee) photoLocaleCassee = true; else ssoAvatar = ''; }} />
    {/if}
  </button>

  <!-- Le champ de fichier vit hors du panneau : il n'a aucune raison d'être
       détruit et reconstruit à chaque ouverture du menu. -->
  <input class="fichier" bind:this={champFichier} type="file" accept="image/*"
    tabindex="-1" aria-hidden="true" onchange={choisirPhoto} />

  {#if open}
    <div class="avmenu">
      <div class="avhead">
        <!--
          LE ROND DU PANNEAU OUVRE L'EXPLORATEUR. Un clic, on choisit, la photo
          remplace l'ancienne — pas de rubrique à déplier, pas de bouton
          « Choisir » à lire (geste demandé par Matteo, 12/09/2026).

          Il est ici et non sur la bulle : la bulle ouvre le panneau, comme elle
          l'a toujours fait, et elle en est la seule porte.
        -->
        <button class="avatar sm" onclick={ouvrirExplorateur} disabled={envoiPhoto}
          aria-label={$t('settings.avatarSetPhoto' as any)} title={$t('settings.avatarSetPhoto' as any)}>
          {#if photo}
            <img class="avimg" src={photo} alt="" />
          {/if}
        </button>
        <div class="avid">
          {#if ssoConnected}
            <div class="avname">{ssoName}</div>
            {#if ssoEmail && ssoEmail !== ssoName}<div class="avmail">{ssoEmail}</div>{/if}
          {:else}
            <div class="avname">{$t('settings.notConnected')}</div>
          {/if}
        </div>
      </div>
      <!--
        « Retirer » ne s'affiche que s'il y a une photo à retirer — sans lui, on
        pourrait seulement REMPLACER, jamais revenir au dégradé. Il est bref et
        discret : le geste courant est le rond ci-dessus.
      -->
      {#if photoLocale}
        <button class="retirer" onclick={retirerPhoto}>{$t('settings.avatarRemove' as any)}</button>
        <div class="hint">{$t('settings.avatarHint' as any)}</div>
      {/if}

      <!--
        LA BASCULE DE PROFIL.

        Elle n'existait NULLE PART dans cette interface : `ProfileSelector` n'est
        monté que par `Sidebar.svelte`, donc par l'interface actuelle. Le profil
        retenu (`localStorage['tune-profile-id']`) était pourtant déjà honoré —
        il part en `X-Profile-Id` sur chaque appel — mais rien ne permettait
        d'en changer sans repasser par l'ancienne interface.

        Elle n'apparaît qu'à partir de DEUX profils : sur une installation qui
        n'en a qu'un, une liste à un élément n'est pas un choix, c'est du bruit.
      -->
      {#if $profiles.length > 1}
        <div class="sep"></div>
        <div class="sec">{$t('profiles.title')}</div>
        <div class="profils">
          {#each $profiles as p (p.id)}
            <button
              class="profil"
              class:actif={p.id === $currentProfileId}
              onclick={() => basculer(p.id)}
              aria-current={p.id === $currentProfileId ? 'true' : undefined}
            >
              <span class="pastille" style="background:{p.avatar_color || 'var(--v2-line2)'}"
                >{nomDuProfil(p).charAt(0).toUpperCase()}</span
              >
              <span class="pnom">{nomDuProfil(p)}</span>
            </button>
          {/each}
        </div>
        <div class="hint">{$t('profiles.switchHint' as any)}</div>
      {/if}

      <div class="sep"></div>

      <div class="sfield">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input
          type="search"
          placeholder={$t('settings.searchSetting' as any)}
          bind:value={q}
          onkeydown={(e) => { if (e.key === 'Enter' && hits.length) openSetting(hits[0]); if (e.key === 'Escape') q = ''; }}
        />
      </div>

      {#if q.trim().length >= 2}
        <div class="hits">
          {#if hits.length}
            {#each hits as h (h.tab.id + '/' + h.section.id)}
              <button class="hit" onclick={() => openSetting(h)}>
                <span class="hl">{h.label}</span>
                <span class="ht">{tabLabel(h.tab, (k) => $t(k as any))}</span>
              </button>
            {/each}
          {:else}
            <div class="nohit">{$t('settings.noSettingFound' as any).replace('{query}', q.trim())}</div>
          {/if}
        </div>
        <div class="sep"></div>
      {/if}

      <div class="sec">{$t('settings.interface' as any)}</div>
      <div class="seg">
        {#each LEVELS as l (l)}
          <button class:on={level === l} onclick={() => setLevel(l)}>{$t(LEVEL_LABEL_KEYS[l] as any)}</button>
        {/each}
      </div>
      <div class="hint">{$t('settings.levelScopeHint' as any)}</div>

      <div class="sep"></div>

      <!--
        LE RETOUR vers l'interface actuelle. Il vit ici, et non dans les
        Réglages, parce qu'il doit rester à un clic depuis N'IMPORTE QUEL
        écran : c'est l'issue de sortie d'une prévisualisation. L'enfouir
        derrière deux navigations reviendrait à demander de retaper l'adresse.
      -->
      <div class="sec">{$t('settings.uiChoice' as any)}</div>
      <div class="seg">
        <button onclick={() => choisirInterface(false)}>{$t('settings.uiCurrent' as any)}</button>
        <button class="on">{$t('settings.uiFuture' as any)}</button>
      </div>
      <div class="hint">{$t('settings.uiChoiceHint' as any)}</div>

      <div class="sep"></div>

      <div class="sec">{$t('settings.themes' as any)}</div>
      <div class="themes">
        {#each V2_THEMES as t (t.id)}
          <button
            class="sw"
            class:on={theme === t.id}
            title={t.label}
            aria-label={t.label}
            aria-pressed={theme === t.id}
            style="--sw-bg:{t.swatch[0]}; --sw-acc:{t.swatch[1]}"
            onclick={() => setTheme(t.id)}
          ></button>
        {/each}
      </div>
      <div class="hint">{V2_THEMES.find((t) => t.id === theme)?.label ?? ''}</div>
      <!-- Même avertissement que l'écran Réglages (décision Bertrand du
           01/09/2026) : depuis ce menu, on changeait le thème sans savoir qu'il
           ne s'applique qu'au nouveau client. -->
      <div class="hint">{$t('settings.themeScopeHint' as any)}</div>

      <div class="sep"></div>
      <button class="item" onclick={() => { activeView.set('settings'); close(); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 2.6V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        {$t('settings.titleV2' as any)}
      </button>
      {#if !ssoConnected && ssoConfigured}
        <button class="item" onclick={signIn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5M15 12H3M11 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8" /></svg>
          {$t('settings.signIn')}
        </button>
      {:else if !ssoConnected}
        <div class="hint">{$t('settings.cloudComingSoon')}</div>
      {/if}
      {#if ssoConnected}
        <button class="item" onclick={signOut} disabled={signingOut}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 17l5-5-5-5M21 12H9M13 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8" /></svg>
          {signingOut ? $t('common.loading') : $t('settings.signOut')}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .avwrap{position:relative; font-family:var(--v2-sans)}
  .avatar{width:44px; height:44px; border-radius:50%; border:2px solid var(--v2-line2); cursor:pointer;
    position:relative; background:linear-gradient(135deg,var(--v2-av1),var(--v2-av2)); padding:0}
  /* Pastille de compte. Elle etait DECORATIVE — couleur fixe, aucun etat — et
     une pastille qui ne statue sur rien finit par etre lue comme un etat.
     Elle dit desormais le compte cloud : accent quand la session SSO est
     ouverte, gris eteint sinon (decision Bertrand du 01/09/2026). */
  .avatar::after{content:""; position:absolute; right:1px; bottom:1px; width:10px; height:10px;
    border-radius:50%; background:var(--v2-line2); border:2px solid var(--v2-bg)}
  .avatar.linked::after{background:var(--v2-acc1)}
  .avatar.sm{width:38px; height:38px}
  /* L'image remplit le bouton ; la pastille d'état lui passe par-dessus. */
  .avimg{width:100%; height:100%; border-radius:50%; object-fit:cover; display:block}

  .avmenu{position:absolute; right:0; top:52px; width:250px; z-index:60;
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:16px; padding:12px;
    box-shadow:var(--v2-sh-menu); color:var(--v2-txt);
    /*
      🔴 IL DOIT TENIR DANS LA FENÊTRE.

      Capture d'un testeur (bluevelvet, Windows, v0.9.140) : « Réglages » et
      « Se déconnecter » coupés par le bas de l'écran. Mesuré dans un cadre de
      1356 x 622 le 07/09/2026 :

          hauteur du panneau : 592 px
          haut               :  72 px   ->  bas à 664, soit 42 px hors écran
          max-height : none      overflow-y : visible

      Le panneau GRANDIT avec le produit — les thèmes sont arrivés le 05/09 —
      alors qu'une fenêtre de portable, elle, ne grandit pas. Sans plafond, le
      défaut revient au prochain réglage ajouté.

      132 px de marge et non 92 : la grappe descend de `--maj-h` (42 px) quand
      la bannière de mise à jour est là, et le panneau descend avec elle. Le
      plafond doit tenir dans les DEUX cas.

      `dvh` d'abord pour les navigateurs mobiles, dont la barre d'adresse
      rétracte `vh` sans le dire ; `vh` reste en repli pour les plus anciens.
    */
    max-height:calc(100vh - 132px);
    max-height:calc(100dvh - 132px);
    overflow-y:auto;
    /* Arrivé en bout de liste, la molette ne doit pas se mettre à faire
       défiler l'écran DERRIÈRE le panneau. */
    overscroll-behavior:contain}
  .avhead{display:flex; align-items:center; gap:11px; padding:6px 6px 10px}
  /* Le bloc d'identité doit pouvoir RÉTRÉCIR : sans `min-width:0`, une adresse
     longue pousse la largeur du menu au lieu de s'élider. */
  .avid{min-width:0}
  .avname{font-weight:700; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .avmail{font-family:var(--v2-mono); font-size:10px; letter-spacing:.12em; color:var(--v2-txt2); margin-top:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  /* Le rond de l'en-tête est un BOUTON : il ouvre l'explorateur de photo.
     L'anneau au survol le dit — un rond qui ne réagit pas se lit comme une
     vignette, et personne ne clique une vignette. */
  .avatar.sm:hover{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .avatar.sm:disabled{opacity:.55; cursor:default; box-shadow:none}

  /* La liste des profils. Défilante : un foyer peut en compter plusieurs, et le
     panneau est déjà plafonné en hauteur depuis la capture de bluevelvet. */
  .profils{display:flex; flex-direction:column; gap:2px; max-height:168px; overflow-y:auto; padding:0 2px}
  .profils::-webkit-scrollbar{width:7px}
  .profils::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .profil{display:flex; align-items:center; gap:10px; width:100%; padding:7px 8px; border:0;
    border-radius:9px; background:transparent; cursor:pointer; text-align:left;
    color:var(--v2-txt2); font-family:inherit; font-size:13px}
  .profil:hover{background:var(--v2-hover); color:var(--v2-txt)}
  /* L'actif se lit par un FOND, pas par une couleur d'accent : il reste alors
     lisible dans les six thèmes sans avoir à les vérifier un par un. */
  .profil.actif{background:var(--v2-surface2); color:var(--v2-txt); font-weight:600}
  .pastille{flex:0 0 auto; width:24px; height:24px; border-radius:50%; display:flex;
    align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#fff}
  .pnom{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

  /* « Retirer » : un lien discret sous l'identité, pas un bouton de plus. */
  .retirer{display:block; margin:0 0 4px 55px; padding:2px 0; border:0; background:transparent;
    color:var(--v2-txt3); font-family:inherit; font-size:11px; cursor:pointer; text-decoration:underline}
  .retirer:hover{color:var(--v2-txt)}
  .sep{height:1px; background:var(--v2-line); margin:6px 0}
  .sec{font-family:var(--v2-mono); font-size:9.5px; letter-spacing:.16em; color:var(--v2-txt3);
    text-transform:uppercase; padding:6px 6px 8px}
  .seg{display:flex; gap:2px; padding:3px; border-radius:12px; background:var(--v2-surface2); border:1px solid var(--v2-line)}
  .seg button{flex:1; border:0; background:transparent; color:var(--v2-txt2); font-family:inherit;
    font-size:11.5px; font-weight:600; padding:7px 4px; border-radius:9px; cursor:pointer; transition:.15s}
  .seg button:hover{color:var(--v2-txt)}
  .seg button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 3px 10px var(--v2-glow)}
  /* Le champ de fichier n'est jamais montré : le bouton du menu le déclenche.
     `display:none` et non une astuce de position — rien ne doit le rendre
     atteignable au clavier, c'est le bouton qui porte le focus. */
  .fichier{display:none}
  .sfield{position:relative; display:flex; align-items:center; margin:2px 4px 6px}
  .sfield svg{position:absolute; left:11px; width:15px; height:15px; color:var(--v2-txt3); pointer-events:none}
  .sfield input{width:100%; height:36px; border-radius:10px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:12.5px var(--v2-sans); padding:0 10px 0 33px; outline:none}
  .sfield input::placeholder{color:var(--v2-txt3)}
  .sfield input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .sfield input::-webkit-search-cancel-button{-webkit-appearance:none}
  .hits{display:flex; flex-direction:column; gap:1px; max-height:190px; overflow-y:auto; padding:0 2px}
  .hits::-webkit-scrollbar{width:7px}.hits::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .hit{display:flex; align-items:baseline; justify-content:space-between; gap:10px; width:100%; padding:8px;
    border:0; border-radius:8px; background:transparent; cursor:pointer; text-align:left; color:var(--v2-txt2)}
  .hit:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .hit .hl{font-size:12.5px; font-weight:500; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .hit .ht{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3); flex:0 0 auto}
  .nohit{padding:10px 8px; font-size:11.5px; color:var(--v2-txt3)}
  .themes{display:grid; grid-template-columns:repeat(6,1fr); gap:6px; padding:2px 4px 0}
  .sw{position:relative; aspect-ratio:1; border-radius:9px; cursor:pointer; padding:0;
    border:1px solid var(--v2-line2); background:var(--sw-bg); transition:.15s}
  /* Pastille d'accent : dit la couleur du thème sans avoir à l'appliquer. */
  .sw::after{content:""; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:52%; height:52%; border-radius:50%; background:var(--sw-acc)}
  .sw:hover{transform:translateY(-1px); border-color:var(--sw-acc)}
  .sw.on{border-color:var(--sw-acc); box-shadow:0 0 0 2px var(--v2-surface), 0 0 0 3px var(--sw-acc)}
  .hint{font-size:10.5px; color:var(--v2-txt3); line-height:1.35; padding:8px 6px 2px}
  .item{display:flex; align-items:center; gap:11px; width:100%; padding:9px 8px; border:0; cursor:pointer;
    border-radius:9px; background:transparent; color:var(--v2-txt2); font-family:inherit; font-size:13.5px; font-weight:500; text-align:left}
  .item:hover{background:var(--v2-hover); color:var(--v2-txt)}
  /* Déconnexion en cours : plus de survol, plus de curseur cliquable — sinon
     rien ne distingue un bouton qui travaille d'un bouton qui n'a rien fait. */
  .item:disabled{opacity:.55; cursor:default}
  .item:disabled:hover{background:transparent; color:var(--v2-txt2)}
  .item svg{width:17px; height:17px}
</style>
