#!/usr/bin/env node
import { run } from '../src/advisor.js';

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  console.error(`advisor: ${error.message}`);
  process.exitCode = 1;
}
