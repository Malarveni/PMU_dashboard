// ===============================
// PMU Backend Server (FIXED FINAL)
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
    password: process.env.MQTT_PASSWORD,
    reconnectPeriod: 2000
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
// MQTT SETUP
// ===============================
const mqttClient = mqtt.connect(MQTT_URL, mqttOptions);

let prevPhase = null;

mqttClient.on('connect', () => {
    console.log("✅ MQTT Connected");

    mqttClient.subscribe('pmu/data', (err) => {
        if (err) console.error("❌ Subscribe Failed:", err);
        else console.log("📡 Subscribed to pmu/data");
    });
});

// ===============================
// MESSAGE HANDLER (FIXED)
// ===============================
mqttClient.on('message', async (topic, message) => {

    console.log("📡 RECEIVED:", message.toString());

    try {
        let parsed = JSON.parse(message.toString());

        // ✅ SUPPORT BOTH FORMATS
        let d = parsed.data ? parsed.data : parsed;

        // ===============================
        // CYBER DETECTION
        // ===============================
        let attack = d.attack || false;

        if (prevPhase !== null && Math.abs(d.phase - prevPhase) > 40) {
            attack = true;
            console.log("⚠️ Phase jump detected");
        }

        if (d.voltage > 300 || d.voltage < 50) {
            attack = true;
            console.log("⚠️ Voltage anomaly");
        }

        prevPhase = d.phase;

        // ===============================
        // SAFE DATA
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
        // SAVE TO MONGODB
        // ===============================
        try {
            await PMU.create(safeData);
            console.log("💾 Saved:", safeData);
        } catch (err) {
            console.error("❌ DB Error:", err);
        }

        // ===============================
        // SEND TO UI
        // ===============================
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(safeData));
            }
        });

    } catch (err) {
        console.error("❌ JSON ERROR:", err);
    }
});

// ===============================
// WEBSOCKET
// ===============================
wss.on('connection', () => {
    console.log("🌐 WebSocket Client Connected");
});

// ===============================
// API
// ===============================
app.get('/history', async (req, res) => {
    try {
        const data = await PMU.find().sort({ _id: -1 }).limit(100);
        res.json(data.reverse());
    } catch (err) {
        res.json([]);
    }
});

app.get('/replay', async (req, res) => {
    try {
        const data = await PMU.find().sort({ _id: 1 }).limit(200);
        res.json(data);
    } catch (err) {
        res.json([]);
    }
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
