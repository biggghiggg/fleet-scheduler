const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

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
  equipment: ['Liftgate','Drum Dolly','Placards','PPE','Bins','Totes']
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
createBackup();
setInterval(createBackup, 3600000);

// SSE clients for live updates
var clients = [];
function broadcast(msg) {
  var payload = 'data: ' + JSON.stringify(msg) + '\n\n';
  clients.forEach(function(res) { res.write(payload); });
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// SSE - live connection
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
