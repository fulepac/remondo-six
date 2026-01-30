const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

// Obiettivi predefiniti storici (Sempre pronti in memoria)
const DEFAULT_OBJS = [
    { name: "ALFA", lat: 45.2377, lon: 8.8097, owner: "LIBERO" },
    { name: "BRAVO", lat: 45.2385, lon: 8.8105, owner: "LIBERO" },
    { name: "CHARLIE", lat: 45.2369, lon: 8.8115, owner: "LIBERO" },
    { name: "DELTA", lat: 45.2392, lon: 8.8085, owner: "LIBERO" },
    { name: "ECHO", lat: 45.2360, lon: 8.8075, owner: "LIBERO" }
];

let state = { 
    isMaster: false, 
    playerName: "", 
    playerTeam: "", 
    playerMarker: null, 
    autoCenter: true, 
    selectedMode: "DOMINATION",
    targetObj: null,
    lastUpdate: 0
};

let activeMarkers = [];
let map;

// INIZIALIZZAZIONE
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
    map = L.map("map", { 
        zoomControl: false, 
        attributionControl: false,
        zoomAnimation: true,
        fadeAnimation: true
    }).setView([45.2377, 8.8097], 18);

    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { 
        subdomains:['mt0','mt1','mt2','mt3'],
        maxZoom: 21 
    }).addTo(map);

    map.on('dragstart', () => {
        state.autoCenter = false;
    });
}

// GESTIONE MASTER
function checkMasterPass() {
    const input = document.getElementById("masterPass").value;
    if(input === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        document.getElementById("playerStartBtn").style.display = "none";
        loadConfigFromServer();
    }
}

function selectGameMode(m) {
    state.selectedMode = m;
    document.getElementById("btnDomination").className = (m === 'DOMINATION') ? "mode-btn active" : "mode-btn";
    document.getElementById("btnRecon").className = (m === 'RECON') ? "mode-btn active" : "mode-btn";
}

async function loadConfigFromServer() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
        const { record } = await res.json();
        const container = document.getElementById("objSlotContainer");
        container.innerHTML = "";
        
        // Unione dati server + dati base se mancanti
        const currentObjs = (record.objectives && record.objectives.length > 0) ? record.objectives : DEFAULT_OBJS;

        for (let i = 0; i < 10; i++) {
            let o = currentObjs[i] || { name: `OBJ${i+1}`, lat: "", lon: "" };
            container.innerHTML += `
                <div class="obj-slot">
                    <input type="checkbox" class="s-active" ${o.lat ? 'checked' : ''}>
                    <input type="text" class="s-name" value="${o.name}" style="width:60px">
                    <input type="text" class="s-lat" value="${o.lat}" placeholder="Lat" style="flex-grow:1">
                    <input type="text" class="s-lon" value="${o.lon}" placeholder="Lon" style="flex-grow:1">
                </div>`;
        }
        if(record.game && record.game.mode) {
            selectGameMode(record.game.mode);
        }
    } catch(e) {
        console.error("Errore configurazione Master:", e);
    }
}

// SENSORI E BUSSOLA
function handleRotation(e) {
    let compass = e.webkitCompassHeading || (360 - e.alpha);
    if(compass) {
        // Rotazione fluida della mappa
        document.getElementById("map-rotate").style.transform = `rotate(${-compass}deg)`;
    }
}

function enableSensorsAndStart(isMasterAction) {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    
    if(!state.playerName) {
        alert("INSERISCI IL TUO NOME OPERATIVORE!");
        return;
    }

    localStorage.setItem("six_app_session", JSON.stringify({
        name: state.playerName, 
        team: state.playerTeam
    }));

    // Richiesta permessi bussola (iOS 13+)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if (response == 'granted') {
                    window.addEventListener('deviceorientation', handleRotation, true);
                }
                isMasterAction ? saveAndStart() : startGame();
            })
            .catch(e => {
                console.warn("Bussola non disponibile:", e);
                isMasterAction ? saveAndStart() : startGame();
            });
    } else {
        window.addEventListener('deviceorientation', handleRotation, true);
        isMasterAction ? saveAndStart() : startGame();
    }
}

// LOGICA DI GIOCO
async function saveAndStart() {
    await sync(true); 
    startGame();
}

async function startGame() {
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    map.invalidateSize();

    // Tracking GPS
    navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if(!state.playerMarker) {
            state.playerMarker = L.circleMarker(pos, {
                radius: 8, 
                color: '#fff', 
                fillColor: (state.playerTeam === 'RED' ? '#ff0000' : '#00ffff'),
                fillOpacity: 1, 
                weight: 3
            }).addTo(map);
            map.setView(pos, 18);
        } else {
            state.playerMarker.setLatLng(pos);
            if(state.autoCenter) map.panTo(pos);
        }
        
        // Se c'è un obiettivo target, aggiorna info navigazione
        if(state.targetObj) {
            updateNavUI(pos);
        }
    }, e => console.error(e), { enableHighAccuracy: true });

    // Loop Sincronizzazione Server
    setInterval(() => sync(false), 4000);
}

async function sync(forceMaster) {
    try {
        const res = await fetch(`${URL}/latest`, { 
            headers: {"X-Master-Key": SECRET_KEY}, 
            cache: 'no-store'
        });
        let { record } = await res.json();
        
        if(!record.players) record.players = {};
        
        // Aggiorna posizione propria nel record
        record.players[state.playerName] = { 
            team: state.playerTeam, 
            lat: state.playerMarker ? state.playerMarker.getLatLng().lat : 0, 
            lon: state.playerMarker ? state.playerMarker.getLatLng().lng : 0, 
            last: Date.now() 
        };

        // Se sono Master, invio anche le impostazioni globali e i 10 slot
        if(state.isMaster || forceMaster) {
            record.game = { 
                mode: state.selectedMode, 
                duration: document.getElementById("gameDuration").value,
                captureTime: document.getElementById("captureTime").value
            };
            
            let newObjs = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                const active = s.querySelector(".s-active").checked;
                if(active) {
                    newObjs.push({
                        name: s.querySelector(".s-name").value || "OBJ",
                        lat: parseFloat(s.querySelector(".s-lat").value) || 0,
                        lon: parseFloat(s.querySelector(".s-lon").value) || 0,
                        owner: "LIBERO",
                        pointsRed: 0,
                        pointsBlue: 0
                    });
                }
            });
            record.objectives = newObjs;
        }

        // Invio dati aggiornati al server
        await fetch(URL, { 
            method: "PUT", 
            headers: {
                "Content-Type": "application/json",
                "X-Master-Key": SECRET_KEY
            }, 
            body: JSON.stringify(record)
        });

        updateUI(record);
    } catch(e) {
        console.error("Erroling Sync:", e);
    }
}

function updateUI(r) {
    // 1. Pulisci marker vecchi
    activeMarkers.forEach(m => map.removeLayer(m));
    activeMarkers = [];

    // 2. Aggiorna Lista Obiettivi
    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    
    (r.objectives || []).forEach(obj => {
        const dist = getDist(obj.lat, obj.lon);
        const li = document.createElement("li");
        li.innerHTML = `<b>${obj.name}</b> <span class="dist">${dist}m</span> <span class="owner">${obj.owner}</span>`;
        li.onclick = () => startNav(obj);
        sb.appendChild(li);

        let color = "#ffffff";
        if(obj.owner === 'RED') color = "#ff0000";
        if(obj.owner === 'BLUE') color = "#00ffff";

        let m = L.circle([obj.lat, obj.lon], {
            radius: 15, 
            color: color, 
            weight: 3,
            fillOpacity: 0.2
        }).addTo(map);
        
        m.bindTooltip(obj.name, { 
            permanent: true, 
            direction: 'top', 
            className: 'obj-label' 
        });
        activeMarkers.push(m);
    });

    // 3. Aggiorna Compagni (Team Radar)
    const pList = document.getElementById("playerList");
    pList.innerHTML = "";
    Object.entries(r.players || {}).forEach(([name, p]) => {
        // Mostra solo compagni attivi negli ultimi 30 secondi
        if(Date.now() - p.last < 30000 && p.team === state.playerTeam && name !== state.playerName) {
            const d = getDist(p.lat, p.lon);
            pList.innerHTML += `<li>${name} <span class="dist">${d}m</span></li>`;
            
            let teammate = L.circleMarker([p.lat, p.lon], {
                radius: 6, 
                color: (p.team === 'RED' ? '#ff0000' : '#00ffff'),
                fillOpacity: 1
            }).addTo(map);
            activeMarkers.push(teammate);
        }
    });

    // 4. Aggiorna Punteggi (se presenti nel record)
    if(r.game && r.game.scoreRed !== undefined) {
        document.getElementById("scoreRed").innerText = r.game.scoreRed;
        document.getElementById("scoreBlue").innerText = r.game.scoreBlue;
    }
}

// NAVIGAZIONE
function startNav(obj) {
    state.targetObj = obj;
    document.getElementById("nav-panel").style.display = "flex";
    document.getElementById("nav-info").innerText = `NAV: ${obj.name}`;
}

function stopNavigation() {
    state.targetObj = null;
    document.getElementById("nav-panel").style.display = "none";
}

function updateNavUI(currentPos) {
    const d = getDist(state.targetObj.lat, state.targetObj.lon);
    document.getElementById("nav-info").innerText = `NAV: ${state.targetObj.name} (${d}m)`;
}

// UTILS
function getDist(lat2, lon2) {
    if(!state.playerMarker) return "?";
    const p1 = state.playerMarker.getLatLng();
    const R = 6371000; 
    const dLat = (lat2 - p1.lat) * Math.PI / 180;
    const dLon = (lon2 - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
}

function centerMap() {
    state.autoCenter = true;
    if(state.playerMarker) {
        map.panTo(state.playerMarker.getLatLng());
    }
}

function exitGame() {
    if(confirm("VUOI USCIRE DALL'OPERAZIONE?")) {
        location.reload();
    }
}

async function resetBin() {
    if(confirm("⚠️ RESET TOTALE? Questa azione cancellerà ogni dato su JSONBin!")) {
        const cleanData = {
            game: { mode: "DOMINATION", scoreRed: 0, scoreBlue: 0, started: false },
            players: {},
            objectives: DEFAULT_OBJS
        };
        try {
            await fetch(URL, { 
                method: "PUT", 
                headers: {
                    "Content-Type": "application/json",
                    "X-Master-Key": SECRET_KEY
                }, 
                body: JSON.stringify(cleanData)
            });
            alert("Database Resettato. Ricarico...");
            location.reload();
        } catch(e) {
            alert("Errore durante il reset.");
        }
    }
}
