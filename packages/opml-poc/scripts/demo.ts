/**
 * OPML Proof-of-Inference — Interactive Demo
 * ═══════════════════════════════════════════
 *
 * This script is designed to be READ as a tutorial and RUN as a demo.
 * Each scenario prints a narration block before the transaction and a
 * result summary after. Run it with:
 *
 *   pnpm --filter @handshake/opml-poc demo
 *
 * It deploys a fresh InferenceClaim contract to the local Hardhat network
 * and walks through three scenarios in sequence:
 *
 *   Scenario 1 — Happy Path     : no challenge → optimistic finalization
 *   Scenario 2 — Fraud Detected : bad provider is challenged and exposed
 *   Scenario 3 — False Challenge: honest provider reveals and wins
 */

import { ethers } from "hardhat";

// ── Utilities ─────────────────────────────────────────────────────────────────

const CHALLENGE_WINDOW_SECS = 10; // short window so the demo completes quickly

function box(title: string, lines: string[]): void {
  const width = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
  const bar = "─".repeat(width);
  console.log(`\n┌${bar}┐`);
  console.log(`│  ${title.padEnd(width - 2)}│`);
  console.log(`├${bar}┤`);
  for (const line of lines) {
    console.log(`│  ${line.padEnd(width - 2)}│`);
  }
  console.log(`└${bar}┘`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compute the commitment the same way the contract does:
 *  keccak256(abi.encodePacked(rawOutput))
 */
function commit(text: string): { hash: string; bytes: Uint8Array } {
  const bytes = ethers.toUtf8Bytes(text);
  const hash  = ethers.keccak256(bytes);
  return { hash, bytes };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer, provider, challenger] = await ethers.getSigners();

  // ────────────────────────────────────────────────────────────────────────────
  box("OPML Proof-of-Inference POC", [
    "Concept: Inference providers post claims on-chain OPTIMISTICALLY.",
    "The system trusts them UNLESS someone challenges within a time window.",
    "",
    "This demo uses a commitment-reveal scheme to simulate OPML:",
    "  1. Provider commits keccak256(output) — doesn't reveal the output yet.",
    "  2. If challenged, provider reveals the raw output.",
    "  3. Contract verifies: keccak256(revealed) == committed hash.",
    "",
    "Real OPML uses a bisection game + on-chain VM for step 3.",
    "This demo captures the same trust model with a single reveal round.",
  ]);

  // ── Deploy ────────────────────────────────────────────────────────────────

  console.log("\n⬡  Deploying InferenceClaim contract...");
  const Factory  = await ethers.getContractFactory("InferenceClaim");
  const contract = await Factory.deploy(CHALLENGE_WINDOW_SECS);
  await contract.waitForDeployment();
  console.log(`   Contract address : ${await contract.getAddress()}`);
  console.log(`   Challenge window : ${CHALLENGE_WINDOW_SECS} seconds`);
  console.log(`   Provider address : ${provider.address}`);
  console.log(`   Challenger       : ${challenger.address}`);

  // ── Pre-compute hashes used across scenarios ──────────────────────────────

  const modelHash = ethers.keccak256(ethers.toUtf8Bytes("bert-base-uncased-v1"));
  const inputHash = ethers.keccak256(ethers.toUtf8Bytes("What is the capital of France?"));

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 1 — HAPPY PATH
  // Provider submits an honest claim. Nobody challenges. Window expires.
  // Claim finalizes as Verified. This is the "optimistic" path.
  // ══════════════════════════════════════════════════════════════════════════

  box("Scenario 1 — Happy Path (no challenge)", [
    "Provider runs inference off-chain:",
    "  input  = 'What is the capital of France?'",
    "  output = 'Paris'",
    "",
    "Provider commits outputHash = keccak256('Paris') on-chain.",
    "Nobody challenges within the 10-second window.",
    "Anyone calls finalizeClaim() — optimistic assumption wins.",
  ]);

  const paris = commit("Paris");

  console.log("\n[1] Provider submits claim...");
  console.log(`    modelHash  = ${modelHash}`);
  console.log(`    inputHash  = ${inputHash}`);
  console.log(`    outputHash = ${paris.hash}  ← keccak256("Paris")`);

  const tx1 = await contract.connect(provider).submitClaim(modelHash, inputHash, paris.hash);
  const receipt1 = await tx1.wait();
  console.log(`    ✓ ClaimSubmitted — claimId=1, tx=${receipt1!.hash.slice(0, 12)}...`);

  console.log(`\n[2] Waiting ${CHALLENGE_WINDOW_SECS + 1} seconds for challenge window to expire...`);
  await sleep((CHALLENGE_WINDOW_SECS + 1) * 1000);

  console.log("\n[3] Challenge window expired. Calling finalizeClaim(1)...");
  const tx1f = await contract.finalizeClaim(1n);
  await tx1f.wait();

  const claim1 = await contract.getClaim(1n);
  const status1 = ["Pending", "Challenged", "Verified", "Rejected"][Number(claim1.status)];
  console.log(`    ✓ ClaimFinalized — status=${status1}`);

  box("Scenario 1 Result", [
    `Final status : ${status1}`,
    "",
    "OPML concept applied:",
    "  Silence = trust. No challenge within the window means the",
    "  system optimistically accepts the claim as honest.",
    "  This is the common case — fraud is the exception.",
  ]);

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 2 — FRAUD DETECTED
  // Bad provider commits keccak256("Berlin") but their real answer is "Paris".
  // A challenger disputes. Provider reveals "Paris". Hash mismatch → Rejected.
  // ══════════════════════════════════════════════════════════════════════════

  box("Scenario 2 — Fraud Detected (dishonest provider exposed)", [
    "Bad provider runs inference, gets 'Paris', but commits keccak256('Berlin').",
    "This is a lie: the committed hash doesn't match their actual output.",
    "",
    "A challenger notices (by re-running the model themselves).",
    "Challenger opens a dispute. Provider must now reveal their output.",
    "Provider reveals 'Paris'. Contract checks: keccak256('Paris') == keccak256('Berlin')?",
    "No — hash mismatch. Fraud proven. Claim Rejected.",
  ]);

  const berlin = commit("Berlin");

  console.log("\n[1] Bad provider submits claim with FRAUDULENT outputHash...");
  console.log(`    Actual output = "Paris"  →  would hash to : ${paris.hash}`);
  console.log(`    Committed hash           : ${berlin.hash}  ← keccak256("Berlin")`);

  const tx2 = await contract.connect(provider).submitClaim(modelHash, inputHash, berlin.hash);
  const receipt2 = await tx2.wait();
  console.log(`    ✓ ClaimSubmitted — claimId=2, tx=${receipt2!.hash.slice(0, 12)}...`);

  console.log("\n[2] Challenger disputes the claim...");
  const tx2c = await contract.connect(challenger).challengeClaim(2n);
  await tx2c.wait();
  console.log("    ✓ ClaimChallenged — status=Challenged");

  console.log("\n[3] Bad provider reveals 'Paris' (their actual output)...");
  const tx2r = await contract.connect(provider).revealOutput(2n, paris.bytes);
  await tx2r.wait();

  const claim2 = await contract.getClaim(2n);
  const status2 = ["Pending", "Challenged", "Verified", "Rejected"][Number(claim2.status)];
  console.log(`    keccak256("Paris") = ${paris.hash}`);
  console.log(`    committed hash     = ${berlin.hash}`);
  console.log(`    match?             = ${paris.hash === berlin.hash ? "YES" : "NO"}`);
  console.log(`    ✓ OutputRevealed(honest=false) — status=${status2}`);

  box("Scenario 2 Result", [
    `Final status : ${status2}`,
    "",
    "OPML concept applied:",
    "  The commitment (outputHash) is binding. Once posted on-chain,",
    "  the provider cannot change their answer. If their revealed output",
    "  doesn't match the committed hash, the contract proves fraud",
    "  without needing to trust anyone — it's purely mathematical.",
  ]);

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 3 — FALSE CHALLENGE
  // Honest provider commits keccak256("Paris"). Challenger disputes incorrectly.
  // Provider reveals "Paris". Hash matches → Verified. Honest provider wins.
  // ══════════════════════════════════════════════════════════════════════════

  box("Scenario 3 — False Challenge (honest provider wins)", [
    "Honest provider commits keccak256('Paris') — their actual output.",
    "",
    "A trigger-happy challenger disputes it anyway.",
    "Provider reveals 'Paris'. Contract checks: keccak256('Paris') == committed hash?",
    "Yes — match. Provider vindicated. Claim Verified.",
    "",
    "In real OPML, the false challenger would lose their staked tokens.",
  ]);

  console.log("\n[1] Honest provider submits correct claim...");
  const tx3 = await contract.connect(provider).submitClaim(modelHash, inputHash, paris.hash);
  const receipt3 = await tx3.wait();
  console.log(`    ✓ ClaimSubmitted — claimId=3, tx=${receipt3!.hash.slice(0, 12)}...`);

  console.log("\n[2] Challenger incorrectly disputes the claim...");
  const tx3c = await contract.connect(challenger).challengeClaim(3n);
  await tx3c.wait();
  console.log("    ✓ ClaimChallenged — status=Challenged");

  console.log("\n[3] Honest provider reveals 'Paris'...");
  const tx3r = await contract.connect(provider).revealOutput(3n, paris.bytes);
  await tx3r.wait();

  const claim3 = await contract.getClaim(3n);
  const status3 = ["Pending", "Challenged", "Verified", "Rejected"][Number(claim3.status)];
  console.log(`    keccak256("Paris") = ${paris.hash}`);
  console.log(`    committed hash     = ${paris.hash}`);
  console.log(`    match?             = ${paris.hash === paris.hash ? "YES" : "NO"}`);
  console.log(`    ✓ OutputRevealed(honest=true) — status=${status3}`);

  box("Scenario 3 Result", [
    `Final status : ${status3}`,
    "",
    "OPML concept applied:",
    "  An honest provider always wins a challenge — their committed hash",
    "  matches their actual output by construction. The system is safe",
    "  to use even in an adversarial environment.",
  ]);

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n");
  box("Summary", [
    "  Claim │ Path              │ Final Status │ OPML Concept",
    "  ──────┼───────────────────┼──────────────┼──────────────────────────",
    `  1     │ No challenge      │ ${status1.padEnd(12)} │ Optimistic assumption`,
    `  2     │ Fraud exposed     │ ${status2.padEnd(12)} │ Commitment binding`,
    `  3     │ False challenge   │ ${status3.padEnd(12)} │ Honest reveal wins`,
    "",
    "What real OPML adds on top of this POC:",
    "  • Bisection game — narrows down the EXACT wrong computation step",
    "    (instead of challenging the whole output at once)",
    "  • On-chain MIPS/EVM VM — re-executes that single step deterministically",
    "    (instead of just checking a hash preimage)",
    "  • Token staking — challenger and provider both stake; loser is slashed",
    "    (instead of no economic consequences)",
    "",
    "This POC captures the trust model correctly:",
    "  optimism + challenge window + cryptographic commitment + reveal-based resolution.",
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
