const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const nodemailer = require("nodemailer");
const port = process.env.PORT || 5000;

// Middleware Configuration
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log('JWT Verification Error:', err);
      return res.status(401).send({ message: 'Unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};
//send email using nodemailer
const sendEmail = (emailAddress, emailData) => {
  // create transporter
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
  });
  // verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.log(error)
    } else {
      console.log('Transporter is ready to emails', success)
    }
  })
  //  transporter.sendMail()
  const mailBody = {
    from:process.env.NODEMAILER_USER, // sender address
    to: emailAddress, // list of receivers
    subject: emailData?.subject,
    // text: emailData?.message, // plain text body
    html: `<p>${emailData?.message}</p>`, // html body
  }
  // send email
     transporter.sendMail(mailBody,(error,info)=>{
      if(error){
        console.log(error)
      }else{
        // console.log(info)
        console('Email Sent: '+info?.response)
      }

     })
}
// MongoDB Connection Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lbrnp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect(); // ✅ Ensure MongoDB connection is established



    const userCollection = client.db('Panjabi').collection('users');
    const PanjabiCollection = client.db('Panjabi').collection('panjabi');
    const purchasesCollection = client.db('Panjabi').collection('purchases');

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email;
      const query = { email }
      const result = await userCollection.findOne(query)
      if (!result || result?.role !== 'admin')
        return res
          .status(403)
          .send({ message: 'Forbidden Access ! Admin only Action' })
      next()

    }
    const verifySeller = async (req, res, next) => {
      const email = req.user?.email;
      const query = { email }
      const result = await userCollection.findOne(query)
      if (!result || result?.role !== 'seller')
        return res
          .status(403)
          .send({ message: 'Forbidden Access ! Seller only Action' })
      next()

    }


    // Generate JWT Token
    app.post('/jwt', async (req, res) => {
      const { email } = req.body; // ✅ Ensure we destructure email properly
      if (!email) {
        return res.status(400).send({ message: 'Email is required' });
      }

      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      });

      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true, token });
    });
    // Logout Endpoint
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send({ message: 'Logout failed', error: err });
      }
    });


    // Users------------------------------------------------------------------------------>
    // save or update user in db
    app.post('/users/:email', async (req, res) => {
      sendEmail()
      const email = req.params.email;
      const query = { email };
      const user = req.body;

      const isExist = await userCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
      }
      const result = await userCollection.insertOne({
        ...user,
        role: 'customer',
        timestamp: Date.now(),
      });
      res.send(result);
    })
    // manage user status and role
    app.patch('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const user = await userCollection.findOne(query)
      if (!user || user?.status === 'Requested')
        return res
          .status(400)
          .send('You Have already request,wait for some time')


      const updateDoc = {
        $set: {
          status: 'Requested'
        }
      }
      const result = await userCollection.updateOne(query, updateDoc)
      res.send(result)

    })
    // get user role 
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email
      const result = await userCollection.findOne({ email })
      res.send({ role: result?.role })
    })
    // get all user data
    app.get('/all-users/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email
      const query = { email: { $ne: email } }
      const result = await userCollection.find(query).toArray()
      res.send(result)
    })
    // update a user role $ status
    app.patch('/user/role/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const { role, status } = req.body;
      const filter = { email };
      const updateOne = {
        $set: { role, status: 'Verified' },
      };
      const result = await userCollection.updateOne(filter, updateOne);
      res.send(result)
    })




    // Panjabi----------------------------->

    //  get inventory data for  seller
    app.get('/panjabi/seller', verifyToken, verifySeller, async (req, res) => {
      const email = req.user.email
      const result = await PanjabiCollection.find({ 'seller.email': email }).toArray()
      res.send(result)
    })

    // delete a Panjabi from db by seller
    app.delete('/panjabi/:id', verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await PanjabiCollection.deleteOne(query)
      res.send(result)
    })

    // update a panjabi from db by seller
    app.put("/panjabi/:id", verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      const updatedPanjabi = req.body;

      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: updatedPanjabi.name,
          price: updatedPanjabi.price,
          quantity: updatedPanjabi.quantity,
          category: updatedPanjabi.category,
          description: updatedPanjabi.description,
          image: updatedPanjabi.image,
          sizeS: updatedPanjabi.sizeS,
          sizeM: updatedPanjabi.sizeM,
          sizeL: updatedPanjabi.sizeL,
        },
      };

      try {
        const result = await PanjabiCollection.updateOne(filter, updatedDoc);
        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: "No changes made or panjabi not found" });
        }
        res.status(200).json({ message: "Panjabi updated successfully" });
      } catch (error) {
        console.error("Error updating panjabi:", error);
        res.status(500).json({ message: "Server error while updating panjabi" });
      }
    });






    app.post('/panjabi', verifyToken, async (req, res) => {
      const panjabi = req.body;
      const result = await PanjabiCollection.insertOne(panjabi)
      res.send(result)
    })
    // get all data in db
    app.get('/panjabi', async (req, res) => {
      const result = await PanjabiCollection.find().toArray()
      res.send(result)
    })
    // get a panjabi by id
    app.get('/panjabi/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await PanjabiCollection.findOne(query)
      res.send(result)
    })




    // purchases ------------------------------------------------------>
    // save order data in bd
    app.post('/purchases', verifyToken, async (req, res) => {
      const purchasesInfo = req.body;
      const result = await purchasesCollection.insertOne(purchasesInfo)
      // send email
      if(result?.insertedId){
        // to customer
        sendEmail(purchasesInfo?.customer?.email,{
          subject:'Order SuccessFull',
          message:`You've Placed an order successFully. Transaction Id:${result?.insertedId}`
        })
        // to seller
        sendEmail(purchasesInfo?.seller,{
          subject:'Hurray!, You Have an order to process',
          message:`Get the panjabi ready for ${purchasesInfo?.customer?.name}`
        })
      }
      res.send(result)
    })
    // Manage Quantity 
    app.patch('/panjabi/quantity/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { quantityToUpdate, status } = req.body;
      const filter = { _id: new ObjectId(id) };

      // Default update for decreasing quantity
      let updateDoc = {
        $inc: { quantity: -quantityToUpdate }
      };

      // If status is 'increase', modify the updateDoc to increase the quantity
      if (status === 'increase') {
        updateDoc = {
          $inc: { quantity: quantityToUpdate }
        };
      }

      try {
        // Perform the update
        const result = await PanjabiCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to update quantity' });
      }
    });
    // get all   purchase  for a specific customer
    app.get('/customer-purchase/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const query = { 'customer.email': email }
      const result = await purchasesCollection.aggregate([
        {
          $match: query
        },
        {
          $addFields: {

            panjabiId: { $toObjectId: '$panjabiId' }
          }
        },
        {
          $lookup: {
            from: 'panjabi',
            localField: 'panjabiId',
            foreignField: '_id',
            as: 'panjabi'
          }
        },
        { $unwind: '$panjabi' },
        {
          $addFields: {
            name: '$panjabi.name',
            image: '$panjabi.image'
          }
        },
        {
          $project: {
            panjabi: 0,
          }
        }

      ]).toArray()

      res.send(result)
    })

    // get all   purchase  for a specific seller
    app.get('/seller-purchase/:email', verifyToken, verifySeller, async (req, res) => {
      const email = req.params.email
      const query = { seller: email }
      const result = await purchasesCollection.aggregate([
        {
          $match: query
        },
        {
          $addFields: {

            panjabiId: { $toObjectId: '$panjabiId' }
          }
        },
        {
          $lookup: {
            from: 'panjabi',
            localField: 'panjabiId',
            foreignField: '_id',
            as: 'panjabi'
          }
        },
        { $unwind: '$panjabi' },
        {
          $addFields: {
            name: '$panjabi.name',
            // image:'$panjabi.image'
          }
        },
        {
          $project: {
            panjabi: 0,
          }
        }

      ]).toArray()

      res.send(result)
    })

    // update a order status
    app.patch('/update-order-status/:id', verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const result = await purchasesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
      res.send(result);
    });
    // cancel order
    app.delete('/purchases/:id', verifyToken, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const purchase = await purchasesCollection.findOne(query)
      if (purchase.status === 'Delivered') {
        res.status(409).send('Cannot cancel once the product is delivered')
      }
      const result = await purchasesCollection.deleteOne(query)
      res.send(result)
    })








    // MongoDB Connection Check
    await client.db('admin').command({ ping: 1 });
    console.log('✅ Successfully connected to MongoDB!');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
  }
}
run().catch(console.dir);

// Root Route
app.get('/', (req, res) => {
  res.send('🔥 My Panjabi Server is Running!');
});

// Start Express Server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
