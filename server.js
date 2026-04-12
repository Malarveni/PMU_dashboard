// ===============================
// PMU Advanced Backend Server
// ===============================

const mqtt = require('mqtt');
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// ===============================
// 🔐 CONFIG
// ===============================
const MQTT_URL = 'mqtts://cbd69323b9dc4e9bae875510cd9ce6b7.s1.eu.hivemq.cloud:8883';

const mqttOptions = {
    username: 'Pmu_user',
    password: 'Pmu_secure123'
};

// MongoDB (Use MongoDB Atlas)
const MONGO_URL = "mongodb+srv://malarvenisaravanan_db_user:<db_password>@pmu.fkgoyet.mongodb.net/?appName=PMU";
// ===============================
// 🌐 INIT
// ===============================
const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===============================
// 🧠 DATABASE MODEL
// ===============================
mongoose.connect(MONGO_URL);

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
    mqttClient.subscribe('pmu/data');
});

// ===============================
// 🔥 REAL-TIME + STORAGE
// ===============================
mqttClient.on('message', async (topic, message) => {
    try {
        let data = JSON.parse(message.toString());

        // Save to DB
        await PMU.create({
            voltage: data.voltage,
            current: data.current,
            phase: data.phase,
            timestamp: data.timestamp
        });

        // Send LIVE
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });

    } catch (err) {
        console.error("Error:", err);
    }
});

// ===============================
// 📊 REST API (HISTORY)
// ===============================

// Get last 100 values
app.get('/history', async (req, res) => {
    const data = await PMU.find().sort({_id: -1}).limit(100);
    res.json(data.reverse());
});

// Replay data
app.get('/replay', async (req, res) => {
    const data = await PMU.find().sort({_id: 1}).limit(200);
    res.json(data);
});

// ===============================
// 🚀 START SERVER
// ===============================
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log("🚀 Server running on port", PORT);
});
