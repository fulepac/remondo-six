const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let allyMarkers = {}; 
let activeObjMarkers = [];
let lastObjStatus = {}; 
const CONQUER_TIME = 180000; // 3 minuti

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(freq, duration) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// Inizializzazione Mappa (Satellite Esri)
const map = L.map("map", { zoomControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri Satellite'
}).addTo(map);

// GESTIONE BUSSOLA E ROTAZIONE MAPPA
function initCompass() {
    if (window.DeviceOrientationEvent) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(state => {
                if (state === 'granted') window.addEventListener('deviceorientation', handleOrientation);
            });
        } else {
            window.addEventListener('deviceorientation', handleOrientation);
        }
    }
}

function handleOrientation(event) {
    let heading = event.webkitCompassHeading || (360 - event.alpha);
    if (heading) {
        // Ruota la freccia della bussola
        document.getElementById("compass-arrow").style.transform = `rotate(${heading}deg)`;
        // Ruota il contenitore della mappa (Heading Up)
        document.getElementById("map-rotate-container").style.transform = `rotate(${-heading}deg)`;
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
        // Inizializzazione obiettivi...
        r.objectives = [{name:"ALFA", lat:45.2383, lon:8.8100, owner:"LIBERO", start:null, teamConquering:null}];
    }

    r.objectives.forEach(obj => {
        const nearby = Object.values(r.players).filter(p => (Date.now()-p.last < 10000) && getDist(obj.lat, obj.lon, p.lat, p.lon) < 15);
        const teamsPresent = [...new Set(nearby.map(p => p.team))];

        // Logica Conquista (3 minuti)
        if(teamsPresent.length === 1 && teamsPresent[0] !== obj.owner) {
            if(obj.teamConquering !== teamsPresent[0]) {
                obj.start = Date.now();
                obj.teamConquering = teamsPresent[0];
            } else if(Date.now() - obj.start > CONQUER_TIME) {
                obj.owner = teamsPresent[0];
                obj.teamConquering = null;
            }
        } else {
            obj.teamConquering = null;
            obj.start = null;
        }
    });
}

// Funzioni di utility (getDist, sync, updateUI, centerMap) rimangono come nelle versioni precedenti...
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
        record.players[state.playerName] = { team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now() };
        if(state.isMaster) {
            processLogic(record);
            await fetch(JSONBIN_URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e){}
}

function updateUI(r) {
    // Logica di aggiornamento DOM e Marker...
}
