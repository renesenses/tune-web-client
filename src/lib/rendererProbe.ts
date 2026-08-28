export function rendererProbeErrorKey(reason?: string): string {
  switch (reason) {
    case 'renderer_offline':
      return 'renderer.probeOffline';
    case 'empty_sink':
      return 'renderer.probeEmptySink';
    case 'soap_failed':
      return 'renderer.probeSoapFailed';
    default:
      return 'renderer.probeFailed';
  }
}
