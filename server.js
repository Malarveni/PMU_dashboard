// ===============================
// PMU Backend Server (MQTT → WebSocket)
// ===============================

const mqtt = require('mqtt');
const WebSocket = require('ws');

// ===============================
// 🔐 HiveMQ Configuration
// ===============================
const MQTT_URL = 'mqtts://cbd69323b9dc4e9bae875510cd9ce6b7.s1.eu.hivemq.cloud:8883';

const mqttOptions = {
    username: 'Pmu_user',
    password: 'Pmu_secure123',
    reconnectPeriod: 3000,   // auto reconnect
    connectTimeout: 5000
};

// ===============================
// 🌐 Connect to HiveMQ
// ===============================
const mqttClient = mqtt.connect(MQTT_URL, mqttOptions);

// ===============================
// 🌐 WebSocket Server
// ===============================
const wss = new WebSocket.Server({ port: 8080 });

// ===============================
// MQTT EVENTS
// ===============================
mqttClient.on('connect', () => {
    console.log("✅ Connected to HiveMQ");

    mqttClient.subscribe('pmu/data', (err) => {
        if (err) {
            console.error("❌ Subscription error:", err);
        } else {
            console.log("📡 Subscribed to topic: pmu/data");
        }
    });
});

mqttClient.on('reconnect', () => {
    console.log("🔄 Reconnecting to MQTT...");
});

mqttClient.on('error', (err) => {
    console.error("❌ MQTT Error:", err);
});

mqttClient.on('offline', () => {
    console.log("⚠️ MQTT Offline");
});

// ===============================
// WEBSOCKET EVENTS
// ===============================
wss.on('connection', (ws) => {
    console.log("🌐 New WebSocket client connected");

    ws.on('close', () => {
        console.log("❌ WebSocket client disconnected");
    });

    ws.on('error', (err) => {
        console.error("WebSocket error:", err);
    });
});

// ===============================
// DATA FORWARDING
// ===============================
mqttClient.on('message', (topic, message) => {

    try {
        let msgString = message.toString();

        console.log("📥 MQTT Data:", msgString);

        // Validate JSON
        let parsed = JSON.parse(msgString);

        // Optional checksum verification
        if (!parsed.data || parsed.checksum === undefined) {
            console.log("⚠️ Invalid data format");
            return;
        }

        // Broadcast to all WebSocket clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msgString);
            }
        });

    } catch (err) {
        console.error("❌ JSON Parse Error:", err);
    }
});

// ===============================
// SERVER START
// ===============================
console.log("🚀 WebSocket Server running at: ws://localhost:8080");