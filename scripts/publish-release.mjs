import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const inputRoot = resolve(process.env.RELEASE_INPUT_ROOT || join(root, 'build/release-input'));
const outputRoot = join(root, 'build/release-assets');
const repository = process.env.RELEASE_REPOSITORY;
const sourceCommit = process.env.RELEASE_SOURCE_COMMIT;
const runId = process.env.RELEASE_RUN_ID;
if (!repository || !sourceCommit || !runId) throw new Error('Missing GitHub release environment.');

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function oneFile(directory, predicate, description) {
  const matches = filesUnder(directory).filter(path => predicate(basename(path)));
  if (matches.length !== 1) throw new Error(`Expected one ${description}; found ${matches.length}.`);
  return matches[0];
}

function readManifest(directory) {
  const path = oneFile(directory, name => name === 'build-manifest.json' || name === 'build-manifest-linux.json', 'platform build manifest');
  return { path, value: JSON.parse(readFileSync(path, 'utf8')) };
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function verifyManifest(directory, expectedTarget) {
  const manifest = readManifest(directory);
  const value = manifest.value;
  const version = value.sourceVersion ?? value.desktopVersion;
  if (!version || !value.builtFromCommit) throw new Error(`Manifest lacks version or source commit: ${manifest.path}`);
  if (value.builtFromCommit !== sourceCommit) throw new Error(`${expectedTarget} was built from ${value.builtFromCommit}, expected ${sourceCommit}.`);
  if (value.target && value.target !== expectedTarget) throw new Error(`${expectedTarget} artifact has target ${value.target}.`);
  for (const artifact of value.artifacts ?? []) {
    const file = oneFile(directory, name => name === basename(artifact.name), artifact.name);
    const size = statSync(file).size;
    const digest = sha256(file);
    if (size !== artifact.bytes || digest !== artifact.sha256.toLowerCase()) throw new Error(`Manifest verification failed for ${artifact.name}.`);
  }
  return { ...manifest, version };
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
const linux = verifyManifest(join(inputRoot, 'linux'), 'linux-x64');
const windows = verifyManifest(join(inputRoot, 'windows'), 'windows-x64');
const arm64 = verifyManifest(join(inputRoot, 'macos-arm64'), 'darwin-arm64');
const intel = verifyManifest(join(inputRoot, 'macos-x64'), 'darwin-x64');
const versions = new Set([linux.version, windows.version, arm64.version, intel.version]);
if (versions.size !== 1) throw new Error(`Platform versions do not match: ${[...versions].join(', ')}`);
const fullVersion = linux.version;
if (!/^v\d+\.\d+\.\d+\+\d{6}[0-9a-z]$/i.test(fullVersion)) throw new Error(`Invalid connected version: ${fullVersion}`);
const productVersion = fullVersion.slice(1).split('+')[0];
const tag = fullVersion;
const assets = [];

function add(source, publicName) {
  const destination = join(outputRoot, publicName);
  copyFileSync(source, destination);
  assets.push(destination);
  return destination;
}

function addManifest(manifest, publicName) {
  add(manifest.path, publicName);
}

function addChecksums(names, publicName) {
  const lines = names.map(name => {
    const file = join(outputRoot, name);
    return `${sha256(file)}  ${name}`;
  }).sort().join('\n') + '\n';
  const path = join(outputRoot, publicName);
  writeFileSync(path, lines);
  assets.push(path);
}

const winArtifact = (suffix, publicName) => {
  const record = windows.value.artifacts?.find(item => item.name.endsWith(suffix));
  if (!record) throw new Error(`Windows manifest is missing ${suffix}.`);
  const source = oneFile(join(inputRoot, 'windows'), name => name === basename(record.name), record.name);
  return add(source, publicName);
};
const winPortable = `Moderado-IDE-win32-x64-${productVersion}-portable.zip`;
const winSetup = `Moderado-IDE-win32-x64-${productVersion}-Setup.exe`;
const winUserSetup = `Moderado-IDE-win32-x64-${productVersion}-User-Setup.exe`;
winArtifact(`Moderado IDE-win32-x64-${productVersion}.zip`, winPortable);
winArtifact(`Moderado IDESetup-x64-${productVersion}.exe`, winSetup);
winArtifact(`Moderado IDEUserSetup-x64-${productVersion}.exe`, winUserSetup);
addManifest(windows, 'build-manifest-windows-x64.json');
for (const name of ['provenance.json', 'release-verification.json', 'THIRD-PARTY-NOTICES.md']) {
  const source = oneFile(join(inputRoot, 'windows'), candidate => candidate === name, name);
  add(source, name);
}

function publishMac(directory, manifest, arch, checksumName, manifestName) {
  const names = [];
  for (const record of manifest.value.artifacts ?? []) {
    const name = basename(record.name);
    const source = oneFile(directory, candidate => candidate === name, name);
    add(source, name);
    names.push(name);
  }
  if (names.length !== 2 || !names.some(name => name.endsWith('.dmg')) || !names.some(name => name.endsWith('.zip'))) {
    throw new Error(`Expected exactly a DMG and ZIP for macOS ${arch}.`);
  }
  addManifest(manifest, manifestName);
  addChecksums(names, checksumName);
}
publishMac(join(inputRoot, 'macos-arm64'), arm64, 'arm64', 'SHA256SUMS', 'build-manifest-macos-arm64.json');
publishMac(join(inputRoot, 'macos-x64'), intel, 'x64', 'SHA256SUMS-macos-x64', 'build-manifest-macos-x64.json');

const deb = oneFile(join(inputRoot, 'linux'), name => name.endsWith('.deb'), 'Linux DEB');
const rpm = oneFile(join(inputRoot, 'linux'), name => name.endsWith('.rpm'), 'Linux RPM');
const debName = `moderado-ide-${fullVersion.slice(1)}.amd64.deb`;
const rpmName = `moderado-ide-${fullVersion.slice(1)}.x86_64.rpm`;
add(deb, debName);
add(rpm, rpmName);
addManifest(linux, 'build-manifest-linux-x64.json');
addChecksums([debName, rpmName], 'SHA256SUMS-linux-x64');

const releaseNotes = join(outputRoot, 'release-notes.md');
writeFileSync(releaseNotes, [
  `Moderado IDE ${productVersion} is the first release with the Gateway Dev/Prod endpoint selector, provider catalog refinements, and a refreshed About page.`,
  '',
  '### Included',
  '- Switch the Moderado Gateway between its development and production endpoints in API Config.',
  '- Improve provider labels and OrcaRouter free-model identification.',
  '- Add a clearer About card with product information and copyright.',
  '- Publish Windows x64, Linux x64, macOS Apple Silicon (arm64), and macOS Intel (x64) packages.',
  '',
  '### Installation notes',
  '- Windows installers are unsigned.',
  '- Linux packages are unsigned; native Linux installation has not been verified.',
  '- macOS packages are ad-hoc signed and are not Developer ID signed or notarized.',
  '- The IDE does not currently have an automatic update channel.',
  '',
  `Build evidence: [GitHub Actions run ${runId}](https://github.com/${repository}/actions/runs/${runId}).`,
  '',
  `Build source: \`${sourceCommit}\` (${fullVersion}).`,
].join('\n') + '\n');

if (process.argv.includes('--prepare-only')) {
  for (const path of assets) console.log(`${basename(path)}\t${statSync(path).size}\t${sha256(path)}`);
  console.log(`Prepared ${assets.length} release assets for ${tag}; publication skipped.`);
  process.exit(0);
}

const release = execFileSync('gh', ['release', 'create', tag, ...assets, '--target', sourceCommit,
  '--title', `Moderado IDE v${productVersion}`, '--notes-file', releaseNotes], { cwd: root, encoding: 'utf8' });
process.stdout.write(release);
const api = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/releases/tags/${encodeURIComponent(tag)}`], { cwd: root, encoding: 'utf8' }));
const remote = new Map((api.assets ?? []).map(asset => [asset.name, asset]));
for (const path of assets) {
  const name = basename(path);
  const uploaded = remote.get(name);
  if (!uploaded) throw new Error(`Release is missing uploaded asset ${name}.`);
  const expectedDigest = `sha256:${sha256(path)}`;
  if (uploaded.digest && uploaded.digest !== expectedDigest) throw new Error(`GitHub digest mismatch for ${name}.`);
}
if (api.draft || api.prerelease) throw new Error('The resulting release is not a stable published release.');
console.log(`Published and verified ${assets.length} assets in ${api.html_url}`);
