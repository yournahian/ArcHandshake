// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcGroupTreasury {
    address public immutable USDC;

    struct Proposal {
        uint256 id;
        address proposer;
        address recipient;
        uint256 amount;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 votingDeadline;
        bool executed;
        bool rejected;
    }

    struct SpendingPolicy {
        uint256 dailyLimit;
        uint256 lastSpentTimestamp;
        uint256 spentToday;
    }

    address public admin;
    uint256 public nextProposalId = 1;
    uint256 public votingDuration = 3 days;
    
    // Group members who can vote and propose
    address[] public membersList;
    mapping(address => bool) public isMember;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(address => SpendingPolicy) public spendingPolicies;

    event Deposited(address indexed member, uint256 amount);
    event ProposalCreated(uint256 indexed proposalId, address proposer, address recipient, uint256 amount);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support);
    event ProposalExecuted(uint256 indexed proposalId, address recipient, uint256 amount);
    event ProposalRejected(uint256 indexed proposalId);
    event SpendingPolicyUpdated(address indexed member, uint256 dailyLimit);
    event DirectSpendExecuted(address indexed member, address indexed recipient, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call");
        _;
    }

    modifier onlyMember() {
        require(isMember[msg.sender], "Only group members can call");
        _;
    }

    constructor(address _usdc) {
        admin = msg.sender;
        isMember[msg.sender] = true;
        membersList.push(msg.sender);
        USDC = _usdc;
    }

    /// @notice Allows the admin to manage group membership
    function addMember(address _member) external onlyAdmin {
        require(!isMember[_member], "Already member");
        isMember[_member] = true;
        membersList.push(_member);
    }

    function removeMember(address _member) external onlyAdmin {
        require(isMember[_member], "Not a member");
        isMember[_member] = false;
        // Clean up from array
        for (uint256 i = 0; i < membersList.length; i++) {
            if (membersList[i] == _member) {
                membersList[i] = membersList[membersList.length - 1];
                membersList.pop();
                break;
            }
        }
    }

    /// @notice Members deposit USDC into the shared treasury
    function deposit(uint256 amount) external onlyMember {
        require(amount > 0, "Deposit must be greater than zero");
        emit Deposited(msg.sender, amount);
        require(
            IERC20(USDC).transferFrom(msg.sender, address(this), amount),
            "USDC deposit failed"
        );
    }

    /// @notice Admin sets custom daily spend limit for a member
    function setSpendingPolicy(address member, uint256 dailyLimit) external onlyAdmin {
        require(isMember[member], "Address must be a member");
        spendingPolicies[member].dailyLimit = dailyLimit;
        emit SpendingPolicyUpdated(member, dailyLimit);
    }

    /// @notice Execute direct spend without voting if within member's daily allowance policy
    function directSpend(address recipient, uint256 amount) external onlyMember {
        SpendingPolicy storage policy = spendingPolicies[msg.sender];
        require(policy.dailyLimit > 0, "No direct spending policy set");

        // Reset spentToday if a day has passed
        if (block.timestamp > policy.lastSpentTimestamp + 1 days) {
            policy.spentToday = 0;
            policy.lastSpentTimestamp = block.timestamp;
        }

        require(policy.spentToday + amount <= policy.dailyLimit, "Exceeds daily spending limit");
        policy.spentToday += amount;

        emit DirectSpendExecuted(msg.sender, recipient, amount);
        require(IERC20(USDC).transfer(recipient, amount), "USDC transfer failed");
    }

    /// @notice Propose a large expenditure requiring a group vote
    function proposeSpend(
        address recipient,
        uint256 amount,
        string calldata description
    ) external onlyMember returns (uint256 proposalId) {
        proposalId = nextProposalId++;
        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            recipient: recipient,
            amount: amount,
            description: description,
            votesFor: 0,
            votesAgainst: 0,
            votingDeadline: block.timestamp + votingDuration,
            executed: false,
            rejected: false
        });

        emit ProposalCreated(proposalId, msg.sender, recipient, amount);
    }

    /// @notice Vote on a proposal
    function vote(uint256 proposalId, bool support) external onlyMember {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.id != 0, "Proposal does not exist");
        require(block.timestamp < proposal.votingDeadline, "Voting ended");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            proposal.votesFor++;
        } else {
            proposal.votesAgainst++;
        }

        emit Voted(proposalId, msg.sender, support);
    }

    /// @notice Execute proposal after deadline if majority support is achieved
    function executeSpend(uint256 proposalId) external onlyMember {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.id != 0, "Proposal does not exist");
        require(!proposal.executed, "Already executed");
        require(!proposal.rejected, "Already rejected");
        
        // Either deadline passed, or absolute majority of ALL group members has voted yes
        bool isMajorityOfAll = proposal.votesFor > membersList.length / 2;
        bool deadlinePassed = block.timestamp >= proposal.votingDeadline;
        
        require(isMajorityOfAll || deadlinePassed, "Cannot execute yet");

        if (proposal.votesFor > proposal.votesAgainst) {
            proposal.executed = true;
            emit ProposalExecuted(proposalId, proposal.recipient, proposal.amount);
            require(IERC20(USDC).transfer(proposal.recipient, proposal.amount), "USDC transfer failed");
        } else {
            proposal.rejected = true;
            emit ProposalRejected(proposalId);
        }
    }

    /// @notice Fetch number of active members
    function getMembersCount() external view returns (uint256) {
        return membersList.length;
    }

    /// @notice Utility to check pool balance
    function getBalance() external view returns (uint256) {
        return IERC20(USDC).balanceOf(address(this));
    }
}
