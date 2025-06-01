import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import * as chrono from "chrono-node";
import { DateTime } from "luxon";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const JWT_SECRET = "meinGeheimerTestKey123";

// Benutzerliste mit Rollen
const users = {
  "admin@genai.de": { password: "adminpass", role: "admin" },
  "kosami@genai.de": { password: "studio123", role: "kosami" },
  "wintermantel@genai.de": { password: "studio123", role: "wintermantel" },
  "robrahn@genai.de": { password: "studio123", role: "robrahn" }
};

// Dynamisch gespeicherte Anrufe
const calls = [];

// Login-Route
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const user = users[email];
  if (!user || user.password !== password) {
    return res.status(401).json({ message: "Ungültige Zugangsdaten" });
  }

  const token = jwt.sign({ email, role: user.role }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

// Authentifizierungsmiddleware
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: "Kein Token übermittelt" });

  const token = auth.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ message: "Token ungültig" });
  }
}

// Daten für das Dashboard abrufen
app.get("/api/calls", authenticate, (req, res) => {
  const { role } = req.user;
  if (role === "admin") return res.json(calls);
  const filtered = calls.filter(call => call.studio === role);
  res.json(filtered);
});

// Webhook-Eintrag entgegennehmen mit smarter Datumserkennung (summary > transcript)
app.post("/api/calls", (req, res) => {
  const {
    name,
    phone,
    termin, // optional fallback
    behandlung,
    transkript,
    summary, // wichtig: summary wird jetzt genutzt
    studio,
  } = req.body;

  if (!name || !phone || !studio) {
    return res.status(400).json({ message: "Ungültige Daten" });
  }

  let parsedDate = null;

  // 1. Versuch: Datum aus summary erkennen (z. B. "for Friday, August 15th at 12:00 PM")
  if (summary) {
    const parsed = chrono.en.parseDate(summary);
    if (parsed) {
      parsedDate = DateTime.fromJSDate(parsed)
        .setZone("Europe/Berlin")
        .toISO();
    }
  }

  // 2. Fallback: Datum aus deutschem Transkript extrahieren
  if (!parsedDate && transkript) {
    const parsed = chrono.de.parseDate(transkript);
    if (parsed) {
      parsedDate = DateTime.fromJSDate(parsed)
        .setZone("Europe/Berlin")
        .toISO();
    }
  }

  calls.push({
    name,
    phone,
    behandlung,
    termin: parsedDate || termin,
    transkript,
    summary,
    studio,
  });

  res.status(200).json({ message: "✅ Call gespeichert" });
});

// Testroute
app.get("/", (req, res) => {
  res.send("GenAi Backend läuft ✅");
});

app.listen(PORT, () => {
  console.log("🚀 Backend läuft auf Port", PORT);
});
