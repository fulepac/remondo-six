const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// Stato iniziale robusto
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

let allyMarkers = {}, activeObjMarkers = [], enemyMarkers = {};

// 1. GESTIONE PULSANTI INIZIALI (Sempre attivi)
function showLogin(role) {
    document.getElementById("role-selection").style.display = "none";
    document.getElementById("menu").style.display = "block";
    
    state.isMaster = (role === 'MASTER');
    
    const loginTitle = document.getElementById("login-title");
    const masterFields = document.getElementById("master-only-fields");
    const playerFields = document.getElementById("player-only-fields");

    if (state.isMaster) {
        loginTitle.innerText = "COMANDO OPERAZIONE";
        masterFields.style.display = "block";
        playerFields.style.display = "none";
        document.getElementById("playerName").value = "HQ_COMMANDER";
    } else {
        loginTitle.innerText = "IDENTIFICAZIONE OPERATORE";
        masterFields.style.display = "none";
        playerFields.style.display = "block";
        document.getElementById("playerName").value = "";
    }
}

function backToRoles() {
    document.getElementById("role-selection").style.display = "flex";
    document.getElementById("menu").style.display = "none";
}

function toggleInstructions(show) {
    document.getElementById("modal-instructions").style.display = show ? "block" : "none";
}

// 2. CARICAMENTO DATI DAL SERVER
async function checkStatus() {
    const banner = document.getElementById("gameStatusBanner");
    const select = document.getElementById("teamSelect");

    // Popolamento preventivo per non bloccare la UI
    select.innerHTML = state.teamsConfig.map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { 
            headers: {"X-Master-Key": SECRET_KEY}, 
            cache: 'no-store' 
        });
        const data = await res.json();
        const record = data.record;

        if (record && record.game?.started) {
            banner.innerText = "⚠️ OPERAZIONE IN CORSO";
            banner.className = "status-banner status-active";
            if(record.config?.teams) {
                state.teamsConfig = record.config.teams;
                select.innerHTML = state.teamsConfig.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
            }
        } else {
            banner.innerText = "✅ SISTEMA PRONTO";
            banner.className = "status-banner";
        }
    } catch (e) {
        console.warn("Server non raggiungibile, uso config locale.");
        banner.innerText = "📡 MODALITÀ LOCALE (OFFLINE)";
    }
}

// 3. INIZIALIZZAZIONE MAPPA E GPS
const map = L.map("map", { zoomControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

const playerIcon = L.divIcon({
    className: 'player-direction-icon',
    html: `<div id="arrow">▲</div>`,
    iconSize: [30, 30]
});

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    if (!state.playerName) return alert("INSERISCI NOME");

    if (state.isMaster) {
        if (document.getElementById("masterPass").value !== "71325") return alert("CODICE ERRATO");
        const tSlots = document.querySelectorAll(".team-slot");
        state.teamsConfig = Array.from(tSlots).map(s => ({
            name: s.querySelector(".t-name").value.toUpperCase(),
            color: s.querySelector(".t-color").value
        }));
        state.playerTeam = state.teamsConfig[0].name;
    } else {
        state.playerTeam = document.getElementById("teamSelect").value;
    }

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    if(state.isMaster) document.getElementById("master-controls").style.display = "block";
    
    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        document.getElementById('myCoords').innerText = `${la.toFixed(5)}, ${lo.toFixed(5)}`;
        if(!state.playerMarker) {
            state.playerMarker = L.marker([la,lo], {icon: playerIcon}).addTo(map);
        } else {
            state.playerMarker.setLatLng([la,lo]);
        }
    }, null, {enableHighAccuracy:true});

    setInterval(sync, 4000);
}

// 4. SINCRONIZZAZIONE (Core Logic)
async function sync() {
    if(!state.playerMarker) return;
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const data = await res.json();
        const record = data.record;

        if(!record.players) record.players = {};
        record.players[state.playerName] = { 
            team: state.playerTeam, 
            lat: state.playerMarker.getLatLng().lat, 
            lon: state.playerMarker.getLatLng().lng, 
            last: Date.now(),
            sos: state.sosActive 
        };

        if(state.isMaster && !record.game.started) {
            record.game = { 
                started: true, 
                start: Date.now(), 
                duration: parseInt(document.getElementById("gameDuration").value)*60, 
                score: {}, 
                lastTick: Date.now() 
            };
            state.teamsConfig.forEach(t => record.game.score[t.name] = 0);
            record.config = { teams: state.teamsConfig };
            
            let objs = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                if(s.querySelector(".s-active").checked) {
                    objs.push({
                        name: s.querySelector(".s-name").value.toUpperCase(),
                        lat: parseFloat(s.querySelector(".s-lat").value),
                        lon: parseFloat(s.querySelector(".s-lon").value),
                        owner: "LIBERO",
                        teamConq: null,
                        start: null
                    });
                }
            });
            record.objectives = objs;
        }

        if(state.isMaster) {
            processLogic(record);
            await fetch(JSONBIN_URL, { 
                method:"PUT", 
                headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, 
                body: JSON.stringify(record)
            });
        }
        updateUI(record);
    } catch(e) { console.error("Sync Error", e); }
}

function processLogic(r) {
    const NOW = Date.now();
    r.objectives.forEach(obj => {
        const nearby = Object.values(r.players).filter(p => (NOW - p.last < 10000) && getDist(obj.lat, obj.lon, p.lat, p.lon) < 15);
        const teamsPresent = [...new Set(nearby.map(p => p.team))];
        
        if(teamsPresent.length === 1) {
            const team = teamsPresent[0];
            if(obj.owner !== team) {
                if(obj.teamConq !== team) {
                    obj.start = NOW;
                    obj.teamConq = team;
                } else if(NOW - obj.start > 180000) { // 3 MINUTI
                    obj.owner = team;
                    obj.teamConq = null;
                }
            }
        } else {
            obj.teamConq = null;
            obj.start = null;
        }
    });

    if(NOW - r.game.lastTick > 30000) {
        r.objectives.forEach(o => { if(o.owner !== "LIBERO") r.game.score[o.owner]++; });
        r.game.lastTick = NOW;
    }
}

function updateUI(r) {
    if(!r.game?.started) return;
    
    // Timer
    const rem = r.game.duration - Math.floor((Date.now()-r.game.start)/1000);
    document.getElementById("timer").innerText = rem > 0 ? `${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,'0')}` : "FINE GARA";
    
    // Punteggi
    const scoreBox = document.getElementById("score-container");
    if(r.config?.teams) {
        scoreBox.innerHTML = r.config.teams.map(t => 
            `<span style="color:${t.color}">${t.name}: ${r.game.score[t.name] || 0}</span>`
        ).join(' | ');
    }

    // Marker Obiettivi
    activeObjMarkers.forEach(m => map.removeLayer(m));
    activeObjMarkers = [];
    r.objectives.forEach(obj => {
        const teamData = r.config.teams.find(t => t.name === obj.owner);
        const color = teamData ? teamData.color : "#ffffff";
        const marker = L.circle([obj.lat, obj.lon], {
            radius: 15, 
            color: color, 
            fillOpacity: obj.teamConq ? 0.8 : 0.3,
            weight: 2
        }).addTo(map).bindTooltip(obj.name + (obj.teamConq ? " (SOTTO ATTACCO)" : ""));
        activeObjMarkers.push(marker);
    });

    // Operatori Alleati
    Object.entries(r.players).forEach(([name, p]) => {
        if(Date.now() - p.last > 20000) {
            if(allyMarkers[name]) { map.removeLayer(allyMarkers[name]); delete allyMarkers[name]; }
            return;
        }
        if(p.team === state.playerTeam && name !== state.playerName) {
            const teamColor = r.config.teams.find(t => t.name === p.team)?.color || "#00ff41";
            if(!allyMarkers[name]) {
                allyMarkers[name] = L.circleMarker([p.lat, p.lon], {radius: 6, color: teamColor}).addTo(map).bindTooltip(name);
            } else {
                allyMarkers[name].setLatLng([p.lat, p.lon]);
            }
        }
    });
}

function getDist(la1, lo1, la2, lo2) {
    const R = 6371000;
    const dLat = (la2-la1)*Math.PI/180;
    const dLon = (lo2-lo1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

async function resetBin() {
    if(confirm("VUOI AZZERARE TUTTI I DATI?")) {
        const cleanState = {
            game: { started: false, start: 0, duration: 1800, score: {}, lastTick: 0 },
            players: {},
            objectives: [],
            config: { teams: state.teamsConfig }
        };
        await fetch(
