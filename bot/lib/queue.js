'use strict';

const fs = require('fs');
const path = require('path');

const QUEUE_DIR = process.env.BOT_QUEUE_DIR || path.join(__dirname, '..', 'data', 'queue');

function ensure() {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
}

function enqueue(job) {
  ensure();
  const id = String(job.order_id || job.reservation_id || `job-${Date.now()}`);
  const action = String(job.action || 'coach_grant');
  const file = path.join(QUEUE_DIR, `${id}__${action}.json`.replace(/[^a-zA-Z0-9._-]+/g, '_'));
  const row = {
    ...job,
    job_id: `${id}#${action}`,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(row, null, 2));
  return { queued: true, job_id: row.job_id };
}

function listPending() {
  ensure();
  return fs
    .readdirSync(QUEUE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return { ...JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8')), file: path.join(QUEUE_DIR, f) };
      } catch {
        return null;
      }
    })
    .filter((j) => j && j.status === 'pending');
}

function markDone(file, patch = {}) {
  if (!file || !fs.existsSync(file)) return;
  const row = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...row, ...patch, status: patch.status || 'success', updated_at: new Date().toISOString() }, null, 2));
}

function stats() {
  ensure();
  const files = fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.json'));
  return { files: files.length, pending: listPending().length };
}

module.exports = { enqueue, listPending, markDone, stats, QUEUE_DIR };
