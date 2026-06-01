import { spawnSync } from 'node:child_process';

const VALID_RELEASE_TYPES = new Set([
  'major',
  'minor',
  'patch',
  'premajor',
  'preminor',
  'prepatch',
  'prerelease',
]);

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const release = args.find((arg) => !arg.startsWith('--')) ?? 'patch';
const preid = readOptionValue(args, '--preid');

if (!isValidRelease(release)) {
  console.error(
    `Invalid release "${release}". Use patch, minor, major, prerelease or an exact version.`,
  );
  process.exit(1);
}

ensureCleanWorkingTree();

run('npm', ['run', 'lint']);
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'test']);
run('npm', ['run', 'build']);

const versionArgs = ['version', release];

if (preid) {
  versionArgs.push('--preid', preid);
}

run('npm', versionArgs);
run('npm', ['publish', '--access', 'public']);
run('git', ['push', '--follow-tags']);

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureCleanWorkingTree() {
  const result = spawnSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (result.stdout.trim().length > 0) {
    console.error('The working tree must be clean before deploying.');
    console.error('Commit or stash your changes, then run npm run deploy again.');
    process.exit(1);
  }
}

function readOptionValue(values, optionName) {
  const optionIndex = values.indexOf(optionName);

  if (optionIndex === -1) {
    return undefined;
  }

  return values[optionIndex + 1];
}

function isValidRelease(value) {
  return VALID_RELEASE_TYPES.has(value) || /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function printHelp() {
  console.log(`Usage:
  npm run deploy
  npm run deploy -- patch
  npm run deploy -- minor
  npm run deploy -- major
  npm run deploy -- 1.2.3
  npm run deploy -- prerelease --preid beta

The default release type is patch.
The deploy script validates the project, bumps the npm version, publishes the package and pushes the git commit/tag.`);
}
