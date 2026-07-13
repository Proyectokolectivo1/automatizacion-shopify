import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config } from 'dotenv';

export function loadEnvironmentFiles(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '..', '.env')];

  for (const path of candidates) {
    if (existsSync(path)) {
      config({ override: false, path, quiet: true });
      return;
    }
  }
}
