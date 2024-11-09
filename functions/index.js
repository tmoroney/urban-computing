// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { Timestamp } = require("firebase-admin/firestore");

// The Firebase Admin SDK to access Firestore.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const placesApiKey = process.env.PLACES_API_KEY;

initializeApp();

exports.addSensorData = onRequest({ region: "europe-west2" }, async (req, res) => {
    const payload = req.body.payload;

    let bluetoothDeviceCount = 0;
    let longitude = 0;
    let latitude = 0;

    // parse incoming payload
    for (let i = 0; i < payload.length; i++) {
        if (payload[i].name === "bluetooth") {
            bluetoothDeviceCount++;
        } else if (payload[i].name === "location") {
            longitude = payload[i].values.longitude;
            latitude = payload[i].values.latitude;
        }
    }

    const nanoTime = payload[0].time;
    let time = Timestamp.fromMillis(Math.floor(nanoTime / 1000000));

    let document = {
        deviceCount: bluetoothDeviceCount,
        location: { longitude, latitude },
        time: time
    };

    // Push the new message into Firestore using the Firebase Admin SDK.
    const writeResult = await getFirestore()
        .collection("sensor-data")
        .add(document);

    // Send back a message that we've successfully written the message
    res.json({ result: `Message with ID: ${writeResult.id} added.` });
});

exports.nearbyTouristAttractions = onDocumentCreated({ document: "/sensor-data/{documentId}", region: "europe-west2" }, async (event) => {
    // Grab the current value of what was written to Firestore.
    const location = event.data.data().location;
    const longitude = location.longitude;
    const latitude = location.latitude;

    const apiUrl = `https://api.geoapify.com/v2/places?categories=building.tourism,tourism.attraction&filter=circle:${longitude},${latitude},500&bias=proximity:${longitude},${latitude}&limit=20&apiKey=${placesApiKey}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    let attractionNames = data.features.map((attraction) => { return attraction.properties.formatted; });
    let attractionCount = attractionNames.length;

    await event.data.ref.set({ 
        nearbyAttractionsList: attractionNames,
        nearbyAttractionsCount: attractionCount
     }, { merge: true });
});
