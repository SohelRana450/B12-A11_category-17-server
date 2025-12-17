
const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config()
const port = process.env.port || 3000;
const { MongoClient, ServerApiVersion } = require('mongodb');

app.use(cors())
app.use(express.json())





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

    app.post('/add-ticket',async(req,res)=>{
        const add = req.body
        const result = await ticketCollection.insertOne(add)
        res.send(result)
    })

    app.get('/tickets', async(req,res)=>{
        const data = req.body
        const result = await ticketCollection.find(data).sort({createdAt: 'desc'}).limit(8).toArray()
        res.send(result)
    })
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
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