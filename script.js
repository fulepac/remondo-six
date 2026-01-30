const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

// CONFIGURAZIONE AREA MAPPA (Vigevano Default)
const mapBounds = [
    [45.2350, 8.8060], 
    [45.2410, 8.8140]  
];

const DEFAULT_OBJS = [
    { name: "ALFA", lat: 45.2377, lon: 8.8097, owner: "LIBERO", pRed: 0, pBlue: 0 },
    { name: "BRAVO", lat: 45.2385, lon: 8.8105, owner: "LIBERO", pRed: 0, pBlue: 0 },
    { name: "CHARLIE", lat: 45.2369, lon: 8.8115, owner: "LIBERO", pRed: 0, pBlue: 0 },
    { name: "DELTA", lat: 45.2392, lon: 8.8085, owner: "LIBERO", pRed: 0, pBlue: 0 },
    { name: "ECHO", lat: 45.2360, lon: 8.8075, owner: "LIBERO", pRed: 0, pBlue: 0 }
];

let state = { 
    isMaster: false, 
    playerName: "", 
    playerTeam: "", 
    playerMarker: null, 
    autoCenter: true, 
    selectedMode: "DOMINATION", 
    targetObj: null, 
    navLine: null 
};

let activeMarkers = [];
let map;

window.onload = () => {
    initMap();
    const saved = localStorage.getItem("six_app_session");
    if (saved) {
        const data = JSON.parse(saved);
        document.getElementById("playerName").value = data.name || "";
        document.getElementById("teamSelect").value = data.team || "RED";
    }
};

function initMap() {
    map = L.map("map", { 
        zoomControl: false, 
        attributionControl: false, 
        maxBounds: mapBounds,
        maxBoundsViscosity: 1.0 
    }).setView([45.2377, 8.8097], 18);

    // Overlay Immagine per Offline
    L.imageOverlay('mappa.jpg', mapBounds, { opacity: 1.0 }).addTo(map);

    // Tile Google Satellite per Online
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { 
        subdomains:['mt0','mt1','mt2','mt3'], 
        maxZoom: 21 
    }).addTo(map);

    map.on('dragstart', () => { state.autoCenter = false; });
}

function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        document.getElementById("playerStartBtn").style.display = "none";
        loadConfigFromServer();
    }
}

function selectGameMode(m) {
    state.selectedMode = m;
    document.getElementById("btnDomination").className = (m === 'DOMINATION') ? "mode-btn active" : "mode-btn";
    document.getElementById("btnRecon").className = (m === 'RECON') ? "mode-btn active" : "mode-btn";
}

async function loadConfigFromServer() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
        const { record } = await res.json();
        const container = document.getElementById("objSlotContainer");
        container.innerHTML = "";
        
        const currentObjs = (record.objectives && record.objectives.length > 0) ? record.objectives : DEFAULT_OBJS;
        
        for (let i = 0; i < 10; i++) {
            let o = currentObjs[i] || { name: `OBJ${i+1}`, lat: "", lon: "" };
            container.innerHTML += `
                <div class="obj-slot">
                    <input type="checkbox" class="s-active" ${o.lat ? 'checked' : ''}>
                    <input type="text" class="s-name" value="${o.name}" style="width:60px">
                    <input type="text" class="s-lat" value="${o.lat}" placeholder="Lat">
                    <input type="text" class="s-lon" value="${o.lon}" placeholder="Lon">
                </div>`;
        }
    } catch(e) { console.log("Errore caricamento config"); }
}

function handleRotation(e) {
    let compass = e.webkitCompassHeading || (360 - e.alpha);
    if(compass) {
        document.getElementById("map-rotate").style.transform = `rotate(${-compass}deg)`;
    }
}

function enableSensorsAndStart(isMasterAction) {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERIRE NOME OPERATORE");

    localStorage.setItem("six_app_session", JSON.stringify({name: state.playerName, team: state.playerTeam}));

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(res => {
            if(res === 'granted') window.addEventListener('deviceorientation', handleRotation);
            isMasterAction ? saveAndStart() : startGame();
        }).catch(() => { isMasterAction ? saveAndStart() : startGame(); });
    } else {
        window.addEventListener('deviceorientation', handleRotation);
        isMasterAction ? saveAndStart() : startGame();
    }
}

async function saveAndStart() {
    await sync(true);
    startGame();
}

async function startGame() {
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("main-header").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    map.invalidateSize();

    navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if(!state.playerMarker) {
            state.playerMarker = L.circleMarker(pos, {radius: 8, color: '#fff', fillOpacity: 1, weight: 3}).addTo(map);
            map.setView(pos, 18);
        } else {
            state.playerMarker.setLatLng(pos);
            if(state.autoCenter) map.panTo(pos);
        }
        updateNavigationLine();
    }, null, {enableHighAccuracy:true});

    setInterval(() => sync(false), 4000);
}

async function sync(forceMaster) {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        let { record } = await res.json();
        
        if(!record.players) record.players = {};
        record.players[state.playerName] = { 
            team: state.playerTeam, 
            lat: state.playerMarker ? state.playerMarker.getLatLng().lat : 0, 
            lon: state.playerMarker ? state.playerMarker.getLatLng().lng : 0, 
            last: Date.now() 
        };

        if(state.isMaster || forceMaster) {
            record.game = { 
                mode: state.selectedMode, 
                scoreRed: record.game?.scoreRed || 0, 
                scoreBlue: record.game?.scoreBlue || 0 
            };
            let newObjs = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                if(s.querySelector(".s-active").checked) {
                    newObjs.push({
                        name: s.querySelector(".s-name").value,
                        lat: parseFloat(s.querySelector(".s-lat").value),
                        lon: parseFloat(s.querySelector(".s-lon").value),
                        owner: "LIBERO"
                    });
                }
            });
            record.objectives = newObjs;
        }

        await fetch(URL, { 
            method:"PUT", 
            headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, 
            body: JSON.stringify(record)
        });
        updateUI(record);
    } catch(e) { console.log("Sync Error"); }
}

function updateUI(r) {
    activeMarkers.forEach(m => map.removeLayer(m));
    activeMarkers = [];
    
    // Gestione Classifica Domination
    const scorePanel = document.getElementById("score-panel");
    if(r.game?.mode === 'DOMINATION') {
        scorePanel.style.display = 'flex';
        document.getElementById("scoreRed").innerText = r.game.scoreRed || 0;
        document.getElementById("scoreBlue").innerText = r.game.scoreBlue || 0;
    } else {
        scorePanel.style.display = 'none';
    }

    // Lista Obiettivi
    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    (r.objectives || []).forEach(obj => {
        const li = document.createElement("li");
        li.innerHTML = `<b>${obj.name}</b> <span class="owner-${obj.owner}">${obj.owner}</span>`;
        li.onclick = () => startNavigation(obj);
        sb.appendChild(li);

        let color = obj.owner === 'RED' ? 'red' : obj.owner === 'BLUE' ? 'cyan' : 'white';
        let m = L.circle([obj.lat, obj.lon], {radius: 15, color: color, weight: 3}).addTo(map);
        m.bindTooltip(obj.name, {permanent:true, direction:'top', className:'obj-label'});
        activeMarkers.push(m);
    });

    // Lista Squadra
    const pList = document.getElementById("playerList");
    pList.innerHTML = "";
    Object.entries(r.players || {}).forEach(([name, p]) => {
        if(Date.now() - p.last < 30000 && p.team === state.playerTeam && name !== state.playerName) {
            pList.innerHTML += `<li>${name} <span>${getDist(p.lat, p.lon)}m</span></li>`;
            let tm = L.circleMarker([p.lat, p.lon], {radius: 6, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map);
            activeMarkers.push(tm);
        }
    });
}

function startNavigation(obj) {
    state.targetObj = obj;
    document.getElementById("nav-overlay").style.display = "block";
    updateNavigationLine();
}

function stopNavigation() {
    state.targetObj = null;
    if(state.navLine) map.removeLayer(state.navLine);
    state.navLine = null;
    document.getElementById("nav-overlay").style.display = "none";
}

function updateNavigationLine() {
    if(!state.targetObj || !state.playerMarker) return;
    const p1 = state.playerMarker.getLatLng();
    const p2 = [state.targetObj.lat, state.targetObj.lon];
    const d = getDist(p2[0], p2[1]);
    document.getElementById("nav-text").innerText = `${state.targetObj.name}: ${d}m`;
    if(state.navLine) map.removeLayer(state.navLine);
    state.navLine = L.polyline([p1, p2], {color: 'yellow', weight: 4, dashArray: '10, 15', opacity: 0.8}).addTo(map);
}

function getDist(lat2, lon2) {
    if(!state.playerMarker) return "?";
    const p1 = state.playerMarker.getLatLng();
    const R = 6371000;
    const dLat = (lat2 - p1.lat) * Math.PI / 180;
    const dLon = (lon2 - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(p1.lat * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function centerMap() { state.autoCenter = true; if(state.playerMarker) map.panTo(state.playerMarker.getLatLng()); }
function exitGame() { if(confirm("ESCI DALL'OPERAZIONE?")) location.reload(); }
async function resetBin() {
    if(confirm("RESET TOTALE SERVER?")) {
        await fetch(URL, { 
            method:"PUT", 
            headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, 
            body: JSON.stringify({game:{mode:"DOMINATION",scoreRed:0,scoreBlue:0},players:{},objectives:DEFAULT_OBJS})
        });
        location.reload();
    }
}
