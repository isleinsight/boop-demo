require('dotenv').config({ path: __dirname + '/../../.env' });
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC   = (process.env.POLYGON_RPC_URL || '').trim();
const ADDR  = (process.env.BMDX_CONTRACT_ADDRESS || '').trim(); // <-- REQUIRED (your BMDX address)

const jsonPath = path.join(__dirname, '../../contracts/bdmx.json');
let ABI = [];
try {
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const j = JSON.parse(raw);
  if (Array.isArray(j.abi)) ABI = j.abi;
} catch (e) {
  console.warn('[BMDX] bdmx.json read failed:', e.message);
}

let provider = null;
let contract = null;
let configured = false;

function initOnce() {
  if (configured) return;
  if (!RPC) { console.warn('[BMDX] Missing POLYGON_RPC_URL'); return; }
  if (!ABI.length) { console.warn('[BMDX] Missing ABI in bdmx.json'); return; }
  if (!ADDR) { console.warn('[BMDX] Missing BMDX_CONTRACT_ADDRESS'); return; }
  try {
    provider = new ethers.providers.JsonRpcProvider(RPC, { timeout: 10000 });
    contract = new ethers.Contract(ADDR, ABI, provider);
    configured = true;
    console.log('[BMDX] ready:', { address: ADDR });
  } catch (e) {
    console.warn('[BMDX] init failed:', e.message);
  }
}
initOnce();

function isConfigured(){ return configured; }

async function withTimeout(promise, ms = 8000){
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

// Read-only health probe using your ERC-20-ish ABI + lastDailyHash
async function health() {
  if (!configured) return { ok:false, configured:false, message:'not configured' };
  const out = { ok:false, configured:true, address: ADDR };

  try {
    const tasks = [];

    if (contract.name)       tasks.push(contract.name().catch(()=>null));
    else                     tasks.push(Promise.resolve(null));

    if (contract.symbol)     tasks.push(contract.symbol().catch(()=>null));
    else                     tasks.push(Promise.resolve(null));

    if (contract.decimals)   tasks.push(contract.decimals().catch(()=>null));
    else                     tasks.push(Promise.resolve(null));

    if (contract.totalSupply)tasks.push(contract.totalSupply().catch(()=>null));
    else                     tasks.push(Promise.resolve(null));

    if (contract.lastDailyHash) tasks.push(contract.lastDailyHash().catch(()=>null));
    else                         tasks.push(Promise.resolve(null));

    const [name, symbol, decimals, totalSupply, lastDailyHash] = await withTimeout(Promise.all(tasks));

    out.name = name || undefined;
    out.symbol = symbol || undefined;
    out.decimals = typeof decimals === 'number' ? decimals : (decimals ? Number(decimals) : undefined);
    out.totalSupply = totalSupply ? totalSupply.toString() : undefined;
    out.lastDailyHash = lastDailyHash || undefined;

    const bn = await withTimeout(provider.getBlockNumber());
    out.blockNumber = bn;

    out.ok = true;
    return out;
  } catch (e) {
    out.message = e.message;
    return out;
  }
}

// Example read
async function balanceOf(address){
  if (!configured) throw new Error('BMDX not configured');
  if (!ethers.utils.isAddress(address)) throw new Error('Invalid address');
  if (!contract.balanceOf) throw new Error('balanceOf not in ABI');
  const bal = await withTimeout(contract.balanceOf(address));
  return { raw: bal.toString(), decimals: outDecimals() };
}

function outDecimals(){
  // Best effort—returns undefined until first health() call runs and you cache it yourself if needed.
  return undefined;
}

module.exports = { isConfigured, health, balanceOf };
