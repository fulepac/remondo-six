const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null, currentHeading: 0 };
let activeMarkers = [];
let map;

function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map);
}

// Attiva bussola e avvia
function enableSensorsAndStart() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(res => { if (res === 'granted') { window.addEventListener('deviceorientation', handleRotation, true); startGame(); } })
            .catch(console.error);
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
        const container = document.getElementById("objSlotContainer");
        container.innerHTML = "";
        for (let i = 0; i < 10; i++) {
            const o = (record.objectives && record.objectives[i]) ? record.objectives[i] : { name: `OBJ${i+1}`, lat: 0, lon: 0 };
            container.innerHTML += `
                <div class="obj-slot">
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
    document.getElementById("game-ui").style.display = "block";
    setTimeout(() => {
        map.invalidateSize();
        navigator.geolocation.watchPosition(p => {
            const pos = [p.coords.latitude, p.coords.longitude];
            map.setView(pos, 18);
            if(!state.playerMarker) state.playerMarker = L.circleMarker(pos, {radius: 5, color: '#fff', fillOpacity: 1}).addTo(map);
            else state.playerMarker.setLatLng(pos);
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
            record.players[state.playerName] = { team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now() };
        }
        if(state.isMaster && !record.game.started) {
            record.game.started = true;
            record.game.endTime = Date.now() + (parseInt(document.getElementById("gameDuration").value) * 60000);
            record.objectives = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                if(s.querySelector(".s-active").checked) {
                    record.objectives.push({ name: s.querySelector(".s-name").value, lat: parseFloat(s.querySelector(".s-lat").value), lon: parseFloat(s.querySelector(".s-lon").value), owner: "LIBERO" });
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
    (r.objectives || []).forEach(obj => {
        let color = obj.owner === 'RED' ? 'red' : obj.owner === 'BLUE' ? 'cyan' : 'white';
        activeMarkers.push(L.circle([obj.lat, obj.lon], {radius: 15, color: color}).addTo(map).bindTooltip(obj.name, {permanent:true, direction:'top'}));
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

function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }
function reloadMap() { map.invalidateSize(); }
window.onload = initMap;
