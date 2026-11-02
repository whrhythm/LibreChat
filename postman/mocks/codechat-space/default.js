// Synthetic identity-scoped plan API; no real identities or data.
const http = require('http');
const send = (res, code, body) => { res.writeHead(code, {'Content-Type': 'application/json'}); res.end(JSON.stringify(body)); };
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!/^\/v1\/tenants\/[^/]+\/projects\/[^/]+\/environment$/.test(path)) return send(res, 501, {});
  const authorization = req.headers.authorization || '';
  if (authorization === 'Bearer synthetic-failure') return send(res, 503, {detail: 'synthetic internal details'});
  if (authorization === 'Bearer synthetic-invalid') return send(res, 200, {id: 'invalid'});
  if (!['Bearer synthetic-alice', 'Bearer synthetic-bob'].includes(authorization)) return send(res, 401, {});
  const user = authorization.slice(7);
  const records = (await pm.state.get('codechat_space_records')) || {};
  if (req.method === 'GET') return send(res, records[user] ? 200 : 404, records[user] || {detail: 'Environment not found'});
  if (req.method === 'POST') {
    records[user] ||= {id: user + '-plan', status: 'requested', mode: 'plan', executable: false, storage_gib: 2};
    await pm.state.set('codechat_space_records', records);
    return send(res, 200, records[user]);
  }
  return send(res, 501, {});
}).listen(process.env.PORT || 4502);
