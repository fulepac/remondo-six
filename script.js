const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null, currentHeading: 0, targetObj: null, autoCenter: true, gameMode: "DOMINATION" };
let activeMarkers = [];
let map;

window.onload = () => {
    initMap();
    const saved = localStorage.getItem("six_app_session");
    if (saved) {
        const data = JSON.parse(saved);
        document.getElementById("playerName").value = data.name;
        document.getElementById("teamSelect").value = data.team;
    }
};

function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: false, inertia: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map);
    map.on('dragstart', () => { state.autoCenter = false; });
}

function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        document.getElementById("playerStartBtn").style.display = "none";
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
            const o = (record.objectives && record.objectives[i]) ? record.objectives[i] : { name: `OBJ${i+1}`, lat: "", lon: "" };
            container.innerHTML += `<div class="obj-slot">
                <input type="checkbox" class="s-active" ${record.objectives && record.objectives[i] ? 'checked' : ''}>
                <input type="text" class="s-name" value="${o.name}" style="width:50px">
                <input type="text" class="s-lat" value="${o.lat}" placeholder="Lat" style="width:80px">
                <input type="text" class="s-lon" value="${o.lon}" placeholder="Lon" style="width:80px">
            </div>`;
        }
        if(record.game) {
            document.getElementById("teamRedName").value = record.game.teamRedName || "TEAM ROSSO";
            document.getElementById("teamBlueName").value = record.game.teamBlueName || "TEAM BLU";
            setGameMode(record.game.mode || "DOMINATION");
        }
    } catch(e) {}
}

function setGameMode(m) {
    state.gameMode = m;
    document.getElementById("btnDomination").classList.toggle("active", m === "DOMINATION");
    document.getElementById("btnRecon").classList.toggle("active", m === "RECON");
}

function enableSensorsAndStart(isMasterAction) {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME OPERATORE");
    
    localStorage.setItem("six_app_session", JSON.stringify({name: state.playerName, team: state.playerTeam}));

    if (isMasterAction) {
        saveAndStartGame();
    } else {
        startGame();
    }
}

async function saveAndStartGame() {
    await sync(true); 
    startGame();
}

function handleRotation(e) {
    let compass = e.webkitCompassHeading || (360 - e.alpha);
    if (compass) {
        state.currentHeading = compass;
        document.getElementById("map-rotate").style.transform = `rotate(${-compass}deg)`;
    }
}

async function startGame() {
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    window.addEventListener('deviceorientation', handleRotation, true);
    setTimeout(() => {
        map.invalidateSize();
        navigator.geolocation.watchPosition(p => {
            const pos = [p.coords.latitude, p.coords.longitude];
            if(!state.playerMarker) {
                state.playerMarker = L.circleMarker(pos, {radius: 7, color: '#fff', fillOpacity: 1, weight: 3}).addTo(map);
                map.setView(pos, 18);
            } else { 
                state.playerMarker.setLatLng(pos); 
                if (state.autoCenter) map.panTo(pos);
            }
        }, null, {enableHighAccuracy:true});
    }, 500);
    setInterval(() => sync(false), 4000);
}

async function sync(forceMasterUpdate) {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        let { record } = await res.json();
        
        if(!record.players) record.players = {};
        if(state.playerName) {
            record.players[state.playerName] = { 
                team: state.playerTeam, 
                lat: state.playerMarker ? state.playerMarker.getLatLng().lat : 0, 
                lon: state.playerMarker ? state.playerMarker.getLatLng().lng : 0, 
                last: Date.now() 
            };
        }

        if(state.isMaster || forceMasterUpdate) {
            if(!record.game) record.game = {};
            record.game.mode = state.gameMode;
            record.game.teamRedName = document.getElementById("teamRedName").value;
            record.game.teamBlueName = document.getElementById("teamBlueName").value;
            
            if(forceMasterUpdate) {
                record.game.started = true;
                record.game.endTime = Date.now() + (parseInt(document.getElementById("gameDuration").value) * 60000);
            }

            let newObjs = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                if(s.querySelector(".s-active").checked) {
                    newObjs.push({
                        name: s.querySelector(".s-name").value || "OBJ",
                        lat: parseFloat(s.querySelector(".s-lat").value) || 0,
                        lon: parseFloat(s.querySelector(".s-lon").value) || 0,
                        owner: "LIBERO"
                    });
                }
            });
            record.objectives = newObjs;
        }
        
        await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        updateUI(record);
    } catch(e) {}
}

function updateUI(r) {
    const isRecon = r.game.mode === 'RECON';
    document.getElementById("header-stats").style.display = isRecon ? "none" : "block";

    activeMarkers.forEach(m => map.removeLayer(m)); activeMarkers = [];
    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    
    (r.objectives || []).forEach(obj => {
        const li = document.createElement("li");
        li.innerHTML = `${obj.name} <span>${isRecon ? 'NAV' : obj.owner}</span>`;
        li.onclick = () => { state.targetObj = obj; document.getElementById("nav-panel").style.display = "block"; };
        sb.appendChild(li);
        let color = obj.owner === 'RED' ? 'red' : obj.owner === 'BLUE' ? 'cyan' : 'white';
        activeMarkers.push(L.circle([obj.lat, obj.lon], {radius: 15, color: color, weight: 3}).addTo(map).bindTooltip(obj.name, {permanent:true, direction:'top'}));
    });

    const pList = document.getElementById("playerList"); pList.innerHTML = "";
    Object.entries(r.players || {}).forEach(([name, p]) => {
        if(Date.now() - p.last < 15000 && p.team === state.playerTeam) {
            pList.innerHTML += `<li>${name} <span>OK</span></li>`;
            if(name !== state.playerName) activeMarkers.push(L.circleMarker([p.lat, p.lon], {radius: 6, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map));
        }
    });
}

function exitGame() { localStorage.removeItem("six_app_session"); location.reload(); }
function centerMap() { state.autoCenter = true; if(state.playerMarker) map.panTo(state.playerMarker.getLatLng()); }
function reloadMap() { map.invalidateSize(); }
function stopNavigation() { state.targetObj = null; document.getElementById("nav-panel").style.display = "none"; }
async function resetBin() { if(confirm("RESET TOTALE?")) { await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{started:false,mode:"DOMINATION"},players:{},objectives:[]})}); location.reload(); } }
