/** Lightweight ETag support for JSON GET endpoints (reduces mobile data). */
function jsonEtag(payload) {
  return `"${Buffer.from(JSON.stringify(payload)).toString('base64url').slice(0, 32)}"`;
}

function sendJsonCached(req, res, body) {
  const etag = jsonEtag(body);
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=30');
  res.json(body);
}

module.exports = { jsonEtag, sendJsonCached };
