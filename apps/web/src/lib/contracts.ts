export const escrowAbi = [
  // Events
  {
    type: "event",
    name: "JobCreated",
    inputs: [
      { name: "jobId",    type: "uint256", indexed: true },
      { name: "client",   type: "address", indexed: true },
      { name: "provider", type: "address", indexed: true },
      { name: "evaluator",type: "address", indexed: false },
      { name: "expiredAt",type: "uint256", indexed: false },
      { name: "hook",     type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Funded",
    inputs: [
      { name: "jobId",  type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Completed",
    inputs: [
      { name: "jobId",  type: "uint256", indexed: true },
      { name: "reason", type: "bytes32", indexed: false },
    ],
  },
  // Functions
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setQrConfirmation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "qrHash", type: "bytes32" }
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" }
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "optParams", type: "bytes" }
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "optParams", type: "bytes" }
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "complete",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" }
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reject",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" }
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "qrRelease",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "code", type: "string" }
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "dispute",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveDispute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "resolution", type: "uint8" }
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refundExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "client", type: "address" },
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "description", type: "string" },
      { name: "budget", type: "uint256" },
      { name: "expiredAt", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "hook", type: "address" }
    ],
  },
  {
    type: "function",
    name: "jobs",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "client", type: "address" },
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "description", type: "string" },
      { name: "budget", type: "uint256" },
      { name: "expiredAt", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "hook", type: "address" },
      { name: "deliverableHash", type: "bytes32" },
      { name: "qrConfirmationHash", type: "bytes32" }
    ],
  }
] as const;

export const treasuryAbi = [
  // ── Events ──────────────────────────────────────────────────────────────
  { type: "event", name: "Deposited",              inputs: [{ name: "member",    type: "address", indexed: true  }, { name: "amount",    type: "uint256", indexed: false }] },
  { type: "event", name: "ProposalCreated",        inputs: [{ name: "proposalId",type: "uint256", indexed: true  }, { name: "proposer",  type: "address", indexed: false }, { name: "recipient", type: "address", indexed: false }, { name: "amount", type: "uint256", indexed: false }] },
  { type: "event", name: "Voted",                  inputs: [{ name: "proposalId",type: "uint256", indexed: true  }, { name: "voter",     type: "address", indexed: true  }, { name: "support",   type: "bool",    indexed: false }] },
  { type: "event", name: "ProposalExecuted",       inputs: [{ name: "proposalId",type: "uint256", indexed: true  }, { name: "recipient", type: "address", indexed: false }, { name: "amount",    type: "uint256", indexed: false }] },
  { type: "event", name: "ProposalRejected",       inputs: [{ name: "proposalId",type: "uint256", indexed: true  }] },
  { type: "event", name: "SpendingPolicyUpdated",  inputs: [{ name: "member",    type: "address", indexed: true  }, { name: "dailyLimit",type: "uint256", indexed: false }] },
  { type: "event", name: "DirectSpendExecuted",    inputs: [{ name: "member",    type: "address", indexed: true  }, { name: "recipient", type: "address", indexed: true  }, { name: "amount",    type: "uint256", indexed: false }] },

  // ── State reads ──────────────────────────────────────────────────────────
  { type: "function", name: "getBalance",      stateMutability: "view",        inputs: [],                                                         outputs: [{ type: "uint256" }] },
  { type: "function", name: "getMembersCount", stateMutability: "view",        inputs: [],                                                         outputs: [{ type: "uint256" }] },
  { type: "function", name: "nextProposalId",  stateMutability: "view",        inputs: [],                                                         outputs: [{ type: "uint256" }] },
  { type: "function", name: "admin",           stateMutability: "view",        inputs: [],                                                         outputs: [{ type: "address" }] },
  { type: "function", name: "votingDuration",  stateMutability: "view",        inputs: [],                                                         outputs: [{ type: "uint256" }] },
  { type: "function", name: "isMember",        stateMutability: "view",        inputs: [{ name: "addr",       type: "address" }],                  outputs: [{ type: "bool"    }] },
  { type: "function", name: "membersList",     stateMutability: "view",        inputs: [{ name: "index",      type: "uint256" }],                  outputs: [{ type: "address" }] },
  {
    type: "function", name: "proposals", stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      { name: "id",              type: "uint256" },
      { name: "proposer",        type: "address" },
      { name: "recipient",       type: "address" },
      { name: "amount",          type: "uint256" },
      { name: "description",     type: "string"  },
      { name: "votesFor",        type: "uint256" },
      { name: "votesAgainst",    type: "uint256" },
      { name: "votingDeadline",  type: "uint256" },
      { name: "executed",        type: "bool"    },
      { name: "rejected",        type: "bool"    },
    ],
  },
  {
    type: "function", name: "spendingPolicies", stateMutability: "view",
    inputs: [{ name: "member", type: "address" }],
    outputs: [
      { name: "dailyLimit",         type: "uint256" },
      { name: "lastSpentTimestamp", type: "uint256" },
      { name: "spentToday",         type: "uint256" },
    ],
  },
  { type: "function", name: "hasVoted", stateMutability: "view", inputs: [{ name: "proposalId", type: "uint256" }, { name: "voter", type: "address" }], outputs: [{ type: "bool" }] },

  // ── Write functions ──────────────────────────────────────────────────────
  { type: "function", name: "deposit",            stateMutability: "nonpayable", inputs: [{ name: "amount",      type: "uint256" }],                                                                                              outputs: [] },
  { type: "function", name: "proposeSpend",       stateMutability: "nonpayable", inputs: [{ name: "recipient",   type: "address" }, { name: "amount", type: "uint256" }, { name: "description", type: "string" }],              outputs: [{ type: "uint256" }] },
  { type: "function", name: "vote",               stateMutability: "nonpayable", inputs: [{ name: "proposalId",  type: "uint256" }, { name: "support", type: "bool" }],                                                         outputs: [] },
  { type: "function", name: "executeSpend",       stateMutability: "nonpayable", inputs: [{ name: "proposalId",  type: "uint256" }],                                                                                             outputs: [] },
  { type: "function", name: "directSpend",        stateMutability: "nonpayable", inputs: [{ name: "recipient",   type: "address" }, { name: "amount", type: "uint256" }],                                                       outputs: [] },
  { type: "function", name: "addMember",          stateMutability: "nonpayable", inputs: [{ name: "_member",     type: "address" }],                                                                                             outputs: [] },
  { type: "function", name: "removeMember",       stateMutability: "nonpayable", inputs: [{ name: "_member",     type: "address" }],                                                                                             outputs: [] },
  { type: "function", name: "setSpendingPolicy",  stateMutability: "nonpayable", inputs: [{ name: "member",      type: "address" }, { name: "dailyLimit", type: "uint256" }],                                                   outputs: [] },
] as const;


// Read addresses from public env or fallback to deployed testnet addresses
export const DEPLOYED_ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "0x40aC372780Db3772E1810A515b8D0b71081902be") as `0x${string}`;
export const DEPLOYED_TREASURY_ADDRESS = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "0x29984fd25B15Cd271e4ebAD350a2Ca2269a65304") as `0x${string}`;
export const DEPLOYED_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const factoryAbi = [
  {
    type: "event",
    name: "TreasuryDeployed",
    inputs: [
      { name: "treasuryAddress", type: "address", indexed: true },
      { name: "adminAddress", type: "address", indexed: true }
    ]
  },
  {
    type: "function",
    name: "deployTreasury",
    stateMutability: "nonpayable",
    inputs: [{ name: "_usdc", type: "address" }],
    outputs: [{ type: "address" }]
  }
] as const;
