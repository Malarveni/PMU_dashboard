// ===============================
// PMU Advanced Backend Server (FINAL)
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
// MQTT
// ===============================
const mqttClient = mqtt.connect(MQTT_URL, mqttOptions);

let prevPhase = null;

mqttClient.on('connect', () => {
    console.log("✅ MQTT Connected");
    mqttClient.subscribe('pmu/data');
});

// ===============================
// DATA PROCESSING + CYBER DETECTION
// ===============================
mqttClient.on('message', async (topic, message) => {
    try {
        let d = JSON.parse(message.toString());

        let attack = false;

        // ⚠️ Cyber attack detection rules
        if (prevPhase !== null && Math.abs(d.phase - prevPhase) > 40) {
            attack = true;
            console.log("⚠️ Phase jump attack detected");
        }

        if (d.voltage > 300 || d.voltage < 100) {
            attack = true;
            console.log("⚠️ Voltage spoofing detected");
        }

        prevPhase = d.phase;

        // Save to DB
        await PMU.create({ ...d, attack });

        // Send to frontend
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ ...d, attack }));
            }
        });

    } catch (err) {
        console.error("❌ Error:", err);
    }
});

// ===============================
// WEBSOCKET
// ===============================
wss.on('connection', () => {
    console.log("🌐 Client connected");
});

// ===============================
// API
// ===============================
app.get('/history', async (req, res) => {
    const data = await PMU.find().sort({ _id: -1 }).limit(100);
    res.json(data.reverse());
});

app.get('/replay', async (req, res) => {
    const data = await PMU.find().sort({ _id: 1 }).limit(200);
    res.json(data);
});

// ===============================
// START
// ===============================
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🚀 Running on ${PORT}`);
});
