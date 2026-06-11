const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_PAYLOAD_SIZE = 3 * 1024 * 1024;
const MAX_CHAT_HISTORY = 80;
const MAX_IMAGE_DATA_LENGTH = 2_200_000;
const MAX_AVATAR_DATA_LENGTH = 180_000;

const clients = new Map();
const channels = {
  voice1: new Set(),
  voice2: new Set()
};
const chatHistory = [];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/health") {
    writeJson(res, 200, {
      ok: true,
      users: clients.size,
      time: Date.now()
    });
    return;
  }

  let filePath = path.normalize(decodeURIComponent(requestUrl.pathname));
  if (filePath === "/" || filePath === "\\") {
    filePath = "/index.html";
  }

  const absolutePath = path.resolve(PUBLIC_DIR, `.${filePath}`);
  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      serveIndex(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(absolutePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});

server.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  const id = crypto.randomUUID();
  const client = {
    id,
    name: "Misafir",
    channel: null,
    socket,
    buffer: Buffer.alloc(0),
    alive: true,
    avatar: ""
  };

  clients.set(id, client);

  send(client, "hello", {
    id,
    history: chatHistory,
    users: getUsers()
  });
  broadcastState();

  socket.on("data", chunk => {
    try {
      handleSocketData(client, chunk);
    } catch {
      removeClient(client);
    }
  });
  socket.on("close", () => removeClient(client));
  socket.on("error", () => removeClient(client));
});

setInterval(() => {
  for (const client of clients.values()) {
    if (!client.alive) {
      removeClient(client);
      continue;
    }

    client.alive = false;
    try {
      client.socket.write(Buffer.from([0x89, 0x00]));
    } catch {
      removeClient(client);
    }
  }
}, 30000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Black Cord running on http://localhost:${PORT}`);
});

function handleSocketData(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const frame = parseFrame(client.buffer);
    if (!frame) return;

    client.buffer = client.buffer.subarray(frame.length);

    if (frame.opcode === 0x8) {
      removeClient(client);
      return;
    }

    if (frame.opcode === 0x9) {
      client.alive = true;
      client.socket.write(Buffer.from([0x8a, 0x00]));
      continue;
    }

    if (frame.opcode === 0xA) {
      client.alive = true;
      continue;
    }

    if (frame.opcode !== 0x1) continue;

    let message;
    try {
      message = JSON.parse(frame.payload.toString("utf8"));
    } catch {
      send(client, "error", { message: "Gecersiz mesaj." });
      continue;
    }

    handleMessage(client, message);
  }
}

function parseFrame(buffer) {
  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = (second & 0x80) === 0x80;
  let payloadLength = second & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return null;
    const high = buffer.readUInt32BE(offset);
    const low = buffer.readUInt32BE(offset + 4);
    payloadLength = high * 2 ** 32 + low;
    offset += 8;
  }

  if (payloadLength > MAX_PAYLOAD_SIZE) {
    throw new Error("Payload too large");
  }

  const maskLength = masked ? 4 : 0;
  const totalLength = offset + maskLength + payloadLength;
  if (buffer.length < totalLength) return null;

  let payload = buffer.subarray(offset + maskLength, totalLength);
  if (masked) {
    const mask = buffer.subarray(offset, offset + 4);
    payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  }

  return { opcode, payload, length: totalLength };
}

function handleMessage(client, message) {
  if (!message || typeof message !== "object") return;

  switch (message.type) {
    case "join":
      client.name = cleanName(message.name);
      client.avatar = cleanImageData(message.avatar, MAX_AVATAR_DATA_LENGTH) || client.avatar;
      send(client, "joined", { id: client.id, name: client.name, avatar: client.avatar });
      broadcastState();
      break;

    case "profile":
      client.name = cleanName(message.name || client.name);
      client.avatar = cleanImageData(message.avatar, MAX_AVATAR_DATA_LENGTH) || "";
      broadcastState();
      break;

    case "chat":
      if (typeof message.text !== "string") return;
      addChatMessage(client, message.text);
      break;

    case "image":
      addImageMessage(client, message);
      break;

    case "joinVoice":
      joinVoice(client, message.channel);
      break;

    case "leaveVoice":
      leaveVoice(client);
      break;

    case "signal":
      relaySignal(client, message);
      break;

    default:
      send(client, "error", { message: "Bilinmeyen islem." });
  }
}

function cleanName(name) {
  return String(name || "Misafir")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24) || "Misafir";
}

function addChatMessage(client, text) {
  const item = {
    id: crypto.randomUUID(),
    kind: "text",
    userId: client.id,
    name: client.name,
    avatar: client.avatar,
    text: String(text).replace(/\s+/g, " ").trim().slice(0, 600),
    time: Date.now()
  };

  if (!item.text) return;

  chatHistory.push(item);
  while (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
  broadcast("chat", item);
}

function addImageMessage(client, message) {
  const image = cleanImageData(message.image, MAX_IMAGE_DATA_LENGTH);
  if (!image) return;

  const item = {
    id: crypto.randomUUID(),
    kind: "image",
    userId: client.id,
    name: client.name,
    avatar: client.avatar,
    text: String(message.text || "").replace(/\s+/g, " ").trim().slice(0, 240),
    image,
    time: Date.now()
  };

  chatHistory.push(item);
  while (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
  broadcast("chat", item);
}

function joinVoice(client, channel) {
  if (!channels[channel]) return;

  const previousChannel = client.channel;
  leaveVoice(client, false);

  client.channel = channel;
  channels[channel].add(client.id);

  const peers = [...channels[channel]]
    .filter(id => id !== client.id)
    .map(id => getPublicUser(clients.get(id)))
    .filter(Boolean);

  send(client, "voicePeers", { channel, peers });

  for (const peerId of channels[channel]) {
    if (peerId !== client.id) {
      send(clients.get(peerId), "peerJoined", { channel, peer: getPublicUser(client) });
    }
  }

  if (previousChannel && previousChannel !== channel) {
    broadcastToChannel(previousChannel, "peerLeft", { peerId: client.id });
  }

  broadcastState();
}

function leaveVoice(client, announce = true) {
  if (!client.channel || !channels[client.channel]) return;

  const channel = client.channel;
  channels[channel].delete(client.id);
  client.channel = null;

  if (announce) {
    broadcastToChannel(channel, "peerLeft", { peerId: client.id });
    broadcastState();
  }
}

function relaySignal(client, message) {
  const target = clients.get(message.to);
  if (!target || target.channel !== client.channel || !message.signal) return;

  send(target, "signal", {
    from: client.id,
    signal: message.signal
  });
}

function removeClient(client) {
  if (!clients.has(client.id)) return;

  const oldChannel = client.channel;
  leaveVoice(client, false);
  clients.delete(client.id);

  try {
    client.socket.end();
  } catch {}

  if (oldChannel) {
    broadcastToChannel(oldChannel, "peerLeft", { peerId: client.id });
  }

  broadcastState();
}

function broadcastState() {
  broadcast("state", {
    users: getUsers(),
    channels: {
      voice1: [...channels.voice1].map(id => getPublicUser(clients.get(id))).filter(Boolean),
      voice2: [...channels.voice2].map(id => getPublicUser(clients.get(id))).filter(Boolean)
    }
  });
}

function getUsers() {
  return [...clients.values()].map(getPublicUser).filter(Boolean);
}

function getPublicUser(client) {
  if (!client) return null;
  return {
    id: client.id,
    name: client.name,
    channel: client.channel,
    avatar: client.avatar || ""
  };
}

function cleanImageData(value, maxLength) {
  if (typeof value !== "string" || value.length > maxLength) return "";
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(value)) return "";
  return value;
}

function broadcast(type, payload) {
  for (const client of clients.values()) {
    send(client, type, payload);
  }
}

function broadcastToChannel(channel, type, payload) {
  for (const id of channels[channel] || []) {
    send(clients.get(id), type, payload);
  }
}

function send(client, type, payload) {
  if (!client?.socket?.writable) return;

  const data = Buffer.from(JSON.stringify({ type, ...payload }), "utf8");
  const header = createFrameHeader(data.length);
  client.socket.write(Buffer.concat([header, data]));
}

function createFrameHeader(length) {
  if (length < 126) {
    return Buffer.from([0x81, length]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return header;
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeUInt32BE(0, 2);
  header.writeUInt32BE(length, 6);
  return header;
}

function serveIndex(res) {
  fs.readFile(path.join(PUBLIC_DIR, "index.html"), (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function writeJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}
