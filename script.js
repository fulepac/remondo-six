const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let allyMarkers = {}; 
let activeObjMarkers = [];
let lastObjStatus = {}; 
const CONQUER_TIME = 180000; // 3 minuti in millisecondi

const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

// GESTIONE BUSSOLA E ROTAZIONE MAPPA
function initCompass() {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => { if (response === 'granted') window.addEventListener('deviceorientation', handleOrientation); })
            .catch(console.error);
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
    }
}

function handleOrientation(event) {
    let heading = event.webkitCompassHeading || (360 - event.alpha);
    if (heading) {
        // Ruota il wrapper della mappa per tenerla orientata (Heading Up)
        document.getElementById("map-rotate-wrapper").style.transform = `rotate(${-heading}deg)`;
        // Ruota la lettera N nella bussola per indicare il Nord reale
        document.getElementById("compass-needle").style.transform = `rotate(${-heading}deg)`;
    }
}

async function startGame() {
    initCompass();
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;
    if (!state.playerName) return alert("INSERISCI NOME");
    
    document.getElementById("menu").style.display="none"; 
    document.getElementById("game-ui").style.display="block";

    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        if(!state.playerMarker) state.playerMarker = L.marker([la,lo]).addTo(map).bindTooltip("TU", {permanent:true});
        else state.playerMarker.setLatLng([la,lo]);
    }, null, {enableHighAccuracy:true});
    
    setInterval(sync, 4000);
}

function processLogic(r) {
    if (!r.game.started) {
        r.game.started = true; r.game.start = Date.now();
        r.game.score = {RED:0, BLUE:0};
        r.objectives = [
            {name:"PF1", lat:45.238376, lon:8.810060, owner:"LIBERO", start:null, teamConquering:null},
            {name:"PF2", lat:45.237648, lon:8.810941, owner:"LIBERO", start:null, teamConquering:null}
        ];
    }

    r.objectives.forEach(obj => {
        const nearby = Object.values(r.players).filter(p => (Date.now()-p.last < 10000) && getDist(obj.lat, obj.lon, p.lat, p.lon) < 15);
        const teamsPresent = [...new Set(nearby.map(p => p.team))];

        // Se c'è solo una squadra nemica nell'area
        if(teamsPresent.length === 1 && teamsPresent[0] !== obj.owner) {
            if(obj.teamConquering !== teamsPresent[0]) {
                obj.start = Date.now();
                obj.teamConquering = teamsPresent[0];
            } else if(Date.now() - obj.start > CONQUER_TIME) {
                obj.owner = teamsPresent[0];
                obj.teamConquering = null;
                obj.start = null;
            }
        } else {
            // Se l'area è vuota o contesa, resetta il timer di conquista
            obj.teamConquering = null;
            obj.start = null;
        }
    });
}

// Funzioni di supporto
function getDist(la1, lo1, la2, lo2) {
    const R = 6371e3;
    const dLat = (la2-la1)*Math.PI/180; const dLon = (lo2-lo1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function centerMap() { if (state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

async function sync() {
    if(!state.playerMarker) return;
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        if(!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now() };
        
        if(state.isMaster) {
            processLogic(record);
            await fetch(JSONBIN_URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e){}
}

function updateUI(r) {
    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    activeObjMarkers.forEach(m => map.removeLayer(m)); activeObjMarkers = [];

    r.objectives.forEach(obj => {
        const col = obj.owner === "RED" ? "red" : obj.owner === "BLUE" ? "#00ffff" : "white";
        let status = obj.owner;
        if(obj.teamConquering) {
            const progress = Math.floor((Date.now()-obj.start)/1000);
            status = `INVASIONE ${obj.teamConquering} (${progress}/180s)`;
        }
        sb.innerHTML += `<li>${obj.name}: ${status}</li>`;
        activeObjMarkers.push(L.circle([obj.lat, obj.lon], {radius:15, color:col}).addTo(map));
    });
}
