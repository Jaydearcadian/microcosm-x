/**
 * Sign in the way the browser does: fetch a challenge, sign it with a wallet,
 * exchange it for a session cookie.
 *
 * Spending routes require a principal, so suites drive them with a real
 * session rather than only naming an actor.
 */
export async function signIn(base, account) {
  const challenge = await (await fetch(`${base}/api/auth/challenge?address=${account.address}`)).json();
  const res = await fetch(`${base}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: account.address,
      signature: await account.signMessage({ message: challenge.message }),
    }),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error(`sign-in failed: ${res.status}`);
  return cookie;
}
