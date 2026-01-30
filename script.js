const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null, currentHeading: 0, targetObj: null, navLine: null, autoCenter: true, gameMode: "DOMINATION" };
let activeMarkers = [];
let map;

function initMap() {
    // Comandi Standard Leaflet
    map = L.map("map", { 
        zoomControl: true, attributionControl: false, dragging: true, touchZoom: true, worldCopyJump: false
    }).setView([45.2377, 8.8097], 18);
    
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map);

    map.on('dragstart', () => { state.autoCenter = false; });
}

function setGameMode(mode) {
    state.gameMode = mode;
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    document.getElementById(mode === 'DOMINATION' ? 'btnDomination' : 'btnRecon').classList.add("active");
    document.getElementById("rowDuration").style.opacity = mode === 'RECON' ? "0.3" : "1";
}

function enableSensorsAndStart() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(res => { 
            if (res === 'granted') { window.addEventListener('deviceorientation', handleRotation, true); startGame(); } 
        }).catch(console.error);
    } else {
        window.addEventListener('deviceorientation', handleRotation, true);
        startGame();
    }
}

function handleRotation(e) {
    let compass = e.webkitCompassHeading || (360 - e.alpha);
    if (compass) {
        state.currentHeading = compass;
        document.getElementById("map-rotate").style.transform = `rotate(${-compass}deg)`;
        if (state.targetObj) updateNavigationDisplay();
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
        if(record.game) {
            document.getElementById("teamRedName").value = record.game.teamRedName || "TEAM ROSSO";
            document.getElementById("teamBlueName").value = record.game.teamBlueName || "TEAM BLU";
            if(record.game.mode) setGameMode(record.game.mode);
        }
        const container = document.getElementById("objSlotContainer");
        container.innerHTML = "";
        for (let i = 0; i < 10; i++) {
            const o = (record.objectives && record.objectives[i]) ? record.objectives[i] : { name: `OBJ${i+1}`, lat: 0, lon: 0 };
            container.innerHTML += `<div class="obj-slot">
                <input type="checkbox" class="s-active" ${record.objectives && record.objectives[i] ? 'checked' : ''}>
                <input type="text" class="s-name" value="${o.name}">
                <input type="text" class="s-lat" value="${o.lat}">
                <input type="text" class="s-lon" value="${o.lon}">
            </div>`;
        }
    } catch(e) {}
}

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME");
    document.getElementById("menu").style.display = "none";
    document.getElementById("app-header").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    
    setTimeout(() => {
        map.invalidateSize();
        navigator.geolocation.watchPosition(p => {
            const pos = [p.coords.latitude, p.coords.longitude];
            if(!state.playerMarker) {
                state.playerMarker = L.circleMarker(pos, {radius: 6, color: '#fff', fillOpacity: 1, weight: 2, zIndexOffset: 1000}).addTo(map);
                map.setView(pos, 18);
            } else { 
                state.playerMarker.setLatLng(pos); 
                if (state.autoCenter) map.setView(pos, map.getZoom());
                if (state.targetObj) updateNavigationDisplay();
            }
        }, null, {enableHighAccuracy:true});
    }, 500);
    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        if(!record.game) record.game = {};
        
        if(state.playerMarker) {
            if(!record.players) record.players = {};
            record.players[state.playerName] = { team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now() };
        }
        
        if(state.isMaster) {
            record.game.mode = state.gameMode;
            record.game.teamRedName = document.getElementById("teamRedName").value.toUpperCase();
            record.game.teamBlueName = document.getElementById("teamBlueName").value.toUpperCase();
            if(!record.game.started) {
                record.game.started = true;
                record.game.endTime = state.gameMode === 'RECON' ? null : (Date.now() + (parseInt(document.getElementById("gameDuration").value) * 60000));
                record.objectives = [];
                document.querySelectorAll(".obj-slot").forEach(s => {
                    if(s.querySelector(".s-active").checked) {
                        record.objectives.push({ name: s.querySelector(".s-name").value, lat: parseFloat(s.querySelector(".s-lat").value), lon: parseFloat(s.querySelector(".s-lon").value), owner: "LIBERO" });
                    }
                });
            }
        }
        await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        updateUI(record);
    } catch(e) {}
}

function updateUI(r) {
    const isRecon = r.game.mode === 'RECON';
    document.getElementById("gameTopBar").style.display = isRecon ? "none" : "flex";

    if(!isRecon && r.game.endTime) {
        const diff = r.game.endTime - Date.now();
        const m = Math.max(0, Math.floor(diff / 60000));
        const s = Math.max(0, Math.floor((diff % 60000) / 1000));
        document.getElementById("timer").innerText = `⏱️ ${m}:${s.toString().padStart(2,'0')}`;
    }

    let rScore = 0, bScore = 0;
    const rLab = r.game.teamRedName || "TEAM ROSSO", bLab = r.game.teamBlueName || "TEAM BLU";

    activeMarkers.forEach(m => map.removeLayer(m)); activeMarkers = [];

    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    (r.objectives || []).forEach(obj => {
        if(obj.owner === 'RED') rScore++; if(obj.owner === 'BLUE') bScore++;
        const li = document.createElement("li");
        li.innerHTML = `${obj.name} <span>${obj.owner === 'RED' ? rLab : obj.owner === 'BLUE' ? bLab : 'LIBERO'}</span>`;
        li.onclick = () => startNavigation(obj);
        sb.appendChild(li);
        let color = obj.owner === 'RED' ? 'red' : obj.owner === 'BLUE' ? 'cyan' : 'white';
        let m = L.circle([obj.lat, obj.lon], {radius: 15, color: color, weight: 3}).addTo(map).bindTooltip(obj.name, {permanent:true, direction:'top'});
        m.on('click', () => startNavigation(obj));
        activeMarkers.push(m);
    });

    if(!isRecon) {
        document.getElementById("scoreRed").innerText = rScore;
        document.getElementById("scoreBlue").innerText = bScore;
    }

    const pList = document.getElementById("playerList"); pList.innerHTML = "";
    Object.entries(r.players || {}).forEach(([name, p]) => {
        if(Date.now() - p.last < 15000 && p.team === state.playerTeam) {
            pList.innerHTML += `<li>${name} <span>OK</span></li>`;
            if(name !== state.playerName) activeMarkers.push(L.circleMarker([p.lat, p.lon], {radius: 6, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map));
        }
    });
}

function startNavigation(obj) {
    state.targetObj = obj;
    document.getElementById("nav-panel").style.display = "block";
    updateNavigationDisplay();
}

function stopNavigation() {
    state.targetObj = null;
    if(state.navLine) { map.removeLayer(state.navLine); state.navLine = null; }
    document.getElementById("nav-panel").style.display = "none";
}

function updateNavigationDisplay() {
    if(!state.targetObj || !state.playerMarker) return;
    const pPos = state.playerMarker.getLatLng(), tPos = L.latLng(state.targetObj.lat, state.targetObj.lon);
    if(state.navLine) map.removeLayer(state.navLine);
    state.navLine = L.polyline([pPos, tPos], { color: 'white', weight: 5, dashArray: '10, 10', className: 'nav-line-style', zIndex: 1000 }).addTo(map);
    const dist = pPos.distanceTo(tPos).toFixed(0), bearing = calculateBearing(pPos.lat, pPos.lng, tPos.lat, tPos.lon);
    let rel = (bearing - state.currentHeading + 360) % 360;
    document.getElementById("nav-info").innerText = `${state.targetObj.name}: ${dist}m ${getArrow(rel)}`;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    lat1 *= Math.PI / 180; lon1 *= Math.PI / 180; lat2 *= Math.PI / 180; lon2 *= Math.PI / 180;
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function getArrow(rel) {
    if(rel > 337.5 || rel <= 22.5) return "⬆️"; if(rel > 22.5 && rel <= 67.5) return "↗️";
    if(rel > 67.5 && rel <= 112.5) return "➡️"; if(rel > 112.5 && rel <= 157.5) return "↘️";
    if(rel > 157.5 && rel <= 202.5) return "⬇️"; if(rel > 202.5 && rel <= 247.5) return "↙️";
    if(rel > 247.5 && rel <= 292.5) return "⬅️"; return "↖️";
}

function exitGame() { location.reload(); }

async function resetBin() {
    if(!confirm("RESET?")) return;
    const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
    const { record } = await res.json();
    record.game.started = false; record.players = {}; record.game.endTime = null;
    await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
    location.reload();
}

function centerMap() { if(state.playerMarker) { state.autoCenter = true; map.setView(state.playerMarker.getLatLng(), map.getZoom()); } }
function reloadMap() { map.invalidateSize(); }
window.onload = initMap;
