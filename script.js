const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let activeMarkers = [];
let map;

function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map);
}

function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        loadCurrentConfig(); 
    }
}

// RIPRISTINATO: Genera i 10 slot editabili caricando i dati esistenti
async function loadCurrentConfig() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
        const { record } = await res.json();
        const container = document.getElementById("objSlotContainer");
        container.innerHTML = "";
        
        const serverObjs = record.objectives || [];
        for (let i = 0; i < 10; i++) {
            const o = serverObjs[i] || { name: `OBJ${i+1}`, lat: 0, lon: 0 };
            const checked = serverObjs[i] ? "checked" : "";
            container.innerHTML += `
                <div class="obj-slot" style="display:flex; gap:2px; margin-bottom:3px;">
                    <input type="checkbox" class="s-active" ${checked}>
                    <input type="text" class="s-name" value="${o.name}" style="width:50px;">
                    <input type="text" class="s-lat" value="${o.lat}" style="flex:1;">
                    <input type="text" class="s-lon" value="${o.lon}" style="flex:1;">
                </div>`;
        }
    } catch(e) { console.error("Errore caricamento"); }
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        
        if(state.playerMarker) {
            if(!record.players) record.players = {};
            record.players[state.playerName] = {
                team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now()
            };
        }

        // Se il Master clicca Avvia Partita (prima sincronizzazione dopo password)
        if(state.isMaster && !record.game.started) {
            record.game.started = true;
            record.game.durationMin = parseInt(document.getElementById("gameDuration").value) || 30;
            record.game.captureTimeSec = parseInt(document.getElementById("captureTime").value) || 180;
            record.game.endTime = Date.now() + (record.game.durationMin * 60000);
            
            // Salva i 10 slot
            record.objectives = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                if(s.querySelector(".s-active").checked) {
                    record.objectives.push({
                        name: s.querySelector(".s-name").value,
                        lat: parseFloat(s.querySelector(".s-lat").value),
                        lon: parseFloat(s.querySelector(".s-lon").value),
                        owner: "LIBERO",
                        progress: 0
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

// ... (Resto delle funzioni updateUI, centerMap, reloadMap come prima) ...

window.onload = () => { initMap(); };
