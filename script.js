const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let activeMarkers = [];
let map;

// Carica mappa subito
function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map);
}

// Crea slot vuoti subito per evitare schermata bianca
function createEmptySlots() {
    const container = document.getElementById("objSlotContainer");
    container.innerHTML = "";
    for (let i = 0; i < 10; i++) {
        container.innerHTML += `
            <div class="obj-slot">
                <input type="checkbox" class="s-active">
                <input type="text" class="s-name" placeholder="NOME" style="width:60px">
                <input type="text" class="s-lat" placeholder="LAT" style="flex:1">
                <input type="text" class="s-lon" placeholder="LON" style="flex:1">
            </div>`;
    }
}

function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        loadConfigFromServer();
    }
}

async function loadConfigFromServer() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
        const { record } = await res.json();
        const slots = document.querySelectorAll(".obj-slot");
        if(record.objectives) {
            record.objectives.forEach((obj, i) => {
                if(slots[i]) {
                    slots[i].querySelector(".s-active").checked = true;
                    slots[i].querySelector(".s-name").value = obj.name;
                    slots[i].querySelector(".s-lat").value = obj.lat;
                    slots[i].querySelector(".s-lon").value = obj.lon;
                }
            });
        }
    } catch(e) { console.log("Server non pronto, uso slot vuoti"); }
}

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME");

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";

    setTimeout(() => {
        map.invalidateSize();
        navigator.geolocation.getCurrentPosition(p => {
            const pos = [p.coords.latitude, p.coords.longitude];
            map.setView(pos, 18);
            state.playerMarker = L.marker(pos).addTo(map).bindTooltip("IO", {permanent:true});
        }, null, {enableHighAccuracy:true});
    }, 500);

    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        
        if(state.playerMarker) {
            if(!record.players) record.players = {};
            record.players[state.playerName] = {
                team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now()
            };
        }

        if(state.isMaster && !record.game.started) {
            record.game.started = true;
            record.game.endTime = Date.now() + (parseInt(document.getElementById("gameDuration").value) * 60000);
            record.game.captureSec = parseInt(document.getElementById("captureTime").value);
            
            record.objectives = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                if(s.querySelector(".s-active").checked) {
                    record.objectives.push({
                        name: s.querySelector(".s-name").value,
                        lat: parseFloat(s.querySelector(".s-lat").value),
                        lon: parseFloat(s.querySelector(".s-lon").value),
                        owner: "LIBERO"
                    });
                }
            });
        }

        await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        updateUI(record);
    } catch(e) {}
}

function updateUI(r) {
    if(r.game.endTime) {
        const diff = r.game.endTime - Date.now();
        const m = Math.max(0, Math.floor(diff / 60000));
        const s = Math.max(0, Math.floor((diff % 60000) / 1000));
        document.getElementById("timer").innerText = `⏱️ ${m}:${s.toString().padStart(2,'0')}`;
    }

    activeMarkers.forEach(m => map.removeLayer(m)); activeMarkers = [];
    
    Object.entries(r.players || {}).forEach(([name, p]) => {
        if(Date.now() - p.last < 15000 && p.team === state.playerTeam && name !== state.playerName) {
            activeMarkers.push(L.circleMarker([p.lat, p.lon], {radius:6, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map));
        }
    });

    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    (r.objectives || []).forEach(obj => {
        sb.innerHTML += `<li>${obj.name}: ${obj.owner}</li>`;
        activeMarkers.push(L.circle([obj.lat, obj.lon], {radius:15, color: obj.owner==='RED'?'red':obj.owner==='BLUE'?'cyan':'white'}).addTo(map));
    });
}

async function resetBin() {
    if(!confirm("RESET?")) return;
    const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
    const { record } = await res.json();
    record.game.started = false; record.players = {}; record.game.endTime = null;
    await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
    location.reload();
}

function reloadMap() { map.invalidateSize(); }
function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

window.onload = () => { initMap(); createEmptySlots(); };
