// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IAdjudicator} from "./IAdjudicator.sol";

contract AgenticCommerce {
    address public immutable owner;
    IERC20 public immutable paymentToken;

    enum JobStatus { Open, Funded, Submitted, Completed, Rejected, Expired, Adjudicating }

    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        bytes32 deliverable;
        string evidenceUri;
        bytes32 rubricHash;
        uint256 expiredAt;
        JobStatus status;
        uint256 createdAt;
    }

    uint256 private _nextJobId = 1;
    mapping(uint256 => Job) public jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed evaluator,
        address provider,
        string description,
        uint256 expiredAt
    );

    event ProviderSet(uint256 indexed jobId, address indexed provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address rejector, bytes32 reason);
    event JobExpired(uint256 indexed jobId);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event ControllerUpdated(address indexed controller, bool authorized);
    event AdjudicatorSet(uint256 indexed jobId, address indexed adjudicator);
    event RubricSet(uint256 indexed jobId, bytes32 rubricHash);
    event EvidenceAttached(uint256 indexed jobId, bytes32 deliverable);
    event AdjudicationRequested(uint256 indexed jobId, address indexed adjudicator, bytes32 caseId);
    event AdjudicationResolved(uint256 indexed jobId, address indexed adjudicator, bool approve, bytes32 reason);
    event AttestedJobSettlement(uint256 indexed jobId, address indexed provider, uint256 amount, uint256 nonce);

    error InvalidJob();
    error WrongStatus();
    error NotClient();
    error NotProvider();
    error NotEvaluator();
    error BudgetMismatch();
    error ProviderRequired();
    error AlreadyProvider();
    error NoAdjudicator();
    error NotAdjudicator();

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(address owner_, address paymentToken_) {
        require(owner_ != address(0), "owner required");
        require(paymentToken_ != address(0), "token required");
        owner = owner_;
        paymentToken = IERC20(paymentToken_);
    }

    // ------------------------------------------------------------------
    // EIP-712 attestation layer (Sprint 1). Domain: name "Microcosm",
    // version "1", chainId = block.chainid (1952 testnet / 196 mainnet),
    // verifyingContract = address(this).
    // ------------------------------------------------------------------

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PAYMENT_AUTH_TYPEHASH =
        keccak256("PaymentAuthorization(bytes32 spaceId,address recipient,uint256 amount,uint256 nonce,uint256 deadline,bytes32 deliverableHash)");
    bytes32 private constant ATTESTATION_NAME_HASH = keccak256(bytes("Microcosm"));
    bytes32 private constant ATTESTATION_VERSION_HASH = keccak256(bytes("1"));

    struct PaymentAuthorization {
        bytes32 spaceId;
        address recipient;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
        bytes32 deliverableHash;
    }

    mapping(address => bool) public controllers;
    mapping(uint256 => bool) public usedAttestationNonces;

    // ------------------------------------------------------------------
    // Internet Court / adjudication adapter (Sprint 2). The evaluator may
    // be an onchain resolver implementing IAdjudicator: it receives
    // (jobId, deliverableHash, evidenceUri, rubricHash) and posts the
    // verdict back. While Adjudicating, payouts halt; only the configured
    // adjudicator contract can resolve.
    // ------------------------------------------------------------------

    mapping(uint256 => address) public jobAdjudicator;
    mapping(uint256 => bytes32) public jobCaseId;

    function setController(address controller, bool authorized) external onlyOwner {
        require(controller != address(0), "controller required");
        controllers[controller] = authorized;
        emit ControllerUpdated(controller, authorized);
    }

    function attestationDigest(PaymentAuthorization calldata auth) public view returns (bytes32) {
        return attestationDigestFor(address(this), block.chainid, auth);
    }

    /// Pure reference encoder so offchain SDKs can cross-check digests
    /// against fixed (contract, chain) pairs in tests and tooling.
    function attestationDigestFor(
        address verifyingContract,
        uint256 chainId,
        PaymentAuthorization calldata auth
    ) public pure returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                PAYMENT_AUTH_TYPEHASH,
                auth.spaceId,
                auth.recipient,
                auth.amount,
                auth.nonce,
                auth.deadline,
                auth.deliverableHash
            )
        );
        bytes32 domain = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, ATTESTATION_NAME_HASH, ATTESTATION_VERSION_HASH, chainId, verifyingContract)
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    /**
     * Release a Submitted job's escrow against a Controller's (or the job
     * evaluator's) EIP-712 authorization. The authorization must name the
     * exact provider, budget, and submitted deliverable hash: money never
     * moves without verifiable deliverable proof.
     */
    function settleJobWithAttestation(
        uint256 jobId,
        PaymentAuthorization calldata auth,
        bytes calldata signature
    ) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Submitted) revert WrongStatus();
        if (job.deliverable == bytes32(0)) revert WrongStatus();
        if (auth.recipient != job.provider) revert BudgetMismatch();
        if (auth.amount != job.budget) revert BudgetMismatch();
        if (auth.deliverableHash != job.deliverable) revert BudgetMismatch();
        if (block.timestamp > auth.deadline) revert WrongStatus();
        if (usedAttestationNonces[auth.nonce]) revert WrongStatus();

        address signer = _recover(attestationDigest(auth), signature);
        if (signer != job.evaluator && !controllers[signer]) revert NotEvaluator();

        usedAttestationNonces[auth.nonce] = true;
        job.status = JobStatus.Completed;

        if (job.budget > 0) {
            bool ok = paymentToken.transfer(job.provider, job.budget);
            require(ok, "transfer failed");
        }

        emit AttestedJobSettlement(jobId, job.provider, job.budget, auth.nonce);
        emit JobCompleted(jobId, auth.deliverableHash);
    }

    /**
     * Bind an Internet Court resolver to a job while still Open. The
     * adjudicator must implement IAdjudicator (GenLayer-compatible).
     */
    function setAdjudicator(uint256 jobId, address adjudicator) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (msg.sender != job.client) revert NotClient();
        if (adjudicator == address(0)) revert NoAdjudicator();

        jobAdjudicator[jobId] = adjudicator;
        emit AdjudicatorSet(jobId, adjudicator);
    }

    /**
     * Pin the acceptance rubric (hash of the rubric document) while Open.
     * The court receives it alongside the deliverable for grounded verdicts.
     */
    function setRubric(uint256 jobId, bytes32 rubricHash) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (msg.sender != job.client) revert NotClient();
        if (rubricHash == bytes32(0)) revert WrongStatus();

        job.rubricHash = rubricHash;
        emit RubricSet(jobId, rubricHash);
    }

    /**
     * Attach an offchain evidence URI (audit pack, repo link, demo video)
     * to the submitted deliverable. Provider-only, before terminal state.
     */
    function attachEvidence(uint256 jobId, string calldata evidenceUri) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Funded && job.status != JobStatus.Submitted) revert WrongStatus();
        if (msg.sender != job.provider) revert NotProvider();
        if (bytes(evidenceUri).length == 0) revert WrongStatus();

        job.evidenceUri = evidenceUri;
        emit EvidenceAttached(jobId, job.deliverable);
    }

    /**
     * Refer a Submitted deliverable to the Internet Court. The resolver
     * receives (jobId, deliverableHash, evidenceUri, rubricHash); the job
     * moves to Adjudicating and all payouts halt until the verdict.
     */
    function requestAdjudication(uint256 jobId) external returns (bytes32 caseId) {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Submitted) revert WrongStatus();
        if (job.deliverable == bytes32(0)) revert WrongStatus();
        if (msg.sender != job.client && msg.sender != job.provider && msg.sender != job.evaluator) {
            revert NotEvaluator();
        }
        address adjudicator = jobAdjudicator[jobId];
        if (adjudicator == address(0)) revert NoAdjudicator();

        caseId = IAdjudicator(adjudicator).requestAdjudication(
            jobId, job.deliverable, job.evidenceUri, job.rubricHash
        );
        jobCaseId[jobId] = caseId;
        job.status = JobStatus.Adjudicating;
        emit AdjudicationRequested(jobId, adjudicator, caseId);
    }

    /**
     * Verdict callback — callable ONLY by the job's adjudicator contract.
     * Approval pays the provider; rejection refunds the client in full
     * (Gaia exception semantics).
     */
    function resolveAdjudication(uint256 jobId, bool approve, bytes32 reason) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Adjudicating) revert WrongStatus();
        if (msg.sender != jobAdjudicator[jobId]) revert NotAdjudicator();

        address adjudicator = msg.sender;
        if (approve) {
            job.status = JobStatus.Completed;
            if (job.budget > 0) {
                bool ok = paymentToken.transfer(job.provider, job.budget);
                require(ok, "transfer failed");
            }
            emit JobCompleted(jobId, reason);
        } else {
            job.status = JobStatus.Rejected;
            if (job.budget > 0) {
                bool ok = paymentToken.transfer(job.client, job.budget);
                require(ok, "transfer failed");
                emit Refunded(jobId, job.client, job.budget);
            }
            emit JobRejected(jobId, adjudicator, reason);
        }
        emit AdjudicationResolved(jobId, adjudicator, approve, reason);
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "bad signature length");
        bytes memory sig = signature;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "bad signature v");
        // No low-s guard (see SettlementRouter): malleation preserves the
        // signer, and replay safety comes from nonces + deadlines.
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "bad signature");
        return signer;
    }

    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description
    ) external returns (uint256 jobId) {
        require(evaluator != address(0), "evaluator required");
        require(expiredAt > block.timestamp, "expiredAt not future");

        jobId = _nextJobId;
        _nextJobId = jobId + 1;

        jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: 0,
            deliverable: bytes32(0),
            evidenceUri: "",
            rubricHash: bytes32(0),
            expiredAt: expiredAt,
            status: JobStatus.Open,
            createdAt: block.timestamp
        });

        emit JobCreated(jobId, msg.sender, evaluator, provider, description, expiredAt);
    }

    function setProvider(uint256 jobId, address provider) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (msg.sender != job.client) revert NotClient();
        if (job.provider != address(0)) revert AlreadyProvider();
        if (provider == address(0)) revert ProviderRequired();

        job.provider = provider;
        emit ProviderSet(jobId, provider);
    }

    function setBudget(uint256 jobId, uint256 amount) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (msg.sender != job.client && msg.sender != job.provider) revert NotClient();

        job.budget = amount;
        emit BudgetSet(jobId, amount);
    }

    function fund(uint256 jobId, uint256 expectedBudget) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (msg.sender != job.client) revert NotClient();
        if (job.provider == address(0)) revert ProviderRequired();
        if (job.budget != expectedBudget) revert BudgetMismatch();
        if (job.budget == 0) revert BudgetMismatch();

        bool ok = paymentToken.transferFrom(msg.sender, address(this), job.budget);
        require(ok, "transfer failed");

        job.status = JobStatus.Funded;
        emit JobFunded(jobId, job.budget);
    }

    function submit(uint256 jobId, bytes32 deliverable) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Funded) revert WrongStatus();
        if (msg.sender != job.provider) revert NotProvider();

        job.deliverable = deliverable;
        job.status = JobStatus.Submitted;
        emit JobSubmitted(jobId, deliverable);
    }

    function complete(uint256 jobId, bytes32 reason) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        if (job.status != JobStatus.Submitted) revert WrongStatus();
        if (msg.sender != job.evaluator) revert NotEvaluator();

        job.status = JobStatus.Completed;

        if (job.budget > 0) {
            bool ok = paymentToken.transfer(job.provider, job.budget);
            require(ok, "transfer failed");
        }

        emit JobCompleted(jobId, reason);
    }

    function rejectJob(uint256 jobId, bytes32 reason) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();

        if (job.status == JobStatus.Open) {
            if (msg.sender != job.client) revert NotClient();
        } else if (job.status == JobStatus.Funded || job.status == JobStatus.Submitted) {
            if (msg.sender != job.evaluator) revert NotEvaluator();
        } else {
            revert WrongStatus();
        }

        address rejector = msg.sender;
        job.status = JobStatus.Rejected;

        if (job.budget > 0) {
            bool ok = paymentToken.transfer(job.client, job.budget);
            require(ok, "transfer failed");
            emit Refunded(jobId, job.client, job.budget);
        }

        emit JobRejected(jobId, rejector, reason);
    }

    function claimRefund(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.id == 0) revert InvalidJob();
        // Adjudicating jobs may also be reclaimed past expiry: the escape
        // hatch guarantees a stalled court can never strand escrowed funds.
        if (job.status != JobStatus.Funded && job.status != JobStatus.Submitted && job.status != JobStatus.Adjudicating) revert WrongStatus();
        if (block.timestamp < job.expiredAt) revert WrongStatus();

        job.status = JobStatus.Expired;

        if (job.budget > 0) {
            bool ok = paymentToken.transfer(job.client, job.budget);
            require(ok, "transfer failed");
            emit Refunded(jobId, job.client, job.budget);
        }

        emit JobExpired(jobId);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
}
