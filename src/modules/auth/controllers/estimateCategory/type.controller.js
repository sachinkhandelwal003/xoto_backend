// controllers/type.controller.js
const mongoose = require('mongoose');
const { Category } = require('../../models/estimateCategory/category.model');
const { Subcategory } = require('../../models/estimateCategory/category.model');
const { Type } = require('../../models/estimateCategory/category.model');
const { StatusCodes } = require('../../../../utils/constants/statusCodes');
const {APIError} = require('../../../../utils/errorHandler');
const asyncHandler = require('../../../../utils/asyncHandler');
const { TypeGallery } = require('../../models/estimateCategory/typeGallery.model')
const logActivity = require('../../../../utils/logActivity');
const { resolveModule } = require('../../../../utils/resolveModule');
const TypeQuestion = require('../../models/estimateCategory/typeQuestion.model');
const TypeQuestionOption = require('../../models/estimateCategory/typeQuestionOptions.model');


const shuffleArray = (array) => {
  const result = [...array]; // clone, DO NOT mutate DB data
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
exports.createType = asyncHandler(async (req, res) => {
  const { categoryId, subcategoryId } = req.params;
  let { label, description, order, baseRatePerSqFt } = req.body;
  let baseEstimationValueUnit = baseRatePerSqFt ? Number(baseRatePerSqFt) : 0;
  //baseEstimationValue this will be for most basic setup whethjer you create any design
  if (!label?.trim()) {
    throw new APIError('Type label is required', StatusCodes.BAD_REQUEST);
  }

  console.log("categoryId subcategoryIdsubcategoryIdsubcategoryId",subcategoryId,categoryId)
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new APIError('Category not found', StatusCodes.NOT_FOUND);
  }

  const subcategory = await Subcategory.findOne({
    _id: subcategoryId,
    category: categoryId
  });

  if (!subcategory) {
    throw new APIError('Subcategory not found', StatusCodes.NOT_FOUND);
  }

  if(!subcategory.isActive){
    throw new APIError('This subcategory is not active . We can only add types for active categories and subcategories', StatusCodes.NOT_FOUND);
  }

  const exists = await Type.findOne({
    label: { $regex: `^${label}$`, $options: 'i' },
    subcategory: subcategoryId,
    category: categoryId
  });

  if (exists) {
    throw new APIError('Type already exists in this subcategory', StatusCodes.CONFLICT);
  }

  const type = await Type.create({
    label: label.trim(),
    description: description?.trim() || '',
    subcategory: subcategoryId,
    category: categoryId,
    order: order || 0,
    baseEstimationValueUnit: baseEstimationValueUnit,
    isActive: true
  });
  // await Type.updateMany({}, {
  //   $set: { baseEstimationValueUnit: 0 }
  // })

  const module_id = await resolveModule('estimate-master');

  await logActivity({
    entity_type: 'Type',
    entity_id: type._id,
    module_id,
    action_type: 'created',
    description: `Type "${type.label}" created under "${subcategory.label}"`,
    new_value: type,
    req
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Type created successfully',
    data: type
  });
});


// GET Types with optional filters + pagination + params support
exports.getTypes = asyncHandler(async (req, res) => {
  const {
    label,
    active,
    populate = "false",
    page = 1,
    limit,  // optional for no pagination
  } = req.query;

  const { categoryId, subcategoryId } = req.params;

  let query = {};

  /* ------------------------------
      FILTERS FROM URL PARAMS
  ------------------------------ */
  if (categoryId) query.category = categoryId;
  if (subcategoryId) query.subcategory = subcategoryId;

  /* ------------------------------
      OPTIONAL QUERY FILTERS
  ------------------------------ */
  if (label) query.label = new RegExp(label, "i");
  if (active !== undefined) query.isActive = active === "true";

  /* ---------------------------------------------------------
      🟦 BASE QUERY
  --------------------------------------------------------- */
  let typeQuery = Type.find(query)
    .sort({ order: 1, createdAt: -1 });

  if (populate === "true") {
    typeQuery = typeQuery
      .populate({ path: "category", select: "name slug" })
      .populate({ path: "subcategory", select: "label description" });
  }

  /* ---------------------------------------------------------
      🟦 OPTIONAL PAGINATION
  --------------------------------------------------------- */
  let pagination = null;

  if (limit) {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    typeQuery = typeQuery
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Type.countDocuments(query);

    pagination = {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  const types = await typeQuery;

  /* ---------------------------------------------------------
      🟦 RESPONSE
  --------------------------------------------------------- */
  res.status(StatusCodes.OK).json({
    success: true,
    data: types,
    pagination,   // null when no limit is passed
  });
});

// GET Single Type
exports.getTypeById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { populate = 'true' } = req.query;

  let type;

  if (populate === 'true') {
    type = await Type.findById(id)
      .populate({
        path: 'category',
        select: 'name slug'
      })
      .populate({
        path: 'subcategory',
        select: 'label description'
      });
  } else {
    type = await Type.findById(id);
  }

  if (!type) throw new APIError('Type not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    type,
  });
});

// UPDATE Type
exports.updateType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let { label, description, isActive, order, baseEstimationValueUnit } = req.body;

  const type = await Type.findById(id);
  if (!type) throw new APIError('Type not found', StatusCodes.NOT_FOUND);

  // Check if new label already exists in same subcategory
  if (label && label !== type.label) {
    const exists = await Type.findOne({
      label,
      subcategory: type.subcategory,
      _id: { $ne: id }
    });
    if (exists) throw new APIError('Type label already exists in this subcategory', StatusCodes.CONFLICT);
    type.label = label;
  }

  if (description !== undefined) type.description = description;
  if (isActive !== undefined) type.isActive = isActive;
  if (order !== undefined) type.order = order;
  if (baseEstimationValueUnit !== undefined) type.baseEstimationValueUnit = Number(baseEstimationValueUnit);

  await type.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Type updated successfully',
    type,
  });
});

// DELETE Type
exports.deleteType = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // const type = await Type.findByIdAndUpdate(
  //   id,
  //   { isActive: false },
  //   { new: true }
  // );

  const type = await Type.findByIdAndDelete(id);

  if (!type) throw new APIError('Type not found', StatusCodes.NOT_FOUND);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Type deleted successfully',
    type,
  });
});




exports.uploadPreviewImage = asyncHandler(async (req, res) => {
  const { typeId } = req.params;

  if (!req.files?.previewImage?.length) {
    throw new APIError('Preview image is required', StatusCodes.BAD_REQUEST);
  }

  const previewFile = req.files.previewImage[0];

  const previewImage = {
    id: previewFile.filename,
    title: previewFile.originalname,
    url: `/uploads/${previewFile.filename}`,
  };

  const gallery = await TypeGallery.findOneAndUpdate(
    { type: typeId },
    { type: typeId, previewImage },
    { new: true, upsert: true }
  );

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Preview image uploaded',
    gallery,
  });
});

exports.addMoodboardImages = asyncHandler(async (req, res) => {
  const { typeId } = req.params;

  if (!req.files?.moodboardImages?.length) {
    throw new APIError('Moodboard images required', StatusCodes.BAD_REQUEST);
  }

  const images = req.files.moodboardImages.map(file => ({
    id: file.filename,
    title: file.originalname,
    url: `/uploads/${file.filename}`,
    perSqValue: file.perSqValue !== "" && !isNaN(file.perSqValue) ? Number(file.perSqValue) : 0
  }));

  const gallery = await TypeGallery.findOneAndUpdate(
    { type: typeId },
    {
      type: typeId,
      $push: { moodboardImages: { $each: images } },
    },
    { new: true, upsert: true }
  );

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Moodboard images added',
    gallery,
  });
});

// Questions 
exports.addMoodboardQuestions = asyncHandler(async (req, res) => {
  const { typeId } = req.params;
  const { question, questionType = "text", options = [] } = req.body;
  console.log("reqdbbbbbbbbbbbbbbbbbbbbbbbbbbooooooooo", req.body);
  // 1️⃣ Create question first
  const questionDoc = await TypeQuestion.create({
    type: typeId,
    question,
    questionType,
    areaQuestion: req.body.areaQuestion || false,
    valueType: req.body.valueType || "number",
    valueSubType: req.body.valueSubType || "persqft"
  });

  // 2️⃣ If question type is OPTIONS → create options
  let optionsGenerated = [];
  if (questionType === "options" || questionType === "yesorno") {
    if (!options.length) {
      return res.status(400).json({
        success: false,
        message: "Options are required for this type question"
      });
    }

    const optionDocs = options.map((opt, index) => ({
      question: questionDoc._id,
      title: opt.title,
      order: opt.order ?? index,
      includeInEstimate: opt.includeInEstimate || true,
      valueType: opt.valueType || "percentage",
      valueSubType: opt.valueSubType || "persqft",
      value: opt.value && !isNaN(opt.value) ? Number(opt.value) : 0
    }));

    optionsGenerated = await TypeQuestionOption.insertMany(optionDocs);
  }

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Question added successfully",
    data: optionsGenerated && optionsGenerated.length > 0 ? { ...questionDoc.toObject(), optionsGenerated } : questionDoc
  });
});

exports.getMoodboardQuestions = asyncHandler(async (req, res) => {
  const { typeId } = req.params;

  let allQuestions = await TypeQuestion.find({ type: typeId });
  allQuestions = await Promise.all(allQuestions.map(async (ques) => {
    let options = [];
    options = await TypeQuestionOption.find({ question: ques._id });
    return { ...ques, options }
  }))
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Question added successfully",
    data: allQuestions
  });
});

exports.getSingleMoodboardQuestionById = asyncHandler(async (req, res) => {
  const { typeId, questionId } = req.params;
  // const { questionId } = req.query;

  let question = await TypeQuestion.findOne({ type: typeId, _id: questionId }).lean();

  if (!question) {
    return res.status(StatusCodes.NOT_FOUND).json({
      success: false,
      message: "Question not found"
    });
  }

  // allQuestions = await Promise.all( allQuestions.map(async(ques)=>{
  //   let options = [];
  //   options = await TypeQuestionOption.find({question:ques._id});
  //   return {...ques,options}
  // }))

  let options = await TypeQuestionOption.find({ question: question._id });

  question = { ...question, options };
  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Question fetched successfully",
    data: question
  });
});


exports.editMoodboardQuestionById = asyncHandler(async (req, res) => {
  const { typeId, questionId } = req.params;
  const { question, questionType = "text", options = [] } = req.body;
  const { _id, ...updateData } = req.body;
  console.log("reqdbbbbbbbbbbbbbbbbbbbbbbbbbbooooooooo", req.body);

  let questionDoc = {}
  if (req.body) {
    questionDoc = await TypeQuestion.findOneAndUpdate({ _id: questionId }, updateData, { new: true });
  }

  let optionsGenerated = [];
  if (req.body.options) {
    if (questionType === "options" || questionType === "yesorno") {
      optionsGenerated = await Promise.all(
        options.map(async (opt, index) => {
          const option = {
            // question: questionDoc._id,
            title: opt.title,
            order: opt.order ?? index,
            includeInEstimate: opt.includeInEstimate ?? true,
            valueType: opt.valueType || "percentage",
            valueSubType: opt.valueSubType || "persqft",
            value: !isNaN(opt.value) ? Number(opt.value) : 0
          };

          return TypeQuestionOption.findByIdAndUpdate(
            opt._id,
            option, { new: true }
          );

          // if (opt._id) {
          //   // UPDATE existing option
          //   return TypeQuestionOption.updateOne(
          //     { _id: opt._id },
          //     { $set: option }
          //   );
          // } else {
          //   // CREATE new option
          //   return TypeQuestionOption.create(option);
          // }
        })
      );
    }
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Question Edited successfully",
    data: optionsGenerated && optionsGenerated.length > 0 ? { ...questionDoc.toObject(), optionsGenerated } : questionDoc
  });
});



exports.deleteMoodboardQuestions = asyncHandler(async (req, res) => {
  const { typeId } = req.params;
  const { question_id } = req.body
  console.log("typeId and question_id", typeId, question_id)
  const data = await TypeQuestion.deleteOne(
    {
      type: typeId,
      _id: question_id,
    }
  );

  await TypeQuestionOption.deleteMany({
    question: question_id
  })

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'Moodboard Question deleted',
    data: null,
  });
});

exports.updateImageTitle = asyncHandler(async (req, res) => {
  const { typeId } = req.params;
  const { imageId, title, type } = req.body;

  if (!imageId || !title || !type) {
    throw new APIError('Missing fields', StatusCodes.BAD_REQUEST);
  }

  let update;

  if (type === 'preview') {
    update = {
      $set: { 'previewImage.title': title },
    };
  } else {
    update = {
      $set: { 'moodboardImages.$[img].title': title },
    };
  }

  const gallery = await TypeGallery.findOneAndUpdate(
    { type: typeId },
    update,
    {
      new: true,
      arrayFilters: type === 'moodboard'
        ? [{ 'img.id': imageId }]
        : [],
    }
  );

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Image title updated',
    gallery,
  });
});

exports.deleteMoodboardImage = asyncHandler(async (req, res) => {
  const { typeId, imageId } = req.params;

  const gallery = await TypeGallery.findOneAndUpdate(
    { type: typeId },
    {
      $pull: { moodboardImages: { id: imageId } },
    },
    { new: true }
  );

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Moodboard image deleted',
    gallery,
  });
});

exports.deletePreviewImage = asyncHandler(async (req, res) => {
  const { typeId } = req.params;

  const gallery = await TypeGallery.findOneAndUpdate(
    { type: typeId },
    { $unset: { previewImage: "" } },
    { new: true }
  );

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Preview image deleted',
    gallery,
  });
});

exports.getGalleryByTypeId = asyncHandler(async (req, res) => {
  const { typeId } = req.params;

  const gallery = await TypeGallery.findOne({ type: typeId }).populate('type');
  if (!gallery) {
    return res.status(StatusCodes.OK).json({
      success: true,
      gallery: null
    });
  }


  res.status(StatusCodes.OK).json({
    success: true,
    gallery,
  });
});

exports.getQuestionByTypeId = asyncHandler(async (req, res) => {
  const { typeId } = req.params;

  let data = await TypeQuestion.find({ type: typeId }).populate('type').lean();
  if (!data) {
    return res.status(StatusCodes.OK).json({
      success: true,
      data: null
    });
  }


  if (data) {
    data = await Promise.all(data.map(async (obj) => {
      if (data.questionType !== "text") {
        let options = await TypeQuestionOption.find({ question: obj._id });
        return { ...obj, options }
      } else {
        return { ...obj, options: [] }
      }
    }))
  }


  res.status(StatusCodes.OK).json({
    success: true,
    data,
  });
});



exports.generateMoodboard = asyncHandler(async (req, res) => {
  const { typeId } = req.params;

  const gallery = await TypeGallery.findOne({ type: typeId });

  if (!gallery || !gallery.moodboardImages.length) {
    throw new APIError(
      'No moodboard images found for this type',
      StatusCodes.NOT_FOUND
    );
  }

  // ✅ ONLY SHUFFLE ORDER
  const shuffledMoodboard = shuffleArray(gallery.moodboardImages);

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Moodboard generated (order shuffled)',
    totalImages: shuffledMoodboard.length,
    moodboard: shuffledMoodboard,
  });
});


