import { chromium } from 'playwright';
const ADDR = '0x70997970C51812dc3A010c7d01B50e0D17dC79C8'; // checksummed on purpose
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 1150 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
// Pre-authorise so wagmi connects on load: the modal dance is the flaky part,
// and it is not what this check is about.
await p.addInitScript((ADDR) => {
  localStorage.setItem('microcosm-e2e-wallet-authorized', 'true');
  const L = new Map();
  const emit = (e, ...a) => (L.get(e) || new Set()).forEach(l => l(...a));
  const prov = { isMetaMask: true, providers: [], async request({ method, params = [] }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ADDR];
    if (method === 'eth_chainId') return '0x7a0';
    if (method === 'net_version') return '1952';
    if (method === 'wallet_getPermissions' || method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }];
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
    if (method === 'personal_sign') { emit('accountsChanged', [ADDR]); return '0x' + 'ab'.repeat(65); }
    if (method === 'eth_getBalance') return '0x0';
    return null; },
    on(e,l){ if(!L.has(e)) L.set(e,new Set()); L.get(e).add(l); }, removeListener(e,l){ (L.get(e)||new Set()).delete(l); } };
  prov.providers = [prov];
  Object.defineProperty(window, 'ethereum', { configurable: true, value: prov });
  const d = { info:{uuid:'11111111-2222-3333-4444-555555555555',name:'Injected',icon:'data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27/>',rdns:'io.microcosm.injected'}, provider: prov };
  const a = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: d }));
  window.addEventListener('eip6963:requestProvider', a); setTimeout(a, 0);
}, ADDR);
await p.goto('http://127.0.0.1:3900/app', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
await p.getByLabel('Active Space').selectOption(''); await p.waitForTimeout(1200);
console.log('gate            :', await p.locator('#entry-gate-title').textContent().catch(()=>'MISSING'));
const signIn = p.getByRole('button', { name: 'Sign in' });
if (await signIn.count()) { await signIn.click(); await p.waitForTimeout(2500); }
console.log('two choices     :', await p.locator('.entry-gate__choice').count());
await p.getByRole('button', { name: 'Create a Space' }).click(); await p.waitForTimeout(1000);
console.log('form            :', await p.locator('#csf-title').textContent().catch(()=>'MISSING'));
await p.getByLabel('What is it called?').fill('Verified Flow Space');
await p.getByLabel(/What is it for/).fill('Checking the create form end to end.');
await p.getByRole('button', { name: /Next: who works here/ }).click(); await p.waitForTimeout(500);
await p.getByLabel('Name').fill('ProbeVendor');
await p.getByLabel('Wallet address (optional)').fill('0x1111111111111111111111111111111111111111');
await p.getByRole('button', { name: 'Add them' }).click(); await p.waitForTimeout(400);
await p.getByRole('button', { name: /Next: limits/ }).click(); await p.waitForTimeout(500);
await p.getByLabel(/Most any one payment/).fill('300.00');
await p.getByLabel(/Most it may spend in a day/).fill('1200.00');
await p.screenshot({ path: '/tmp/v-limits.png' });
await p.getByRole('button', { name: /Create the Space/ }).click();
await p.waitForTimeout(6000);
console.log('after create    :', await p.locator('.csf__steps li.is-current').textContent().catch(()=>'?'));
console.log('log lines       :');
for (const l of await p.locator('.csf__log li').allTextContents()) console.log('   ', l);
await p.screenshot({ path: '/tmp/v-after-create.png' });
if (await p.getByRole('button', { name: /Sign and bind the budget/ }).count()) {
  await p.getByRole('button', { name: /Sign and bind the budget/ }).click();
  await p.waitForTimeout(6000);
  console.log('after bind      :', await p.locator('.csf__steps li.is-current').textContent().catch(()=>'?'));
  await p.screenshot({ path: '/tmp/v-agents.png' });
}
console.log('page errors     :', errs.length ? errs : 'none');
await b.close();
