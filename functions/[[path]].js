import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';

const app = new Hono();

// ===========================================================================
// Crypto helpers for PKCE (Works in V8 Isolate environment)
// ===========================================================================
function base64URLEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateRandomString(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(digest);
}

// ===========================================================================
// Pagination Helper for X API
// ===========================================================================
async function fetchAllPages(baseUrl, accessToken) {
  const allUsers = [];
  let nextToken = null;

  do {
    const url = new URL(baseUrl);
    url.searchParams.set('max_results', '1000');
    url.searchParams.set('user.fields', 'profile_image_url,username,name,public_metrics');
    if (nextToken) url.searchParams.set('pagination_token', nextToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('x-rate-limit-reset');
      const err = new Error('Rate limited by X API');
      err.status = 429;
      err.retryAfter = retryAfter;
      throw err;
    }

    if (!res.ok) {
      throw new Error(`X API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    if (data.data) allUsers.push(...data.data);
    nextToken = data.meta?.next_token ?? null;
  } while (nextToken);

  return allUsers;
}

const X_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const X_API_BASE = 'https://api.twitter.com/2';
const OAUTH_SCOPES = 'users.read follows.read tweet.read offline.access';

// ===========================================================================
// Middleware: Setup Session Secret & Parse Session Cookie
// ===========================================================================
app.use('*', async (c, next) => {
  // Use env.SESSION_SECRET for signing JWT. Fallback to a hardcoded one for dev if missing.
  const secret = c.env.SESSION_SECRET || 'x-radar-super-secret-edge-key-123';
  c.set('jwtSecret', secret);
  
  const token = getCookie(c, 'session');
  if (token) {
    try {
      const decoded = await verify(token, secret);
      c.set('session', decoded);
    } catch (e) {
      // invalid or expired token
      c.set('session', null);
    }
  }
  await next();
});

// ===========================================================================
// API Routes
// ===========================================================================

app.get('/api/status', (c) => {
  const session = c.get('session');
  if (session) {
    return c.json({ authenticated: true, user: session.user });
  }
  return c.json({ authenticated: false });
});

app.get('/auth/login', async (c) => {
  const { X_CLIENT_ID, CALLBACK_URL } = c.env;
  if (!X_CLIENT_ID || !CALLBACK_URL) {
    return c.text('Missing X_CLIENT_ID or CALLBACK_URL in environment variables.', 500);
  }

  const state = generateRandomString(16);
  const codeVerifier = generateRandomString(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store state and verifier in a short-lived signed cookie (10 minutes)
  const authStateJwt = await sign({ state, codeVerifier, exp: Math.floor(Date.now() / 1000) + 600 }, c.get('jwtSecret'));
  setCookie(c, 'auth_state', authStateJwt, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 600 });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: X_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope: OAUTH_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return c.redirect(`${X_AUTH_URL}?${params}`);
});

app.get('/auth/callback', async (c) => {
  const { X_CLIENT_ID, X_CLIENT_SECRET, CALLBACK_URL } = c.env;
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) return c.redirect('/?error=auth_denied');

  const authStateToken = getCookie(c, 'auth_state');
  deleteCookie(c, 'auth_state');

  if (!authStateToken) return c.redirect('/?error=invalid_state');

  let pending;
  try {
    pending = await verify(authStateToken, c.get('jwtSecret'));
  } catch (e) {
    return c.redirect('/?error=invalid_state');
  }

  if (pending.state !== state) return c.redirect('/?error=invalid_state');

  try {
    const tokenRes = await fetch(X_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + btoa(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: CALLBACK_URL,
        code_verifier: pending.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', await tokenRes.text());
      return c.redirect('/?error=token_exchange');
    }

    const { access_token: accessToken } = await tokenRes.json();

    const userRes = await fetch(`${X_API_BASE}/users/me?user.fields=profile_image_url,public_metrics`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) return c.redirect('/?error=user_fetch');

    const { data: user } = await userRes.json();

    // Create session cookie (valid for 2 hours)
    const sessionJwt = await sign({ accessToken, user, exp: Math.floor(Date.now() / 1000) + 7200 }, c.get('jwtSecret'));
    setCookie(c, 'session', sessionJwt, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 7200 });

    return c.redirect('/#dashboard');
  } catch (err) {
    console.error('OAuth callback error:', err);
    return c.redirect('/?error=server_error');
  }
});

app.get('/auth/logout', (c) => {
  deleteCookie(c, 'session');
  return c.redirect('/');
});

app.get('/api/scan', async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Not authenticated' }, 401);

  const { accessToken, user } = session;

  try {
    const [following, followers] = await Promise.all([
      fetchAllPages(`${X_API_BASE}/users/${user.id}/following`, accessToken),
      fetchAllPages(`${X_API_BASE}/users/${user.id}/followers`, accessToken),
    ]);
    return c.json({ user, following, followers });
  } catch (err) {
    console.error('Scan error:', err);
    if (err.status === 429) {
      return c.json({ error: 'Rate limited', retryAfter: err.retryAfter }, 429);
    }
    return c.json({ error: 'Failed to fetch data' }, 500);
  }
});

// Export specifically for Cloudflare Pages Functions
export const onRequest = handle(app);
