// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcHandshakeEscrow {
    address public immutable USDC;

    constructor(address _usdc) {
        USDC = _usdc;
    }

    enum JobStatus {
        Open,        // 0
        Funded,      // 1
        Submitted,   // 2
        Completed,   // 3
        Rejected,    // 4
        Expired,     // 5
        Disputed     // 6
    }

    struct Job {
        uint256 id;
        address client;       // Buyer
        address provider;     // Seller
        address evaluator;    // AI Agent or Designated Arbitrator
        string description;
        uint256 budget;       // Amount in 6-decimal USDC
        uint256 expiredAt;
        JobStatus status;
        address hook;
        bytes32 deliverableHash;
        bytes32 qrConfirmationHash; // Hashed confirmation code for physical meetups
    }

    uint256 public nextJobId = 1;
    mapping(uint256 => Job) public jobs;

    // Events conforming to ERC-8183
    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 expiredAt,
        address hook
    );
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event Funded(uint256 indexed jobId, uint256 amount);
    event Submitted(uint256 indexed jobId, bytes32 deliverable);
    event Completed(uint256 indexed jobId, bytes32 reason);
    event Rejected(uint256 indexed jobId, bytes32 reason);
    event Disputed(uint256 indexed jobId);
    event DisputeResolved(uint256 indexed jobId, uint8 resolution);

    modifier onlyClient(uint256 jobId) {
        require(msg.sender == jobs[jobId].client, "Only client can call");
        _;
    }

    modifier onlyProvider(uint256 jobId) {
        require(msg.sender == jobs[jobId].provider, "Only provider can call");
        _;
    }

    modifier onlyEvaluator(uint256 jobId) {
        require(msg.sender == jobs[jobId].evaluator, "Only evaluator can call");
        _;
    }

    modifier activeJob(uint256 jobId) {
        require(jobs[jobId].id != 0, "Job does not exist");
        require(block.timestamp < jobs[jobId].expiredAt, "Job expired");
        _;
    }

    /// @notice Creates a new Job escrow
    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external returns (uint256 jobId) {
        require(provider != address(0), "Provider cannot be zero address");
        require(evaluator != address(0), "Evaluator cannot be zero address");
        require(expiredAt > block.timestamp, "Expiration must be in future");

        jobId = nextJobId++;
        jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: 0,
            expiredAt: expiredAt,
            status: JobStatus.Open,
            hook: hook,
            deliverableHash: bytes32(0),
            qrConfirmationHash: bytes32(0)
        });

        emit JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, hook);
    }

    /// @notice Allows physical escrows to configure a QR code release confirmation
    function setQrConfirmation(uint256 jobId, bytes32 qrHash) external onlyClient(jobId) {
        require(jobs[jobId].status == JobStatus.Open, "Can only set before funding");
        jobs[jobId].qrConfirmationHash = qrHash;
    }

    /// @notice Provider sets the budget (price) for the job
    function setBudget(uint256 jobId, uint256 amount, bytes calldata /* optParams */) external onlyProvider(jobId) {
        require(jobs[jobId].status == JobStatus.Open, "Job is not Open");
        jobs[jobId].budget = amount;
        emit BudgetSet(jobId, amount);
    }

    /// @notice Client funds the job, transferring USDC to this contract
    function fund(uint256 jobId, bytes calldata /* optParams */) external onlyClient(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Open, "Job is not Open");
        require(job.budget > 0, "Budget not set by provider");

        job.status = JobStatus.Funded;
        emit Funded(jobId, job.budget);

        // Perform the USDC transfer
        require(
            IERC20(USDC).transferFrom(msg.sender, address(this), job.budget),
            "USDC deposit failed"
        );
    }

    /// @notice Provider submits the deliverable hash (e.g. keccak256 hash of SVG content)
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata /* optParams */) external onlyProvider(jobId) activeJob(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Funded, "Job is not Funded");

        job.status = JobStatus.Submitted;
        job.deliverableHash = deliverable;
        emit Submitted(jobId, deliverable);
    }

    /// @notice Evaluator completes the job and releases the funds to the provider
    function complete(uint256 jobId, bytes32 reason, bytes calldata /* optParams */) external onlyEvaluator(jobId) {
        Job storage job = jobs[jobId];
        require(
            job.status == JobStatus.Submitted || job.status == JobStatus.Funded,
            "Invalid job status"
        );

        job.status = JobStatus.Completed;
        emit Completed(jobId, reason);

        // Transfer funds to provider
        require(
            IERC20(USDC).transfer(job.provider, job.budget),
            "USDC payout failed"
        );
    }

    /// @notice Evaluator rejects the submission, returning state to Funded
    function reject(uint256 jobId, bytes32 reason) external onlyEvaluator(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Submitted, "Job not submitted");

        job.status = JobStatus.Funded;
        emit Rejected(jobId, reason);
    }

    /// @notice Initiates a dispute. Either buyer or seller can freeze the funds if they disagree.
    function dispute(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client || msg.sender == job.provider, "Unauthorized");
        require(job.status == JobStatus.Funded || job.status == JobStatus.Submitted, "Invalid status for dispute");

        job.status = JobStatus.Disputed;
        emit Disputed(jobId);
    }

    /// @notice Allows the designated evaluator/arbitrator to resolve a disputed job
    function resolveDispute(uint256 jobId, uint8 resolution) external onlyEvaluator(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Disputed, "Job is not disputed");
        require(resolution <= 2, "Invalid resolution");

        emit DisputeResolved(jobId, resolution);

        if (resolution == 0) {
            // Refund 100% to Client
            job.status = JobStatus.Rejected;
            require(IERC20(USDC).transfer(job.client, job.budget), "Refund failed");
        } else if (resolution == 1) {
            // Pay 100% to Provider
            job.status = JobStatus.Completed;
            require(IERC20(USDC).transfer(job.provider, job.budget), "Payout failed");
        } else {
            // Split 50/50
            job.status = JobStatus.Completed;
            uint256 half = job.budget / 2;
            require(IERC20(USDC).transfer(job.client, half), "Client split failed");
            require(IERC20(USDC).transfer(job.provider, job.budget - half), "Provider split failed");
        }
    }

    /// @notice Allows instant release of physical escrow using QR-code code confirmation (Client gives code to Provider)
    function qrRelease(uint256 jobId, string calldata code) external onlyProvider(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Funded, "Job is not Funded");
        require(job.qrConfirmationHash != bytes32(0), "QR confirmation not set");
        require(keccak256(abi.encodePacked(code)) == job.qrConfirmationHash, "Invalid confirmation code");

        job.status = JobStatus.Completed;
        emit Completed(jobId, keccak256(abi.encodePacked("QR_RELEASE")));

        // Transfer funds to provider
        require(
            IERC20(USDC).transfer(job.provider, job.budget),
            "USDC payout failed"
        );
    }

    /// @notice Allows refunding the client if the job expires without submission
    function refundExpired(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(block.timestamp >= job.expiredAt, "Job not expired yet");
        require(job.status == JobStatus.Funded || job.status == JobStatus.Submitted, "Invalid status for refund");

        job.status = JobStatus.Expired;
        require(
            IERC20(USDC).transfer(job.client, job.budget),
            "Refund failed"
        );
    }

    /// @notice Utility to fetch job details conforming to ERC-8183
    function getJob(uint256 jobId) external view returns (
        uint256 id,
        address client,
        address provider,
        address evaluator,
        string memory description,
        uint256 budget,
        uint256 expiredAt,
        uint8 status,
        address hook
    ) {
        Job memory job = jobs[jobId];
        return (
            job.id,
            job.client,
            job.provider,
            job.evaluator,
            job.description,
            job.budget,
            job.expiredAt,
            uint8(job.status),
            job.hook
        );
    }
}
