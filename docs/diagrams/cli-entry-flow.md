# CLI Entry Point Flow

## Command dispatch

```mermaid
flowchart TD
    A["npx mcp-web-hound [args]"] --> B{"process.argv.slice(2)[0]"}
    B -->|configure| C["import ./cli/configure.js<br/>configureMain(args.slice(1))"]
    B -->|export-logs| D["import ./cli/export-logs.js<br/>exportLogsMain(args.slice(1))"]
    B -->|--help or -h| E["printHelp()<br/>show main help"]
    B -->|else| F["Start MCP server (stdio)"]
    C --> G["configure main handles:<br/>--json get/set,<br/>interactive TUI,<br/>numbered menu"]
    D --> H["export-logs main handles:<br/>--export, --jsonl, --db,<br/>--help, no-arg dump"]
```

## Before (old)

Each tool was a separate npm bin entry that npx could not resolve as sub-binaries on Windows:

```mermaid
flowchart LR
    A["npx mcp-web-hound-configure"] -->|"bin entry (no .cmd shim)"| X["FAIL on Windows"]
    B["npx mcp-web-hound-export-logs"] -->|"bin entry (no .cmd shim)"| X
    C["npx mcp-web-hound"] -->|"bin entry (.cmd shim)"| Y["OK"]
```

## After (new)

All commands route through the main bin entry, which dispatches to subcommand handlers:

```mermaid
flowchart LR
    A["npx mcp-web-hound configure"] -->|".cmd shim exists"| B["dist/index.js"]
    B --> C["configure subcommand"]
    D["npx mcp-web-hound export-logs"] --> B
    B --> E["export-logs subcommand"]
    F["npx mcp-web-hound (no args)"] --> B
    B --> G["MCP server"]
    H["npx mcp-web-hound --help"] --> B
    B --> I["printHelp()"]
```
