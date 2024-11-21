// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const { onRequest } = require("firebase-functions/v2/https");
const { Timestamp } = require("firebase-admin/firestore");

// The Firebase Admin SDK to access Firestore.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const placesApiKey = process.env.PLACES_API_KEY;

initializeApp();

exports.addSensorData = onRequest({ region: "europe-west2" }, async (req, res) => {
    const payload = req.body.payload;
    const userId = req.query.uid;
    if (!userId) {
        res.status(400).send("User ID is required.");
        return;
    }

    let longitude = 0;
    let latitude = 0;
    let bluetoothDeviceList = [];

    // parse incoming payload
    for (let i = 0; i < payload.length; i++) {
        if (payload[i].name === "bluetooth") {
            bluetoothDeviceList.push(payload[i].values.id);
        } else if (payload[i].name === "location") {
            longitude = payload[i].values.longitude;
            latitude = payload[i].values.latitude;
        }
    }

    // Get nearby attractions
    const apiUrl = `https://api.geoapify.com/v2/places?categories=building.tourism,tourism.attraction&filter=circle:${longitude},${latitude},500&bias=proximity:${longitude},${latitude}&limit=20&apiKey=${placesApiKey}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    let attractions = data.features;
    let attractionsList = [];
    for (let i = 0; i < attractions.length; i++) {
        let placeData = {
            address: attractions[i].properties.formatted,
            lon: attractions[i].properties.lon,
            lat: attractions[i].properties.lat,
        };
        attractionsList.push(placeData);
    }

    const nanoTime = payload[0].time;
    let time = Timestamp.fromMillis(Math.floor(nanoTime / 1000000));

    // Create a new document in the subcollection with the data
    let documentData = {
        location: { 
            lat: latitude, 
            lon: longitude 
        },
        nearbyDevices: bluetoothDeviceList,
        nearbyAttractions: attractionsList,
        time: time
    };

    // Push the new message into Firestore using the Firebase Admin SDK.
    const writeResult = await getFirestore()
        .collection("users") // Reference the main collection
        .doc(userId) // Reference the specific user document
        .collection("sensor-data") // Access the subcollection
        .add(documentData) // Add new document to the subcollection

    // Send back a message that we've successfully written the message
    res.json({ result: `Message with ID: ${writeResult.id} added.` });
});

exports.testFunction = onRequest({ region: "europe-west2" }, async (req, res) => {
    const payload = req.body.payload;
    const writeResult = await getFirestore()
        .collection("example-data")
        .add(payload);

    res.json({ result: `Message with ID: ${writeResult.id} added.` });
});

exports.adjustTimestamps = onRequest({ region: "europe-west2" }, async (req, res) => {
    try {
        // Extract the user ID from the request query
        const userId = req.query.uid;
        if (!userId) {
            res.status(400).send("User ID is required.");
            return;
        }

        const minutes = req.body.minutes;

        const db = getFirestore();
        const userSensorDataRef = db.collection("users").doc(userId).collection("sensor-data");

        // Fetch all documents in the user's subcollection
        const snapshot = await userSensorDataRef.get();

        if (snapshot.empty) {
            res.json({ message: `No documents found for user: ${userId}` });
            return;
        }

        const batch = db.batch();

        // Iterate over each document and adjust the timestamp
        snapshot.forEach((doc) => {
            const docData = doc.data();

            if (docData.time && docData.time.toDate) {
                const currentTime = docData.time.toDate();
                const adjustedTime = Timestamp.fromDate(new Date(currentTime.getTime() - minutes * 60 * 1000)); // Subtract 1 hour

                // Update the timestamp
                batch.update(userSensorDataRef.doc(doc.id), { time: adjustedTime });
            }
        });

        // Commit the batch update
        await batch.commit();

        res.json({ message: `Timestamps adjusted for ${snapshot.size} documents.` });
    } catch (error) {
        console.error("Error adjusting timestamps:", error);
        res.status(500).send("Internal Server Error");
    }
});