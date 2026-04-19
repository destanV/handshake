import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import type { InferenceClaim } from "../typechain-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute the commitment hash the same way Solidity does:
 *  keccak256(abi.encodePacked(rawOutput))
 *  In ethers v6: keccak256(toUtf8Bytes(str)) is identical for UTF-8 strings.
 */
function commitOutput(text: string): { outputHash: string; rawBytes: Uint8Array } {
  const rawBytes = ethers.toUtf8Bytes(text);
  const outputHash = ethers.keccak256(rawBytes);
  return { outputHash, rawBytes };
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const CHALLENGE_WINDOW_SECS = 60;

async function deployFixture() {
  const [owner, provider, challenger, bystander] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("InferenceClaim");
  const contract = (await Factory.deploy(CHALLENGE_WINDOW_SECS)) as InferenceClaim;
  await contract.waitForDeployment();

  // Pre-compute hashes used across tests
  const modelHash  = ethers.keccak256(ethers.toUtf8Bytes("bert-base-uncased-v1"));
  const inputHash  = ethers.keccak256(ethers.toUtf8Bytes("What is the capital of France?"));
  const { outputHash: trueOutputHash, rawBytes: trueRawBytes } = commitOutput("Paris");
  const { outputHash: lieOutputHash }                          = commitOutput("Berlin");

  return {
    contract,
    owner, provider, challenger, bystander,
    modelHash, inputHash,
    trueOutputHash, trueRawBytes,
    lieOutputHash,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InferenceClaim", function () {

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets CHALLENGE_WINDOW correctly", async function () {
      const { contract } = await loadFixture(deployFixture);
      expect(await contract.CHALLENGE_WINDOW()).to.equal(CHALLENGE_WINDOW_SECS);
    });

    it("nextClaimId starts at 1", async function () {
      const { contract } = await loadFixture(deployFixture);
      expect(await contract.nextClaimId()).to.equal(1n);
    });
  });

  // ── submitClaim ─────────────────────────────────────────────────────────────

  describe("submitClaim", function () {
    it("emits ClaimSubmitted with correct args", async function () {
      const { contract, provider, modelHash, inputHash, trueOutputHash } =
        await loadFixture(deployFixture);

      const tx = await contract.connect(provider).submitClaim(modelHash, inputHash, trueOutputHash);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const expectedDeadline = BigInt(block!.timestamp) + BigInt(CHALLENGE_WINDOW_SECS);

      await expect(tx)
        .to.emit(contract, "ClaimSubmitted")
        .withArgs(1n, provider.address, modelHash, inputHash, trueOutputHash, expectedDeadline);
    });

    it("stores claim data correctly", async function () {
      const { contract, provider, modelHash, inputHash, trueOutputHash } =
        await loadFixture(deployFixture);

      await contract.connect(provider).submitClaim(modelHash, inputHash, trueOutputHash);
      const claim = await contract.getClaim(1n);

      expect(claim.provider).to.equal(provider.address);
      expect(claim.modelHash).to.equal(modelHash);
      expect(claim.inputHash).to.equal(inputHash);
      expect(claim.outputHash).to.equal(trueOutputHash);
      expect(claim.challenger).to.equal(ethers.ZeroAddress);
      expect(claim.status).to.equal(0n); // Pending = 0
    });

    it("increments nextClaimId after each submission", async function () {
      const { contract, provider, modelHash, inputHash, trueOutputHash } =
        await loadFixture(deployFixture);

      await contract.connect(provider).submitClaim(modelHash, inputHash, trueOutputHash);
      expect(await contract.nextClaimId()).to.equal(2n);

      await contract.connect(provider).submitClaim(modelHash, inputHash, trueOutputHash);
      expect(await contract.nextClaimId()).to.equal(3n);
    });
  });

  // ── Happy Path ───────────────────────────────────────────────────────────────
  // Provider submits → nobody challenges → window expires → finalizeClaim → Verified

  describe("Happy Path (no challenge)", function () {
    async function happyFixture() {
      const f = await deployFixture();
      await f.contract.connect(f.provider).submitClaim(f.modelHash, f.inputHash, f.trueOutputHash);
      return f;
    }

    it("reverts finalizeClaim if window has NOT expired", async function () {
      const { contract } = await loadFixture(happyFixture);
      await expect(contract.finalizeClaim(1n))
        .to.be.revertedWith("Challenge window still open");
    });

    it("finalizeClaim succeeds after window expires → status=Verified", async function () {
      const { contract } = await loadFixture(happyFixture);

      await time.increase(CHALLENGE_WINDOW_SECS + 1);

      await expect(contract.finalizeClaim(1n))
        .to.emit(contract, "ClaimFinalized")
        .withArgs(1n, 2n); // 2 = Verified

      const claim = await contract.getClaim(1n);
      expect(claim.status).to.equal(2n); // Verified
    });

    it("reverts double-finalize", async function () {
      const { contract } = await loadFixture(happyFixture);
      await time.increase(CHALLENGE_WINDOW_SECS + 1);
      await contract.finalizeClaim(1n);
      await expect(contract.finalizeClaim(1n)).to.be.revertedWith("Not pending");
    });
  });

  // ── Fraud Path ───────────────────────────────────────────────────────────────
  // Provider commits a lie → gets challenged → reveals real output → hash mismatch → Rejected

  describe("Fraud Path (dishonest provider exposed)", function () {
    async function fraudFixture() {
      const f = await deployFixture();
      // Provider commits keccak256("Berlin") but will later try to reveal "Paris"
      await f.contract.connect(f.provider).submitClaim(f.modelHash, f.inputHash, f.lieOutputHash);
      return f;
    }

    it("challengeClaim transitions status to Challenged", async function () {
      const { contract, challenger } = await loadFixture(fraudFixture);

      await expect(contract.connect(challenger).challengeClaim(1n))
        .to.emit(contract, "ClaimChallenged")
        .withArgs(1n, challenger.address);

      const claim = await contract.getClaim(1n);
      expect(claim.status).to.equal(1n);            // Challenged = 1
      expect(claim.challenger).to.equal(challenger.address);
    });

    it("revealOutput with mismatched hash → status=Rejected", async function () {
      const { contract, provider, challenger, trueRawBytes } = await loadFixture(fraudFixture);

      await contract.connect(challenger).challengeClaim(1n);

      // Provider reveals the REAL output "Paris", but they committed to keccak256("Berlin")
      // → hash mismatch → fraud exposed
      const tx = await contract.connect(provider).revealOutput(1n, trueRawBytes);

      await expect(tx)
        .to.emit(contract, "OutputRevealed")
        .withArgs(1n, false, trueRawBytes);

      await expect(tx)
        .to.emit(contract, "ClaimFinalized")
        .withArgs(1n, 3n); // 3 = Rejected

      const claim = await contract.getClaim(1n);
      expect(claim.status).to.equal(3n); // Rejected
    });
  });

  // ── False Challenge ──────────────────────────────────────────────────────────
  // Honest provider gets challenged → reveals true output → hash matches → Verified

  describe("False Challenge (honest provider wins)", function () {
    async function falseChallengeFixture() {
      const f = await deployFixture();
      // Honest provider commits the correct hash
      await f.contract.connect(f.provider).submitClaim(f.modelHash, f.inputHash, f.trueOutputHash);
      await f.contract.connect(f.challenger).challengeClaim(1n);
      return f;
    }

    it("revealOutput with matching hash → status=Verified", async function () {
      const { contract, provider, trueRawBytes } = await loadFixture(falseChallengeFixture);

      const tx = await contract.connect(provider).revealOutput(1n, trueRawBytes);

      await expect(tx)
        .to.emit(contract, "OutputRevealed")
        .withArgs(1n, true, trueRawBytes);

      await expect(tx)
        .to.emit(contract, "ClaimFinalized")
        .withArgs(1n, 2n); // 2 = Verified

      const claim = await contract.getClaim(1n);
      expect(claim.status).to.equal(2n); // Verified
    });

    it("emitted rawOutput decodes back to original string", async function () {
      const { contract, provider, trueRawBytes } = await loadFixture(falseChallengeFixture);

      const tx = await contract.connect(provider).revealOutput(1n, trueRawBytes);
      const receipt = await tx.wait();
      const iface = contract.interface;

      // Find the OutputRevealed event and decode it
      const log = receipt!.logs.find(
        (l) => l.topics[0] === iface.getEvent("OutputRevealed")!.topicHash
      );
      const decoded = iface.decodeEventLog("OutputRevealed", log!.data, log!.topics);
      const decodedText = ethers.toUtf8String(decoded.rawOutput);

      expect(decodedText).to.equal("Paris");
    });
  });

  // ── Access Control ───────────────────────────────────────────────────────────

  describe("Access Control", function () {
    it("reverts challengeClaim after window expires", async function () {
      const { contract, provider, challenger, modelHash, inputHash, trueOutputHash } =
        await loadFixture(deployFixture);

      await contract.connect(provider).submitClaim(modelHash, inputHash, trueOutputHash);
      await time.increase(CHALLENGE_WINDOW_SECS + 1);

      await expect(contract.connect(challenger).challengeClaim(1n))
        .to.be.revertedWith("Challenge window expired");
    });

    it("reverts double-challenge on same claim", async function () {
      const { contract, provider, challenger, bystander, modelHash, inputHash, trueOutputHash } =
        await loadFixture(deployFixture);

      await contract.connect(provider).submitClaim(modelHash, inputHash, trueOutputHash);
      await contract.connect(challenger).challengeClaim(1n);

      await expect(contract.connect(bystander).challengeClaim(1n))
        .to.be.revertedWith("Not pending");
    });

    it("reverts revealOutput from non-provider address", async function () {
      const { contract, provider, challenger, bystander, modelHash, inputHash, trueOutputHash, trueRawBytes } =
        await loadFixture(deployFixture);

      await contract.connect(provider).submitClaim(modelHash, inputHash, trueOutputHash);
      await contract.connect(challenger).challengeClaim(1n);

      await expect(contract.connect(bystander).revealOutput(1n, trueRawBytes))
        .to.be.revertedWith("Only provider");
    });

    it("reverts revealOutput on a Pending (not yet challenged) claim", async function () {
      const { contract, provider, modelHash, inputHash, trueOutputHash, trueRawBytes } =
        await loadFixture(deployFixture);

      await contract.connect(provider).submitClaim(modelHash, inputHash, trueOutputHash);

      await expect(contract.connect(provider).revealOutput(1n, trueRawBytes))
        .to.be.revertedWith("Not challenged");
    });
  });

  // ── Edge Cases ───────────────────────────────────────────────────────────────

  describe("Edge Cases", function () {
    it("multiple independent claims do not interfere with each other", async function () {
      const { contract, provider, challenger, modelHash, inputHash, trueOutputHash, lieOutputHash } =
        await loadFixture(deployFixture);

      // Claim 1: honest → will finalize
      await contract.connect(provider).submitClaim(modelHash, inputHash, trueOutputHash);
      // Claim 2: fraudulent → will be challenged
      await contract.connect(provider).submitClaim(modelHash, inputHash, lieOutputHash);

      await contract.connect(challenger).challengeClaim(2n);

      // Claim 1 should still be Pending
      expect((await contract.getClaim(1n)).status).to.equal(0n); // Pending
      // Claim 2 should be Challenged
      expect((await contract.getClaim(2n)).status).to.equal(1n); // Challenged

      await time.increase(CHALLENGE_WINDOW_SECS + 1);
      await contract.finalizeClaim(1n);

      // Claim 1 Verified, Claim 2 still Challenged
      expect((await contract.getClaim(1n)).status).to.equal(2n); // Verified
      expect((await contract.getClaim(2n)).status).to.equal(1n); // Challenged
    });

    it("empty bytes output hashes correctly", async function () {
      const { contract, provider, challenger, modelHash, inputHash } =
        await loadFixture(deployFixture);

      const emptyBytes = new Uint8Array(0);
      const emptyHash  = ethers.keccak256(emptyBytes);

      await contract.connect(provider).submitClaim(modelHash, inputHash, emptyHash);
      await contract.connect(challenger).challengeClaim(1n);

      // Revealing empty bytes should match
      await expect(contract.connect(provider).revealOutput(1n, emptyBytes))
        .to.emit(contract, "OutputRevealed")
        .withArgs(1n, true, emptyBytes);
    });
  });
});
