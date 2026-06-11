const state = {
  socket: null,
  myId: null,
  myName: localStorage.getItem("black-cord-name") || "",
  users: [],
  channels: { voice1: [], voice2: [] },
  currentVoice: null,
  localStream: null,
  muted: false,
  reconnectTimer: null,
  peers: new Map()
};

const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

const $ = selector => document.querySelector(selector);

const chatLog = $("#chatLog");
const connectionStatus = $("#connectionStatus");
const login = $("#login");
const loginForm = $("#loginForm");
const nameInput = $("#nameInput");
const chatForm = $("#chatForm");
const messageInput = $("#messageInput");
const userList = $("#userList");
const profileName = $("#profileName");
const profileAvatar = $("#profileAvatar");
const voiceStatus = $("#voiceStatus");
const voiceBar = $("#voiceBar");
const currentVoiceName = $("#currentVoiceName");
const currentVoicePeople = $("#currentVoicePeople");
const speakingList = $("#speakingList");
const muteButton = $("#muteButton");
const muteIcon = $("#muteIcon");
const leaveVoiceButton = $("#leaveVoiceButton");

nameInput.value = state.myName;
profileName.textContent = state.myName || "Misafir";
profileAvatar.textContent = initials(state.myName);

connect();
registerServiceWorker();

if (state.myName) {
  showApp();
}

loginForm.addEventListener("submit", event => {
  event.preventDefault();

  const name = nameInput.value.trim().slice(0, 24);
  if (!name) {
    nameInput.focus();
    return;
  }

  state.myName = name;
  localStorage.setItem("black-cord-name", name);
  showApp();
  send("join", { name });
});

chatForm.addEventListener("submit", event => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text) return;

  if (!isConnected()) {
    systemMessage("Baglanti kurulunca tekrar dene.");
    return;
  }

  send("chat", { text });
  messageInput.value = "";
});

document.querySelectorAll("[data-voice-channel]").forEach(button => {
  button.addEventListener("click", () => joinVoice(button.dataset.voiceChannel));
});

muteButton.addEventListener("click", () => {
  if (!state.localStream) return;

  state.muted = !state.muted;
  for (const track of state.localStream.getAudioTracks()) {
    track.enabled = !state.muted;
  }
  renderVoiceControls();
});

leaveVoiceButton.addEventListener("click", () => leaveVoice());

window.addEventListener("beforeunload", () => {
  if (state.socket?.readyState === WebSocket.OPEN) {
    send("leaveVoice", {});
    state.socket.close();
  }
});

function connect() {
  clearTimeout(state.reconnectTimer);

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  state.socket = new WebSocket(`${protocol}//${location.host}`);
  connectionStatus.textContent = "Baglaniyor...";

  state.socket.addEventListener("open", () => {
    connectionStatus.textContent = "Baglandi";
    if (state.myName) send("join", { name: state.myName });
  });

  state.socket.addEventListener("close", () => {
    connectionStatus.textContent = "Koptu, tekrar deneniyor";
    cleanupVoice(true);
    state.reconnectTimer = setTimeout(connect, 1500);
  });

  state.socket.addEventListener("error", () => {
    connectionStatus.textContent = "Baglanti hatasi";
  });

  state.socket.addEventListener("message", event => {
    try {
      handleServerMessage(JSON.parse(event.data));
    } catch {
      systemMessage("Sunucudan gecersiz veri geldi.");
    }
  });
}

function handleServerMessage(message) {
  switch (message.type) {
    case "hello":
      state.myId = message.id;
      renderHistory(message.history || []);
      break;

    case "joined":
      state.myId = message.id;
      state.myName = message.name;
      profileName.textContent = message.name;
      profileAvatar.textContent = initials(message.name);
      break;

    case "state":
      state.users = message.users || [];
      state.channels = message.channels || { voice1: [], voice2: [] };
      renderUsers();
      renderChannels();
      renderVoiceControls();
      break;

    case "chat":
      appendMessage(message);
      break;

    case "voicePeers":
      state.currentVoice = message.channel;
      renderVoiceControls();
      for (const peer of message.peers || []) {
        createPeer(peer.id, true);
      }
      break;

    case "peerJoined":
      if (message.channel === state.currentVoice && message.peer?.id) {
        createPeer(message.peer.id, false);
      }
      break;

    case "peerLeft":
      closePeer(message.peerId);
      break;

    case "signal":
      handleSignal(message.from, message.signal);
      break;

    case "error":
      systemMessage(message.message || "Bir hata olustu.");
      break;
  }
}

async function joinVoice(channel) {
  if (state.currentVoice === channel) return;

  if (!isConnected()) {
    systemMessage("Ses kanalina girmek icin sunucu baglantisi gerekli.");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    systemMessage("Bu tarayici mikrofonu desteklemiyor.");
    return;
  }

  try {
    if (!state.localStream) {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    }

    cleanupPeers();
    state.currentVoice = channel;
    state.muted = false;
    send("joinVoice", { channel });
    renderVoiceControls();
  } catch {
    systemMessage("Mikrofon izni alinamadi. Tarayici veya Windows mikrofon iznini kontrol et.");
  }
}

function leaveVoice(sendToServer = true) {
  if (sendToServer) send("leaveVoice", {});
  cleanupVoice(true);
}

function cleanupVoice(stopTracks) {
  cleanupPeers();

  if (stopTracks && state.localStream) {
    for (const track of state.localStream.getTracks()) track.stop();
    state.localStream = null;
  }

  state.currentVoice = null;
  state.muted = false;
  renderVoiceControls();
}

function cleanupPeers() {
  for (const peerId of [...state.peers.keys()]) {
    closePeer(peerId);
  }
}

function createPeer(peerId, shouldOffer) {
  if (!state.localStream) return null;
  if (state.peers.has(peerId)) return state.peers.get(peerId).pc;

  const pc = new RTCPeerConnection({ iceServers });
  const audio = new Audio();
  audio.autoplay = true;
  audio.playsInline = true;

  state.localStream.getTracks().forEach(track => pc.addTrack(track, state.localStream));

  pc.onicecandidate = event => {
    if (event.candidate) {
      send("signal", { to: peerId, signal: { candidate: event.candidate } });
    }
  };

  pc.ontrack = event => {
    audio.srcObject = event.streams[0];
    audio.play().catch(() => {});
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      closePeer(peerId);
    }
  };

  state.peers.set(peerId, { pc, audio, candidates: [] });
  renderVoiceControls();

  if (shouldOffer) {
    createOffer(peerId, pc);
  }

  return pc;
}

async function createOffer(peerId, pc) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send("signal", { to: peerId, signal: { description: pc.localDescription } });
  } catch {
    closePeer(peerId);
  }
}

async function handleSignal(peerId, signal) {
  if (!peerId || !signal) return;

  const pc = createPeer(peerId, false);
  const peer = state.peers.get(peerId);
  if (!pc || !peer) return;

  try {
    if (signal.description) {
      await pc.setRemoteDescription(signal.description);

      while (peer.candidates.length) {
        await pc.addIceCandidate(peer.candidates.shift());
      }

      if (signal.description.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send("signal", { to: peerId, signal: { description: pc.localDescription } });
      }
    }

    if (signal.candidate) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(signal.candidate);
      } else {
        peer.candidates.push(signal.candidate);
      }
    }
  } catch {
    closePeer(peerId);
  }
}

function closePeer(peerId) {
  const peer = state.peers.get(peerId);
  if (!peer) return;

  peer.pc.close();
  peer.audio.srcObject = null;
  state.peers.delete(peerId);
  renderVoiceControls();
}

function renderHistory(history) {
  chatLog.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Henuz mesaj yok. Ilk mesaji sen at.";
    chatLog.append(empty);
    return;
  }

  history.forEach(appendMessage);
}

function appendMessage(message) {
  const empty = chatLog.querySelector(".empty");
  if (empty) empty.remove();

  const row = document.createElement("article");
  row.className = "message";
  row.innerHTML = `
    <div class="avatar">${escapeHtml(initials(message.name))}</div>
    <div>
      <header>
        <strong>${escapeHtml(message.name)}</strong>
        <time>${formatTime(message.time)}</time>
      </header>
      <p>${escapeHtml(message.text)}</p>
    </div>
  `;
  chatLog.append(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function systemMessage(text) {
  appendMessage({
    name: "Sistem",
    text,
    time: Date.now()
  });
}

function renderUsers() {
  userList.innerHTML = "";

  for (const user of state.users) {
    const item = document.createElement("div");
    item.className = "user";
    item.innerHTML = `
      <div class="avatar">${escapeHtml(initials(user.name))}</div>
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <span>${user.channel ? voiceName(user.channel) : "Online"}</span>
      </div>
    `;
    userList.append(item);
  }
}

function renderChannels() {
  for (const channel of ["voice1", "voice2"]) {
    const users = state.channels[channel] || [];
    const button = document.querySelector(`[data-voice-channel="${channel}"]`);
    button.classList.toggle("active", state.currentVoice === channel);
    $(`#${channel}Count`).textContent = users.length;
  }
}

function renderVoiceControls() {
  const inVoice = Boolean(state.currentVoice);

  voiceBar.classList.toggle("hidden", !inVoice);
  muteButton.disabled = !inVoice;
  leaveVoiceButton.disabled = !inVoice;
  muteButton.classList.toggle("danger", state.muted);
  muteIcon.textContent = state.muted ? "Muted" : "Mic";
  voiceStatus.textContent = inVoice ? voiceName(state.currentVoice) : "Seste degil";

  if (!inVoice) return;

  const people = state.channels[state.currentVoice] || [];
  currentVoiceName.textContent = voiceName(state.currentVoice);
  currentVoicePeople.textContent = `${people.length || 1} kisi bagli`;
  speakingList.innerHTML = "";

  for (const user of people) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = user.name;
    speakingList.append(pill);
  }
}

function showApp() {
  login.classList.add("hidden");
  profileName.textContent = state.myName;
  profileAvatar.textContent = initials(state.myName);
  messageInput.focus();
}

function send(type, payload) {
  if (!isConnected()) return false;

  state.socket.send(JSON.stringify({ type, ...payload }));
  return true;
}

function isConnected() {
  return state.socket?.readyState === WebSocket.OPEN;
}

function voiceName(channel) {
  return channel === "voice1" ? "Ses 1" : "Ses 2";
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("") || "?";
}

function formatTime(time) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(time));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}
