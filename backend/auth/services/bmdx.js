// backend/auth/services/bmdx.js
require('dotenv').config({ path: require('path').join(__dirname, '/../../.env') });
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

/* -------- env -------- */
const RPC  = (process.env.POLYGON_RPC_URL || process.env.ALCHEMY_RPC_URL || '').trim();
const ADDR = (process.env.BMDX_CONTRACT_ADDRESS || '').trim(); // REQUIRED

/* -------- load ABI (try a couple locations) -------- */
const candidateJsonPaths = [
  path.join(__dirname, '../../contracts/bdmx.json'),
  path.join(__dirname, '../../bdmx.json'),
  path.join(process.cwd(), 'bdmx.json'),
];
let ABI = [];
let abiPathUsed = null;

for (const p of candidateJsonPaths) {
  try {
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    if (Array.isArray(j.abi)) {
      ABI = j.abi;
      abiPathUsed = p;
      break;
    }
  } catch (_) {}
}
if (!ABI.length) console.warn('[BMDX] Could not find ABI; looked at:', candidateJsonPaths.join(', '));

/* -------- ethers v5/v6 compatibility helpers -------- */
const isV6 = !!ethers?.JsonRpcProvider; // v6 exposes class at root
const makeProvider = (url) => (isV6 ? new ethers.JsonRpcProvider(url) : new ethers.providers.JsonRpcProvider(url));
const isAddress = (addr) => (isV6 ? ethers.isAddress(addr) : ethers.utils.isAddress(addr));

/* -------- state -------- */
let provider = null;
let contract = null;
let configured = false;
let cachedDecimals = undefined;

function initOnce() {
  if (configured) return;
  if (!RPC)  { console.warn('[BMDX] Missing POLYGON_RPC_URL / ALCHEMY_RPC_URL'); return; }
  if (!ABI.length) { console.warn('[BMDX] Missing ABI in bdmx.json'); return; }
  if (!ADDR) { console.warn('[BMDX] Missing BMDX_CONTRACT_ADDRESS'); return; }

  try {
    provider = makeProvider(RPC);
    contract = new ethers.Contract(ADDR, ABI, provider);
    configured = true;
    console.log('[BMDX] ready', { address: ADDR, abiPath: abiPathUsed, ethers: isV6 ? 'v6' : 'v5' });
  } catch (e) {
    console.warn('[BMDX] init failed:', e.message);
  }
}
initOnce();

function isConfigured() { return configured; }

async function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

/* -------- health: read-only probes -------- */
async function health() {
  if (!configured) return { ok: false, configured: false, message: 'not configured' };
  const out = { ok: false, configured: true, address: ADDR };

  try {
    const tasks = [];

    tasks.push(contract.name ? contract.name().catch(() => null) : Promise.resolve(null));
    tasks.push(contract.symbol ? contract.symbol().catch(() => null) : Promise.resolve(null));
    tasks.push(contract.decimals ? contract.decimals().catch(() => null) : Promise.resolve(null));
    tasks.push(contract.totalSupply ? contract.totalSupply().catch(() => null) : Promise.resolve(null));
    tasks.push(contract.lastDailyHash ? contract.lastDailyHash().catch(() => null) : Promise.resolve(null));

    const [name, symbol, decimals, totalSupply, lastDailyHash] =
      await withTimeout(Promise.all(tasks));

    out.name = name ?? undefined;
    out.symbol = symbol ?? undefined;

    // ethers v6 returns number for decimals; v5 returns BN -> convert
    const decNum = typeof decimals === 'number' ? decimals :
                   (decimals != null && decimals.toString ? Number(decimals.toString()) : undefined);
    out.decimals = decNum;
    if (Number.isFinite(decNum)) cachedDecimals = decNum;

    out.totalSupply = totalSupply != null ? totalSupply.toString() : undefined;
    out.lastDailyHash = lastDailyHash ?? undefined;

    const bn = await withTimeout(provider.getBlockNumber());
    out.blockNumber = Number(bn);

    out.ok = true;
    return out;
  } catch (e) {
    out.message = e.message;
    return out;
  }
}

/* -------- simple read -------- */
async function balanceOf(address) {
  if (!configured) throw new Error('BMDX not configured');
  if (!isAddress(address)) throw new Error('Invalid address');
  if (!contract.balanceOf) throw new Error('balanceOf not in ABI');

  const bal = await withTimeout(contract.balanceOf(address));
  return {
    raw: bal.toString(),
    decimals: cachedDecimals, // will be undefined until health() runs once
  };
}

// --- signer for writes (only used if you enable them) ---
const OWNER_PK = (process.env.BMDX_OWNER_PRIVATE_KEY || '').trim();
let signer = null;
function getWriteContract() {
  if (!configured) throw new Error('BMDX not configured');
  if (!OWNER_PK) throw new Error('No BMDX_OWNER_PRIVATE_KEY in env');
  if (!signer) signer = (ethers.Wallet ? new ethers.Wallet(OWNER_PK, provider)
                                       : new ethers.Signer(OWNER_PK, provider));
  return contract.connect(signer);
}

/** Write lastDailyHash on-chain (requires OWNER private key + ~a few cents of MATIC) */
async function setDailyHash(hash) {
  if (typeof hash !== 'string' || !hash) throw new Error('hash required');
  const wc = getWriteContract();
  const tx = await wc.setDailyHash(hash);
  const receipt = await tx.wait();
  return { txHash: receipt.transactionHash, blockNumber: receipt.blockNumber };
}

module.exports = { isConfigured, health, balanceOf, setDailyHash };

module.exports = { isConfigured, health, balanceOf };
