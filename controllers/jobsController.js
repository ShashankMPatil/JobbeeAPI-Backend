const Job = require("../models/jobs");
const geoCoder = require("../utils/geocoder");
const ErrorHandler = require("../utils/errorHandler");
const catchAsyncErrors = require("../middlewares/catchAsyncError");
const APIFilters = require("../utils/apiFilters");
const qs = require("qs");
const path = require("path");
const fs = require("fs");

// Get all jobs => /api/v1/jobs , /api/v1/jobs?salary[lt]=80000&sort=salary&fields=title and limit=2&page=2
exports.getJobs = catchAsyncErrors(async (req, res, next) => {
	const parsedQuery = qs.parse(req.query);
	// Create an instance of APIFilters with Job.find() and request query params
	// Then apply the filter method to it
	const apiFilters = new APIFilters(Job.find(), parsedQuery)
		.filter()
		.sort()
		.limitFields()
		.searchByQuery()
		.pagination();

	// Execute the final filtered Mongoose query to get the list of jobs
	const jobs = await apiFilters.query;

	res.status(200).json({
		success: true,
		result: jobs.length,
		data: jobs,
	});
});

//Create a new Job => /api/v1/job/new
exports.newJob = catchAsyncErrors(async (req, res, next) => {
	// Adding user to body
	req.body.user = req.user.id;
	const job = await Job.create(req.body);
	res.status(200).json({
		success: true,
		message: "Job Created.",
		data: job,
	});
});

// Search jobs within radius => /api/v1/jobs/:zipcode/:distance
exports.getJobsInRadius = catchAsyncErrors(async (req, res, next) => {
	const { zipcode, distance } = req.params;
	// Getting latitude & longitude from geocoder with zipcode
	const loc = await geoCoder.geocode(zipcode);
	const lat = loc[0].latitude;
	const lon = loc[0].longitude;

	// 3963 is radius of earth in miles
	const radius = distance / 3963;
	const jobs = await Job.find({
		location: {
			$geoWithin: { $centerSphere: [[lon, lat], radius] },
		},
	});

	res.status(200).json({
		success: true,
		result: jobs.length,
		data: jobs,
	});
});

// Updating a Job => /api/v1/job/:id
exports.updateJob = catchAsyncErrors(async (req, res, next) => {
	let job = await Job.findById(req.params.id);
	if (!job) {
		return next(new ErrorHandler("Job not found", 404));
		// return res.status(404).json({
		// 	success: false,
		// 	message: "Job not found.",
		// });
	}

	// Check if the user is the owner
	if (job.user.toString() !== req.user.id && req.user.role !== "admin") {
		return next(
			new ErrorHandler(
				`User(${req.user.id}) is not allowed to update this job.`
			)
		);
	}
	// Update the job
	job = await Job.findByIdAndUpdate(req.params.id, req.body, {
		new: true,
		runValidators: true,
	});

	res.status(200).json({
		success: true,
		message: "Job Updated.",
		data: job,
	});
});

// Delete a Job => /api/v1/job/:id
exports.deleteJob = catchAsyncErrors(async (req, res, next) => {
	let job = await Job.findById(req.params.id).select("+applicantsApplied");

	if (!job) {
		return next(new ErrorHandler("Job not found", 404));
		// return res.status(404).json({
		// 	success: false,
		// 	message: "Job not found.",
		// });
	}
	// Check if the user is the owner
	if (job.user.toString() !== req.user.id && req.user.role !== "admin") {
		return next(
			new ErrorHandler(
				`User(${req.user.id}) is not allowed to update this job.`
			)
		);
	}

	for (let i = 0; i < job.applicantsApplied.length; i++) {
		let filePath =
			`${__dirname}/public/uploads/${job.applicantsApplied[i].resume}`.replace(
				"\\controllers",
				""
			);
		fs.unlink(filePath, (err) => {
			if (err) return console.log(err);
		});
	}

	job = await Job.findByIdAndDelete(req.params.id);

	res.status(200).json({
		success: true,
		message: "Job deleted.",
	});
});

// Get a single job with id and slug => api/v1/job/:id/:slug
exports.getJob = catchAsyncErrors(async (req, res, next) => {
	const job = await Job.find({
		$and: [{ _id: req.params.id }, { slug: req.params.slug }],
	}).populate({
		path: "user",
		select: "name",
	});

	if (!job || job.length === 0) {
		return next(new ErrorHandler("Job not found", 404));
		// return res.status(404).json({
		// 	success: false,
		// 	message: "Job not found.",
		// });
	}

	res.status(200).json({
		succcess: true,
		data: job,
	});
});

// Get statistics about a topic(job) => /api/v1/stats/:topic
exports.jobStats = catchAsyncErrors(async (req, res, next) => {
	const stats = await Job.aggregate([
		{
			$match: { $text: { $search: '"' + req.params.topic + '"' } }, // Matchs if the topic is present in the title or no
		},
		{
			$group: {
				_id: { $toUpper: "$experience" }, // It will be grouped by Experience
				totalJobs: { $sum: 1 },
				avgPosition: { $avg: "$positions" },
				avgSalary: { $avg: "$salary" },
				minSalary: { $min: "$salary" },
				maxSalary: { $max: "$salary" },
			},
		},
	]);

	if (stats.length === 0) {
		return next(
			new ErrorHandler(`No statistics available for ${req.params.topic}.`, 200)
		);
		// return res.status(200).json({
		// 	success: false,
		// 	message: "No statistics available for this topic.",
		// });
	}
	res.status(200).json({
		success: true,
		data: stats,
	});
});

// Apply to job using resume => /api/v1/job/:id/apply

exports.applyJob = catchAsyncErrors(async (req, res, next) => {
	let job = await Job.findById(req.params.id).select("+applicantsApplied");

	if (!job) {
		return next(new ErrorHandler("Job not Found", 404));
	}

	// Check that if job last date has been passed or not
	if (job.lastDate < new Date(Date.now())) {
		return next(
			new ErrorHandler("You cannot apply for this job. Date is over.", 400)
		);
	}
	// Check if user has applied before
	for (let i = 0; i < job.applicantsApplied.length; i++) {
		if (job.applicantsApplied[i].id === req.user.id) {
			return next(
				new ErrorHandler("You have already applied for this job.", 400)
			);
		}
	}
	// Check the files
	if (!req.files) {
		return next(new ErrorHandler("Please upload file", 400));
	}

	const file = req.files.file;
	// Check file type
	const supportedFiles = /\.(docx?|pdf)$/i;
	if (!supportedFiles.test(path.extname(file.name))) {
		return next(new ErrorHandler("Incorrect file type"));
	}

	// Check document size
	if (file.size > parseInt(process.env.MAX_FILE_SIZE)) {
		return next(
			new ErrorHandler(
				`Please upload file less than ${process.env.MAX_FILE_SIZE}.`,
				400
			)
		);
	}

	// Renaming document (resume), so that its unique
	file.name = `${req.user.name.replace(" ", "_")}_${job._id}${
		path.parse(file.name).ext
	}`;

	file.mv(`${process.env.UPLOAD_PATH}/${file.name}`, async (err) => {
		if (err) {
			console.log(err);
			return next(new ErrorHandler("Document upload failed", 500));
		}
		await Job.findByIdAndUpdate(
			req.params.id,
			{
				$push: {
					applicantsApplied: {
						id: req.user.id,
						resume: file.name,
					},
				},
			},
			{
				new: true,
				runValidators: true,
			}
		);

		res.status(200).json({
			success: true,
			message: "Applied to the Job Successfully",
			data: file.name,
		});
	});
});
