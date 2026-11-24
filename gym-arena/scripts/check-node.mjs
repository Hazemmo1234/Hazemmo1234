/**
 * Node.js version guard for the operator commands (npm run staging:* / prod:*). package.json runs
 * it first: `node scripts/check-node.mjs && node --env-file=… --import tsx scripts/…`.
 *
 * Plain JavaScript, no flags, only Node's own modules, so it runs, and explains, on any Node.js
 * version. Without it an old Node.js fails with an unclear message: `--env-file` needs 20.6,
 * `util.parseEnv` (staging-env.ts) needs 20.12, and the Supabase client the commands use
 * (@supabase/supabase-js) declares Node.js 22 or newer.
 *
 * Minimum: Node.js 22. Recommended: the current Node.js 22 LTS release.
 */
import { pathToFileURL } from "node:url";

export const MINIMUM_MAJOR = 22;

/** null when this Node.js version (e.g. "22.11.0" or "v22.11.0") can run the commands, else the message to show. */
export function nodeVersionProblem(version) {
  const match = /^v?(\d+)\.\d+\.\d+/.exec(String(version));
  if (match && Number(match[1]) >= MINIMUM_MAJOR) return null;
  const shown = match ? `v${String(version).replace(/^v/, "")}` : `"${version}"`;
  return [
    `Node.js ${shown} is not supported by the Gym Arena operator commands: they need Node.js ${MINIMUM_MAJOR} or newer.`,
    `Install the current Node.js ${MINIMUM_MAJOR} LTS from https://nodejs.org, open a new terminal, check \`node --version\`, and run the command again.`,
    "Nothing was read or changed.",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problem = nodeVersionProblem(process.versions.node);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
}
