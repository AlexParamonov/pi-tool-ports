#!/usr/bin/env node

/**
 * Build script: vendor adapter dependency source files.
 *
 * Copies dependency source files and LICENSE files to vendor directories.
 * Vendored files are NOT modified — adapter modules re-export via wrappers.
 *
 * Usage: node scripts/build-adapters.mjs
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const NM = join(ROOT, "node_modules");

const ADAPTERS = [
  {
    name: "semantic-edit",
    pkg: "pi-semantic-edit",
    // Copy the entire src/ directory
    copyDirs: ["src"],
    // Also copy index.ts if it exists (some packages have it)
    copyFiles: ["LICENSE"],
  },
  {
    name: "tree-sitter",
    pkg: "pi-tree-sitter",
    // Copy index.ts and src/ directory
    copyFiles: ["index.ts", "LICENSE"],
    copyDirs: ["src"],
  },
];

function vendorAdapter(config) {
  const pkgDir = join(NM, config.pkg);
  const vendorDir = join(ROOT, "src/adapters", config.name, "vendor");

  if (!existsSync(pkgDir)) {
    console.error(`Package not found: ${config.pkg}`);
    process.exit(1);
  }

  mkdirSync(vendorDir, { recursive: true });

  // Copy files
  for (const file of config.copyFiles ?? []) {
    const src = join(pkgDir, file);
    const dst = join(vendorDir, file);
    if (existsSync(src)) {
      cpSync(src, dst);
      console.log(`  ${config.pkg}/${file} → vendor/${file}`);
    }
  }

  // Copy directories
  for (const dir of config.copyDirs ?? []) {
    const src = join(pkgDir, dir);
    const dst = join(vendorDir, dir);
    if (existsSync(src)) {
      cpSync(src, dst, { recursive: true });
      console.log(`  ${config.pkg}/${dir}/ → vendor/${dir}/`);
    }
  }
}

console.log("Vendoring adapters...");

for (const config of ADAPTERS) {
  console.log(`\n${config.name}:`);
  vendorAdapter(config);
}

console.log("\nDone.");
