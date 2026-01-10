require('dotenv').config()
const express = require('express');
const cors = require('cors');
const admin = require("firebase-admin");
const app = express();
const port = process.env.port || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.Stripe_Secret_Api_Key)


const decoded = Buffer.from(process.env.FB_SERVICE_KEY,'base64').toString('utf8')

const serviceAccount = JSON.parse(decoded)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});




app.use(cors({
  origin: [process.env.Client_Domin_Url],
    credentials: true,
    optionSuccessStatus: 200,
}))
app.use(express.json())



const verifyFBToken = async(req,res,next)=>{

  const token = req.headers.authorization
  
if(!token){
  return res.status(401).send({message: 'unathorized access'})
}
  try {
    const idToken = token.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(idToken) 
    req.decoded_email = decoded.email


    next()

  } catch (error) {
    return res.status(401).send({message: 'unathorized access'})
  }
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster01.aptihsx.mongodb.net/?appName=Cluster01`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    const ticket = client.db('StoreTicket')
    const ticketCollection = ticket.collection('ticket')
    const bookingCollection = ticket.collection('booking_ticket')
    const bookedCollection = ticket.collection('request_booking')
    const userCollection = ticket.collection('users')
    const transactionCollection = ticket.collection('transaction_history')


    const verifyAdmin = async(req, res, next)=>{
      const email = req.decoded_email
      const user = await userCollection.findOne({email})

      if( user?.role !== 'admin'){
        return res.status(403).send({message: 'forbidden access'})
      }
      
      next()
    }
    const verifyVendor = async(req, res, next)=>{
      const email = req.decoded_email
      const user = await userCollection.findOne({email})

      if(user?.role !== 'vendor'){
        return res.status(403).send({message: 'forbidden access'})
      }
      
      next()
    }

    app.post('/add-ticket',verifyFBToken,verifyVendor,async(req,res)=>{
        const add = req.body
        const vendor = await userCollection.findOne({email: add?.Vendor_data?.email})
        if(vendor?.fraud){
          return 
        }
        add.status = "pending"
        add.hidden = false;
        add.createdAt = new Date().toISOString();
        const result = await ticketCollection.insertOne(add)
        res.send(result)
    })

    app.get('/advirtised-tickets',verifyFBToken,async(req,res)=>{
      const filter = await ticketCollection.find({advertised: true,hidden: { $ne: true}}).toArray()
      res.send(filter)
    }
    )

    app.get('/tickets',verifyFBToken,async(req,res)=>{
        const data = req.body
        const result = await ticketCollection.find({ data,
          hidden: { $ne: true}}).sort({createdAt: 'desc'}).limit(9).toArray()
        res.send(result)
    })
    app.get('/tickets_listed',verifyFBToken,verifyAdmin,async(req,res)=>{
        const data = req.body
        const result = await ticketCollection.find({ data,
          hidden: { $ne: true}}).sort({createdAt: 'desc'}).toArray()
        res.send(result)
    })
    app.get('/tickets-list',verifyFBToken,verifyAdmin,async(req,res)=>{
        const data = req.body
        const result = await ticketCollection.find({ data,status: "approved",
          hidden: { $ne: true}}).sort({createdAt: 'desc'}).toArray()
        res.send(result)
    })

 
app.get('/all-tickets', verifyFBToken, async (req, res) => {
  try {
    const { sort, search, Transport, page = 1, limit = 6 } = req.query;

    const query = { hidden: { $ne: true } };
    const andConditions = [];

    if (search) {
      const parts = search.split(/ to |→/i).map(s => s.trim());
      if (parts.length === 2) {
        andConditions.push({
          From: { $regex: parts[0], $options: "i" },
          To: { $regex: parts[1], $options: "i" },
        });
      } else {
        andConditions.push({
          $or: [
            { From: { $regex: search, $options: "i" } },
            { To: { $regex: search, $options: "i" } },
          ],
        });
      }
    }

    if (Transport) {
      andConditions.push({
        Transport: { $regex: Transport, $options: "i" },
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const sortQuery =
      sort === "asc" ? { Price: 1 } :
      sort === "desc" ? { Price: -1 } :
      {};

    const skip = (Number(page) - 1) * Number(limit);

    const total = await ticketCollection.countDocuments(query);

    const tickets = await ticketCollection
      .find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(Number(limit))
      .toArray();

    res.send({ total, page: Number(page), limit: Number(limit), data: tickets });

  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Server error" });
  }
});


    app.get('/all-tickets/:id',verifyFBToken, async(req,res)=>{
        const id = req.params.id
        const query = {_id: new ObjectId(id)}
        const result = await ticketCollection.findOne(query,{ hidden: { $ne: true}})
        res.send(result)
    })

    app.get('/tickets/vendor',verifyFBToken,verifyVendor, async(req,res)=>{
      const result = await ticketCollection.find({'Vendor_data.email': req.decoded_email}).toArray()
      res.send(result)
    })


    app.delete('/ticket/:id',verifyFBToken,verifyVendor, async (req, res) => {
  const id = req.params.id;
  const result = await ticketCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
    });

   

    app.put('/update/:id',verifyFBToken,verifyVendor, async (req, res) => {
  const id = req.params.id;
  const data = req.body;

  const filter = { _id: new ObjectId(id) };

  const updateDoc = {
    $set: {
      Ticket_title: data.Ticket_title,
      From: data.From,
      To: data.To,
      Transport: data.Transport,
      Price: Number(data.Price),
      Ticket_quantity: Number(data.Ticket_quantity),
      departureDateTime: data.departureDateTime,
      Perks: data.Perks,
      image: data.image,
      Vendor_name: data.Vendor_name,
      Vendor_email: data.Vendor_email,
      updatedAt: new Date()
    }
  };

  const result = await ticketCollection.updateOne(filter, updateDoc);

  res.send({ success: true, result });
});



    app.patch('/tickets/approve/:id',verifyFBToken,verifyAdmin, async (req, res) => {
     const id = req.params.id;

     const result = await ticketCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "approved" } }
     );

     res.send(result);
    });

    app.patch('/tickets/reject/:id',verifyFBToken,verifyAdmin, async (req, res) => {
     const id = req.params.id;

     const result = await ticketCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "rejected" } }
    );

    res.send(result);
   });


  app.patch("/ticket/advertise/:id",verifyFBToken,verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const ticket = await ticketCollection.findOne({ _id: new ObjectId(id) });

  if (!ticket) {
    return res.status(404).send({ message: "Ticket not found" });
  }

  const advertisedCount = await ticketCollection.countDocuments({ advertised: true });

  if (!ticket.advertised) {
    if (advertisedCount >= 6) {
      return res.status(400).send({ message: "Maximum 6 advertised tickets allowed!" });
    }
  }

  const update = await ticketCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { advertised: !ticket.advertised } }
  );

  res.send( update );
});



   app.post("/bookings",verifyFBToken, async (req, res) => {
  try {
    const { ticketId, quantity, ticketTitle, unitPrice, totalPrice,Time,From,To,image, status,Vendor_data,customer } = req.body;
    

    const booking = {
      ticketId,
      ticketTitle,
      quantity,
      unitPrice,
      totalPrice,
      status,
     departureDateTime: Time,
      from: From,
      to: To,
      image,
      Vendor_data,
      customer,
    };
    await bookedCollection.insertOne(booking)
    await bookingCollection.insertOne(booking);
    res.send({ success: true, booking});
  } catch (err) {
    res.send({ message: "Booking failed", error: err.message });
  }
   });

   app.get("/book-tickets",verifyFBToken,async (req, res) => {
    const bookings = await bookingCollection.find({'customer.email':req.decoded_email}).toArray();
    res.send(bookings);
  
   });


    app.get("/request-bookings",verifyFBToken,verifyVendor,async (req, res) => {
      const data = req.body
      const bookings = await bookedCollection.find(data).toArray();
  res.send(bookings);
    });
app.patch("/bookings/:id",verifyFBToken,verifyVendor, async (req, res) => {
  try {
    const  id  = req.params.id;
    const { status } = req.body;
    await bookingCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "accepted" } }
  );
    
    const result = await bookedCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );
    
    if (result.modifiedCount === 0) {
      return ({ error: "Booking not found" });
    }
    
    res.send();
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.patch("/bookings/reject/:id",verifyFBToken,verifyVendor, async (req, res) => {
  const id = req.params.id
  const {status} = req.body

    await bookingCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "rejected" } }
  );
   
    await bookedCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );
  res.send();
});


app.get("/total-revenue",verifyFBToken,verifyVendor,async (req, res) => {
  try {
    const email = req.decoded_email
    const summaryPipeline = [
      {
        $match: {
          "Vendor_data.email": email,
          status: "paid",
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalPrice" },
          totalTicketsSold: { $sum: "$quantity" },
        },
      },
    ];

    const summaryResult = await bookingCollection
      .aggregate(summaryPipeline)
      .toArray();

    const summary = summaryResult[0] || {
      totalRevenue: 0,
      totalTicketsSold: 0,
    };

   

    const totalTicketsAdded = await ticketCollection.countDocuments({
      "Vendor_data.email": email,
    });

    res.send({
      totalRevenue: summary.totalRevenue,
      totalTicketsSold: summary.totalTicketsSold,
      totalTicketsAdded,
      
    });
  } catch (err) {
    res.status(500).send({ success: false, message: err.message });
  }
});


app.post('/create-checkout-session',verifyFBToken, async(req,res)=>{
  const paymentInfo = req.body
 
  
  await bookingCollection.updateOne(
      { _id: new ObjectId(paymentInfo.bookingId) },
      { $set: { status: "paid" } }
    );

    await ticketCollection.updateOne(
      { _id: new ObjectId(paymentInfo.ticketId) },
      { $inc: { Ticket_quantity: -paymentInfo.quantity } }
    );

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: paymentInfo?.ticketTitle,
            description: paymentInfo?.departureDateTime,
            images: [paymentInfo?.image]

          },
          unit_amount: paymentInfo?.totalPrice * 100,
        },
        quantity: paymentInfo?.quantity,
      },

    ],
      customer_email: paymentInfo?.customer?.email,
      mode: 'payment',
      metadata: {
        Id: paymentInfo?.bookingId,
        ticketId: paymentInfo?.ticketId,
        customer: paymentInfo?.customer?.email,
      },
      success_url: `${process.env.Client_Domin_Url}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.Client_Domin_Url}/dashboard/user/booked-tickets/${paymentInfo.ticketId}`
   })
   
  
   res.send({url: session.url})
})



app.post('/payment-success',verifyFBToken, async (req, res) => {
  const { sessionId } = req.body;

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  console.log(session);

  const bookingId = session.metadata.Id;

  const booking = await bookingCollection.findOne({
    _id: new ObjectId(bookingId),
  });
 
  const transaction = await transactionCollection.findOne({transactionId: session.payment_intent})

  if(session.status === 'complete' && booking && !transaction){
    const bookedInfo = {
      ticketId: session.metadata.ticketId,
      transactionId: session.payment_intent,
      customer: session.metadata.customer,
      Vendor: booking.Vendor_data,
      ticketTitle: booking.ticketTitle,
      unitPrice: booking.unitPrice,
      quantity: booking.quantity,
      price: booking.totalPrice,
      Payment_Date: new Date().toISOString(),
    }
   await transactionCollection.insertOne(bookedInfo)
  }

  res.send(statusUpdated, quantityUpdate);
});

app.get('/transaction-history',verifyFBToken,async(req,res)=>{
  const email = req.decoded_email//params
    if(email !==req.decoded_email){
      return res.status(403).send({message: 'forbidden access'})
  }
  const result = await transactionCollection.find({customer: email}).toArray()
  res.send(result)
})




app.post('/user', async (req, res) => {
  const userData = req.body;
  userData.created_at = new Date().toISOString();
  userData.last_logIn = new Date().toISOString();
  userData.role = "customer";
  userData.isMainAdmin = false;

  const existingUser = await userCollection.findOne({ email: userData.email });

  if (existingUser) {
    await userCollection.updateOne(
      { email: userData.email },
      { $set: { last_logIn: new Date().toISOString() } }
    );
    return res.send(existingUser);
  }

  
  const adminCount = await userCollection.countDocuments({ role: "admin", isMainAdmin: true });

  if (adminCount === 0) {
    userData.role = "admin";
    userData.isMainAdmin = true;
  }

  const result = await userCollection.insertOne(userData);
  res.send(result);
});


app.get('/user/role',verifyFBToken, async (req, res) => {
  const email = req.decoded_email
  const user = await userCollection.findOne({ email });
  res.send({ role: user?.role });
});


app.get('/admin/users',verifyFBToken,verifyAdmin, async (req, res) => {

  const filter = { isMainAdmin: { $ne: true } };
  const filteredUsers = await userCollection.find(filter).toArray();
  res.send(filteredUsers);
});


app.patch("/users/admin/:email",verifyFBToken,verifyAdmin, async (req, res) => {
  const email = req.params.email;
  const result = await userCollection.updateOne(
    { email },
    { $set: { role: "admin" } }
  );
  res.send(result);
});

app.patch("/users/vendor/:email",verifyFBToken,verifyAdmin, async (req, res) => {
  const email = req.params.email;
  const result = await userCollection.updateOne(
    { email },
    { $set: { role: "vendor" } }
  );
  res.send(result);
});


app.patch("/users/customer/:email",verifyFBToken,verifyAdmin, async (req, res) => {
  const email = req.params.email;
  const result = await userCollection.updateOne(
    { email },
    { $set: { role: "customer" } }
  );
  res.send(result);
});

 app.patch("/ticket/advertise/:id",verifyFBToken,verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const ticket = await ticketCollection.findOne({ _id: new ObjectId(id) });

  const totalAds = await ticketCollection.countDocuments({ advertised: 'true' });

  if (!ticket.advertised && totalAds >= 6) {
    return res.status(400).send({ message: "Max 6 advertised tickets allowed" });
  }

  const result = await ticketCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { advertised: !ticket.advertised } }
  );

  res.send(result);
   });


app.patch("/users/fraud/:email",verifyFBToken,verifyAdmin, async (req, res) => {
  const email = req.params.email;

  await userCollection.updateOne(
    { email },
    { $set: { fraud: true,} }
  );
 const result = await ticketCollection.updateMany(
    { 'Vendor_data.email': email },
    { $set: { hidden: true } }
  );
  res.send(result);
});


app.patch('/users/unfraud/:email',verifyFBToken,verifyAdmin, async (req, res) => {
  const email = req.params.email;

  await userCollection.updateOne({ email }, { $set: { fraud: false } });

  await ticketCollection.updateMany(
    { "Vendor_data.email": email },
    { $set: { hidden: false } }
  );

  res.send();
});





    
  } finally {
    
  }
}
run().catch(console.dir);


app.get('/', (req,res)=>{
    res.send('Hello World')
})
app.listen(port, ()=>{
    console.log(`Server is running now ${port}`);
})