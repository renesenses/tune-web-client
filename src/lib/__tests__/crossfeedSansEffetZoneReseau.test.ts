import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { indisponibiliteCrossfeed, cleIndisponibiliteCrossfeed } from '../crossfeed';
import type { CrossfeedStatus } from '../api';
import * as LOCALES from '../locales';

/**
 * #2742 — le crossfeed n'a AUCUN chemin sur une zone réseau, et l'écran le dit.
 *
 * Tades, 03/09/2026, Tune 0.9.132 sous Linux : « même quand je mets des
 * réglages caricaturaux ma différence ne me saute pas aux oreilles ». Son
 * diagnostic tranche — 31 zones, pas une seule sortie locale
 * (`kernel_sound_cards=0`), la zone testée est un renderer DLNA, et le serveur
 * a journalisé six fois en quatre minutes :
 *
 *     WARN zone_crossfeed_sans_effet zone_id=29 requested=true
 *          reason="non_local_output"
 *
 * Le serveur savait, et il l'a dit. L'écran, lui, affichait « Prendra effet à
 * la piste suivante » — sur une zone où il ne prendra JAMAIS effet. C'est ce
 * mensonge rassurant qui fait recommencer six fois.
 *
 * Ce que ce garde tient :
 *   1. le verdict vient du serveur (`crossfeed_status.unavailable`), qui prime
 *      sur tout ce que le client croit savoir — il couvre le mode PURE, que le
 *      client ne voit pas ;
 *   2. à défaut du champ (serveur antérieur), le type de sortie tranche ;
 *   3. les trois écrans lisent ce champ, verrouillent le contrôle, et
 *      n'annoncent plus « la piste suivante » là où la contrainte est
 *      structurelle ;
 *   4. la raison est traduite dans les onze langues.
 */

const statut = (o: Partial<CrossfeedStatus>): CrossfeedStatus => ({
  requested: false,
  effective: false,
  unavailable: false,
  reason: null,
  detail: null,
  ...o,
});

describe('#2742 — le verdict d’indisponibilité du crossfeed', () => {
  it('le champ serveur fait foi, même case décochée', () => {
    // `unavailable` ne répond pas « le réglage a-t-il changé ? » mais « ce
    // réglage a-t-il encore un sens ici ? ». Il se lève donc à `requested:false`.
    expect(
      indisponibiliteCrossfeed(
        statut({ unavailable: true, reason: 'non_local_output' }),
        'local',
      ),
    ).toEqual({ indisponible: true, motif: 'non_local_output' });
  });

  it('le champ serveur prime sur le type de sortie, dans les deux sens', () => {
    // Mode PURE sur une sortie LOCALE : le client ne peut pas le deviner.
    expect(
      indisponibiliteCrossfeed(statut({ unavailable: true, reason: 'pure_mode' }), 'local'),
    ).toEqual({ indisponible: true, motif: 'pure_mode' });
    // Et l'inverse : un serveur qui dit « disponible » n'est pas contredit.
    expect(indisponibiliteCrossfeed(statut({ unavailable: false }), 'dlna')).toEqual({
      indisponible: false,
      motif: null,
    });
  });

  it('sans le champ, le type de sortie tranche', () => {
    // Serveur antérieur à la 0.9.132, ou `PUT` dont le corps ne portait pas de
    // `crossfeed` : le serveur rend alors `crossfeed_status: null`.
    for (const sortie of ['dlna', 'airplay', 'airplay2', 'chromecast', 'openhome']) {
      expect(indisponibiliteCrossfeed(null, sortie), sortie).toEqual({
        indisponible: true,
        motif: 'non_local_output',
      });
    }
    expect(indisponibiliteCrossfeed(null, 'local')).toEqual({ indisponible: false, motif: null });
  });

  it('un type de sortie inconnu n’affirme rien', () => {
    // Verrouiller un contrôle qui marche est pire que se taire.
    expect(indisponibiliteCrossfeed(null, null)).toEqual({ indisponible: false, motif: null });
    expect(indisponibiliteCrossfeed(undefined, undefined)).toEqual({
      indisponible: false,
      motif: null,
    });
  });

  it('chaque motif a sa clé, et un motif inconnu ne casse pas l’écran', () => {
    expect(cleIndisponibiliteCrossfeed('non_local_output')).toBe('dsp.crossfeedUnavailableNetwork');
    expect(cleIndisponibiliteCrossfeed('pure_mode')).toBe('dsp.crossfeedUnavailablePure');
    // LAT-F1 — une zone réseau peut désormais entendre le crossfeed, via le
    // flux traité au fil de l'eau. Deux motifs distincts, et non deux façons
    // de dire non : l'opt-in est un réglage que l'utilisateur change, le LPCM
    // du lecteur ne se négocie pas. Les confondre l'enverrait modifier un
    // réglage déjà bon.
    expect(cleIndisponibiliteCrossfeed('network_progressive_off')).toBe(
      'dsp.crossfeedUnavailableProgressiveOff',
    );
    expect(cleIndisponibiliteCrossfeed('network_renderer_no_lpcm')).toBe(
      'dsp.crossfeedUnavailableNoLpcm',
    );
    // Une contrainte ajoutée côté serveur ne doit pas afficher son code brut.
    expect(cleIndisponibiliteCrossfeed('contrainte_future')).toBe('dsp.crossfeedUnavailable');
  });

  it('les cinq clés existent dans les onze langues du dépôt', async () => {
    // La porte i18n vérifie qu'aucune langue ne DIVERGE des autres ; elle ne
    // dit pas qu'une clé rendue par ce module existe quelque part. Une faute
    // de frappe dans le `switch` ci-dessus donnerait donc une porte verte et
    // un écran qui affiche `dsp.crossfeedUnavailableNoLcpm` en toutes lettres.
    const CLES = [
      'dsp.crossfeedUnavailableNetwork',
      'dsp.crossfeedUnavailablePure',
      'dsp.crossfeedUnavailableProgressiveOff',
      'dsp.crossfeedUnavailableNoLpcm',
      'dsp.crossfeedUnavailable',
    ];
    const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
    for (const langue of LANGUES) {
      const source = readFileSync(
        resolve(__dirname, `../locales/${langue}.ts`),
        'utf-8',
      );
      for (const cle of CLES) {
        expect(source, `${langue}.ts ne porte pas ${cle}`).toContain(`"${cle}"`);
      }
    }
  });
});

describe('#2742 — les trois écrans lisent le verdict et verrouillent', () => {
  const ECRANS = [
    { nom: 'NowPlaying.svelte', chemin: '../../components/NowPlaying.svelte', garde: 'cfIndispo' },
    { nom: 'EqualizerView.svelte', chemin: '../../components/EqualizerView.svelte', garde: 'cfIndispo' },
    { nom: 'v2/CrossfeedV2.svelte', chemin: '../../components/v2/CrossfeedV2.svelte', garde: 'indispo' },
  ] as const;

  for (const { nom, chemin, garde } of ECRANS) {
    const source = readFileSync(resolve(__dirname, chemin), 'utf-8');

    it(`${nom} lit crossfeed_status et en tire le verdict`, () => {
      expect(source, 'le champ du serveur n’est lu nulle part').toContain('crossfeed_status');
      expect(source).toContain('indisponibiliteCrossfeed(');
    });

    it(`${nom} verrouille le contrôle quand le crossfeed n’a aucun chemin`, () => {
      expect(
        source.includes(`disabled={${garde}.indisponible}`),
        'la bascule reste actionnable : l’écran laisse croire à un réglage qui agit',
      ).toBe(true);
      expect(
        source.includes(`${garde}.indisponible}`),
        'les curseurs ne suivent pas la contrainte',
      ).toBe(true);
    });

    it(`${nom} écrit la raison au lieu de se taire`, () => {
      expect(source).toContain('cleIndisponibiliteCrossfeed(');
    });

    it(`${nom} ne promet plus « la piste suivante » sur une contrainte structurelle`, () => {
      // Le cœur du défaut : `crossfeed_applied_live` vaut `false` sur TOUTE
      // zone réseau (`refresh_zone_crossfeed` sort à la première garde). Lu
      // sans condition, il fait dire « bientôt » là où le serveur a dit
      // « jamais ».
      if (nom === 'NowPlaying.svelte') {
        // Branche exclusive : l'indisponibilité passe AVANT, en `{#if}`.
        expect(source).toContain('{#if cfIndispo.indisponible}');
        expect(source).toContain('{:else if cfPorteeLive === false}');
        expect(
          source.includes('{#if cfPorteeLive === false}'),
          'la note « piste suivante » est redevenue inconditionnelle',
        ).toBe(false);
      } else {
        const appel = nom === 'v2/CrossfeedV2.svelte'
          ? 'reportReach(res?.crossfeed_applied_live)'
          : 'signalerPortee(res?.crossfeed_applied_live)';
        expect(source).toContain(`if (!${garde}.indisponible) ${appel}`);
        // Contre-épreuve du test : l'appel doit exister, sinon la ligne
        // ci-dessus passerait pour vraie dans un écran qui ne le fait plus.
        expect(source.split(appel).length - 1).toBe(1);
      }
    });
  }
});

describe('#2742 — la raison est traduite dans les onze langues', () => {
  const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'hu', 'ja', 'ko', 'ro', 'sv', 'zh'] as const;
  const CLES = [
    'dsp.crossfeedUnavailableNetwork',
    'dsp.crossfeedUnavailablePure',
    'dsp.crossfeedUnavailable',
  ];

  it('les trois clés existent partout et ne sont pas vides', () => {
    const manquantes: string[] = [];
    for (const l of LANGUES) {
      const d = (LOCALES as Record<string, Record<string, string>>)[l];
      for (const k of CLES) {
        if (typeof d?.[k] !== 'string' || d[k].trim().length === 0) manquantes.push(`${l} → ${k}`);
      }
    }
    expect(manquantes, 'clé(s) absente(s) :\n  ' + manquantes.join('\n  ')).toEqual([]);
  });

  it('le français dit ce que le ticket demande : sans effet, et pourquoi', () => {
    const fr = (LOCALES as Record<string, Record<string, string>>).fr;
    expect(fr['dsp.crossfeedUnavailableNetwork']).toContain('Sans effet sur cette zone');
    expect(fr['dsp.crossfeedUnavailableNetwork']).toContain('sortie réseau');
  });
});
