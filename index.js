import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

// Beispiel-Datenbank (kann später durch Mongo/PostgreSQL ersetzt werden)
const users = {
  "admin@genai.de": { password: "adminpass", role: "admin" },
  "kosami@genai.de": { password: "studio123", role: "kosami" },
  "wintermantel@genai.de": { password: "studio123", role: "wintermantel" },
  "robrahn@genai.de": { password: "studio123", role: "robrahn" }
};

const calls = [
  { name: "Lisa Müller", phone: "0176123456", behandlung: "Gesichtsbehandlung", termin: "Dienstag 14:00", transkript: "Ich hätte gern Dienstag 14 Uhr", studio: "kosami" },
  { name: "Janine Weber", phone: "0176987654", behandlung: "Massage", termin: "Freitag 10:00", transkript: "Termin am Freitag um 10", studio: "wintermantel" },
  { name: "Franziska Koch", phone: "0176111222", behandlung: "Fußpflege", termin: "Montag 12:00", transkript: "Montag mittags passt gut", studio: "robrahn" }
];

// Login-Route → gibt Token zurück
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const user = users[email];
  if (!user || user.password !== password) {
    return res.status(401).json({ message: "Ungültige Zugangsdaten" });
  }

  const token = jwt.sign({ email, role: user.role }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ token });
});

// Middleware zum Prüfen des Tokens
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

// Geschützte Route → nur mit Token erreichbar
app.get("/api/calls", authenticate, (req, res) => {
  const { role } = req.user;
  if (role === "admin") return res.json(calls);
  const filtered = calls.filter(call => call.studio === role);
  res.json(filtered);
});

// Test
app.get("/", (req, res) => {
  res.send("GenAi Backend läuft ✅");
});

app.listen(PORT, () => {
  console.log("🚀 Backend läuft auf Port", PORT);
});