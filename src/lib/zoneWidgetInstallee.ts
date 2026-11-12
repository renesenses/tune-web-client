// tune-server-rust#8531 — le branchement réel de `zoneWidget.ts`, séparé pour
// que ses témoins ne chargent pas les magasins.
import { brancherSignalZone, estHoteWidget } from './zoneWidget';
import { currentZone } from './stores/zones';

export function installerSignalZoneWidget(): () => void {
  if (typeof window === 'undefined' || !estHoteWidget(window.location?.search)) return () => {};
  return brancherSignalZone(currentZone, (adresse) => window.location.assign(adresse));
}
