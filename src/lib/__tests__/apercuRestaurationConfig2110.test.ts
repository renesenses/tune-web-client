/**
 * Fil forum 2110 (ticket 221) — la restauration de configuration montre ce
 * qu'elle va changer AVANT d'appliquer, zones comprises.
 *
 * Le serveur rend l'aperçu sur `POST /system/config/import/preview` sans rien
 * écrire. Trois choses sont tenues ici :
 *
 * 1. `lireApercu` lit la forme réelle de la réponse, et REJETTE ce qui n'en est
 *    pas une : un serveur antérieur répond 404 avec un corps quelconque, et
 *    l'écran doit dire « pas d'aperçu », jamais « rien ne change ».
 * 2. L'écran demande l'aperçu dès le fichier lu, par le chemin DÉDIÉ — pas par
 *    `?dry_run=true`, qu'un serveur antérieur ignorerait en appliquant
 *    l'import sur-le-champ.
 * 3. Les nouvelles phrases existent dans les onze langues.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  lireApercu,
  compterReglages,
  compterZones,
  rienNeChange,
  reglagesQuiChangent,
  cleStatutZone,
  remplir,
} from '../apercuRestauration';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

/** La réponse telle que `tune_core::config_export::rapport` la produit. */
const REPONSE = {
  dry_run: true,
  format_version: 2,
  settings: { added: ['language'], modified: ['theme'], unchanged: ['server_name', 'api_port'] },
  zones: [
    { name: 'Salon', output_device_id: 'dlna:uuid:salon', status: 'added', offline: true, hidden: false, changes: [] },
    { name: 'Cuisine', output_device_id: 'airplay:cuisine', status: 'modified', offline: false, hidden: false, changes: ['dsd_mode', 'zone_{id}_crossfeed'] },
    { name: 'Bureau', output_device_id: null, status: 'unchanged', offline: false, hidden: true, changes: [] },
  ],
  warnings: ['setting \'default_zone_id\' refers to a zone that is not in the file; skipped'],
};

describe('lireApercu — la réponse du serveur', () => {
  it('lit réglages, zones et avertissements', () => {
    const a = lireApercu(REPONSE)!;
    expect(a).not.toBeNull();
    expect(a.formatVersion).toBe(2);
    expect(compterReglages(a)).toEqual({ added: 1, modified: 1, unchanged: 2 });
    expect(compterZones(a)).toEqual({ added: 1, modified: 1, unchanged: 1 });
    expect(a.zones[0]).toMatchObject({ name: 'Salon', offline: true, outputDeviceId: 'dlna:uuid:salon' });
    expect(a.zones[2]).toMatchObject({ hidden: true, outputDeviceId: null });
    expect(a.avertissements).toHaveLength(1);
    expect(reglagesQuiChangent(a)).toEqual(['language', 'theme']);
    expect(rienNeChange(a)).toBe(false);
  });

  it('un fichier ancien (sans zones) se lit aussi', () => {
    const a = lireApercu({
      format_version: 1,
      settings: { added: [], modified: ['theme'], unchanged: [] },
      zones: [],
      warnings: [],
    })!;
    expect(a).not.toBeNull();
    expect(a.zones).toEqual([]);
    expect(rienNeChange(a)).toBe(false);
  });

  it('« rien ne change » seulement quand rien n’est ajouté ni modifié', () => {
    const a = lireApercu({
      format_version: 2,
      settings: { added: [], modified: [], unchanged: ['theme'] },
      zones: [{ name: 'Salon', status: 'unchanged' }],
    })!;
    expect(rienNeChange(a)).toBe(true);
  });

  it('🔴 rejette ce qui n’est pas un aperçu — serveur antérieur, page HTML, erreur', () => {
    // Un serveur sans aperçu répond 404 : son corps ne doit JAMAIS passer pour
    // un aperçu vide, sans quoi l'écran annoncerait « rien ne change » et
    // masquerait la confirmation.
    for (const r of [
      undefined,
      null,
      '<!doctype html><html></html>',
      { error: 'not_found', message: 'Not Found' },
      { imported: 3 },
      { format_version: 2, settings: { added: [] }, zones: [] },
      { format_version: 2, settings: { added: [], modified: [], unchanged: [] } },
      { format_version: 2, settings: { added: [], modified: [], unchanged: [] }, zones: [{ name: 'x', status: 'gone' }] },
    ]) {
      expect(lireApercu(r), JSON.stringify(r)).toBeNull();
    }
  });

  it('remplit les compteurs et nomme le statut de chaque zone', () => {
    expect(remplir('{added}+{modified}={unchanged}', { added: 1, modified: 2, unchanged: 3 })).toBe('1+2=3');
    expect(cleStatutZone('added')).toBe('settings.restorePreviewZoneAdded');
    expect(cleStatutZone('modified')).toBe('settings.restorePreviewZoneModified');
    expect(cleStatutZone('unchanged')).toBe('settings.restorePreviewZoneUnchanged');
  });
});

/** Le source sans ses commentaires : sinon la documentation satisfait le garde. */
function code(chemin: string): string {
  return readFileSync(resolve(process.cwd(), chemin), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('Réglages — l’aperçu précède la confirmation', () => {
  it('l’API passe par le chemin dédié, jamais par ?dry_run=true', () => {
    const api = code('src/lib/api.ts');
    expect(api).toContain('/system/config/import/preview');
    expect(api.includes('dry_run=true'), 'un serveur antérieur APPLIQUERAIT l’import').toBe(false);
  });

  it('l’écran demande l’aperçu dès le fichier lu, avant la saisie du mot', () => {
    const src = code('src/components/v2/SettingsV2.svelte');
    const appel = src.indexOf('api.previewImportConfig(');
    expect(appel, "l'aperçu n'est plus demandé").toBeGreaterThan(-1);
    const choix = src.indexOf('async function rstChoisi');
    const corpsDuChoix = src.slice(choix, src.indexOf('function rstAnnuler', choix));
    expect(corpsDuChoix, 'le choix du fichier ne lance plus l’aperçu').toContain('rstApercevoir()');
    // La saisie du mot n'apparaît qu'une fois l'aperçu prêt (ou indisponible) :
    // pendant le chargement, on ne fait pas confirmer à l'aveugle.
    const saisie = src.indexOf('bind:value={rstTyped}');
    const garde = src.lastIndexOf("{#if rstApercuEtat === 'indisponible' || (rstApercuEtat === 'pret'", saisie);
    expect(garde, 'la saisie du mot n’est plus conditionnée à l’aperçu').toBeGreaterThan(-1);
    expect(src.slice(garde, saisie)).not.toContain('{/if}');
  });
});

describe('les phrases de l’aperçu existent dans les onze langues', () => {
  const DICTS: Record<string, Record<string, string>> = {
    fr, en, de, es, it: it_, ja, ko, ro, sv, zh, hu,
  } as any;
  const CLES = [
    'settings.restorePreviewTitle',
    'settings.restorePreviewLoading',
    'settings.restorePreviewUnavailable',
    'settings.restorePreviewSettings',
    'settings.restorePreviewZones',
    'settings.restorePreviewZoneAdded',
    'settings.restorePreviewZoneModified',
    'settings.restorePreviewZoneUnchanged',
    'settings.restorePreviewOffline',
    'settings.restorePreviewHidden',
    'settings.restorePreviewNothing',
    'settings.restorePreviewDetails',
    'settings.restorePreviewWarnings',
  ];
  it('chaque clé est traduite, et les compteurs gardent leurs trois jetons', () => {
    const manques: string[] = [];
    for (const [l, d] of Object.entries(DICTS)) {
      for (const k of CLES) {
        if (typeof d[k] !== 'string' || !d[k].trim()) manques.push(`${l}.${k}`);
      }
      for (const k of ['settings.restorePreviewSettings', 'settings.restorePreviewZones']) {
        for (const jeton of ['{added}', '{modified}', '{unchanged}']) {
          if (!d[k]?.includes(jeton)) manques.push(`${l}.${k} sans ${jeton}`);
        }
      }
    }
    expect(manques).toEqual([]);
  });
});
