<script lang="ts">
  import { notifierErreur } from '../../lib/notifierErreur';
  import { bulleTexte } from '../../lib/infobulleTexte';
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
  import { V2_THEMES, v2ThemeLabel, type V2Theme } from '../../lib/v2Theme';
  import { t } from '../../lib/i18n';
  import { urlSsoAuthorize } from '../../lib/ssoAuthorize';
  import { get } from 'svelte/store';
  import { tabLabel } from '../../lib/v2Settings';
  import { searchReglages, masqueAuNiveau, type ReglageHit } from '../../lib/reglagesIndex';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import * as api from '../../lib/api';
  import { ssoDisponible } from '../../lib/bridge';
  import {
    peutChoisirPhoto, photoAAfficher, proprietairePourNouvellePhoto,
    type EtatCompte,
  } from '../../lib/proprietaireAvatar';
  import { notifications } from '../../lib/stores/notifications';
  import { dialogs } from '../../lib/stores/dialogs';
  import { avatarDepuisFichier, AvatarRefuse, CLE_MESSAGE } from '../../lib/avatarLocal';

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
    window.location.href = urlSsoAuthorize('/api/v1');
  }

  async function signOut() {
    // Se déconnecter DÉLIE ce serveur du compte : sa copie de bibliothèque en
    // ligne et ses partages de cercle sont effacés chez le cloud, le premium
    // du compte tombe. Un clic égaré ne doit pas suffire : on demande, et la
    // question dit ce qui sera perdu.
    if (!(await dialogs.confirm(get(t)('settings.signOutConfirm'), { danger: true }))) return;
    signingOut = true;
    try {
      await api.ssoDisconnect();
      await loadSso();
      notifications.success(get(t)('settings.cloudDisconnected'));
      close();
    } catch (e: any) {
      notifierErreur(get(t)('common.error'), e, { motifSeul: true });
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

  function setLevel(l: SettingsLevel) {
    preferences.update((p) => ({ ...p, settingsLevel: l }));
  }
  const theme = $derived($preferences.v2Theme);
  const themeLabel = $derived.by(() => {
    const th = V2_THEMES.find((x) => x.id === theme);
    return th ? v2ThemeLabel(th, (k) => $t(k as any)) : '';
  });
  function setTheme(t: V2Theme) {
    preferences.update((p) => ({ ...p, v2Theme: t }));
  }
  // Recherche de réglages : lit le MÊME index que la recherche de l'écran
  // Réglages (lib/reglagesIndex, #2735), réglage par réglage — l'index et
  // l'écran ne peuvent pas diverger, un test vérifie chaque ancre.
  // On résout les clés i18n pour chercher sur les libellés affichés — un
  // utilisateur tape « me suivre », pas « settings.followMe ».
  let q = $state('');
  const hits = $derived<ReglageHit[]>(searchReglages(q, (k) => $t(k as any), 8));

  function openSetting(h: ReglageHit) {
    v2SettingsTarget.set({ tab: h.tab.id, section: h.section.id, reglage: h.reglage.id });
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
            <div class="avname" use:bulleTexte>{ssoName}</div>
          {:else}
            <div class="avname" use:bulleTexte>{$t('settings.notConnected')}</div>
          {/if}
        </div>
      </div>
      <!--
        Levente, 15/11/2026 (rc12) : l'en-tête ne garde que la photo et le nom.
        Plus d'adresse, plus de « Retirer », plus de texte sur la photo ; la
        liste des profils d'écoute a quitté ce menu — on change de profil dans
        « Gérer les profils » (`ProfilsV2`), qui porte la même bascule.
        Changer de photo reste un clic sur le rond ci-dessus.
      -->
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
            {#each hits as h (h.reglage.id)}
              <button class="hit" onclick={() => openSetting(h)} title={h.chemin.join(' › ')}>
                <span class="hl" use:bulleTexte>{h.label}</span>
                <span class="ht">{tabLabel(h.tab, (k) => $t(k as any))}{#if masqueAuNiveau(h.reglage, level)} · <span data-masque-niveau>{$t('reglages.recherche.masque' as any).replace('{niveau}', $t(LEVEL_LABEL_KEYS[h.niveau] as any))}</span>{/if}</span>
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

      <!--
        🔴 L'INTERRUPTEUR D'INTERFACE A ÉTÉ RETIRÉ — phase 5.
        Il offrait « l'issue de sortie d'une prévisualisation » : un clic pour
        revenir à l'ancienne coquille depuis n'importe quel écran. Il n'y a
        plus d'ancienne coquille, donc plus de sortie — et un bouton qui ne
        mène nulle part est pire qu'un bouton absent.
      -->

      <div class="sep"></div>

      <div class="sec">{$t('settings.themes' as any)}</div>
      <div class="themes">
        {#each V2_THEMES as th (th.id)}
          <button
            class="sw"
            class:on={theme === th.id}
            title={v2ThemeLabel(th, (k) => $t(k as any))}
            aria-label={v2ThemeLabel(th, (k) => $t(k as any))}
            aria-pressed={theme === th.id}
            style="--sw-bg:{th.swatch[0]}; --sw-acc:{th.swatch[1]}"
            onclick={() => setTheme(th.id)}
          ></button>
        {/each}
      </div>
      <div class="hint">{themeLabel}</div>
      <!-- Même avertissement que l'écran Réglages (décision Bertrand du
           01/09/2026) : depuis ce menu, on changeait le thème sans savoir qu'il
           ne s'applique qu'au nouveau client. -->
      <div class="hint">{$t('settings.themeScopeHint' as any)}</div>

      <div class="sep"></div>
      <!-- Bertrand, 16/09/2026 : la v2 ne savait que BASCULER de profil (et
           seulement à partir de deux). Le chemin vers la gestion — créer,
           renommer, supprimer — est ici, toujours visible : c'est le seul
           chemin vers un deuxième profil. -->
      <button class="item" onclick={() => { v2SettingsTarget.set({ tab: 'general', section: 'profiles' }); activeView.set('settings'); close(); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg>
        {$t('profiles.manage' as any)}
      </button>
      <button class="item" onclick={() => { activeView.set('settings'); close(); }}>
        <!-- Icône « settings » de Levente (Figma 609:5801), en `currentColor`. -->
        <svg data-icone="settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136C9.7261 3.55634 9.99533 3.01804 10.4261 2.62628C10.8569 2.23451 11.4182 2.01743 12.0005 2.01743C12.5828 2.01743 13.1441 2.23451 13.5749 2.62628C14.0057 3.01804 14.2749 3.55634 14.33 4.136C14.3631 4.51045 14.486 4.87142 14.6881 5.18834C14.8903 5.50526 15.1659 5.76881 15.4915 5.95668C15.8171 6.14454 16.1831 6.2512 16.5587 6.26762C16.9343 6.28404 17.3082 6.20974 17.649 6.051C18.1781 5.81078 18.7777 5.77602 19.331 5.95349C19.8843 6.13095 20.3518 6.50795 20.6425 7.0111C20.9332 7.51426 21.0263 8.10757 20.9036 8.67557C20.781 9.24357 20.4514 9.74562 19.979 10.084C19.6714 10.2998 19.4203 10.5866 19.2469 10.92C19.0736 11.2534 18.983 11.6237 18.983 11.9995C18.983 12.3753 19.0736 12.7456 19.2469 13.079C19.4203 13.4124 19.6714 13.6992 19.979 13.915C20.4514 14.2534 20.781 14.7554 20.9036 15.3234C21.0263 15.8914 20.9332 16.4847 20.6425 16.9879C20.3518 17.4911 19.8843 17.868 19.331 18.0455C18.7777 18.223 18.1781 18.1882 17.649 17.948C17.3082 17.7893 16.9343 17.715 16.5587 17.7314C16.1831 17.7478 15.8171 17.8545 15.4915 18.0423C15.1659 18.2302 14.8903 18.4937 14.6881 18.8107C14.486 19.1276 14.3631 19.4885 14.33 19.863C14.2749 20.4427 14.0057 20.981 13.5749 21.3727C13.1441 21.7645 12.5828 21.9816 12.0005 21.9816C11.4182 21.9816 10.8569 21.7645 10.4261 21.3727C9.99533 20.981 9.7261 20.4427 9.671 19.863C9.63794 19.4884 9.5151 19.1273 9.31287 18.8103C9.11063 18.4932 8.83497 18.2296 8.50923 18.0417C8.18349 17.8538 7.81727 17.7472 7.44158 17.7309C7.06589 17.7146 6.6918 17.7891 6.351 17.948C5.82189 18.1882 5.22233 18.223 4.669 18.0455C4.11567 17.868 3.64817 17.4911 3.35748 16.9879C3.06679 16.4847 2.97371 15.8914 3.09636 15.3234C3.21901 14.7554 3.5486 14.2534 4.021 13.915C4.32862 13.6992 4.57973 13.4124 4.75309 13.079C4.92645 12.7456 5.01695 12.3753 5.01695 11.9995C5.01695 11.6237 4.92645 11.2534 4.75309 10.92C4.57973 10.5866 4.32862 10.2998 4.021 10.084C3.54926 9.74545 3.22025 9.24359 3.0979 8.67598C2.97555 8.10837 3.06861 7.51554 3.35898 7.01271C3.64936 6.50989 4.11631 6.13298 4.66909 5.95524C5.22187 5.7775 5.82098 5.81163 6.35 6.051C6.69076 6.20974 7.06474 6.28404 7.4403 6.26762C7.81586 6.2512 8.18193 6.14454 8.50754 5.95668C8.83314 5.76881 9.10869 5.50526 9.31087 5.18834C9.51304 4.87142 9.63588 4.51045 9.669 4.136" /><path d="M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z" /></svg>
        {$t('settings.titleV2' as any)}
      </button>
      {#if !ssoConnected && ssoConfigured}
        <!-- Par le pont, le SSO ne peut pas aboutir : voir `ssoDisponible`. -->
        {#if ssoDisponible()}
          <button class="item" onclick={signIn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5M15 12H3M11 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8" /></svg>
            {$t('settings.signIn')}
          </button>
        {:else}
          <div class="hint">{$t('login.ssoIndisponibleRelais' as any)}</div>
        {/if}
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
  .avname{font-weight:700; font-size:calc(14px * var(--v2-txt-echelle, 1)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  /* Le rond de l'en-tête est un BOUTON : il ouvre l'explorateur de photo.
     L'anneau au survol le dit — un rond qui ne réagit pas se lit comme une
     vignette, et personne ne clique une vignette. */
  .avatar.sm:hover{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .avatar.sm:disabled{opacity:.55; cursor:default; box-shadow:none}

  .sep{height:1px; background:var(--v2-line); margin:6px 0}
  .sec{font-family:var(--v2-mono); font-size:calc(9.5px * var(--v2-txt-echelle, 1)); letter-spacing:.16em; color:var(--v2-txt3);
    text-transform:uppercase; padding:6px 6px 8px}
  .seg{display:flex; gap:2px; padding:3px; border-radius:12px; background:var(--v2-surface2); border:1px solid var(--v2-line)}
  .seg button{flex:1; border:0; background:transparent; color:var(--v2-txt2); font-family:inherit;
    font-size:calc(11.5px * var(--v2-txt-echelle, 1)); font-weight:600; padding:7px 4px; border-radius:9px; cursor:pointer; transition:.15s}
  .seg button:hover{color:var(--v2-txt)}
  .seg button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 3px 10px var(--v2-glow)}
  /* Le champ de fichier n'est jamais montré : le bouton du menu le déclenche.
     `display:none` et non une astuce de position — rien ne doit le rendre
     atteignable au clavier, c'est le bouton qui porte le focus. */
  .fichier{display:none}
  .sfield{position:relative; display:flex; align-items:center; margin:2px 4px 6px}
  .sfield svg{position:absolute; left:11px; width:15px; height:15px; color:var(--v2-txt3); pointer-events:none}
  .sfield input{width:100%; height:36px; border-radius:10px; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:0 10px 0 33px; outline:none}
  .sfield input::placeholder{color:var(--v2-txt3)}
  .sfield input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .sfield input::-webkit-search-cancel-button{-webkit-appearance:none}
  .hits{display:flex; flex-direction:column; gap:1px; max-height:190px; overflow-y:auto; padding:0 2px}
  .hits::-webkit-scrollbar{width:7px}.hits::-webkit-scrollbar-thumb{background:var(--v2-scrollthumb, var(--v2-line2)); border-radius:6px}
  .hit{display:flex; align-items:baseline; justify-content:space-between; gap:10px; width:100%; padding:8px;
    border:0; border-radius:8px; background:transparent; cursor:pointer; text-align:left; color:var(--v2-txt2)}
  .hit:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .hit .hl{font-size:calc(12.5px * var(--v2-txt-echelle, 1)); font-weight:500; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .hit .ht{font:calc(9.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3); flex:0 0 auto}
  .nohit{padding:10px 8px; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .themes{display:grid; grid-template-columns:repeat(6,1fr); gap:6px; padding:2px 4px 0}
  .sw{position:relative; aspect-ratio:1; border-radius:9px; cursor:pointer; padding:0;
    border:1px solid var(--v2-line2); background:var(--sw-bg); transition:.15s}
  /* Pastille d'accent : dit la couleur du thème sans avoir à l'appliquer. */
  .sw::after{content:""; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:52%; height:52%; border-radius:50%; background:var(--sw-acc)}
  .sw:hover{transform:translateY(-1px); border-color:var(--sw-acc)}
  .sw.on{border-color:var(--sw-acc); box-shadow:0 0 0 2px var(--v2-surface), 0 0 0 3px var(--sw-acc)}
  .hint{font-size:calc(10.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); line-height:1.35; padding:8px 6px 2px}
  .item{display:flex; align-items:center; gap:11px; width:100%; padding:9px 8px; border:0; cursor:pointer;
    border-radius:9px; background:transparent; color:var(--v2-txt2); font-family:inherit; font-size:calc(13.5px * var(--v2-txt-echelle, 1)); font-weight:500; text-align:left}
  .item:hover{background:var(--v2-hover); color:var(--v2-txt)}
  /* Déconnexion en cours : plus de survol, plus de curseur cliquable — sinon
     rien ne distingue un bouton qui travaille d'un bouton qui n'a rien fait. */
  .item:disabled{opacity:.55; cursor:default}
  .item:disabled:hover{background:transparent; color:var(--v2-txt2)}
  .item svg{width:17px; height:17px}
</style>
