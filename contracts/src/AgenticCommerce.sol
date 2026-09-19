// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

contract AgenticCommerce {
    address public immutable owner;
    IERC20 public immutable paymentToken;

    enum JobStatus { Open, Funded, Submitted, Completed, Rejected, Expired }

    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        bytes32 deliverable;
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

    error InvalidJob();
    error WrongStatus();
    error NotClient();
    error NotProvider();
    error NotEvaluator();
    error BudgetMismatch();
    error ProviderRequired();
    error AlreadyProvider();

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
        if (job.status != JobStatus.Funded && job.status != JobStatus.Submitted) revert WrongStatus();
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
