const User = require("../models/users");
const catchAsyncErrors = require("../middlewares/catchAsyncError");
const ErrorHandler = require("../utils/errorHandler");
const sendToken = require("../utils/jwtToken");
const sendEmail = require("../utils/sendEmail");
const crypto = require("crypto");
//Register a new user => /api/v1/register
exports.registerUser = catchAsyncErrors(async (req, res, next) => {
	const { name, email, password, role } = req.body;

	const user = await User.create({
		name,
		email,
		password,
		role,
	});

	sendToken(user, 200, res);
});

// Login user => /api/v1/login
exports.loginUser = catchAsyncErrors(async (req, res, next) => {
	const { email, password } = req.body;

	// Checks if email or password is entered by the user
	if (!email || !password) {
		return next(new ErrorHandler("Please enter email and password", 400));
	}
	// Finds user in database
	const user = await User.findOne({ email }).select("+password"); // select here helps user to contain the password field as it was declared as select: false

	if (!user) {
		return next(new ErrorHandler("Invalid email or password", 401));
	}

	// Check if password is correct
	const isPasswordCorrect = await user.comparePassword(password);

	if (!isPasswordCorrect) {
		return next(new ErrorHandler("Invalid email or password", 401));
	}
	sendToken(user, 200, res);
});

// Forgot password => /api/v1/password/forgot
exports.forgotPassword = catchAsyncErrors(async (req, res, next) => {
	const user = await User.findOne({ email: req.body.email });
	// Check user email is in database
	if (!user) {
		return next(new ErrorHandler("No user found with this email", 404));
	}

	// Get reset token
	const resetToken = user.getResetPasswordToken();

	await user.save({ validateBeforeSave: false });

	// Create reset password url
	const resetUrl = `${req.protocol}://${req.get(
		"host"
	)}/api/v1/password/reset/${resetToken}`;

	const message = `Your password reset link is as follows:\n\n${resetUrl}\n\nIf you have not requested this, then please ignore that`;
	try {
		await sendEmail({
			email: user.email,
			subject: "Password Reset Instruction",
			message,
		});

		res.status(200).json({
			success: true,
			message: `Email sent successfully to: ${user.email}`,
		});
	} catch (error) {
		user.resetPasswordToken = undefined;
		user.resetPasswordExpire = undefined;
		await user.save({ validateBeforeSave: false });
		return next(new ErrorHandler("Email is not sent", 500));
	}
});

// Reset password => /api/v1/password/reset/:token
exports.resetPassword = catchAsyncErrors(async (req, res, next) => {
	const hashedToken = crypto
		.createHash("sha256")
		.update(req.params.token)
		.digest("hex");
	const user = await User.findOne({
		resetPasswordToken: hashedToken,
		resetPasswordExpire: { $gt: Date.now() },
	});

	if (!user) {
		return next(
			new ErrorHandler("Invalid reset password token or has been expired", 400)
		);
	}

	// Setup new password

	user.password = req.body.password;
	user.resetPasswordToken = undefined;
	user.resetPasswordExpire = undefined;
	await user.save();

	sendToken(user, 200, res);
});

// Logout user => /api/v1/logout
exports.logout = catchAsyncErrors(async (req, res, next) => {
	res.cookie("token", "none", {
		expires: new Date(Date.now()),
		httpOnly: true,
	});

	res.status(200).json({
		success: true,
		message: "Logged out successfully",
	});
});
