const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000;
require('dotenv').config();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('MediCare Connect Server is Running')
})




const uri = process.env.MONGO_DB_URI;

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();



    const db = client.db(process.env.DB_NAME);

    const usersCollection = db.collection("user");
    const doctorsCollection = db.collection("doctors");
    const appointmentsCollection = db.collection("appointments");
    const reviewsCollection = db.collection("reviews");
    const paymentsCollection = db.collection("payments");
    const prescriptionsCollection = db.collection("prescriptions");


    // Create doctor profile
app.post("/doctors", async (req, res) => {
  try {
    const doctorData = req.body;

    const existingDoctor = await doctorsCollection.findOne({
      email: doctorData.email,
    });

    if (existingDoctor) {
      return res.status(409).send({
        success: false,
        message: "Doctor profile already exists",
      });
    }

    const newDoctor = {
      doctorName: doctorData.doctorName,
      email: doctorData.email,
      specialization: doctorData.specialization,
      qualifications: doctorData.qualifications,
      experience: Number(doctorData.experience) || 0,
      consultationFee: Number(doctorData.consultationFee) || 0,
      hospitalName: doctorData.hospitalName,
      profileImage: doctorData.profileImage,
      availableDays: doctorData.availableDays || [],
      availableSlots: doctorData.availableSlots || [],
      verificationStatus: "pending",
      averageRating: 0,
      totalReviews: 0,
      createdAt: new Date(),
    };

    const result = await doctorsCollection.insertOne(newDoctor);

    res.send({
      success: true,
      message: "Doctor profile created successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to create doctor profile",
      error: error.message,
    });
  }
});


// Get doctors with search, sort, filter and pagination
app.get("/doctors", async (req, res) => {
  try {
    const {
      search = "",
      specialization = "",
      verificationStatus = "",
      sortBy = "createdAt",
      order = "desc",
      page = 1,
      limit = 6,
    } = req.query;

    const query = {};

    // Search by doctor name, specialization, hospital
    if (search) {
      query.$or = [
        { doctorName: { $regex: search, $options: "i" } },
        { specialization: { $regex: search, $options: "i" } },
        { hospitalName: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by specialization
    if (specialization) {
      query.specialization = { $regex: specialization, $options: "i" };
    }

    // Filter by verification status
    if (verificationStatus) {
      query.verificationStatus = verificationStatus;
    }

    const sortOrder = order === "asc" ? 1 : -1;

    let sortOption = {};

    if (sortBy === "fee") {
      sortOption = { consultationFee: sortOrder };
    } else if (sortBy === "experience") {
      sortOption = { experience: sortOrder };
    } else if (sortBy === "rating") {
      sortOption = { averageRating: sortOrder };
    } else {
      sortOption = { createdAt: -1 };
    }

    const currentPage = Number(page);
    const perPage = Number(limit);
    const skip = (currentPage - 1) * perPage;

    const totalDoctors = await doctorsCollection.countDocuments(query);

    const doctors = await doctorsCollection
      .find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(perPage)
      .toArray();

    res.send({
      success: true,
      data: doctors,
      meta: {
        totalDoctors,
        currentPage,
        perPage,
        totalPages: Math.ceil(totalDoctors / perPage),
        hasNextPage: currentPage < Math.ceil(totalDoctors / perPage),
        hasPrevPage: currentPage > 1,
      },
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get doctors",
      error: error.message,
    });
  }
});

app.get("/doctors/email/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const doctor = await doctorsCollection.findOne({ email });

    if (!doctor) {
      return res.status(404).send({
        success: false,
        message: "Doctor profile not found",
      });
    }

    res.send({
      success: true,
      data: doctor,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get doctor profile",
      error: error.message,
    });
  }
});



// Get single doctor by ID
app.get("/doctors/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid doctor ID",
      });
    }

    const doctor = await doctorsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!doctor) {
      return res.status(404).send({
        success: false,
        message: "Doctor not found",
      });
    }

    res.send({
      success: true,
      data: doctor,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get doctor",
      error: error.message,
    });
  }
});



// Get doctor appointments by doctorId
app.get("/appointments/doctor/:doctorId", async (req, res) => {
  try {
    const doctorId = req.params.doctorId;

    const appointments = await appointmentsCollection
      .find({ doctorId: doctorId })
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: appointments,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get doctor appointments",
      error: error.message,
    });
  }
});




// Update doctor profile
app.patch("/doctors/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid doctor ID",
      });
    }

    const updatedDoctor = {
      ...updateData,
      experience: updateData.experience
        ? Number(updateData.experience)
        : undefined,
      consultationFee: updateData.consultationFee
        ? Number(updateData.consultationFee)
        : undefined,
      updatedAt: new Date(),
    };

    Object.keys(updatedDoctor).forEach(
      (key) => updatedDoctor[key] === undefined && delete updatedDoctor[key]
    );

    const result = await doctorsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: updatedDoctor,
      }
    );

    res.send({
      success: true,
      message: "Doctor profile updated successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to update doctor profile",
      error: error.message,
    });
  }
});


// Admin: update doctor verification status
app.patch("/doctors/:id/verification", async (req, res) => {
  try {
    const id = req.params.id;
    const { verificationStatus } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid doctor ID",
      });
    }

    if (!["pending", "verified", "rejected"].includes(verificationStatus)) {
      return res.status(400).send({
        success: false,
        message: "Invalid verification status",
      });
    }

    const result = await doctorsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          verificationStatus,
          updatedAt: new Date(),
        },
      }
    );

    res.send({
      success: true,
      message: "Doctor verification status updated",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to update verification status",
      error: error.message,
    });
  }
});


// Create appointment
app.post("/appointments", async (req, res) => {
  try {
    const appointmentData = req.body;
    console.log("Appointment body:", appointmentData);

    if (
      !appointmentData.doctorId ||
      !appointmentData.patientId ||
      !appointmentData.patientEmail ||
      !appointmentData.appointmentDate ||
      !appointmentData.appointmentTime
    ) {
      return res.status(400).send({
        success: false,
        message: "Required appointment information is missing",
      });
    }

    const alreadyBooked = await appointmentsCollection.findOne({
      doctorId: appointmentData.doctorId,
      appointmentDate: appointmentData.appointmentDate,
      appointmentTime: appointmentData.appointmentTime,
      appointmentStatus: { $in: ["pending", "accepted"] },
    });

    if (alreadyBooked) {
      return res.status(409).send({
        success: false,
        message: "This slot is already booked. Please select another slot.",
      });
    }

    const newAppointment = {
        patientId: appointmentData.patientId,
      doctorId: appointmentData.doctorId,
      doctorName: appointmentData.doctorName,
      doctorEmail: appointmentData.doctorEmail,

      patientName: appointmentData.patientName,
      patientId: appointmentData.patientId,
      patientEmail: appointmentData.patientEmail,

      appointmentDate: appointmentData.appointmentDate,
      appointmentTime: appointmentData.appointmentTime,
      symptoms: appointmentData.symptoms || "",

      consultationFee: Number(appointmentData.consultationFee) || 0,

      appointmentStatus: "pending",
      paymentStatus: "unpaid",

      createdAt: new Date(),
    };

    const result = await appointmentsCollection.insertOne(newAppointment);

    res.send({
      success: true,
      message: "Appointment booked successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to book appointment",
      error: error.message,
    });
  }
});

// Get patient appointments by patientId
app.get("/appointments/patient/:patientId", async (req, res) => {
  try {
    const patientId = req.params.patientId;

    const appointments = await appointmentsCollection
      .find({ patientId: patientId })
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: appointments,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get patient appointments",
      error: error.message,
    });
  }
});

// Update appointment status
app.patch("/appointments/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { appointmentStatus } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const allowedStatus = [
      "pending",
      "accepted",
      "rejected",
      "completed",
      "cancelled",
    ];

    if (!allowedStatus.includes(appointmentStatus)) {
      return res.status(400).send({
        success: false,
        message: "Invalid appointment status",
      });
    }

    const result = await appointmentsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          appointmentStatus,
          updatedAt: new Date(),
        },
      }
    );

    res.send({
      success: true,
      message: "Appointment status updated successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to update appointment status",
      error: error.message,
    });
  }
});



    // Health check
    app.get("/health", (req, res) => {
      res.send({
        success: true,
        message: "Server health is good",
      });
    });

    // Get all users
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();

      res.send({
        success: true,
        data: users,
      });
    });

    // Get single user by email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;

      const user = await usersCollection.findOne({ email });

      res.send({
        success: true,
        data: user,
      });
    });

   

    // Get verified doctors only
    app.get("/doctors/verified", async (req, res) => {
      const doctors = await doctorsCollection
        .find({ verificationStatus: "verified" })
        .toArray();

      res.send({
        success: true,
        data: doctors,
      });
    });

    

    

    // Platform statistics
    app.get("/stats", async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalDoctors = await doctorsCollection.countDocuments();
      const totalPatients = await usersCollection.countDocuments({
        role: "patient",
      });
      const totalAppointments = await appointmentsCollection.countDocuments();
      const totalReviews = await reviewsCollection.countDocuments();

      res.send({
        success: true,
        data: {
          totalUsers,
          totalDoctors,
          totalPatients,
          totalAppointments,
          totalReviews,
        },
      });
    });
  



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
  //  await client.close();
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})