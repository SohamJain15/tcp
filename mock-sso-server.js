const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 4000;
const COE_SHARED_TOKEN_SECRET = 'TCET_LIVE_SECRET_999';
const DEFAULT_CALLBACK_URL = process.env.MOCK_SSO_DEFAULT_CALLBACK_URL || 'http://localhost:5173';
const COOKIE_NAME = 'coe_shared_token';
const ALLOWED_ROLES = new Set(['ADMIN', 'FACULTY', 'STUDENT', 'INDUSTRY']);

app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

app.get('/login', (req, res) => {
  const callbackUrl = typeof req.query.callbackUrl === 'string' && req.query.callbackUrl.trim() !== ''
    ? req.query.callbackUrl
    : DEFAULT_CALLBACK_URL;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Mock CoE SSO Login</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; }
      form { max-width: 420px; display: grid; gap: 0.75rem; }
      label { display: grid; gap: 0.25rem; }
      input, select, button { padding: 0.5rem; font-size: 1rem; }
      button { cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>Mock CoE SSO</h1>
    <p>This standalone server simulates centralized SSO for local testing.</p>
    <form method="POST" action="/login">
      <label>
        Email
        <input type="email" name="email" placeholder="user@example.com" required />
      </label>
      <label>
        Role
        <select name="role" required>
          <option value="STUDENT">STUDENT</option>
          <option value="FACULTY">FACULTY</option>
          <option value="ADMIN">ADMIN</option>
          <option value="INDUSTRY">INDUSTRY</option>
        </select>
      </label>
      <input type="hidden" name="callbackUrl" value="${callbackUrl.replace(/"/g, '&quot;')}" />
      <button type="submit">Sign in</button>
    </form>
  </body>
</html>`);
});

app.post('/login', (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const requestedRole = typeof req.body.role === 'string' ? req.body.role.trim().toUpperCase() : 'STUDENT';
  const role = ALLOWED_ROLES.has(requestedRole) ? requestedRole : 'STUDENT';
  const callbackUrl = typeof req.body.callbackUrl === 'string' && req.body.callbackUrl.trim() !== ''
    ? req.body.callbackUrl
    : DEFAULT_CALLBACK_URL;

  if (!email) {
    res.status(400).send('Email is required.');
    return;
  }

  const token = jwt.sign(
    {
      email,
      role,
      status: 'ACTIVE',
    },
    COE_SHARED_TOKEN_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '1h',
    },
  );

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  res.redirect(302, callbackUrl);
});

app.get('/logout', (req, res) => {
  const callbackUrl = typeof req.query.callbackUrl === 'string' && req.query.callbackUrl.trim() !== ''
    ? req.query.callbackUrl
    : DEFAULT_CALLBACK_URL;

  const cookieOptions = [
    { path: '/' },
    { path: '/', domain: '127.0.0.1' },
    { path: '/', domain: 'localhost' },
    { path: '/', domain: '.tcetcercd.in' }
  ];

  cookieOptions.forEach(opt => {
    res.cookie(COOKIE_NAME, '', { ...opt, expires: new Date(0), httpOnly: true });
    res.clearCookie(COOKIE_NAME, opt);
  });

  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.redirect(302, callbackUrl);
});

app.listen(PORT, () => {
  console.log(`Mock SSO server running at http://localhost:${PORT}`);
});
