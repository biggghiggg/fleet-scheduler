const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Use persistent volume on Railway, local directory otherwise
var DATA_DIR = __dirname;
if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  console.log('Using Railway volume: ' + DATA_DIR);
} else if (process.env.RAILWAY_ENVIRONMENT) {
  DATA_DIR = '/data';
  console.log('Using Railway data dir: ' + DATA_DIR);
}
if (!fs.existsSync(DATA_DIR)) { fs.mkdirSync(DATA_DIR, { recursive: true }); }

const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const defaultData = {
  drivers: [
    {id:'d1',name:'Brian',role:'Driver',skills:[]},
    {id:'d2',name:'Dicky',role:'Driver',skills:[]},
    {id:'d3',name:'Kevin',role:'Driver',skills:[]},
    {id:'d4',name:'Lenny',role:'Driver',skills:[]},
    {id:'d5',name:'Oscar',role:'Driver',skills:[]},
    {id:'d6',name:'Tony',role:'Driver',skills:[]},
    {id:'d7',name:'John',role:'Driver',skills:[]},
    {id:'d8',name:'Kasey',role:'Tech',skills:[]},
    {id:'d9',name:'Chucky',role:'Warehouse',skills:[]},
    {id:'d10',name:'Blake',role:'Sales/Driver',skills:[]},
    {id:'d11',name:'Miguel',role:'Driver',skills:[]},
    {id:'d12',name:'Trevor',role:'Tech',skills:[]},
  ],
  trucks: [
    {id:'t1',name:'Truck 1',type:'Standard',status:'Active'},
    {id:'t2',name:'Truck 2',type:'Standard',status:'Active'},
    {id:'t3',name:'Truck 3',type:'Flatbed',status:'Active'},
    {id:'t4',name:'Truck 4',type:'Standard',status:'Active'},
    {id:'t5',name:'Truck 5',type:'Standard',status:'Active'},
    {id:'t6',name:'Truck 6',type:'Standard',status:'Active'},
    {id:'t7',name:'Truck 7',type:'Standard',status:'Active'},
    {id:'t8',name:'Truck 8',type:'Standard',status:'Active'},
    {id:'t9',name:'Truck 9',type:'Vac Truck',status:'Active'},
  ],
  trailers: [
    {id:'tr1',name:'Trailer 1',type:'Standard'},
    {id:'tr2',name:'Trailer 2',type:'Flatbed'},
    {id:'tr3',name:'Trailer 3',type:'Tanker'},
  ],
  jobs: [],
  customers: [],
  equipment: ['Liftgate','Drum Dolly','Placards','PPE','Bins','Totes'],
  locations: ['EWS','Brenntag Fresno','Brenntag Richmond','Coast','GQ','Avenal','Lost Hills','Madera','Thatcher','Bolthouse','Leprinos','Eagle Quick Lube','Faraday','PAC','PRR','Local Route','Parc/Atlas/High Bar','F&T Farms']
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { console.error('Error loading data:', e.message); }
  saveData(defaultData);
  return defaultData;
}

function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

function createBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
    var date = new Date().toISOString().slice(0, 10);
    var backupFile = path.join(BACKUP_DIR, 'data-' + date + '.json');
    if (!fs.existsSync(backupFile) && fs.existsSync(DATA_FILE)) {
      fs.copyFileSync(DATA_FILE, backupFile);
      console.log('Backup created: ' + backupFile);
      var files = fs.readdirSync(BACKUP_DIR).sort();
      while (files.length > 30) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch(e) { console.error('Backup error:', e.message); }
}

var data = loadData();
if (!data.locations) { data.locations = defaultData.locations; saveData(data); }
if (!data.customers) { data.customers = []; saveData(data); }
console.log('DATA_DIR = ' + DATA_DIR);
console.log('DATA_FILE = ' + DATA_FILE);
console.log('RAILWAY_VOLUME_MOUNT_PATH = ' + (process.env.RAILWAY_VOLUME_MOUNT_PATH || 'NOT SET'));
console.log('Data file exists: ' + fs.existsSync(DATA_FILE));
console.log('Drivers count: ' + data.drivers.length);
console.log('Jobs count: ' + data.jobs.length);
createBackup();
setInterval(createBackup, 3600000);

var clients = [];
function broadcast(msg) {
  var payload = 'data: ' + JSON.stringify(msg) + '\n\n';
  clients.forEach(function(res) { res.write(payload); });
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// DOCUMENTS / FILE UPLOADS
var UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); }
var DOCS_FILE = path.join(DATA_DIR, 'documents.json');

function loadDocs() {
  try {
    if (fs.existsSync(DOCS_FILE)) return JSON.parse(fs.readFileSync(DOCS_FILE, 'utf8'));
  } catch(e) { console.error('Error loading docs:', e.message); }
  return [];
}
function saveDocs(docs) { fs.writeFileSync(DOCS_FILE, JSON.stringify(docs, null, 2)); }
var documents = loadDocs();

var upload = multer({
  storage: multer.diskStorage({
    destination: function(req, file, cb) { cb(null, UPLOADS_DIR); },
    filename: function(req, file, cb) { cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')); }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.get('/api/documents', function(req, res) { res.json(documents); });

app.post('/api/documents', upload.single('file'), function(req, res) {
  if (!req.file) return res.status(400).json({error:'No file uploaded'});
  var doc = {
    id: 'doc' + Date.now(),
    name: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    type: req.file.mimetype,
    uploadedAt: new Date().toISOString(),
    category: req.body.category || 'General'
  };
  documents.push(doc);
  saveDocs(documents);
  res.json(doc);
});

app.get('/api/documents/:id/download', function(req, res) {
  var doc = documents.find(function(d) { return d.id === req.params.id; });
  if (!doc) return res.status(404).json({error:'Not found'});
  var filePath = path.join(UPLOADS_DIR, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({error:'File not found'});
  res.download(filePath, doc.name);
});

app.delete('/api/documents/:id', function(req, res) {
  var doc = documents.find(function(d) { return d.id === req.params.id; });
  if (!doc) return res.status(404).json({error:'Not found'});
  var filePath = path.join(UPLOADS_DIR, doc.filename);
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
  documents = documents.filter(function(d) { return d.id !== req.params.id; });
  saveDocs(documents);
  res.json({ok:true});
});

app.get('/api/events', function(req, res) {
  res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' });
  res.write('data: ' + JSON.stringify({ type:'connected', data: data }) + '\n\n');
  clients.push(res);
  console.log('Client connected (' + clients.length + ' total)');
  req.on('close', function() {
    clients = clients.filter(function(c) { return c !== res; });
    console.log('Client disconnected (' + clients.length + ' total)');
  });
});

app.get('/api/data', function(req, res) { res.json(data); });

// PRINT JOB PAGE - serves a clean printable page for a single job
app.get('/print-job', function(req, res) {
  var q = req.query;
  var html = '<!DOCTYPE html><html><head><title>Job - ' + (q.driver||'') + ' - ' + (q.date||'') + '</title>';
  html += '<style>';
  html += '*{margin:0;padding:0;box-sizing:border-box}';
  html += 'body{font-family:Arial,Helvetica,sans-serif;padding:40px;color:#000;max-width:800px;margin:0 auto}';
  html += '.header{text-align:center;margin-bottom:30px;padding-bottom:16px;border-bottom:4px solid #000}';
  html += '.header h1{font-size:26px;font-weight:900;margin-bottom:4px}';
  html += '.header .company{font-size:14px;color:#444;font-weight:600;letter-spacing:0.5px}';
  html += '.row{display:flex;padding:12px 0;border-bottom:1px solid #ddd;font-size:16px}';
  html += '.label{font-weight:700;min-width:170px;color:#333}';
  html += '.value{flex:1;font-size:16px}';
  html += '.placards-section{margin-top:16px;border:2px solid #d97706;padding:14px;background:#fffbeb}';
  html += '.placards-section h3{font-size:14px;font-weight:700;margin-bottom:8px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px}';
  html += '.placards-section .placard-tag{display:inline-block;background:#fef3c7;border:1px solid #d97706;border-radius:4px;padding:3px 8px;margin:2px 4px 2px 0;font-size:13px;font-weight:600}';
  html += '.notes-section{margin-top:16px;border:2px solid #000;padding:16px;background:#f8f8f8}';
  html += '.notes-section h3{font-size:15px;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}';
  html += '.notes-section p{font-size:14px;line-height:1.7;white-space:pre-wrap}';
  html += '.signature{margin-top:40px;display:flex;gap:40px}';
  html += '.sig-line{flex:1;border-bottom:1px solid #000;padding-bottom:4px;font-size:11px;color:#666}';
  html += '.footer{margin-top:30px;padding-top:10px;border-top:2px solid #000;font-size:10px;color:#888;display:flex;justify-content:space-between}';
  html += '.back-link{display:inline-block;margin-bottom:20px;color:#2563eb;text-decoration:none;font-size:14px}';
  html += '@media print{.back-link{display:none}body{padding:30px}.placards-section{background:#fffbeb !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.placards-section .placard-tag{background:#fef3c7 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  html += '</style></head><body>';
  html += '<a href="javascript:history.back()" class="back-link">&larr; Back to Scheduler</a>';
  html += '<div class="header"><h1>Job Assignment</h1><div class="company">Independence Environmental Services</div></div>';
  html += '<div class="row"><div class="label">Date:</div><div class="value">' + (q.date||'') + '</div></div>';
  html += '<div class="row"><div class="label">Driver:</div><div class="value"><strong>' + (q.driver||'') + '</strong></div></div>';
  html += '<div class="row"><div class="label">Location / Job:</div><div class="value"><strong>' + (q.location||'') + '</strong></div></div>';
  html += '<div class="row"><div class="label">Truck:</div><div class="value">' + (q.truck||'None') + '</div></div>';
  html += '<div class="row"><div class="label">Trailer:</div><div class="value">' + (q.trailer||'None') + '</div></div>';
  html += '<div class="row"><div class="label">Time Window:</div><div class="value">' + (q.timeWindow||'\u2014') + '</div></div>';
  html += '<div class="row"><div class="label">Equipment:</div><div class="value">' + (q.equipment||'None') + '</div></div>';
  html += '<div class="row"><div class="label">Status:</div><div class="value">' + (q.status||'') + '</div></div>';
  if(q.placards && q.placards !== 'None') {
    html += '<div class="placards-section"><h3>&#9888; Required Placards</h3>';
    var pList = q.placards.split(', ');
    pList.forEach(function(p) { html += '<span class="placard-tag">' + p + '</span>'; });
    html += '</div>';
  }
  if(q.notes) {
    html += '<div class="notes-section"><h3>Notes / Special Instructions</h3><p>' + q.notes + '</p></div>';
  }
  html += '<div class="signature"><div class="sig-line">Driver Signature</div><div class="sig-line">Date</div></div>';
  html += '<div class="footer"><span>Independence Environmental Services</span><span>Printed: ' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString() + '</span></div>';
  html += '</body></html>';
  res.send(html);
});

// PRINT CUSTOMER PAGE
app.get('/print-customer', function(req, res) {
  var q = req.query;
  var addr = [q.address, q.city, q.state, q.zip].filter(Boolean).join(', ');
  var html = '<!DOCTYPE html><html><head><title>Customer - ' + (q.name||'') + '</title>';
  html += '<style>';
  html += '*{margin:0;padding:0;box-sizing:border-box}';
  html += 'body{font-family:Arial,Helvetica,sans-serif;padding:40px;color:#000;max-width:800px;margin:0 auto}';
  html += '.header{text-align:center;margin-bottom:30px;padding-bottom:16px;border-bottom:4px solid #000}';
  html += '.header h1{font-size:26px;font-weight:900;margin-bottom:4px}';
  html += '.header .company{font-size:14px;color:#444;font-weight:600;letter-spacing:0.5px}';
  html += '.cust-name{font-size:22px;font-weight:800;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #333}';
  html += '.row{display:flex;padding:10px 0;border-bottom:1px solid #ddd;font-size:15px}';
  html += '.label{font-weight:700;min-width:150px;color:#333}';
  html += '.value{flex:1;font-size:15px}';
  html += '.section{margin-top:20px;border:2px solid #000;padding:16px}';
  html += '.section h3{font-size:14px;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}';
  html += '.section p{font-size:14px;line-height:1.7;white-space:pre-wrap}';
  html += '.pricing{background:#f0fdf4;border-color:#16a34a}';
  html += '.notes{background:#f8f8f8;border-color:#000}';
  html += '.footer{margin-top:30px;padding-top:10px;border-top:2px solid #000;font-size:10px;color:#888;display:flex;justify-content:space-between}';
  html += '.back-link{display:inline-block;margin-bottom:20px;color:#2563eb;text-decoration:none;font-size:14px}';
  html += '@media print{.back-link{display:none}body{padding:30px}.pricing{background:#f0fdf4 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  html += '</style></head><body>';
  html += '<a href="javascript:history.back()" class="back-link">&larr; Back to Scheduler</a>';
  html += '<div class="header"><h1>Customer Information</h1><div class="company">Independence Environmental Services</div></div>';
  html += '<div class="cust-name">' + (q.name||'') + '</div>';
  if(q.contact) html += '<div class="row"><div class="label">Contact:</div><div class="value">' + q.contact + '</div></div>';
  if(addr) html += '<div class="row"><div class="label">Address:</div><div class="value">' + addr + '</div></div>';
  if(q.phone) html += '<div class="row"><div class="label">Phone:</div><div class="value">' + q.phone + '</div></div>';
  if(q.email) html += '<div class="row"><div class="label">Email:</div><div class="value">' + q.email + '</div></div>';
  if(q.pricing) {
    html += '<div class="section pricing"><h3>Pricing Information</h3><p>' + q.pricing + '</p></div>';
  }
  if(q.notes) {
    html += '<div class="section notes"><h3>Notes / Special Instructions</h3><p>' + q.notes + '</p></div>';
  }
  html += '<div class="footer"><span>Independence Environmental Services</span><span>Printed: ' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString() + '</span></div>';
  html += '</body></html>';
  res.send(html);
});

// JOBS
app.post('/api/jobs', function(req, res) {
  var job = Object.assign({}, req.body, { id: 'j' + Date.now() + Math.random().toString(36).slice(2) });
  data.jobs.push(job); saveData(data); broadcast({type:'job-added',job:job}); res.json(job);
});
app.put('/api/jobs/:id', function(req, res) {
  var idx = data.jobs.findIndex(function(j) { return j.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(data.jobs[idx], req.body);
  saveData(data); broadcast({type:'job-updated',job:data.jobs[idx]}); res.json(data.jobs[idx]);
});
app.delete('/api/jobs/:id', function(req, res) {
  data.jobs = data.jobs.filter(function(j) { return j.id !== req.params.id; });
  saveData(data); broadcast({type:'job-deleted',jobId:req.params.id}); res.json({ok:true});
});

// DRIVERS
app.post('/api/drivers', function(req, res) {
  var driver = Object.assign({}, req.body, { id: 'd' + Date.now() });
  data.drivers.push(driver); saveData(data); broadcast({type:'full-sync',data:data}); res.json(driver);
});
app.put('/api/drivers/:id', function(req, res) {
  var idx = data.drivers.findIndex(function(d) { return d.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(data.drivers[idx], req.body);
  saveData(data); broadcast({type:'full-sync',data:data}); res.json(data.drivers[idx]);
});
app.delete('/api/drivers/:id', function(req, res) {
  data.drivers = data.drivers.filter(function(d) { return d.id !== req.params.id; });
  data.jobs = data.jobs.filter(function(j) { return j.driverId !== req.params.id; });
  saveData(data); broadcast({type:'full-sync',data:data}); res.json({ok:true});
});

// DRIVER REORDER
app.put('/api/drivers-reorder', function(req, res) {
  var ids = req.body.order;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({error:'order array required'});
  var reordered = [];
  ids.forEach(function(id) {
    var d = data.drivers.find(function(x) { return x.id === id; });
    if (d) reordered.push(d);
  });
  data.drivers.forEach(function(d) {
    if (ids.indexOf(d.id) === -1) reordered.push(d);
  });
  data.drivers = reordered;
  saveData(data); broadcast({type:'full-sync',data:data}); res.json({ok:true});
});

// TRUCKS
app.post('/api/trucks', function(req, res) {
  var truck = Object.assign({}, req.body, { id: 't' + Date.now() });
  data.trucks.push(truck); saveData(data); broadcast({type:'full-sync',data:data}); res.json(truck);
});
app.put('/api/trucks/:id', function(req, res) {
  var idx = data.trucks.findIndex(function(t) { return t.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(data.trucks[idx], req.body);
  saveData(data); broadcast({type:'full-sync',data:data}); res.json(data.trucks[idx]);
});
app.delete('/api/trucks/:id', function(req, res) {
  data.trucks = data.trucks.filter(function(t) { return t.id !== req.params.id; });
  saveData(data); broadcast({type:'full-sync',data:data}); res.json({ok:true});
});

// TRAILERS
app.post('/api/trailers', function(req, res) {
  var trailer = Object.assign({}, req.body, { id: 'tr' + Date.now() });
  data.trailers.push(trailer); saveData(data); broadcast({type:'full-sync',data:data}); res.json(trailer);
});
app.put('/api/trailers/:id', function(req, res) {
  var idx = data.trailers.findIndex(function(t) { return t.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(data.trailers[idx], req.body);
  saveData(data); broadcast({type:'full-sync',data:data}); res.json(data.trailers[idx]);
});
app.delete('/api/trailers/:id', function(req, res) {
  data.trailers = data.trailers.filter(function(t) { return t.id !== req.params.id; });
  saveData(data); broadcast({type:'full-sync',data:data}); res.json({ok:true});
});

// EQUIPMENT
app.post('/api/equipment', function(req, res) {
  if (req.body.name && data.equipment.indexOf(req.body.name) === -1) {
    data.equipment.push(req.body.name); saveData(data); broadcast({type:'full-sync',data:data});
  }
  res.json({ok:true});
});
app.delete('/api/equipment/:name', function(req, res) {
  data.equipment = data.equipment.filter(function(e) { return e !== req.params.name; });
  saveData(data); broadcast({type:'full-sync',data:data}); res.json({ok:true});
});

// LOCATIONS
app.post('/api/locations', function(req, res) {
  if (req.body.name && data.locations.indexOf(req.body.name) === -1) {
    data.locations.push(req.body.name); data.locations.sort();
    saveData(data); broadcast({type:'full-sync',data:data});
  }
  res.json({ok:true});
});
app.put('/api/locations', function(req, res) {
  if (req.body.oldName && req.body.newName) {
    var idx = data.locations.indexOf(req.body.oldName);
    if (idx !== -1) { data.locations[idx] = req.body.newName; data.locations.sort(); saveData(data); broadcast({type:'full-sync',data:data}); }
  }
  res.json({ok:true});
});
app.delete('/api/locations/:name', function(req, res) {
  data.locations = data.locations.filter(function(l) { return l !== req.params.name; });
  saveData(data); broadcast({type:'full-sync',data:data}); res.json({ok:true});
});

// CUSTOMERS
app.get('/api/customers', function(req, res) { res.json(data.customers || []); });
app.post('/api/customers', function(req, res) {
  var cust = Object.assign({}, req.body, { id: 'cust' + Date.now() });
  data.customers.push(cust); saveData(data); broadcast({type:'full-sync',data:data}); res.json(cust);
});
app.put('/api/customers/:id', function(req, res) {
  var idx = data.customers.findIndex(function(c) { return c.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(data.customers[idx], req.body);
  saveData(data); broadcast({type:'full-sync',data:data}); res.json(data.customers[idx]);
});
app.delete('/api/customers/:id', function(req, res) {
  data.customers = data.customers.filter(function(c) { return c.id !== req.params.id; });
  saveData(data); broadcast({type:'full-sync',data:data}); res.json({ok:true});
});
app.post('/api/customers/import', function(req, res) {
  var rows = req.body.customers;
  if (!rows || !Array.isArray(rows)) return res.status(400).json({error:'customers array required'});
  var count = 0;
  rows.forEach(function(r) {
    if (!r.name || !r.name.trim()) return;
    var cust = {
      id: 'cust' + Date.now() + Math.random().toString(36).slice(2),
      name: (r.name||'').trim(),
      address: (r.address||'').trim(),
      city: (r.city||'').trim(),
      state: (r.state||'').trim(),
      zip: (r.zip||'').trim(),
      phone: (r.phone||'').trim(),
      email: (r.email||'').trim(),
      contact: (r.contact||'').trim(),
      pricing: (r.pricing||'').trim(),
      notes: (r.notes||'').trim()
    };
    data.customers.push(cust);
    count++;
  });
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json({ok:true, imported:count});
});

function getLocalIP() {
  var interfaces = os.networkInterfaces();
  var keys = Object.keys(interfaces);
  for (var k = 0; k < keys.length; k++) {
    var ifaces = interfaces[keys[k]];
    for (var i = 0; i < ifaces.length; i++) {
      if (ifaces[i].family === 'IPv4' && !ifaces[i].internal) return ifaces[i].address;
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', function() {
  var ip = getLocalIP();
  console.log('');
  console.log('===========================================');
  console.log('   FLEET SCHEDULER IS RUNNING');
  console.log('===========================================');
  console.log('');
  console.log('   Open in browser:  http://localhost:' + PORT);
  console.log('   Local network:    http://' + ip + ':' + PORT);
  console.log('');
  console.log('   Keep this window open while in use.');
  console.log('   Data saved to: ' + DATA_FILE);
  console.log('===========================================');
});
