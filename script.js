const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let activeMarkers = [];
let allyMarkers = {}; 
let lastObjOwners = {};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep() {
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 800; g.gain.value = 0.1;
    o.start(); o.stop(audioCtx.currentTime + 0.2);
}

const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

function reloadMap() { map.eachLayer(l => { if(l instanceof L.TileLayer) l.redraw(); }); map.invalidateSize(); }
function centerMap() { if (state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

function handleOrientation(e) {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h) {
        document.getElementById("map-rotate-wrapper").style.transform = `rotate(${-h}deg)`;
        document.getElementById("compass-needle").style.transform = `rotate(${-h}deg)`;
    }
}

function updateTeamLabels() {
    document.getElementById("optTeam1").innerText = (document.getElementById("team1Name").value || "RED") + " (ROSSO)";
    document.getElementById("optTeam2").innerText = (document.getElementById("team2Name").value || "BLUE") + " (BLU)";
}

function initSlotUI() {
    const container = document.getElementById("objSlotContainer");
    const DEFAULTS = [{n:"PF1", la:45.238376, lo:8.810060}, {n:"PF2", la:45.237648, lo:8.810941}, {n:"PF3", la:45.238634, lo:8.808772}];
    container.innerHTML = "";
    for (let i = 0; i < 10; i++) {
        const d = DEFAULTS[i] || { n: `OBJ${i+1}`, la: 0, lo: 0 };
        container.innerHTML += `<div class="obj-slot">
            <input type="checkbox" class="s-active" ${i<3?'checked':''}>
            <input type="text" class="s-name" value="${d.n}">
            <input type="text" class="s-lat" value="${d.la}">
            <input type="text" class="s-lon" value="${d.lo}">
        </div>`;
    }
}

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;
    if(!state.playerName) return alert("INSERISCI NOME");
    if(audioCtx.state === 'suspended') audioCtx.resume();

    if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(r => { if(r==='granted') window.addEventListener('deviceorientation', handleOrientation); });
    } else { window.addEventListener('deviceorientation', handleOrientation); }

    document.getElementById("menu").style.display="none"; 
    document.getElementById("game-ui").style.display="block";
    map.invalidateSize();

    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        if(!state.playerMarker) state.playerMarker = L.marker([la,lo]).addTo(map).bindTooltip("IO", {permanent:true});
        else state.playerMarker.setLatLng([la,lo]);
    }, null, {enableHighAccuracy:true});

    setInterval(sync, 4000);
}

function processLogic(r) {
    if (!r.game.started) {
        r.game.started = true; r.game.start = Date.now(); r.game.score = {RED:0, BLUE:0};
        r.game.teamNames = { RED: document.getElementById("team1Name").value, BLUE: document.getElementById("team2Name").value };
        r.game.conquerTime = (parseInt(document.getElementById("conquerTime").value)||3) * 60000;
        r.objectives = [];
        document.querySelectorAll(".obj-slot").forEach(s => {
            if(s.querySelector(".s-active").checked) {
                r.objectives.push({ name: s.querySelector(".s-name").value, lat: parseFloat(s.querySelector(".s-lat").value), lon: parseFloat(s.querySelector(".s-lon").value), owner:"LIBERO", start:null, teamConquering:null });
            }
        });
    }
    r.objectives.forEach(obj => {
        const near = Object.values(r.players).filter(p => (Date.now()-p.last < 10000) && getDist(obj.lat, obj.lon, p.lat, p.lon) < 15);
        const teams = [...new Set(near.map(p => p.team))];
        if (teams.length === 1) {
            const t = teams[0];
            if (obj.owner !== t) {
                if (obj.teamConquering !== t) { obj.start = Date.now(); obj.teamConquering = t; }
                else if (Date.now() - obj.start > r.game.conquerTime) { obj.owner = t; obj.teamConquering = null; }
            }
        } else { obj.teamConquering = null; obj.start = null; }
    });
    if(Date.now() - r.game.lastTick > 30000) {
        r.objectives.forEach(o => { if(o.owner!=="LIBERO") r.game.score[o.owner]++; });
        r.game.lastTick = Date.now();
    }
}

async function sync() {
    if(!state.playerMarker) return;
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        
        const banner = document.getElementById("gameStatusBanner");
        if(record.game.started) { banner.innerText = "PARTITA IN CORSO"; banner.className = "status-banner status-active"; }
        else { banner.innerText = "SISTEMA PRONTO - ATTESA"; banner.className = "status-banner"; }
        
        if(!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now() };
        
        if(state.isMaster) {
            processLogic(record);
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e){}
}

function updateUI(r) {
    const elapsed = Math.floor((Date.now()-r.game.start)/1000);
    const total = (parseInt(document.getElementById("gameDuration").value)||30)*60;
    document.getElementById("timer").innerText = (total-elapsed)>0 ? `⏱️ ${Math.floor((total-elapsed)/60)}:${((total-elapsed)%60).toString().padStart(2,"0")}` : "FINE";
    
    const t1 = r.game.teamNames?.RED || "RED";
    const t2 = r.game.teamNames?.BLUE || "BLUE";
    document.getElementById("score").innerHTML = `🔴 ${t1}: ${r.game.score.RED} | 🔵 ${t2}: ${r.game.score.BLUE}`;
    
    const pList = document.getElementById("playerList"); pList.innerHTML = "";
    const rad = document.getElementById("radar"); rad.innerHTML = "";
    const myPos = state.playerMarker.getLatLng();

    Object.entries(r.players).forEach(([name, p]) => {
        if(Date.now() - p.last < 15000) {
            // MOSTRA SOLO COMPAGNI
            if(p.team === state.playerTeam) {
                pList.innerHTML += `<li><span>${name}</span> <span style="color:${p.team==='RED'?'red':'cyan'}">ONLINE</span></li>`;
                
                if(name !== state.playerName) {
                    if(!allyMarkers[name]) allyMarkers[name] = L.circleMarker([p.lat, p.lon], {radius:6, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map).bindTooltip(name, {permanent:true});
                    else allyMarkers[name].setLatLng([p.lat, p.lon]);

                    const d = getDist(myPos.lat, myPos.lng, p.lat, p.lon);
                    if(d < 100) {
                        const dot = document.createElement("div"); dot.className = "dot "+p.team;
                        dot.style.left = (50 + (p.lon-myPos.lng)*45000)+"px"; dot.style.top = (50 - (p.lat-myPos.lat)*45000)+"px";
                        rad.appendChild(dot);
                    }
                }
            } else {
                if(allyMarkers[name]) { map.removeLayer(allyMarkers[name]); delete allyMarkers[name]; }
            }
        } else {
            if(allyMarkers[name]) { map.removeLayer(allyMarkers[name]); delete allyMarkers[name]; }
        }
    });

    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    activeMarkers.forEach(m => map.removeLayer(m)); activeMarkers = [];
    r.objectives.forEach(obj => {
        if(lastObjOwners[obj.name] && lastObjOwners[obj.name] !== obj.owner) beep();
        lastObjOwners[obj.name] = obj.owner;
        let label = obj.owner === "LIBERO" ? "LIBERO" : (obj.owner === "RED" ? t1 : t2);
        if(obj.teamConquering) label = `CATTURA: ${obj.teamConquering==='RED'?t1:t2}`;
        sb.innerHTML += `<li>${obj.name}: <strong>${label}</strong></li>`;
        activeMarkers.push(L.circle([obj.lat, obj.lon], {radius:12, color: obj.owner==='RED'?'red':obj.owner==='BLUE'?'cyan':'white'}).addTo(map));
    });
}

function getDist(la1, lo1, la2, lo2) {
    const R = 6371e3; const dLat = (la2-la1)*Math.PI/180; const dLon = (lo2-lo1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function toggleMasterTools() { document.getElementById("masterTools").style.display = document.getElementById("isMaster").checked ? "block" : "none"; }
async function resetBin() { if(confirm("RESET SERVER?")) { await fetch(URL, {method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{started:false}, players:{}, objectives:[]})}); location.reload(); }}
window.onload = initSlotUI;
