/**
 * Tool definitions and handlers for Microcosm MCP server.
 * Pure functions taking (store, args) -> tool response object.
 */

export const TOOL_DEFINITIONS = [
  {
    name: 'spaces_list',
    description: 'List all Spaces that the caller (human or agent) can operate in or view.',
    inputSchema: {
      type: 'object',
      properties: {
        actorId: {
          type: 'string',
          description: 'Optional ID of the requesting actor. If omitted, lists public/discoverable Spaces.',
        },
      },
    },
  },
  {
    name: 'spaces_create',
    description: "Create a Space: the bounded operating context that keeps a group's requests, participants, work, payments, rules, and activity together. The founder becomes the first participant and Space admin.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human-readable Space name.' },
        description: { type: 'string', description: 'What this Space operates: its purpose and bounds.' },
        network: { type: 'string', description: 'Settlement network (defaults to OKX X Layer Testnet).' },
        chainId: { type: 'number', description: 'Settlement chain ID (defaults to 1952).' },
        actorId: { type: 'string', description: 'Founder creating the Space.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'spaces_fund',
    description: 'Fund a Space treasury with USDC. Admin-only.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space to fund.' },
        amount: { type: 'string', description: 'USDC amount to add to the treasury.' },
        actorId: { type: 'string', description: 'Admin funding the Space.' },
      },
      required: ['spaceId', 'amount', 'actorId'],
    },
  },
  {
    name: 'spaces_capabilities',
    description: 'Discover the exact rules, spending caps, daily allowance, and approved counterparties for a specific Space.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          description: 'The unique ID of the Space to inspect.',
        },
        actorId: {
          type: 'string',
          description: 'The ID of the agent or user requesting capabilities.',
        },
      },
      required: ['spaceId', 'actorId'],
    },
  },
  {
    name: 'spaces_capability_manifest',
    description: 'Read the deterministic, sanitized capability manifest for a Space.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'The Space ID to inspect.' },
      },
      required: ['spaceId'],
    },
  },
  {
    name: 'payments_x402_validate',
    description: 'Validate an x402 v2 PaymentRequired declaration offline against the selected accept and Space policy. Does not sign, settle, or mutate state.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        paymentRequired: { type: 'object' },
        selectedAcceptIndex: { type: 'integer', minimum: 0 },
        actorId: { type: 'string' },
        expectedAssetAddress: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
      },
      required: ['spaceId', 'paymentRequired', 'selectedAcceptIndex', 'actorId', 'expectedAssetAddress'],
    },
  },
  {
    name: 'payments_request',
    description: 'Request a disbursement from a Space treasury to a recipient. Checked against Space policy rules before settlement.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          description: 'The Space ID from which funds should be disbursed.',
        },
        actorId: {
          type: 'string',
          description: 'The ID of the agent or user making the request.',
        },
        recipient: {
          type: 'string',
          description: 'The destination wallet address, ENS/name, or approved counterparty identifier.',
        },
        amount: {
          type: 'string',
          description: 'Amount in USDC decimal string (e.g. "350.00").',
        },
        memo: {
          type: 'string',
          description: 'Description of the service, compute hours, or work deliverable.',
        },
      },
      required: ['spaceId', 'actorId', 'recipient', 'amount'],
    },
  },
  {
    name: 'governance_payments_configure',
    description: 'Configure explicit M-of-N governance signers for a Space as an admin.',
    inputSchema: {
      type: 'object',
      properties: { spaceId: { type: 'string' }, actorAddress: { type: 'string' }, threshold: { type: 'integer' }, signerAllowlist: { type: 'array', items: { type: 'string' } }, enabled: { type: 'boolean' } },
      required: ['spaceId', 'actorAddress', 'threshold', 'signerAllowlist'],
    },
  },
  {
    name: 'governance_payments_get',
    description: 'Read the explicit M-of-N governance configuration for a Space.',
    inputSchema: { type: 'object', properties: { spaceId: { type: 'string' } }, required: ['spaceId'] },
  },
  {
    name: 'governance_payments_create',
    description: 'Queue a high-value direct Space payment for M-of-N governance approval.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        requesterAddress: { type: 'string' },
        recipient: { type: 'string' },
        amount: { type: 'string' },
        memo: { type: 'string' },
        deadline: { type: 'string' },
      },
      required: ['spaceId', 'requesterAddress', 'recipient', 'amount', 'deadline'],
    },
  },
  {
    name: 'governance_requests_list',
    description: 'List governance payment requests in a Space.',
    inputSchema: { type: 'object', properties: { spaceId: { type: 'string' }, status: { type: 'string' } }, required: ['spaceId'] },
  },
  {
    name: 'governance_requests_get',
    description: 'Read one governance payment request and its approvals.',
    inputSchema: { type: 'object', properties: { spaceId: { type: 'string' }, requestId: { type: 'string' } }, required: ['spaceId', 'requestId'] },
  },
  {
    name: 'governance_requests_sign',
    description: 'Sign a governance payment request with an explicitly identified authorized wallet.',
    inputSchema: {
      type: 'object',
      properties: { spaceId: { type: 'string' }, requestId: { type: 'string' }, signerAddress: { type: 'string' }, signature: { type: 'string' } },
      required: ['spaceId', 'requestId', 'signerAddress', 'signature'],
    },
  },
  {
    name: 'governance_requests_execute',
    description: 'Execute an approved governance payment after immediate policy re-evaluation.',
    inputSchema: { type: 'object', properties: { spaceId: { type: 'string' }, requestId: { type: 'string' }, actorAddress: { type: 'string' } }, required: ['spaceId', 'requestId', 'actorAddress'] },
  },
  {
    name: 'activity_list',
    description: 'List the audit log of all settled payments and rejected policy denials for a Space.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          description: 'The Space ID whose activity log should be retrieved.',
        },
      },
      required: ['spaceId'],
    },
  },
  {
    name: 'work_create',
    description: 'Create a Work Order in a Space: escrows budget from the Space treasury. Money never moves without a Work Order.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          description: 'The Space ID that funds and governs the work.',
        },
        actorId: {
          type: 'string',
          description: 'The client (human or agent) requesting the work.',
        },
        provider: {
          type: 'string',
          description: 'The provider who will perform the work (address or agent ID).',
        },
        evaluator: {
          type: 'string',
          description: 'The evaluator who approves or rejects the deliverable.',
        },
        description: {
          type: 'string',
          description: 'Description of the requested work and acceptance criteria.',
        },
        adjudicator: {
          type: 'string',
          description: 'Optional: Internet Court resolver ID. Court-bound work settles only through the court verdict.',
        },
        rubricHash: {
          type: 'string',
          description: 'Optional: hash of the acceptance rubric the court judges against.',
        },
        budget: {
          type: 'string',
          description: 'Budget in USDC decimal string (e.g. "350.00"). Escrowed immediately.',
        },
        deadline: {
          type: 'string',
          description: 'Future deadline (ISO date or epoch). Past-deadline work triggers Gaia refund.',
        },
      },
      required: ['spaceId', 'actorId', 'provider', 'evaluator', 'description', 'budget', 'deadline'],
    },
  },
  {
    name: 'work_submit',
    description: 'Provider submits verifiable deliverable proof (hash) for a funded Work Order.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          description: 'The Space ID that governs the work.',
        },
        jobId: {
          type: 'string',
          description: 'The Work Order ID to submit deliverables for.',
        },
        actorId: {
          type: 'string',
          description: 'The provider submitting the deliverable (must match Work Order provider).',
        },
        deliverableHash: {
          type: 'string',
          description: 'Hash of the verifiable deliverable (e.g. keccak256 of artifact).',
        },
        evidenceUri: {
          type: 'string',
          description: 'Optional URI pointing at deliverable evidence.',
        },
      },
      required: ['spaceId', 'jobId', 'actorId', 'deliverableHash'],
    },
  },
  {
    name: 'work_evaluate',
    description: 'Evaluator approves (settles on X Layer) or rejects (Gaia full refund) a Work Order.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          description: 'The Space ID that governs the work.',
        },
        jobId: {
          type: 'string',
          description: 'The Work Order ID to evaluate.',
        },
        evaluatorId: {
          type: 'string',
          description: 'The evaluator deciding the outcome (must match Work Order evaluator).',
        },
        approved: {
          type: 'boolean',
          description: 'True to approve and settle payment; false to reject and refund the Space.',
        },
        feedback: {
          type: 'string',
          description: 'Optional acceptance notes or rejection reason.',
        },
      },
      required: ['spaceId', 'jobId', 'evaluatorId', 'approved'],
    },
  },
  {
    name: 'work_get',
    description: 'Read a single Work Order with its lifecycle status and settlement or refund evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          description: 'The Space ID that governs the work.',
        },
        jobId: {
          type: 'string',
          description: 'The Work Order ID to read.',
        },
      },
      required: ['spaceId', 'jobId'],
    },
  },
  {
    name: 'work_request_verdict',
    description: 'Refer a submitted deliverable to the bound Internet Court resolver. Payouts halt until the verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          description: 'The Space ID that governs the work.',
        },
        jobId: {
          type: 'string',
          description: 'The submitted Work Order ID to refer.',
        },
        actorId: {
          type: 'string',
          description: 'The client, provider, or evaluator requesting adjudication.',
        },
      },
      required: ['spaceId', 'jobId', 'actorId'],
    },
  },
  {
    name: 'work_post_verdict',
    description: 'Court verdict callback: approve to settle on X Layer, or reject for a full Space refund.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: {
          type: 'string',
          description: 'The Space ID that governs the work.',
        },
        jobId: {
          type: 'string',
          description: 'The adjudicating Work Order ID.',
        },
        adjudicatorId: {
          type: 'string',
          description: 'The court resolver posting the verdict (must match the bound adjudicator).',
        },
        approved: {
          type: 'boolean',
          description: 'True to settle payment to the provider; false to refund the Space in full.',
        },
        reason: {
          type: 'string',
          description: 'Reason for the court verdict.',
        },
      },
      required: ['spaceId', 'jobId', 'adjudicatorId', 'approved'],
    },
  },
  {
    name: 'participants_add',
    description:
      'Add a participant (Human, Agent, Service, Organization, or Counterparty) to a Space. Participants are Space members with a declared kind, so agents are ordinary participants rather than the centre of the architecture.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space to add the participant to.' },
        kind: {
          type: 'string',
          enum: ['Human', 'Agent', 'Service', 'Organization', 'Counterparty'],
          description: 'Participant kind.',
        },
        displayName: {
          type: 'string',
          description: 'Human-readable name. Must be unique among active participants.',
        },
        address: { type: 'string', description: 'Optional wallet address for onchain counterparties.' },
        externalRef: {
          type: 'string',
          description: 'Optional reference to a source outside Microcosm (CRM, marketplace, directory).',
        },
        actorId: { type: 'string', description: 'Who is adding this participant.' },
      },
      required: ['spaceId', 'kind', 'displayName'],
    },
  },
  {
    name: 'participants_list',
    description: 'List participants in a Space, optionally filtered by kind or status.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space to list participants for.' },
        kind: { type: 'string', description: 'Filter by participant kind.' },
        status: { type: 'string', description: 'Filter by status (Active/Inactive).' },
      },
      required: ['spaceId'],
    },
  },
  {
    name: 'participants_deactivate',
    description: 'Deactivate a participant. The audit trail is retained, not erased.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space the participant belongs to.' },
        participantId: { type: 'string', description: 'Participant to deactivate.' },
        actorId: { type: 'string', description: 'Who is deactivating.' },
      },
      required: ['spaceId', 'participantId'],
    },
  },
  {
    name: 'requests_create',
    description:
      'Create a Request in a Space: the thing that asks a participant to do something. Optionally assign it to an active participant. Requests are the start of the product loop; Work Orders are one mechanism that can fulfil them.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space the Request belongs to.' },
        createdBy: { type: 'string', description: 'Active participant creating the Request.' },
        assignee: { type: 'string', description: 'Optional active participant to assign immediately.' },
        title: { type: 'string', description: 'One-line statement of what is being asked.' },
        instructions: { type: 'string', description: 'Instructions for the assignee.' },
        context: { type: 'object', description: 'Context the participant needs: files, records, budget, constraints, expected result.' },
      },
      required: ['spaceId', 'createdBy', 'title'],
    },
  },
  {
    name: 'requests_list',
    description: 'List Requests in a Space, optionally filtered by status, assignee, or creator.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space to list Requests for.' },
        status: { type: 'string', description: 'Filter by status (Open/Assigned/InProgress/Completed/Blocked/Cancelled).' },
        assignee: { type: 'string', description: 'Filter by assignee participant.' },
        createdBy: { type: 'string', description: 'Filter by creator participant.' },
      },
      required: ['spaceId'],
    },
  },
  {
    name: 'activity_trace',
    description: 'Walk the full evidence chain for one Request: Request → Work → Result → Authorization → Payment → Receipt → Activity. One inspector, one chain.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space the Request belongs to.' },
        requestId: { type: 'string', description: 'Request to trace.' },
      },
      required: ['spaceId', 'requestId'],
    },
  },
  {
    name: 'requests_receive',
    description: 'What a participant receives when taking a Request: the Request plus Context, Authority (the exact Space rules and the granted authority of this participant), and the relevant Space information. This is the receive-path payload.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space the Request belongs to.' },
        requestId: { type: 'string', description: 'Request to receive.' },
        actorId: { type: 'string', description: 'Participant receiving the Request.' },
      },
      required: ['spaceId', 'requestId', 'actorId'],
    },
  },
  {
    name: 'requests_get',
    description: 'Read one Request, including its Work, Result, and Payment linkage once those exist.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space the Request belongs to.' },
        requestId: { type: 'string', description: 'Request to read.' },
      },
      required: ['spaceId', 'requestId'],
    },
  },
  {
    name: 'requests_accept',
    description: 'An active participant accepts an Open Request, becoming its assignee.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space the Request belongs to.' },
        requestId: { type: 'string', description: 'Request to accept.' },
        actorId: { type: 'string', description: 'Participant accepting the Request.' },
      },
      required: ['spaceId', 'requestId', 'actorId'],
    },
  },
  {
    name: 'requests_complete',
    description: 'Assignee completes a Request with a Result. The Result is what a Payment can be connected to.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space the Request belongs to.' },
        requestId: { type: 'string', description: 'Request to complete.' },
        actorId: { type: 'string', description: 'Assignee completing the Request.' },
        result: { type: 'object', description: 'Result: output, evidence, hashes, structured data, completion status.' },
      },
      required: ['spaceId', 'requestId', 'actorId'],
    },
  },
  {
    name: 'requests_block',
    description: 'Block a Request, e.g. waiting on a human approval or a missing input.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space the Request belongs to.' },
        requestId: { type: 'string', description: 'Request to block.' },
        actorId: { type: 'string', description: 'Participant blocking the Request.' },
        reason: { type: 'string', description: 'Why it is blocked.' },
      },
      required: ['spaceId', 'requestId', 'actorId'],
    },
  },
  {
    name: 'requests_cancel',
    description: 'Cancel a Request that has not completed.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space the Request belongs to.' },
        requestId: { type: 'string', description: 'Request to cancel.' },
        actorId: { type: 'string', description: 'Participant cancelling the Request.' },
        reason: { type: 'string', description: 'Why it is cancelled.' },
      },
      required: ['spaceId', 'requestId', 'actorId'],
    },
  },
];

export async function handleToolCall(store, name, args) {
  switch (name) {
    case 'spaces_fund': {
      try {
        const space = store.fundSpace(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ space }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'spaces_create': {
      try {
        const space = store.createSpace(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ space }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'spaces_list': {
      const spaces = store.listSpaces(args.actorId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ spaces }, null, 2) }],
      };
    }

    case 'spaces_capabilities': {
      try {
        const capabilities = store.getCapabilities(args.spaceId, args.actorId);
        return {
          content: [{ type: 'text', text: JSON.stringify(capabilities, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'spaces_capability_manifest': {
      try {
        return {
          content: [{ type: 'text', text: JSON.stringify({ manifest: store.getCapabilityManifest(args.spaceId) }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'payments_x402_validate': {
      try {
        const validation = await store.validateX402PaymentIntent(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ validation }, null, 2) }],
          ...(validation.valid ? {} : { isError: true }),
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'payments_request': {
      try {
        const result = await store.requestPayment(args);
        if (result.status === 'REJECTED') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'REJECTED',
                    error: 'Policy boundary violation',
                    reasons: result.reasons,
                    denialProof: result.denialProof,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'SETTLED',
                  receipt: result.receipt,
                  remainingBalance: result.spaceBalance,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'governance_payments_configure': {
      try {
        return { content: [{ type: 'text', text: JSON.stringify({ governance: store.configureSpaceGovernance(args) }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Execution error: ${err.message}` }], isError: true };
      }
    }

    case 'governance_payments_get': {
      try {
        return { content: [{ type: 'text', text: JSON.stringify({ governance: store.getGovernanceConfig(args) }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Execution error: ${err.message}` }], isError: true };
      }
    }

    case 'governance_payments_create': {
      try {
        const result = store.createGovernancePaymentRequest(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Execution error: ${err.message}` }], isError: true };
      }
    }

    case 'governance_requests_list': {
      try {
        return { content: [{ type: 'text', text: JSON.stringify({ requests: store.listGovernanceRequests(args) }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Execution error: ${err.message}` }], isError: true };
      }
    }

    case 'governance_requests_get': {
      try {
        return { content: [{ type: 'text', text: JSON.stringify({ request: store.getGovernanceRequest(args) }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Execution error: ${err.message}` }], isError: true };
      }
    }

    case 'governance_requests_sign': {
      try {
        return { content: [{ type: 'text', text: JSON.stringify({ request: await store.signGovernancePaymentRequest(args) }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Execution error: ${err.message}` }], isError: true };
      }
    }

    case 'governance_requests_execute': {
      try {
        const result = await store.executeGovernancePaymentRequest(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Execution error: ${err.message}` }], isError: true };
      }
    }

    case 'activity_list': {
      const activity = store.getActivity(args.spaceId);
      return {
        content: [{ type: 'text', text: JSON.stringify({ activity }, null, 2) }],
      };
    }

    case 'work_create': {
      try {
        const result = store.createJob(args);
        if (result.status === 'REJECTED') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'REJECTED',
                    error: 'Policy boundary violation',
                    reasons: result.reasons,
                    denialProof: result.denialProof,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: result.status,
                  job: result.job,
                  request: result.request,
                  escrowedAmount: result.job.escrowedAmount,
                  remainingBalance: result.spaceBalance,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'work_submit': {
      try {
        const result = store.submitDeliverable(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'work_evaluate': {
      try {
        const result = await store.evaluateJob(args);
        // Both approve-settle and reject-refund are valid, successful outcomes;
        // the payload itself carries status + settlement / gaiaRefund evidence.
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'work_get': {
      try {
        const job = store.getJob(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ job }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'work_request_verdict': {
      try {
        const result = store.requestVerdict(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'work_post_verdict': {
      try {
        const result = await store.postVerdict(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'participants_add': {
      try {
        const participant = store.addParticipant(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ participant }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'participants_list': {
      try {
        const participants = store.listParticipants(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ participants }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'participants_deactivate': {
      try {
        const participant = store.deactivateParticipant(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ participant }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'requests_create': {
      try {
        const request = store.createRequest(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ request }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'requests_list': {
      try {
        const requests = store.listRequests(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ requests }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'activity_trace': {
      try {
        const trace = store.traceRequest(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(trace, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'requests_receive': {
      try {
        const payload = store.receiveRequest(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'requests_get': {
      try {
        const request = store.getRequest(args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ request }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    case 'requests_accept':
    case 'requests_complete':
    case 'requests_block':
    case 'requests_cancel': {
      try {
        const method = {
          requests_accept: 'acceptRequest',
          requests_complete: 'completeRequest',
          requests_block: 'blockRequest',
          requests_cancel: 'cancelRequest',
        }[name];
        const request = store[method](args);
        return {
          content: [{ type: 'text', text: JSON.stringify({ request }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    }

    default: {
      return {
        content: [{ type: 'text', text: `Unknown tool '${name}'` }],
        isError: true,
      };
    }
  }
}
