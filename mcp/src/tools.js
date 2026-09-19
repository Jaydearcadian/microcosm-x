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

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool '${name}'` }],
        isError: true,
      };
  }
}
