import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  champsJours,
  EN_SEMAINE,
  joursDepuisListe,
  joursDuReveil,
  masqueDepuisJours,
} from '../joursReveil';

/**
 * 🔴 #5669 / fil forum 2111 — un réveil « en semaine » sonnait tous les jours.
 *
 * L'écran n'envoyait que `days`, compté 0 = dimanche. Le serveur pose alors
 * `days_of_week = 1111111`, que le planificateur lit en priorité, et compte
 * 0 = lundi. Convention unique désormais : celle du serveur.
 */
const ecran = readFileSync(resolve(__dirname, '../../components/v2/AlarmesV2.svelte'), 'utf-8');

const SAMEDI = 5;
const DIMANCHE = 6;

describe('jours d’un réveil — convention du serveur (0 = lundi)', () => {
  it('« en semaine » part avec un masque qui exclut samedi et dimanche', () => {
    const c = champsJours(EN_SEMAINE);
    expect(c.days_of_week).toBe('1111100');
    expect(c.days).toBe('0,1,2,3,4');
    const lus = joursDuReveil(c);
    expect(lus).not.toContain(SAMEDI);
    expect(lus).not.toContain(DIMANCHE);
  });

  it('dimanche est 6, lundi est 0', () => {
    expect(masqueDepuisJours([DIMANCHE])).toBe('0000001');
    expect(masqueDepuisJours([0])).toBe('1000000');
  });

  it('lit le masque d’abord, comme le planificateur', () => {
    // Réveil créé avant le correctif : `days` dit « en semaine » (0 = dim.),
    // le masque dit « tous les jours ». Il SONNE tous les jours : on l'affiche.
    expect(joursDuReveil({ days: '1,2,3,4,5', days_of_week: '1111111' })).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(joursDuReveil({ days: '0,1,2,3,4', days_of_week: null })).toEqual(EN_SEMAINE);
    expect(joursDepuisListe('')).toEqual([]);
    expect(joursDepuisListe('9,1,1,x')).toEqual([1]);
  });

  it('aucun jour coché : un masque vide, pas « tous les jours »', () => {
    expect(champsJours([])).toEqual({ days: '', days_of_week: '0000000' });
  });
});

describe('AlarmesV2 — l’écran suit cette convention', () => {
  it('envoie le masque avec les jours', () => {
    const bloc = ecran.slice(ecran.indexOf('function corps('));
    const corps = bloc.slice(0, bloc.indexOf('\n  }'));
    expect(corps).toContain('...champsJours(');
    expect(corps).not.toMatch(/days:\s*r\.days\s*\?\?/);
  });

  it('un compte gratuit peut enregistrer : aucun champ resté Premium dans le corps', () => {
    // Bertrand, 03/10/2026 : « Jours et montée gratuits ». Côté serveur, seul
    // le multi-zone (et le nombre de réveils) reste Premium : l'écran ne doit
    // pas l'envoyer, sinon un compte gratuit reçoit 402 sur un réveil simple.
    const bloc = ecran.slice(ecran.indexOf('function corps('));
    const corps = bloc.slice(0, bloc.indexOf('\n  }'));
    expect(corps).not.toContain('multi_zone_ids');
    expect(ecran).not.toMatch(/premium/i);
  });

  it('les boutons des jours commencent au lundi', () => {
    const bloc = ecran.slice(ecran.indexOf('const joursCourts'));
    const liste = bloc.slice(0, bloc.indexOf(']);'));
    const ordre = [...liste.matchAll(/alarms\.day(\w{3})/g)].map((m) => m[1]);
    expect(ordre).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('affiche et édite les jours lus comme le planificateur', () => {
    expect(ecran).toContain('fJours = joursDuReveil(r)');
    expect(ecran).toContain('{libelleJours(r)}');
    expect(ecran).not.toContain("r.days.split(',')");
  });
});
