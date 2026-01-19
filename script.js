// ================= STATO GLOBALE =================
let gameStarted = false;
let isMaster = false;
let gameTime = 0;
let timerInterval = null;
let captureDuration = 10;

let playerName = "";
let playerTeam = "";
let playerMarker = null;

const operators = [];
const BIN_ID = "IL_TUO_BIN_ID"; // sostituisci con il tuo bin
const SECRET_KEY = "LA_TUA_MASTER_KEY"; // sostituisci con la tua key
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// ================= MAPPA =================
let map = L.map("map").setView([45.237763, 8.809708], 18);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19
}).addTo(map);

// ================= OBIETTIVI =================
const localObjectives = [
  {name:"OBJ 1", lat:45.2380, lon:8.8095},
  {name:"OBJ 2", lat:45.2381, lon:8.8096},
  {name:"OBJ 3", lat:45.2382, lon:8.8097},
  {name:"OBJ 4", lat:45.2383, lon:8.8098},
  {name:"OBJ 5", lat:45.2384, lon:8.8099},
  {name:"OBJ 6", lat:45.2385, lon:8.8100},
  {name:"OBJ 7", lat:45.2386, lon:8.8101},
  {name:"OBJ 8", lat:45.2387, lon:8.8102},
  {name:"OBJ 9", lat:45.2388, lon:8.8103},
  {name:"OBJ 10",lat:45.2389, lon:8.8104}
];

const objectives = localObjectives.map(o => ({
  ...o,
  owner: null,
  operator: null,
  radius: 6,
  marker: null,
  capturing: null
}));

objectives.forEach(obj => {
  obj.marker = L.circle([obj.lat, obj.lon], {
    radius: obj.radius,
    color: "white",
    fillOpacity: 0.4
  }).addTo(map).bindPopup(`${obj.name} - Libero`);
});

updateScoreboard();

// ================= START GAME =================
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("stopBtn").addEventListener("click", stopGame);

function startGame() {
  playerName = document.getElementById("playerName").value.trim();
  playerTeam = document.getElementById("teamSelect").value;
  isMaster = document.getElementById("isMaster").checked;

  if (!playerName) { alert("Inserisci nome"); return; }

  if(isMaster){
    document.getElementById("stopBtn").style.display = "inline-block";
    const min = parseInt(document.getElementById("gameDuration").value);
    if(!min || min <= 0){ alert("Il master deve impostare un tempo valido"); return; }
    gameTime = min*60;
    startTimer();
  }

  gameStarted = true;
  lockInputs();
  addOperator();
}

// ================= TIMER =================
function startTimer() {
  updateTimerUI();
  if(timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if(gameTime <= 0){
      clearInterval(timerInterval);
      gameStarted = false;
      document.getElementById("timer").innerText = "⛔ PARTITA TERMINATA";
      return;
    }
    gameTime--;
    updateTimerUI();
    checkObjectiveCapture();
    syncBin();
  }, 1000);
}

function updateTimerUI() {
  const m = Math.floor(gameTime/60);
  const s = gameTime%60;
  document.getElementById("timer").innerText = `⏱️ Tempo rimanente: ${m}:${s.toString().padStart(2,"0")}`;
}

// ================= FERMA PARTITA MASTER =================
function stopGame() {
  if(!isMaster) return;
  clearInterval(timerInterval);
  gameStarted = false;
  objectives.forEach(o=>o.capturing=null);
  document.getElementById("timer").innerText = "⏹️ PARTITA FERMA";
  alert("La partita è stata fermata dal Master!");
}

// ================= GPS =================
navigator.geolocation.watchPosition(
  pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    document.getElementById("status").innerText = `📍 GPS attivo ${lat.toFixed(5)}, ${lon.toFixed(5)}`;

    if(!playerMarker) playerMarker = L.marker([lat, lon]).addTo(map);
    else playerMarker.setLatLng([lat, lon]);
  },
  ()=>{ document.getElementById("status").innerText = "❌ GPS non disponibile"; },
  { enableHighAccuracy: true }
);

// ================= CONQUISTA OBJ =================
function checkObjectiveCapture() {
  if(!playerMarker) return;
  const playerPos = playerMarker.getLatLng();

  objectives.forEach(obj => {
    const distance = playerPos.distanceTo(obj.marker.getLatLng());
    if(distance <= obj.radius){
      if(!obj.owner || obj.owner !== playerTeam){
        if(!obj.capturing) obj.capturing = Date.now();
        const elapsed = (Date.now()-obj.capturing)/1000;
        if(elapsed>=captureDuration){
          obj.owner = playerTeam;
          obj.operator = playerName;
          obj.capturing = null;
          obj.marker.setStyle({color:playerTeamColor(playerTeam)});
          obj.marker.bindPopup(`${obj.name} - Team ${obj.owner} (${obj.operator})`);
        }
      }
    }else obj.capturing = null;
  });

  updateScoreboard();
}

// ================= HELPER =================
function playerTeamColor(team){ return {"1":"blue","2":"red"}[team]||"white"; }
function updateScoreboard(){
  const sb = document.getElementById("scoreboard");
  sb.innerHTML = "";
  objectives.forEach(o=>{
    const li = document.createElement("li");
    li.innerText = o.owner ? `${o.name} - Team ${o.owner} (${o.operator})` : `${o.name} - Libero`;
    sb.appendChild(li);
  });
}

function addOperator(){
  operators.push(playerName+(isMaster?" 👑":""));
  const ul = document.getElementById("operators");
  ul.innerHTML="";
  operators.forEach(op=>{
    const li = document.createElement("li");
    li.innerText = op;
    ul.appendChild(li);
  });
}

function lockInputs(){
  document.getElementById("playerName").disabled = true;
  document.getElementById("teamSelect").disabled = true;
  document.getElementById("gameDuration").disabled = true;
  document.getElementById("isMaster").disabled = true;
}

// ================= RESET =================
function resetPlayer(){ location.reload(); }

// ================= SYNC JSONBIN =================
async function syncBin(){
  if(!isMaster) return;
  const payload = {
    gameTime: gameTime,
    objectives: objectives.map(o=>({name:o.name, owner:o.owner, operator:o.operator})),
    operators: operators
  };
  try{
    await fetch(JSONBIN_URL, {
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        "X-Master-Key":SECRET_KEY
      },
      body: JSON.stringify(payload)
    });
  }catch(e){ console.log("Errore sync bin:",e); }
}
