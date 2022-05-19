const express = require('express')
const cors = require('cors');
const nodemailer = require('nodemailer')
var sgTransport = require('nodemailer-sendgrid-transport');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const res = require('express/lib/response');
const app = express()
const port = process.env.PORT || 5000

// middleware 
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xyo75.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// const emailSenderOptions = {
//     auth: {
//         api_key: process.env.EMAIL_SENDER_KEY
//     }
// }
// const emailClient = nodemailer.createTransport(sgTransport(options));

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({
                message: 'Forbidden access'
            })
        }
        req.decoded = decoded;
        next();
    });

}
// function sendAppointmentEmail(booking) {
//     const { patient, patientName, treatment, date, slot } = booking;
//     var email = {
//         from: process.env.EMAIL_SENDER,
//         to: patient,
//         subject: `Appointment for your ${treatment} is on ${date} at ${slot} is confirmed`,
//         text: `Appointment for your ${treatment} is on ${date} at ${slot} is confirmed`,
//         html: `
//         <div>
//             <p>Hello ${patientName}</p>
//             <p>Appointment for your ${treatment} is confirmed</p>
//             <p>Looking forward to seeing you on ${date} at ${slot}</p>
//         </div>`
//     };
//     emailClient.sendMail(email, function (err, info) {
//         if (err) {
//             console.log(err);
//         }
//         else {
//             console.log('Message sent: ', info);
//         }
//     });

// }

async function run() {
    try {
        await client.connect();
        console.log('Database connected');
        const treatmentCollection = client.db('doctors_portal').collection('treatments');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        app.get('/treatments', async (req, res) => {
            const query = {};
            const cursor = treatmentCollection.find(query).project({ name: 1 });
            const treatments = await cursor.toArray();
            res.send(treatments);
        });
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);

        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        })

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

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'Forbidden acess' });
            }
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            // sendAppointmentEmail(booking);
            return res.send({ success: true, result });
        });
        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors)
        })

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result)
        })

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter);
            res.send(result)
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