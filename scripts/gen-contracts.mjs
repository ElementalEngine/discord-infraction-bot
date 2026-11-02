// Regenerates src/api/contract.ts from the vendored core-api spec, offline.
// --check regenerates in memory and fails on any diff; --vendor copies the spec first.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = join(root, 'contracts/openapi.json');
const provenance = join(root, 'contracts/PROVENANCE');
const out = join(root, 'src/api/contract.ts');
const CORE = '/opt/development/apps/core-api-backend';

const git = (...args) => execFileSync('git', ['-C', CORE, ...args], { encoding: 'utf8' }).trim();

// The spec and the SHA it came from are stamped together, so PROVENANCE never names a spec it did not copy.
if (process.argv.includes('--vendor')) {
  if (!existsSync(CORE)) {
    console.error(`no core-api checkout at ${CORE}`);
    process.exit(1);
  }
  const dirty = git('status', '--porcelain');
  if (dirty) {
    console.error(`core-api is not clean:\n${dirty}`);
    process.exit(1);
  }
  copyFileSync(join(CORE, 'openapi.json'), spec);
  const sha = git('rev-parse', '--short', 'HEAD');
  const note = readFileSync(provenance, 'utf8')
    .split('\n')
    .filter((line) => !/^source-(repo|sha|date):/.test(line))
    .join('\n')
    .replace(/^\n+/, '');
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(provenance, `source-repo: ElementalEngine/core-api-backend\nsource-sha: ${sha}\nsource-date: ${date}\n\n${note}`);
  console.log(`vendored core-api ${sha}`);
}

const banner = '// GENERATED - DO NOT EDIT.\n// Regenerate with: npm run gen:contracts\n// Source: contracts/openapi.json (see contracts/PROVENANCE)\n';
const generated = banner + execFileSync('npx', ['openapi-typescript', spec], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== generated) {
    console.error('contracts are stale: run `npm run gen:contracts` and commit the result.');
    process.exit(1);
  }
  console.log('contracts up to date');
} else {
  writeFileSync(out, generated);
  console.log(`wrote ${out}`);
}
