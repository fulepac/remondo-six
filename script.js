// ================= CONFIG JSONBIN.IO =================
const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// ================= STATO GLOBALE ================= 
let gameStarted = false;
let isMaster = false;
let gameTime = 0;
let timerInterval = null;

let playerName = "";
let playerTeam = "";
let playerMarker = null;

let operators = []; // lista operatori locali
let globalState = null; // stato globale sincronizzato con JSONBin

// ================= MAPPA =================
const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

// ================= OBIETTIVI PREDEFINITI =================
const objectives = [
  {name:"PF1", lat:45.238376, lon:8.810060, owner:null, operator:null, radius:6, marker:null},
  {name:"PF2", lat:45.237648, lon:8.810941, owner:null, operator:null, radius:6, marker:null},
  {name:"PF3", lat:45.238634, lon:8.808772, owner:null, operator:null, radius:6, marker:null},
  {name:"PF4", lat:45.237771, lon:8.809208, owner:null, operator:null, radius:6, marker:null},
  {name:"PF5", lat:45.237995, lon:8.808303, owner:null, operator:null, radius:6, marker:null}
];

// aggiunge i marker sulla mappa
objectives.forEach(obj => {
  obj.marker = L.circle([obj.lat, obj.lon], {
    radius: obj.radius,
    color: "white",
    fillOpacity: 0.4
  }).addTo(map).bindPopup(`${obj.name} - Libero`);
});

updateScoreboard();

// ================= FUNZIONI JSONBIN =================
async function fetchState() {
  try {
    const res = await fetch(JSONBIN_URL + "/latest", {
      headers: { "X-Master-Key": SECRET_KEY }
    });
    const data = await res.json();
    globalState = data.record;
    // sincronizza locale
    if (globalState.timer) gameTime = globalState.timer;
    if (globalState.operators) operators = globalState.operators;
    updateOperatorsList();
    updateScoreboard();
  } catch(e){ console.log("Fetch error:", e);}
}

async function saveState() {
  if (!globalState) return;
  globalState.timer = gameTime;
  globalState.operators = operators;
  globalState.objectives = objectives.map(o => ({
    name:o.name, owner:o.owner, operator:o.operator
  }));
  try {
    await fetch(JSONBIN_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": SECRET_KEY
      },
      body: JSON.stringify(globalState)
    });
  } catch(e){ console.log("Save error:", e);}
}

// ================= START GAME =================
async function startGame() {
  playerName = document.getElementById("playerName").value.trim();
  playerTeam = document.getElementById("teamSelect").value;
  isMaster = document.getElementById("isMaster").checked;

  if (!playerName) { alert("Inserisci nome"); return; }
  if (isMaster) {
    const min = parseInt(document.getElementById("gameDuration").value);
    if (!min) { alert("Il master deve impostare il tempo"); return; }
    gameTime = min*60;
    gameStarted = true;

    globalState = {
      timer: gameTime,
      operators: [],
      objectives: objectives.map(o => ({name:o.name, owner:null, operator:null}))
    };

    startTimer();
    await saveState();
  }
  joinGame();
}

// ================= JOIN GAME =================
async function joinGame() {
  if (!playerName) { alert("Inserisci nome"); return; }
  gameStarted = true;
  lockInputs();

  // aggiunge operatore locale
  const opEntry = {name:playerName, team:playerTeam, isMaster:isMaster};
  if (!operators.find(o => o.name===playerName)) operators.push(opEntry);
  await fetchState(); 
  await saveState();
}

// ================= TIMER =================
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(async ()=>{
    if (!gameStarted) return;
    if (gameTime<=0) {
      clearInterval(timerInterval);
      document.getElementById("timer").innerText="⛔ PARTITA TERMINATA";
      gameStarted=false;
      return;
    }
    gameTime--;
    const m = Math.floor(gameTime/60);
    const s = gameTime%60;
    document.getElementById("timer").innerText=`⏱️ Tempo: ${m}:${s.toString().padStart(2,"0")}`;
    await saveState();
  },1000);
}

// ================= FERMA PARTITA (Master) =================
async function stopGame() {
  if (!isMaster) { alert("Solo il Master può fermare la partita"); return; }
  gameStarted=false;
  clearInterval(timerInterval);
  document.getElementById("timer").innerText="⛔ PARTITA TERMINATA";
  await saveState();
}

// ================= RESET COMPLETO (Master) =================
async function resetGame() {
  if (!isMaster) { alert("Solo il Master può resettare la partita"); return; }
  gameStarted=false;
  clearInterval(timerInterval);
  gameTime=0;
  operators=[];
  objectives.forEach(o=>{o.owner=null;o.operator=null;});
  document.getElementById("timer").innerText="⏱️ In attesa…";
  await saveState();
  updateOperatorsList();
  updateScoreboard();
}

// ================= GPS =================
navigator.geolocation.watchPosition(pos=>{
  const lat=pos.coords.latitude;
  const lon=pos.coords.longitude;
  document.getElementById("status").innerText=`📍 GPS attivo ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  if (!playerMarker) { playerMarker=L.marker([lat,lon]).addTo(map); }
  else { playerMarker.setLatLng([lat,lon]); }
},()=>{ document.getElementById("status").innerText="❌ GPS non disponibile"; },{ enableHighAccuracy:true });

// ================= UI =================
function updateScoreboard() {
  const sb=document.getElementById("scoreboard");
  sb.innerHTML="";
  objectives.forEach(o=>{
    const li=document.createElement("li");
    li.innerText=o.owner?`${o.name} - ${o.operator} (${o.owner})`:`${o.name} - Libero`;
    sb.appendChild(li);
  });
}

function updateOperatorsList() {
  const ul=document.getElementById("operators");
  ul.innerHTML="";
  operators.forEach(op=>{
    const li=document.createElement("li");
    li.innerText=op.name + " - " + op.team + (op.isMaster?" 👑":"");
    ul.appendChild(li);
  });
}

function lockInputs() {
  document.getElementById("playerName").disabled=true;
  document.getElementById("teamSelect").disabled=true;
  document.getElementById("gameDuration").disabled=true;
  document.getElementById("isMaster").disabled=true;
}

function resetPlayer() { location.reload(); }

// ================= SINCRONIZZAZIONE PERIODICA =================
setInterval(fetchState, 3000); // ogni 3 secondi aggiorna stato globale
