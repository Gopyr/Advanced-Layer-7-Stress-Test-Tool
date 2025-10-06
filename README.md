# ⚡️ Advanced Layer 7 Stress Test Tool

High-performance HTTP/HTTPS stress testing tool with advanced features for production environments.

## 🚀 Key Features

### 1. **Async Pool (Native Concurrency Control)**
- Prevents CPU overload with intelligent task scheduling
- Stable concurrency without memory leaks
- CPU-friendly with `setImmediate()` scheduling

### 2. **Circuit Breaker with Auto Reconnect**
- **3 States**: CLOSED → OPEN → HALF_OPEN
- Automatically reopens after timeout
- Prevents cascade failures
- Configurable thresholds and recovery

### 3. **Protocol Failover**
- Auto-detects: HTTP/1.1, HTTP/2, HTTP/3
- Falls back gracefully if protocol fails
- Force specific protocols with `-p` flag

### 4. **Real-time Stats (Non-flicker)**
- Single-line updates (no `console.clear()`)
- Server-friendly logging
- Minimal CPU overhead

### 5. **HTTP/2 Attack Modes**
- **Rapid Reset**: CVE-2023-44487 exploit
- **MadeYouReset**: Server-side stream reset attack

### 6. **Adaptive Delay**
- Automatically slows down on rate limits (429, 403, etc.)
- Smart detection of blocking status codes
- Configurable with `--adaptive-delay`

---

## 📦 Installation

```bash
npm install undici
```

---

## 🎯 Usage

### Basic Stress Test
```bash
# 1 minute test, 50 concurrent connections
node stress-test.js -u https://example.com

# 5 minutes, 200 threads
node stress-test.js -u https://example.com -t 5 -c 200
```

### HTTP/2 Attacks
```bash
# Rapid Reset attack (CVE-2023-44487)
node stress-test.js -u https://example.com -a rapid-reset -c 100

# MadeYouReset attack
node stress-test.js -u https://example.com -a madeyoureset -c 50
```

### Force Protocols
```bash
# Only HTTP/1.1 and HTTP/2
node stress-test.js -u https://example.com -p 1.1,2

# Only HTTP/2
node stress-test.js -u https://example.com -p 2
```

### Adaptive Delay (Rate Limit Handling)
```bash
# Automatically slow down when rate limited
node stress-test.js -u https://example.com --adaptive-delay
```

---

## 📊 Command Line Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--url` | `-u` | Target URL (required) | - |
| `--time` | `-t` | Duration in minutes | 1 |
| `--conc` | `-c` | Concurrency/threads | 50 |
| `--attack` | `-a` | Attack mode: none, rapid-reset, madeyoureset | none |
| `--protocol` | `-p` | Force protocols: 1.1,2,3 | auto-detect |
| `--adaptive-delay` | - | Enable adaptive delay | false |
| `--help` | `-h` | Show help | - |

---

## 📈 Output Example

```
⚡️ Advanced Layer 7 Stress Test Tool ⚡️

Target: https://example.com
Duration: 1 minute(s)
Concurrency: 50
Attack Mode: none

Detected protocols: H2, H1.1

[00:00:45] Remaining: 00:00:15 | ✓8542 ✗12 125ms 189.8req/s 99.9% | Circuit: CLOSED | Protocols: h2,h1.1

============================================================
       ⚡️ TEST COMPLETED ⚡️       
============================================================

Target: https://example.com
Duration: 60.02s
Protocols Detected: h2, h1.1

Performance Metrics:
  Successful Requests: 11384
  Failed Requests: 16
  Requests/Second: 189.67
  Avg Latency: 124.52ms
  Min Latency: 45.23ms
  Max Latency: 3421.67ms
  Success Rate: 99.86%

Top Status Codes:
  200: 10892
  304: 421
  503: 71
  0: 16

Protocol Distribution:
  H2: 7234 (63.5%)
  H1.1: 4150 (36.5%)

Top Errors:
  ECONNRESET: 8
  ETIMEDOUT: 5
  UND_ERR_CONNECT_TIMEOUT: 3
============================================================
```

---

## 🔧 Technical Details

### Circuit Breaker States

```
CLOSED (Normal)
   ↓ (failures ≥ threshold)
OPEN (Blocking)
   ↓ (after timeout)
HALF_OPEN (Testing)
   ↓ (success × 3)
CLOSED (Recovered)
```

### Async Pool Flow

```javascript
// CPU-friendly concurrency
asyncPool(50, tasks, async (task) => {
    await sendRequest(task);
    await setImmediate(); // Yield to event loop
});
```

### Protocol Failover Chain

```
1. Try HTTP/2 (h2)
   ↓ (if fails)
2. Try HTTP/1.1 (h1.1)
   ↓ (if fails)
3. Mark as failed
```

---

## 🎨 Integration with WhatsApp Bot (sendreq.js)

The `sendreq.js` module integrates all features into a WhatsApp bot command:

```javascript
// In WhatsApp
.sendreq https://example.com 1000 50

// Output
> Starting Request Test
Target: https://example.com
Requests: 1000
Concurrency: 50

[5.2s] ✓956 ✗44 98ms 183.8req/s

> Test Completed
Duration: 5.47s
Success: 956
Failed: 44
Avg Latency: 98ms
Req/s: 174.8

Top Status Codes:
  200: 892
  304: 64
  0: 44

Protocol Usage:
  H2: 567
  H1.1: 389
```

---

## ⚠️ Important Notes

### Legal Disclaimer
- Only test systems you own or have explicit permission to test
- Unauthorized stress testing is illegal in most jurisdictions
- Tool is for educational and authorized testing purposes only

### Best Practices
- Start with low concurrency (50-100)
- Monitor server resources during tests
- Use `--adaptive-delay` for production systems
- Respect rate limits and robots.txt

### Performance Tips
1. **CPU Usage**: Keep concurrency ≤ 200 for single-core
2. **Memory**: Each connection ~2-5MB RAM
3. **Network**: Check bandwidth limits
4. **Circuit Breaker**: Adjust threshold based on target stability

---

## 🐛 Troubleshooting

### "Circuit OPEN" messages
- Target is overloaded or blocking requests
- Increase `--time` or reduce `-c` concurrency
- Enable `--adaptive-delay`

### Low RPS (Requests/Second)
- Increase `-c` concurrency
- Check network latency
- Try forcing HTTP/2 with `-p 2`

### High error rate
- Target may have rate limiting
- Use `--adaptive-delay`
- Reduce concurrency

### Memory leaks
- Async pool prevents this automatically
- Each request cleans up connections
- Circuit breaker prevents pile-up

---

## 📝 Changelog

### v2.0.0 (Current)
- ✅ Async pool for stable concurrency
- ✅ Circuit breaker with auto reconnect
- ✅ Protocol failover (H1.1 → H2 → H3)
- ✅ Real-time non-flicker stats
- ✅ Removed chalk dependency (ANSI only)
- ✅ HTTP/2 attack modes
- ✅ Adaptive delay for rate limits
- ✅ Server-friendly logging

### v1.0.0
- Basic stress testing
- Protocol detection
- Status code tracking

---

## 📄 License

Copyright © 2025 [Gopyr]  
Contact: Gopyrsr@gmail.com  
GitHub: https://github.com/Gopyr

---

## 🤝 Contributing

Improvements welcome! Focus areas:
- HTTP/3 QUIC optimization
- More attack vectors
- Better adaptive algorithms
- Real-time graph visualization

---

**Made with ⚡️ for high-performance testing**
