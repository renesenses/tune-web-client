/**
 * Backend audio : le sélecteur suit la plateforme du SERVEUR (#1268).
 *
 * Lapinou sous Debian, puis Benjithom sous Fedora en 0.9.94, se sont vu
 * proposer « WASAPI » et « ASIO » — deux technologies Windows — parce que les
 * trois `<option>` étaient écrites en dur dans `SettingsView`.
 *
 * Le serveur publie la liste vraie dans `GET /system/config`
 * (`supported_audio_backends`), verrouillée de son côté par
 * `les_backends_audio_proposes_suivent_la_plateforme_du_serveur`
 * (tune-server/tests/integration.rs). Ici on vérifie les deux moitiés du
 * contrat :
 *
 *  - la lecture de cette liste (module pur) ;
 *  - l'ABSENCE des options en dur dans le composant — c'est la moitié qui
 *    devient rouge si quelqu'un les réécrit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  backendPersiste,
  backendSelectionne,
  choixDeBackend,
  libelleBackend,
  modeWasapiPertinent,
} from '../audioBackends';
import { en as enBrut, fr as frBrut } from '../locales';

const fr = frBrut as Record<string, string>;
const en = enBrut as Record<string, string>;
const traduire = (dict: Record<string, string>) => (key: string) => dict[key] ?? fr[key] ?? key;

/** Les listes que le serveur publie réellement, par plateforme. */
const LINUX = [{ value: 'auto', label: 'Auto (ALSA)' }];
const MACOS = [{ value: 'auto', label: 'Auto (CoreAudio)' }];
const WINDOWS_ASIO = [
  { value: 'auto', label: 'Auto (WASAPI)' },
  { value: 'wasapi', label: 'WASAPI' },
  { value: 'asio', label: 'ASIO (bit-perfect)' },
];
const WINDOWS_SANS_ASIO = [
  { value: 'auto', label: 'Auto (WASAPI)' },
  { value: 'wasapi', label: 'WASAPI' },
];

describe('la liste vient du serveur', () => {
  it('Debian : rien de Windows n’est proposé', () => {
    const choix = choixDeBackend({ supported_audio_backends: LINUX, local_audio_backend: 'auto' });

    expect(choix.map((c) => c.value)).toEqual(['auto']);
    expect(choix.map((c) => c.value)).not.toContain('wasapi');
    expect(choix.map((c) => c.value)).not.toContain('asio');
  });

  it('macOS : un seul choix, CoreAudio', () => {
    expect(choixDeBackend({ supported_audio_backends: MACOS })).toEqual(MACOS);
  });

  it('Windows avec ASIO : les trois choix, dans l’ordre du serveur', () => {
    const choix = choixDeBackend({ supported_audio_backends: WINDOWS_ASIO });
    expect(choix.map((c) => c.value)).toEqual(['auto', 'wasapi', 'asio']);
  });

  it('Windows sans ASIO : ASIO n’est pas proposé', () => {
    const choix = choixDeBackend({ supported_audio_backends: WINDOWS_SANS_ASIO });
    expect(choix.map((c) => c.value)).toEqual(['auto', 'wasapi']);
  });

  it('build sans sortie locale : aucun choix, l’écran masque le réglage', () => {
    expect(choixDeBackend({ supported_audio_backends: [] })).toEqual([]);
  });

  it('une entrée malformée est ignorée, elle ne devient pas une option vide', () => {
    const choix = choixDeBackend({
      supported_audio_backends: [{ value: 'auto', label: 'Auto (ALSA)' }, null, { label: 'ASIO' }, 'asio'],
    });
    expect(choix).toEqual(LINUX);
  });
});

describe('serveur antérieur à #1268 : le champ est absent', () => {
  it('on ne rétablit pas Auto/WASAPI/ASIO en dur — c’était le défaut', () => {
    const choix = choixDeBackend({ local_audio_backend: 'auto' });

    expect(choix.map((c) => c.value)).toEqual(['auto']);
    expect(choix.map((c) => c.value)).not.toContain('wasapi');
    expect(choix.map((c) => c.value)).not.toContain('asio');
  });

  it('un réglage déjà persisté reste visible et réversible', () => {
    const choix = choixDeBackend({ local_audio_backend: 'asio' });

    expect(choix.map((c) => c.value)).toEqual(['auto', 'asio']);
    expect(backendSelectionne({ local_audio_backend: 'asio' }, choix)).toBe('asio');
  });
});

describe('valeur retenue', () => {
  it('sans champ, le repli est « auto » et non « wasapi »', () => {
    // Le repli en dur était `wasapi` : tout serveur muet affichait « WASAPI ».
    expect(backendPersiste({})).toBe('auto');
    expect(backendPersiste({ local_audio_backend: '' })).toBe('auto');
  });

  it('l’ancien nom `audio_backend` est encore lu', () => {
    expect(backendPersiste({ audio_backend: 'ASIO' })).toBe('asio');
  });

  it('une valeur Windows persistée sur Linux sélectionne « auto », pas du vide', () => {
    // Bibliothèque migrée d'une machine Windows : le serveur ramène déjà la
    // RÉPONSE à `auto`, mais l'écran ne doit pas dépendre de ce nettoyage.
    const config = { supported_audio_backends: LINUX, local_audio_backend: 'wasapi' };
    expect(backendSelectionne(config, choixDeBackend(config))).toBe('auto');
  });
});

describe('libellés', () => {
  it('« Auto » se traduit, la parenthèse est un nom propre et reste', () => {
    expect(libelleBackend(LINUX[0], traduire(fr))).toBe(`${fr['settings.autoDefault']} (ALSA)`);
    expect(libelleBackend(MACOS[0], traduire(en))).toBe(`${en['settings.autoDefault']} (CoreAudio)`);
  });

  it('les autres libellés sont rendus tels quels', () => {
    expect(libelleBackend({ value: 'asio', label: 'ASIO (bit-perfect)' }, traduire(fr))).toBe(
      'ASIO (bit-perfect)',
    );
  });
});

describe('sous-réglage « Mode WASAPI »', () => {
  it('ne s’affiche pas là où WASAPI n’existe pas', () => {
    expect(modeWasapiPertinent(LINUX, 'wasapi')).toBe(false);
    expect(modeWasapiPertinent(MACOS, 'auto')).toBe(false);
  });

  it('s’affiche sous Windows quand WASAPI est sélectionné', () => {
    expect(modeWasapiPertinent(WINDOWS_ASIO, 'wasapi')).toBe(true);
    expect(modeWasapiPertinent(WINDOWS_ASIO, 'asio')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// La contre-épreuve : le composant ne doit plus écrire ses choix.
// Ce bloc est ROUGE sur `main` avant le correctif.
// ---------------------------------------------------------------------------

const settings = readFileSync(resolve(__dirname, '../../components/SettingsView.svelte'), 'utf-8');

describe('SettingsView n’écrit plus la liste en dur', () => {
  it('aucune option WASAPI ou ASIO codée dans le gabarit', () => {
    expect(settings).not.toContain('<option value="wasapi">');
    expect(settings).not.toContain('<option value="asio">');
  });

  it('le sélecteur boucle sur la liste du serveur', () => {
    expect(settings).toContain('choixBackends');
    expect(settings).toContain('libelleBackend');
  });

  it('le repli « wasapi » de la valeur retenue a disparu', () => {
    expect(settings).not.toContain("data.audio_backend ?? data.local_audio_backend ?? 'wasapi'");
  });

  it('le libellé « Mode WASAPI » n’est plus du texte en dur', () => {
    expect(settings).not.toContain('>Mode WASAPI<');
  });
});
