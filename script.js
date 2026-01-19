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
let operators = [];
let objectives = [];

// ================= MAPPA =================
const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{ maxZoom: 19 }).addTo(map);

// ================= OBIETTIVI =================
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

// ================= LOGIN =================
function login(){
  const name = document.getElementById("name").value.trim();
  const team = document.getElementById("team").value;
  const pass = document.getElementById("masterpass").value.trim();

  if(!name){ alert("Inserisci il nome"); return; }

  isMaster = pass === "71325";
  playerName = name;
  playerTeam = team;

  document.getElementById("login").classList.add("hidden");
  document.getElementById("map").classList.remove("hidden");
  document.getElementById("info").classList.remove("hidden");

  if(isMaster){ document.getElementById("masterPanel").classList.remove("hidden"); }

  addOperator();
  fetchGameState();
}

// ================= TIMER =================
function startMatch(){
  if(!isMaster) return alert("Solo il Master può avviare la partita!");
  const min = parseInt(document.getElementById("matchTime").value);
  if(!min){ alert("Inserisci la durata"); return; }

  gameTime = min*60;
  gameStarted = true;
  startTimer();
}

function startTimer(){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
      if(gameTime<=0){ clearInterval(timerInterval); gameStarted=false; document.getElementById("timer").innerText="⛔ PARTITA TERMINATA"; return; }
      gameTime--;
      const m = Math.floor(gameTime/60);
      const s = gameTime%60;
      document.getElementById("timer").innerText=`⏱️ ${m}:${s.toString().padStart(2,"0")}`;
  },1000);
}

function stopMatch(){
  if(!isMaster) return alert("Solo il Master può fermare la partita!");
  clearInterval(timerInterval);
  gameStarted=false;
  document.getElementById("timer").innerText="⛔ PARTITA TERMINATA";
}

// ================= OPERATORS =================
function addOperator(){
  const op = playerName + (isMaster ? " 👑" : "");
  if(!operators.includes(op)) operators.push(op);
  updateOperatorsUI();
}

function updateOperatorsUI(){
  const ul = document.getElementById("players");
  ul.innerHTML="";
  operators.forEach(op=>{
    const li=document.createElement("li");
    li.innerText=op;
    ul.appendChild(li);
  });
}

// ================= SCOREBOARD =================
function updateScoreboard(){
  const sb = document.getElementById("scoreboard");
  sb.innerHTML="";
  objectives.forEach(o=>{
    const li = document.createElement("li");
    li.innerText=o.owner ? `${o.name} - ${o.owner} - ${o.operator}`:`${o.name} - Libero`;
    sb.appendChild(li);
  });
}

// ================= GPS =================
navigator.geolocation.watchPosition(
  pos=>{
    const lat=pos.coords.latitude;
    const lon=pos.coords.longitude;
    document.getElementById("status").innerText=`📍 GPS attivo ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    if(!playerMarker){ playerMarker=L.marker([lat,lon]).addTo(map); }
    else{ playerMarker.setLatLng([lat,lon]); }
  },
  ()=>{document.getElementById("status").innerText="❌ GPS non disponibile";},
  {enableHighAccuracy:true}
);

// ================= RESET =================
function resetAll(){ if(!isMaster) return alert("Solo Master"); location.reload(); }

// ================= FETCH GAME STATE ONLINE =================
function fetchGameState(){
  // Qui puoi implementare la logica per leggere da JSONBin in loop
  // e aggiornare operators, gameTime, obiettivi in tempo reale
  // (fetch + setInterval 5s)
}
