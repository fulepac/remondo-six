const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };

// Gestione Menu
function toggleMaster() {
    document.getElementById("masterTools").style.display = document.getElementById("isMaster").checked ? "block" : "none";
}

// Mappa
const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

// Bussola
window.addEventListener('deviceorientation', (e) => {
    let heading = e.webkitCompassHeading || (360 - e.alpha);
    if (heading) {
        document.getElementById("compass-needle").style.transform = `rotate(${-heading}deg)`;
    }
});

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;

    if (!state.playerName) return alert("INSERISCI NOME");
    if (state.isMaster && document.getElementById("masterPass").value !== "71325") return alert("PASS ERRATA");

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";

    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        if(!state.playerMarker) state.playerMarker = L.marker([la,lo]).addTo(map).bindTooltip("TU", {permanent:true});
        else state.playerMarker.setLatLng([la,lo]);
    }, null, {enableHighAccuracy:true});

    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const data = await res.json();
        let record = data.record;

        if (state.isMaster && !record.game.started) {
            record.game.started = true;
            record.objectives = [
                {name:"ALFA", lat:45.238376, lon:8.810060, owner:"LIBERO"},
                {name:"BRAVO", lat:45.237648, lon:8.810941, owner:"LIBERO"}
            ];
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }

        updateUI(record);
    } catch(e) { console.log("Sync Error"); }
}

function updateUI(r) {
    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    (r.objectives || []).forEach(obj => {
        sb.innerHTML += `<li>${obj.name}: <b>${obj.owner}</b></li>`;
    });
    const banner = document.getElementById("gameStatusBanner");
    banner.innerText = r.game.started ? "PARTITA IN CORSO" : "SERVER PRONTO";
}

function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }
