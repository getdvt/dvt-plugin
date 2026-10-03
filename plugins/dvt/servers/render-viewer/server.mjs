#!/usr/bin/env node
// DVT-4950 — stdio entrypoint for the dvt render viewer. Thin on purpose: all logic
// lives in lib.mjs so it can be unit-tested with injected fetch/exec/clock.
// No main-module guard: it breaks when the launch path contains a symlink.
import { startStdio } from "./lib.mjs";

startStdio();
