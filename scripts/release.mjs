#!/usr/bin/env node
/* eslint-disable no-console */
//
// Single-source-of-truth release tool.
//
// Every place the app's version lives — package.json, src-tauri/Cargo.toml,
// src-tauri/tauri.conf.json, src-tauri/Cargo.lock and the git tag — is
// updated by this script. Both the local "I want to ship" workflow and the
// CI pipeline call the same code paths, so the two can never drift.
//
// USAGE
//   pnpm release current               # print the current version
//   pnpm release patch|minor|major     # bump and ship
//   pnpm release 1.2.3                 # ship an explicit version
//   pnpm release sync 1.2.3            # used by CI: just rewrite manifests
//   pnpm release verify 1.2.3          # used by CI: assert manifests match
//
// FLAGS (apply to the bump/version flow only)
//   --dry-run          Print every change but don't touch files, git, or remote.
//   --no-tag           Write the manifests but don't commit/tag/push.
//   --no-push          Commit and tag locally but don't push to the remote.
//   --allow-dirty      Skip the "working tree must be clean" check.
//   --skip-cargo-lock  Don't run `cargo update` to refresh Cargo.lock.
//   --remote <name>    Git remote to push to (default: origin).
//
// EXIT CODES
//   0  success
//   1  any failure (clean-tree / invalid version / git error / etc.)
//
// SAFETY GUARANTEES
//   - Validates the target version against strict semver before doing anything.
//   - Refuses to run if the working tree has uncommitted changes
//     (unless --allow-dirty).
//   - Refuses to overwrite an existing local tag.
//   - Manifest writes are idempotent: re-running with the same version is a no-op
//     so CI's defensive `sync` step is safe even when the contributor already
//     bumped manifests locally.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PATHS = {
  pkg: resolve(ROOT, "package.json"),
  tauri: resolve(ROOT, "src-tauri/tauri.conf.json"),
  cargo: resolve(ROOT, "src-tauri/Cargo.toml"),
  cargoLock: resolve(ROOT, "src-tauri/Cargo.lock"),
};

// Strict semver: MAJOR.MINOR.PATCH with an optional pre-release/build suffix.
// We deliberately reject leading zeros and anything non-numeric in the core
// so e.g. "01.2.3", "1.2", "1.2.3.4" all fail loud rather than silently
// producing weird Cargo / GitHub Release behaviour later.
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

function log(msg) {
  console.log(msg);
}
function warn(msg) {
  console.warn(`! ${msg}`);
}
function die(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

function rel(p) {
  return relative(ROOT, p) || ".";
}

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

function run(cmd, args, { silent = false } = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: silent ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const detail = silent ? `\n${res.stderr || res.stdout || ""}`.trimEnd() : "";
    throw new Error(`${cmd} ${args.join(" ")} failed with exit code ${res.status}${detail}`);
  }
  return (res.stdout ?? "").trim();
}

function runOut(cmd, args) {
  return run(cmd, args, { silent: true });
}

function parseSemver(v) {
  const m = v.match(SEMVER_RE);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    raw: v,
  };
}

function bumpVersion(currentRaw, kind) {
  const current = parseSemver(currentRaw);
  if (!current) {
    die(`current version "${currentRaw}" is not strict semver — fix package.json by hand first`);
  }
  switch (kind) {
    case "major":
      return `${current.major + 1}.0.0`;
    case "minor":
      return `${current.major}.${current.minor + 1}.0`;
    case "patch":
      return `${current.major}.${current.minor}.${current.patch + 1}`;
    default:
      die(`unknown bump kind "${kind}" (expected patch|minor|major)`);
      return null; // unreachable
  }
}

// -----------------------------------------------------------------------------
// Manifest sync — used by both the bump flow and the CI sync step.
// Returns the list of files we touched so the caller can git-add them.
// -----------------------------------------------------------------------------
function syncManifests(targetVersion, { dryRun = false } = {}) {
  if (!parseSemver(targetVersion)) {
    die(`target version "${targetVersion}" is not strict semver`);
  }

  const touched = [];

  // package.json + tauri.conf.json — both straight JSON.
  for (const p of [PATHS.pkg, PATHS.tauri]) {
    const j = readJson(p);
    if (j.version === targetVersion) {
      log(`= ${rel(p)} already at ${targetVersion}`);
      continue;
    }
    log(`+ ${rel(p)}: ${j.version} -> ${targetVersion}`);
    if (!dryRun) {
      j.version = targetVersion;
      writeJson(p, j);
    }
    touched.push(p);
  }

  // Cargo.toml — keep it as text so we don't reflow the whole file. Match only
  // the first top-level `version = "..."` line so we never accidentally rewrite
  // a dependency's version field.
  const cargoText = readFileSync(PATHS.cargo, "utf8");
  const versionLineRe = /^version\s*=\s*"[^"]*"/m;
  if (!versionLineRe.test(cargoText)) {
    die(`could not find a top-level version line in ${rel(PATHS.cargo)}`);
  }
  const updatedCargo = cargoText.replace(versionLineRe, `version = "${targetVersion}"`);
  if (updatedCargo === cargoText) {
    log(`= ${rel(PATHS.cargo)} already at ${targetVersion}`);
  } else {
    log(`+ ${rel(PATHS.cargo)} -> ${targetVersion}`);
    if (!dryRun) writeFileSync(PATHS.cargo, updatedCargo);
    touched.push(PATHS.cargo);
  }

  return touched;
}

function refreshCargoLock({ dryRun = false } = {}) {
  if (dryRun) {
    log(`+ (skipped in dry-run) cargo update -p skill-desktop`);
    return false;
  }
  if (!existsSync(PATHS.cargoLock)) {
    log(`= no Cargo.lock to refresh`);
    return false;
  }
  try {
    runOut("cargo", [
      "update",
      "-p",
      "skill-desktop",
      "--manifest-path",
      "src-tauri/Cargo.toml",
    ]);
    log(`+ refreshed src-tauri/Cargo.lock`);
    return true;
  } catch (e) {
    warn(`cargo update failed (Cargo.lock not refreshed): ${e.message}`);
    return false;
  }
}

// -----------------------------------------------------------------------------
// CI verify step — assert every manifest agrees with the tag's version.
// -----------------------------------------------------------------------------
function verifyManifests(expected) {
  if (!parseSemver(expected)) {
    die(`expected version "${expected}" is not strict semver`);
  }
  const observed = {
    "package.json": readJson(PATHS.pkg).version,
    "src-tauri/tauri.conf.json": readJson(PATHS.tauri).version,
    "src-tauri/Cargo.toml":
      (readFileSync(PATHS.cargo, "utf8").match(/^version\s*=\s*"([^"]*)"/m) ?? [])[1] ?? "<missing>",
  };
  const drifted = Object.entries(observed).filter(([, v]) => v !== expected);
  if (drifted.length === 0) {
    log(`✓ all manifests at ${expected}`);
    return;
  }
  console.error(`release: version drift vs ${expected}:`);
  for (const [file, v] of drifted) {
    console.error(`  - ${file}: ${v}`);
  }
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Git helpers — only used by the bump/version flow, never by CI.
// -----------------------------------------------------------------------------
function ensureCleanTree() {
  const status = runOut("git", ["status", "--porcelain"]);
  if (status) {
    die(
      "working tree is not clean. Commit or stash changes first, or rerun with --allow-dirty.\n" +
        status
    );
  }
}

function ensureTagFree(tag) {
  const local = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (local.status === 0) {
    die(`tag ${tag} already exists locally — delete it first or pick a new version`);
  }
}

function currentBranch() {
  return runOut("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
}

// -----------------------------------------------------------------------------
// Top-level command handlers
// -----------------------------------------------------------------------------
function cmdCurrent() {
  const v = readJson(PATHS.pkg).version;
  log(v);
}

function cmdSync(args) {
  const target = args[0];
  if (!target) die("usage: release.mjs sync <version>");
  const dryRun = args.includes("--dry-run");
  syncManifests(target, { dryRun });
}

function cmdVerify(args) {
  const target = args[0];
  if (!target) die("usage: release.mjs verify <version>");
  verifyManifests(target);
}

function parseFlags(args) {
  const flags = {
    dryRun: false,
    noTag: false,
    noPush: false,
    allowDirty: false,
    skipCargoLock: false,
    remote: "origin",
  };
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--no-tag":
        flags.noTag = true;
        break;
      case "--no-push":
        flags.noPush = true;
        break;
      case "--allow-dirty":
        flags.allowDirty = true;
        break;
      case "--skip-cargo-lock":
        flags.skipCargoLock = true;
        break;
      case "--remote":
        flags.remote = args[++i] || die("--remote requires a value");
        break;
      default:
        rest.push(a);
    }
  }
  return { flags, rest };
}

function cmdRelease(arg, flags) {
  const currentVersion = readJson(PATHS.pkg).version;
  let nextVersion;
  if (arg === "patch" || arg === "minor" || arg === "major") {
    nextVersion = bumpVersion(currentVersion, arg);
  } else if (parseSemver(arg)) {
    nextVersion = arg;
  } else {
    die(`expected patch|minor|major or a strict semver string, got "${arg}"`);
  }

  const tag = `v${nextVersion}`;
  log(`current: ${currentVersion}`);
  log(`next:    ${nextVersion}  (tag ${tag})`);
  if (flags.dryRun) log("(dry-run mode — nothing will be written or pushed)");

  if (!flags.allowDirty && !flags.dryRun) ensureCleanTree();
  if (!flags.dryRun && !flags.noTag) ensureTagFree(tag);

  log("");
  log("# updating manifests");
  const touched = syncManifests(nextVersion, { dryRun: flags.dryRun });

  if (!flags.skipCargoLock) {
    log("");
    log("# refreshing Cargo.lock");
    const refreshed = refreshCargoLock({ dryRun: flags.dryRun });
    if (refreshed) touched.push(PATHS.cargoLock);
  }

  if (touched.length === 0) {
    warn(`no manifests needed changes; nothing to commit`);
    if (flags.noTag || flags.dryRun) return;
    // Still allow tagging the current HEAD even if no manifest changed
    // — useful for re-tagging.
  }

  if (flags.noTag) {
    log("");
    log("--no-tag: skipping commit/tag/push");
    return;
  }

  if (flags.dryRun) {
    log("");
    log(`(dry-run) would: git add ${touched.map(rel).join(" ")}`);
    log(`(dry-run) would: git commit -m "chore: release ${tag}"`);
    log(`(dry-run) would: git tag -a ${tag} -m "Release ${tag}"`);
    if (!flags.noPush) {
      log(`(dry-run) would: git push ${flags.remote} HEAD`);
      log(`(dry-run) would: git push ${flags.remote} ${tag}`);
    }
    return;
  }

  const branch = currentBranch();
  if (branch !== "main" && branch !== "master") {
    warn(`releasing from branch "${branch}" (not main/master). Continuing.`);
  }

  log("");
  log("# committing release");
  if (touched.length > 0) {
    run("git", ["add", ...touched.map(rel)]);
    run("git", ["commit", "-m", `chore: release ${tag}`]);
  } else {
    log("(no manifest changes to commit)");
  }

  log("");
  log("# tagging release");
  run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);

  if (flags.noPush) {
    log("");
    log(`--no-push: ${tag} created locally. Run "git push ${flags.remote} HEAD ${tag}" when ready.`);
    return;
  }

  log("");
  log(`# pushing to ${flags.remote}`);
  run("git", ["push", flags.remote, "HEAD"]);
  run("git", ["push", flags.remote, tag]);

  log("");
  log(`✓ released ${tag}. The Release workflow should kick off in a few seconds.`);
}

// -----------------------------------------------------------------------------
// Entry
// -----------------------------------------------------------------------------
function printHelp() {
  const help = `release.mjs — bump and ship a new version.

usage:
  pnpm release current
  pnpm release patch|minor|major  [flags]
  pnpm release <X.Y.Z>            [flags]
  pnpm release sync   <X.Y.Z>     (used by CI)
  pnpm release verify <X.Y.Z>     (used by CI)

flags:
  --dry-run          Show what would happen without writing or pushing.
  --no-tag           Update manifests but don't commit/tag/push.
  --no-push          Commit + tag locally but don't push.
  --allow-dirty      Skip the "working tree clean" check.
  --skip-cargo-lock  Don't run \`cargo update\` to refresh Cargo.lock.
  --remote <name>    Git remote to push to (default: origin).
`;
  log(help);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    cmdCurrent();
    return;
  }

  const cmd = argv[0];
  const rest = argv.slice(1);

  if (cmd === "current") return cmdCurrent();
  if (cmd === "sync") return cmdSync(rest);
  if (cmd === "verify") return cmdVerify(rest);

  // Otherwise treat the first arg as a bump kind or explicit version.
  const { flags, rest: leftover } = parseFlags(argv);
  if (leftover.length !== 1) {
    die(`expected exactly one positional argument, got ${leftover.length}: ${JSON.stringify(leftover)}`);
  }
  cmdRelease(leftover[0], flags);
}

try {
  main();
} catch (e) {
  die(e.message || String(e));
}
