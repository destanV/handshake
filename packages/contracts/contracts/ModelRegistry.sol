// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ModelRegistry
/// @notice Provenance registry for AI models on Avalanche Fuji (chainId 43113).
/// @dev On-chain is the source of truth for `(modelHash => owner, metadataCID, in-registry parents)`.
///      License, version, tags, lifecycle (isActive) and external (HuggingFace) lineage are
///      intentionally kept OFF-chain (Mongo / IPFS metadata) — see Phase-2 spec Decisions A, B, C, L.
///
///      Ownership front-running: `modelHash` is public in the mempool, so a bot can observe a pending
///      `registerModel` and claim the hash from another wallet first. `registerModel` is therefore
///      documented as front-runnable. The commit-reveal path (`commit`/`reveal`) mitigates this: a
///      sealed `commit(keccak256(abi.encode(modelHash, salt, msg.sender)))` binds `msg.sender`, so an
///      observer cannot pre-commit a matching commitment for someone else's reveal. Residual cost is
///      two signatures / two transactions and client-side salt custody. See Decision N.
///
///      No reentrancy surface: no state-changing function performs an external call (Decision G).
contract ModelRegistry {
    struct Model {
        bytes32 modelHash; // blake3 of manifest JSON; primary key
        string metadataCID; // IPFS CIDv1
        address owner;
        address pendingOwner; // 2-step transfer
        bytes32[] parents; // in-registry parents only; external lineage stays off-chain
        bool exists;
    }

    /// @notice Maximum number of on-chain (in-registry) parents per model.
    uint8 public constant MAX_PARENTS = 8;

    /// @notice Blocks a commitment stays valid for; the reveal must land within this window.
    uint256 public constant REVEAL_WINDOW = 240; // ~minutes on Fuji

    mapping(bytes32 => Model) private models;

    /// @notice commitment => commit block number (0 = no commitment).
    mapping(bytes32 => uint256) public commitments;

    event ModelCommitted(bytes32 indexed commitment, address indexed committer);
    event ModelRegistered(
        bytes32 indexed modelHash, address indexed owner, string metadataCID, bytes32[] parents
    );
    event MetadataUpdated(bytes32 indexed modelHash, string metadataCID);
    event OwnershipTransferInitiated(
        bytes32 indexed modelHash, address indexed from, address indexed to
    );
    event OwnershipTransferred(bytes32 indexed modelHash, address indexed from, address indexed to);

    error AlreadyRegistered();
    error NotRegistered();
    error NotOwner();
    error TooManyParents();
    error ParentNotRegistered();
    error NotPendingOwner();
    error ZeroAddress();
    error CommitmentExists();
    error NoCommitment();
    error CommitTooRecent(); // reveal in the same block as the commit
    error CommitExpired(); // reveal past REVEAL_WINDOW

    // --- Registration ---

    /// @notice Register a model. The caller becomes its owner (first-come).
    /// @dev Front-runnable (see contract @dev). Reverts `AlreadyRegistered` on a duplicate hash,
    ///      `TooManyParents` past MAX_PARENTS, and `ParentNotRegistered` if any listed parent is not
    ///      itself registered (Decision L: on-chain `parents` are in-registry only).
    /// @param modelHash blake3 of the manifest JSON (32 bytes).
    /// @param metadataCID IPFS CIDv1 of the off-chain metadata JSON.
    /// @param parents In-registry parent hashes (each must already exist), at most MAX_PARENTS.
    function registerModel(bytes32 modelHash, string calldata metadataCID, bytes32[] calldata parents)
        external
    {
        _register(modelHash, metadataCID, parents);
    }

    /// @dev Shared registration body. Also reused by the commit-reveal path.
    function _register(bytes32 modelHash, string calldata metadataCID, bytes32[] calldata parents)
        internal
    {
        if (models[modelHash].exists) revert AlreadyRegistered();
        if (parents.length > MAX_PARENTS) revert TooManyParents();

        for (uint256 i = 0; i < parents.length; i++) {
            if (!models[parents[i]].exists) revert ParentNotRegistered();
        }

        Model storage m = models[modelHash];
        m.modelHash = modelHash;
        m.metadataCID = metadataCID;
        m.owner = msg.sender;
        m.exists = true;
        for (uint256 i = 0; i < parents.length; i++) {
            m.parents.push(parents[i]);
        }

        emit ModelRegistered(modelHash, msg.sender, metadataCID, parents);
    }

    // --- Commit-reveal (preferred path; mitigates ownership front-running — Decision N) ---

    /// @notice Step 1: publish a sealed commitment = keccak256(abi.encode(modelHash, salt, msg.sender)).
    /// @dev Because the commitment binds msg.sender, an observer who sees it in the mempool cannot
    ///      reuse it: their reveal would recompute a different commitment (their own address) and
    ///      revert NoCommitment. `salt` is a client-side random bytes32 kept off-chain until reveal.
    function commit(bytes32 commitment) external {
        if (commitments[commitment] != 0) revert CommitmentExists();
        commitments[commitment] = block.number;
        emit ModelCommitted(commitment, msg.sender);
    }

    /// @notice Step 2: reveal the commitment and register in one tx. Must be in a later block than
    ///         the commit (CommitTooRecent) and within REVEAL_WINDOW (CommitExpired). Runs the same
    ///         registration logic as registerModel via the shared _register body.
    function reveal(
        bytes32 modelHash,
        string calldata metadataCID,
        bytes32[] calldata parents,
        bytes32 salt
    ) external {
        bytes32 commitment = keccak256(abi.encode(modelHash, salt, msg.sender));
        uint256 committedAt = commitments[commitment];
        if (committedAt == 0) revert NoCommitment();
        if (block.number == committedAt) revert CommitTooRecent();
        if (block.number > committedAt + REVEAL_WINDOW) revert CommitExpired();

        delete commitments[commitment];
        _register(modelHash, metadataCID, parents);
    }

    /// @notice Update a model's metadata pointer. Owner-only; `modelHash` is immutable (Decision E).
    function updateMetadata(bytes32 modelHash, string calldata metadataCID) external {
        Model storage m = models[modelHash];
        if (!m.exists) revert NotRegistered();
        if (m.owner != msg.sender) revert NotOwner();

        m.metadataCID = metadataCID;
        emit MetadataUpdated(modelHash, metadataCID);
    }

    // --- 2-step ownership transfer (Ownable2Step semantics, per model — Decision F) ---

    /// @notice Step 1: current owner nominates a new owner. The nominee must call `acceptOwnership`.
    function transferOwnership(bytes32 modelHash, address newOwner) external {
        Model storage m = models[modelHash];
        if (!m.exists) revert NotRegistered();
        if (m.owner != msg.sender) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();

        m.pendingOwner = newOwner;
        emit OwnershipTransferInitiated(modelHash, msg.sender, newOwner);
    }

    /// @notice Step 2: the nominated owner accepts and becomes the owner.
    function acceptOwnership(bytes32 modelHash) external {
        Model storage m = models[modelHash];
        if (!m.exists) revert NotRegistered();
        if (m.pendingOwner != msg.sender) revert NotPendingOwner();

        address from = m.owner;
        m.owner = msg.sender;
        m.pendingOwner = address(0);
        emit OwnershipTransferred(modelHash, from, msg.sender);
    }

    // --- Views ---

    /// @notice Returns the full stored struct. For an unregistered hash, returns a zero struct with
    ///         `exists == false` (mapping default) so off-chain walkers can branch on `.exists`.
    /// @dev No on-chain `getLineage`: deep recursion (depth x MAX_PARENTS) is exponential and would
    ///      exceed `eth_call` gas. The DAG is reconstructed OFF-chain by walking immediate `parents`
    ///      hop-by-hop and verifying each edge with `getModel` (Decision M).
    function getModel(bytes32 modelHash) external view returns (Model memory) {
        return models[modelHash];
    }
}
