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
];

export async function handleToolCall(store, name, args) {
  switch (name) {
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

    case 'payments_request': {
      try {
        const result = store.requestPayment(args);
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
        const result = store.evaluateJob(args);
        if (result.status === 'Rejected' || result.status === 'Expired') {
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }
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

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool '${name}'` }],
        isError: true,
      };
  }
}
