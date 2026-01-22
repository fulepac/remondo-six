const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { 
    isMaster: false, 
    playerName: "", 
    playerTeam: "", 
    playerMarker: null, 
    sosActive: false, 
    teamsConfig: [
        {name: "RED", color: "#ff0000"},
        {name: "BLUE", color: "#00ffff"},
        {name: "GREEN", color: "#00ff00"},
        {name: "GOLD", color: "#ffaa00"}
    ] 
};

let activeObjMarkers = [], enemyMarkers = {};

// --- INIZIALIZZAZIONE UI ---
window.onload = () => {
    initSlotUI();
    checkStatus();
};

function showLogin(role) {
    document.getElementById("role-selection").style.display = "none";
    document.getElementById("menu").style.display = "block";
    state.isMaster = (role === 'MASTER');
    document.getElementById("master-only-fields").style.display = state.isMaster ? "block" : "none";
    document.getElementById("player-only-fields").style.display = state.isMaster ? "none" : "block";
    if(state.isMaster) document.getElementById("playerName").value = "HQ_COMMANDER";
}

function backToRoles() {
    document.getElementById("role-selection").style.display = "flex";
    document.getElementById("menu").style.display = "none";
}

function toggleInstructions(s) {
    document.getElementById("modal-instructions").style.display = s ? "block" : "none";
}

// --- LOGICA SERVER ---
async function checkStatus() {
    const sel = document.getElementById("teamSelect");
    sel.innerHTML = state.teamsConfig.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: {"X-Master-Key": SECRET_KEY} });
        const data = await res.json();
        if(data.record && data.record.game?.started) {
            document.getElementById("gameStatusBanner").innerText = "⚠️ OPERAZIONE IN CORSO";
            document.getElementById("gameStatusBanner").className = "status-banner status-active";
        }
    } catch(e) { document.getElementById("gameStatusBanner").innerText = "SISTEMA OFFLINE"; }
}

// --- LOGICA MAPPA E GIOCO ---
const map = L.map("map", { zoomControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    if(!state.playerName) return alert("INSERISCI NOME");
    
    if(state.isMaster) {
        if(document.getElementById("masterPass").value !== "71325") return alert("CODICE ERRATO");
        const slots = document.querySelectorAll(".team-slot");
        state.teamsConfig = Array.from(slots).map(s => ({
            name: s.querySelector(".t-name").value.toUpperCase(),
            color: s.querySelector(".t-color").value
        }));
        state.playerTeam = state.teamsConfig[0].name;
    } else {
        state.playerTeam = document.getElementById("teamSelect").value;
    }

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    
    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        document.getElementById('myCoords').innerText = `${la.toFixed(5)}, ${lo.toFixed(5)}`;
        if(!state.playerMarker) state.playerMarker = L.marker([la,lo]).addTo(map);
        else state.playerMarker.setLatLng([la,lo]);
    }, null, {enableHighAccuracy:true});

    setInterval(sync, 4000);
}

async function sync() {
    if(!state.playerMarker) return;
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const data = await res.json();
        let r = data.record;

        if(!r.players) r.players = {};
        r.players[state.playerName] = { 
            team: state.playerTeam, 
            lat: state.playerMarker.getLatLng().lat, 
            lon: state.playerMarker.getLatLng().lng, 
            last: Date.now(), sos: state.sosActive 
        };

        if(state.isMaster && !r.game.started) {
            r.game = { started: true, start: Date.now(), duration: parseInt(document.getElementById("gameDuration").value)*60, score: {}, lastTick: Date.now() };
            state.teamsConfig.forEach(t => r.game.score[t.name] = 0);
            r.config = { teams: state.teamsConfig };
            let objs = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                if(s.querySelector(".s-active").checked) {
                    objs.push({ name: s.querySelector(".s-name").value, lat: parseFloat(s.querySelector(".s-lat").value), lon: parseFloat(s.querySelector(".s-lon").value), owner: "LIBERO" });
                }
            });
            r.objectives = objs;
        }

        if(state.isMaster) {
            // Logica cattura e punti (semplificata per stabilità)
            await fetch(JSONBIN_URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(r)});
        }
        updateUI(r);
    } catch(e){}
}

function updateUI(r) {
    if(!r.game?.started) return;
    const scoreBox = document.getElementById("score-container");
    scoreBox.innerHTML = r.config.teams.map(t => `<span style="color:${t.color}">${t.name}: ${r.game.score[t.name]||0}</span>`).join(' | ');
}

function initSlotUI() {
    const container = document.getElementById("objSlotContainer");
    for (let i=0; i<5; i++) {
        container.innerHTML += `<div class="obj-slot"><input type="checkbox" class="s-active" checked><input type="text" class="s-name" value="SETTORE ${i+1}" style="width:70px"><input type="number" class="s-lat" value="0" style="width:80px"></div>`;
    }
}

function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }
function triggerSOS() { state.sosActive = !state.sosActive; document.getElementById("sosBtn").classList.toggle("active"); }
