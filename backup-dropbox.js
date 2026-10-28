/**
 * Nightly offsite backup of data.json to Dropbox
 * Independence Environmental Services — RouteBoard
 *
 * Runs on a 24-hour interval inside the Railway container.
 * Keeps 90 days of timestamped snapshots in Dropbox, then prunes.
 *
 * Required env var:
 *   DROPBOX_ACCESS_TOKEN  — long-lived or refreshable token with
 *                           files.content.write and files.content.read scopes
 *
 * Optional env var:
 *   DROPBOX_BACKUP_FOLDER — folder path in Dropbox (default: /RouteBoard Backups)
 *   BACKUP_RETENTION_DAYS — days to keep (default: 90)
 */

var fs = require('fs');
var path = require('path');
var https = require('https');

var DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN || '';
var DROPBOX_FOLDER = process.env.DROPBOX_BACKUP_FOLDER || '/RouteBoard Backups';
var RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 90;

// Railway volume or local
var DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data';
var DATA_FILE = path.join(DATA_DIR, 'data.json');

// ── helpers ────────────────────────────────────────────────────────

function dropboxRequest(endpoint, body, callback) {
  var postData = JSON.stringify(body);
  var opts = {
    hostname: 'api.dropboxapi.com',
    port: 443,
    path: '/2' + endpoint,
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + DROPBOX_TOKEN,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  var req = https.request(opts, function(res) {
    var chunks = [];
    res.on('data', function(c) { chunks.push(c); });
    res.on('end', function() {
      var raw = Buffer.concat(chunks).toString();
      try { callback(null, JSON.parse(raw), res.statusCode); }
      catch(e) { callback(null, raw, res.statusCode); }
    });
  });
  req.on('error', callback);
  req.write(postData);
  req.end();
}

function dropboxUpload(remotePath, data, callback) {
  var opts = {
    hostname: 'content.dropboxapi.com',
    port: 443,
    path: '/2/files/upload',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + DROPBOX_TOKEN,
      'Dropbox-API-Arg': JSON.stringify({
        path: remotePath,
        mode: 'overwrite',
        autorename: false,
        mute: true
      }),
      'Content-Type': 'application/octet-stream',
      'Content-Length': Buffer.byteLength(data)
    }
  };
  var req = https.request(opts, function(res) {
    var chunks = [];
    res.on('data', function(c) { chunks.push(c); });
    res.on('end', function() {
      var raw = Buffer.concat(chunks).toString();
      try { callback(null, JSON.parse(raw), res.statusCode); }
      catch(e) { callback(null, raw, res.statusCode); }
    });
  });
  req.on('error', callback);
  req.write(data);
  req.end();
}

// ── main backup logic ──────────────────────────────────────────────

function runBackup() {
  if (!DROPBOX_TOKEN) {
    console.log('[dropbox-backup] DROPBOX_ACCESS_TOKEN not set — skipping');
    return;
  }
  if (!fs.existsSync(DATA_FILE)) {
    console.log('[dropbox-backup] ' + DATA_FILE + ' does not exist — skipping');
    return;
  }

  var now = new Date();
  var stamp = now.toISOString().slice(0, 10); // YYYY-MM-DD
  var remotePath = DROPBOX_FOLDER + '/data-' + stamp + '.json';

  var content = fs.readFileSync(DATA_FILE);
  var sizeMb = (content.length / 1048576).toFixed(2);

  console.log('[dropbox-backup] Uploading ' + sizeMb + ' MB → ' + remotePath);

  dropboxUpload(remotePath, content, function(err, body, status) {
    if (err) {
      console.error('[dropbox-backup] Upload error:', err.message);
      return;
    }
    if (status >= 200 && status < 300) {
      console.log('[dropbox-backup] Upload OK (' + stamp + ')');
      pruneOldBackups();
    } else {
      console.error('[dropbox-backup] Upload failed (HTTP ' + status + '):', JSON.stringify(body));
    }
  });
}

function pruneOldBackups() {
  // List files in the backup folder
  dropboxRequest('/files/list_folder', {
    path: DROPBOX_FOLDER,
    recursive: false,
    limit: 2000
  }, function(err, body, status) {
    if (err || status >= 300) {
      console.error('[dropbox-backup] List error:', err ? err.message : JSON.stringify(body));
      return;
    }

    var entries = (body.entries || []).filter(function(e) {
      return e['.tag'] === 'file' && e.name.match(/^data-\d{4}-\d{2}-\d{2}\.json$/);
    });

    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    var cutoffStr = cutoff.toISOString().slice(0, 10);

    var toDelete = entries.filter(function(e) {
      var dateStr = e.name.replace('data-', '').replace('.json', '');
      return dateStr < cutoffStr;
    });

    if (toDelete.length === 0) {
      console.log('[dropbox-backup] Nothing to prune (keeping ' + entries.length + ' backups)');
      return;
    }

    console.log('[dropbox-backup] Pruning ' + toDelete.length + ' backup(s) older than ' + RETENTION_DAYS + ' days');

    var deleteBatch = toDelete.map(function(e) { return { path: e.path_lower }; });
    dropboxRequest('/files/delete_batch', { entries: deleteBatch }, function(err2, body2, status2) {
      if (err2 || status2 >= 300) {
        console.error('[dropbox-backup] Prune error:', err2 ? err2.message : JSON.stringify(body2));
      } else {
        console.log('[dropbox-backup] Pruned ' + toDelete.length + ' old backup(s)');
      }
    });
  });
}

// ── exports (loaded by server.js) ──────────────────────────────────

module.exports = {
  /** Call once at startup to run first backup + start 24h interval */
  start: function() {
    if (!DROPBOX_TOKEN) {
      console.log('[dropbox-backup] DROPBOX_ACCESS_TOKEN not set — offsite backup disabled');
      console.log('[dropbox-backup] Set it in Railway env vars to enable nightly Dropbox backups');
      return;
    }
    console.log('[dropbox-backup] Offsite backup enabled → ' + DROPBOX_FOLDER);
    console.log('[dropbox-backup] Retention: ' + RETENTION_DAYS + ' days');

    // First backup 60 seconds after boot (let the app settle)
    setTimeout(runBackup, 60000);

    // Then every 24 hours
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  },

  /** Manual trigger (e.g. from an admin endpoint) */
  runNow: runBackup
};
