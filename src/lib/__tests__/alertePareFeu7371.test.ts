// tune-server-rust#7371 — l'écran des zones dit quand le pare-feu de Windows
// filtre Tune sur le réseau actif.
//
// TEAC NT-505X (fil VNAV) : seul AirPlay est proposé, le renderer UPnP n'est
// jamais découvert. La règle « Tune » de l'installeur ne couvre que le profil
// Privé ; le testeur ne pouvait pas passer son réseau en Privé. Le serveur
// relève le profil actif au démarrage (`GET /api/v1/system/pare-feu`).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alertePareFeu } from '../alertePareFeu';
import fr from '../locales/fr';
import en from '../locales/en';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

// Ce que rend le serveur pour le testeur : réseau Public, règle Privé.
const PUBLIC_HORS_REGLE = {
  windows: true,
  alerte: true,
  releve: {
    profils_actifs: ['public'],
    regle_presente: true,
    profils_couverts: ['prive'],
    profils_non_couverts: ['public'],
  },
};

describe('alertePareFeu — la charge utile du serveur', () => {
  it('🔴 réseau Public hors de la règle : alerte, profil nommé', () => {
    expect(alertePareFeu(PUBLIC_HORS_REGLE)).toEqual({ profils: ['public'], reglePresente: true });
  });

  it('réseau couvert, hors Windows, relevé absent, serveur ancien : rien', () => {
    expect(alertePareFeu({ ...PUBLIC_HORS_REGLE, alerte: false })).toBeNull();
    expect(alertePareFeu({ windows: false, alerte: false, releve: null })).toBeNull();
    expect(alertePareFeu({ windows: true, alerte: true, releve: null })).toBeNull();
    expect(alertePareFeu(null)).toBeNull();
    expect(alertePareFeu('<!doctype html>')).toBeNull();
  });

  it('les profils inconnus sont ignorés, l’ordre est fixe', () => {
    const charge = {
      ...PUBLIC_HORS_REGLE,
      releve: { profils_non_couverts: ['public', 'martien', 'domaine'], regle_presente: false },
    };
    expect(alertePareFeu(charge)).toEqual({ profils: ['domaine', 'public'], reglePresente: false });
  });
});

describe('le bandeau est branché et dit la marche à suivre', () => {
  it('🔴 l’écran des zones monte le bandeau', () => {
    const zones = sansCommentaires(lire('src/components/v2/ZonesV2.svelte'));
    expect(zones).toContain("import AlertePareFeu from './AlertePareFeu.svelte'");
    expect(zones).toMatch(/\n\s*<AlertePareFeu\s*\/>/);
  });

  it('le bandeau lit la route du serveur', () => {
    const bandeau = sansCommentaires(lire('src/components/v2/AlertePareFeu.svelte'));
    expect(bandeau).toContain("apiFetch('/system/pare-feu')");
    expect(bandeau).toContain('alertePareFeu(charge)');
  });

  it('les deux remèdes sont dits : réseau Privé, ou autoriser Tune', () => {
    expect(fr['pareFeu.etapePrive']).toMatch(/Privé/);
    expect(fr['pareFeu.etapeAutoriser']).toMatch(/tune-server\.exe/);
    expect(en['pareFeu.etapePrive']).toMatch(/Private/);
    expect(en['pareFeu.corps']).toContain('{profils}');
  });
});
