const AUDIO_SETTINGS_VERSION = 2;
const savedAudioSettings = JSON.parse(localStorage.getItem("black-cord-audio") || "{}");

const defaultAudioSettings = {
  preset: "balanced",
  inputDeviceId: "",
  outputDeviceId: "",
  bitrate: 64000,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  noiseLevel: "strong",
  noiseGate: true,
  gateThreshold: 24
};

const presetSettings = {
  voice: {
    bitrate: 40000,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    noiseLevel: "strong",
    noiseGate: true,
    gateThreshold: 28
  },
  balanced: {
    bitrate: 64000,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    noiseLevel: "standard",
    noiseGate: true,
    gateThreshold: 22
  },
  studio: {
    bitrate: 128000,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    noiseLevel: "off",
    noiseGate: false,
    gateThreshold: 20
  }
};

const state = {
  socket: null,
  myId: null,
  myName: localStorage.getItem("black-cord-name") || "",
  avatar: localStorage.getItem("black-cord-avatar") || "",
  users: [],
  channels: { voice1: [], voice2: [] },
  currentVoice: null,
  rawMicStream: null,
  localStream: null,
  screenStream: null,
  audioContext: null,
  audioNodes: null,
  gateTimer: null,
  meterTimer: null,
  micLevel: 0,
  muted: false,
  reconnectTimer: null,
  statsTimer: null,
  peers: new Map(),
  audio: { ...defaultAudioSettings, ...savedAudioSettings }
};

if (state.audio.version !== AUDIO_SETTINGS_VERSION) {
  state.audio = {
    ...state.audio,
    version: AUDIO_SETTINGS_VERSION,
    noiseLevel: "standard",
    noiseGate: true,
    gateThreshold: 22
  };
  localStorage.setItem("black-cord-audio", JSON.stringify(state.audio));
}

let lastSystemMessage = "";
let lastSystemMessageAt = 0;

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
const avatarButton = $("#avatarButton");
const avatarInput = $("#avatarInput");
const voiceStatus = $("#voiceStatus");
const voiceBar = $("#voiceBar");
const currentVoiceName = $("#currentVoiceName");
const currentVoicePeople = $("#currentVoicePeople");
const speakingList = $("#speakingList");
const muteButton = $("#muteButton");
const muteIcon = $("#muteIcon");
const leaveVoiceButton = $("#leaveVoiceButton");
const screenButton = $("#screenButton");
const screenIcon = $("#screenIcon");
const settingsButton = $("#settingsButton");
const closeSettingsButton = $("#closeSettingsButton");
const settingsPanel = $("#settingsPanel");
const qualityPreset = $("#qualityPreset");
const inputDevice = $("#inputDevice");
const outputDevice = $("#outputDevice");
const bitrateRange = $("#bitrateRange");
const bitrateLabel = $("#bitrateLabel");
const echoCancellation = $("#echoCancellation");
const noiseSuppression = $("#noiseSuppression");
const autoGainControl = $("#autoGainControl");
const audioStats = $("#audioStats");
const noiseLevel = $("#noiseLevel");
const noiseGate = $("#noiseGate");
const gateThresholdRange = $("#gateThresholdRange");
const gateThresholdLabel = $("#gateThresholdLabel");
const stage = $("#stage");
const stageStatus = $("#stageStatus");
const videoGrid = $("#videoGrid");
const imageButton = $("#imageButton");
const imageInput = $("#imageInput");
const accountButton = $("#accountButton");
const accountModal = $("#accountModal");
const accountForm = $("#accountForm");
const closeAccountButton = $("#closeAccountButton");
const accountNameInput = $("#accountNameInput");
const accountAvatarButton = $("#accountAvatarButton");
const accountAvatarPreview = $("#accountAvatarPreview");
const screenPickerModal = $("#screenPickerModal");
const closeScreenPickerButton = $("#closeScreenPickerButton");
const screenSourceGrid = $("#screenSourceGrid");
const onlineCount = $("#onlineCount");
const voiceCount = $("#voiceCount");
const qualityStatus = $("#qualityStatus");
const micMeter = $("#micMeter");
const micMeterLabel = $("#micMeterLabel");

nameInput.value = state.myName;
profileName.textContent = state.myName || "Misafir";
renderAvatar(profileAvatar, state.myName, state.avatar);

connect();
registerServiceWorker();
renderAudioSettings();
refreshDevices();

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
  send("join", { name, avatar: state.avatar });
});

chatForm.addEventListener("submit", event => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text) return;

  if (!isConnected()) {
    systemMessage("Bağlantı kurulunca tekrar dene.");
    return;
  }

  send("chat", { text });
  messageInput.value = "";
});

imageButton.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  imageInput.value = "";
  if (!file) return;

  if (!isConnected()) {
    systemMessage("Resim göndermek için bağlantı gerekli.");
    return;
  }

  try {
    const image = await compressImage(file, 1400, 0.82);
    send("image", {
      text: messageInput.value.trim(),
      image
    });
    messageInput.value = "";
  } catch {
    systemMessage("Resim hazırlanamadı. Daha küçük bir dosya dene.");
  }
});

document.querySelectorAll("[data-voice-channel]").forEach(button => {
  button.addEventListener("click", () => joinVoice(button.dataset.voiceChannel));
});

settingsButton.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
  refreshDevices();
});

closeSettingsButton.addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
});

avatarButton.addEventListener("click", () => avatarInput.click());

accountButton.addEventListener("click", () => {
  accountNameInput.value = state.myName;
  renderAvatar(accountAvatarPreview, state.myName, state.avatar);
  accountModal.classList.remove("hidden");
});

closeAccountButton.addEventListener("click", () => {
  accountModal.classList.add("hidden");
});

accountAvatarButton.addEventListener("click", () => avatarInput.click());

accountForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = accountNameInput.value.trim().slice(0, 24);
  if (!name) return;

  state.myName = name;
  localStorage.setItem("black-cord-name", name);
  profileName.textContent = name;
  renderAvatar(profileAvatar, name, state.avatar);
  renderAvatar(accountAvatarPreview, name, state.avatar);
  send("profile", { name, avatar: state.avatar });
  accountModal.classList.add("hidden");
});

closeScreenPickerButton.addEventListener("click", () => {
  screenPickerModal.classList.add("hidden");
});

avatarInput.addEventListener("change", async () => {
  const file = avatarInput.files?.[0];
  avatarInput.value = "";
  if (!file) return;

  try {
    state.avatar = await compressImage(file, 256, 0.8);
    localStorage.setItem("black-cord-avatar", state.avatar);
    renderAvatar(profileAvatar, state.myName, state.avatar);
    renderAvatar(accountAvatarPreview, state.myName, state.avatar);
    send("profile", { name: state.myName, avatar: state.avatar });
  } catch {
    systemMessage("Profil fotoğrafı hazırlanamadı.");
  }
});

qualityPreset.addEventListener("change", () => {
  const preset = presetSettings[qualityPreset.value] || presetSettings.balanced;
  state.audio = {
    ...state.audio,
    preset: qualityPreset.value,
    ...preset
  };
  saveAudioSettings();
  renderAudioSettings();
  applyAudioChanges();
});

inputDevice.addEventListener("change", () => {
  state.audio.inputDeviceId = inputDevice.value;
  saveAudioSettings();
  applyAudioChanges(true);
});

outputDevice.addEventListener("change", () => {
  state.audio.outputDeviceId = outputDevice.value;
  saveAudioSettings();
  applyOutputDevice();
});

bitrateRange.addEventListener("input", () => {
  state.audio.bitrate = Number(bitrateRange.value);
  saveAudioSettings();
  renderAudioSettings();
  applySenderSettings();
});

for (const checkbox of [echoCancellation, noiseSuppression, autoGainControl]) {
  checkbox.addEventListener("change", () => {
    state.audio.echoCancellation = echoCancellation.checked;
    state.audio.noiseSuppression = noiseSuppression.checked;
    state.audio.autoGainControl = autoGainControl.checked;
    saveAudioSettings();
    applyAudioChanges(true);
  });
}

noiseGate.addEventListener("change", () => {
  state.audio.noiseGate = noiseGate.checked;
  saveAudioSettings();
  applyAudioChanges(true);
});

gateThresholdRange.addEventListener("input", () => {
  state.audio.gateThreshold = Number(gateThresholdRange.value);
  saveAudioSettings();
  renderAudioSettings();
});

noiseLevel.addEventListener("change", () => {
  state.audio.noiseLevel = noiseLevel.value;
  state.audio.noiseSuppression = noiseLevel.value !== "off";
  state.audio.noiseGate = noiseLevel.value !== "off";
  if (noiseLevel.value === "strong") state.audio.gateThreshold = Math.max(state.audio.gateThreshold, 38);
  if (noiseLevel.value === "standard") state.audio.gateThreshold = Math.max(28, Math.min(state.audio.gateThreshold, 38));
  noiseSuppression.checked = state.audio.noiseSuppression;
  noiseGate.checked = state.audio.noiseGate;
  saveAudioSettings();
  renderAudioSettings();
  applyAudioChanges(true);
});

screenButton.addEventListener("click", () => {
  if (state.screenStream) {
    stopScreenShare();
  } else {
    startScreenShare();
  }
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

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
}

function connect() {
  clearTimeout(state.reconnectTimer);

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  state.socket = new WebSocket(`${protocol}//${location.host}`);
  connectionStatus.textContent = "Bağlanıyor...";

  state.socket.addEventListener("open", () => {
    connectionStatus.textContent = "Bağlandı";
    if (state.myName) send("join", { name: state.myName, avatar: state.avatar });
  });

  state.socket.addEventListener("close", () => {
    connectionStatus.textContent = "Koptu, tekrar deneniyor";
    cleanupVoice(true);
    state.reconnectTimer = setTimeout(connect, 1500);
  });

  state.socket.addEventListener("error", () => {
    connectionStatus.textContent = "Bağlantı hatası";
  });

  state.socket.addEventListener("message", event => {
    if (typeof event.data !== "string") return;

    try {
      handleServerMessage(JSON.parse(event.data));
    } catch {
      return;
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
      state.avatar = message.avatar || state.avatar;
      profileName.textContent = message.name;
      renderAvatar(profileAvatar, message.name, state.avatar);
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
      startStats();
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
      if (message.message && !/gecersiz|geçersiz/i.test(message.message)) {
        systemMessage(message.message);
      }
      break;
  }
}

async function joinVoice(channel) {
  if (state.currentVoice === channel) return;

  if (!isConnected()) {
    systemMessage("Ses kanalına girmek için sunucu bağlantısı gerekli.");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    systemMessage("Bu tarayıcı mikrofonu desteklemiyor.");
    return;
  }

  try {
    await ensureLocalStream();
    cleanupPeers();
    state.currentVoice = channel;
    state.muted = false;
    send("joinVoice", { channel });
    renderVoiceControls();
    startStats();
  } catch {
    systemMessage("Mikrofon izni alınamadı. Tarayıcı veya Windows mikrofon iznini kontrol et.");
  }
}

async function ensureLocalStream() {
  if (state.localStream) return state.localStream;

  state.rawMicStream = await navigator.mediaDevices.getUserMedia({
    audio: buildAudioConstraints()
  });
  state.localStream = await createProcessedMicStream(state.rawMicStream);

  await refreshDevices();
  return state.localStream;
}

function buildAudioConstraints() {
  const strongNoise = state.audio.noiseLevel === "strong";
  const audio = {
    echoCancellation: state.audio.echoCancellation,
    noiseSuppression: state.audio.noiseSuppression,
    autoGainControl: state.audio.autoGainControl,
    channelCount: 1,
    sampleRate: 48000,
    sampleSize: 16,
    latency: strongNoise ? 0.04 : 0.02
  };

  if (state.audio.inputDeviceId) {
    audio.deviceId = { exact: state.audio.inputDeviceId };
  }

  return audio;
}

async function createProcessedMicStream(rawStream) {
  if (!state.audio.noiseGate) return rawStream;

  stopMicProcessing();

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return rawStream;

  const context = new AudioContextClass({
    latencyHint: state.audio.noiseLevel === "strong" ? "interactive" : "balanced",
    sampleRate: 48000
  });

  const source = context.createMediaStreamSource(rawStream);
  const analyser = context.createAnalyser();
  const highPass = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const gate = context.createGain();
  const destination = context.createMediaStreamDestination();

  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.72;

  highPass.type = "highpass";
  highPass.frequency.value = state.audio.noiseLevel === "strong" ? 95 : 70;
  highPass.Q.value = 0.7;

  compressor.threshold.value = -30;
  compressor.knee.value = 22;
  compressor.ratio.value = 2.6;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.22;

  gate.gain.value = 1;

  source.connect(analyser);
  source.connect(highPass);
  highPass.connect(compressor);
  compressor.connect(gate);
  gate.connect(destination);

  const samples = new Uint8Array(analyser.fftSize);
  let open = true;
  let holdFrames = 0;

  state.gateTimer = setInterval(() => {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }

    const rms = Math.sqrt(sum / samples.length);
    state.micLevel = rms;
    const threshold = Number(state.audio.gateThreshold || 24) / 1000;
    const openThreshold = threshold;
    const closeThreshold = threshold * 0.52;

    if (rms > openThreshold) {
      open = true;
      holdFrames = state.audio.noiseLevel === "strong" ? 14 : 18;
    } else if (rms < closeThreshold) {
      holdFrames -= 1;
      if (holdFrames <= 0) open = false;
    }

    const now = context.currentTime;
    const minGain = state.audio.noiseLevel === "strong" ? 0.16 : 0.24;
    const targetGain = open ? 1 : minGain;
    gate.gain.cancelScheduledValues(now);
    gate.gain.setTargetAtTime(targetGain, now, open ? 0.018 : 0.12);
  }, 24);

  state.meterTimer = setInterval(() => {
    const micPercent = Math.min(100, Math.round(state.micLevel * 1400));
    micMeter.style.width = `${micPercent}%`;
    micMeterLabel.textContent = `${micPercent}%`;
  }, 120);

  state.audioContext = context;
  state.audioNodes = { source, analyser, highPass, compressor, gate, destination };
  return destination.stream;
}

function stopMicProcessing() {
  if (state.gateTimer) {
    clearInterval(state.gateTimer);
    state.gateTimer = null;
  }

  if (state.meterTimer) {
    clearInterval(state.meterTimer);
    state.meterTimer = null;
  }

  if (state.audioNodes) {
    for (const node of Object.values(state.audioNodes)) {
      try {
        node.disconnect?.();
      } catch {}
    }
    state.audioNodes = null;
  }

  if (state.audioContext) {
    state.audioContext.close().catch(() => {});
    state.audioContext = null;
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

  if (stopTracks && state.rawMicStream) {
    for (const track of state.rawMicStream.getTracks()) track.stop();
    state.rawMicStream = null;
  }

  if (stopTracks) {
    stopMicProcessing();
  }

  if (stopTracks) {
    stopScreenShare(false);
  }

  clearInterval(state.statsTimer);
  state.statsTimer = null;
  state.currentVoice = null;
  state.muted = false;
  audioStats.textContent = "Hazır";
  micMeter.style.width = "0%";
  micMeterLabel.textContent = "0%";
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
  if (state.screenStream) {
    state.screenStream.getVideoTracks().forEach(track => pc.addTrack(track, state.screenStream));
  }

  pc.onicecandidate = event => {
    if (event.candidate) {
      send("signal", { to: peerId, signal: { candidate: event.candidate } });
    }
  };

  pc.ontrack = event => {
    const [stream] = event.streams;
    if (event.track.kind === "audio") {
      audio.srcObject = stream;
      applyOutputDevice(audio);
      audio.play().catch(() => {});
    }
    if (event.track.kind === "video") {
      renderRemoteVideo(peerId, stream);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      closePeer(peerId);
    }
  };

  state.peers.set(peerId, { pc, audio, candidates: [], lastBytesSent: 0, lastBytesReceived: 0, videoStream: null });
  applySenderSettings(pc);
  applyVideoSenderSettings(pc);
  renderVoiceControls();

  if (shouldOffer) {
    createOffer(peerId, pc);
  }

  return pc;
}

async function createOffer(peerId, pc) {
  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await pc.setLocalDescription(tuneDescription(offer));
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
        await pc.setLocalDescription(tuneDescription(answer));
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

function tuneDescription(description) {
  const bitrate = Math.max(24000, Math.min(128000, Number(state.audio.bitrate || 64000)));
  const stereo = "stereo=0;sprop-stereo=0";
  const opusParams = `minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=${bitrate};${stereo}`;
  const sdp = description.sdp.replace(/a=fmtp:(\d+) ((?=.*useinbandfec).*)/g, (line, payload, params) => {
    const merged = new Map();
    `${params};${opusParams}`.split(";").forEach(part => {
      const [key, value] = part.split("=");
      if (key) merged.set(key.trim(), value === undefined ? "" : value.trim());
    });
    const value = [...merged.entries()].map(([key, val]) => val ? `${key}=${val}` : key).join(";");
    return `a=fmtp:${payload} ${value}`;
  });

  return new RTCSessionDescription({
    type: description.type,
    sdp
  });
}

function applySenderSettings(targetPc) {
  const peers = targetPc ? [{ pc: targetPc }] : [...state.peers.values()];

  for (const peer of peers) {
    const sender = peer.pc.getSenders().find(item => item.track?.kind === "audio");
    if (!sender) continue;

    const parameters = sender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.encodings[0].maxBitrate = Number(state.audio.bitrate);
    parameters.encodings[0].priority = "high";
    sender.setParameters(parameters).catch(() => {});
  }
}

function applyVideoSenderSettings(targetPc) {
  const peers = targetPc ? [{ pc: targetPc }] : [...state.peers.values()];
  for (const peer of peers) {
    const sender = peer.pc.getSenders().find(item => item.track?.kind === "video");
    if (!sender) continue;
    const parameters = sender.getParameters();
    parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
    parameters.encodings[0].maxBitrate = 2_500_000;
    parameters.encodings[0].maxFramerate = 30;
    parameters.encodings[0].priority = "high";
    sender.setParameters(parameters).catch(() => {});
  }
}

async function startScreenShare() {
  if (!state.currentVoice) {
    systemMessage("Yayın açmak için önce bir ses kanalına gir.");
    return;
  }

  try {
    state.screenStream = await getScreenStream();

    const [track] = state.screenStream.getVideoTracks();
    track.addEventListener("ended", () => stopScreenShare());

    renderLocalVideo(state.screenStream);
    for (const [peerId, peer] of state.peers.entries()) {
      peer.pc.addTrack(track, state.screenStream);
      applyVideoSenderSettings(peer.pc);
      createOffer(peerId, peer.pc);
    }

    renderVoiceControls();
    systemMessage("Yayın başladı.");
  } catch {
    systemMessage("Yayın başlatılamadı. Yeni kurulum dosyasını yüklediğinden ve bir ses kanalında olduğundan emin ol.");
  }
}

async function getScreenStream() {
  if (window.blackCordDesktop?.listScreenSources) {
    const sources = await window.blackCordDesktop.listScreenSources();
    if (sources.length) {
      const source = await pickScreenSource(sources);
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080,
            maxFrameRate: 30
          }
        }
      });
    }
  }

  return navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 30, max: 30 },
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 }
    },
    audio: false
  });
}

function pickScreenSource(sources) {
  screenSourceGrid.innerHTML = "";
  screenPickerModal.classList.remove("hidden");

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      screenPickerModal.classList.add("hidden");
      closeScreenPickerButton.onclick = null;
    };

    closeScreenPickerButton.onclick = () => {
      cleanup();
      reject(new Error("Screen picker closed"));
    };

    for (const source of sources) {
      const button = document.createElement("button");
      button.className = "screen-source";
      button.type = "button";
      button.innerHTML = `
        <img src="${source.thumbnail}" alt="">
        <span>${escapeHtml(source.name)}</span>
      `;
      button.addEventListener("click", () => {
        cleanup();
        resolve(source);
      });
      screenSourceGrid.append(button);
    }
  });
}

function stopScreenShare(renegotiate = true) {
  if (!state.screenStream) return;

  for (const track of state.screenStream.getTracks()) track.stop();
  state.screenStream = null;
  removeVideoTile("local");

  for (const [peerId, peer] of state.peers.entries()) {
    peer.pc.getSenders()
      .filter(sender => sender.track?.kind === "video")
      .forEach(sender => peer.pc.removeTrack(sender));
    if (renegotiate) createOffer(peerId, peer.pc);
  }

  renderVoiceControls();
}

async function applyAudioChanges(restartStream = false) {
  applySenderSettings();

  if (!state.currentVoice || !restartStream) return;

  const channel = state.currentVoice;
  leaveVoice(true);
  await new Promise(resolve => setTimeout(resolve, 250));
  joinVoice(channel);
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    fillDeviceSelect(inputDevice, devices.filter(device => device.kind === "audioinput"), "Varsayılan mikrofon", state.audio.inputDeviceId);
    fillDeviceSelect(outputDevice, devices.filter(device => device.kind === "audiooutput"), "Varsayılan hoparlör", state.audio.outputDeviceId);
  } catch {}
}

function fillDeviceSelect(select, devices, defaultLabel, selectedId) {
  const options = [`<option value="">${defaultLabel}</option>`];
  devices.forEach((device, index) => {
    const label = device.label || `${defaultLabel} ${index + 1}`;
    const selected = device.deviceId === selectedId ? " selected" : "";
    options.push(`<option value="${escapeHtml(device.deviceId)}"${selected}>${escapeHtml(label)}</option>`);
  });
  select.innerHTML = options.join("");
}

function applyOutputDevice(audioElement) {
  const elements = audioElement ? [audioElement] : [...state.peers.values()].map(peer => peer.audio);

  for (const element of elements) {
    if (typeof element.setSinkId === "function") {
      element.setSinkId(state.audio.outputDeviceId || "").catch(() => {});
    }
  }
}

function renderAudioSettings() {
  qualityPreset.value = state.audio.preset;
  bitrateRange.value = state.audio.bitrate;
  bitrateLabel.textContent = `${Math.round(state.audio.bitrate / 1000)} kbps`;
  echoCancellation.checked = state.audio.echoCancellation;
  noiseSuppression.checked = state.audio.noiseSuppression;
  autoGainControl.checked = state.audio.autoGainControl;
  noiseLevel.value = state.audio.noiseLevel;
  noiseGate.checked = state.audio.noiseGate;
  gateThresholdRange.value = state.audio.gateThreshold;
  gateThresholdLabel.textContent = `${state.audio.gateThreshold}%`;
  qualityStatus.textContent = qualityPreset.options[qualityPreset.selectedIndex]?.textContent || "Dengeli";
}

function saveAudioSettings() {
  state.audio.version = AUDIO_SETTINGS_VERSION;
  localStorage.setItem("black-cord-audio", JSON.stringify(state.audio));
}

function closePeer(peerId) {
  const peer = state.peers.get(peerId);
  if (!peer) return;

  peer.pc.close();
  peer.audio.srcObject = null;
  removeVideoTile(peerId);
  state.peers.delete(peerId);
  renderVoiceControls();
}

function startStats() {
  if (state.statsTimer) return;

  state.statsTimer = setInterval(async () => {
    let sendKbps = 0;
    let receiveKbps = 0;

    for (const peer of state.peers.values()) {
      const stats = await peer.pc.getStats();
      stats.forEach(report => {
        if (report.type === "outbound-rtp" && report.kind === "audio") {
          sendKbps += diffKbps(report.bytesSent, peer.lastBytesSent);
          peer.lastBytesSent = report.bytesSent;
        }
        if (report.type === "inbound-rtp" && report.kind === "audio") {
          receiveKbps += diffKbps(report.bytesReceived, peer.lastBytesReceived);
          peer.lastBytesReceived = report.bytesReceived;
        }
      });
    }

    const peerCount = state.peers.size;
    const micPercent = Math.min(100, Math.round(state.micLevel * 1400));
    micMeter.style.width = `${micPercent}%`;
    micMeterLabel.textContent = `${micPercent}%`;
    audioStats.textContent = peerCount
      ? `${peerCount} bağlantı | giden ${sendKbps} kbps | gelen ${receiveKbps} kbps | mikrofon ${Math.round(state.micLevel * 1000)}`
      : `Kanaldasın | mikrofon ${Math.round(state.micLevel * 1000)}`;
  }, 2000);
}

function diffKbps(current, previous) {
  if (!current || !previous) return 0;
  return Math.max(0, Math.round(((current - previous) * 8) / 2000));
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
    <div class="avatar">${avatarMarkup(message.name, message.avatar)}</div>
    <div>
      <header>
        <strong>${escapeHtml(message.name)}</strong>
        <time>${formatTime(message.time)}</time>
      </header>
      ${message.text ? `<p>${escapeHtml(message.text)}</p>` : ""}
      ${message.kind === "image" && message.image ? `<img class="message-image" src="${message.image}" alt="Paylaşılan resim">` : ""}
    </div>
  `;
  chatLog.append(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function systemMessage(text) {
  const now = Date.now();
  if (text === lastSystemMessage && now - lastSystemMessageAt < 5000) return;
  lastSystemMessage = text;
  lastSystemMessageAt = now;

  appendMessage({
    name: "Sistem",
    text,
    time: Date.now()
  });
}

function renderUsers() {
  userList.innerHTML = "";
  onlineCount.textContent = state.users.length;

  for (const user of state.users) {
    const item = document.createElement("div");
    item.className = "user";
    item.innerHTML = `
      <div class="avatar">${avatarMarkup(user.name, user.avatar)}</div>
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <span>${user.channel ? voiceName(user.channel) : "Çevrimiçi"}</span>
      </div>
    `;
    userList.append(item);
  }
}

function renderChannels() {
  let totalVoiceUsers = 0;
  for (const channel of ["voice1", "voice2"]) {
    const users = state.channels[channel] || [];
    totalVoiceUsers += users.length;
    const button = document.querySelector(`[data-voice-channel="${channel}"]`);
    button.classList.toggle("active", state.currentVoice === channel);
    $(`#${channel}Count`).textContent = users.length;
    renderVoiceMembers(channel, users);
  }
  voiceCount.textContent = totalVoiceUsers;
}

function renderVoiceMembers(channel, users) {
  const container = $(`#${channel}Members`);
  container.innerHTML = "";
  for (const user of users) {
    const item = document.createElement("div");
    item.className = "voice-member";
    item.innerHTML = `
      <span class="mini-avatar">${avatarMarkup(user.name, user.avatar)}</span>
      <span>${escapeHtml(user.name)}</span>
    `;
    container.append(item);
  }
}

function renderVoiceControls() {
  const inVoice = Boolean(state.currentVoice);

  voiceBar.classList.toggle("hidden", !inVoice);
  muteButton.disabled = !inVoice;
  screenButton.disabled = false;
  leaveVoiceButton.disabled = !inVoice;
  muteButton.classList.toggle("danger", state.muted);
  screenButton.classList.toggle("live", Boolean(state.screenStream));
  muteIcon.textContent = state.muted ? "Kapalı" : "Mik";
  screenIcon.textContent = state.screenStream ? "Canlı" : "Yayın";
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
  renderAvatar(profileAvatar, state.myName, state.avatar);
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

function avatarMarkup(name, avatar) {
  return avatar
    ? `<img src="${avatar}" alt="">`
    : escapeHtml(initials(name));
}

function renderAvatar(target, name, avatar) {
  target.innerHTML = avatarMarkup(name, avatar);
}

async function compressImage(file, maxSize, quality) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Not an image");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true
  });
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return canvas.toDataURL(type, quality);
}

function renderLocalVideo(stream) {
  renderVideoTile("local", "Senin yayının", stream, true);
}

function renderRemoteVideo(peerId, stream) {
  const user = state.users.find(item => item.id === peerId);
  renderVideoTile(peerId, `${user?.name || "Arkadaş"} yayını`, stream, false);
}

function renderVideoTile(id, label, stream, muted) {
  stage.classList.remove("hidden");
  let tile = document.querySelector(`[data-video-id="${id}"]`);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "video-tile";
    tile.dataset.videoId = id;
    tile.innerHTML = `<video autoplay playsinline></video><span class="video-label"></span>`;
    videoGrid.append(tile);
  }

  const video = tile.querySelector("video");
  video.muted = muted;
  video.srcObject = stream;
  video.play().catch(() => {});
  tile.querySelector(".video-label").textContent = label;
  updateStageStatus();
}

function removeVideoTile(id) {
  document.querySelector(`[data-video-id="${id}"]`)?.remove();
  updateStageStatus();
}

function updateStageStatus() {
  const count = videoGrid.children.length;
  stage.classList.toggle("hidden", count === 0);
  stageStatus.textContent = count ? `${count} yayın aktif` : "Aktif yayın yok";
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
