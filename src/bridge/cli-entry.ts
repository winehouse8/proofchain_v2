/**
 * ProofChain Bridge — CLI Entry Point
 *
 * Called from check-phase.sh (shell hook) to invoke the TS engine.
 * Reads JSON from stdin, dispatches to the appropriate handler,
 * and exits with the appropriate code.
 *
 * Usage:
 *   echo '{"tool_name":"Write",...}' | node dist/bridge/cli-entry.js tier1
 *   echo '{"tool_name":"Write",...}' | node dist/bridge/cli-entry.js tier2
 *   echo '{"area":"XX"}'             | node dist/bridge/cli-entry.js gate-check
 *
 * Exit codes:
 *   0 = allow (pass)
 *   2 = block (fail)
 *   1 = internal error (fail-open in tier1/tier2, fail-closed in gate-check)
 *
 * Rev.2: stdin-based JSON (Architect M1), fail-open for tier1/tier2
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createPreToolUseHook } from '../hooks/pre-tool-use.js';
import { createPostToolUseHook } from '../hooks/post-tool-use.js';
import { loadConfig } from '../core/config.js';
import { readHitlState, getAsilFromHitl } from './phase-sync.js';
import { runTsGateChecks } from './gate-bridge.js';
import { checkTcTrace } from '../hooks/handlers/tc-trace-handler.js';
import type { TcTraceInput } from '../hooks/handlers/tc-trace-handler.js';
import type { PreToolUseInput, PostToolUseInput } from '../hooks/hook-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function loadProjectConfig(cwd: string) {
  const configPath = join(cwd, '.proofchain', 'config.json');
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    return loadConfig(cwd);
  } catch {
    return null;
  }
}

function loadHitlState(cwd: string) {
  const hitlPath = join(cwd, '.omc', 'hitl-state.json');
  if (!existsSync(hitlPath)) {
    return null;
  }
  try {
    return readHitlState(hitlPath);
  } catch {
    return null;
  }
}

// ─── Command Handlers ───────────────────────────────────────────────────────

async function handleTier1(cwd: string): Promise<number> {
  try {
    const raw = await readStdin();
    const toolEvent = JSON.parse(raw) as PreToolUseInput;
    const config = loadProjectConfig(cwd);

    if (config === null) {
      // No config → no TS-level enforcement → allow
      process.stderr.write('[ProofChain] No .proofchain/config.json — TS tier1 skipped\n');
      return 0;
    }

    const hook = createPreToolUseHook();
    const result = hook.process(toolEvent, config);

    // Output annotations to stderr
    if (result.annotations) {
      for (const ann of result.annotations) {
        process.stderr.write(`[ProofChain] ${ann.type}: ${ann.message}\n`);
      }
    }

    if (result.decision === 'block') {
      process.stderr.write(`[ProofChain] BLOCKED: ${result.reason ?? 'Blocked by MISRA Tier 1'}\n`);
      return 2;
    }

    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ProofChain] Tier 1 error (fail-open): ${msg}\n`);
    return 0; // fail-open
  }
}

async function handleTier2(cwd: string): Promise<number> {
  try {
    const raw = await readStdin();
    const toolEvent = JSON.parse(raw) as PostToolUseInput;
    const config = loadProjectConfig(cwd);

    if (config === null) {
      return 0;
    }

    const hook = createPostToolUseHook();
    const result = hook.process(toolEvent, { config, projectRoot: cwd });

    // Output annotations to stderr
    if (result.annotations) {
      for (const ann of result.annotations) {
        process.stderr.write(`[ProofChain] ${ann.type}: ${ann.message}\n`);
      }
    }

    // Tier 2 is always non-blocking
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ProofChain] Tier 2 error (fail-open): ${msg}\n`);
    return 0; // fail-open
  }
}

async function handleGateCheck(cwd: string): Promise<number> {
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw) as { area: string };
    const config = loadProjectConfig(cwd);
    const hitlState = loadHitlState(cwd);

    if (config === null) {
      process.stderr.write('[ProofChain] No config — gate check skipped (fail-open)\n');
      return 0;
    }

    if (hitlState === null) {
      process.stderr.write('[ProofChain] No hitl-state.json — gate check skipped (fail-open)\n');
      return 0;
    }

    const summary = runTsGateChecks(config, hitlState, input.area);

    // Report results to stderr
    for (const r of summary.results) {
      const icon = r.passed ? 'PASS' : 'FAIL';
      process.stderr.write(`[ProofChain] Gate #${r.gate_id} ${icon}: ${r.message}\n`);
    }

    if (!summary.all_passed) {
      process.stderr.write(
        `[ProofChain] BLOCKED: ${summary.failed}/${summary.total_checks} TS gate checks failed\n`,
      );
      return 2; // fail-closed for gate-check (the ONLY fail-closed point)
    }

    process.stderr.write(
      `[ProofChain] All ${summary.total_checks} TS gate checks passed\n`,
    );
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ProofChain] Gate check error (FAIL-CLOSED): ${msg}\n`);
    return 2; // fail-closed for gate-check
  }
}

async function handleTier1Trace(cwd: string): Promise<number> {
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw) as TcTraceInput;

    // If no ASIL provided in input, try to read from hitl-state
    if (!input.asil_level) {
      const hitlState = loadHitlState(cwd);
      if (hitlState) {
        input.asil_level = getAsilFromHitl(hitlState);
      } else {
        input.asil_level = 'QM';
      }
    }

    const result = checkTcTrace(input);

    // Output result message to stderr
    process.stderr.write(`[ProofChain] ${result.message}\n`);

    if (result.decision === 'block') {
      process.stderr.write(`[ProofChain] BLOCKED: ${result.reason ?? 'TC traceability missing'}\n`);
      return 2;
    }

    // Output found tags for downstream consumption (stdout as JSON)
    if (result.tc_ids.length > 0 || result.req_ids.length > 0) {
      process.stdout.write(JSON.stringify({
        tc_ids: result.tc_ids,
        req_ids: result.req_ids,
      }) + '\n');
    }

    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ProofChain] tier1-trace error (fail-open): ${msg}\n`);
    return 0; // fail-open
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const command = process.argv[2];
  const cwd = process.cwd();

  switch (command) {
    case 'tier1':
      process.exit(await handleTier1(cwd));
      break;

    case 'tier2':
      process.exit(await handleTier2(cwd));
      break;

    case 'gate-check':
      process.exit(await handleGateCheck(cwd));
      break;

    case 'tier1-trace':
      process.exit(await handleTier1Trace(cwd));
      break;

    default:
      process.stderr.write(`[ProofChain] Unknown command: ${command}\n`);
      process.stderr.write('Usage: node cli-entry.js <tier1|tier2|gate-check|tier1-trace>\n');
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`[ProofChain] Fatal error: ${err}\n`);
  process.exit(1);
});
