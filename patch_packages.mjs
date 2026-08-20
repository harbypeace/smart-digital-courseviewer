#!/usr/bin/env node

/**
 * 📦 Package Patch & Sync Script (Standalone Cloudflare Pages + Worker)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = __dirname;
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages', '@openmaic');

const PACKAGES = [
  { name: '@openmaic/dsl', folder: 'dsl' },
  { name: '@openmaic/renderer', folder: 'renderer' },
  { name: '@openmaic/viewer', folder: 'viewer' },
];

const args = process.argv.slice(2);
const targetFilter = args.find(a => !a.startsWith('--'));

console.log('\n======================================================');
console.log('🚀 Standalone CourseViewer: Package Patch & Build Tool');
console.log('======================================================\n');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const results = [];

for (const pkg of PACKAGES) {
  if (targetFilter && !pkg.folder.includes(targetFilter) && !pkg.name.includes(targetFilter)) {
    continue;
  }

  const pkgDir = path.join(PACKAGES_DIR, pkg.folder);
  if (!fs.existsSync(pkgDir)) {
    continue;
  }

  const pkgJsonPath = path.join(pkgDir, 'package.json');
  let pkgVersion = '0.1.0';
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      pkgVersion = pJson.version || pkgVersion;
    } catch (_e) {}
  }

  console.log(`🔨 Building package: ${pkg.name} (${pkg.folder})...`);
  const startTime = Date.now();

  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    if (pkgJson.scripts && pkgJson.scripts.build) {
      execSync('npm run build', { cwd: pkgDir, stdio: 'inherit' });
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Built ${pkg.name} successfully in ${duration}s.`);

    const cfNodeModulesPkg = path.join(ROOT_DIR, 'node_modules', '@openmaic', pkg.folder);
    const distDir = path.join(pkgDir, 'dist');
    if (fs.existsSync(distDir) && fs.existsSync(cfNodeModulesPkg)) {
      copyDirRecursive(distDir, path.join(cfNodeModulesPkg, 'dist'));
      if (fs.existsSync(pkgJsonPath)) {
        fs.copyFileSync(pkgJsonPath, path.join(cfNodeModulesPkg, 'package.json'));
      }
    }

    results.push({ package: pkg.name, version: pkgVersion, status: 'SUCCESS', duration: `${duration}s` });
  } catch (err) {
    console.error(`❌ Failed to build ${pkg.name}:`, err.message);
    results.push({ package: pkg.name, version: pkgVersion, status: 'FAILED', duration: 'N/A' });
  }
}

console.log('\n------------------------------------------------------');
console.log('📊 Patch & Build Summary:');
console.log('------------------------------------------------------');
console.table(results);

console.log('\n🌐 Rebuilding Cloudflare Pages...');
try {
  const appStart = Date.now();
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
  const appDuration = ((Date.now() - appStart) / 1000).toFixed(2);
  console.log(`\n🎉 Cloudflare Pages rebuilt successfully in ${appDuration}s!`);
} catch (appErr) {
  console.error('\n❌ Failed to rebuild Cloudflare Pages:', appErr.message);
}

console.log('\n✨ Package patch & sync complete!\n');
