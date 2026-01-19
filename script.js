// ================= CONFIG =================
const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const MASTER_PASSWORD = "71325";

// ================= STATO =================
let gameStarted = false;
let isMaster = false;
let gameTime = 0;
let timerInterval = null;

let playerName = "";
let playerTeam = "";
let playerMarker = null;

let operators = [];
let globalState = null;

// ================= MAPPA =================
const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

// ================= OBIETTIVI =================
const objectives = [
  {name:"PF1", lat:45.238376, lon:8.810060},
  {name:"PF2", lat:45.237648, lon:8.810941},
  {name:"PF3", lat:45.238634, lon:8.808772},
  {name:"PF4", lat:45.237771, lon:8.809208},
  {name:"PF5", lat:45.237995, lon:8.808303}
].map(o => ({...o, owner:null, operator:null, radius:6, marker:null}));

objectives.forEach(o => {
  o.marker = L.circle([o.lat,o.lon], {
    radius:o.radius,
    color:"white",
    fillOpacity:0.4
  }).addTo(map).bindPopup(`${o.name} - Libero`);
});

// ================= JSONBIN =================
async function fetchState() {
  const res = await fetch(JSONBIN_URL + "/latest", {
    headers: { "X-Master-Key": SECRET_KEY }
  });
  const data = await res.json();
  globalState = data.record;

  if (globalState.started) {
    gameStarted = true;
    gameTime = globalState.timer;
    operators = globalState.operators || [];
    updateOperatorsList();
    updateTimerUI();
  }
}

async function saveState() {
  await fetch(JSONBIN_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": SECRET_KEY
    },
    body: JSON.stringify({
      started: gameStarted,
      timer: gameTime,
      operators
    })
  });
}

// ================= START =================
async function startGame() {
  playerName = playerName || document.getElementById("playerName").value.trim();
  playerTeam = document.getElementById("teamSelect").value;

  if (!playerName) return alert("Inserisci nome");

  const wantMaster = document.getElementById("isMaster").checked;
  const pwd = document.getElementById("masterPassword").value;

  if (wantMaster) {
    if (pwd !== MASTER_PASSWORD) {
      alert("❌ Password Master errata");
      return;
    }
    isMaster = true;
  }

  await fetchState();

  if (isMaster && !gameStarted) {
    const min = parseInt(document.getElementById("gameDuration").value);
    if (!min) return alert("Inserisci durata");

    gameTime = min * 60;
    gameStarted = true;
    startTimer();
  }

  if (!operators.find(o => o.name === playerName)) {
    operators.push({ name:playerName, team:playerTeam, master:isMaster });
  }

  lockInputs();
  await saveState();
}

// ================= TIMER =================
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(async () => {
    if (!gameStarted) return;
    if (gameTime <= 0) {
      clearInterval(timerInterval);
      document.getElementById("timer").innerText = "⛔ PARTITA TERMINATA";
      gameStarted = false;
      await saveState();
      return;
    }
    gameTime--;
    updateTimerUI();
    await saveState();
  },1000);
}

function updateTimerUI() {
  const m = Math.floor(gameTime/60);
  const s = gameTime%60;
  document.getElementById("timer").innerText = `⏱️ ${m}:${s.toString().padStart(2,"0")}`;
}

// ================= STOP / RESET =================
async function stopGame() {
  if (!isMaster) return alert("Solo Master");
  gameStarted = false;
  clearInterval(timerInterval);
  document.getElementById("timer").innerText = "⛔ PARTITA TERMINATA";
  await saveState();
}

async function resetGame() {
  if (!isMaster) return alert("Solo Master");
  gameStarted = false;
  gameTime = 0;
  operators = [];
  document.getElementById("timer").innerText = "⏱️ In attesa…";
  await saveState();
  updateOperatorsList();
}

function resetPlayer() { location.reload(); }

// ================= GPS =================
navigator.geolocation.watchPosition(pos=>{
  const lat=pos.coords.latitude, lon=pos.coords.longitude;
  document.getElementById("status").innerText = `📍 ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  if (!playerMarker) playerMarker = L.marker([lat,lon]).addTo(map);
  else playerMarker.setLatLng([lat,lon]);
});

// ================= UI =================
function updateOperatorsList() {
  const ul = document.getElementById("operators");
  ul.innerHTML = "";
  operators.forEach(o=>{
    const li=document.createElement("li");
    li.innerText = `${o.name} - ${o.team}${o.master?" 👑":""}`;
    ul.appendChild(li);
  });
}

function lockInputs() {
  ["playerName","teamSelect","gameDuration","isMaster","masterPassword"]
    .forEach(id=>document.getElementById(id).disabled=true);
}

setInterval(fetchState,3000);
