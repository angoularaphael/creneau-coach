'use strict';

function logInfo(msg, meta) {
  console.log(`[creneau-bot] ${msg}`, meta ? JSON.stringify(meta) : '');
}
function logWarn(msg, meta) {
  console.warn(`[creneau-bot] WARN ${msg}`, meta ? JSON.stringify(meta) : '');
}
function logError(msg, meta) {
  console.error(`[creneau-bot] ERR ${msg}`, meta ? JSON.stringify(meta) : '');
}

module.exports = { logInfo, logWarn, logError };
