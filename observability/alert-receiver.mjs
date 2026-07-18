import { createServer } from 'node:http';

const maxBodyBytes = 64 * 1024;
const events = [];

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodyBytes) {
        reject(new Error('body_too_large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://alert-receiver.local');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/events') {
    sendJson(response, 200, { events });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/reset') {
    events.length = 0;
    sendJson(response, 200, { status: 'reset' });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/alerts') {
    try {
      const payload = JSON.parse(await readBody(request));
      const status = payload?.status;
      if (status !== 'firing' && status !== 'resolved') {
        sendJson(response, 400, { error: 'invalid_alert_status' });
        return;
      }
      events.push({ receivedAt: new Date().toISOString(), status });
      if (events.length > 100) events.shift();
      sendJson(response, 200, { status: 'accepted' });
    } catch {
      sendJson(response, 400, { error: 'invalid_json' });
    }
    return;
  }
  sendJson(response, 404, { error: 'not_found' });
});

server.listen(8080, '0.0.0.0');

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
