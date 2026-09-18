import { BASE, fetchJSON } from './_client';

/** Tool discovery only: neither disc ripping nor successful ISO extraction. */
export async function sacdIsoAvailable(): Promise<boolean> {
  const data = await fetchJSON<unknown>(BASE + '/sacd-rip/iso-status');
  if (typeof data !== 'object' || data === null) throw new Error('Invalid SACD ISO status');
  const status = data as Record<string, unknown>;
  if (typeof status.available !== 'boolean' ||
      status.tool !== (status.available ? 'sacd_extract' : 'none')) {
    throw new Error('Invalid SACD ISO status');
  }
  return status.available;
}
