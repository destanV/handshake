import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";

// Deterministic bytes32 helper from a label.
function h(label: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

// Mirrors the contract's commitment = keccak256(abi.encode(modelHash, salt, msg.sender)).
function commitmentFor(modelHash: string, salt: string, sender: string): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "address"],
      [modelHash, salt, sender],
    ),
  );
}

const CID = "bafybeigdyrandomcidvalueforatest1234567890abcdefghijk";

describe("ModelRegistry", () => {
  async function deployFixture() {
    const [owner, alice, bob, carol] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ModelRegistry");
    const registry = await Factory.deploy();
    await registry.waitForDeployment();
    return { registry, owner, alice, bob, carol };
  }

  describe("registerModel", () => {
    it("registers a model and emits ModelRegistered with correct args", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      const modelHash = h("model-a");

      await expect(registry.registerModel(modelHash, CID, []))
        .to.emit(registry, "ModelRegistered")
        .withArgs(modelHash, owner.address, CID, []);

      const m = await registry.getModel(modelHash);
      expect(m.modelHash).to.equal(modelHash);
      expect(m.metadataCID).to.equal(CID);
      expect(m.owner).to.equal(owner.address);
      expect(m.pendingOwner).to.equal(ethers.ZeroAddress);
      expect(m.exists).to.equal(true);
    });

    it("reverts AlreadyRegistered on a duplicate hash", async () => {
      const { registry } = await loadFixture(deployFixture);
      const modelHash = h("dup");
      await registry.registerModel(modelHash, CID, []);
      await expect(
        registry.registerModel(modelHash, CID, []),
      ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    });

    it("registers with 0, 3 and 8 parents (gas recorded by the reporter)", async () => {
      const { registry } = await loadFixture(deployFixture);

      // Eight base models to use as parents.
      const parents: string[] = [];
      for (let i = 0; i < 8; i++) {
        const p = h("parent-" + i);
        await registry.registerModel(p, CID, []);
        parents.push(p);
      }

      await registry.registerModel(h("child-0p"), CID, []);
      await registry.registerModel(h("child-3p"), CID, parents.slice(0, 3));
      await registry.registerModel(h("child-8p"), CID, parents);

      const m3 = await registry.getModel(h("child-3p"));
      const m8 = await registry.getModel(h("child-8p"));
      expect(m3.parents.length).to.equal(3);
      expect(m8.parents.length).to.equal(8);
    });

    it("reverts ParentNotRegistered when a listed parent is unknown", async () => {
      const { registry } = await loadFixture(deployFixture);
      const ghost = h("ghost-parent");
      await expect(
        registry.registerModel(h("child"), CID, [ghost]),
      ).to.be.revertedWithCustomError(registry, "ParentNotRegistered");
    });

    it("reverts TooManyParents with 9 parents", async () => {
      const { registry } = await loadFixture(deployFixture);
      const parents: string[] = [];
      for (let i = 0; i < 9; i++) {
        const p = h("p9-" + i);
        await registry.registerModel(p, CID, []);
        parents.push(p);
      }
      await expect(
        registry.registerModel(h("too-many"), CID, parents),
      ).to.be.revertedWithCustomError(registry, "TooManyParents");
    });
  });

  describe("updateMetadata", () => {
    it("reverts NotOwner for a non-owner and emits MetadataUpdated for the owner", async () => {
      const { registry, owner, alice } = await loadFixture(deployFixture);
      const modelHash = h("upd");
      await registry.registerModel(modelHash, CID, []);

      await expect(
        registry.connect(alice).updateMetadata(modelHash, "newcid"),
      ).to.be.revertedWithCustomError(registry, "NotOwner");

      await expect(registry.connect(owner).updateMetadata(modelHash, "newcid"))
        .to.emit(registry, "MetadataUpdated")
        .withArgs(modelHash, "newcid");

      const m = await registry.getModel(modelHash);
      expect(m.metadataCID).to.equal("newcid");
      expect(m.modelHash).to.equal(modelHash); // hash stays immutable
    });

    it("reverts NotRegistered for an unknown model", async () => {
      const { registry } = await loadFixture(deployFixture);
      await expect(
        registry.updateMetadata(h("nope"), "x"),
      ).to.be.revertedWithCustomError(registry, "NotRegistered");
    });
  });

  describe("transferOwnership (2-step)", () => {
    it("initiate -> wrong acceptor reverts NotPendingOwner -> correct acceptor succeeds", async () => {
      const { registry, owner, alice, bob } = await loadFixture(deployFixture);
      const modelHash = h("xfer");
      await registry.registerModel(modelHash, CID, []);

      await expect(registry.connect(owner).transferOwnership(modelHash, alice.address))
        .to.emit(registry, "OwnershipTransferInitiated")
        .withArgs(modelHash, owner.address, alice.address);

      await expect(
        registry.connect(bob).acceptOwnership(modelHash),
      ).to.be.revertedWithCustomError(registry, "NotPendingOwner");

      await expect(registry.connect(alice).acceptOwnership(modelHash))
        .to.emit(registry, "OwnershipTransferred")
        .withArgs(modelHash, owner.address, alice.address);

      const m = await registry.getModel(modelHash);
      expect(m.owner).to.equal(alice.address);
      expect(m.pendingOwner).to.equal(ethers.ZeroAddress);
    });

    it("reverts NotOwner for a non-owner initiator and ZeroAddress for a zero nominee", async () => {
      const { registry, owner, alice } = await loadFixture(deployFixture);
      const modelHash = h("xfer2");
      await registry.registerModel(modelHash, CID, []);

      await expect(
        registry.connect(alice).transferOwnership(modelHash, alice.address),
      ).to.be.revertedWithCustomError(registry, "NotOwner");

      await expect(
        registry.connect(owner).transferOwnership(modelHash, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  describe("getModel", () => {
    it("returns the stored struct including parents in order", async () => {
      const { registry } = await loadFixture(deployFixture);
      const p1 = h("g-p1");
      const p2 = h("g-p2");
      const p3 = h("g-p3");
      for (const p of [p1, p2, p3]) await registry.registerModel(p, CID, []);

      const child = h("g-child");
      await registry.registerModel(child, CID, [p1, p2, p3]);

      const m = await registry.getModel(child);
      expect(m.parents).to.deep.equal([p1, p2, p3]);
    });

    it("returns a zero struct (exists=false) for an unknown hash", async () => {
      const { registry } = await loadFixture(deployFixture);
      const m = await registry.getModel(h("unknown"));
      expect(m.exists).to.equal(false);
      expect(m.owner).to.equal(ethers.ZeroAddress);
    });
  });

  describe("commit-reveal (front-running mitigation)", () => {
    it("commit emits ModelCommitted and records the commit block", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      const commitment = commitmentFor(h("cr-a"), h("salt-a"), owner.address);

      await expect(registry.commit(commitment))
        .to.emit(registry, "ModelCommitted")
        .withArgs(commitment, owner.address);

      expect(await registry.commitments(commitment)).to.be.gt(0n);
    });

    it("reverts CommitmentExists on a duplicate commitment", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      const commitment = commitmentFor(h("cr-dup"), h("salt-dup"), owner.address);
      await registry.commit(commitment);
      await expect(registry.commit(commitment)).to.be.revertedWithCustomError(
        registry,
        "CommitmentExists",
      );
    });

    it("reverts CommitTooRecent when revealed in the same block as the commit", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      const modelHash = h("cr-same");
      const salt = h("salt-same");
      const commitment = commitmentFor(modelHash, salt, owner.address);

      // Disable automine so commit + reveal land in the SAME block.
      await network.provider.send("evm_setAutomine", [false]);
      try {
        await registry.commit(commitment);
        const revealTx = await registry.reveal(modelHash, CID, [], salt);
        await network.provider.send("evm_mine", []);
        const receipt = await ethers.provider.getTransactionReceipt(revealTx.hash);
        // Only a same-block reveal of an otherwise-valid commitment reverts here -> CommitTooRecent.
        expect(receipt?.status).to.equal(0);
      } finally {
        await network.provider.send("evm_setAutomine", [true]);
      }
      // Commitment must survive the reverted reveal so it can be revealed later.
      expect(await registry.commitments(commitment)).to.be.gt(0n);
    });

    it("reverts CommitExpired when revealed after REVEAL_WINDOW", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      const modelHash = h("cr-exp");
      const salt = h("salt-exp");
      await registry.commit(commitmentFor(modelHash, salt, owner.address));

      const window = await registry.REVEAL_WINDOW();
      await mine(Number(window) + 1);

      await expect(
        registry.reveal(modelHash, CID, [], salt),
      ).to.be.revertedWithCustomError(registry, "CommitExpired");
    });

    it("reverts NoCommitment for a wrong salt / wrong modelHash", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      const modelHash = h("cr-wrong");
      const salt = h("salt-wrong");
      await registry.commit(commitmentFor(modelHash, salt, owner.address));

      await expect(
        registry.reveal(modelHash, CID, [], h("different-salt")),
      ).to.be.revertedWithCustomError(registry, "NoCommitment");
      await expect(
        registry.reveal(h("different-hash"), CID, [], salt),
      ).to.be.revertedWithCustomError(registry, "NoCommitment");
    });

    it("binds msg.sender: a non-committer's reveal reverts NoCommitment", async () => {
      const { registry, alice, bob } = await loadFixture(deployFixture);
      const modelHash = h("cr-bind");
      const salt = h("salt-bind");
      // Alice commits (commitment binds her address).
      await registry.connect(alice).commit(commitmentFor(modelHash, salt, alice.address));

      // Bob front-runs the reveal with the same args -> his recomputed commitment differs.
      await expect(
        registry.connect(bob).reveal(modelHash, CID, [], salt),
      ).to.be.revertedWithCustomError(registry, "NoCommitment");

      // Alice can still complete her own reveal.
      await expect(registry.connect(alice).reveal(modelHash, CID, [], salt))
        .to.emit(registry, "ModelRegistered")
        .withArgs(modelHash, alice.address, CID, []);
    });

    it("full commit -> later block -> reveal registers and emits ModelRegistered", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      const modelHash = h("cr-full");
      const salt = h("salt-full");
      await registry.commit(commitmentFor(modelHash, salt, owner.address));
      await mine(1); // ensure a later block than the commit

      await expect(registry.reveal(modelHash, CID, [], salt))
        .to.emit(registry, "ModelRegistered")
        .withArgs(modelHash, owner.address, CID, []);

      const m = await registry.getModel(modelHash);
      expect(m.exists).to.equal(true);
      expect(m.owner).to.equal(owner.address);
      // Commitment is consumed on a successful reveal.
      expect(await registry.commitments(commitmentFor(modelHash, salt, owner.address))).to.equal(0n);
    });

    it("reveal enforces the same registration rules (ParentNotRegistered)", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      const modelHash = h("cr-parent");
      const salt = h("salt-parent");
      await registry.commit(commitmentFor(modelHash, salt, owner.address));
      await mine(1);

      await expect(
        registry.reveal(modelHash, CID, [h("ghost")], salt),
      ).to.be.revertedWithCustomError(registry, "ParentNotRegistered");
    });
  });
});
