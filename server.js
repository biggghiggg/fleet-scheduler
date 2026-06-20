const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
var PDFDocument = require('pdfkit');

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
  bins: [],
  vendors: [],
  unbilled: [],
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
if (!data.pickups) { data.pickups = []; saveData(data); }
if (!data.bins) { data.bins = []; saveData(data); }
if (!data.vendors) { data.vendors = []; saveData(data); }
if (!data.unbilled) { data.unbilled = []; saveData(data); }
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

app.get('/api/documents/:id/view', function(req, res) {
  var doc = documents.find(function(d) { return d.id === req.params.id; });
  if (!doc) return res.status(404).json({error:'Not found'});
  var filePath = path.join(UPLOADS_DIR, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({error:'File not found'});
  var ext = doc.name.split('.').pop().toLowerCase();
  var mimeTypes = {
    'pdf':'application/pdf','png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg',
    'gif':'image/gif','txt':'text/plain','csv':'text/csv','html':'text/html',
    'doc':'application/msword','docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls':'application/vnd.ms-excel','xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  var mime = mimeTypes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', 'inline; filename="' + doc.name + '"');
  fs.createReadStream(filePath).pipe(res);
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

// PRINT JOB PAGE - serves a clean printable page via POST with multiple customers
app.use(express.urlencoded({extended:true}));
app.post('/print-job', function(req, res) {
  var jobData;
  try { jobData = JSON.parse(req.body.jobData); } catch(e) { return res.status(400).send('Invalid data'); }
  var q = jobData;
  var customers = q.customers || [];
  if(customers.length === 0) customers = [null]; // at least one page even with no customer

  var html = '<!DOCTYPE html><html><head><title>Job - ' + (q.driver||'') + ' - ' + (q.date||'') + '</title>';
  html += '<style>';
  html += '*{margin:0;padding:0;box-sizing:border-box}';
  html += 'body{font-family:Arial,Helvetica,sans-serif;padding:20px 30px;color:#000;max-width:800px;margin:0 auto;font-size:13px}';
  html += '.page{page-break-after:always}';
  html += '.page:last-child{page-break-after:auto}';
  html += '.header{text-align:center;margin-bottom:12px;padding-bottom:8px;border-bottom:3px solid #000}';
  html += '.header h1{font-size:20px;font-weight:900;margin-bottom:2px}';
  html += '.header .company{font-size:12px;color:#444;font-weight:600;letter-spacing:0.5px}';
  html += '.row{display:flex;padding:6px 0;border-bottom:1px solid #ddd;font-size:13px}';
  html += '.label{font-weight:700;min-width:140px;color:#333}';
  html += '.value{flex:1;font-size:13px}';
  html += '.cust-box{margin:8px 0;border:2px solid #2563eb;border-radius:6px;padding:8px 10px;background:#eff6ff}';
  html += '.cust-box .cust-title{font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px}';
  html += '.placards-section{margin-top:8px;border:2px solid #d97706;padding:8px 10px;background:#fffbeb}';
  html += '.placards-section h3{font-size:12px;font-weight:700;margin-bottom:4px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px}';
  html += '.placards-section .placard-tag{display:inline-block;background:#fef3c7;border:1px solid #d97706;border-radius:4px;padding:2px 6px;margin:1px 3px 1px 0;font-size:11px;font-weight:600}';
  html += '.notes-section{margin-top:8px;border:2px solid #000;padding:8px 10px;background:#f8f8f8}';
  html += '.notes-section h3{font-size:12px;font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px}';
  html += '.notes-section p{font-size:12px;line-height:1.4;white-space:pre-wrap}';
  html += '.signature{margin-top:20px;display:flex;gap:40px}';
  html += '.sig-line{flex:1;border-bottom:1px solid #000;padding-bottom:4px;font-size:10px;color:#666}';
  html += '.footer{margin-top:14px;padding-top:6px;border-top:2px solid #000;font-size:9px;color:#888;display:flex;justify-content:space-between}';
  html += '.back-link{display:inline-block;margin-bottom:10px;color:#2563eb;text-decoration:none;font-size:13px}';
  html += '@media print{.back-link{display:none}body{padding:15px 20px}.cust-box{background:#eff6ff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.placards-section{background:#fffbeb !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.placards-section .placard-tag{background:#fef3c7 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}div[style*="background:#f5f3ff"]{background:#f5f3ff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  html += '</style></head><body>';
  html += '<a href="javascript:history.back()" class="back-link">&larr; Back to RouteBoard</a>';

  customers.forEach(function(cust, idx) {
    html += '<div class="page">';
    html += '<div class="header"><h1>Job Assignment</h1><div class="company">Independence Environmental Services</div></div>';
    html += '<div class="row"><div class="label">Date:</div><div class="value">' + (q.date||'') + '</div></div>';
    html += '<div class="row"><div class="label">Driver:</div><div class="value"><strong>' + (q.driver||'') + '</strong></div></div>';
    html += '<div class="row"><div class="label">Location / Job:</div><div class="value"><strong>' + (q.location||'') + '</strong></div></div>';
    if(cust) {
      html += '<div class="cust-box"><div class="cust-title">Customer Information</div>';
      html += '<div style="font-size:13px;font-weight:700;margin-bottom:2px">' + (cust.name||'') + '</div>';
      if(cust.address) html += '<div style="font-size:12px;margin-bottom:1px">' + cust.address + '</div>';
      if(cust.phone) html += '<div style="font-size:12px;margin-bottom:1px">Phone: ' + cust.phone + '</div>';
      if(cust.contact) html += '<div style="font-size:12px;margin-bottom:1px">Contact: ' + cust.contact + '</div>';
      if(cust.pricing) html += '<div style="font-size:11px;margin-top:4px;padding-top:4px;border-top:1px solid #93c5fd;white-space:pre-wrap">' + cust.pricing + '</div>';
      html += '</div>';
    }
    html += '<div class="row"><div class="label">Truck:</div><div class="value">' + (q.truck||'None') + '</div></div>';
    html += '<div class="row"><div class="label">Trailer:</div><div class="value">' + (q.trailer||'None') + '</div></div>';
    var custTime = cust && cust.timeWindow ? cust.timeWindow : (q.timeWindow || '');
    var custEquip = cust && cust.equipment ? cust.equipment : (q.equipment || 'None');
    var custPlac = cust && cust.placards ? cust.placards : '';
    html += '<div class="row"><div class="label">Time Window:</div><div class="value">' + (custTime||'\u2014') + '</div></div>';
    html += '<div class="row"><div class="label">Equipment:</div><div class="value">' + (custEquip||'None') + '</div></div>';
    html += '<div class="row"><div class="label">Status:</div><div class="value">' + (q.status||'') + '</div></div>';
    if(custPlac && custPlac !== 'None') {
      html += '<div class="placards-section"><h3>&#9888; Required Placards</h3>';
      var pList = custPlac.split(', ');
      pList.forEach(function(p) { html += '<span class="placard-tag">' + p + '</span>'; });
      html += '</div>';
    }
    if(q.notes) {
      html += '<div class="notes-section"><h3>Notes / Special Instructions</h3><p>' + q.notes + '</p></div>';
    }
    if(cust && cust.jobNotes) {
      html += '<div style="margin-top:8px;border:2px solid #7c3aed;border-radius:6px;padding:8px 10px;background:#f5f3ff">';
      html += '<div style="font-size:11px;font-weight:700;color:#6d28d9;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Customer-Specific Notes</div>';
      html += '<p style="font-size:12px;line-height:1.4;white-space:pre-wrap;margin:0">' + cust.jobNotes + '</p>';
      html += '</div>';
    }
    html += '<div class="signature"><div class="sig-line">Driver Signature</div><div class="sig-line">Date</div></div>';
    html += '<div class="footer"><span>Independence Environmental Services</span><span>Printed: ' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString() + '</span></div>';
    html += '</div>';
  });

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
app.delete('/api/customers', function(req, res) {
  data.customers = [];
  saveData(data); broadcast({type:'full-sync',data:data}); res.json({ok:true});
});
app.post('/api/customers/import', function(req, res) {
  var rows = req.body.customers;
  var updateExisting = req.body.updateExisting || false;
  if (!rows || !Array.isArray(rows)) return res.status(400).json({error:'customers array required'});
  var added = 0;
  var updated = 0;
  rows.forEach(function(r) {
    if (!r.name || !r.name.trim()) return;
    var trimmedName = r.name.trim().toLowerCase();
    var existing = updateExisting ? data.customers.find(function(c) {
      return (c.name||'').trim().toLowerCase() === trimmedName;
    }) : null;
    if (existing) {
      // Update existing customer fields (only overwrite non-empty values)
      if ((r.address||'').trim()) existing.address = r.address.trim();
      if ((r.city||'').trim()) existing.city = r.city.trim();
      if ((r.state||'').trim()) existing.state = r.state.trim();
      if ((r.zip||'').trim()) existing.zip = r.zip.trim();
      if ((r.phone||'').trim()) existing.phone = r.phone.trim();
      if ((r.email||'').trim()) existing.email = r.email.trim();
      if ((r.contact||'').trim()) existing.contact = r.contact.trim();
      if ((r.pricing||'').trim()) existing.pricing = r.pricing.trim();
      if ((r.notes||'').trim()) existing.notes = r.notes.trim();
      updated++;
    } else {
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
      added++;
    }
  });
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json({ok:true, imported:added, updated:updated});
});

// PICKUPS
app.get('/api/pickups', function(req, res) { res.json(data.pickups || []); });

app.post('/api/pickups', function(req, res) {
  var p = Object.assign({}, req.body, {
    id: 'pk' + Date.now() + Math.random().toString(36).slice(2),
    status: 'new',
    assignedDriverId: '',
    assignedDriverName: '',
    assignedDate: '',
    routeBoardJobId: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  data.pickups.push(p);
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json(p);
});

app.put('/api/pickups/:id', function(req, res) {
  var idx = data.pickups.findIndex(function(p) { return p.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(data.pickups[idx], req.body, { updatedAt: new Date().toISOString() });
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json(data.pickups[idx]);
});

// Assign driver + auto-create job on Weekly Schedule
app.put('/api/pickups/:id/assign', function(req, res) {
  var idx = data.pickups.findIndex(function(p) { return p.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  var pickup = data.pickups[idx];
  var b = req.body || {};
  pickup.assignedDriverId = b.driverId || '';
  pickup.assignedDriverName = b.driverName || '';
  pickup.assignedDate = b.date || pickup.requestedDate || '';
  pickup.status = 'assigned';
  pickup.updatedAt = new Date().toISOString();

  // Auto-create a job on the Weekly Schedule
  if (pickup.assignedDriverId && pickup.assignedDate) {
    // Use new-format fields if available, fall back to old format
    var custIds = pickup.customerIds || [];
    if (custIds.length === 0 && pickup.customerId) {
      custIds = [{ id: pickup.customerId, jobNotes: (pickup.wasteDescription || '') + (pickup.containerInfo || '') + (pickup.notes ? '\n' + pickup.notes : ''), timeWindow: pickup.requestedTimeWindow || '', equipment: '', placards: '' }];
    }
    var jobStatus = 'Scheduled';
    if (pickup.status === 'Scheduled' || pickup.status === 'Tentative' || pickup.status === 'Confirmed') {
      jobStatus = pickup.status;
    }
    if (pickup.jobStatus) jobStatus = pickup.jobStatus;
    var job = {
      id: 'j' + Date.now() + Math.random().toString(36).slice(2),
      driverId: pickup.assignedDriverId,
      date: pickup.assignedDate,
      location: pickup.location || pickup.customerName || 'Pickup',
      customerIds: custIds,
      truckId: pickup.truckId || '',
      trailerId: pickup.trailerId || '',
      timeWindow: pickup.timeWindow || pickup.requestedTimeWindow || '',
      equipment: pickup.equipment || [],
      notes: pickup.notes || ((pickup.wasteDescription || '') + (pickup.containerInfo ? ' | ' + pickup.containerInfo : '')),
      status: jobStatus,
      _pickupId: pickup.id
    };
    data.jobs.push(job);
    pickup.routeBoardJobId = job.id;
  }

  saveData(data); broadcast({type:'full-sync',data:data});
  res.json({ ok: true, pickup: pickup });
});

// Archive a pickup
app.put('/api/pickups/:id/archive', function(req, res) {
  var idx = data.pickups.findIndex(function(p) { return p.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  data.pickups[idx].status = 'archived';
  data.pickups[idx].archivedAt = new Date().toISOString();
  data.pickups[idx].updatedAt = new Date().toISOString();
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json({ok:true});
});

// Unarchive
app.put('/api/pickups/:id/unarchive', function(req, res) {
  var idx = data.pickups.findIndex(function(p) { return p.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  data.pickups[idx].status = data.pickups[idx].assignedDriverId ? 'assigned' : 'new';
  delete data.pickups[idx].archivedAt;
  data.pickups[idx].updatedAt = new Date().toISOString();
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json({ok:true});
});

app.delete('/api/pickups/:id', function(req, res) {
  data.pickups = (data.pickups || []).filter(function(p) { return p.id !== req.params.id; });
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json({ok:true});
});

// ROLL-OFF BINS - movement / rental tracking
app.get('/api/bins', function(req, res) { res.json(data.bins || []); });

app.post('/api/bins', function(req, res) {
  var bin = Object.assign({}, req.body, {
    id: 'bin' + Date.now() + Math.random().toString(36).slice(2),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  data.bins.push(bin);
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json(bin);
});

app.put('/api/bins/:id', function(req, res) {
  var idx = data.bins.findIndex(function(b) { return b.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(data.bins[idx], req.body, { updatedAt: new Date().toISOString() });
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json(data.bins[idx]);
});

app.delete('/api/bins/:id', function(req, res) {
  data.bins = (data.bins || []).filter(function(b) { return b.id !== req.params.id; });
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json({ok:true});
});

// UNACCOUNTED BINS - vendor-billed bins not in tracking (reconciliation watchlist)
app.get('/api/unbilled', function(req, res) { res.json(data.unbilled || []); });

app.post('/api/unbilled', function(req, res) {
  var u = Object.assign({}, req.body, {
    id: 'ub' + Date.now() + Math.random().toString(36).slice(2),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  data.unbilled.push(u);
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json(u);
});

app.put('/api/unbilled/:id', function(req, res) {
  var idx = data.unbilled.findIndex(function(u) { return u.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(data.unbilled[idx], req.body, { updatedAt: new Date().toISOString() });
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json(data.unbilled[idx]);
});

app.delete('/api/unbilled/:id', function(req, res) {
  data.unbilled = (data.unbilled || []).filter(function(u) { return u.id !== req.params.id; });
  saveData(data); broadcast({type:'full-sync',data:data});
  res.json({ok:true});
});

// VENDORS (bin suppliers) - managed list
app.post('/api/vendors', function(req, res) {
  if (req.body.name && (data.vendors || []).indexOf(req.body.name) === -1) {
    data.vendors.push(req.body.name); data.vendors.sort();
    saveData(data); broadcast({type:'full-sync',data:data});
  }
  res.json({ok:true});
});
app.delete('/api/vendors/:name', function(req, res) {
  data.vendors = (data.vendors || []).filter(function(v) { return v !== req.params.name; });
  saveData(data); broadcast({type:'full-sync',data:data}); res.json({ok:true});
});

// PRINTABLE MONTHLY BIN BILLING REPORT (POST so it works in Safari)
app.post('/print-bin-report', function(req, res) {
  var payload;
  try { payload = JSON.parse(req.body.reportData); } catch(e) { return res.status(400).send('Invalid data'); }
  var monthLabel = payload.monthLabel || '';
  var groups = payload.groups || [];   // [{customer, rows:[{...}], subtotal}]
  var grandTotal = payload.grandTotal || 0;
  var fmtMoney = function(n) { return '$' + (Number(n)||0).toFixed(2); };
  var esc = function(s) { return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

  var html = '<!DOCTYPE html><html><head><title>Bin Billing - ' + esc(monthLabel) + '</title>';
  html += '<style>';
  html += '*{margin:0;padding:0;box-sizing:border-box}';
  html += 'body{font-family:Arial,Helvetica,sans-serif;padding:24px 30px;color:#000;max-width:900px;margin:0 auto;font-size:12px}';
  html += '.header{text-align:center;margin-bottom:18px;padding-bottom:10px;border-bottom:3px solid #000}';
  html += '.header h1{font-size:22px;font-weight:900;margin-bottom:2px}';
  html += '.header .company{font-size:12px;color:#444;font-weight:600;letter-spacing:0.5px}';
  html += '.header .period{font-size:14px;font-weight:700;margin-top:6px}';
  html += '.cust-group{margin-bottom:22px;page-break-inside:avoid}';
  html += '.cust-name{font-size:15px;font-weight:800;background:#eff6ff;border-left:4px solid #2563eb;padding:6px 10px;margin-bottom:6px}';
  html += 'table{width:100%;border-collapse:collapse;margin-bottom:4px}';
  html += 'th{background:#f1f5f9;text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#444;border-bottom:2px solid #cbd5e1}';
  html += 'td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}';
  html += 'td.num,th.num{text-align:right}';
  html += '.subtotal{text-align:right;font-weight:700;padding:6px 8px;font-size:12px;background:#f8fafc}';
  html += '.grand{margin-top:14px;padding:12px 14px;border:3px solid #000;background:#f0fdf4;display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:900}';
  html += '.footer{margin-top:24px;padding-top:8px;border-top:2px solid #000;font-size:9px;color:#888;display:flex;justify-content:space-between}';
  html += '.back-link{display:inline-block;margin-bottom:12px;color:#2563eb;text-decoration:none;font-size:13px}';
  html += '.empty{padding:30px;text-align:center;color:#888;font-size:14px}';
  html += '@media print{.back-link{display:none}body{padding:14px 18px}.cust-name{background:#eff6ff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.grand{background:#f0fdf4 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}th{background:#f1f5f9 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  html += '</style></head><body>';
  html += '<a href="javascript:history.back()" class="back-link">&larr; Back to RouteBoard</a>';
  html += '<div class="header"><h1>Roll-Off Bin Billing</h1><div class="company">Independence Environmental Services</div><div class="period">' + esc(monthLabel) + '</div></div>';

  if (groups.length === 0) {
    html += '<div class="empty">No billable bin activity for this period.</div>';
  } else {
    groups.forEach(function(g) {
      html += '<div class="cust-group">';
      html += '<div class="cust-name">' + esc(g.customer) + '</div>';
      html += '<table><thead><tr>';
      html += '<th>Bin #</th><th>Size</th><th>Vendor</th><th>Dropped</th><th>Picked Up</th><th class="num">Days</th><th class="num">Day Rate</th><th class="num">Haul Fee</th><th class="num">Line Total</th>';
      html += '</tr></thead><tbody>';
      (g.rows || []).forEach(function(r) {
        html += '<tr>';
        html += '<td>' + esc(r.binNumber) + '</td>';
        html += '<td>' + esc(r.binSize) + '</td>';
        html += '<td>' + esc(r.vendor) + '</td>';
        html += '<td>' + esc(r.dateDropped) + '</td>';
        html += '<td>' + esc(r.datePickedUp || 'On site') + '</td>';
        html += '<td class="num">' + esc(r.days) + '</td>';
        html += '<td class="num">' + fmtMoney(r.dailyRate) + '</td>';
        html += '<td class="num">' + fmtMoney(r.haulFee) + '</td>';
        html += '<td class="num">' + fmtMoney(r.lineTotal) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      html += '<div class="subtotal">' + esc(g.customer) + ' subtotal: ' + fmtMoney(g.subtotal) + '</div>';
      html += '</div>';
    });
    html += '<div class="grand"><span>TOTAL DUE &mdash; ' + esc(monthLabel) + '</span><span>' + fmtMoney(grandTotal) + '</span></div>';
  }

  html += '<div class="footer"><span>Independence Environmental Services</span><span>Generated: ' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString() + '</span></div>';
  html += '</body></html>';
  res.send(html);
});

// WASTE PROFILES
var PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

function loadProfiles() {
  try {
    if (fs.existsSync(PROFILES_FILE)) return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  } catch(e) { console.error('Error loading profiles:', e.message); }
  return [];
}
function saveProfiles(p) { fs.writeFileSync(PROFILES_FILE, JSON.stringify(p, null, 2)); }
var profiles = loadProfiles();

// PROFILE FIELD SUGGESTIONS — remember previously entered values
var SUGGESTIONS_FILE = path.join(DATA_DIR, 'suggestions.json');
var SUGGEST_FIELDS = [
  'processGenerating', 'commonName', 'properShippingName', 'physicalDescription',
  'color', 'odor', 'specialHandling', 'stateCodes', 'samplingSource', 'samplerName',
  'sourceCode', 'formCode', 'containerType', 'containerOther', 'frequencyOther',
  'methodOfShipment', 'physicalState', 'sdsProductName'
];

function loadSuggestions() {
  try {
    if (fs.existsSync(SUGGESTIONS_FILE)) return JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
  } catch(e) { console.error('Error loading suggestions:', e.message); }
  return {};
}
function saveSuggestions(s) { fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(s, null, 2)); }
var suggestions = loadSuggestions();

function extractSuggestions(profile) {
  var changed = false;
  SUGGEST_FIELDS.forEach(function(field) {
    var val = (profile[field] || '').trim();
    if (!val || val.length < 2) return;
    if (!suggestions[field]) suggestions[field] = [];
    // Case-insensitive dedup
    var exists = suggestions[field].some(function(s) { return s.toLowerCase() === val.toLowerCase(); });
    if (!exists) {
      suggestions[field].push(val);
      // Keep list manageable — max 50 per field
      if (suggestions[field].length > 50) suggestions[field] = suggestions[field].slice(-50);
      changed = true;
    }
  });
  if (changed) saveSuggestions(suggestions);
}

app.get('/api/suggestions', function(req, res) { res.json(suggestions); });

// WASTE STREAM PROFILES — reusable Section 3 templates
var WASTE_STREAMS_FILE = path.join(DATA_DIR, 'wasteStreams.json');
function loadWasteStreams() {
  try {
    if (fs.existsSync(WASTE_STREAMS_FILE)) return JSON.parse(fs.readFileSync(WASTE_STREAMS_FILE, 'utf8'));
  } catch(e) { console.error('Error loading waste streams:', e.message); }
  return [];
}
function saveWasteStreams(ws) { fs.writeFileSync(WASTE_STREAMS_FILE, JSON.stringify(ws, null, 2)); }
var wasteStreams = loadWasteStreams();

app.get('/api/waste-streams', function(req, res) { res.json(wasteStreams); });
app.post('/api/waste-streams', function(req, res) {
  var ws = Object.assign({}, req.body, { id: 'ws' + Date.now(), createdAt: new Date().toISOString() });
  wasteStreams.push(ws);
  saveWasteStreams(wasteStreams);
  res.json(ws);
});
app.put('/api/waste-streams/:id', function(req, res) {
  var idx = wasteStreams.findIndex(function(w) { return w.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(wasteStreams[idx], req.body);
  saveWasteStreams(wasteStreams);
  res.json(wasteStreams[idx]);
});
app.delete('/api/waste-streams/:id', function(req, res) {
  wasteStreams = wasteStreams.filter(function(w) { return w.id !== req.params.id; });
  saveWasteStreams(wasteStreams);
  res.json({ok:true});
});

app.get('/api/profiles', function(req, res) { res.json(profiles); });

// Sync generator info from a profile back to the customer record
function syncProfileToCustomer(profile) {
  var custName = (profile.customer || '').trim();
  if (!custName) return;
  var cust = (data.customers || []).find(function(c) {
    return c.name && c.name.trim().toLowerCase() === custName.toLowerCase();
  });
  if (!cust) return;
  var changed = false;
  // Map of profile fields -> customer fields
  var fieldMap = [
    ['epaId', 'epaId'],
    ['generatorSiteAddress', 'address'],
    ['generatorCity', 'city'],
    ['generatorState', 'state'],
    ['generatorZip', 'zip'],
    ['generatorPhone', 'phone'],
    ['technicalContact', 'contact']
  ];
  fieldMap.forEach(function(pair) {
    var profileVal = (profile[pair[0]] || '').trim();
    if (!profileVal) return;
    var custVal = (cust[pair[1]] || '').trim();
    // Update customer if profile has a value that's different
    if (profileVal !== custVal) {
      cust[pair[1]] = profileVal;
      changed = true;
    }
  });
  if (changed) {
    saveData(data);
    broadcast({type:'full-sync',data:data});
  }
}

app.post('/api/profiles', function(req, res) {
  var profile = Object.assign({}, req.body, { id: 'prof' + Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  profiles.push(profile);
  saveProfiles(profiles);
  extractSuggestions(profile);
  syncProfileToCustomer(profile);
  res.json(profile);
});

app.put('/api/profiles/:id', function(req, res) {
  var idx = profiles.findIndex(function(p) { return p.id === req.params.id; });
  if (idx === -1) return res.status(404).json({error:'Not found'});
  Object.assign(profiles[idx], req.body, { updatedAt: new Date().toISOString() });
  saveProfiles(profiles);
  extractSuggestions(profiles[idx]);
  syncProfileToCustomer(profiles[idx]);
  res.json(profiles[idx]);
});

app.delete('/api/profiles/:id', function(req, res) {
  profiles = profiles.filter(function(p) { return p.id !== req.params.id; });
  saveProfiles(profiles);
  res.json({ok:true});
});

// ======== EWS PDF GENERATION ========
app.get('/api/profiles/:id/ews-pdf', function(req, res) {
  var profile = profiles.find(function(p) { return p.id === req.params.id; });
  if (!profile) return res.status(404).json({error:'Not found'});

  var doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 42, right: 42 } });
  var buffers = [];
  doc.on('data', function(chunk) { buffers.push(chunk); });
  doc.on('end', function() {
    var pdfData = Buffer.concat(buffers);
    var safeName = (profile.name || 'EWS-Profile').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '.pdf"');
    res.send(pdfData);
  });

  var W = 528; // usable width (612 - 42*2)
  var LM = 42; // left margin
  var y = 40;

  // Helper: draw text in a box row
  function formRow(label, value, opts) {
    opts = opts || {};
    var rowH = opts.height || 18;
    doc.rect(LM, y, W, rowH).stroke('#999');
    doc.font('Helvetica-BoldOblique').fontSize(9).text(label, LM + 4, y + 4, { width: W - 8, continued: false });
    if (value) {
      var labelW = doc.widthOfString(label) + 8;
      doc.font('Helvetica').fontSize(9).text(value, LM + labelW + 4, y + 4, { width: W - labelW - 12 });
    }
    y += rowH;
  }

  // ===== HEADER =====
  var isNew = profile.profileIsNew !== 'Recertification';
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#cc0000')
    .text(isNew ? '[X] New Profile    [ ] Recertification' : '[ ] New Profile    [X] Recertification', LM, y, { width: W, align: 'left' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#059669')
    .text('EWS', LM, y, { width: W, align: 'right' });
  y += 18;
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(14)
    .text('GENERATOR WASTE PROFILE SHEET', LM, y, { width: W, align: 'center' });
  y += 20;
  doc.font('Helvetica-BoldOblique').fontSize(8).fillColor('#cc0000')
    .text('Please carefully read instructions before completing this form. All sections MUST be completed.', LM, y, { width: W, align: 'center' });
  y += 14;
  doc.fillColor('#000');

  // ===== SECTION 1: BILLING =====
  doc.font('Helvetica-Bold').fontSize(11).text('1.    Billing Information', LM, y); y += 16;
  formRow('1. Billing Party Name: Independence Environmental Services', '');
  formRow('2. Mailing Address: PO Box 12623 Fresno, CA 93778', '');
  formRow('3. Contact: Keith Higgins', '');
  formRow('4. Phone: (559) 243-6169', '');
  y += 6;

  // ===== SECTION 2: GENERATOR =====
  doc.font('Helvetica-Bold').fontSize(11).text('2.    Generator Information', LM, y); y += 16;
  formRow('1. Generator Name:', profile.customer || '');
  formRow('2. Generator Site Address:', profile.generatorSiteAddress || '');

  // City / State / Zip row
  doc.rect(LM, y, W, 18).stroke('#999');
  var thirdW = Math.floor(W / 3);
  doc.rect(LM + thirdW, y, 1, 18).stroke('#ccc');
  doc.rect(LM + thirdW * 2, y, 1, 18).stroke('#ccc');
  doc.font('Helvetica-BoldOblique').fontSize(9).text('3. City:', LM + 4, y + 4);
  doc.font('Helvetica').text(profile.generatorCity || '', LM + 46, y + 4, { width: thirdW - 50 });
  doc.font('Helvetica-BoldOblique').text('State:', LM + thirdW + 4, y + 4);
  doc.font('Helvetica').text(profile.generatorState || '', LM + thirdW + 38, y + 4, { width: thirdW - 42 });
  doc.font('Helvetica-BoldOblique').text('Zip:', LM + thirdW * 2 + 4, y + 4);
  doc.font('Helvetica').text(profile.generatorZip || '', LM + thirdW * 2 + 26, y + 4, { width: thirdW - 30 });
  y += 18;

  formRow('4. Generator US EPA Identification Number:', profile.epaId || '');
  formRow('5. Generator Mailing Address (if Different):', profile.generatorMailingAddress || '');

  // Mailing City / Country / State / Zip row
  doc.rect(LM, y, W, 18).stroke('#999');
  var qW = Math.floor(W / 4);
  doc.rect(LM + qW, y, 1, 18).stroke('#ccc');
  doc.rect(LM + qW * 2, y, 1, 18).stroke('#ccc');
  doc.rect(LM + qW * 3, y, 1, 18).stroke('#ccc');
  doc.font('Helvetica-BoldOblique').fontSize(9).text('6. City:', LM + 4, y + 4);
  doc.font('Helvetica').text(profile.generatorMailingCity || '', LM + 42, y + 4, { width: qW - 46 });
  doc.font('Helvetica-BoldOblique').text('Country:', LM + qW + 4, y + 4);
  doc.font('Helvetica').text(profile.generatorMailingCountry || '', LM + qW + 50, y + 4, { width: qW - 54 });
  doc.font('Helvetica-BoldOblique').text('State:', LM + qW * 2 + 4, y + 4);
  doc.font('Helvetica').text(profile.generatorMailingState || '', LM + qW * 2 + 38, y + 4, { width: qW - 42 });
  doc.font('Helvetica-BoldOblique').text('Zip:', LM + qW * 3 + 4, y + 4);
  doc.font('Helvetica').text(profile.generatorMailingZip || '', LM + qW * 3 + 26, y + 4, { width: qW - 30 });
  y += 18;

  formRow('7. Generator Contact Name:', profile.technicalContact || 'Keith Higgins');
  formRow('8. Phone Number:', profile.generatorPhone || '(559) 243-6169');
  y += 6;

  // ===== SECTION 3: WASTE PROPERTIES =====
  doc.font('Helvetica-Bold').fontSize(11).text('3.    Waste Properties and Composition', LM, y); y += 16;
  formRow('9. Process Generating Waste:', profile.processGenerating || '', { height: 28 });
  formRow('10. Is the waste US EPA HAZARDOUS WASTE (40 CFR Part 261)?', 'No');
  formRow('11. State Codes:', profile.stateCodes || '');
  formRow('12. Common Waste Name:', profile.commonName || '');
  formRow('13. US DOT Proper Shipping Name:', profile.properShippingName || '');

  // 14. Physical State
  var ps = profile.physicalState || '';
  var psText = '14. Physical State     ';
  ['Solid', 'Semi-Solid', 'Powder', 'Liquid', 'Other'].forEach(function(s) {
    psText += (ps === s ? '[X] ' : '[ ] ') + s + '  ';
  });
  doc.rect(LM, y, W, 18).stroke('#999');
  doc.font('Helvetica-BoldOblique').fontSize(9).text(psText, LM + 4, y + 4, { width: W - 8 });
  y += 18;

  // 15. Method of Shipment
  var ms = profile.methodOfShipment || '';
  doc.rect(LM, y, W, 28).stroke('#999');
  doc.font('Helvetica-BoldOblique').fontSize(9)
    .text('15. Method of Shipment', LM + 4, y + 3);
  doc.font('Helvetica').text('Size: ' + (profile.shipmentSize || '___') + '   Quantity: ' + (profile.shipmentQuantity || '___'), LM + 180, y + 3);
  var msLine = '';
  ['DF', 'DM', 'TP', 'CF', 'CW', 'BA', 'TT', 'Commodity Pack'].forEach(function(s) {
    msLine += (ms === s ? '[X] ' : '[ ] ') + s + '  ';
  });
  doc.font('Helvetica').fontSize(8).text(msLine, LM + 4, y + 16, { width: W - 8 });
  y += 28;

  // 16. Frequency
  var freq = profile.frequency || '';
  var freqText = '16. Frequency of Shipment     ';
  ['One Time', 'Daily', 'Weekly', 'Monthly', 'Other'].forEach(function(s) {
    freqText += (freq === s ? '[X] ' : '[ ] ') + s + '  ';
  });
  doc.rect(LM, y, W, 18).stroke('#999');
  doc.font('Helvetica-BoldOblique').fontSize(9).text(freqText, LM + 4, y + 4, { width: W - 8 });
  y += 18;

  formRow('17. Special Handling Instructions:', profile.specialHandling || 'WEAR CORRECT PPE');

  // 18. Waste Composition
  var chems = profile.chemicals || [];
  var compH = Math.max(30, 14 + chems.length * 12);
  doc.rect(LM, y, W, compH).stroke('#999');
  doc.font('Helvetica-BoldOblique').fontSize(9).text('18. Waste Composition: List all components with %', LM + 4, y + 3);
  var cy = y + 14;
  chems.forEach(function(c) {
    doc.font('Helvetica').fontSize(8)
      .text((c.name || '') + (c.cas ? ' (' + c.cas + ')' : '') + (c.percentage ? ' - ' + c.percentage + '%' : ''), LM + 20, cy, { width: W - 28 });
    cy += 12;
  });
  y += compH;
  y += 6;

  // ===== SECTION 4: SAMPLING =====
  doc.font('Helvetica-Bold').fontSize(11).text('4.    Sampling Information', LM, y); y += 16;

  // Sample Type row
  var st = profile.sampleType || '';
  var stText = 'Sample Type:   ';
  ['Grab Sample', 'Composite Sample', 'Process/Generator Knowledge', 'SDS', 'Field Test'].forEach(function(s) {
    stText += (st === s ? '[X] ' : '[ ] ') + s + '  ';
  });
  doc.rect(LM, y, W, 18).stroke('#999');
  doc.font('Helvetica-BoldOblique').fontSize(8).text(stText, LM + 4, y + 5, { width: W - 8 });
  y += 18;

  // 19. Sampling Source / 19(a) Date
  doc.rect(LM, y, W, 18).stroke('#999');
  var halfW = Math.floor(W / 2);
  doc.rect(LM + halfW, y, 1, 18).stroke('#ccc');
  doc.font('Helvetica-BoldOblique').fontSize(9).text('19. Sampling Source:', LM + 4, y + 4);
  doc.font('Helvetica').text(profile.samplingSource || '', LM + 120, y + 4, { width: halfW - 124 });
  doc.font('Helvetica-BoldOblique').text('19(a) Date Sampled/Lab ID:', LM + halfW + 4, y + 4);
  doc.font('Helvetica').text(profile.dateSampled || '', LM + halfW + 155, y + 4, { width: halfW - 159 });
  y += 18;

  // 19(b) Sampler / SDS Product name
  doc.rect(LM, y, W, 18).stroke('#999');
  doc.rect(LM + halfW, y, 1, 18).stroke('#ccc');
  doc.font('Helvetica-BoldOblique').fontSize(9).text('19(b). Sampler\'s Name & Company:', LM + 4, y + 4);
  doc.font('Helvetica').text(profile.samplerName || '', LM + 195, y + 4, { width: halfW - 199 });
  doc.font('Helvetica-BoldOblique').text('SDS Product name:', LM + halfW + 4, y + 4);
  doc.font('Helvetica').text(profile.sdsProductName || '', LM + halfW + 110, y + 4, { width: halfW - 114 });
  y += 18;
  y += 6;

  // ===== SECTION 5: CHARACTERISTIC COMPONENTS =====
  doc.font('Helvetica-Bold').fontSize(11).text('5.    Characteristic Components', LM, y); y += 16;

  // 7-column characteristics row
  var colW = Math.floor(W / 7);
  doc.rect(LM, y, W, 36).stroke('#999');
  var charFields = [
    ['COLOR:', profile.color],
    ['ODOR:', profile.odor],
    ['FREE LIQUIDS %', profile.freeLiquidsPercent],
    ['% SOLIDS:', profile.percentSolids],
    ['pH:', profile.pHValue],
    ['Flash Point:', profile.flashPoint],
    ['Liquid Phases', profile.liquidPhases]
  ];
  charFields.forEach(function(cf, i) {
    var cx = LM + i * colW;
    if (i > 0) doc.rect(cx, y, 1, 36).stroke('#ccc');
    doc.font('Helvetica-Bold').fontSize(7).text(cf[0], cx + 3, y + 3, { width: colW - 6 });
    doc.font('Helvetica').fontSize(8).text(cf[1] || '', cx + 3, y + 15, { width: colW - 6 });
  });
  y += 36;

  // Yes/No questions
  var yesNoQs = [
    ['containsRegulatedHazWaste', 'Does this waste contain regulated concentrations of listed hazardous wastes defined by § 40 CFR 261.31.261.32.261.33 including RCRA F Listed Solvents'],
    ['containsPCBs', 'Does this waste contain any PCB\'s halogens or dioxins?'],
    ['regulatedToxicMaterial', 'Is this a regulated Toxic Material as defined by State or Federal Regulations'],
    ['radioactive', 'Does this waste exhibit any characteristics of Radioactivity as defined by State or Federal Regulations?'],
    ['infectiousMedical', 'Does this waste contain any Infectious or Medical Waste as defined by State or Federal Regulations?']
  ];
  yesNoQs.forEach(function(q) {
    var ans = profile[q[0]] || 'No';
    var rH = 22;
    doc.rect(LM, y, W, rH).stroke('#999');
    doc.rect(LM + W - 60, y, 1, rH).stroke('#ccc');
    doc.font('Helvetica-BoldOblique').fontSize(7).text(q[1], LM + 4, y + 3, { width: W - 68 });
    doc.font('Helvetica-Bold').fontSize(9).text(ans, LM + W - 56, y + 6, { width: 52, align: 'center' });
    y += rH;
  });
  y += 8;

  // Payment terms
  doc.font('Helvetica').fontSize(7).text(
    'Payment on this project is due net 30 days, unless agreed otherwise in writing. Certificates will be issued once payment for the above job is paid in full. Client/generator will be responsible for all the collection fees and late payment charges. Environmental Waste Solutions (EWS) reserves the right to test all or any inbound loads before acceptance.',
    LM, y, { width: W }
  );
  y += 30;

  // Generator Certification
  doc.font('Helvetica-Bold').fontSize(9).text('Generator Certification', LM, y, { underline: true });
  y += 14;
  doc.font('Helvetica').fontSize(7).text(
    'I hereby certify that all information submitted in this and all attached documents contain true and accurate descriptions of the waste. Any sample submitted is representative as defined in 40 CFR 261 - Appendix 1 or by using an equivalent method. All relevant information regarding known or suspected hazards in possession of the generator has been disclosed. I authorize EWS to obtain a sample from any waste shipment for purposes of identifying the waste or recertification.',
    LM, y, { width: W }
  );
  y += 42;

  // Signature line
  doc.moveTo(LM, y).lineTo(LM + 200, y).stroke('#000');
  doc.moveTo(LM + 220, y).lineTo(LM + 420, y).stroke('#000');
  doc.moveTo(LM + 440, y).lineTo(LM + W, y).stroke('#000');
  y += 4;
  doc.font('Helvetica-Bold').fontSize(8)
    .text('Signature', LM, y, { width: 200, align: 'center' })
    .text('Printed (or typed) name and title', LM + 220, y, { width: 200, align: 'center' })
    .text('Date', LM + 440, y, { width: W - 440, align: 'center' });

  doc.end();
});

// SDS PARSING
var pdfParse;
try { pdfParse = require('pdf-parse'); } catch(e) { console.log('pdf-parse not available, SDS parsing disabled'); }

function parseSDS(text) {
  var result = {
    chemicals: [],
    unNumber: '',
    properShippingName: '',
    hazardClass: '',
    packingGroup: '',
    flashPoint: '',
    flashPointNumF: null,
    pH: '',
    physicalState: '',
    color: '',
    odor: '',
    epaWasteCodes: [],
    caWasteCodes: [],
    hazardStatements: [],
    toxicity: [],
    reactivityFlags: [],
    incompatibles: '',
    stabilityNotes: ''
  };

  // Normalize text
  var t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract sections - prioritize "SECTION N" format, fall back to "N." at line start
  function getSection(num) {
    var startIdx = -1;
    // First try "SECTION N" (most reliable)
    var sectionMatch = t.search(new RegExp('SECTION\\s+' + num + '\\b', 'i'));
    if (sectionMatch !== -1) {
      startIdx = sectionMatch;
    } else {
      // Fallback: "N." or "N)" at start of line (for SDSs that don't use "SECTION" keyword)
      var lineMatch = t.search(new RegExp('(?:^|\\n)\\s*' + num + '\\s*[.)]\\s+[A-Z]', 'im'));
      if (lineMatch !== -1) startIdx = lineMatch;
    }
    if (startIdx === -1) return '';
    var nextSection = num + 1;
    // Find end: next section header
    var endIdx = t.length;
    var sub = t.substring(startIdx + 5);
    var nextMatch = sub.search(new RegExp('SECTION\\s+' + nextSection + '\\b', 'i'));
    if (nextMatch !== -1) {
      endIdx = startIdx + 5 + nextMatch;
    } else {
      // Try next "SECTION N" for any N
      var anyNext = sub.search(new RegExp('SECTION\\s+\\d+\\b', 'i'));
      if (anyNext !== -1) {
        endIdx = startIdx + 5 + anyNext;
      } else {
        // Fallback: "N." at line start
        var lineNext = sub.search(new RegExp('(?:^|\\n)\\s*' + nextSection + '\\s*[.)]\\s+[A-Z]', 'im'));
        if (lineNext !== -1) endIdx = startIdx + 5 + lineNext;
      }
    }
    return t.substring(startIdx, endIdx);
  }

  // Section 3: Composition
  var sec3 = getSection(3);
  if (sec3) {
    var lines = sec3.split('\n');

    // Detect if section header indicates percentages (so bare numbers = %)
    var sec3lower = sec3.toLowerCase();
    var headerHasPct = sec3lower.indexOf('% w') >= 0 || sec3lower.indexOf('%[weight') >= 0
      || sec3lower.indexOf('concentration') >= 0 || sec3lower.indexOf('% weight') >= 0
      || sec3lower.indexOf('percent') >= 0 || sec3lower.indexOf('w/w') >= 0;

    // Helper: find percentage/concentration in text
    function findPct(s) {
      // Range with inequality signs: ">= 60 - <= 80" or ">= 60 - < = 80"
      var ineqRange = s.match(/[><=≥≤]+\s*(\d+\.?\d*)\s*[-–—]\s*[><=≥≤]*\s*=?\s*(\d+\.?\d*)/);
      if (ineqRange) return ineqRange[0].trim() + '%';
      // Range with %: "10 - 20 %" or "10-20%" or "10 – 20 %"
      var range = s.match(/(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)\s*(%|wt\s*%|wt\.?\s*%|vol\s*%|w\/w|percent)/i);
      if (range) return range[0].trim();
      // Range without % (if header says it's percentages): "10 - 20"
      if (headerHasPct) {
        var bareRange = s.match(/(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)/);
        if (bareRange && parseFloat(bareRange[1]) <= 100 && parseFloat(bareRange[2]) <= 100) return bareRange[0].trim() + '%';
      }
      // Single with % sign: "<5%" or ">30%" or "100%"
      var single = s.match(/[<>≤≥~≈]?\s*(\d+\.?\d*)\s*(%|wt\s*%|wt\.?\s*%|vol\s*%|w\/w|percent)/i);
      if (single) return single[0].trim();
      // Bare number if header indicates percentages
      if (headerHasPct) {
        var bareNum = s.match(/(?:^|[\s*])(\d{1,3}\.?\d*)(?=[^0-9\-]|$)/);
        if (bareNum && parseFloat(bareNum[1]) <= 100 && parseFloat(bareNum[1]) > 0) return bareNum[1] + '%';
      }
      return '';
    }

    // Helper: clean up chemical name
    function cleanChemName(raw) {
      return raw
        .replace(/[-–—|,;:\s]+$/, '')
        .replace(/^[-–—|,;:\s]+/, '')
        .replace(/^\d+\.?\s+/, '')  // Remove leading list numbers like "1. "
        .replace(/\bCAS\s*(No\.?|Number|#)?\s*:?\s*$/i, '')
        .replace(/\bTSC\s*$/i, '')  // Remove trade secret markers
        .replace(/\*+/g, '')        // Remove asterisks
        .trim();
    }

    // Helper: check if a line is a header/metadata line (skip these)
    function isHeaderLine(l) {
      return /^(chemical\s+name|cas\s+no|component|ingredient|substance|concentration|content|hazardous|formula|\*\s*indicates|tsc[\s-]|legend)/i.test(l.trim());
    }

    // Parse each line that contains a CAS number
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li].trim();
      if (!line || isHeaderLine(line)) continue;

      // Find CAS number — allow trailing asterisk or other markers
      var lineCas = line.match(/(\d{2,7}-\d{2}-\d)\s*\*?/);
      if (!lineCas) continue;

      var cas = lineCas[1];
      var casIdx = line.indexOf(lineCas[0]);
      var casEnd = casIdx + lineCas[0].length;
      var pct = '';
      var chemName = '';

      // Everything after the CAS+marker
      var afterCas = line.substring(casEnd);
      // Everything before the CAS
      var beforeCas = line.substring(0, casIdx).trim();

      // --- Find percentage ---
      // pdf-parse often concatenates columns: "64-19-7100acetic acid glacial"
      // Check if afterCas starts with digits (number jammed right after CAS)
      var jammedNum = afterCas.match(/^(\d{1,3}\.?\d*)([a-zA-Z\s]|$)/);
      if (jammedNum && parseFloat(jammedNum[1]) > 0 && parseFloat(jammedNum[1]) <= 100) {
        pct = jammedNum[1] + '%';
        afterCas = afterCas.substring(jammedNum[1].length);
      }

      // If not jammed, look for concentration in afterCas text
      if (!pct) pct = findPct(afterCas);

      // Try full line if still nothing
      if (!pct) pct = findPct(line);

      // Try next 1-2 lines (table layouts split across lines)
      if (!pct) {
        for (var ahead = 1; ahead <= 2 && (li + ahead) < lines.length; ahead++) {
          var nextLine = (lines[li + ahead] || '').trim();
          if (!nextLine || nextLine.match(/\d{2,7}-\d{2}-\d/) || /^SECTION\s/i.test(nextLine)) break;
          pct = findPct(nextLine);
          if (pct) break;
        }
      }

      // --- Find chemical name ---
      // Clean beforeCas
      beforeCas = cleanChemName(beforeCas);

      // Also check afterCas for name text (CAS-first layouts like "64-19-7 100 acetic acid glacial")
      var afterName = '';
      if (afterCas) {
        // Remove the percentage text and any remaining numbers/symbols to get name
        var nameCandidate = afterCas;
        if (pct) {
          nameCandidate = nameCandidate.replace(pct.replace('%',''), '');
        }
        // Remove leading/trailing junk
        nameCandidate = nameCandidate.replace(/^[\s\d.%*<>=≤≥\-–—]+/, '').replace(/[-–—|,;:\s*]+$/, '').trim();
        // Remove common suffixes
        nameCandidate = nameCandidate.replace(/\s*TSC\s*$/i, '').replace(/\s*\*+\s*$/,'').trim();
        if (nameCandidate.length > 2 && /[a-zA-Z]{2,}/.test(nameCandidate)) {
          afterName = nameCandidate;
        }
      }

      // Prefer beforeCas name if it's substantial, otherwise use afterCas name
      if (beforeCas && beforeCas.length > 2 && /[a-zA-Z]{2,}/.test(beforeCas)) {
        chemName = beforeCas;
      } else if (afterName) {
        chemName = afterName;
      } else if (beforeCas && beforeCas.length > 1) {
        chemName = beforeCas;
      }

      // If still no name, check previous lines
      if (!chemName || chemName.length <= 1) {
        for (var back = li - 1; back >= Math.max(0, li - 3); back--) {
          var prevLine = (lines[back] || '').trim();
          if (!prevLine || prevLine.match(/\d{2,7}-\d{2}-\d/) || /^SECTION\s/i.test(prevLine) || isHeaderLine(prevLine)) continue;
          if (/^\d+\.?\d*\s*[-–]?\s*\d*\.?\d*\s*%?$/.test(prevLine)) continue;
          var candidate = cleanChemName(prevLine);
          if (candidate.length > 2 && /[a-zA-Z]{2,}/.test(candidate)) { chemName = candidate; break; }
        }
      }

      // Remove percentage from name if it leaked in
      if (pct && chemName.indexOf(pct.replace('%','')) >= 0) {
        chemName = cleanChemName(chemName.replace(pct.replace('%',''), ''));
      }

      if (chemName && chemName.length > 1 && chemName.length < 120) {
        var dupCheck = result.chemicals.some(function(c) { return c.cas === cas; });
        if (!dupCheck) {
          result.chemicals.push({ name: chemName, cas: cas, percentage: pct });
        }
      }
    }

    // Fallback: percentage-based parsing if no CAS results
    if (result.chemicals.length === 0) {
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li].trim();
        if (!line || line.length < 3 || isHeaderLine(line)) continue;
        var pct = findPct(line);
        if (pct) {
          var name = line.replace(pct, '').replace(/[-–|,;\s]+$/, '').replace(/^[-–|,;\s]+/, '').trim();
          var casInLine = name.match(/\d{2,7}-\d{2}-\d/);
          var cas = casInLine ? casInLine[0] : '';
          if (cas) name = name.replace(cas, '').replace(/\*/, '').replace(/[-–|,;\s]+$/, '').replace(/^[-–|,;\s]+/, '').trim();
          name = cleanChemName(name);
          if (name.length > 1 && name.length < 120 && /[a-zA-Z]{2,}/.test(name)) {
            result.chemicals.push({ name: name, cas: cas, percentage: pct });
          }
        }
      }
    }
  }

  // Section 14: Transport
  var sec14 = getSection(14);
  if (sec14) {
    var unMatch = sec14.match(/UN\s*(\d{4})/i);
    if (unMatch) result.unNumber = 'UN' + unMatch[1];

    var shipMatch = sec14.match(/(?:proper\s+shipping\s+name|shipping\s+name)[:\s]*([^\n]+)/i);
    if (shipMatch) result.properShippingName = shipMatch[1].trim().replace(/^[:\s]+/, '');

    var hcMatch = sec14.match(/(?:hazard\s+class|class)[:\s]*(\d+\.?\d*)/i);
    if (hcMatch) result.hazardClass = hcMatch[1];

    var pgMatch = sec14.match(/(?:packing\s+group|pkg\.?\s*group|PG)[:\s]*(I{1,3}|[123])/i);
    if (pgMatch) {
      var pg = pgMatch[1];
      if (pg === '1') pg = 'I';
      else if (pg === '2') pg = 'II';
      else if (pg === '3') pg = 'III';
      result.packingGroup = pg;
    }
  }

  // Section 9: Physical properties
  var sec9 = getSection(9);
  if (sec9) {
    // Flash point extraction — handle various formats:
    // "Flash point : 40 °C" or "Flash point (°C)39.4" or "Flash point: 103 °F"
    // pdf-parse may concatenate: "Flash point (°C)39.4TasteNot Available"
    var fpMatch = sec9.match(/flash\s*point\s*(?:\([^)]*\))?\s*[:\s]*([^\n]{2,60})/i);
    if (!fpMatch) {
      fpMatch = sec9.match(/flash\s*point[^:]*:\s*([^\n]{2,60})/i);
    }
    if (fpMatch) {
      var fpFullMatch = fpMatch[0];
      var fpRaw = fpMatch[1].trim();
      // Check just the first 20 chars for "no data" / "not applicable" (avoid false positives
      // from concatenated next-field text like "39.4TasteNot Available")
      var fpCheck = fpRaw.substring(0, 20);
      if (!/^[\s:]*(?:no\s+data|not\s+a(?:vail|pplic)|none|n\/?a\b)/i.test(fpCheck)) {
        // Extract numeric value — grab the first number in the raw text
        var fpNumMatch = fpRaw.match(/(-?\d+\.?\d*)/);
        if (fpNumMatch) {
          var fpNumber = parseFloat(fpNumMatch[1]);
          // Detect Celsius vs Fahrenheit from the full match (including unit in parens)
          var isCelsius = /°?\s*C(?:\b|[^a-z]|$)/i.test(fpFullMatch);
          var isFahrenheit = /°?\s*F(?:\b|[^a-z]|$)/i.test(fpRaw);
          if (!isCelsius && !isFahrenheit) {
            isCelsius = fpNumber < 100;
          }
          if (isCelsius) {
            var fpF = Math.round(fpNumber * 9 / 5 + 32);
            result.flashPoint = fpF + ' °F (' + fpNumber + ' °C)';
            result.flashPointNumF = fpF;
          } else {
            result.flashPoint = fpNumber + ' °F';
            result.flashPointNumF = fpNumber;
          }
        } else {
          result.flashPoint = fpRaw;
        }
      }
    }

    // pH extraction — handle "pH (as supplied)\n2.4" and "pH: 2.4" and "pH\n:\n2.4"
    var phMatch = sec9.match(/(?:^|\s)pH\s*(?:\([^)]*\))?\s*[:\s]*(\d+\.?\d*(?:\s*[-–]\s*\d+\.?\d*)?)/im);
    if (!phMatch) {
      // Try: "pH" on one line, number on next line
      var phLineMatch = sec9.match(/\bpH\b[^\d\n]*\n\s*(\d+\.?\d*)/im);
      if (phLineMatch) phMatch = phLineMatch;
    }
    if (phMatch) result.pH = phMatch[1].trim();

    var stateMatch = sec9.match(/(?:physical\s+state|\bform\b|\bappearance\b)[:\s]*([^\n]{3,30})/i);
    if (stateMatch) {
      var st = stateMatch[1].toLowerCase();
      if (st.includes('liquid')) result.physicalState = 'Liquid';
      else if (st.includes('solid')) result.physicalState = 'Solid';
      else if (st.includes('gas')) result.physicalState = 'Gas';
      else if (st.includes('powder')) result.physicalState = 'Solid';
      else result.physicalState = stateMatch[1].trim();
    }

    var colorMatch = sec9.match(/(?:color|colour)[:\s]*([^\n]{2,30})/i);
    if (colorMatch) result.color = colorMatch[1].trim();

    var odorMatch = sec9.match(/(?:odor|odour|smell)[:\s]*([^\n]{2,30})/i);
    if (odorMatch) result.odor = odorMatch[1].trim();
  }

  // Section 15: Regulatory
  var sec15 = getSection(15);
  if (sec15) {
    var rcraMatch = sec15.match(/[DFKPU]\d{3}/g);
    if (rcraMatch) result.epaWasteCodes = Array.from(new Set(rcraMatch));
  }

  // Section 2: Hazard statements
  var sec2 = getSection(2);
  if (sec2) {
    var hStatements = sec2.match(/H\d{3}/g);
    if (hStatements) result.hazardStatements = Array.from(new Set(hStatements));
  }

  // Section 10: Stability and Reactivity
  var sec10 = getSection(10);
  if (sec10) {
    var incompMatch = sec10.match(/(?:incompatible|incompatibility|materials to avoid)[:\s]*([^\n]+(?:\n(?!SECTION)[^\n]+)*)/i);
    if (incompMatch) result.incompatibles = incompMatch[1].trim().replace(/\n/g, '; ').substring(0, 200);

    var stabMatch = sec10.match(/(?:conditions to avoid|hazardous decomposition|thermal decomposition)[:\s]*([^\n]+)/i);
    if (stabMatch) result.stabilityNotes = stabMatch[1].trim().substring(0, 200);

    // Check for reactivity keywords
    var sec10lower = sec10.toLowerCase();
    if (sec10lower.includes('water reactive') || sec10lower.includes('reacts with water') || sec10lower.includes('reacts violently with water'))
      result.reactivityFlags.push('Water-reactive');
    if (sec10lower.includes('oxidiz') || sec10lower.includes('strong oxidizer') || sec10lower.includes('oxidising'))
      result.reactivityFlags.push('Oxidizer');
    if (sec10lower.includes('air reactive') || sec10lower.includes('pyrophoric') || sec10lower.includes('spontaneously combustible'))
      result.reactivityFlags.push('Air-reactive / Pyrophoric');
    if (sec10lower.includes('explosive') || sec10lower.includes('shock sensitive'))
      result.reactivityFlags.push('Explosive / Shock-sensitive');
    if (sec10lower.includes('polymeriz'))
      result.reactivityFlags.push('May polymerize');
  }

  // Section 11: Toxicological Information
  var sec11 = getSection(11);
  if (sec11) {
    // Extract LD50 values
    var ld50Pattern = /LD50\s*(?:\(([^)]+)\))?\s*[:\s]*([^\n]*\d[\d,.\s]*(?:mg\/kg|g\/kg)[^\n]*)/gi;
    var ld50Match;
    while ((ld50Match = ld50Pattern.exec(sec11)) !== null) {
      result.toxicity.push({
        type: 'LD50',
        route: (ld50Match[1] || 'Oral').trim(),
        value: ld50Match[2].trim().substring(0, 80),
        species: ''
      });
    }

    // Extract LC50 values
    var lc50Pattern = /LC50\s*(?:\(([^)]+)\))?\s*[:\s]*([^\n]*\d[\d,.\s]*(?:mg\/[Lm]|ppm)[^\n]*)/gi;
    var lc50Match;
    while ((lc50Match = lc50Pattern.exec(sec11)) !== null) {
      result.toxicity.push({
        type: 'LC50',
        route: (lc50Match[1] || 'Inhalation').trim(),
        value: lc50Match[2].trim().substring(0, 80),
        species: ''
      });
    }

    // Check for acute toxicity category
    var sec11lower = sec11.toLowerCase();
    if (sec11lower.includes('category 1') || sec11lower.includes('fatal'))
      result.reactivityFlags.push('Acute Toxicity Cat 1 (Fatal)');
    else if (sec11lower.includes('category 2') && sec11lower.includes('fatal'))
      result.reactivityFlags.push('Acute Toxicity Cat 2 (Fatal)');
  }

  // Suggest waste codes based on findings
  suggestWasteCodes(result);

  estimateMixtureProps(result);

  return result;
}

// RCRA D-code lookup by CAS number
var RCRA_TC_LOOKUP = {
  '7440-38-2': 'D004', // Arsenic
  '7440-39-3': 'D005', // Barium
  '71-43-2': 'D018',   // Benzene
  '7440-43-9': 'D006', // Cadmium
  '56-23-5': 'D019',   // Carbon tetrachloride
  '57-74-9': 'D020',   // Chlordane
  '67-66-3': 'D022',   // Chloroform
  '7440-47-3': 'D007', // Chromium
  '72-54-8': 'D023',   // o-Cresol
  '108-39-4': 'D024',  // m-Cresol
  '106-44-5': 'D025',  // p-Cresol
  '94-75-7': 'D016',   // 2,4-D
  '106-46-7': 'D027',  // 1,4-Dichlorobenzene
  '107-06-2': 'D028',  // 1,2-Dichloroethane
  '75-35-4': 'D029',   // 1,1-Dichloroethylene
  '121-14-2': 'D030',  // 2,4-Dinitrotoluene
  '72-20-8': 'D031',   // Endrin
  '76-44-8': 'D032',   // Heptachlor
  '118-74-1': 'D033',  // Hexachlorobenzene
  '87-68-3': 'D034',   // Hexachlorobutadiene
  '67-72-1': 'D034',   // Hexachloroethane (also D034)
  '7439-92-1': 'D008', // Lead
  '58-89-9': 'D013',   // Lindane
  '7439-97-6': 'D009', // Mercury
  '72-43-5': 'D014',   // Methoxychlor
  '78-93-3': 'D035',   // Methyl ethyl ketone
  '98-95-3': 'D036',   // Nitrobenzene
  '87-86-5': 'D037',   // Pentachlorophenol
  '110-86-1': 'D038',  // Pyridine
  '7782-49-2': 'D010', // Selenium
  '7440-22-4': 'D011', // Silver
  '127-18-4': 'D039',  // Tetrachloroethylene
  '8001-35-2': 'D015', // Toxaphene
  '79-01-6': 'D040',   // Trichloroethylene
  '95-95-4': 'D041',   // 2,4,5-Trichlorophenol
  '88-06-2': 'D042',   // 2,4,6-Trichlorophenol
  '75-01-4': 'D043',   // Vinyl chloride
  '93-72-1': 'D017',   // 2,4,5-TP (Silvex)
};

var UHC_LOOKUP = {
  // D004-D011 Metals
  '7440-38-2': { name: 'Arsenic', code: 'D004', wwStd: '5.0', nwStd: '5.0', units: 'mg/L TCLP', technology: 'Stabilization' },
  '7440-39-3': { name: 'Barium', code: 'D005', wwStd: '100', nwStd: '100', units: 'mg/L TCLP', technology: 'Stabilization' },
  '7440-43-9': { name: 'Cadmium', code: 'D006', wwStd: '1.0', nwStd: '1.0', units: 'mg/L TCLP', technology: 'Stabilization' },
  '7440-47-3': { name: 'Chromium', code: 'D007', wwStd: '5.0', nwStd: '5.0', units: 'mg/L TCLP', technology: 'Stabilization' },
  '7439-92-1': { name: 'Lead', code: 'D008', wwStd: '5.0', nwStd: '5.0', units: 'mg/L TCLP', technology: 'Stabilization' },
  '7439-97-6': { name: 'Mercury', code: 'D009', wwStd: '0.2', nwStd: '0.2', units: 'mg/L TCLP', technology: 'Stabilization' },
  '7782-49-2': { name: 'Selenium', code: 'D010', wwStd: '1.0', nwStd: '1.0', units: 'mg/L TCLP', technology: 'Stabilization' },
  '7440-22-4': { name: 'Silver', code: 'D011', wwStd: '5.0', nwStd: '5.0', units: 'mg/L TCLP', technology: 'Stabilization' },
  // D012-D017 Pesticides
  '72-20-8': { name: 'Endrin', code: 'D012', wwStd: '0.02', nwStd: '0.13', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '58-89-9': { name: 'Lindane', code: 'D013', wwStd: '0.4', nwStd: '0.066', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '72-43-5': { name: 'Methoxychlor', code: 'D014', wwStd: '10', nwStd: '0.18', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '8001-35-2': { name: 'Toxaphene', code: 'D015', wwStd: '0.5', nwStd: '2.6', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '94-75-7': { name: '2,4-D', code: 'D016', wwStd: '10', nwStd: '10', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '93-72-1': { name: '2,4,5-TP (Silvex)', code: 'D017', wwStd: '1.0', nwStd: '7.9', units: 'mg/L / mg/kg', technology: 'Incineration' },
  // D018-D043 Organics (common ones)
  '71-43-2': { name: 'Benzene', code: 'D018', wwStd: '0.5', nwStd: '10', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '56-23-5': { name: 'Carbon tetrachloride', code: 'D019', wwStd: '0.5', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '57-74-9': { name: 'Chlordane', code: 'D020', wwStd: '0.03', nwStd: '0.26', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '108-90-7': { name: 'Chlorobenzene', code: 'D021', wwStd: '100', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '67-66-3': { name: 'Chloroform', code: 'D022', wwStd: '6.0', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '108-39-4': { name: 'm-Cresol', code: 'D024', wwStd: '200', nwStd: '5.6', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '95-48-7': { name: 'o-Cresol', code: 'D023', wwStd: '200', nwStd: '5.6', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '106-44-5': { name: 'p-Cresol', code: 'D025', wwStd: '200', nwStd: '5.6', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '106-46-7': { name: '1,4-Dichlorobenzene', code: 'D027', wwStd: '6.0', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '107-06-2': { name: '1,2-Dichloroethane', code: 'D028', wwStd: '6.0', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '75-35-4': { name: '1,1-Dichloroethylene', code: 'D029', wwStd: '6.0', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '121-14-2': { name: '2,4-Dinitrotoluene', code: 'D030', wwStd: '0.13', nwStd: '140', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '76-44-8': { name: 'Heptachlor', code: 'D031', wwStd: '0.008', nwStd: '0.066', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '118-74-1': { name: 'Hexachlorobenzene', code: 'D032', wwStd: '0.13', nwStd: '10', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '87-68-3': { name: 'Hexachlorobutadiene', code: 'D033', wwStd: '0.5', nwStd: '5.6', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '67-72-1': { name: 'Hexachloroethane', code: 'D034', wwStd: '30', nwStd: '30', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '78-93-3': { name: 'Methyl ethyl ketone', code: 'D035', wwStd: '200', nwStd: '36', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '98-95-3': { name: 'Nitrobenzene', code: 'D036', wwStd: '0.13', nwStd: '14', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '87-86-5': { name: 'Pentachlorophenol', code: 'D037', wwStd: '100', nwStd: '7.4', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '110-86-1': { name: 'Pyridine', code: 'D038', wwStd: '5.0', nwStd: '16', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '127-18-4': { name: 'Tetrachloroethylene', code: 'D039', wwStd: '6.0', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '79-01-6': { name: 'Trichloroethylene', code: 'D040', wwStd: '6.0', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '95-95-4': { name: '2,4,5-Trichlorophenol', code: 'D041', wwStd: '400', nwStd: '7.4', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '88-06-2': { name: '2,4,6-Trichlorophenol', code: 'D042', wwStd: '2.0', nwStd: '7.4', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '75-01-4': { name: 'Vinyl chloride', code: 'D043', wwStd: '6.0', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  // F001-F005 Spent solvents
  '75-09-2': { name: 'Methylene chloride', code: 'F001', wwStd: '0.96', nwStd: '30', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '108-88-3': { name: 'Toluene', code: 'F005', wwStd: '28', nwStd: '10', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '1330-20-7': { name: 'Xylenes (mixed)', code: 'F005', wwStd: '28', nwStd: '10', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '100-41-4': { name: 'Ethylbenzene', code: 'F005', wwStd: '28', nwStd: '10', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '67-64-1': { name: 'Acetone', code: 'F003', wwStd: '0.59', nwStd: '160', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '108-10-1': { name: 'Methyl isobutyl ketone', code: 'F003', wwStd: '0.14', nwStd: '33', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '71-55-6': { name: '1,1,1-Trichloroethane', code: 'F001', wwStd: '0.054', nwStd: '6.0', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '111-76-2': { name: '2-Butoxyethanol', code: 'F005', wwStd: '5.6', nwStd: '5.6', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '110-54-3': { name: 'n-Hexane', code: 'F005', wwStd: '28', nwStd: '10', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '67-56-1': { name: 'Methanol', code: 'F003', wwStd: '0.25', nwStd: '0.75', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '64-17-5': { name: 'Ethanol', code: 'F003', wwStd: '0.25', nwStd: '0.75', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '67-63-0': { name: 'Isopropanol', code: 'F003', wwStd: '0.25', nwStd: '0.75', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '141-78-6': { name: 'Ethyl acetate', code: 'F003', wwStd: '0.25', nwStd: '0.75', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  '109-99-9': { name: 'Tetrahydrofuran', code: 'F003', wwStd: '0.25', nwStd: '0.75', units: 'mg/L / mg/kg', technology: 'Incineration/Fuel Sub' },
  // Additional common industrial chemicals
  '7664-39-3': { name: 'Hydrofluoric acid', code: 'U134', wwStd: '35', nwStd: '35', units: 'mg/L / mg/kg', technology: 'Neutralization' },
  '7697-37-2': { name: 'Nitric acid', code: 'P076', wwStd: '1.2', nwStd: '1.2', units: 'mg/L / mg/kg', technology: 'Neutralization/Denitration' },
  '50-00-0': { name: 'Formaldehyde', code: 'U122', wwStd: '15', nwStd: '15', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '75-05-8': { name: 'Acetonitrile', code: 'U003', wwStd: '5.73', nwStd: '38', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '62-53-3': { name: 'Aniline', code: 'U012', wwStd: '14', nwStd: '14', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '91-20-3': { name: 'Naphthalene', code: 'U165', wwStd: '5.6', nwStd: '5.6', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '108-95-2': { name: 'Phenol', code: 'U188', wwStd: '6.2', nwStd: '6.2', units: 'mg/L / mg/kg', technology: 'Incineration' },
  '1336-36-3': { name: 'PCBs', code: 'U209', wwStd: '0.01', nwStd: '2.0', units: 'mg/L / mg/kg', technology: 'Incineration/TSCA' },
};

var WATER_REACTIVE = {
  '7440-23-5': 'Sodium metal',
  '7440-09-7': 'Potassium metal',
  '7439-93-2': 'Lithium metal',
  '7440-70-2': 'Calcium metal',
  '7429-90-5': 'Aluminum powder',
  '1302-76-7': 'Aluminum oxide (reactive forms)',
  '7647-01-0': 'Hydrogen chloride (anhydrous)',
  '7803-62-5': 'Silicon tetrahydride (silane)',
  '7580-67-8': 'Lithium hydride',
  '7646-69-7': 'Sodium hydride',
  '7789-78-8': 'Calcium hydride',
  '16853-85-3': 'Lithium aluminum hydride',
  '16940-66-2': 'Sodium borohydride',
  '75-44-5': 'Phosgene',
  '7719-12-2': 'Phosphorus trichloride',
  '10025-87-3': 'Phosphorus oxychloride',
};

var OXIDIZER_CAS = {
  '7722-84-1': 'Hydrogen peroxide',
  '7601-90-3': 'Perchloric acid',
  '7790-98-9': 'Ammonium perchlorate',
  '7778-50-9': 'Potassium dichromate',
  '7775-09-9': 'Sodium chlorate',
  '7681-52-9': 'Sodium hypochlorite',
  '10049-04-4': 'Chlorine dioxide',
  '7782-50-5': 'Chlorine',
  '7697-37-2': 'Nitric acid',
  '7727-54-0': 'Ammonium persulfate',
  '7761-88-8': 'Silver nitrate',
  '7757-79-1': 'Potassium nitrate',
  '7631-99-4': 'Sodium nitrate',
  '1310-73-2': 'Sodium hydroxide',
  '7664-93-9': 'Sulfuric acid (conc.)',
  '7783-06-4': 'Hydrogen sulfide',
};

var AIR_REACTIVE = {
  '7440-23-5': 'Sodium metal',
  '7440-09-7': 'Potassium metal',
  '7723-14-0': 'White/yellow phosphorus',
  '7429-90-5': 'Aluminum powder (fine)',
  '12604-58-9': 'Ferrocerium',
  '75-44-5': 'Phosgene',
  '7803-62-5': 'Silane',
};

// Known flash points by CAS (in deg F) for mixture estimation
var FLASH_POINT_DB = {
  '67-64-1': -4,     // Acetone
  '71-43-2': 12,     // Benzene
  '108-88-3': 40,    // Toluene
  '1330-20-7': 81,   // Xylenes
  '100-41-4': 59,    // Ethylbenzene
  '78-93-3': 16,     // MEK
  '67-56-1': 52,     // Methanol
  '64-17-5': 55,     // Ethanol
  '67-63-0': 53,     // Isopropanol
  '110-54-3': -7,    // n-Hexane
  '109-66-0': -57,   // n-Pentane
  '67-66-3': -1,     // Chloroform (non-flammable but listed)
  '75-09-2': -1,     // Methylene chloride
  '127-18-4': -1,    // Tetrachloroethylene (none)
  '141-78-6': 24,    // Ethyl acetate
  '108-10-1': 62,    // MIBK
  '108-90-7': 82,    // Chlorobenzene
  '79-01-6': 90,     // TCE
  '111-76-2': 143,   // 2-Butoxyethanol
  '109-99-9': 6,     // THF
  '75-05-8': 42,     // Acetonitrile
  '110-86-1': 68,    // Pyridine
  '91-20-3': 174,    // Naphthalene
  '98-95-3': 190,    // Nitrobenzene
  '108-95-2': 175,   // Phenol
  '62-53-3': 158,    // Aniline
  '50-00-0': 122,    // Formaldehyde (37% solution)
  '71-36-3': 84,     // n-Butanol
  '78-83-1': 82,     // Isobutanol
  '107-21-1': 232,   // Ethylene glycol
  '57-55-6': 210,    // Propylene glycol
  '142-82-5': 25,    // n-Heptane
  '111-65-9': 56,    // n-Octane
  '64-19-7': 103,    // Acetic acid (39.4°C)
  '85-44-9': 305,    // Phthalic anhydride
  '100-41-4': 59,    // Ethylbenzene
  '1330-20-7': 81,   // Xylenes (mixed)
  '71-23-8': 59,     // n-Propanol
  '123-86-4': 72,    // n-Butyl acetate
};

// Known pH values for common chemicals (pure or standard concentration)
var PH_DB = {
  '7664-93-9': 0.3,   // Sulfuric acid (conc.)
  '7647-01-0': 0.1,   // Hydrochloric acid (conc.)
  '7697-37-2': 0.5,   // Nitric acid (conc.)
  '7664-39-3': 1.0,   // Hydrofluoric acid
  '64-19-7': 2.4,     // Acetic acid
  '7664-38-2': 1.5,   // Phosphoric acid
  '1310-73-2': 14.0,  // Sodium hydroxide
  '1310-58-3': 14.0,  // Potassium hydroxide
  '1305-62-0': 12.4,  // Calcium hydroxide
  '497-19-8': 11.6,   // Sodium carbonate
  '7664-41-7': 11.6,  // Ammonia (conc.)
  '7681-52-9': 12.0,  // Sodium hypochlorite
};

function suggestWasteCodes(result) {
  var suggested = result.epaWasteCodes.slice();
  var caSuggested = result.caWasteCodes.slice();

  // Check chemicals against RCRA TC lookup
  result.chemicals.forEach(function(chem) {
    if (chem.cas && RCRA_TC_LOOKUP[chem.cas]) {
      var code = RCRA_TC_LOOKUP[chem.cas];
      if (suggested.indexOf(code) === -1) suggested.push(code);
    }
  });

  // D001 - Ignitability (flash point < 140F / 60C)
  var d001Triggered = false;
  if (result.flashPointNumF != null) {
    if (result.flashPointNumF < 140) {
      if (suggested.indexOf('D001') === -1) suggested.push('D001');
      if (caSuggested.indexOf('131') === -1) caSuggested.push('131');
      d001Triggered = true;
    }
  } else if (result.flashPoint) {
    var fpFirstMatch = result.flashPoint.match(/(-?\d+\.?\d*)/);
    if (fpFirstMatch) {
      var fpNum = parseFloat(fpFirstMatch[1]);
      var isFahrenheit = result.flashPoint.toLowerCase().indexOf('f') >= 0 || result.flashPoint.toLowerCase().indexOf('c') < 0;
      if (!isNaN(fpNum)) {
        if ((isFahrenheit && fpNum < 140) || (!isFahrenheit && fpNum < 60)) {
          if (suggested.indexOf('D001') === -1) suggested.push('D001');
          if (caSuggested.indexOf('131') === -1) caSuggested.push('131');
          d001Triggered = true;
        }
      }
    }
  }
  // Fallback: if SDS didn't provide flash point, check chemicals against FLASH_POINT_DB
  if (!d001Triggered) {
    result.chemicals.forEach(function(chem) {
      if (d001Triggered) return;
      if (chem.cas && FLASH_POINT_DB[chem.cas] != null) {
        var knownFP = FLASH_POINT_DB[chem.cas];
        var pctMatch = (chem.percentage || '').match(/(\d+\.?\d*)/);
        var pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
        if (pct >= 10 && knownFP < 140) {
          if (suggested.indexOf('D001') === -1) suggested.push('D001');
          if (caSuggested.indexOf('131') === -1) caSuggested.push('131');
          d001Triggered = true;
        }
      }
    });
  }

  // D002 - Corrosivity (pH <= 2 or pH >= 12.5)
  var d002Triggered = false;
  if (result.pH) {
    var phNum = parseFloat(result.pH);
    if (!isNaN(phNum)) {
      if (phNum <= 2 || phNum >= 12.5) {
        if (suggested.indexOf('D002') === -1) suggested.push('D002');
        if (caSuggested.indexOf('132') === -1) caSuggested.push('132');
        d002Triggered = true;
      }
    }
  }
  // Fallback: if SDS didn't provide pH, check chemicals against PH_DB lookup
  if (!d002Triggered) {
    result.chemicals.forEach(function(chem) {
      if (d002Triggered) return;
      if (chem.cas && PH_DB[chem.cas] != null) {
        var knownPH = PH_DB[chem.cas];
        // Only trigger if the chemical is present at significant concentration
        var pctMatch = (chem.percentage || '').match(/(\d+\.?\d*)/);
        var pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
        if (pct >= 10 && (knownPH <= 2 || knownPH >= 12.5)) {
          if (suggested.indexOf('D002') === -1) suggested.push('D002');
          if (caSuggested.indexOf('132') === -1) caSuggested.push('132');
          d002Triggered = true;
        }
      }
    });
  }

  // California waste codes based on physical state and content
  var hasMetals = result.chemicals.some(function(c) {
    return ['7439-92-1','7440-47-3','7440-43-9','7440-38-2','7439-97-6','7782-49-2','7440-22-4','7440-39-3'].indexOf(c.cas) !== -1;
  });
  var hasOrganics = result.chemicals.some(function(c) {
    return ['71-43-2','127-18-4','79-01-6','67-66-3','78-93-3','108-88-3','1330-20-7','100-41-4','75-09-2','110-54-3'].indexOf(c.cas) !== -1;
  });
  var hasSolvents = result.hazardClass === '3' || (result.properShippingName || '').toLowerCase().includes('solvent');
  var isLiquid = (result.physicalState || '').toLowerCase() === 'liquid';

  if (hasMetals && isLiquid && caSuggested.indexOf('721') === -1) caSuggested.push('721');
  if (hasMetals && !isLiquid && caSuggested.indexOf('181') === -1) caSuggested.push('181');
  if (hasOrganics && isLiquid && caSuggested.indexOf('741') === -1) caSuggested.push('741');
  if (hasSolvents && caSuggested.indexOf('214') === -1) caSuggested.push('214');
  if (isLiquid && !hasMetals && !hasOrganics && caSuggested.indexOf('151') === -1) caSuggested.push('151');

  result.epaWasteCodes = suggested;
  result.caWasteCodes = caSuggested;
}

function estimateMixtureProps(result) {
  result.estimatedFlashPoint = '';
  result.estimatedPH = '';
  result.uhcMatches = [];

  // --- Flash Point Estimation ---
  // Uses FLASH_POINT_DB lookup first, then falls back to SDS Section 9 value per chemical
  var fpComponents = [];
  result.chemicals.forEach(function(chem) {
    var fp = null;
    if (chem.cas && FLASH_POINT_DB[chem.cas]) {
      fp = FLASH_POINT_DB[chem.cas];
    } else if (chem.sdsFlashPointF != null) {
      fp = chem.sdsFlashPointF;
    }
    if (fp == null) return;
    var pctMatch = (chem.percentage || '').match(/(\d+\.?\d*)/);
    var pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
    if (pct > 0) {
      fpComponents.push({ fp: fp, pct: pct, name: chem.name, fromSDS: !FLASH_POINT_DB[chem.cas] });
    }
  });

  if (fpComponents.length > 0) {
    // Use lowest flash point component weighted by concentration
    fpComponents.sort(function(a, b) { return a.fp - b.fp; });
    var lowestFP = fpComponents[0];
    // If dominant component (>50%), use its flash point
    // Otherwise, estimate conservatively using lowest
    if (lowestFP.pct > 50) {
      result.estimatedFlashPoint = lowestFP.fp + '°F (est. from ' + lowestFP.name + ' at ' + lowestFP.pct + '%)';
    } else if (lowestFP.pct > 10) {
      result.estimatedFlashPoint = 'Est. near ' + lowestFP.fp + '°F (lowest component: ' + lowestFP.name + ' at ' + lowestFP.pct + '%)';
    } else {
      // Weighted average approach for small amounts
      var totalPct = 0;
      var weightedFP = 0;
      fpComponents.forEach(function(c) { totalPct += c.pct; weightedFP += c.fp * c.pct; });
      if (totalPct > 0) {
        var avgFP = Math.round(weightedFP / totalPct);
        result.estimatedFlashPoint = 'Est. ~' + avgFP + '°F (weighted avg of ' + fpComponents.length + ' components)';
      }
    }
  }

  // --- pH Estimation ---
  var acidPH = null;
  var basePH = null;
  var maxAcidPct = 0;
  var maxBasePct = 0;

  result.chemicals.forEach(function(chem) {
    if (!chem.cas || !PH_DB[chem.cas]) return;
    var pctMatch = (chem.percentage || '').match(/(\d+\.?\d*)/);
    var pct = pctMatch ? parseFloat(pctMatch[1]) : 0;
    if (pct <= 0) return;
    var knownPH = PH_DB[chem.cas];
    if (knownPH < 7 && pct > maxAcidPct) { acidPH = knownPH; maxAcidPct = pct; }
    if (knownPH > 7 && pct > maxBasePct) { basePH = knownPH; maxBasePct = pct; }
  });

  if (acidPH !== null && basePH === null) {
    // Acid dominant
    if (maxAcidPct > 50) result.estimatedPH = 'Est. pH ~' + (acidPH + 0.5).toFixed(1) + ' (concentrated acid, ' + maxAcidPct + '%)';
    else if (maxAcidPct > 10) result.estimatedPH = 'Est. pH ~' + Math.min(acidPH + 2, 6).toFixed(1) + ' (dilute acid, ' + maxAcidPct + '%)';
    else result.estimatedPH = 'Est. pH 4-6 (trace acid, ' + maxAcidPct + '%)';
  } else if (basePH !== null && acidPH === null) {
    if (maxBasePct > 50) result.estimatedPH = 'Est. pH ~' + (basePH - 0.5).toFixed(1) + ' (concentrated base, ' + maxBasePct + '%)';
    else if (maxBasePct > 10) result.estimatedPH = 'Est. pH ~' + Math.max(basePH - 2, 8).toFixed(1) + ' (dilute base, ' + maxBasePct + '%)';
    else result.estimatedPH = 'Est. pH 8-10 (trace base, ' + maxBasePct + '%)';
  } else if (acidPH !== null && basePH !== null) {
    result.estimatedPH = 'Mixed acid/base — test required (acid at ' + maxAcidPct + '%, base at ' + maxBasePct + '%)';
  }

  // --- UHC Matching ---
  result.chemicals.forEach(function(chem) {
    if (!chem.cas) return;
    var uhc = UHC_LOOKUP[chem.cas];
    if (uhc) {
      result.uhcMatches.push({
        name: uhc.name,
        cas: chem.cas,
        code: uhc.code,
        percentage: chem.percentage,
        wwStd: uhc.wwStd,
        nwStd: uhc.nwStd,
        units: uhc.units,
        technology: uhc.technology
      });
    }
  });

  // --- Reactivity flag from chemical lookups ---
  result.chemicals.forEach(function(chem) {
    if (!chem.cas) return;
    if (WATER_REACTIVE[chem.cas] && result.reactivityFlags.indexOf('Water-reactive') === -1) {
      result.reactivityFlags.push('Water-reactive (' + WATER_REACTIVE[chem.cas] + ')');
    }
    if (OXIDIZER_CAS[chem.cas] && result.reactivityFlags.indexOf('Oxidizer') === -1) {
      result.reactivityFlags.push('Oxidizer (' + OXIDIZER_CAS[chem.cas] + ')');
    }
    if (AIR_REACTIVE[chem.cas] && result.reactivityFlags.indexOf('Air-reactive / Pyrophoric') === -1) {
      result.reactivityFlags.push('Air-reactive (' + AIR_REACTIVE[chem.cas] + ')');
    }
  });

  // D003 Reactivity suggestion
  if (result.reactivityFlags.some(function(f) { return f.includes('Water-reactive') || f.includes('Explosive') || f.includes('Shock'); })) {
    if (result.epaWasteCodes.indexOf('D003') === -1) result.epaWasteCodes.push('D003');
  }
  // CA 133 for reactive waste
  if (result.epaWasteCodes.indexOf('D003') !== -1 && result.caWasteCodes.indexOf('133') === -1) {
    result.caWasteCodes.push('133');
  }
}

app.post('/api/sds/parse', upload.array('files', 10), async function(req, res) {
  if (!pdfParse) return res.status(500).json({ error: 'pdf-parse not installed' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  var allResults = [];
  var mergedResult = {
    chemicals: [],
    unNumber: '',
    properShippingName: '',
    hazardClass: '',
    packingGroup: '',
    flashPoint: '',
    flashPointNumF: null,
    pH: '',
    physicalState: '',
    color: '',
    odor: '',
    epaWasteCodes: [],
    caWasteCodes: [],
    hazardStatements: [],
    sdsFiles: [],
    toxicity: [],
    reactivityFlags: [],
    incompatibles: '',
    stabilityNotes: '',
    estimatedFlashPoint: '',
    estimatedPH: '',
    uhcMatches: []
  };

  for (var i = 0; i < req.files.length; i++) {
    var file = req.files[i];
    try {
      var dataBuffer = fs.readFileSync(file.path);
      var pdfData = await pdfParse(dataBuffer);
      var parsed = parseSDS(pdfData.text);
      parsed.fileName = file.originalname;
      allResults.push(parsed);
      mergedResult.sdsFiles.push({ id: 'sds' + Date.now() + i, name: file.originalname, filename: file.filename });

      // Merge chemicals (avoid duplicates by CAS)
      // Tag each chemical with its SDS flash point for mixture estimation
      parsed.chemicals.forEach(function(c) {
        if (parsed.flashPointNumF != null) c.sdsFlashPointF = parsed.flashPointNumF;
        var exists = mergedResult.chemicals.some(function(mc) { return mc.cas && mc.cas === c.cas; });
        if (!exists) mergedResult.chemicals.push(c);
      });

      // Take first non-empty values
      if (!mergedResult.unNumber && parsed.unNumber) mergedResult.unNumber = parsed.unNumber;
      if (!mergedResult.properShippingName && parsed.properShippingName) mergedResult.properShippingName = parsed.properShippingName;
      if (!mergedResult.hazardClass && parsed.hazardClass) mergedResult.hazardClass = parsed.hazardClass;
      if (!mergedResult.packingGroup && parsed.packingGroup) mergedResult.packingGroup = parsed.packingGroup;
      if (!mergedResult.flashPoint && parsed.flashPoint) {
        mergedResult.flashPoint = parsed.flashPoint;
        mergedResult.flashPointNumF = parsed.flashPointNumF;
      }
      if (!mergedResult.pH && parsed.pH) mergedResult.pH = parsed.pH;
      if (!mergedResult.physicalState && parsed.physicalState) mergedResult.physicalState = parsed.physicalState;
      if (!mergedResult.color && parsed.color) mergedResult.color = parsed.color;
      if (!mergedResult.odor && parsed.odor) mergedResult.odor = parsed.odor;

      // Merge waste codes
      parsed.epaWasteCodes.forEach(function(c) { if (mergedResult.epaWasteCodes.indexOf(c) === -1) mergedResult.epaWasteCodes.push(c); });
      parsed.caWasteCodes.forEach(function(c) { if (mergedResult.caWasteCodes.indexOf(c) === -1) mergedResult.caWasteCodes.push(c); });
      parsed.hazardStatements.forEach(function(h) { if (mergedResult.hazardStatements.indexOf(h) === -1) mergedResult.hazardStatements.push(h); });

      // Merge toxicity
      parsed.toxicity.forEach(function(t) { mergedResult.toxicity.push(t); });
      // Merge reactivity flags
      parsed.reactivityFlags.forEach(function(f) { if (mergedResult.reactivityFlags.indexOf(f) === -1) mergedResult.reactivityFlags.push(f); });
      // Merge incompatibles
      if (parsed.incompatibles && !mergedResult.incompatibles) mergedResult.incompatibles = parsed.incompatibles;
      if (parsed.stabilityNotes && !mergedResult.stabilityNotes) mergedResult.stabilityNotes = parsed.stabilityNotes;
    } catch(e) {
      console.error('Error parsing SDS ' + file.originalname + ':', e.message);
      allResults.push({ fileName: file.originalname, error: e.message });
    }
  }

  // Re-run waste code suggestions on merged result
  suggestWasteCodes(mergedResult);

  estimateMixtureProps(mergedResult);

  res.json({ merged: mergedResult, individual: allResults });
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
