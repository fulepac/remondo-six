const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let activeObjMarkers = [];

const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

function reloadMap() { satLayer.redraw(); map.invalidateSize(); }
function centerMap() { if (state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

function handleOrientation(e) {
    let heading = e.webkitCompassHeading || (360 - e.alpha);
    if (heading) {
        document.getElementById("map-rotate-wrapper").style.transform = `rotate(${-heading}deg)`;
        document.getElementById("compass-needle").style.transform = `rotate(${-heading}deg)`;
    }
}

function initSlotUI() {
    const container = document.getElementById("objSlotContainer");
    const DEFAULTS = [{n:"PF1", la:45.238376, lo:8.810060}, {n:"PF2", la:45.237648, lo:8.810941}, {n:"PF3", la:45.238634, lo:8.808772}];
    container.innerHTML = "";
    for (let i = 0; i < 10; i++) {
        const d = DEFAULTS[i] || { n: `OBJ${i+1}`, la: 0, lo: 0 };
        container.innerHTML += `<div style="display:flex; gap:2px; margin-bottom:5px;">
            <input type="checkbox" class="s-active" ${i<3?'checked':''}>
            <input type="text" class="s-name" value="${d.n}" style="width:40px;">
            <input type="text" class="s-lat" value="${d.la}" style="width:70px;">
            <input type="text" class="s-lon" value="${d.lo}" style="width:70px;">
        </div>`;
    }
}

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;
    if(!state.playerName) return alert("NOME MANCANTE");

    if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(res => { if(res==='granted') window.addEventListener('deviceorientation', handleOrientation); });
    } else { window.addEventListener('deviceorientation', handleOrientation); }

    document.getElementById("menu").style.display="none"; 
    document.getElementById("game-ui").style.display="block";
    map.invalidateSize();

    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        if(!state.playerMarker) state.playerMarker = L.marker([la,lo]).addTo(map).bindTooltip("TU", {permanent:true});
        else state.playerMarker.setLatLng([la,lo]);
    }, null, {enableHighAccuracy:true});

    setInterval(sync, 4000);
}

function processLogic(r) {
    if (!r.game.started) {
        r.game.started = true; r.game.start = Date.now(); r.game.score = {RED:0, BLUE:0}; r.game.lastTick = Date.now();
        r.objectives = [];
        document.querySelectorAll(".s-active").forEach((cb, i) => {
            if(cb.checked) {
                const parent = cb.parentElement;
                r.objectives.push({ name: parent.querySelector(".s-name").value, lat: parseFloat(parent.querySelector(".s-lat").value), lon: parseFloat(parent.querySelector(".s-lon").value), owner:"LIBERO", start:null, teamConquering:null });
            }
        });
    }

    r.objectives.forEach(obj => {
        const playersNear = Object.values(r.players).filter(p => (Date.now()-p.last < 10000) && getDist(obj.lat, obj.lon, p.lat, p.lon) < 15);
        const teams = [...new Set(playersNear.map(p => p.team))];
        if (teams.length === 1) {
            const t = teams[0];
            if (obj.owner !== t) {
                if (obj.teamConquering !== t) { obj.start = Date.now(); obj.teamConquering = t; }
                else if (Date.now() - obj.start > 180000) { obj.owner = t; obj.teamConquering = null; }
            }
        } else { obj.teamConquering = null; obj.start = null; }
    });

    if(Date.now() - r.game.lastTick > 30000) {
        r.objectives.forEach(o => { if(o.owner!=="LIBERO") r.game.score[o.owner]++; });
        r.game.lastTick = Date.now();
    }
}

async function sync() {
    if(!state.playerMarker) return;
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        record.players[state.playerName] = { team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now() };
        if(state.isMaster) {
            processLogic(record);
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e){}
}

function updateUI(r) {
    const elapsed = Math.floor((Date.now()-r.game.start)/1000);
    const total = (parseInt(document.getElementById("gameDuration").value)||30)*60;
    document.getElementById("timer").innerText = (total-elapsed)>0 ? `⏱️ ${Math.floor((total-elapsed)/60)}:${((total-elapsed)%60).toString().padStart(2,"0")}` : "FINE";
    document.getElementById("score").innerHTML = `🔴 ${r.game.score.RED} | 🔵 ${r.game.score.BLUE}`;
    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    activeObjMarkers.forEach(m => map.removeLayer(m)); activeObjMarkers = [];
    r.objectives.forEach(obj => {
        let col = obj.owner === "RED" ? "red" : obj.owner === "BLUE" ? "cyan" : "white";
        sb.innerHTML += `<li>${obj.name}: ${obj.teamConquering ? 'CATTURA '+obj.teamConquering : obj.owner}</li>`;
        activeObjMarkers.push(L.circle([obj.lat, obj.lon], {radius:12, color:col}).addTo(map));
    });
}

function getDist(la1, lo1, la2, lo2) {
    const R = 6371e3; const dLat = (la2-la1)*Math.PI/180; const dLon = (lo2-lo1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function toggleMasterTools() { document.getElementById("masterTools").style.display = document.getElementById("isMaster").checked ? "block" : "none"; }
async function resetBin() { if(confirm("RESET TOTALE?")) { await fetch(URL, {method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{started:false}, players:{}, objectives:[]})}); location.reload(); }}
window.onload = initSlotUI;
