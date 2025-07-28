const express = require("express");
const app = express();
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const connectDatabase = require("./config/database");
const errorMiddleware = require("./middlewares/error");
const ErrorHandler = require("./utils/errorHandler");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xssClean = require("xss-clean");
const hpp = require("hpp");
const cors = require("cors");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");
//Setting up config.env variables
dotenv.config({ path: "./config/config.env" });

// Handling uncaught exception (Ex: console.log(dbsdbs) where dbsdbs is not defined)
process.on("uncaughtException", (err) => {
	console.log(err);
	console.log(`Error:${err.message}`);
	console.log("Shutting down due to uncaught exception");
	process.exit(1);
});

// Connecting database
connectDatabase();
// Setup security headers
app.use(helmet());
// Setup body parser
app.use(express.json());
//Set cookie parser
app.use(cookieParser());
//Handle file uploads
app.use(fileUpload());
// Sanitize data
app.use(mongoSanitize());
// Prevent XSS attacks
app.use(xssClean());
// Prevent parameter pollution
app.use(
	hpp({
		whitelist: ["position"],
	})
);
// Rate limiting
const limiter = rateLimit({
	windowMs: 10 * 60 * 1000, //10 Min
	max: 100,
});

// Setup CORS - Accessible by other domains
app.use(cors());

app.use(limiter);
//Importing routes
const jobs = require("./routes/jobs");
const auth = require("./routes/auth");
const user = require("./routes/user");
// /api/v1 is added using this middleware method

app.use("/api/v1", jobs);
app.use("/api/v1", auth);
app.use("/api/v1", user);

// app.all("*", (req, res, next) => {
// 	next(new ErrorHandler(`${req.originalUrl} route not found`, 404));
// });

//Middleware to handle error
app.use(errorMiddleware);

const PORT = process.env.PORT;
const server = app.listen(PORT, () => {
	console.log(
		`Server is running on port ${PORT} in ${process.env.NODE_ENV} mode`
	);
});

// Handling Unhandled Promise Rejection (Ex: error in config.env)
process.on("unhandledRejection", (err) => {
	console.log(`Error:${err.message}`);
	console.log("Shutting down the server due to Unhandled promise rejection.");
	server.close(() => {
		process.exit(1);
	});
});
