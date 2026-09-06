const dns = require('node:dns');
dns.setServers(['1.1.1.1', '1.0.0.1']); 
const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
dontenv.config();
const app = express();

const uri = process.env.MONGODB_URI;
const PORT = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),);

const verifyToken = async (req, res, next) => { 
  const authHeader = req.headers.authorization; 
  // console.log("authHeader", authHeader);
  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ msg: "Unauthorized" });
  } 
  const token = authHeader.split(" ")[1]; 
  // console.log(token);
  if (!token) {
    return res.status(401).json({ msg: "Unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    // console.log("payload", payload);
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ msg: "Unauthorized" });
  }
};


const sellerVerify = async (req, res, next) => {
  const user = req.user;
  if(user.role !== "seller" || user.plan !== "pro"){
    return res.status(401).json({ msg: "Unauthorized" });
  }
  next();
}
    
 

async function run() {
  try {
    // await client.connect();
    const db = client.db("tech-bazaar");
    const subscriptionsCollection = db.collection("subscriptions");
    const usersCollection = db.collection("user");
    const productsCollection = db.collection("products");
    // const ordersCollection = db.collection("orders");


    app.post("/subscription",async(req,res)=>{
      const {sessionId,userId,priceId} = req.body;

      const isExist = await subscriptionsCollection.findOne({ sessionId });
      if (isExist) {
        res.json({ message: "subscription already exist" });
        return;
      }

      await subscriptionsCollection.insertOne({
        sessionId, 
        userId,   
        priceId,
      });
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { plan: "pro" } },
      );
      res.json({message:"subscription created successfully"});
    })



    app.post("/seller/products", verifyToken, sellerVerify, async(req,res)=>{
     
      const data = req.body;
      // const id = data._id;
      // const isExist = await productsCollection.findOne({ _id: new ObjectId(id) });
      //   if (isExist) {
      //     res.json({ message: "product already exist" });
      //     return;
      //   }
      
      const result = await productsCollection.insertOne({...data,userId:req.user.id});
      res.send(result)
    })


    app.get("/seller/products", verifyToken, sellerVerify, async(req,res)=>{
      const { page = 1, limit = 10 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const result = await productsCollection.find({userId:req.user.id}).skip(skip).limit(Number(limit)).toArray();
      const totalData = await productsCollection.countDocuments({userId:req.user.id});
      const totalPage = Math.ceil(totalData / Number(limit));
      res.send({data:result,page:Number(page),totalPage})
    }) 
    
    
    app.get("/products", async(req,res)=>{
      const {search} = req.query;
      // console.log(search);
      const query = {};
      if(search && search!="undefined"){
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }
      const result = await productsCollection.find(query).toArray();
      res.send(result)
    })
      
  
 

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
