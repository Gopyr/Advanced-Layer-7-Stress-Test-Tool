# Advanced Layer 7 Stress Test Tool

A small Node.js command-line utility for **authorized, controlled HTTP service testing**. It records request outcomes, latency, status codes, protocol usage, and circuit-breaker state while exercising a single target from one process.

> This is not a distributed testing platform and it is not a substitute for a properly scoped performance test plan. Use it only on infrastructure you own or are explicitly authorized to test.

## Current status

The project is a focused experiment rather than a polished benchmarking suite. The current implementation supports HTTP/1.1 and HTTP/2 paths, protocol detection/fallback, bounded asynchronous work, adaptive delay, and a circuit breaker. The CLI also contains legacy protocol-experiment branches; do not use modes labelled as attack or rapid-reset outside an isolated lab with written authorization.

## Requirements

| Requirement | Version |
| --- | --- |
| Node.js | 18 or newer |
| npm | Bundled with Node.js |
| Network access | Only to an explicitly authorized target |

## Install

```bash
npm install
node stress-test.js --help
```

## Safe starting point

Begin with a short test and conservative concurrency against a local service or staging endpoint. Confirm the test window and stop criteria before increasing either value.

```bash
node stress-test.js \
  --url https://staging.example.test/health \
  --time 1 \
  --conc 10 \
  --adaptive-delay
```

The example target is intentionally non-routable documentation text. Replace it only after authorization has been confirmed.

## CLI options

| Option | Description | Default |
| --- | --- | --- |
| `-u, --url <url>` | URL to test; required | — |
| `-t, --time <minutes>` | Test duration | `1` |
| `-c, --conc <number>` | Concurrent workers | `50` |
| `-p, --protocol <list>` | Force `1.1`, `2`, or `3` paths | auto-detect |
| `--adaptive-delay` | Back off when blocking responses are observed | off |
| `-a, --attack <mode>` | Legacy protocol-experiment switch; lab-only | `none` |
| `-h, --help` | Print command help | — |

## What the output means

The final report includes successful and failed requests, average/minimum/maximum latency, requests per second, status-code distribution, protocol distribution, and common errors. These values describe this process's observations; they are not a complete service-level measurement and should not be presented as one.

## Safety checklist

Before every run, confirm ownership or written permission, the target and path, the maximum duration and concurrency, a contact who can stop the test, and the success or failure criteria. Keep the run inside a staging environment whenever possible, respect rate limits, and record the exact command and commit used. Never use this tool for evasion, disruption, credential testing, or traffic amplification.

## Known limitations

The project does not provide distributed coordination, an authenticated control plane, persistent result storage, or a target allowlist. Add those controls externally before considering it for a formal test workflow. There are currently no automated performance baselines in the repository.

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md). Changes that increase traffic volume, bypass target controls, or make unauthorized use easier will not be accepted.

## License

Released under the [MIT License](LICENSE).
