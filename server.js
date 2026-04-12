// ===============================
// PMU Advanced Backend Server
// ===============================

const mqtt = require('mqtt');
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// ===============================
// 🔐 CONFIG (Use ENV in Render)
// ===============================
const MQTT_URL = 'mqtts://cbd69323b9dc4e9bae875510cd9ce6b7.s1.eu.hivemq.cloud:8883';

const mqttOptions = {
    username: process.env.MQTT_USERNAME || 'Pmu_user',
    password: process.env.MQTT_PASSWORD || 'Pmu_secure123'
};

// 🔴 REPLACE THIS in Render ENV (IMPORTANT)
const MONGO_URL = process.env.MONGO_URL;

// ===============================
// 🌐 INIT
// ===============================
const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===============================
// 🧠 DATABASE CONNECT
// ===============================
mongoose.connect(MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

// ===============================
// 📦 DATABASE MODEL
// ===============================
const PMUSchema = new mongoose.Schema({
    voltage: Number,
    current: Number,
    phase: Number,
    timestamp: String
});

const PMU = mongoose.model('PMU', PMUSchema);

// ===============================
// 📡 MQTT CONNECT
// ===============================
const mqttClient = mqtt.connect(MQTT_URL, mqttOptions);

mqttClient.on('connect', () => {
    console.log("✅ MQTT Connected");
    mqttClient.subscribe('pmu/data', (err) => {
        if (err) console.error("❌ MQTT Subscribe Error:", err);
    });
});

mqttClient.on('error', (err) => {
    console.error("❌ MQTT Error:", err);
});

// ===============================
// 🔥 REAL-TIME + STORAGE
// ===============================
mqttClient.on('message', async (topic, message) => {
    try {
        let data = JSON.parse(message.toString());

        // Save to MongoDB
        await PMU.create({
            voltage: data.voltage,
            current: data.current,
            phase: data.phase,
            timestamp: data.timestamp
        });

        // Send LIVE via WebSocket
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });

    } catch (err) {
        console.error("❌ Data Error:", err);
    }
});

// ===============================
// 🌐 WEBSOCKET EVENTS
// ===============================
wss.on('connection', (ws) => {
    console.log("🌐 WebSocket Client Connected");

    ws.on('close', () => {
        console.log("❌ WebSocket Client Disconnected");
    });

    ws.on('error', (err) => {
        console.error("WebSocket Error:", err);
    });
});

// ===============================
// 📊 REST API (HISTORY + REPLAY)
// ===============================

// Get last 100 values
app.get('/history', async (req, res) => {
    try {
        const data = await PMU.find().sort({ _id: -1 }).limit(100);
        res.json(data.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Replay data
app.get('/replay', async (req, res) => {
    try {
        const data = await PMU.find().sort({ _id: 1 }).limit(200);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===============================
// 🚀 START SERVER
// ===============================
const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
