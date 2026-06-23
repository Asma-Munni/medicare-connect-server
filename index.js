require("dotenv").config();

const express = require("express");
const cors = require("cors");


const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

console.log("Stripe key loaded:", !!stripeSecretKey);

const stripe = stripeSecretKey ? require("stripe")(stripeSecretKey) : null;

const app = express();
const port = process.env.PORT || 5000;

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
    const sessionCollection = db.collection("session");


// Verification Related

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers?.authorization;
    console.log(authHeader);

    if (!authHeader) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    const session = await sessionCollection.findOne({ token });

    if (!session) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    let user = await usersCollection.findOne({ id: session.userId });

    if (!user && ObjectId.isValid(session.userId)) {
      user = await usersCollection.findOne({
        _id: new ObjectId(session.userId),
      });
    }

    if (!user) {
      return res.status(401).send({ message: "unauthorized access" });
    }

    req.user = user;

    next();
  } catch (error) {
    res.status(500).send({
      message: "failed to verify token",
      error: error.message,
    });
  }
};


//must be used after verifyToken middleware
const verifyDoctor = async(req, res, next) =>{
  if(req.user?.role !== 'doctor'){
    return res.status(403).send({message: 'forbidden access'}) 
  }
  next();
}

//must be used after verifyToken middleware
const verifyPatient = async(req, res, next) =>{
  console.log(req.user?.role);
  if(req.user?.role !== 'patient'){
    return res.status(403).send({message: 'forbidden access'}) 
  }
  next();
}



//must be used after verifyToken middleware
const verifyAdmin = async(req, res, next) =>{
  if(req.user?.role !== 'admin'){
    return res.status(403).send({message: 'forbidden access'}) 
  }
  next();
}


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


// Update doctor schedule
app.patch("/doctors/:id/schedule", async (req, res) => {
  try {
    const id = req.params.id;
    const { availableDays, availableSlots } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid doctor ID.",
      });
    }

    if (!Array.isArray(availableDays) || !Array.isArray(availableSlots)) {
      return res.status(400).send({
        success: false,
        message: "Available days and available slots must be arrays.",
      });
    }

    if (availableDays.length === 0 || availableSlots.length === 0) {
      return res.status(400).send({
        success: false,
        message: "Please select at least one day and one slot.",
      });
    }

    const result = await doctorsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          availableDays,
          availableSlots,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Doctor not found.",
      });
    }

    res.send({
      success: true,
      message: "Doctor schedule updated successfully.",
      data: {
        _id: id,
        availableDays,
        availableSlots,
      },
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to update doctor schedule.",
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
app.get("/appointments/doctor/:doctorId",verifyToken, verifyDoctor, async (req, res) => {
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


// Update doctor verification status by admin
app.patch("/doctors/:id/verification",verifyToken, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { verificationStatus } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid doctor ID",
      });
    }

    const allowedStatus = ["pending", "verified", "rejected"];

    if (!allowedStatus.includes(verificationStatus)) {
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
      message: "Doctor verification status updated successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to update doctor verification status",
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



// Get all appointments by admin
app.get("/appointments",verifyToken, verifyAdmin, async (req, res) => {
  try {
    const appointments = await appointmentsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: appointments,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get appointments",
      error: error.message,
    });
  }
});


// Get patient appointments by patientId
app.get("/appointments/patient/:patientId",verifyToken, verifyPatient, async (req, res) => {
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
app.patch("/appointments/:id/status",verifyToken,  async (req, res) => {
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

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!appointment) {
      return res.status(404).send({
        success: false,
        message: "Appointment not found",
      });
    }

    const role = req.user?.role;
    const userEmail = req.user?.email;

    const isAdmin = role === "admin";

    const isDoctorOwner =
      role === "doctor" && appointment.doctorEmail === userEmail;

    const isPatientOwner =
      role === "patient" && appointment.patientEmail === userEmail;

    if (isAdmin) {
      // Admin can update any appointment status
    } else if (isDoctorOwner) {
      const doctorAllowedStatus = ["accepted", "rejected", "completed"];

      if (!doctorAllowedStatus.includes(appointmentStatus)) {
        return res.status(403).send({
          success: false,
          message: "Doctor can only accept, reject, or complete appointments",
        });
      }
    } else if (isPatientOwner) {
      if (appointmentStatus !== "cancelled") {
        return res.status(403).send({
          success: false,
          message: "Patient can only cancel own appointment",
        });
      }
    } else {
      return res.status(403).send({
        success: false,
        message: "forbidden access",
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


// Create review
app.post("/reviews", async (req, res) => {
  try {
    const { appointmentId, patientId, rating, comment } = req.body;

    if (!appointmentId || !patientId || !rating || !comment) {
      return res.status(400).send({
        success: false,
        message: "Appointment ID, patient ID, rating, and comment are required.",
      });
    }

    const numericRating = Number(rating);

    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).send({
        success: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(appointmentId),
    });

    if (!appointment) {
      return res.status(404).send({
        success: false,
        message: "Appointment not found.",
      });
    }

    if (appointment.patientId !== patientId) {
      return res.status(403).send({
        success: false,
        message: "You can only review your own appointment.",
      });
    }

    if (appointment.appointmentStatus !== "completed") {
      return res.status(400).send({
        success: false,
        message: "You can review only after the appointment is completed.",
      });
    }

    const existingReview = await reviewsCollection.findOne({
      appointmentId,
      patientId,
    });

    if (existingReview) {
      return res.status(409).send({
        success: false,
        message: "You have already reviewed this appointment.",
      });
    }

    const review = {
      appointmentId,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctorName,
      doctorEmail: appointment.doctorEmail,
      patientId,
      patientName: appointment.patientName,
      patientEmail: appointment.patientEmail,
      rating: numericRating,
      comment,
      createdAt: new Date(),
    };

    const result = await reviewsCollection.insertOne(review);

    const doctorReviews = await reviewsCollection
      .find({ doctorId: appointment.doctorId })
      .toArray();

    const totalReviews = doctorReviews.length;

    const averageRating =
      doctorReviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
      totalReviews;

    await doctorsCollection.updateOne(
      { _id: new ObjectId(appointment.doctorId) },
      {
        $set: {
          rating: Number(averageRating.toFixed(1)),
          averageRating: Number(averageRating.toFixed(1)),
          totalReviews,
        },
      }
    );

    res.send({
      success: true,
      message: "Review submitted successfully.",
      data: {
        _id: result.insertedId,
        ...review,
      },
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to submit review.",
      error: error.message,
    });
  }
});


// Get latest reviews
app.get("/reviews", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    const reviews = await reviewsCollection
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.send({
      success: true,
      data: reviews,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get latest reviews.",
      error: error.message,
    });
  }
});

// Get reviews by doctor ID
app.get("/reviews/doctor/:doctorId", async (req, res) => {
  try {
    const doctorId = req.params.doctorId;

    const reviews = await reviewsCollection
      .find({ doctorId })
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: reviews,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get doctor reviews.",
      error: error.message,
    });
  }
});

// Get reviews by patient ID
app.get("/reviews/patient/:patientId",verifyToken,verifyPatient, async (req, res) => {
  try {
    const patientId = req.params.patientId;

    const reviews = await reviewsCollection
      .find({ patientId })
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: reviews,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get patient reviews.",
      error: error.message,
    });
  }
});


// Create Stripe checkout session
app.post("/create-payment-session", async (req, res) => {
  try {
    const { appointmentId, patientId } = req.body;

    if (!appointmentId || !patientId) {
      return res.status(400).send({
        success: false,
        message: "Appointment ID and patient ID are required.",
      });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(appointmentId),
    });

    if (!appointment) {
      return res.status(404).send({
        success: false,
        message: "Appointment not found.",
      });
    }

    if (appointment.patientId !== patientId) {
      return res.status(403).send({
        success: false,
        message: "You can only pay for your own appointment.",
      });
    }

    if (appointment.paymentStatus === "paid") {
      return res.status(409).send({
        success: false,
        message: "This appointment is already paid.",
      });
    }

    const amount = Number(appointment.consultationFee || 0);

    if (amount <= 0) {
      return res.status(400).send({
        success: false,
        message: "Invalid consultation fee.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: appointment.patientEmail,
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: {
              name: `Appointment with ${appointment.doctorName}`,
              description: `Appointment date: ${appointment.appointmentDate}, time: ${appointment.appointmentTime}`,
            },
            unit_amount: amount * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        appointmentId: appointment._id.toString(),
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
      },
      success_url: `${process.env.CLIENT_URL}/dashboard/patient/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard/patient/appointments`,
    });

    res.send({
      success: true,
      message: "Stripe checkout session created successfully.",
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to create Stripe checkout session.",
      error: error.message,
    });
  }
});


// Verify Stripe payment and save payment record
app.get("/confirm-payment", async (req, res) => {
  try {
    const sessionId = req.query.session_id;

    if (!sessionId) {
      return res.status(400).send({
        success: false,
        message: "Stripe session ID is required.",
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).send({
        success: false,
        message: "Stripe session not found.",
      });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).send({
        success: false,
        message: "Payment is not completed yet.",
        paymentStatus: session.payment_status,
      });
    }

    const appointmentId = session.metadata?.appointmentId;
    const patientId = session.metadata?.patientId;

    if (!appointmentId || !patientId) {
      return res.status(400).send({
        success: false,
        message: "Payment metadata is missing.",
      });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(appointmentId),
    });

    if (!appointment) {
      return res.status(404).send({
        success: false,
        message: "Appointment not found.",
      });
    }

    if (appointment.paymentStatus === "paid") {
      const existingPayment = await paymentsCollection.findOne({
        appointmentId,
        patientId,
      });

      return res.send({
        success: true,
        message: "Payment already confirmed.",
        data: existingPayment,
      });
    }

    const existingPayment = await paymentsCollection.findOne({
      stripeSessionId: session.id,
    });

    if (existingPayment) {
      return res.send({
        success: true,
        message: "Payment already saved.",
        data: existingPayment,
      });
    }

    const payment = {
      appointmentId,
      patientId,
      patientName: appointment.patientName,
      patientEmail: appointment.patientEmail,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctorName,
      doctorEmail: appointment.doctorEmail,
      amount: Number(session.amount_total || 0) / 100,
      currency: session.currency,
      paymentMethod: "Stripe",
      paymentStatus: "paid",
      stripeSessionId: session.id,
      transactionId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.id,
      paidAt: new Date(),
      createdAt: new Date(),
    };

    const result = await paymentsCollection.insertOne(payment);

    await appointmentsCollection.updateOne(
      { _id: new ObjectId(appointmentId) },
      {
        $set: {
          paymentStatus: "paid",
          paymentId: result.insertedId.toString(),
          paidAt: new Date(),
        },
      }
    );

    res.send({
      success: true,
      message: "Payment confirmed successfully.",
      data: {
        _id: result.insertedId,
        ...payment,
      },
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to confirm payment.",
      error: error.message,
    });
  }
});


// Get all payments for admin
app.get("/payments",verifyToken, verifyAdmin, async (req, res) => {
  try {
    const payments = await paymentsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: payments,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get payments.",
      error: error.message,
    });
  }
});

// Get payments by patient ID
app.get("/payments/patient/:patientId",verifyToken, verifyPatient, async (req, res) => {
  try {
    const patientId = req.params.patientId;

    const payments = await paymentsCollection
      .find({ patientId })
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: payments,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get patient payments.",
      error: error.message,
    });
  }
});



// Create prescription
app.post("/prescriptions", async (req, res) => {
  try {
    const {
      appointmentId,
      doctorId,
      diagnosis,
      medicines,
      advice,
      followUpDate,
    } = req.body;

    if (!appointmentId || !doctorId || !diagnosis || !medicines?.length) {
      return res.status(400).send({
        success: false,
        message:
          "Appointment ID, doctor ID, diagnosis, and medicines are required.",
      });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(appointmentId),
    });

    if (!appointment) {
      return res.status(404).send({
        success: false,
        message: "Appointment not found.",
      });
    }

    if (appointment.doctorId !== doctorId) {
      return res.status(403).send({
        success: false,
        message: "You can only create prescription for your own appointment.",
      });
    }

    if (appointment.appointmentStatus !== "completed") {
      return res.status(400).send({
        success: false,
        message: "Prescription can be created only after appointment is completed.",
      });
    }

    const existingPrescription = await prescriptionsCollection.findOne({
      appointmentId,
    });

    if (existingPrescription) {
      return res.status(409).send({
        success: false,
        message: "Prescription already exists for this appointment.",
      });
    }

    const prescription = {
      appointmentId,
      doctorId,
      doctorName: appointment.doctorName,
      doctorEmail: appointment.doctorEmail,
      patientId: appointment.patientId,
      patientName: appointment.patientName,
      patientEmail: appointment.patientEmail,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      symptoms: appointment.symptoms || "",
      diagnosis,
      medicines,
      advice: advice || "",
      followUpDate: followUpDate || "",
      createdAt: new Date(),
    };

    const result = await prescriptionsCollection.insertOne(prescription);

    await appointmentsCollection.updateOne(
      { _id: new ObjectId(appointmentId) },
      {
        $set: {
          prescriptionStatus: "created",
          prescriptionId: result.insertedId.toString(),
        },
      }
    );

    res.send({
      success: true,
      message: "Prescription created successfully.",
      data: {
        _id: result.insertedId,
        ...prescription,
      },
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to create prescription.",
      error: error.message,
    });
  }
});

// Get prescriptions by patient ID
app.get("/prescriptions/patient/:patientId",verifyToken,verifyPatient, async (req, res) => {
  try {
    const patientId = req.params.patientId;

    const prescriptions = await prescriptionsCollection
      .find({ patientId })
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: prescriptions,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get patient prescriptions.",
      error: error.message,
    });
  }
});

// Get prescriptions by doctor ID
app.get("/prescriptions/doctor/:doctorId", async (req, res) => {
  try {
    const doctorId = req.params.doctorId;

    const prescriptions = await prescriptionsCollection
      .find({ doctorId })
      .sort({ createdAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: prescriptions,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get doctor prescriptions.",
      error: error.message,
    });
  }
});




// Get prescription by appointment ID
app.get("/prescriptions/appointment/:appointmentId", async (req, res) => {
  try {
    const appointmentId = req.params.appointmentId;

    const prescription = await prescriptionsCollection.findOne({
      appointmentId,
    });

    res.send({
      success: true,
      data: prescription,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get appointment prescription.",
      error: error.message,
    });
  }
});


// Get single prescription by ID
app.get("/prescriptions/:id",verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid prescription ID.",
      });
    }

    const prescription = await prescriptionsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!prescription) {
      return res.status(404).send({
        success: false,
        message: "Prescription not found.",
      });
    }

    res.send({
      success: true,
      data: prescription,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get prescription.",
      error: error.message,
    });
  }
});









    
    // Get all users
    app.get("/users",verifyToken, verifyAdmin, async (req, res) => {
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


  // Update user role/status by admin
app.patch("/users/:id",verifyToken, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { role, status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid user ID",
      });
    }

    const updateData = {
      updatedAt: new Date(),
    };

    if (role) {
      const allowedRoles = ["patient", "doctor"];

      if (!allowedRoles.includes(role)) {
        return res.status(400).send({
          success: false,
          message: "Invalid user role",
        });
      }

      updateData.role = role;
    }

    if (status) {
      const allowedStatus = ["active", "blocked"];

      if (!allowedStatus.includes(status)) {
        return res.status(400).send({
          success: false,
          message: "Invalid user status",
        });
      }

      updateData.status = status;
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: updateData,
      }
    );

    res.send({
      success: true,
      message: "User updated successfully",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
});  

// Update user profile
app.patch("/users/:id/profile", async (req, res) => {
  try {
    const id = req.params.id;
    const { name, image, phone, address } = req.body;

    if (!id) {
      return res.status(400).send({
        success: false,
        message: "User ID is required.",
      });
    }

    const updateData = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (image !== undefined) updateData.image = image;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;

    const result = await usersCollection.updateOne(
      { id },
      {
        $set: updateData,
      }
    );

    if (result.matchedCount === 0) {
      const objectIdResult = ObjectId.isValid(id)
        ? await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: updateData,
            }
          )
        : null;

      if (!objectIdResult || objectIdResult.matchedCount === 0) {
        return res.status(404).send({
          success: false,
          message: "User not found.",
        });
      }
    }

    res.send({
      success: true,
      message: "Profile updated successfully.",
      data: updateData,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to update profile.",
      error: error.message,
    });
  }
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

    

   // Dashboard statistics
app.get("/stats",verifyToken, verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();
    const totalPatients = await usersCollection.countDocuments({
      role: "patient",
    });
    const totalUserDoctors = await usersCollection.countDocuments({
      role: "doctor",
    });
    const totalAdmins = await usersCollection.countDocuments({
      role: "admin",
    });

    const totalDoctors = await doctorsCollection.countDocuments();
    const verifiedDoctors = await doctorsCollection.countDocuments({
      verificationStatus: "verified",
    });
    const pendingDoctors = await doctorsCollection.countDocuments({
      verificationStatus: "pending",
    });
    const rejectedDoctors = await doctorsCollection.countDocuments({
      verificationStatus: "rejected",
    });

    const totalAppointments = await appointmentsCollection.countDocuments();
    const pendingAppointments = await appointmentsCollection.countDocuments({
      appointmentStatus: "pending",
    });
    const acceptedAppointments = await appointmentsCollection.countDocuments({
      appointmentStatus: "accepted",
    });
    const rejectedAppointments = await appointmentsCollection.countDocuments({
      appointmentStatus: "rejected",
    });
    const completedAppointments = await appointmentsCollection.countDocuments({
      appointmentStatus: "completed",
    });
    const cancelledAppointments = await appointmentsCollection.countDocuments({
      appointmentStatus: "cancelled",
    });

    const paidAppointments = await appointmentsCollection.countDocuments({
      paymentStatus: "paid",
    });
    const unpaidAppointments = await appointmentsCollection.countDocuments({
      paymentStatus: "unpaid",
    });

    const totalPayments = await paymentsCollection.countDocuments();

    res.send({
      success: true,
      data: {
        users: {
          totalUsers,
          totalPatients,
          totalUserDoctors,
          totalAdmins,
        },
        doctors: {
          totalDoctors,
          verifiedDoctors,
          pendingDoctors,
          rejectedDoctors,
        },
        appointments: {
          totalAppointments,
          pendingAppointments,
          acceptedAppointments,
          rejectedAppointments,
          completedAppointments,
          cancelledAppointments,
        },
        payments: {
          totalPayments,
          paidAppointments,
          unpaidAppointments,
        },
      },
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get dashboard statistics",
      error: error.message,
    });
  }
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