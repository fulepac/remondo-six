// FILE: script.js
// ================================================
// CONFIG JSONBIN.IO
const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/696d4940ae596e708fe53514`;

// ================================================
// STATO GLOBALE
let gameStarted = false;
let isMaster = false;
let gameTime = 0;
let timerInterval = null;
let playerName = "";
let playerTeam = "";
let playerMarker = null;
const operators = [];
let objectives = [];

// ================================================
// MAPPA
const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

// ================================================
// OBIETTIVI PREDEFINITI
const predefinedObjectives = [
  {name:"PF1", lat:45.238376, lon:8.810060},
  {name:"PF2", lat:45.237648, lon:8.810941},
  {name:"PF3", lat:45.238634, lon:8.808772},
  {name:"PF4", lat:45.237771, lon:8.809208},
  {name:"PF5", lat:45.237995, lon:8.808303}
];

predefinedObjectives.forEach(o => {
    const obj = {...o, owner:null, operator:null, radius:6, marker:null};
    obj.marker = L.circle([obj.lat,obj.lon],{
        radius: obj.radius,
        color: 'white',
        fillOpacity:0.4
    }).addTo(map).bindPopup(`${obj.name} - Libero`);
    objectives.push(obj);
});

updateScoreboard();

// ================================================
// TIMER DI PARTITA
function startTimer() {
    timerInterval = setInterval(() => {
        if (gameTime <= 0) {
            clearInterval(timerInterval);
            document.getElementById("timer").innerText = "⛔ PARTITA TERMINATA";
            gameStarted = false;
            return;
        }
        gameTime--;
        const m = Math.floor(gameTime / 60);
        const s = gameTime % 60;
        document.getElementById("timer").innerText = `⏱️ Tempo: ${m}:${s.toString().padStart(2,"0")}`;
    }, 1000);
}

// ================================================
// GESTIONE OPERATORI
function addOperator() {
    if(!operators.includes(playerName + (isMaster ? " 👑" : ""))) {
        operators.push(playerName + (isMaster ? " 👑" : ""));
    }
    updateOperatorsUI();
}

function updateOperatorsUI() {
    const ul = document.getElementById("operators");
    ul.innerHTML = "";
    operators.forEach(op => {
        const li = document.createElement("li");
        li.innerText = op;
        ul.appendChild(li);
    });
}

// ================================================
// GESTIONE OBIETTIVI
function addObjective(name, lat, lon) {
    const obj = {name, lat: parseFloat(lat), lon: parseFloat(lon), owner: null, operator: null, radius:6, marker:null};
    obj.marker = L.circle([obj.lat,obj.lon],{
        radius: obj.radius,
        color: 'white',
        fillOpacity:0.4
    }).addTo(map).bindPopup(`${obj.name} - Libero`);
    objectives.push(obj);
    updateScoreboard();
}

function updateScoreboard(){
    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    objectives.forEach(o=>{
        const li = document.createElement("li");
        li.innerText = o.owner ? `${o.name} - Team ${o.owner} - ${o.operator}` : `${o.name} - Libero`;
        sb.appendChild(li);
    });
}

// ================================================
// AVVIO PARTITA
function startGame(){
    playerName = document.getElementById("playerName").value.trim();
    playerTeam = document.getElementById("teamSelect").value;
    isMaster = document.getElementById("isMaster").checked;

    if(!playerName){ alert("Inserisci nome"); return; }

    if(isMaster){
        const min = parseInt(document.getElementById("gameDuration").value);
        if(!min){ alert("Il master deve impostare il tempo"); return; }
        gameTime = min*60;
        startTimer();
    }

    gameStarted = true;
    lockInputs();
    addOperator();
}

function stopGame(){
    if(!isMaster) return alert("Solo il Master può fermare la partita!");
    clearInterval(timerInterval);
    gameStarted = false;
    document.getElementById("timer").innerText = "⛔ PARTITA TERMINATA";
}

function lockInputs(){
    document.getElementById("playerName").disabled=true;
    document.getElementById("teamSelect").disabled=true;
    document.getElementById("gameDuration").disabled=true;
    document.getElementById("isMaster").disabled=true;
}

function resetPlayer(){ location.reload(); }

// ================================================
// GPS
navigator.geolocation.watchPosition(
    pos=>{
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        document.getElementById("status").innerText = `📍 GPS attivo ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        if(!playerMarker){ playerMarker = L.marker([lat,lon]).addTo(map); }
        else{ playerMarker.setLatLng([lat,lon]); }
    },
    ()=>{document.getElementById("status").innerText="❌ GPS non disponibile";},
    {enableHighAccuracy:true}
);
