const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null, sosActive: false, teamsConfig: [] };
let allyMarkers = {}, activeObjMarkers = [], enemyMarkers = {};

const map = L.map("map", { zoomControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

map.on('click', e => { if(state.playerName && confirm("SEGNALA NEMICO?")) spotEnemy(e.latlng.lat, e.latlng.lng); });

async function checkStatus() {
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: {"X-Master-Key": SECRET_KEY}, cache: 'no-store' });
        const { record } = await res.json();
        const b = document.getElementById("gameStatusBanner");
        if (record.game?.started) {
            b.innerText="⚠️ OPERAZIONE IN CORSO"; b.className="status-banner status-active";
            if(record.config?.teams) {
                state.teamsConfig = record.config.teams;
                const sel = document.getElementById("teamSelect");
                sel.innerHTML = record.config.teams.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
            }
        } else { b.innerText="✅ SISTEMA PRONTO"; b.className="status-banner"; }
    } catch(e){}
}

function initSlotUI() {
    const container = document.getElementById("objSlotContainer");
    const defaults = [{n:"ALPHA",lat:45.23837,lon:8.81006},{n:"BRAVO",lat:45.23764,lon:8.81094},{n:"CHARLIE",lat:45.23863,lon:8.80877}];
    for (let i=0; i<10; i++) {
        const d = defaults[i] || {n:`SETTORE ${i+1}`,lat:0,lon:0};
        container.innerHTML += `<div class="obj-slot"><input type="checkbox" class="s-active" ${i<3?'checked':''}>
            <input type="text" class="s-name" value="${d.n}" style="width:60px"><input type="number" class="s-lat" value="${d.lat}" step="0.00001" style="width:80px">
            <input type="number" class="s-lon" value="${d.lon}" step="0.00001" style="width:80px"></div>`;
    }
}

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    if (state.isMaster) {
        if (document.getElementById("masterPass").value !== "71325") return alert("ERRORE CODICE");
        state.playerName = "COMMAND";
        const tSlots = document.querySelectorAll(".team-slot");
        state.teamsConfig = Array.from(tSlots).map(s => ({name: s.querySelector(".t-name").value.toUpperCase(), color: s.querySelector(".t-color").value}));
    } else {
        state.playerTeam = document.getElementById("teamSelect").value;
    }
    if(!state.playerName) return alert("INSERISCI NOME");
    document.getElementById("menu").style.display="none"; document.getElementById("game-ui").style.display="block";
    if(state.isMaster) document.getElementById("master-controls").style.display="block";
    
    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        if(!state.playerMarker) state.playerMarker = L.marker([la,lo], {icon: L.divIcon({className:'player-icon', html:'▲'})}).addTo(map);
        else state.playerMarker.setLatLng([la,lo]);
    }, null, {enableHighAccuracy:true});
    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        if(!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now(), sos: state.sosActive };
        
        if(state.isMaster && !record.game.started) {
            record.game = { started:true, start:Date.now(), duration:parseInt(document.getElementById("gameDuration").value)*60, score:{}, lastTick:Date.now() };
            state.teamsConfig.forEach(t => record.game.score[t.name] = 0);
            record.config = { teams: state.teamsConfig };
            let objs = [];
            document.querySelectorAll(".obj-slot").forEach(s => { if(s.querySelector(".s-active").checked) objs.push({name:s.querySelector(".s-name").value, lat:parseFloat(s.querySelector(".s-lat").value), lon:parseFloat(s.querySelector(".s-lon").value), owner:"LIBERO"}); });
            record.objectives = objs;
        }
        
        if(state.isMaster) { processLogic(record); await fetch(JSONBIN_URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)}); }
        updateUI(record);
    } catch(e){}
}

function processLogic(r) {
    r.objectives.forEach(obj => {
        const nearby = Object.values(r.players).filter(p => (Date.now()-p.last < 10000) && getDist(obj.lat, obj.lon, p.lat, p.lon) < 15);
        const teamsPresent = [...new Set(nearby.map(p => p.team))];
        if(teamsPresent.length === 1) {
            if(obj.owner !== teamsPresent[0]) {
                if(obj.teamConq !== teamsPresent[0]) { obj.start = Date.now(); obj.teamConq = teamsPresent[0]; }
                else if(Date.now() - obj.start > 180000) { obj.owner = teamsPresent[0]; obj.teamConq = null; }
            }
        } else { obj.teamConq = null; }
    });
    if(Date.now() - r.game.lastTick > 30000) { r.objectives.forEach(o => { if(o.owner !== "LIBERO") r.game.score[o.owner]++; }); r.game.lastTick = Date.now(); }
}

function updateUI(r) {
    const rem = r.game.duration - Math.floor((Date.now()-r.game.start)/1000);
    document.getElementById("timer").innerText = rem > 0 ? `${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,'0')}` : "FINE";
    
    const scoreBox = document.getElementById("score-container");
    scoreBox.innerHTML = r.config.teams.map(t => `<span style="color:${t.color}">${t.name}:${r.game.score[t.name]||0}</span>`).join(' | ');

    activeObjMarkers.forEach(m => map.removeLayer(m)); activeObjMarkers = [];
    r.objectives.forEach(obj => {
        const tCfg = r.config.teams.find(t => t.name === obj.owner);
        const col = tCfg ? tCfg.color : "#fff";
        activeObjMarkers.push(L.circle([obj.lat, obj.lon], {radius:15, color:col, fillOpacity:0.4}).addTo(map).bindTooltip(obj.name));
    });
}

function getDist(la1, lo1, la2, lo2) {
    const R = 6371e3; const dLat = (la2-la1)*Math.PI/180; const dLon = (lo2-lo1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function showLogin(role) { document.getElementById("role-selection").style.display="none"; document.getElementById("menu").style.display="block"; state.isMaster=(role==='MASTER'); document.getElementById("master-only-fields").style.display=state.isMaster?"block":"none"; document.getElementById("player-only-fields").style.display=state.isMaster?"none":"block"; }
function backToRoles() { document.getElementById("role-selection").style.display="flex"; document.getElementById("menu").style.display="none"; }
function toggleInstructions(s) { document.getElementById("modal-instructions").style.display=s?"block":"none"; }
async function spotEnemy(la,lo) { /* logica spot precedente */ }
async function resetBin() { if(confirm("RESET?")) { await fetch(JSONBIN_URL, {method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{started:false}, players:{}, objectives:[], config:{}})}); location.reload(); } }
function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

window.onload = () => { initSlotUI(); checkStatus(); };
