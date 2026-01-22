// TEST DI CARICAMENTO - Se vedi questo, JS funziona
console.log("Script caricato correttamente");

const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { 
    isMaster: false, 
    playerName: "", 
    playerTeam: "", 
    playerMarker: null, 
    teamsConfig: [{name:"RED", color:"#ff0000"}, {name:"BLUE", color:"#00ffff"}] 
};

// QUESTA FUNZIONE DEVE ESSERE DISPONIBILE SUBITO
function showLogin(role) {
    console.log("Pulsante cliccato: " + role);
    document.getElementById("role-selection").style.display = "none";
    document.getElementById("menu").style.display = "block";
    state.isMaster = (role === 'MASTER');
    document.getElementById("master-only-fields").style.display = state.isMaster ? "block" : "none";
    document.getElementById("player-only-fields").style.display = state.isMaster ? "none" : "block";
}

function backToRoles() {
    document.getElementById("role-selection").style.display = "flex";
    document.getElementById("menu").style.display = "none";
}

function toggleInstructions(show) {
    document.getElementById("modal-instructions").style.display = show ? "block" : "none";
}

// Inizializza tutto al caricamento
window.onload = function() {
    console.log("Inizializzazione UI...");
    const select = document.getElementById("teamSelect");
    if(select) {
        select.innerHTML = state.teamsConfig.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    }
    // Prova a connettersi ma non blocca se fallisce
    checkStatus();
};

async function checkStatus() {
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: {"X-Master-Key": SECRET_KEY} });
        const data = await res.json();
        if(data.record) document.getElementById("gameStatusBanner").innerText = "CONNESSO";
    } catch(e) {
        document.getElementById("gameStatusBanner").innerText = "OFFLINE";
    }
}

// ... Resto del codice (startGame, map, etc.) che abbiamo scritto prima

window.onload = () => {
    initSlotUI();
    checkStatus();
};
