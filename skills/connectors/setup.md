---
name: connector-setup
description: Unified setup skill for MCP servers and CLI tools
---

# Connector Setup

## What this skill does

You help users add MCP servers and CLI tools as connectors in GHO Work. You handle the full setup flow: discovery, configuration, environment variable collection, and connection testing. The user should never need to open a terminal.

## Step 1: Understand what the user wants

Ask the user what they want to connect to (e.g., "a Slack MCP server", "GitHub CLI", "a database tool"). If they are vague, ask a clarifying question before proceeding.

## Step 2: Search the MCP Registry

Run a registry search to find matching servers:

```bash
curl -s "https://registry.modelcontextprotocol.io/v2025-07-09/servers?search=<query>&limit=5&version=latest"
```

Replace `<query>` with the user's request (URL-encode spaces as `+` or `%20`).

The response has this shape:
```json
{
  "servers": [
    {
      "name": "...",
      "description": "...",
      "packages": [
        {
          "registryType": "npm" | "pypi" | "docker-hub",
          "identifier": "...",
          "environmentVariables": [
            { "name": "MY_VAR", "description": "...", "required": true }
          ]
        }
      ],
      "remotes": [
        { "transportType": "streamable-http", "url": "https://..." }
      ]
    }
  ],
  "metadata": { "count": 5, "nextCursor": "..." }
}
```

### If curl fails (timeout, DNS error, rate limit)

Fall back to a web search for `<query> MCP server site:modelcontextprotocol.io OR site:npmjs.com OR site:pypi.org`. Report what you found and ask the user to confirm before proceeding.

## Step 3: Present results and confirm

Show the user the top matches with name and description. Ask which one they want to install. If there is only one obvious match, confirm it before proceeding.

If the registry returns no results, use a web search to find the right package (npm, PyPI, Docker Hub, or a hosted endpoint URL). Ask the user to confirm what you found before configuring it.

## Step 4: Map the package to a ConnectorConfig

Based on the chosen server's package entry, construct the connector config:

| registryType   | ConnectorConfig shape |
|----------------|-----------------------|
| `npm`          | `{ transport: 'stdio', command: 'npx', args: ['-y', identifier] }` |
| `pypi`         | `{ transport: 'stdio', command: 'uvx', args: [identifier] }` |
| `docker-hub`   | `{ transport: 'stdio', command: 'docker', args: ['run', '-i', '--rm', identifier] }` |
| streamable-http remote | `{ transport: 'streamable_http', url: remote.url }` |

If the server has both packages and remotes, prefer the `streamable-http` remote (no local install needed). Otherwise use the first available package.

## Step 5: Collect environment variables

If the chosen package has `environmentVariables` with any entries, ask the user for each value before configuring:

- For each variable: show the variable name and description. Ask for the value.
- If a variable is not required, tell the user it is optional and they can skip it.
- Never guess or invent values for API keys, tokens, or credentials.
- Store the collected values as env entries in the connector config.

Example:
```
I need a few details before I can add this connector:

1. **SLACK_BOT_TOKEN** — Your Slack bot token (starts with xoxb-). Required.
2. **SLACK_TEAM_ID** — Your Slack workspace ID. Optional.
```

## Step 6: Add the connector

Send a `CONNECTOR_ADD` IPC call with the constructed ConnectorConfig (including any env vars). This registers the connector in GHO Work's connector store.

## Step 7: Test the connection

After adding, send a `CONNECTOR_TEST` IPC call with the connector ID returned from step 6.

- If the test succeeds: tell the user the connector is ready to use.
- If the test fails: show the error message. Offer to help troubleshoot (e.g., check credentials, verify the package is installed, check network access).

## CLI tools

For CLI tools (gh, git, mgc, gcloud, az, etc.), the install and auth skills are already loaded into your system message. Follow those skills directly — do not search the registry for CLI tools.

If you are unsure whether something is a CLI tool or an MCP server, ask the user.

## Common pitfalls

- **npm not found**: check `npm --version`. If missing, tell the user to install Node.js from https://nodejs.org.
- **uvx not found**: check `uvx --version`. If missing, run `pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- **docker not found**: tell the user to install Docker Desktop from https://docker.com.
- **streamable-http behind auth**: the server may require an API key passed as a header or query param. Check the server's documentation (linked in the registry) and ask the user for the credential.
- **Rate-limited registry**: if the registry returns 429, wait 5 seconds and retry once. If it fails again, fall back to web search.
