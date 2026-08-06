import { describe, it, expect } from 'vitest';
import {
  runBalanceForAllCombinations,
  formatReport,
} from '../balance-report';

describe('Balance gate — all wave/map/difficulty combinations', () => {
  const results = runBalanceForAllCombinations();

  it('covers all 270 combinations (3 maps × 3 difficulties × 30 waves)', () => {
    expect(results).toHaveLength(270);
  });

  it('passes for every wave on every map at Medium difficulty', () => {
    // Output the full report for visibility with verbose reporter
    console.log(formatReport(results));

    const mediumFailures = results.filter(
      (r) => r.difficulty === 'medium' && !r.passed,
    );

    if (mediumFailures.length > 0) {
      const failureDetails = mediumFailures
        .map((r) => `  ${r.mapId} wave ${r.wave}: ${r.details}`)
        .join('\n');
      throw new Error(
        `Balance gate failed for ${mediumFailures.length} Medium combination(s):\n${failureDetails}`,
      );
    }

    expect(mediumFailures).toHaveLength(0);
  });

  it('logs warnings for Easy/Hard failures without failing', () => {
    const nonMediumFailures = results.filter(
      (r) => r.difficulty !== 'medium' && !r.passed,
    );

    if (nonMediumFailures.length > 0) {
      // Log warnings — these don't fail the test
      for (const r of nonMediumFailures) {
        console.warn(
          `[WARNING] ${r.difficulty} ${r.mapId} wave ${r.wave}: ${r.details}`,
        );
      }
    }

    // Always pass — Easy/Hard failures are warnings only
    expect(true).toBe(true);
  });
});

