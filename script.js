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
let masterPassword = "71325";
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

predefinedObjectives.forEach(o=>{
  const obj = {...o, owner:null, operator:null, radius:6, marker:null, captureTimer:0};
  obj.marker = L.circle([obj.lat,obj.lon],{
      radius: obj.radius,
      color: 'white',
      fillOpacity:0.4
  }).addTo(map).bindPopup(`${obj.name} - Libero`);
  objectives.push(obj);
});

// ================================================
// FUNZIONI BIN ONLINE
async function loadBin(){
  try{
    const res = await fetch(JSONBIN_URL + "/latest", { headers: {"X-Master-Key": SECRET_KEY} });
    const data = await res.json();
    const record = data.record;
    gameStarted = record.gameStarted;
    gameTime = record.gameTime;
    objectives.forEach((o,i)=>{
      if(record.objectives[i]){
        o.owner = record.objectives[i].owner;
        o.operator = record.objectives[i].operator;
        updateObjectiveMarker(o);
      }
    });
    updateOperatorsUI(record.operators);
    if(gameStarted && !timerInterval){ startTimer(); }
  }catch(e){ console.log("Errore caricamento bin:", e);}
}

async function updateBin(){
  const payload = {
    gameStarted,
    gameTime,
    operators,
    objectives: objectives.map(o=>({name:o.name,lat:o.lat,lon:o.lon,owner:o.owner,operator:o.operator}))
  };
  try{
    await fetch(JSONBIN_URL, {
      method: "PUT",
      headers: {
        "X-Master-Key": SECRET_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  }catch(e){ console.log("Errore aggiornamento bin:", e);}
}

// ================================================
// START / STOP PARTITA
function startGame(){
  playerName = document.getElementById("playerName").value.trim();
  playerTeam = document.getElementById("teamSelect").value;
  const pw = document.getElementById("masterPassword").value.trim();
  isMaster = pw === masterPassword;

  if(!playerName){ alert("Inserisci nome"); return; }
  if(isMaster){
    const min = parseInt(document.getElementById("gameDuration").value);
    if(!min){ alert("Il master deve impostare il tempo"); return; }
    gameTime = min*60;
    gameStarted = true;
    startTimer();
    lockInputs();
    addOperator();
    updateBin();
  } else {
    joinGame();
  }
}

// Ingresso giocatore normale se partita già avviata
function joinGame(){
  if(!gameStarted){ alert("La partita non è ancora iniziata dal Master"); return; }
  addOperator();
  updateBin();
  alert("Sei entrato nella partita!");  
}

function stopGame(){
  if(!isMaster) return alert("Solo il Master può fermare la partita!");
  clearInterval(timerInterval);
  gameStarted=false;
  document.getElementById("timer").innerText="⛔ PARTITA TERMINATA";
  updateBin();
}

// ================================================
// TIMER DI PARTITA
function startTimer(){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval=setInterval(()=>{
    if(gameTime<=0){
      clearInterval(timerInterval);
      gameStarted=false;
      document.getElementById("timer").innerText="⛔ PARTITA TERMINATA";
      updateBin();
      return;
    }
    gameTime--;
    const m=Math.floor(gameTime/60);
    const s=gameTime%60;
    document.getElementById("timer").innerText=`⏱️ Tempo: ${m}:${s.toString().padStart(2,"0")}`;
  },1000);
}

// ================================================
// GESTIONE OPERATORI
function addOperator(){
  const nameLabel = playerName + (isMaster?" 👑":"");
  if(!operators.includes(nameLabel)){ operators.push(nameLabel); }
  updateOperatorsUI();
}

function updateOperatorsUI(list=operators){
  const ul=document.getElementById("operators");
  ul.innerHTML="";
  list.forEach(op=>{
    const li=document.createElement("li");
    li.innerText=op;
    ul.appendChild(li);
  });
}

// ================================================
// GESTIONE OBIETTIVI
function updateObjectiveMarker(obj){
  obj.marker.setStyle({color: obj.owner? (obj.owner==="1"?"blue":"red"):"white"});
  obj.marker.bindPopup(`${obj.name} - ${obj.owner? "Team "+obj.owner + " - "+obj.operator:"Libero"}`);
}

function resetPlayer(){ location.reload(); }

// ================================================
// GPS
navigator.geolocation.watchPosition(
  pos=>{
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    document.getElementById("status").innerText=`📍 GPS attivo ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    if(!playerMarker){ playerMarker = L.marker([lat,lon]).addTo(map);}
    else{ playerMarker.setLatLng([lat,lon]); }
  },
  ()=>{document.getElementById("status").innerText="❌ GPS non disponibile";},
  {enableHighAccuracy:true}
);

// ================================================
// AUTOLOAD ONLINE
setInterval(loadBin,2000);
