// ================= CONFIG JSONBIN =================
const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// ================= VARIABILI =================
let isMaster = false;
let playerName = "";
let playerTeam = "";
let playerMarker = null;

// ================= MAPPA =================
const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);

// ================= OBIETTIVI =================
const objectives = [
  {name:"PF1", lat:45.238376, lon:8.810060},
  {name:"PF2", lat:45.237648, lon:8.810941},
  {name:"PF3", lat:45.238634, lon:8.808772},
  {name:"PF4", lat:45.237771, lon:8.809208},
  {name:"PF5", lat:45.237995, lon:8.808303}
];

objectives.forEach(o=>{
  o.owner=null;
  o.captureStart=null;
  o.marker=L.circle([o.lat,o.lon],{
    radius:6,color:"white",fillOpacity:0.4
  }).addTo(map).bindPopup(o.name);
});

// ================= DISTANZA =================
function dist(a,b,c,d){
  const R=6371000;
  const dLat=(c-a)*Math.PI/180;
  const dLon=(d-b)*Math.PI/180;
  return R*2*Math.asin(Math.sqrt(
    Math.sin(dLat/2)**2+
    Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLon/2)**2
  ));
}

// ================= START GAME =================
async function startGame(){
  playerName=document.getElementById("playerName").value;
  playerTeam=document.getElementById("teamSelect").value;
  isMaster=document.getElementById("isMaster").checked;

  if(isMaster && document.getElementById("masterPass").value!=="71325"){
    alert("Password master errata"); return;
  }

  const res=await fetch(JSONBIN_URL+"/latest",{headers:{"X-Master-Key":SECRET_KEY}});
  const data=await res.json();

  if(isMaster){
    data.record.game={
      started:true,
      start:Date.now(),
      duration:parseInt(document.getElementById("gameDuration").value)*60,
      score:{RED:0,BLUE:0},
      lastTick:Date.now()
    };
  }

  data.record.players[playerName]={
    team:playerTeam,lat:null,lon:null
  };

  await fetch(JSONBIN_URL,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      "X-Master-Key":SECRET_KEY
    },
    body:JSON.stringify(data.record)
  });
}

// ================= GPS =================
navigator.geolocation.watchPosition(p=>{
  const lat=p.coords.latitude;
  const lon=p.coords.longitude;

  document.getElementById("status").innerText=`📍 ${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  if(!playerMarker){
    playerMarker=L.marker([lat,lon]).addTo(map);
  } else playerMarker.setLatLng([lat,lon]);

  syncPlayer(lat,lon);
});

// ================= SYNC =================
async function syncPlayer(lat,lon){
  const res=await fetch(JSONBIN_URL+"/latest",{headers:{"X-Master-Key":SECRET_KEY}});
  const data=res?await res.json():null;
  if(!data)return;

  if(data.record.players[playerName]){
    data.record.players[playerName].lat=lat;
    data.record.players[playerName].lon=lon;
  }

  // TIMER
  if(data.record.game?.started){
    const rem=data.record.game.duration-
      Math.floor((Date.now()-data.record.game.start)/1000);
    document.getElementById("timer").innerText=
      rem>0?`⏱️ ${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,"0")}`:"⛔ FINE";
  }

  // CONQUISTA + PUNTEGGIO (MASTER)
  if(isMaster){
    objectives.forEach(o=>{
      const inside=[];
      Object.values(data.record.players).forEach(pl=>{
        if(pl.lat && dist(o.lat,o.lon,pl.lat,pl.lon)<=6) inside.push(pl.team);
      });
      const uniq=[...new Set(inside)];
      if(uniq.length===1){
        if(!o.captureStart) o.captureStart=Date.now();
        if(Date.now()-o.captureStart>=180000) o.owner=uniq[0];
      } else o.captureStart=null;
    });

    if(Date.now()-data.record.game.lastTick>30000){
      objectives.forEach(o=>{
        if(o.owner) data.record.game.score[o.owner]++;
      });
      data.record.game.lastTick=Date.now();
    }

    await fetch(JSONBIN_URL,{
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        "X-Master-Key":SECRET_KEY
      },
      body:JSON.stringify(data.record)
    });
  }

  updateUI(data.record);
}

// ================= UI =================
function updateUI(data){
  document.getElementById("score").innerText=
    `🔴 ${data.game.score.RED} | 🔵 ${data.game.score.BLUE}`;

  const sb=document.getElementById("scoreboard");
  sb.innerHTML="";
  objectives.forEach(o=>{
    o.marker.setStyle({color:o.owner==="RED"?"red":o.owner==="BLUE"?"blue":"white"});
    sb.innerHTML+=`<li>${o.name}: ${o.owner||"Libero"}</li>`;
  });

  const op=document.getElementById("operators");
  op.innerHTML="";
  Object.entries(data.players).forEach(([n,p])=>{
    op.innerHTML+=`<li>${n} (${p.team})</li>`;
  });

  drawRadar(data.players);
}

// ================= RADAR =================
function drawRadar(players){
  const r=document.getElementById("radar");
  r.innerHTML="";
  Object.values(players).forEach(p=>{
    if(!p.lat||!playerMarker)return;
    const d=dist(
      playerMarker.getLatLng().lat,
      playerMarker.getLatLng().lng,
      p.lat,p.lon
    );
    if(d>50)return;
    const dot=document.createElement("div");
    dot.style.left=100+(Math.random()*80-40)+"px";
    dot.style.top=100+(Math.random()*80-40)+"px";
    dot.style.background=p.team===playerTeam?"lime":"red";
    r.appendChild(dot);
  });
}

// ================= RESET =================
async function resetBin(){
  if(!isMaster)return;
  await fetch(JSONBIN_URL,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      "X-Master-Key":SECRET_KEY
    },
    body:JSON.stringify({game:{},players:{}})
  });
  location.reload();
}

function stopGame(){ if(isMaster) resetBin(); }
