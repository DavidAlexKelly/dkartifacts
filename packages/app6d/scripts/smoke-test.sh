#!/usr/bin/env bash
# scripts/smoke-test.sh — verifies the published package's catalog actually
# loads, using the real packed tarball rather than the source tree. Run
# after `npm run build`, before `npm publish`:
#
#   npm run build
#   bash scripts/smoke-test.sh
#   npm publish --access public
#
# This exists because the pre-1.0 mutable-registry design could pass
# typecheck/build yet still ship a package where symbols silently vanished
# for some consumers depending on bundler chunk-splitting — installing the
# actual tarball into a clean directory and importing every public subpath
# is the only way to catch that class of bug before it reaches npm.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [ ! -d dist ]; then
  echo "smoke-test: dist/ not found — run 'npm run build' first" >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

tarball="$(npm pack --silent --pack-destination "$work_dir")"
tarball_path="$work_dir/$tarball"

install_dir="$work_dir/install"
mkdir -p "$install_dir"
tar -xzf "$tarball_path" -C "$install_dir"
pkg_dir="$install_dir/package"

# The /milsymbol subpath needs the real optional peer dependency present to
# exercise its milsymbol-delegation branch, so it has to sit somewhere Node's
# resolution will find from dist/milsymbol/.
#
# Prefer copying the copy this repository already installed. The work dir is
# outside the repository, so an `npm install` there does not see the repo's
# .npmrc and falls back to the public registry — which a Foundry Code Workspace
# cannot reach, and the script then hangs rather than failing. The install is
# kept as the fallback for anyone running this from a standalone checkout.
host_milsymbol="$repo_root/../../node_modules/milsymbol"
if [ -d "$host_milsymbol" ]; then
  mkdir -p "$pkg_dir/node_modules"
  cp -R "$host_milsymbol" "$pkg_dir/node_modules/milsymbol"
else
  (cd "$pkg_dir" && npm install --no-save --silent milsymbol@^3.0.4)
fi

node --input-type=module -e "
import { SymbolCatalog } from '$pkg_dir/dist/engine/index.js';
import { render, renderSVG, getHandles, applyHandle } from '$pkg_dir/dist/engine/index.js';
import { APP6D_CATALOG } from '$pkg_dir/dist/symbols/index.js';
import { createOrderBuilders, lookupTaskForOrder } from '$pkg_dir/dist/core/index.js';
import { blockSymbol, BLOCK_NAME } from '$pkg_dir/dist/symbols/individual/index.js';

const assert = (cond, msg) => { if (!cond) throw new Error('smoke-test failed: ' + msg); };

const names = APP6D_CATALOG.list();
assert(names.length > 40, \`expected 40+ built-in symbols, got \${names.length}\`);
assert(APP6D_CATALOG instanceof SymbolCatalog, 'APP6D_CATALOG is not a SymbolCatalog instance');

const first = names[0];
const svg = render(APP6D_CATALOG, first);
assert(typeof svg === 'string' && svg.includes('<g'), \`render() for '\${first}' did not produce markup\`);
assert(renderSVG(APP6D_CATALOG, first).startsWith('<svg'), 'renderSVG() did not produce a full document');

const handles = getHandles(APP6D_CATALOG, first);
assert(Array.isArray(handles) && handles.length > 0, \`getHandles() for '\${first}' returned no handles\`);
const moved = applyHandle(APP6D_CATALOG, first, undefined, handles[0].id, { x: 1, y: 1 });
assert(moved && typeof moved === 'object', 'applyHandle() did not return params');

const minimalCatalog = new SymbolCatalog({ [BLOCK_NAME]: blockSymbol });
assert(minimalCatalog.list().length === 1, 'individually tree-shaken catalog construction failed');

const builders = createOrderBuilders(APP6D_CATALOG);
assert(typeof builders.seize === 'function', 'createOrderBuilders() missing seize()');

assert(lookupTaskForOrder('Occupy')?.sidc, 'lookupTaskForOrder(\"Occupy\") did not resolve a doctrinal SIDC');

const { resolveSymbol } = await import('$pkg_dir/dist/milsymbol/index.js');
const viaRealSidc = resolveSymbol(APP6D_CATALOG, 'GFTPO---------G'); // Occupy
assert(viaRealSidc.kind === 'tactical-graphic', 'resolveSymbol() did not resolve a real doctrinal SIDC to a tactical graphic');
assert(viaRealSidc.asSVG().startsWith('<svg'), 'resolveSymbol() tactical-graphic branch did not produce an <svg> document');
assert(typeof viaRealSidc.getAnchor().x === 'number', 'resolveSymbol() tactical-graphic branch getAnchor() malformed');

const viaMilsymbol = resolveSymbol(APP6D_CATALOG, 'SFGPUCI-----D---'); // a real unit SIDC, not in our catalog
assert(viaMilsymbol.kind === 'milsymbol', 'resolveSymbol() did not fall through to milsymbol for a unit SIDC');
assert(viaMilsymbol.asSVG().startsWith('<svg'), 'resolveSymbol() milsymbol branch did not produce an <svg> document');

console.log(\`smoke-test: OK (\${names.length} symbols, all public subpaths load)\`);
"
