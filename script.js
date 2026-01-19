// ================================================
// CONFIG JSONBIN.IO
const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

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
let points = {ROSSI:0, BLU:0};

// ================================================
// MAPPA
const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);

// ================================================
// OBIETTIVI PREDEFINITI
const predefinedObjectives = [
  {name:"PF1", lat:45.238376, lon:8.810060},
  {name:"PF2", lat:45.237648, lon:8.810941},
  {name:"PF3", lat:45.238634, lon:8.808772},
  {name:"PF4", lat:45.237771, lon:8.809208},
  {name:"PF5", lat:45.237995, lon:8.808303}
];

predefinedObjectives.forEach(o=>{
    const obj = {...o, owner:null, operator:null, radius:6, marker:null};
    obj.marker = L.circle([obj.lat,o.lon],{
        radius: obj.radius,
        color:'white',
        fillOpacity:0.4
    }).addTo(map).bindPopup(`${obj.name} - Libero`);
    objectives.push(obj);
});

updateScoreboard();
updateOperatorsUI();

// ================================================
// FUNZIONI BASE
function joinGame(){
    playerName = document.getElementById("playerName").value.trim();
    playerTeam = document.getElementById("teamSelect").value;
    const pass = document.getElementById("masterPass").value;

    if(!playerName){ alert("Inserisci nome"); return; }

    if(pass === "71325"){
        isMaster = true;
        document.getElementById("masterPanel").classList.remove("hidden");
        alert("Accesso come Master");
    }

    addOperator();
}

// ================================================
// MASTER
function startGame(){
    if(!isMaster){ alert("Solo il Master può avviare la partita!"); return; }
    const duration = parseInt(document.getElementById("gameDuration").value);
    if(!duration){ alert("Imposta durata partita"); return; }

    gameTime = duration*60;
    gameStarted = true;
    lockInputs();
    startTimer();
    document.getElementById("status").innerText="Partita iniziata dal Master!";
}

function stopGame(){
    if(!isMaster){ alert("Solo Master!"); return; }
    clearInterval(timerInterval);
    gameStarted = false;
    document.getElementById("timer").innerText="⛔ PARTITA TERMINATA";
    document.getElementById("status").innerText="Partita fermata dal Master!";
}

function resetAll(){
    if(!isMaster){ alert("Solo Master!"); return; }
    location.reload();
}

function lockInputs(){
    document.getElementById("playerName").disabled=true;
    document.getElementById("teamSelect").disabled=true;
    document.getElementById("gameDuration").disabled=true;
    document.getElementById("masterPass").disabled=true;
}

// ================================================
// TIMER
function startTimer(){
    timerInterval=setInterval(()=>{
        if(gameTime<=0){ 
            clearInterval(timerInterval); 
            gameStarted=false; 
            document.getElementById("timer").innerText="⛔ PARTITA TERMINATA"; 
            document.getElementById("status").innerText="Partita terminata"; 
            return; 
        }
        gameTime--;
        const m = Math.floor(gameTime/60);
        const s = gameTime%60;
        document.getElementById("timer").innerText=`⏱️ Tempo: ${m}:${s.toString().padStart(2,"0")}`;
    },1000);
}

// ================================================
// OPERATORI
function addOperator(){
    const label = playerName + (isMaster?" 👑":"");
    if(!operators.includes(label)) operators.push(label);
    updateOperatorsUI();
}

function updateOperatorsUI(){
    const ul = document.getElementById("operatorsList");
    ul.innerHTML="";
    operators.forEach(op=>{
        const li=document.createElement("li");
        li.innerText=op;
        ul.appendChild(li);
    });
}

// ================================================
// OBIETTIVI
function updateScoreboard(){
    const sb = document.getElementById("scoreboard");
    sb.innerHTML="";
    objectives.forEach(o=>{
        const li=document.createElement("li");
        li.innerText = o.owner ? `${o.name} - Team ${o.owner} - ${o.operator}` : `${o.name} - Libero`;
        sb.appendChild(li);
    });
}

// ================================================
// GPS
navigator.geolocation.watchPosition(
    pos=>{
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        document.getElementById("status").innerText = `📍 GPS attivo ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        if(!playerMarker){ playerMarker=L.marker([lat,lon]).addTo(map);}
        else{playerMarker.setLatLng([lat,lon]);}
    },
    ()=>{document.getElementById("status").innerText="❌ GPS non disponibile";},
    {enableHighAccuracy:true}
);
