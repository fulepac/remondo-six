const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

const mapBounds = [[45.2350, 8.8060], [45.2410, 8.8140]];
const DEFAULT_OBJS = [
    { name: "ALFA", lat: 45.2377, lon: 8.8097, owner: "LIBERO" },
    { name: "BRAVO", lat: 45.2385, lon: 8.8105, owner: "LIBERO" },
    { name: "CHARLIE", lat: 45.2369, lon: 8.8115, owner: "LIBERO" },
    { name: "DELTA", lat: 45.2392, lon: 8.8085, owner: "LIBERO" },
    { name: "ECHO", lat: 45.2360, lon: 8.8075, owner: "LIBERO" }
];

let state = { 
    isMaster: false, playerName: "", playerTeam: "", playerMarker: null, 
    autoCenter: true, selectedMode: "DOMINATION", targetObj: null, navLine: null, 
    startTime: null, currentHeading: 0 
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
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.imageOverlay('mappa.jpg', mapBounds).addTo(map);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'], maxZoom: 21 }).addTo(map);
    
    // Se l'utente tocca la mappa, disattiva l'auto-centramento per permettere il controllo manuale
    map.on('dragstart', () => { state.autoCenter = false; });
}

function handleRotation(e) {
    if (!state.autoCenter) return; // Non ruotare se l'utente sta navigando manualmente
    let compass = e.webkitCompassHeading || (360 - e.alpha);
    if (compass) {
        state.currentHeading = compass;
        document.getElementById("map-rotate").style.transform = `rotate(${-compass}deg)`;
    }
}

function enableSensorsAndStart(isMasterAction) {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME!");
    
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

async function startGame() {
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    map.invalidateSize();
    
    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(
            (p) => {
                const pos = [p.coords.latitude, p.coords.longitude];
                // Priorità al heading del GPS se ci si muove velocemente
                if (p.coords.heading !== null && p.coords.speed > 0.8 && state.autoCenter) {
                    state.currentHeading = p.coords.heading;
                    document.getElementById("map-rotate").style.transform = `rotate(${-state.currentHeading}deg)`;
                }

                if(!state.playerMarker) {
                    state.playerMarker = L.circleMarker(pos, {radius: 10, color: '#fff', fillColor: '#0f0', fillOpacity: 1, weight: 3}).addTo(map);
                    map.setView(pos, 19);
                } else {
                    state.playerMarker.setLatLng(pos);
                    if(state.autoCenter) map.panTo(pos);
                }
                updateNavigationLine();
            },
            null, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    }
    setInterval(() => sync(false), 4000);
}

// Funzioni Master e Sync (Invariate per stabilità)
function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        document.getElementById("playerStartBtn").style.display = "none";
        loadConfigFromServer();
    }
}

async function saveAndStart() {
    state.startTime = Date.now();
    await sync(true, parseInt(document.getElementById("gameDuration").value));
    startGame();
}

async function sync(forceMaster, duration) {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        let { record } = await res.json();
        if(!record.players) record.players = {};
        record.players[state.playerName] = { 
            team: state.playerTeam, 
            lat: state.playerMarker?.getLatLng().lat || 0, 
            lon: state.playerMarker?.getLatLng().lng || 0, 
            last: Date.now() 
        };

        if(state.isMaster || forceMaster) {
            record.game = { 
                mode: state.selectedMode, scoreRed: record.game?.scoreRed || 0, scoreBlue: record.game?.scoreBlue || 0,
                start: forceMaster ? (state.startTime || Date.now()) : record.game?.start,
                duration: duration || record.game?.duration || 30
            };
            let newObjs = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                if(s.querySelector(".s-active").checked) {
                    newObjs.push({ name: s.querySelector(".s-name").value, lat: parseFloat(s.querySelector(".s-lat").value), lon: parseFloat(s.querySelector(".s-lon").value), owner: "LIBERO" });
                }
            });
            if(newObjs.length > 0) record.objectives = newObjs;
        }
        await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        updateUI(record);
    } catch(e) {}
}

function updateUI(r) {
    activeMarkers.forEach(m => map.removeLayer(m)); activeMarkers = [];
    const timerEl = document.getElementById("timer");
    const scoreboard = document.getElementById("scoreboard");
    scoreboard.innerHTML = "";

    if(r.game?.mode === 'DOMINATION') {
        document.getElementById("scoreRed").innerText = r.game.scoreRed || 0;
        document.getElementById("scoreBlue").innerText = r.game.scoreBlue || 0;
        const elapsed = Math.floor((Date.now() - r.game.start) / 1000);
        const remain = ((r.game.duration || 30) * 60) - elapsed;
        timerEl.innerText = remain > 0 ? `T-MINUS: ${Math.floor(remain/60)}:${(remain%60).toString().padStart(2,'0')}` : "MISSION END";
    }
    
    (r.objectives || []).forEach(obj => {
        let color = obj.owner === 'RED' ? '#f00' : obj.owner === 'BLUE' ? '#0ff' : '#fff';
        let m = L.circle([obj.lat, obj.lon], {radius: 15, color: color, weight: 3, fillOpacity: 0.2}).addTo(map);
        m.bindTooltip(obj.name, {permanent:true, direction:'top', className:'obj-label'});
        m.on('click', () => startNavigation(obj));
        activeMarkers.push(m);
        scoreboard.innerHTML += `<li onclick='startNavigation(${JSON.stringify(obj)})'>${obj.name} <span>${getDist(obj.lat, obj.lon)}m</span></li>`;
    });

    const pList = document.getElementById("playerList"); pList.innerHTML = "";
    Object.entries(r.players || {}).forEach(([name, p]) => {
        if(Date.now() - p.last < 30000 && p.team === state.playerTeam && name !== state.playerName) {
            pList.innerHTML += `<li>${name} <span>${getDist(p.lat, p.lon)}m</span></li>`;
            activeMarkers.push(L.circleMarker([p.lat, p.lon], {radius: 6, color: p.team==='RED'?'#f00':'#0ff', fillColor: p.team==='RED'?'#f00':'#0ff', fillOpacity:1}).addTo(map));
        }
    });
}

function startNavigation(obj) { state.targetObj = obj; document.getElementById("nav-overlay").style.display = "block"; updateNavigationLine(); }
function stopNavigation() { state.targetObj = null; if(state.navLine) map.removeLayer(state.navLine); state.navLine = null; document.getElementById("nav-overlay").style.display = "none"; }
function updateNavigationLine() {
    if(!state.targetObj || !state.playerMarker) return;
    const p1 = state.playerMarker.getLatLng();
    const p2 = [state.targetObj.lat, state.targetObj.lon];
    document.getElementById("nav-text").innerText = `NAV TO ${state.targetObj.name}: ${getDist(p2[0], p2[1])}m`;
    if(state.navLine) map.removeLayer(state.navLine);
    state.navLine = L.polyline([p1, p2], {color: 'yellow', weight: 3, dashArray: '5, 10'}).addTo(map);
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
function exitGame() { if(confirm("ABORTIRE MISSIONE?")) location.reload(); }
