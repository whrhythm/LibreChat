export function storageSize(bytes: number): string {
  for (const [unit, scale] of [
    ['GiB', 1073741824],
    ['MiB', 1048576],
    ['KiB', 1024],
  ] as const) {
    if (bytes >= scale) return `${(bytes / scale).toFixed(1)} ${unit}`;
  }
  return `${bytes} B`;
}
