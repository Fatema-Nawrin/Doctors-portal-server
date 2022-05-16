const express = require('express')
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000

// middleware 
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xyo75.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        console.log('Database connected');
        const treatmentCollection = client.db('doctors_portal').collection('treatments');
        const bookingCollection = client.db('doctors_portal').collection('bookings');

        app.get('/treatments', async (req, res) => {
            const query = {};
            const cursor = treatmentCollection.find(query);
            const treatments = await cursor.toArray();
            res.send(treatments);
        });

        // Not the proper way for query
        // use aggregate, lookup, pipeline,match,group

        app.get('/available', async (req, res) => {

            const date = req.query.date;

            // step 1 : get all treatments
            const treatments = await treatmentCollection.find().toArray();

            // step 2: get the booking of that day . OP--[{},{},{}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each treatment
            treatments.forEach(treatment => {

                // step 4: find booking for that treatment OP--[{},{},{}]
                const treatmentBookings = bookings.filter(book => book.treatment === treatment.name);

                // step 5: select slots for treatment bookings['','','']
                const bookedSlots = treatmentBookings.map(book => book.slot);

                // step 6: select slots in treatment that are not in booked
                const available = treatment.slots.filter(slot => !bookedSlots.includes(slot))
                // 
                treatment.slots = available;
            })

            res.send(treatments)
        })

        /** 
         * API Naming Convention
         * app.get('/booking') //get all bookings in this collection
         * app.get('/booking/:id') // get specific bookings
         * app.post('/booking')// add a new booking
         * app.patch('/booking/:id')// update a booking
         * app.put('/booking/:id')// update a booking if exists or insert if doesn't ---upsert
         * app.delete('/booking/:id')// delete a booking
          **/

        app.get('/booking', async (req, res) => {
            const patient = req.query.patient;
            const query = { patient: patient };
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings)
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })

    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Doctors portal server running')
})

app.listen(port, () => {
    console.log('Listening to doctors portal at', port);
})