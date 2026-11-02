// The fleet's shared versions: discord.js and undici are exact pins, as in Mite, and Node is set by engines.
import { readFileSync } from 'node:fs';

const FLEET = ['discord.js', 'undici'];
const EXACT = /^\d+\.\d+\.\d+$/;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const problems = [];
if (!pkg.engines?.node) problems.push('no engines.node');
for (const name of FLEET) {
  const range = pkg.dependencies?.[name] ?? pkg.overrides?.[name];
  if (!range || !EXACT.test(range)) problems.push(`${name} is "${range ?? 'missing'}", must be an exact pin`);
}

if (problems.length) {
  console.error(`version-pin check failed:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`version-pin check passed (${FLEET.join(', ')})`);
