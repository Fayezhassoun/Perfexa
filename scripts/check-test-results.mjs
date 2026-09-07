import { readFileSync } from 'node:fs';

// Vitest 2 can exit successfully after a global-setup failure. The release
// gate requires an actual nonempty passing run, not just a zero exit status.
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (report.success !== true || !(report.numTotalTests > 0) || report.numPassedTests !== report.numTotalTests || report.numFailedTestSuites > 0 || report.numFailedTests > 0 || report.numRuntimeErrorTestSuites > 0) {
  throw new Error('Test evidence is missing, incomplete, or failed');
}
console.log(`Verified ${report.numPassedTests} executed tests passed.`);
