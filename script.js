const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let allyMarkers = {}; 
let objMarkers = [];
let map;

function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map);
}

function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
    }
}

// Inizializza gli slot nel menu Master ma carica i valori dal server se esistono
async function loadCurrentConfig() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
        const { record } = await res.json();
        
        const container = document.getElementById("objSlotContainer");
        container.innerHTML = "";
        
        // Se ci sono già obiettivi sul server, usa quelli, altrimenti i default
        const list = (record.objectives && record.objectives.length > 0) ? record.objectives : 
                     [{name:"PF1", lat:45.238376, lon:8.810060}, {name:"PF2", lat:45.237648, lon:8.810941}, {name:"PF3", lat:45.238634, lon:8.808772}];

        list.forEach((obj, i) => {
            container.innerHTML += `<div class="obj-slot" style="display:flex; gap:2px; margin-bottom:2px;">
                <input type="checkbox" class="s-active" checked>
                <input type="text" class="s-name" value="${obj.name}" style="width:50px; font-size:10px;">
                <input type="text" class="s-lat" value="${obj.lat}" style="font-size:10px;">
                <input type="text" class="s-lon" value="${obj.lon}" style="font-size:10px;">
            </div>`;
        });
    } catch(e) { console.log("Errore caricamento config"); }
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
    }, 600);

    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        
        // Mantieni sempre i giocatori aggiornati
        if(state.playerMarker) {
            if(!record.players) record.players = {};
            record.players[state.playerName] = {
                team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now()
            };
        }

        // Se il Master clicca Avvia, carica i nuovi dati dagli slot, altrimenti mantiene quelli vecchi
        if(state.isMaster && !record.game.started) {
            record.game.started = true;
            record.game.durationMin = parseInt(document.getElementById("gameDuration").value) || 30;
            record.game.endTime = Date.now() + (record.game.durationMin * 60000);
            record.game.score = {RED:0, BLUE:0};
            
            // Aggiorna gli obiettivi solo se il Master ha modificato gli slot e preme Avvia
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

        if(state.isMaster || state.playerMarker) {
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e) {}
}

function updateUI(r) {
    // Gestione Countdown
    if(r.game.endTime) {
        const diff = r.game.endTime - Date.now();
        if(diff > 0) {
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            document.getElementById("timer").innerText = `⏱️ ${m}:${s.toString().padStart(2,'0')}`;
        } else {
            document.getElementById("timer").innerText = "FINE TEMPO";
        }
    }

    objMarkers.forEach(m => map.removeLayer(m)); objMarkers = [];
    
    // Disegna Compagni
    Object.entries(r.players || {}).forEach(([name, p]) => {
        if(Date.now() - p.last < 15000 && p.team === state.playerTeam && name !== state.playerName) {
            objMarkers.push(L.circleMarker([p.lat, p.lon], {radius:7, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map));
        }
    });

    // Disegna Obiettivi (sempre persistenti)
    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    (r.objectives || []).forEach(obj => {
        sb.innerHTML += `<li>${obj.name}: ${obj.owner}</li>`;
        objMarkers.push(L.circle([obj.lat, obj.lon], {radius:15, color: obj.owner==='RED'?'red':obj.owner==='BLUE'?'cyan':'white'}).addTo(map));
    });
}

async function resetBin() { 
    if(!confirm("TERMINARE LA PARTITA? (GLI OBIETTIVI CARICATI NON VERRANNO CANCELLATI)")) return;
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
        const { record } = await res.json();
        record.game.started = false;
        record.game.endTime = null;
        record.players = {};
        // NON azzeriamo record.objectives, così rimangono quelli caricati dall'app
        await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        location.reload();
    } catch(e) { alert("Errore Reset"); }
}

function reloadMap() { map.invalidateSize(); }
function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

window.onload = () => { 
    initMap(); 
    loadCurrentConfig(); 
};
