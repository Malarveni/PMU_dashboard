// ===============================
// PMU Advanced Backend Server (STABLE FINAL)
// ===============================

const mqtt = require('mqtt');
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// ===============================
// CONFIG
// ===============================
const MQTT_URL = 'mqtts://cbd69323b9dc4e9bae875510cd9ce6b7.s1.eu.hivemq.cloud:8883';

const mqttOptions = {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD
};

const MONGO_URL = process.env.MONGO_URL;

// ===============================
// INIT
// ===============================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===============================
// DATABASE
// ===============================
mongoose.connect(MONGO_URL)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

const PMUSchema = new mongoose.Schema({
    voltage: Number,
    current: Number,
    phase: Number,
    frequency: Number,
    rocof: Number,
    lat: Number,
    lon: Number,
    timestamp: String,
    attack: Boolean
});

const PMU = mongoose.model('PMU', PMUSchema);

// ===============================
// CHECKSUM FUNCTION
// ===============================
function generateChecksum(str){
    let sum = 0;
    for(let i=0;i<str.length;i++){
        sum += str.charCodeAt(i);
    }
    return sum % 256;
}

// ===============================
// MQTT
// ===============================
const mqttClient = mqtt.connect(MQTT_URL, mqttOptions);

let prevPhase = null;

mqttClient.on('connect', () => {
    console.log("✅ MQTT Connected");
    mqttClient.subscribe('pmu/data');
});

// ===============================
// DATA PROCESSING (ROBUST)
// ===============================
mqttClient.on('message', async (topic, message) => {
    try {
        console.log("📡 RAW:", message.toString());

        let msg = JSON.parse(message.toString());
        let d = msg.data;

        if (!d) {
            console.log("❌ Invalid format");
            return;
        }

        // 🔐 Checksum (NON-BLOCKING)
        let calcChecksum = generateChecksum(JSON.stringify(d));
        let checksumValid = (calcChecksum === msg.checksum);

        if (!checksumValid) {
            console.log("⚠️ Checksum mismatch (not blocking)");
        }

        // ===============================
        // CYBER DETECTION
        // ===============================
        let attack = d.attack || false;

        if (prevPhase !== null && Math.abs(d.phase - prevPhase) > 40) {
            attack = true;
            console.log("⚠️ Phase jump attack");
        }

        if (d.voltage > 300 || d.voltage < 50) {
            attack = true;
            console.log("⚠️ Voltage anomaly");
        }

        prevPhase = d.phase;

        // ===============================
        // SAFE DATA FORMAT
        // ===============================
        const safeData = {
            voltage: Number(d.voltage) || 0,
            current: Number(d.current) || 0,
            phase: Number(d.phase) || 0,
            frequency: Number(d.frequency) || 0,
            rocof: Number(d.rocof) || 0,
            lat: Number(d.lat) || 0,
            lon: Number(d.lon) || 0,
            timestamp: d.timestamp || new Date().toISOString(),
            attack: attack
        };

        // ===============================
        // SAVE TO DB (SAFE)
        // ===============================
        try {
            await PMU.create(safeData);
        } catch (dbErr) {
            console.log("⚠️ DB insert failed, skipping");
        }

        // ===============================
        // SEND TO FRONTEND
        // ===============================
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(safeData));
            }
        });

    } catch (err) {
        console.error("❌ Processing Error:", err);
    }
});

// ===============================
// WEBSOCKET
// ===============================
wss.on('connection', () => {
    console.log("🌐 Client connected");
});

// ===============================
// API (NEVER FAIL)
// ===============================
app.get('/history', async (req, res) => {
    try {
        const data = await PMU.find().sort({ _id: -1 }).limit(100);
        res.json(Array.isArray(data) ? data.reverse() : []);
    } catch (err) {
        console.error("❌ History API:", err);
        res.json([]); // 🔥 ALWAYS return array
    }
});

app.get('/replay', async (req, res) => {
    try {
        const data = await PMU.find().sort({ _id: 1 }).limit(200);
        res.json(Array.isArray(data) ? data : []);
    } catch (err) {
        console.error("❌ Replay API:", err);
        res.json([]); // 🔥 ALWAYS return array
    }
});

// ===============================
// START
// ===============================
const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
