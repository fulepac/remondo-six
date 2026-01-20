const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let otherMarkers = {}; 
let customObjectives = []; 
let activeObjMarkers = [];

const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// 1. CONTROLLO STATO PARTITA
async function checkGameStatus() {
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: { "X-Master-Key": SECRET_KEY }, cache: 'no-store' });
        const { record } = await res.json();
        const banner = document.getElementById("gameStatusBanner");
        if (record.game && record.game.started) {
            banner.innerText = "⚠️ PARTITA IN CORSO";
            banner.className = "status-banner status-active";
        } else {
            banner.innerText = "✅ CAMPO DISPONIBILE";
            banner.className = "status-banner status-waiting";
        }
    } catch (e) { console.error("Errore server"); }
}
checkGameStatus();
setInterval(checkGameStatus, 15000);

function toggleMasterTools() {
    document.getElementById("masterTools").style.display = document.getElementById("isMaster").checked ? "block" : "none";
}

// 2. CREAZIONE OBIETTIVI PERSONALIZZATI
function addCustomObjective() {
    const name = document.getElementById("newObjName").value.trim().toUpperCase();
    const lat = parseFloat(document.getElementById("newObjLat").value);
    const lon = parseFloat(document.getElementById("newObjLon").value);

    if (name && !isNaN(lat) && !isNaN(lon)) {
        customObjectives.push({ name, lat, lon });
        const li = document.createElement("li");
        li.innerText = `📍 ${name} [${lat.toFixed(4)}, ${lon.toFixed(4)}]`;
        document.getElementById("customObjList").appendChild(li);
        document.getElementById("newObjName").value = "";
        document.getElementById("newObjLat").value = "";
        document.getElementById("newObjLon").value = "";
    } else { alert("Dati non validi!"); }
}

function getDist(la1, lo1, la2, lo2) {
    const R = 6371e3;
    const dLat = (la2 - la1) * Math.PI / 180;
    const dLon = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function centerMap() { if (state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

// 3. START GAME
async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;

    if (!state.playerName) return alert("INSERISCI NOME");
    if (state.isMaster && document.getElementById("masterPass").value !== "71325") return alert("PASS ERRATA");

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    if (state.isMaster) document.getElementById("master-controls").style.display = "block";

    navigator.geolocation.watchPosition(p => {
        const { latitude: lat, longitude: lon } = p.coords;
        if (!state.playerMarker) {
            state.playerMarker = L.marker([lat, lon]).addTo(map).bindTooltip("TU ("+state.playerName+")", {permanent: true});
            map.setView([lat, lon], 18);
        } else state.playerMarker.setLatLng([lat, lon]);
    }, null, { enableHighAccuracy: true });

    setInterval(sync, 4000);
}

async function sync() {
    if (!state.playerMarker) return;
    const pos = state.playerMarker.getLatLng();

    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: { "X-Master-Key": SECRET_KEY }, cache: 'no-store' });
        const { record } = await res.json();

        if(!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: pos.lat, lon: pos.lng, last: Date.now() };

        if (state.isMaster) {
            processLogic(record);
            await fetch(JSONBIN_URL, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY },
                body: JSON.stringify(record)
            });
        }
        updateUI(record);
    } catch (e) { console.error("Sync Error"); }
}

function processLogic(r) {
    if (!r.game.started) {
        r.game.started = true;
        r.game.start = Date.now();
        r.game.duration = (parseInt(document.getElementById("gameDuration").value) || 30) * 60;
        r.game.score = { RED: 0, BLUE: 0 };
        r.game.lastTick = Date.now();
        
        const baseObjs = [{name:"PF1", lat:45.238376, lon:8.810060}, {name:"PF2", lat:45.237648, lon:8.810941}];
        const finalObjs = customObjectives.length > 0 ? customObjectives : baseObjs;
        r.objectives = finalObjs.map(o => ({ ...o, owner: "LIBERO", start: null, teamConquering: null }));
    }
    
    r.objectives.forEach((obj) => {
        const inside = Object.values(r.players).filter(p => (Date.now() - p.last < 10000) && getDist(obj.lat, obj.lon, p.lat, p.lon) < 15);
        const teams = [...new Set(inside.map(p => p.team))];
        if (teams.length === 1) {
            if (obj.owner !== teams[0]) {
                if (obj.teamConquering !== teams[0]) { obj.start = Date.now(); obj.teamConquering = teams[0]; }
                if (Date.now() - obj.start > 60000) { obj.owner = teams[0]; obj.teamConquering = null; }
            }
        } else { obj.start = null; obj.teamConquering = null; }
    });

    if (Date.now() - r.game.lastTick > 30000) {
        r.objectives.forEach(o => { if (o.owner !== "LIBERO") r.game.score[o.owner]++; });
        r.game.lastTick = Date.now();
    }
}

function updateUI(r) {
    if (!r.game || !r.game.score) return;
    
    const rem = r.game.duration - Math.floor((Date.now() - r.game.start) / 1000);
    document.getElementById("timer").innerText = rem > 0 ? `⏱️ ${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,"0")}` : "FINE";
    document.getElementById("score").innerHTML = `<span style="color:red">ROSSI: ${r.game.score.RED}</span> | <span style="color:cyan">BLU: ${r.game.score.BLUE}</span>`;
    
    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    activeObjMarkers.forEach(m => map.removeLayer(m)); activeObjMarkers = [];

    r.objectives.forEach((obj) => {
        const col = obj.owner === "RED" ? "red" : obj.owner === "BLUE" ? "#00ffff" : "white";
        sb.innerHTML += `<li style="border-left: 5px solid ${col}">${obj.name}: ${obj.teamConquering ? "CONQUISTA "+obj.teamConquering : obj.owner}</li>`;
        const m = L.circle([obj.lat, obj.lon], { radius: 10, color: col, fillOpacity: 0.3 }).addTo(map);
        activeObjMarkers.push(m);
    });

    const opList = document.getElementById("operators"); opList.innerHTML = "";
    const rad = document.getElementById("radar"); rad.querySelectorAll(".dot").forEach(d => d.remove());
    const myPos = state.playerMarker.getLatLng();

    Object.entries(r.players).forEach(([name, p]) => {
        if (Date.now() - p.last > 20000) {
            if (otherMarkers[name]) { map.removeLayer(otherMarkers[name]); delete otherMarkers[name]; }
            return;
        }
        const col = p.team === "RED" ? "red" : "#00ffff";
        opList.innerHTML += `<li><span style="color:${col}">●</span> ${name}</li>`;

        if (name !== state.playerName) {
            if (!otherMarkers[name]) {
                otherMarkers[name] = L.circleMarker([p.lat, p.lon], { radius: 6, fillColor: col, color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map).bindTooltip(name);
            } else otherMarkers[name].setLatLng([p.lat, p.lon]);
            
            const d = getDist(myPos.lat, myPos.lng, p.lat, p.lon);
            if (d < 100) {
                const dot = document.createElement("div"); dot.className = "dot " + p.team;
                // Offset radar basato su coordinate relative
                const x = 70 + (p.lon - myPos.lng) * 20000;
                const y = 70 - (p.lat - myPos.lat) * 20000;
                dot.style.left = Math.max(5, Math.min(135, x)) + "px";
                dot.style.top = Math.max(5, Math.min(135, y)) + "px";
                rad.appendChild(dot);
            }
        }
    });
}

async function resetBin() {
    if (!confirm("RESETTA TUTTO?")) return;
    await fetch(JSONBIN_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY },
        body: JSON.stringify({ game: { started: false }, players: {}, objectives: [] })
    });
    location.reload();
}
