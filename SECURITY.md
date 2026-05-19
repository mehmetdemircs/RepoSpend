# Security Policy

RepoSpend is an early-stage, local-first developer tool. It is designed to help you inspect AI coding usage data on your own machine, not to collect or upload that data.

## Supported Versions

While RepoSpend is early-stage, only the latest published npm version is actively supported for security fixes.

Please upgrade to the latest version before reporting a vulnerability when possible.

## Reporting a Vulnerability

Please do not open a public GitHub issue for suspected vulnerabilities.

Please contact the maintainer privately via GitHub. If the repository later lists a dedicated private security reporting method or maintainer contact, use that instead.

When reporting, include:

- the RepoSpend version
- your operating system and Node.js version
- a clear description of the issue
- minimal steps to reproduce it
- whether the issue involves local files, logs, prompts, or usage data

## Security Expectations

RepoSpend should:

- run locally by default
- read supported AI coding tool data without modifying it
- avoid uploading prompts, logs, local files, telemetry, or local usage data by default
- keep security-sensitive changes small and reviewable

RepoSpend is not guaranteed to be free of vulnerabilities. Please use care when running any local tool that reads files from your machine.

## Local-First Data Handling

RepoSpend inspects local usage data, including Codex-related local files and logs when available. Some source files may contain prompt text, tool output, file paths, repository names, or other sensitive details.

Before sharing logs, screenshots, exports, or reproduction steps, remove private data such as prompts, file contents, access tokens, usernames, repo names, customer names, and local paths you do not want to disclose.

## What Not to Include in Public Issues

Please do not include the following in public GitHub issues:

- prompts or conversation logs
- access tokens, API keys, or secrets
- private repository names or file paths
- customer, employer, or personal data
- raw local usage files that may contain sensitive content
- details for an unpatched security issue

Use a private maintainer contact for anything security-sensitive.

## Maintainer Response Expectations

Maintainers will try to acknowledge valid vulnerability reports promptly, but response times may vary because RepoSpend is a small open-source project.

The expected process is:

- review the report privately
- ask follow-up questions if needed
- prepare a fix when the issue is reproducible and in scope
- publish a release or mitigation notes when appropriate
- credit reporters when requested and safe to do so
