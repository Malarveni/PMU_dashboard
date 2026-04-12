// ===============================
// PMU Advanced Backend Server (FINAL FIXED)
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
// DATA PROCESSING (FIXED)
// ===============================
mqttClient.on('message', async (topic, message) => {
    try {
        // 🔥 STEP 1: Parse full message
        let msg = JSON.parse(message.toString());

        // 🔥 STEP 2: Extract actual data
        let d = msg.data;

        if (!d) {
            console.log("❌ Invalid format (no data field)");
            return;
        }

        // 🔐 STEP 3: Checksum validation
        let calcChecksum = generateChecksum(JSON.stringify(d));

        if (calcChecksum !== msg.checksum) {
            console.log("⚠️ Checksum mismatch - possible cyber attack");
            return; // ignore fake data
        }

        let attack = d.attack || false;

        // 🔥 Extra backend cyber detection
        if (prevPhase !== null && Math.abs(d.phase - prevPhase) > 40) {
            attack = true;
            console.log("⚠️ Phase jump attack detected");
        }

        if (d.voltage > 300 || d.voltage < 50) {
            attack = true;
            console.log("⚠️ Voltage anomaly detected");
        }

        prevPhase = d.phase;

        // ===============================
        // SAVE TO DB
        // ===============================
        await PMU.create({
            voltage: d.voltage,
            current: d.current,
            phase: d.phase,
            frequency: d.frequency,
            rocof: d.rocof,
            lat: d.lat,
            lon: d.lon,
            timestamp: d.timestamp,
            attack: attack
        });

        // ===============================
        // SEND TO FRONTEND
        // ===============================
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    ...d,
                    attack: attack
                }));
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
    try {
        const data = await PMU.find().sort({ _id: -1 }).limit(100);
        res.json(data.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/replay', async (req, res) => {
    try {
        const data = await PMU.find().sort({ _id: 1 }).limit(200);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===============================
// START
// ===============================
const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
