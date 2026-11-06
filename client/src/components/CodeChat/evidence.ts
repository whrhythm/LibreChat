import type { ProgrammingEvent } from 'librechat-data-provider';

/** Tool evidence is partial: shell edits are not a complete file diff, and exit 0 is not acceptance. */
export function executionEvidence(events: ProgrammingEvent[]) {
  const files = new Map<string, string>();
  const commands = { succeeded: 0, failed: 0, unknown: 0 };
  for (const event of events) {
    if (event.kind === 'file' && event.path && ['write', 'mkdir'].includes(event.operation ?? ''))
      files.set(event.path, event.operation!);
    if (event.kind === 'terminal') {
      if (event.exit_code === 0) commands.succeeded++;
      else if (event.exit_code == null) commands.unknown++;
      else commands.failed++;
    }
  }
  return { files: [...files.keys()], commands };
}
