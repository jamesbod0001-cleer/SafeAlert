const Joi = require('joi');

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const messages = error.details.map(d => d.message);
      return res.status(400).json({ error: 'Validation failed', messages });
    }
    req.body = value;
    next();
  };
}

// ── SCHEMAS ──────────────────────────────────────────────────────────────────

const schemas = {
  sendOTP: Joi.object({
    phone: Joi.string().pattern(/^\+234[0-9]{10}$/).required()
      .messages({ 'string.pattern.base': 'Phone must be Nigerian format: +234XXXXXXXXXX' }),
  }),

  confirmOTP: Joi.object({
    phone: Joi.string().pattern(/^\+234[0-9]{10}$/).required(),
    otp: Joi.string().length(6).pattern(/^[0-9]+$/).required(),
    device_id: Joi.string().min(8).max(128).required(),
  }),

  createZone: Joi.object({
    lat: Joi.number().min(4.0).max(14.0).required(),
    lng: Joi.number().min(2.7).max(15.0).required(),
    type: Joi.string().valid(
      'kidnapping', 'armed_robbery', 'banditry', 'terror', 'roadblock', 'suspicious'
    ).required(),
    description: Joi.string().max(500).optional().allow(''),
    accuracy: Joi.number().min(0).max(5000).optional(),
  }),

  updateLocation: Joi.object({
    lat: Joi.number().min(4.0).max(14.0).required(),
    lng: Joi.number().min(2.7).max(15.0).required(),
    accuracy: Joi.number().min(0).optional(),
    journey_active: Joi.boolean().optional(),
    panic_active: Joi.boolean().optional(),
  }),

  updateCircle: Joi.object({
    circle: Joi.array().max(5).items(Joi.object({
      name: Joi.string().max(50).required(),
      phone: Joi.string().pattern(/^\+234[0-9]{10}$/).required(),
      relation: Joi.string().max(30).required(),
    })).required(),
  }),

  ussd: Joi.object({
    sessionId: Joi.string().required(),
    serviceCode: Joi.string().required(),
    phoneNumber: Joi.string().required(),
    text: Joi.string().allow('').required(),
  }),
};

module.exports = { validate, schemas };
