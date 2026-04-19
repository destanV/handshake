// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title InferenceClaim
 * @notice Minimal OPML (Optimistic Machine Learning) proof-of-inference contract.
 *
 * HOW IT WORKS
 * ────────────
 * 1. Provider runs ML inference off-chain, then COMMITS to the result on-chain:
 *      submitClaim(modelHash, inputHash, keccak256(rawOutput))
 *    Nobody can see the actual output yet — only a hash. This is the "commitment".
 *
 * 2. A challenge window opens. Anyone who suspects fraud can call:
 *      challengeClaim(claimId)
 *
 * 3a. If nobody challenges before the window expires, the claim is trusted:
 *      finalizeClaim(claimId)  →  status = Verified
 *    This is the "optimistic" assumption: silence = honest.
 *
 * 3b. If challenged, the provider must REVEAL the actual output:
 *      revealOutput(claimId, rawOutput)
 *    The contract checks: keccak256(rawOutput) == committed outputHash
 *      match     →  provider was honest  →  status = Verified
 *      no match  →  provider lied        →  status = Rejected
 *
 * SIMPLIFICATION vs REAL OPML
 * ────────────────────────────
 * Real OPML uses a bisection game + on-chain MIPS/EVM VM to pinpoint and
 * re-execute the single wrong computation step. This POC replaces that with
 * a one-round commitment-reveal — which is exactly how the final step of a
 * real bisection resolves. So this is pedagogically accurate, just without
 * the intermediate bisection rounds.
 *
 * STATE MACHINE
 * ─────────────
 *   submitClaim()
 *       │
 *       ▼
 *   [Pending]  ◄── challenge window open
 *       │
 *       ├── challengeClaim() ──────────────► [Challenged]
 *       │                                          │
 *       │                              revealOutput(rawOutput)
 *       │                                ┌─────────┴──────────┐
 *       │                          hash matches          hash mismatch
 *       │                                │                     │
 *       │                           [Verified]           [Rejected]
 *       │
 *       └── finalizeClaim() (window expired) ──────────► [Verified]
 */
contract InferenceClaim {
    // ── Enums ──────────────────────────────────────────────────────────────────

    enum ClaimStatus {
        Pending,    // submitted, challenge window open
        Challenged, // disputed, awaiting provider reveal
        Verified,   // confirmed honest (no challenge OR reveal matched)
        Rejected    // provider's commitment was fraudulent
    }

    // ── Structs ────────────────────────────────────────────────────────────────

    struct Claim {
        address     provider;    // who submitted the inference claim
        bytes32     modelHash;   // keccak256 of the model weights (e.g. BLAKE3 from Handshake)
        bytes32     inputHash;   // keccak256 of the raw input data
        bytes32     outputHash;  // the commitment: keccak256(rawOutput) — NOT the output itself
        uint256     submittedAt; // block.timestamp when submitted
        address     challenger;  // who opened the dispute (address(0) if none)
        ClaimStatus status;
    }

    // ── Storage ────────────────────────────────────────────────────────────────

    /// @notice Duration of the challenge window in seconds. Set once at deploy.
    uint256 public immutable CHALLENGE_WINDOW;

    /// @notice Auto-incrementing claim ID. Starts at 1 so that ID 0 is always invalid.
    uint256 public nextClaimId = 1;

    /// @notice All submitted claims keyed by their ID.
    mapping(uint256 => Claim) public claims;

    // ── Events ─────────────────────────────────────────────────────────────────

    /// @notice Emitted when a new inference claim is submitted.
    event ClaimSubmitted(
        uint256 indexed claimId,
        address indexed provider,
        bytes32 modelHash,
        bytes32 inputHash,
        bytes32 outputHash,
        uint256 challengeDeadline
    );

    /// @notice Emitted when a claim is challenged.
    event ClaimChallenged(
        uint256 indexed claimId,
        address indexed challenger
    );

    /// @notice Emitted when the provider reveals their output in response to a challenge.
    /// @param honest true  = keccak256(rawOutput) matched the commitment (provider wins)
    ///               false = it did not match (fraud proven, provider loses)
    event OutputRevealed(
        uint256 indexed claimId,
        bool    honest,
        bytes   rawOutput
    );

    /// @notice Emitted whenever a claim reaches a terminal state (Verified or Rejected).
    event ClaimFinalized(
        uint256 indexed claimId,
        ClaimStatus finalStatus
    );

    // ── Constructor ────────────────────────────────────────────────────────────

    /// @param challengeWindow Seconds within which a claim can be challenged.
    ///        Use 60 for tests, 10 for the demo script.
    constructor(uint256 challengeWindow) {
        CHALLENGE_WINDOW = challengeWindow;
    }

    // ── External Functions ─────────────────────────────────────────────────────

    /**
     * @notice Submit an inference claim on-chain.
     *
     * @dev The provider runs inference OFF-chain and commits to the result:
     *      outputHash = keccak256(rawOutput)
     *      The actual rawOutput is NOT sent here — only its hash.
     *      This is the "optimistic" step: the system trusts the claim unless challenged.
     *
     * @param modelHash  keccak256 of the model weights file
     * @param inputHash  keccak256 of the raw input bytes
     * @param outputHash keccak256(rawOutput) — the cryptographic commitment
     * @return claimId   The assigned ID for this claim (starts at 1)
     */
    function submitClaim(
        bytes32 modelHash,
        bytes32 inputHash,
        bytes32 outputHash
    ) external returns (uint256 claimId) {
        claimId = nextClaimId++;
        claims[claimId] = Claim({
            provider:   msg.sender,
            modelHash:  modelHash,
            inputHash:  inputHash,
            outputHash: outputHash,
            submittedAt: block.timestamp,
            challenger: address(0),
            status:     ClaimStatus.Pending
        });
        emit ClaimSubmitted(
            claimId, msg.sender, modelHash, inputHash,
            outputHash, block.timestamp + CHALLENGE_WINDOW
        );
    }

    /**
     * @notice Challenge a pending claim within the challenge window.
     *
     * @dev In real OPML, the challenger would also stake tokens (slashed if wrong).
     *      That is omitted here to keep the POC focused on the core mechanism.
     *
     * @param claimId The ID of the claim to challenge.
     */
    function challengeClaim(uint256 claimId) external {
        Claim storage c = claims[claimId];
        require(c.status == ClaimStatus.Pending, "Not pending");
        require(
            block.timestamp <= c.submittedAt + CHALLENGE_WINDOW,
            "Challenge window expired"
        );
        c.status = ClaimStatus.Challenged;
        c.challenger = msg.sender;
        emit ClaimChallenged(claimId, msg.sender);
    }

    /**
     * @notice Reveal the actual output to resolve a challenge.
     *
     * @dev Only the original provider can call this. The contract checks:
     *      keccak256(abi.encodePacked(rawOutput)) == claim.outputHash
     *
     *      match     → provider was honest → Verified
     *      no match  → provider lied       → Rejected
     *
     *      rawOutput is bytes (not string) because real model output can be
     *      arbitrary binary data (tensors, embeddings, etc.), not just UTF-8 text.
     *
     * @param claimId   The ID of the challenged claim.
     * @param rawOutput The actual inference output bytes (preimage of outputHash).
     */
    function revealOutput(uint256 claimId, bytes calldata rawOutput) external {
        Claim storage c = claims[claimId];
        require(msg.sender == c.provider, "Only provider");
        require(c.status == ClaimStatus.Challenged, "Not challenged");

        bool honest = keccak256(abi.encodePacked(rawOutput)) == c.outputHash;
        c.status = honest ? ClaimStatus.Verified : ClaimStatus.Rejected;

        emit OutputRevealed(claimId, honest, rawOutput);
        emit ClaimFinalized(claimId, c.status);
    }

    /**
     * @notice Finalize a claim that was never challenged.
     *
     * @dev Anyone can call this after the challenge window expires.
     *      If nobody challenged within the window, the optimistic assumption holds:
     *      the claim is considered honest and moves to Verified.
     *
     * @param claimId The ID of the unchallenged pending claim.
     */
    function finalizeClaim(uint256 claimId) external {
        Claim storage c = claims[claimId];
        require(c.status == ClaimStatus.Pending, "Not pending");
        require(
            block.timestamp > c.submittedAt + CHALLENGE_WINDOW,
            "Challenge window still open"
        );
        c.status = ClaimStatus.Verified;
        emit ClaimFinalized(claimId, ClaimStatus.Verified);
    }

    // ── View Functions ─────────────────────────────────────────────────────────

    /// @notice Returns full claim data.
    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return claims[claimId];
    }

    /// @notice Returns the timestamp after which the claim can be finalized unchallenged.
    function getChallengeDeadline(uint256 claimId) external view returns (uint256) {
        return claims[claimId].submittedAt + CHALLENGE_WINDOW;
    }
}
