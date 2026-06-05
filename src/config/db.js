const { getDb } = require('./firebase');

function db() {
  return getDb();
}

module.exports = { db };
