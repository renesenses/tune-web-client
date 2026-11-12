/**
 * INDEX DES RÉGLAGES, UN PAR UN — chantier rc12, renesenses/tune-web-client#2735.
 *
 * `v2Settings.ts` décrit les ONGLETS et les SECTIONS (une carte par section).
 * Ce fichier descend d'un cran : chaque réglage réel de l'écran Réglages y a
 * une entrée, avec un identifiant stable qui est AUSSI son ancre dans le DOM
 * (`data-reglage="…"`). La recherche de l'écran Réglages et celle du menu
 * avatar lisent cet index, et lui seul : une seule source, deux recherches.
 *
 * Ce que porte une entrée :
 *   - `id`        : identifiant stable = valeur de `data-reglage` à l'écran ;
 *   - `section`   : la section de `V2_SETTINGS` qui la porte (onglet déduit) ;
 *   - `labelKey`  : clé i18n du libellé affiché (à défaut, titre de la section) ;
 *   - `descKey`   : clé i18n de la ligne d'aide, quand il y en a une ;
 *   - `termesKey` : clé i18n de SYNONYMES, traduite dans chaque langue du
 *                   client (« bit-perfect, exclusif… » en français, « exclusive,
 *                   bit-perfect… » en anglais) — liste séparée par des virgules ;
 *   - `techniques`: termes techniques qui ne se traduisent pas (WASAPI, DoP,
 *                   LRCLIB…), cherchés tels quels dans toutes les langues ;
 *   - `min`       : niveau propre du réglage quand il est PLUS exigeant que sa
 *                   section (une garde `atLeast(level, …)` à l'intérieur de la
 *                   carte). Le niveau effectif est le plus haut des trois :
 *                   onglet, section, réglage.
 *   - `composant` : le fichier qui porte l'ancre quand ce n'est pas
 *                   `SettingsV2.svelte` (réglage rendu par un composant monté
 *                   dans la carte). Lu par le test d'ancrage.
 *
 * Le test `reglagesIndex2735.test.ts` vérifie, dans les deux sens, que chaque
 * entrée a son ancre dans la bonne section de l'écran et que chaque ancre de
 * l'écran a son entrée ici : aucun réglage oublié, aucune entrée morte.
 */
import { V2_SETTINGS, tabLabel, type V2SettingsSection, type V2SettingsTab, type V2SettingsTabId } from './v2Settings';
import { atLeast, levelRank, type SettingsLevel } from './uiLevel';
import { fold } from './utils';

export interface Reglage {
  id: string;
  section: string;
  labelKey?: string;
  /** Libellé littéral, réservé aux noms qui ne se traduisent pas (DSD). */
  label?: string;
  descKey?: string;
  termesKey?: string;
  techniques?: string[];
  min?: SettingsLevel;
  composant?: string;
}

/* Ordre : celui de l'écran, onglet par onglet, section par section. */
export const REGLAGES: Reglage[] = [
  // ── Général › Lecture ────────────────────────────────────────────────
  { id: 'verrou-volume', section: 'playback', labelKey: 'audiophile.lockVolume', descKey: 'audiophile.lockVolumeHelp', termesKey: 'reglages.termes.verrouVolume' },
  { id: 'boucle-defaut', section: 'playback', labelKey: 'settings.loopByDefault', descKey: 'settings.loopByDefaultHint', termesKey: 'reglages.termes.boucleParDefaut' },
  { id: 'commandes-ecran-verrouille', section: 'playback', labelKey: 'settings.controlesEcranVerrouille', descKey: 'settings.controlesEcranVerrouilleHint' },
  { id: 'recul-podcast', section: 'playback', labelKey: 'settings.podcastRewind', descKey: 'settings.podcastRewindHint', techniques: ['podcast'] },
  { id: 'file-aleatoire-max', section: 'playback', labelKey: 'settings.shuffleMaxTracks', descKey: 'settings.shuffleMaxTracksHint', termesKey: 'reglages.termes.fileAleatoireMax', techniques: ['shuffle', '500'] },
  // ── Général › Arrêt programmé (tune-server-rust#8213, web #2802) ───
  { id: 'arret-programme', section: 'scheduledStop', labelKey: 'scheduledStop.title', descKey: 'scheduledStop.hint', composant: 'ArretProgrammeV2.svelte', techniques: ['poweroff', 'shutdown', 'Tune OS'] },
  // ── Général › Interface ──────────────────────────────────────────────
  { id: 'theme', section: 'interface', labelKey: 'settings.theme', descKey: 'settings.themePalettesHint', termesKey: 'reglages.termes.theme' },
  { id: 'theme-perso', section: 'interface', labelKey: 'monTheme.titre', descKey: 'monTheme.hint' },
  { id: 'crete-metre', section: 'interface', labelKey: 'v2.set.peakMeter', descKey: 'v2.set.peakMeterHint', termesKey: 'reglages.termes.creteMetre', techniques: ['DAT', 'PCM-7030', 'IEC'] },
  { id: 'visualiseur-barre', section: 'interface', labelKey: 'v2.set.barViz', descKey: 'v2.set.barVizHint' },
  { id: 'barre-vu-metres', section: 'interface', labelKey: 'v2.set.barVu', descKey: 'v2.set.barVuHint', techniques: ['VU'] },
  { id: 'langue', section: 'interface', labelKey: 'settings.language', termesKey: 'reglages.termes.langue' },
  { id: 'ecran-demarrage', section: 'interface', labelKey: 'settings.startupView', descKey: 'v2.hint.startupView', termesKey: 'reglages.termes.ecranDemarrage' },
  { id: 'lienLectureVersSource', section: 'interface', labelKey: 'settings.nowPlayingLinkToSource', descKey: 'settings.nowPlayingLinkToSourceHint' },
  { id: 'ordre-barre', section: 'interface', labelKey: 'settings.sidebarOrder', descKey: 'settings.sidebarOrderHint', composant: 'OrdreBarreLateraleV2.svelte' },
  { id: 'zone-defaut', section: 'interface', labelKey: 'settings.defaultZone', descKey: 'v2.hint.defaultZone', termesKey: 'reglages.termes.zoneParDefaut' },
  { id: 'affichage-volume', section: 'interface', labelKey: 'settings.volumeDisplay', descKey: 'v2.hint.volumeDisplay', termesKey: 'reglages.termes.affichageVolume', techniques: ['dB', '%'], min: 'intermediate' },
  { id: 'boutons-volume', section: 'interface', labelKey: 'settings.volumeStepButtons', descKey: 'settings.volumeStepButtonsHint', min: 'intermediate' },
  { id: 'ligne-technique-album', section: 'interface', labelKey: 'settings.albumTechLine', descKey: 'settings.albumTechLineHint', techniques: ['kHz', 'bit'], min: 'expert' },
  { id: 'actions-piste-reduites', section: 'interface', labelKey: 'settings.trackActionsReduced', descKey: 'settings.trackActionsReducedHint', min: 'intermediate' },
  { id: 'infobulles', section: 'interface', labelKey: 'settings.tooltips', descKey: 'settings.tooltipsHint', termesKey: 'reglages.termes.infobulles', min: 'intermediate' },
  // ── Général › Pays d'écoute, Profils, Voix, Assistant IA ─────────────
  { id: 'pays-ecoute-radios', section: 'radiosCountry', labelKey: 'v2.radio.listeningCountry', descKey: 'v2.radio.countryHint' },
  { id: 'profils', section: 'profiles', labelKey: 'settings.tabProfiles', descKey: 'profiles.hint', composant: 'ProfilsV2.svelte' },
  { id: 'version-jouee', section: 'profiles', labelKey: 'profiles.versionRule.title', descKey: 'profiles.versionRule.hint', composant: 'ReglageVersionJouee.svelte' },
  { id: 'controle-parental', section: 'parental', labelKey: 'parental.title', composant: 'ControleParentalV2.svelte' },
  { id: 'commande-vocale', section: 'voice', labelKey: 'settings.voiceCommand', descKey: 'settings.voiceCommandHint' },
  { id: 'assistant-ia', section: 'assistantIa', labelKey: 'assistantIa.title', descKey: 'assistantIa.intro' },

  // ── Audio › Sortie locale ────────────────────────────────────────────
  { id: 'backend-audio', section: 'localAudio', labelKey: 'settings.audioBackend', descKey: 'v2.hint.audioBackend', termesKey: 'reglages.termes.backendAudio', techniques: ['ASIO', 'WASAPI', 'ALSA', 'CoreAudio', 'PipeWire', 'PulseAudio'], min: 'expert' },
  { id: 'mode-wasapi', section: 'localAudio', labelKey: 'settings.wasapiMode', descKey: 'v2.hint.wasapiMode', termesKey: 'reglages.termes.modeWasapi', techniques: ['WASAPI', 'bit-perfect'], min: 'expert' },
  { id: 'replaygain', section: 'localAudio', labelKey: 'settings.replayGain', descKey: 'settings.replayGainHint', termesKey: 'reglages.termes.replaygain', techniques: ['ReplayGain', 'EBU R128', 'LUFS'], min: 'intermediate' },
  { id: 'replaygain-preampli', section: 'localAudio', labelKey: 'settings.replayGainPreamp', descKey: 'v2.hint.replayGainPreamp', techniques: ['ReplayGain', 'dB'], min: 'expert' },
  { id: 'replaygain-anti-ecretage', section: 'localAudio', labelKey: 'settings.replayGainPreventClipping', descKey: 'v2.hint.replayGainPreventClipping', techniques: ['ReplayGain', 'clipping', 'true-peak'], min: 'expert' },
  { id: 'replaygain-source', section: 'localAudio', labelKey: 'settings.replaygainSource', descKey: 'settings.replaygainSourceTagsAnalysis', techniques: ['ReplayGain', 'tags'], min: 'intermediate' },
  { id: 'vitesse-analyses', section: 'localAudio', labelKey: 'settings.analysisSpeed', descKey: 'settings.analysisSpeedHint', termesKey: 'reglages.termes.vitesseAnalyses', techniques: ['CPU'], min: 'intermediate' },
  { id: 'lever-bridage', section: 'localAudio', labelKey: 'settings.analysisUnthrottle', descKey: 'settings.analysisUnthrottleHint', techniques: ['CPU'], min: 'expert' },
  { id: 'remesure-replaygain', section: 'localAudio', labelKey: 'settings.rgReanalyze', descKey: 'settings.rgReanalyzeHint', techniques: ['ReplayGain'], min: 'intermediate' },
  { id: 'sorties-locales-visibles', section: 'localAudio', labelKey: 'settings.audioOutputs', techniques: ['DAC', 'USB'] },
  { id: 'zone-navigateur', section: 'localAudio', labelKey: 'settings.createBrowserZone', descKey: 'settings.playHereHint' },
  // ── Audio › Appareils réseau, ignorés, Squeezebox, Sendspin ──────────
  { id: 'appareils-reseau', section: 'netDevices', labelKey: 'settings.networkDevices', techniques: ['DLNA', 'UPnP', 'AirPlay', 'Chromecast', 'PIN'] },
  { id: 'vider-appareils', section: 'netDevices', labelKey: 'settings.clearDevices' },
  { id: 'appareils-ignores', section: 'ignoredDevices', labelKey: 'settings.ignoredDevices', descKey: 'settings.ignoredDevicesIntro' },
  { id: 'squeezebox-actif', section: 'squeezebox', labelKey: 'settings.squeezeboxEnabled', descKey: 'settings.squeezeboxHint', techniques: ['Squeezebox', 'LMS', 'Lyrion'] },
  { id: 'annonce-slimproto', section: 'squeezebox', labelKey: 'settings.slimprotoAnnonce', descKey: 'settings.slimprotoAnnonceHint', techniques: ['Slimproto', 'Home Assistant'] },
  { id: 'serveur-lms', section: 'squeezebox', labelKey: 'settings.squeezeboxLmsHost', techniques: ['LMS', 'Lyrion'] },
  { id: 'lecteurs-squeezebox', section: 'squeezebox', labelKey: 'settings.squeezeboxPlayers', techniques: ['Squeezebox'] },
  { id: 'enceintes-sendspin', section: 'sendspin', labelKey: 'settings.sendspinDoNotConnect', descKey: 'settings.sendspinIntro', techniques: ['Sendspin', 'Music Assistant', 'ESPHome'] },
  // ── Audio › HQPlayer, AES67, Tune Bridge ─────────────────────────────
  { id: 'hqplayer-actif', section: 'hqplayer', labelKey: 'settings.enableHqplayer', descKey: 'settings.hqplayerHint', techniques: ['HQPlayer', 'NAA'] },
  { id: 'hqplayer-adresse', section: 'hqplayer', labelKey: 'settings.hqplayerIp', techniques: ['HQPlayer', 'IP', '4321'] },
  { id: 'hqplayer-etat', section: 'hqplayer', labelKey: 'settings.testConnection', techniques: ['HQPlayer'] },
  { id: 'aes67-experimental', section: 'aes67Experimental', labelKey: 'aes67.experimental.label', descKey: 'aes67.experimental.hint', techniques: ['AES67', 'Dante', 'Ravenna', 'RTP', 'PTP'] },
  { id: 'serveur-upnp', section: 'serveurUpnp', labelKey: 'upnpServeur.label', descKey: 'upnpServeur.hint', techniques: ['UPnP', 'DLNA'] },
  { id: 'aes67-etat', section: 'aes67', labelKey: 'aes67.title', descKey: 'aes67.intro', techniques: ['AES67', 'PTP', 'SAP', 'SDP'] },
  { id: 'acces-distant', section: 'bridge', labelKey: 'settings.remoteAccess', descKey: 'settings.remoteAccessHint', termesKey: 'reglages.termes.accesDistant', techniques: ['Tune Bridge', 'relay'] },
  { id: 'lien-distant', section: 'bridge', labelKey: 'settings.remoteLink', descKey: 'settings.remoteLinkHint', techniques: ['QR'] },
  { id: 'renouveler-lien', section: 'bridge', labelKey: 'settings.remoteLinkRenew', descKey: 'settings.remoteLinkRenewHint' },
  // ── Audio › DSD, DSP, égaliseur, diagnostic, serveurs Tune ───────────
  { id: 'dsd-reseau', section: 'dsd', labelKey: 'settings.dsdNetworkLabel', descKey: 'settings.dsdNetworkHint', termesKey: 'reglages.termes.dsdReseau', techniques: ['DSD', 'DoP', 'DSF', 'DFF'] },
  { id: 'dsp-progressif', section: 'dspProgressif', labelKey: 'settings.dspProgressifLabel', descKey: 'settings.dspProgressifHint', techniques: ['DSP', 'EQ', 'DLNA', 'WAV'] },
  { id: 'bandes-egaliseur', section: 'eqBands', labelKey: 'settings.eqBandsLabel', descKey: 'settings.eqBandsHint', techniques: ['EQ', '10', '15', '31'] },
  { id: 'diagnostic-audio', section: 'audioDiag', labelKey: 'settings.audioDiagnostic' },
  { id: 'serveurs-pairs', section: 'tuneServers', labelKey: 'settings.peerAdd', descKey: 'settings.peerAddHint' },
  { id: 'utiliser-agent', section: 'tuneServers', labelKey: 'settings.agentUseTitle', descKey: 'settings.agentUseHint' },
  { id: 'preter-sorties', section: 'tuneServers', labelKey: 'settings.agentLendTitle', descKey: 'settings.agentLendHint' },

  // ── Bibliothèque › Outils ────────────────────────────────────────────
  { id: 'analyser-bibliotheque', section: 'library', labelKey: 'settings.scanLibraryV2', descKey: 'settings.scanModesHint', termesKey: 'reglages.termes.analyserBibliotheque', techniques: ['scan', 'rescan'] },
  { id: 'bibliotheque-etendue', section: 'library', labelKey: 'settings.extendedLibrary', descKey: 'settings.extendedLibraryHint' },
  { id: 'audit-integrite', section: 'library', labelKey: 'integrity.title', descKey: 'integrity.hint' },
  { id: 'etat-import-upnp', section: 'library', labelKey: 'v2.set.upnpImportTitle', techniques: ['UPnP'] },
  { id: 'dedoublonnage-meme-racine', section: 'libraryCleanup', labelKey: 'settings.dedupSameRootOnly', descKey: 'settings.dedupSameRootOnlyHint', techniques: ['NAS'] },
  { id: 'nettoyer-bibliotheque', section: 'libraryCleanup', labelKey: 'diagnostics.cleanupServer', descKey: 'v2.maint.cleanupHint', termesKey: 'reglages.termes.nettoyerBibliotheque' },
  { id: 'vider-bibliotheque', section: 'clearLibrary', labelKey: 'settings.clearLibrary', descKey: 'settings.clearLibraryV2Hint', termesKey: 'reglages.termes.viderBibliotheque' },
  // ── Bibliothèque › Emplacements ──────────────────────────────────────
  { id: 'ajouter-dossier', section: 'musicDirs', labelKey: 'settings.addFolder', descKey: 'settings.serverPathHint', termesKey: 'reglages.termes.dossiersDeclares' },
  { id: 'ajouter-chemin', section: 'musicDirs', labelKey: 'settings.addFolderManualHint' },
  { id: 'partage-smb', section: 'musicDirs', labelKey: 'settings.addSmbShare', termesKey: 'reglages.termes.partageSmb', techniques: ['SMB', 'CIFS', 'NAS', 'Samba'] },
  { id: 'dossiers-declares', section: 'musicDirs', labelKey: 'settings.musicDirs', descKey: 'settings.directoryOrderHint', termesKey: 'reglages.termes.dossiersDeclares' },
  { id: 'analyse-fond-dossier', section: 'musicDirs', labelKey: 'settings.backgroundAnalysisFolder', descKey: 'settings.backgroundAnalysisFoldersHint', techniques: ['ReplayGain', 'CLAP'] },
  { id: 'dossiers-analyses', section: 'musicDirs', labelKey: 'settings.analysisDirsTitle', descKey: 'settings.analysisDirsHint' },
  { id: 'dossiers-exclus-enrichissement', section: 'musicDirs', labelKey: 'settings.enrichExcludedDirsTitle', descKey: 'settings.enrichExcludedDirsHint', techniques: ['MusicBrainz'] },
  { id: 'genres-clap', section: 'musicDirs', labelKey: 'settings.clapGenresTitle', descKey: 'settings.clapGenresHint', techniques: ['CLAP'] },
  { id: 'sonde-reseau', section: 'musicDirs', labelKey: 'settings.networkPollInterval', descKey: 'settings.networkPollIntervalHint', techniques: ['NAS', 'SMB'] },
  { id: 'partages-reseau', section: 'musicDirs', labelKey: 'settings.smbMountsTitle', techniques: ['SMB', 'NAS', 'SMB 1.0'] },
  // ── Bibliothèque › Options de scan, recherche, tri, planification ────
  { id: 'separer-qualites', section: 'scanOpts', labelKey: 'settings.qualitySplit', descKey: 'settings.qualitySplitHint', techniques: ['Hi-Res', 'CD'] },
  { id: 'coffrets-auto', section: 'scanOpts', labelKey: 'settings.autoBoxSets', descKey: 'settings.autoBoxSetsHint', techniques: ['box set'] },
  { id: 'importer-playlists-scan', section: 'scanOpts', labelKey: 'settings.scanImportPlaylists', descKey: 'settings.scanImportPlaylistsHint', techniques: ['M3U', 'M3U8', 'PLS', 'playlist'] },
  { id: 'retirer-playlists-scan', section: 'scanOpts', labelKey: 'settings.removeScanPlaylists', descKey: 'settings.removeScanPlaylistsHint', techniques: ['playlist'] },
  { id: 'iso-sacd', section: 'scanOpts', labelKey: 'sacdIso.title', techniques: ['SACD', 'ISO', 'DST'] },
  { id: 'recherche-exacte', section: 'searchExact', labelKey: 'settings.searchExactLabel', descKey: 'settings.searchExactHint' },
  { id: 'tri-artistes', section: 'artistSort', labelKey: 'settings.artistSortLabel', descKey: 'settings.artistSortHint', techniques: ['ARTISTSORT', 'ALBUMARTISTSORT'] },
  { id: 'analyse-demarrage', section: 'scanSched', labelKey: 'settings.scanOnStartup', descKey: 'settings.scanOnStartupHint', techniques: ['scan'] },
  { id: 'analyse-programmee', section: 'scanSched', labelKey: 'v2.lbl.autoAnalysis', descKey: 'settings.scanScheduleHint', techniques: ['scan', 'cron'] },
  { id: 'heure-analyse', section: 'scanSched', labelKey: 'v2.lbl.time', descKey: 'v2.lbl.nextAnalysisAt' },
  // ── Bibliothèque › Métadonnées, enrichissement, rangement, Oxygen ────
  { id: 'ecriture-fichiers', section: 'metadata', labelKey: 'settings.fileWrites', descKey: 'settings.fileWritesHint', termesKey: 'reglages.termes.ecritureFichiers', techniques: ['tags', 'ID3', 'Vorbis'] },
  { id: 'paroles-lrclib', section: 'metadata', labelKey: 'settings.lyricsLrclib', descKey: 'settings.lyricsLrclibHelp', termesKey: 'reglages.termes.parolesLrclib', techniques: ['LRCLIB', 'LRC', 'lyrics'] },
  { id: 'enrichir-metadonnees', section: 'enrichment', labelKey: 'settings.enrichMetadata', descKey: 'settings.enrichMetadataHint', techniques: ['MusicBrainz'] },
  { id: 'portraits-artistes', section: 'enrichment', labelKey: 'v2.lbl.artistPortraits' },
  { id: 'pochettes-manquantes', section: 'enrichment', labelKey: 'settings.searchMissingCovers', descKey: 'settings.searchMissingCoversHint' },
  { id: 'types-sortie', section: 'enrichment', labelKey: 'settings.releaseTypes', descKey: 'settings.releaseTypesHint', techniques: ['MusicBrainz', 'EP', 'single'] },
  { id: 'credits', section: 'enrichment', labelKey: 'settings.credits', descKey: 'settings.creditsHint', techniques: ['MusicBrainz'] },
  { id: 'acoustid-lancer', section: 'enrichment', labelKey: 'acoustid.launch', descKey: 'acoustid.launchHint', techniques: ['AcoustID', 'Chromaprint'] },
  { id: 'passes-metarust', section: 'enrichment', labelKey: 'v2.passes.bpmTitle', descKey: 'v2.passes.discogsTitle', techniques: ['BPM', 'Discogs', 'MetaRust'] },
  { id: 'identification-nuit', section: 'enrichment', labelKey: 'v2.nuit.title', techniques: ['MusicBrainz'] },
  { id: 'rangement-mode', section: 'ingest', labelKey: 'settings.ingestMode', descKey: 'v2.hint.ingestMode' },
  { id: 'rangement-conflit', section: 'ingest', labelKey: 'settings.ingestConflict', descKey: 'settings.ingestConflictHint' },
  { id: 'rangement-dossier-cible', section: 'ingest', labelKey: 'v2.lbl.targetFolder' },
  { id: 'rangement-modele', section: 'ingest', labelKey: 'ingest.template' },
  { id: 'rangement-ecrire-tags', section: 'ingest', labelKey: 'settings.writeTags', descKey: 'settings.writeTagsHint', techniques: ['tags'] },
  { id: 'vue-oxygen', section: 'oxygen', labelKey: 'v2.lbl.oxygenView', descKey: 'settings.facetsNavHint', techniques: ['Oxygen'] },
  { id: 'valeurs-facettes', section: 'oxygen', labelKey: 'oxygen.facetValues', descKey: 'settings.facetValuesHint', techniques: ['Oxygen'] },

  // ── Zones ────────────────────────────────────────────────────────────
  { id: 'creation-auto-zones', section: 'zoneAutoCreate', labelKey: 'settings.zoneAutoCreateLabel', descKey: 'settings.zoneAutoCreateHint' },
  { id: 'me-suivre', section: 'followMe', labelKey: 'settings.followMeLabel', descKey: 'settings.followMeHint', termesKey: 'reglages.termes.meSuivre', techniques: ['follow me'] },
  { id: 'plages-mac', section: 'macRanges', labelKey: 'settings.macRanges', descKey: 'settings.macRangesHint', techniques: ['MAC', 'OUI'] },

  // ── Appareils › Appareils, Réglages par zone ─────────────────────────
  { id: 'appareils-resume', section: 'devices', labelKey: 'settings.openZones', descKey: 'v2.set.zonesHint' },
  { id: 'zone-tune-tested', section: 'perZone', labelKey: 'v2.zone.tuneTestedPropose', techniques: ['Tune Tested'] },
  { id: 'zone-dsd', section: 'perZone', label: 'DSD', techniques: ['DSD', 'DoP', 'PCM'], min: 'intermediate' },
  { id: 'zone-debit-max', section: 'perZone', labelKey: 'settings.maxSampleRate', descKey: 'settings.maxSampleRateHint', techniques: ['kHz', 'sample rate'], min: 'intermediate' },
  { id: 'zone-decalage-paroles', section: 'perZone', labelKey: 'settings.lyricsOffset', techniques: ['lyrics'], min: 'intermediate' },
  { id: 'zone-volume-fixe', section: 'perZone', labelKey: 'v2.lbl.fixedVolume', techniques: ['100'], min: 'intermediate' },
  { id: 'zone-mono', section: 'perZone', labelKey: 'zoneConfig.monoTitle', descKey: 'zoneConfig.monoDesc', techniques: ['mono', 'downmix'], min: 'intermediate' },
  { id: 'zone-publier-upnp', section: 'perZone', labelKey: 'devices.upnpRenderer', descKey: 'devices.upnpRendererHint', techniques: ['UPnP', 'DLNA', 'MediaRenderer'], min: 'intermediate' },
  { id: 'zone-bitperfect-strict', section: 'perZone', labelKey: 'bitperfect.strictLabel', descKey: 'bitperfect.strictHelp', termesKey: 'reglages.termes.zoneBitperfectStrict', techniques: ['bit-perfect', 'PURE'], min: 'intermediate' },
  { id: 'zone-titre-radio-dlna', section: 'perZone', labelKey: 'radioDidl.label', descKey: 'radioDidl.help', techniques: ['DLNA', 'DIDL', 'ICY'], min: 'intermediate' },
  { id: 'zone-canaux', section: 'perZone', labelKey: 'zoneConfig.channelsTitle', termesKey: 'reglages.termes.zoneCanaux', techniques: ['5.1', '7.1', '2.0'] },
  { id: 'zone-gain', section: 'perZone', labelKey: 'devices.gainTrim', descKey: 'devices.gainTrimHint', termesKey: 'reglages.termes.zoneGain', techniques: ['dB', 'trim'], min: 'intermediate' },
  { id: 'zone-limites-volume', section: 'perZone', labelKey: 'devices.volumeLimitSafety', descKey: 'devices.volumeLimitHint', termesKey: 'reglages.termes.zoneLimitesVolume', min: 'intermediate' },
  { id: 'zone-correction-piece', section: 'perZone', labelKey: 'zoneConfig.firTitle', descKey: 'zoneConfig.firDesc', termesKey: 'reglages.termes.zoneCorrectionPiece', techniques: ['FIR', 'WAV', 'REW', 'Dirac', 'IR'], min: 'intermediate', composant: 'CorrectionAcoustiqueZone.svelte' },
  { id: 'zone-photo', section: 'perZone', labelKey: 'v2.zone.deviceImage', descKey: 'v2.zone.deviceImageHint', min: 'intermediate' },
  { id: 'zone-appareil', section: 'perZone', labelKey: 'zoneConfig.deviceTitle', descKey: 'zoneConfig.deviceDesc', min: 'intermediate' },
  { id: 'zone-renderer', section: 'perZone', labelKey: 'devices.rendererConfig', techniques: ['DLNA', 'OpenHome', 'WAV', 'FLAC'], min: 'intermediate' },
  // ── Appareils › Sauvegarde, Devialet AIR ─────────────────────────────
  { id: 'sauvegarde-reglages-appareils', section: 'sauvegardeReglages', labelKey: 'v2.dev.backupTitle', descKey: 'v2.dev.backupIntro', techniques: ['backup', 'JSON'] },
  { id: 'devialet-air', section: 'devialetAir', labelKey: 'v2.set.devialetAirEnable', descKey: 'v2.set.devialetAirDiscoveryHint', techniques: ['Devialet', 'AIR', 'D200', 'D400'] },
  { id: 'devialet-air-source', section: 'devialetAir', labelKey: 'v2.set.devialetAirSource', techniques: ['Devialet'] },

  // ── Affichage ────────────────────────────────────────────────────────
  { id: 'colonnes-pistes', section: 'displayPrefs', labelKey: 'settings.trackColumns', descKey: 'settings.trackColumnsHint' },
  { id: 'retablir-largeurs', section: 'displayPrefs', labelKey: 'settings.colWidthsReset', descKey: 'settings.colWidthsResetHint' },
  { id: 'retablir-ordre-colonnes', section: 'displayPrefs', labelKey: 'settings.colOrderReset', descKey: 'settings.colOrderResetHint' },
  { id: 'collections-mosaique', section: 'displayPrefs', labelKey: 'settings.collectionsMosaic', descKey: 'settings.collectionsMosaicHint' },
  { id: 'bouton-stop', section: 'displayPrefs', labelKey: 'settings.showStopButton', descKey: 'settings.showStopButtonHint', techniques: ['stop'] },
  { id: 'minuteur-sommeil', section: 'displayPrefs', labelKey: 'settings.showSleepTimer', descKey: 'settings.showSleepTimerHint', termesKey: 'reglages.termes.minuteurSommeil', techniques: ['sleep'] },
  { id: 'sources-barre', section: 'displayPrefs', labelKey: 'settings.sidebarSources', descKey: 'settings.sidebarSourcesHint', termesKey: 'reglages.termes.sourcesBarre' },
  { id: 'ordre-autres-versions', section: 'displayPrefs', labelKey: 'settings.versionsOrder', descKey: 'settings.versionsOrderHint', techniques: ['Qobuz', 'Bandcamp'] },
  { id: 'cadence-animations', section: 'displayPrefs', labelKey: 'settings.animationRate', descKey: 'settings.animationRateHint', techniques: ['CPU', 'GPU', 'fps'] },
  { id: 'ouvrir-file-defilement', section: 'displayPrefs', labelKey: 'settings.openQueueOnScroll', descKey: 'settings.openQueueOnScrollHint' },
  { id: 'disposition-file', section: 'displayPrefs', labelKey: 'settings.queuePlacement', descKey: 'settings.queuePlacementHint', termesKey: 'reglages.termes.dispositionFile' },
  // ── Affichage › Accueil : suggestions écartées (web#916) ─────────────
  { id: 'suggestions-ecartees', section: 'dismissedSuggestions', labelKey: 'v2.dismiss.settingsTitle', descKey: 'v2.dismiss.settingsIntro', composant: 'SuggestionsEcarteesV2.svelte' },

  // ── Extensions ───────────────────────────────────────────────────────
  { id: 'extensions', section: 'plugins', labelKey: 'settings.tabExtensions', techniques: ['plugins'] },

  // ── Accès et jetons ──────────────────────────────────────────────────
  { id: 'services-streaming', section: 'streaming', labelKey: 'settings.streaming', techniques: ['Qobuz', 'TIDAL', 'Deezer', 'Spotify', 'Bandcamp', 'ARL'] },
  { id: 'youtube-lecture', section: 'streaming', labelKey: 'settings.youtubePlaybackTitle', descKey: 'settings.youtubePlaybackHelp', techniques: ['YouTube', 'yt-dlp'] },
  { id: 'youtube-pays-tendances', section: 'streaming', labelKey: 'settings.youtubeChartsCountryTitle', descKey: 'settings.youtubeChartsCountryHelp', techniques: ['YouTube'] },
  { id: 'jetons-services', section: 'tokens', techniques: ['MusicBrainz', 'Discogs', 'Last.fm', 'Genius', 'ListenBrainz', 'token'] },
  { id: 'acoustid-cle', section: 'tokens', labelKey: 'acoustid.keyLabel', descKey: 'acoustid.keyHint', techniques: ['AcoustID'] },
  { id: 'scrobble-lastfm', section: 'tokens', labelKey: 'serviceTokens.connectLastfm', techniques: ['Last.fm', 'scrobble'] },
  { id: 'cles-api-personnelles', section: 'apiKeys', labelKey: 'v2.apiKeys.title', descKey: 'v2.apiKeys.intro', techniques: ['AcoustID', 'Discogs', 'API'] },
  { id: 'spotify-recepteur', section: 'spotify', labelKey: 'settings.enableReceiver', descKey: 'v2.hint.spotifyConnect', termesKey: 'reglages.termes.spotifyRecepteur', techniques: ['Spotify Connect'] },
  { id: 'spotify-zone-exposee', section: 'spotify', labelKey: 'settings.exposedZone', descKey: 'settings.spotifyReceiverHint', techniques: ['Spotify'] },
  { id: 'spotify-nom', section: 'spotify', labelKey: 'v2.lbl.displayName', descKey: 'settings.blankForDefaultName', techniques: ['Spotify'] },
  { id: 'spotify-lecture-experimentale', section: 'spotify', labelKey: 'v2.set.spotifyPlaybackExperimental', descKey: 'v2.set.spotifyPlaybackWarning', techniques: ['Spotify'] },
  { id: 'adresses-acces', section: 'accessFrom', labelKey: 'settings.accessFromDevice', descKey: 'v2.hint.lanAddresses', techniques: ['URL', 'IP', 'LAN'] },

  // ── Système ──────────────────────────────────────────────────────────
  { id: 'version-mises-a-jour', section: 'about', labelKey: 'settings.updates', termesKey: 'reglages.termes.versionMisesAJour', techniques: ['update', 'version'] },
  { id: 'nouveautes', section: 'about', labelKey: 'whatsnew.title', techniques: ['changelog', 'release notes'] },
  { id: 'doc-api', section: 'about', labelKey: 'settings.apiDocs', techniques: ['API', 'REST'], min: 'expert' },
  { id: 'actions-serveur', section: 'health', labelKey: 'settings.restartServer', techniques: ['restart', 'reboot'] },
  // tune-server-rust#8213 : redémarrer la MACHINE (appliance Tune OS seulement).
  { id: 'redemarrer-machine', section: 'health', labelKey: 'diagnostics.reboot', descKey: 'diagnostics.confirmReboot', techniques: ['reboot', 'Tune OS'] },
  { id: 'journaux-diagnostic', section: 'health', labelKey: 'settings.downloadLogs', descKey: 'settings.downloadDiagTitle', techniques: ['logs'] },
  { id: 'niveau-journaux', section: 'health', labelKey: 'settings.logLevel', descKey: 'v2.maint.logLevelHint', techniques: ['debug', 'trace', 'info', 'warn', 'logs'], min: 'expert' },
  { id: 'renvoi-nettoyage', section: 'health', labelKey: 'diagnostics.cleanupServer', descKey: 'settings.cleanupMovedHint' },
  { id: 'effacer-rapport-analyse', section: 'health', labelKey: 'v2.maint.clearScanReport', descKey: 'v2.maint.clearScanReportHint' },
  { id: 'wifi', section: 'wifi', labelKey: 'settings.applianceWifi', techniques: ['Wi-Fi', 'WiFi', 'WLAN', 'SSID', 'Tune OS'] },
  { id: 'notifications-push', section: 'push', labelKey: 'v2.lbl.notifications', descKey: 'v2.set.pushHint', techniques: ['push'] },
  { id: 'compte-mozaiklabs', section: 'cloud', labelKey: 'settings.signIn', descKey: 'settings.cloudScopeHint', termesKey: 'reglages.termes.compteMozaiklabs', techniques: ['Mozaiklabs', 'SSO'] },
  { id: 'ecoutes-cloud', section: 'cloud', labelKey: 'settings.cloudListens', descKey: 'settings.cloudListensHint' },
  { id: 'partage-communaute', section: 'cloud', labelKey: 'settings.communityShare', descKey: 'settings.communityShareHint' },
  { id: 'mesures-recevoir', section: 'cloud', labelKey: 'settings.communityMeasuresReceive', descKey: 'settings.communityMeasuresReceiveHint' },
  { id: 'mesures-contribuer', section: 'cloud', labelKey: 'settings.communityMeasuresContribute', descKey: 'settings.communityMeasuresContributeHint' },
  { id: 'telemetrie', section: 'cloud', labelKey: 'settings.telemetry', descKey: 'settings.telemetryHint', termesKey: 'reglages.termes.telemetrie', techniques: ['telemetry'] },
  { id: 'synchro-communautaire', section: 'cloud', labelKey: 'settings.communitySync', descKey: 'settings.communitySyncHint' },
  { id: 'contribution-communautaire', section: 'cloud', labelKey: 'settings.communityContribution' },
  { id: 'sauvegarde-cloud', section: 'backup', labelKey: 'cloudBackup.title', descKey: 'cloudBackup.intro', techniques: ['backup', 'snapshot'], composant: 'SauvegardeCloudV2.svelte' },
  { id: 'sauvegardes-base', section: 'database', labelKey: 'maintenance.backupRestore', techniques: ['SQLite', 'backup'] },
  { id: 'export-import-base', section: 'database', labelKey: 'settings.exportDatabase', techniques: ['SQLite', '.db'] },
  { id: 'index-recherche', section: 'database', labelKey: 'settings.searchIndex', descKey: 'settings.rebuildIndexHint', techniques: ['FTS', 'index'] },
  { id: 'migration-postgres', section: 'database', labelKey: 'settings.migrateToPostgres', descKey: 'v2.db.migrateHint', techniques: ['PostgreSQL', 'Postgres', 'SQLite'] },
  { id: 'emplacement-donnees', section: 'dataLoc', labelKey: 'settings.dataLocation', descKey: 'settings.dataLocationHint' },
  { id: 'installer-tune-os', section: 'dataLoc', labelKey: 'settings.installTitle', descKey: 'settings.installHint', techniques: ['Tune OS'] },
  { id: 'import-autre-lecteur', section: 'import', labelKey: 'import.title', techniques: ['Roon', 'Plex'] },
  { id: 'config-export-restauration', section: 'config', labelKey: 'settings.exportConfig', descKey: 'settings.configBackupHint', techniques: ['JSON', 'backup'] },
  { id: 'export-csv', section: 'exportCsv', labelKey: 'settings.exportCsv', descKey: 'v2.hint.csvExport', techniques: ['CSV'] },

  // ── CLAP ─────────────────────────────────────────────────────────────
  { id: 'analyse-acoustique', section: 'clap', labelKey: 'settings.acousticAnalysis', descKey: 'settings.acousticAnalysisHelp', techniques: ['CLAP'] },
  { id: 'cadence-analyse-acoustique', section: 'clap', labelKey: 'acoustic.throttle', descKey: 'v2.hint.analysisCost', techniques: ['CLAP', 'CPU'] },

  // ── Licence ──────────────────────────────────────────────────────────
  { id: 'licence-activer', section: 'license', labelKey: 'settings.activateLicense', descKey: 'settings.licenceKeyByEmail', termesKey: 'reglages.termes.licenceActiver', techniques: ['Premium'] },
  { id: 'licence-revalider', section: 'license', labelKey: 'settings.validate', techniques: ['Premium'] },
  { id: 'licence-liberer', section: 'license', labelKey: 'settings.releaseLicense', descKey: 'settings.releaseLicenseHint', techniques: ['Premium'] },
  { id: 'licence-compte', section: 'license', labelKey: 'settings.licenseOpenAccount', descKey: 'settings.licenseFindByAccount', techniques: ['Premium', 'Mozaiklabs'] },
];

// ── Résolution : onglet, section, niveau ─────────────────────────────────

interface Lieu { tab: V2SettingsTab; section: V2SettingsSection }

const LIEUX = new Map<string, Lieu>();
for (const tab of V2_SETTINGS) for (const section of tab.sections) LIEUX.set(section.id, { tab, section });

/** Onglet et section qui portent un réglage. Une section inconnue est une erreur de l'index. */
export function lieuDuReglage(r: Reglage): Lieu {
  const l = LIEUX.get(r.section);
  if (!l) throw new Error(`reglagesIndex : section inconnue « ${r.section} » (réglage ${r.id})`);
  return l;
}

function plusExigeant(a: SettingsLevel, b: SettingsLevel): SettingsLevel {
  return levelRank(a) >= levelRank(b) ? a : b;
}

/** Niveau à partir duquel le réglage est VISIBLE : le plus haut de l'onglet, de la section et du réglage. */
export function niveauDuReglage(r: Reglage): SettingsLevel {
  const { tab, section } = lieuDuReglage(r);
  return plusExigeant(plusExigeant(tab.min, section.min), r.min ?? 'beginner');
}

/** Le réglage est-il masqué au niveau d'interface `courant` ? */
export function masqueAuNiveau(r: Reglage, courant: SettingsLevel): boolean {
  return !atLeast(courant, niveauDuReglage(r));
}

export function reglageParId(id: string): Reglage | undefined {
  return REGLAGES.find((r) => r.id === id);
}

// ── Recherche tolérante ──────────────────────────────────────────────────

/** Minuscules, sans accents, ponctuation réduite à des espaces. */
export function normaliser(s: string | null | undefined): string {
  return fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Écritures sans espaces entre les mots : un seul caractère y a un sens. */
const IDEOGRAMMES = /[⺀-鿿가-힯぀-ヿ]/;

/**
 * Distance d'édition de Damerau (transpositions comprises), bornée : au-delà
 * de `max`, on rend `max + 1` sans finir le calcul.
 */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length;
  let avant = new Array<number>(m + 1).fill(0);
  let prec = Array.from({ length: m + 1 }, (_, j) => j);
  let cour = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    cour[0] = i;
    let minLigne = cour[0];
    for (let j = 1; j <= m; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, avant[j - 2] + 1);
      cour[j] = v;
      if (v < minLigne) minLigne = v;
    }
    if (minLigne > max) return max + 1;
    [avant, prec, cour] = [prec, cour, avant];
  }
  return prec[m];
}

/**
 * Qualité de la correspondance d'UN mot tapé avec un texte : 1 mot exact,
 * 0,9 début de mot (préfixe), 0,7 contenu, 0,5 / 0,4 petite faute de frappe
 * (une erreur dès 4 lettres, deux dès 8), 0 rien.
 */
export function correspondance(mot: string, texte: string, mots: string[]): number {
  return correspondanceStricte(mot, texte, mots) || correspondanceFloue(mot, mots);
}

/** Mot exact, début de mot ou contenu : sans calcul de distance. */
function correspondanceStricte(mot: string, texte: string, mots: string[]): number {
  if (!mot || !texte) return 0;
  let meilleur = 0;
  for (const m of mots) {
    if (m === mot) return 1;
    if (m.startsWith(mot)) meilleur = 0.9;
  }
  if (meilleur) return meilleur;
  return texte.includes(mot) ? 0.7 : 0;
}

/** Petite faute de frappe : seulement quand rien d'autre n'a trouvé (le calcul coûte). */
function correspondanceFloue(mot: string, mots: string[]): number {
  if (mot.length < 4) return 0;
  let meilleur = 0;
  const tolerance = mot.length >= 8 ? 2 : 1;
  for (const m of mots) {
    if (m.length < 3) continue;
    // Le mot entier avec une faute, ou le début du mot avec une faute
    // (« equaliz » doit trouver « equalizer » malgré la coquille).
    const d = Math.min(distance(mot, m, tolerance), distance(mot, m.slice(0, mot.length), tolerance));
    if (d <= tolerance) meilleur = Math.max(meilleur, d === 1 ? 0.5 : 0.4);
  }
  return meilleur;
}

/** Poids des champs : un mot trouvé dans le libellé vaut plus qu'un mot trouvé dans l'aide. */
const POIDS = { libelle: 10, termes: 8, techniques: 8, section: 5, description: 4, motsSection: 3, onglet: 2 } as const;

interface Champ { poids: number; texte: string; mots: string[] }

/**
 * Les textes normalisés sont gardés : la recherche tourne à chaque frappe, sur
 * les mêmes libellés. Clé = texte brut ; borné, pour qu'un changement de
 * langue ne fasse pas grossir le cache sans fin.
 */
const NORMALISES = new Map<string, { texte: string; mots: string[] }>();
function champ(poids: number, brut: string): Champ {
  let n = NORMALISES.get(brut);
  if (!n) {
    const texte = normaliser(brut);
    n = { texte, mots: texte ? texte.split(' ') : [] };
    if (NORMALISES.size > 20_000) NORMALISES.clear();
    NORMALISES.set(brut, n);
  }
  return { poids, ...n };
}

export interface ReglageHit {
  reglage: Reglage;
  tab: V2SettingsTab;
  section: V2SettingsSection;
  /** Libellé du réglage, dans la langue de l'interface. */
  label: string;
  /** Onglet › section › réglage, chacun traduit. */
  chemin: string[];
  niveau: SettingsLevel;
  score: number;
}

/** Libellé affiché d'un réglage : son libellé propre, à défaut le titre de sa section. */
export function libelleDuReglage(r: Reglage, resolve: (key: string) => string): string {
  if (r.labelKey) return resolve(r.labelKey);
  if (r.label) return r.label;
  const { section } = lieuDuReglage(r);
  return section.titleKey ? resolve(section.titleKey) : (section.title ?? section.id);
}

export function cheminDuReglage(r: Reglage, resolve: (key: string) => string): string[] {
  const { tab, section } = lieuDuReglage(r);
  const titreSection = section.titleKey ? resolve(section.titleKey) : (section.title ?? section.id);
  const label = libelleDuReglage(r, resolve);
  const chemin = [tabLabel(tab, resolve)];
  // Une section qui porte le nom de son onglet (Licence, Extensions, CLAP) ne
  // se répète pas dans le chemin ; un réglage qui porte le nom de sa section non plus.
  if (normaliser(titreSection) !== normaliser(chemin[0])) chemin.push(titreSection);
  if (normaliser(label) !== normaliser(chemin[chemin.length - 1])) chemin.push(label);
  return chemin;
}

/** Une clé non traduite revient telle quelle de `resolve` : ce n'est pas un texte à chercher. */
function texteDe(cle: string | undefined, resolve: (key: string) => string): string {
  if (!cle) return '';
  const v = resolve(cle);
  return v === cle ? '' : v;
}

/** Retire les gabarits `{n}` d'une phrase d'aide : on ne cherche pas « n ». */
function sansGabarits(s: string): string {
  return s.replace(/\{[^}]*\}/g, ' ');
}

/**
 * Cherche un réglage. Chaque mot tapé doit trouver une correspondance (ET),
 * dans le libellé, les synonymes, les termes techniques, l'aide, la section ou
 * l'onglet — sans tenir compte des accents ni de la casse, en acceptant les
 * débuts de mots et une petite faute de frappe. Les réglages masqués par le
 * niveau sont RENDUS aussi : c'est à l'appelant de le dire, pas de les taire.
 */
export function searchReglages(
  query: string,
  resolve: (key: string) => string,
  limit = 30,
): ReglageHit[] {
  const q = normaliser(query);
  const mots = q ? q.split(' ') : [];
  if (!mots.length || (q.replace(/ /g, '').length < 2 && !IDEOGRAMMES.test(q))) return [];

  const prepares = REGLAGES.map((r, rang) => {
    const { tab, section } = lieuDuReglage(r);
    const label = libelleDuReglage(r, resolve);
    const titreSection = section.titleKey ? resolve(section.titleKey) : (section.title ?? section.id);
    const champs: Champ[] = [
      champ(POIDS.libelle, label),
      champ(POIDS.termes, texteDe(r.termesKey, resolve).replace(/,/g, ' ')),
      champ(POIDS.techniques, (r.techniques ?? []).join(' ')),
      champ(POIDS.description, sansGabarits(texteDe(r.descKey, resolve))),
      champ(POIDS.section, titreSection),
      champ(POIDS.motsSection, (section.keywords ?? []).join(' ')),
      champ(POIDS.onglet, tabLabel(tab, resolve)),
    ];
    const stricts = mots.map((mot) => Math.max(...champs.map((c) => c.poids * correspondanceStricte(mot, c.texte, c.mots))));
    return { r, rang, tab, section, label, champs, stricts };
  });
  // La faute de frappe ne se cherche que pour un mot qu'AUCUN réglage ne
  // contient tel quel : « vol » trouve « volume » sans détour, « egalisuer »
  // ne trouve rien et passe au calcul de distance — qui coûte, d'où la règle.
  const flou = mots.map((_, i) => !prepares.some((p) => p.stricts[i] > 0));

  const resultats: { p: (typeof prepares)[number]; score: number }[] = [];
  for (const p of prepares) {
    let score = 0;
    let ecarte = false;
    mots.forEach((mot, i) => {
      if (ecarte) return;
      let meilleur = p.stricts[i];
      if (meilleur === 0 && flou[i]) meilleur = Math.max(...p.champs.map((c) => c.poids * correspondanceFloue(mot, c.mots)));
      if (meilleur === 0) ecarte = true; // un mot sans correspondance écarte le réglage
      score += meilleur;
    });
    if (ecarte) continue;
    // La saisie entière au début du libellé : c'est presque sûrement lui.
    if (normaliser(p.label).startsWith(q)) score += 5;
    // À score égal, l'ordre de l'écran départage.
    resultats.push({ p, score: score - p.rang / 10_000 });
  }
  resultats.sort((a, b) => b.score - a.score);
  return resultats.slice(0, limit).map(({ p, score }) => ({
    reglage: p.r, tab: p.tab, section: p.section, label: p.label,
    chemin: cheminDuReglage(p.r, resolve), niveau: niveauDuReglage(p.r), score,
  }));
}

/** L'onglet qui porte un réglage (cible de navigation). */
export function ongletDuReglage(r: Reglage): V2SettingsTabId {
  return lieuDuReglage(r).tab.id;
}
