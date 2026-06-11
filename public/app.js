const state = {
  socket: null,
  myId: null,
  myName: localStorage.getItem("black-cord-name") || "",
  users: [],
  channels: { voice1: [], voice2: [] },
  currentVoice: null,
  localStream: null,
  muted: false,
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

connect();

if (state.myName) {
  showApp();
}

loginForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = nameInput.value.trim().slice(0, 24);
  if (!name) return;

  state.myName = name;
  localStorage.setItem("black-cord-name", name);
  profileName.textContent = name;
  profileAvatar.textContent = initials(name);
  showApp();
  send("join", { name });
});

chatForm.addEventListener("submit", event => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
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

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  state.socket = new WebSocket(`${protocol}//${location.host}`);

  state.socket.addEventListener("open", () => {
    connectionStatus.textContent = "Bağlandı";
    if (state.myName) send("join", { name: state.myName });
  });

  state.socket.addEventListener("close", () => {
    connectionStatus.textContent = "Koptu, tekrar deneniyor";
    cleanupVoice(false);
    setTimeout(connect, 1400);
  });

  state.socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    handleServerMessage(message);
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
      if (message.channel === state.currentVoice) {
        createPeer(message.peer.id, false);
      }
      break;

    case "peerLeft":
      closePeer(message.peerId);
      break;

    case "signal":
      handleSignal(message.from, message.signal);
      break;
  }
}

async function joinVoice(channel) {
  if (state.currentVoice === channel) return;

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
    alert("Mikrofon izni alınamadı. Tarayıcı/Windows mikrofon iznini kontrol et.");
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
  for (const peerId of [...state.peers.keys()]) closePeer(peerId);
}

function createPeer(peerId, shouldOffer) {
  if (!state.localStream || state.peers.has(peerId)) return state.peers.get(peerId)?.pc;

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
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      closePeer(peerId);
    }
  };

  state.peers.set(peerId, { pc, audio });
  renderVoiceControls();

  if (shouldOffer) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => send("signal", { to: peerId, signal: { description: pc.localDescription } }))
      .catch(() => closePeer(peerId));
  }

  return pc;
}

async function handleSignal(peerId, signal) {
  const pc = createPeer(peerId, false);
  if (!pc) return;

  try {
    if (signal.description) {
      await pc.setRemoteDescription(signal.description);
      if (signal.description.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send("signal", { to: peerId, signal: { description: pc.localDescription } });
      }
    }

    if (signal.candidate) {
      await pc.addIceCandidate(signal.candidate);
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
    empty.textContent = "Henüz mesaj yok. İlk mesajı sen at.";
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
  voiceStatus.textContent = inVoice ? voiceName(state.currentVoice) : "Seste değil";

  if (!inVoice) return;

  const people = state.channels[state.currentVoice] || [];
  currentVoiceName.textContent = voiceName(state.currentVoice);
  currentVoicePeople.textContent = `${people.length || 1} kişi bağlı`;
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
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  state.socket.send(JSON.stringify({ type, ...payload }));
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
