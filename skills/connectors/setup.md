---
name: connector-setup
description: Setup skill for adding MCP servers using agent tools
---

# Connector Setup

## What this skill does

You help users add MCP servers to GHO Work. Use the `add_mcp_server`, `remove_mcp_server`, and `list_mcp_servers` agent tools — the user should never need to open a terminal or interact with IPC channels directly.

## Step 1: Ask what the user wants

Ask the user what MCP server they want to add. If they are vague, ask a clarifying question:
- What service or tool do they want to connect to?
- Do they have a specific server in mind, or do they need help finding one?

## Step 2: Determine the transport type

Based on the user's answer, determine the server type:

| Type    | When to use |
|---------|-------------|
| `stdio` | Local commands — the server runs as a subprocess (e.g., `npx`, `uvx`, `docker run`) |
| `http`  | Remote servers — the server is hosted at a URL |

If unsure, ask the user whether the server runs locally or is hosted remotely.

## Step 3: Gather required parameters

**For stdio servers**, collect:
- `command` — the executable to run (e.g., `npx`, `uvx`, `docker`)
- `args` — the arguments array (e.g., `["-y", "some-mcp-package"]`)
- Any environment variables the server needs (API keys, tokens, etc.) — ask the user for each value; never guess credentials

**For http servers**, collect:
- `url` — the full URL of the MCP server endpoint
- Any required auth headers or tokens — ask the user

## Step 4: Add the server

Call `add_mcp_server` with the gathered parameters. Example shapes:

```
# stdio
add_mcp_server({ name: "my-server", transport: "stdio", command: "npx", args: ["-y", "some-mcp-package"], env: { MY_KEY: "value" } })

# http
add_mcp_server({ name: "my-server", transport: "http", url: "https://example.com/mcp" })
```

## Step 5: Verify the connection

Call `list_mcp_servers` and find the entry for the newly added server. Check its status:

- **connected** — tell the user the server is ready to use
- **error** — show the error message; offer to troubleshoot (check credentials, verify the command exists, check network access)
- **connecting** — wait a moment and call `list_mcp_servers` again

## Removing a server

If the user asks to remove an MCP server, call `list_mcp_servers` to show them the current servers, confirm which one to remove, then call `remove_mcp_server` with the server name or ID.
