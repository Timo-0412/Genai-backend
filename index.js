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
  "robrahn@genai.de": { password: "studio123", role: "robrahn" },
};

// Temporärer Speicher für Anrufe
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

// Middleware zur Authentifizierung
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

// 📊 Dashboard-Daten
app.get("/api/calls", authenticate, (req, res) => {
  const { role } = req.user;
  if (role === "admin") return res.json(calls);
  const filtered = calls.filter(call => call.studio === role);
  res.json(filtered);
});

// 📥 Webhook von VAPI (Termin-Erkennung + MEZ-Korrektur)
app.post("/api/calls", (req, res) => {
  const {
    name,
    phone,
    behandlung,
    termin,
    transkript,
    summary,
    studio,
  } = req.body;

  if (!name || !phone || !studio) {
    return res.status(400).json({ message: "Ungültige Daten" });
  }

  let parsedDateISO = null;

  // 🟣 1. Transkript (deutsch)
  if (transkript) {
    const result = chrono.de.parse(transkript);
    if (result.length > 0) {
      const parsed = result[0].start.date();
      parsedDateISO = DateTime.fromJSDate(parsed).setZone("Europe/Berlin").toISO();
    }
  }

  // 🟣 2. Fallback: Summary (englisch)
  if (!parsedDateISO && summary) {
    const result = chrono.en.parse(summary);
    if (result.length > 0) {
      const parsed = result[0].start.date();
      parsedDateISO = DateTime.fromJSDate(parsed).setZone("Europe/Berlin").toISO();
    }
  }

  // 🟡 TERMIN-PRIORITÄT: zuerst 'termin' nutzen (aber MEZ setzen)
  let finalTermin = "unbekannt";
  if (termin) {
    try {
      finalTermin = DateTime.fromISO(termin).setZone("Europe/Berlin").toISO();
    } catch {
      finalTermin = "unbekannt";
    }
  } else if (parsedDateISO) {
    finalTermin = parsedDateISO;
  }

  // 💾 Speichern
  calls.push({
    name,
    phone,
    behandlung,
    termin: finalTermin,
    transkript,
    summary,
    studio,
  });

  console.log("✅ Erfolgreich gespeichert:", {
    name,
    phone,
    behandlung,
    termin: finalTermin,
    studio,
  });

  res.status(200).json({ message: "✅ Call gespeichert" });
});

// Test-Route
app.get("/", (req, res) => {
  res.send("✅ GenAi Backend läuft");
});

app.post("/api/confirm", authenticate, async (req, res) => {
  const { index, kommentar } = req.body;

  if (typeof index !== "number" || !calls[index]) {
    return res.status(400).json({ message: "Ungültiger Eintrag" });
  }

  const eintrag = calls[index];
  const nummer = eintrag.phone.startsWith("49") ? eintrag.phone : `49${eintrag.phone.replace(/^0+/, "")}`;

  const text = `✅ Termin bestätigt für ${eintrag.name} am ${DateTime.fromISO(eintrag.termin).setZone("Europe/Berlin").toFormat("dd.LL.yyyy – HH:mm")} Uhr.\n${kommentar || ""}`.trim();

  try {
    const result = await axios.post("https://gateway.seven.io/api/sms", null, {
      params: {
        to: nummer,
        text: text,
        from: "Kosmetik",
        p: process.env.SEVEN_API_KEY,
      },
    });

    // Markiere den Call als bestätigt
    calls[index].status = "bestätigt";
    calls[index].kommentar = kommentar;

    res.status(200).json({ message: "SMS gesendet", sms: result.data });
  } catch (err) {
    console.error("❌ Fehler beim Senden:", err.message);
    res.status(500).json({ message: "Fehler beim SMS-Versand" });
  }
});


// Server starten
app.listen(PORT, () => {
  console.log("🚀 Backend läuft auf Port", PORT);
});
