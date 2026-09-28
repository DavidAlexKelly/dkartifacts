/**
 * Vitest config, for one reason: the tests are allowed to import
 * `@acc/decho-styling` and the product is not.
 *
 * The parity test has to compare this package's generated fallbacks against
 * the real thing — `tokensFor("classic")` and `tokenVariableName()` as the
 * styling package actually implements them, not as this package remembers
 * them. That import is the whole point of the test and would be a defect in
 * `src/`, so it is resolved here, in a file that never ships, and pointed at
 * the sibling package's source rather than its build output: a test that only
 * passes after another package has been compiled is a test people skip.
 */

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@acc/decho-styling": path.resolve(
        __dirname,
        "../decho-styling/src/index.ts",
      ),
    },
  },
});
