const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let activeObjMarkers = [];
const CONQUER_TIME = 180000; // 3 minuti

// AUDIO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(f, d) {
    try {
        if(audioCtx.state==='suspended') audioCtx.resume();
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.type="square"; o.frequency.value=f; g.gain.value=0.1;
        o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+d);
    } catch(e) { console.log("Audio non supportato"); }
}

// GENERAZIONE SLOT OBIETTIVI
function initSlots() {
    const container = document.getElementById("objSlotContainer");
    if(!container) return;
    container.innerHTML = "";
    const defaults = [{n:"ALFA", la:45.238376, lo:8.810060}, {n:"BRAVO", la:45.237648, lo:8.810941}];
    for(let i=0; i<10; i++) {
        const d = defaults[i] || {n:`OBJ${i+1}`, la:0, lo:0};
        container.innerHTML += `<div class="obj-slot" id="s-${i}">
            <input type="checkbox" class="act" ${i<2?'checked':''}>
            <input type="text" class="nm" value="${d.n}" style="width:50px">
            <input type="number" class="lt" value="${d.la}" style="width:70px" step="0.000001">
            <input type="number" class="ln" value="${d.lo}" style="width:70px" step="0.000001">
        </div>`;
    }
}

function toggleMasterTools() { 
    document.getElementById("masterTools").style.display = document.getElementById("isMaster").checked ? "block" : "none"; 
}

// MAPPA
const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

function handleOrientation(e) {
    let heading = e.webkitCompassHeading || (360 - e.alpha);
    if (heading) {
        document.getElementById("map-rotate-wrapper").style.transform = `rotate(${-heading}deg)`;
        document.getElementById("compass-needle").style.transform = `rotate(${-heading}deg)`;
    }
}

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;

    if(!state.playerName) { alert("ERRORE: Inserisci il tuo nome!"); return; }
    
    if(state.isMaster) {
        const pass = document.getElementById("masterPass").value;
        if(pass !== "71325") { alert("ERRORE: Password Master errata!"); return; }
    }

    // Richiesta Permessi Bussola (iOS)
    if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(r => { 
            if(r==='granted') window.addEventListener('deviceorientation', handleOrientation); 
        }).catch(e => console.log("Sensori non autorizzati"));
    } else { window.addEventListener('deviceorientation', handleOrientation); }
    
    audioCtx.resume();

    document.getElementById("menu").style.display="none";
    document.getElementById("game-ui").style.display="block";
    if(state.isMaster) document.getElementById("master-controls").style.display="block";

    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        if(!state.playerMarker) state.playerMarker = L.marker([la,lo]).addTo(map).bindTooltip("TU", {permanent:true});
        else state.playerMarker.setLatLng([la,lo]);
    }, (err) => alert("ERRORE GPS: Attiva la posizione!"), {enableHighAccuracy:true});

    setInterval(sync, 4000);
}

function processLogic(r) {
    if (!r.game || !r.game.started) {
        r.game = { started: true, start: Date.now(), score: {RED:0, BLUE:0} };
        let objs = [];
        for(let i=0; i<10; i++) {
            const s = document.getElementById(`s-${i}`);
            if(s && s.querySelector(".act").checked) {
                objs.push({ 
                    name: s.querySelector(".nm").value.toUpperCase(), 
                    lat: parseFloat(s.querySelector(".lt").value), 
                    lon: parseFloat(s.querySelector(".ln").value), 
                    owner: "LIBERO", start: null, teamConquering: null 
                });
            }
        }
        r.objectives = objs;
    }

    if(r.objectives) {
        r.objectives.forEach(obj => {
            const nearby = Object.values(r.players).filter(p => (Date.now()-p.last < 10000) && getDist(obj.lat, obj.lon, p.lat, p.lon) < 20);
            const teams = [...new Set(nearby.map(p => p.team))];

            if(teams.length === 1 && teams[0] !== obj.owner) {
                if(obj.teamConquering !== teams[0]) { obj.start = Date.now(); obj.teamConquering = teams[0]; playSound(440, 0.2); }
                else if(Date.now() - obj.start > CONQUER_TIME) { obj.owner = teams[0]; obj.teamConquering = null; playSound(800, 0.8); }
            } else { obj.teamConquering = null; obj.start = null; }
        });
    }
}

async function sync() {
    if(!state.playerMarker) return;
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        let { record } = await res.json();
        
        if(!record) record = { game:{started:false}, players:{}, objectives:[] };
        if(!record.players) record.players = {};
        
        record.players[state.playerName] = { 
            team: state.playerTeam, 
            lat: state.playerMarker.getLatLng().lat, 
            lon: state.playerMarker.getLatLng().lng, 
            last: Date.now() 
        };

        if(state.isMaster) {
            processLogic(record);
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e){ console.log("Errore Sincronizzazione"); }
}

function updateUI(r) {
    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    activeObjMarkers.forEach(m => map.removeLayer(m)); activeObjMarkers = [];
    
    if(r.objectives) {
        r.objectives.forEach(obj => {
            let status = obj.owner;
            if(obj.teamConquering) status = `INVASIONE ${obj.teamConquering} (${Math.floor((Date.now()-obj.start)/1000)}s)`;
            sb.innerHTML += `<li>${obj.name}: ${status}</li>`;
            const col = obj.owner==="RED"?'red':obj.owner==="BLUE"?'cyan':'white';
            activeObjMarkers.push(L.circle([obj.lat, obj.lon], {radius:20, color:col, fillOpacity:0.3}).addTo(map));
        });
    }
}

function getDist(la1, lo1, la2, lo2) {
    const R = 6371e3;
    const dLat = (la2-la1)*Math.PI/180; const dLon = (lo2-lo1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

async function resetBin() { 
    if(confirm("ATTENZIONE: Vuoi resettare la partita e gli obiettivi?")) { 
        await fetch(URL, {method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{started:false},players:{},objectives:[]})}); 
        location.reload(); 
    } 
}

window.onload = initSlots;
