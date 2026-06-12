const Joi = require('joi');
const appConfig = require('../config/appConfig');
const configService = require('../services/configService');
const authService = require('../services/authService');

const nigerianPhone = Joi.string()
  .required()
  .custom((value, helpers) => {
    const normalised = authService.normalisePhone(value);
    if (!normalised) return helpers.error('any.invalid');
    return normalised;
  })
  .messages({ 'any.invalid': 'Enter a valid Nigerian number (e.g. 08031234567)' });

const otpCode = Joi.string()
  .required()
  .custom((value, helpers) => {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length !== 6) return helpers.error('any.invalid');
    return digits;
  })
  .messages({ 'any.invalid': 'OTP must be 6 digits' });

let schemaCache = null;
const defaultIncidentTypes = appConfig.incidentTypes.length
  ? appConfig.incidentTypes
  : ['kidnapping', 'armed_robbery', 'banditry', 'terror', 'roadblock', 'suspicious'];
const STATIC_SCHEMA_NAMES = new Set([
  'requestOTP',
  'verifyOTP',
  'updateProfile',
  'updatePreferences',
  'createCheckIn',
  'responderProfile',
  'createConvoy',
  'endJourney',
  'createGroup',
  'applyLeader',
  'registerAgent',
  'registerSchool',
  'registerEstate',
  'joinEstate',
  'schoolCheckIn',
  'leaderEndorseZone',
  'reportFalseZone',
  'updateCircle',
  'updateLocation',
  'activatePanic',
  'updateMedicalIce',
  'ussd',
]);

function buildSchemas(incidentTypes = defaultIncidentTypes) {
  return {
    requestOTP: Joi.object({ phone: nigerianPhone }),
    verifyOTP: Joi.object({
      phone: nigerianPhone,
      otp: otpCode,
      otp_token: Joi.string().max(2048).optional(),
    }),
    createZone: Joi.object({
      lat: Joi.number().min(4.0).max(14.0).required(),
      lng: Joi.number().min(2.7).max(15.0).required(),
      type: Joi.string().valid(...incidentTypes).required(),
      description: Joi.string().max(500).optional().allow(''),
      device_id: Joi.string().min(8).max(128).required(),
    }),
    updateProfile: Joi.object({
      display_name: Joi.string().max(50).optional(),
      state: Joi.string().max(50).optional(),
      lga: Joi.string().max(50).optional(),
    }),
    updatePreferences: Joi.object({
      help_nearby_enabled: Joi.boolean().optional(),
      help_nearby_radius_km: Joi.number().min(1).max(15).optional(),
      notifications_enabled: Joi.boolean().optional(),
      estate_watch_enabled: Joi.boolean().optional(),
      night_mode: Joi.boolean().optional(),
      women_mode: Joi.boolean().optional(),
      women_prefer_female_helpers: Joi.boolean().optional(),
      women_checkin_nudge: Joi.boolean().optional(),
      women_responder_opt_in: Joi.boolean().optional(),
      language: Joi.string().valid('en', 'ha', 'yo', 'ig', 'pcm').optional(),
      data_saver: Joi.boolean().optional(),
    }),
    createCheckIn: Joi.object({
      due_at: Joi.string().isoDate().optional(),
      notify_circle: Joi.boolean().optional(),
      note: Joi.string().max(200).optional(),
    }),
    responderProfile: Joi.object({
      skills: Joi.array()
        .items(
          Joi.string().valid(
            'first_aid',
            'escort',
            'mechanic',
            'driver',
            'security',
            'translator'
          )
        )
        .max(6)
        .optional(),
      available: Joi.boolean().optional(),
    }),
    createConvoy: Joi.object({
      member_ids: Joi.array().items(Joi.string().max(64)).max(9).optional(),
      title: Joi.string().max(80).optional(),
    }),
    endJourney: Joi.object({
      from: Joi.string().min(2).max(60).optional(),
      to: Joi.string().min(2).max(60).optional(),
      via: Joi.string().max(120).optional().allow(''),
      safety_rating: Joi.number().integer().min(1).max(5).optional(),
    }),
    createGroup: Joi.object({
      name: Joi.string().min(2).max(80).required(),
      geofence_center: Joi.object({
        lat: Joi.number().min(4).max(14).required(),
        lng: Joi.number().min(2.7).max(15).required(),
      }).required(),
      geofence_radius_km: Joi.number().min(1).max(50).default(5),
    }),
    registerEstate: Joi.object({
      name: Joi.string().min(2).max(100).required(),
      type: Joi.string().valid('estate', 'area', 'street', 'market').default('estate'),
      state: Joi.string().max(60).optional().allow(''),
      lga: Joi.string().max(60).optional().allow(''),
      lat: Joi.number().min(4).max(14).required(),
      lng: Joi.number().min(2.7).max(15).required(),
      radius_km: Joi.number().min(0.5).max(15).optional(),
    }),
    joinEstate: Joi.object({
      join_code: Joi.string().min(4).max(12).optional(),
      estate_id: Joi.string().max(80).optional(),
    }).or('join_code', 'estate_id'),
    applyLeader: Joi.object({
      role: Joi.string()
        .valid(
          'village_head',
          'union_chair',
          'market_leader',
          'vigilante_captain',
          'religious_leader',
          'student_security',
          'ngo_partner',
          'radio_partner'
        )
        .required(),
      org_name: Joi.string().min(2).max(120).required(),
      state: Joi.string().min(2).max(60).required(),
      lga: Joi.string().max(60).optional().allow(''),
      ward: Joi.string().max(60).optional().allow(''),
      phone: Joi.string().max(20).optional().allow(''),
    }),
    registerAgent: Joi.object({
      display_name: Joi.string().min(2).max(80).required(),
      state: Joi.string().min(2).max(60).required(),
      lga: Joi.string().max(60).optional().allow(''),
      ward: Joi.string().max(60).optional().allow(''),
      phone: Joi.string().max(20).optional().allow(''),
      can_read_aloud: Joi.boolean().optional(),
    }),
    registerSchool: Joi.object({
      name: Joi.string().min(2).max(120).required(),
      lat: Joi.number().min(4).max(14).required(),
      lng: Joi.number().min(2.7).max(15).required(),
      state: Joi.string().min(2).max(60).required(),
      lga: Joi.string().max(60).optional().allow(''),
      radius_km: Joi.number().min(1).max(15).optional(),
    }),
    schoolCheckIn: Joi.object({
      student_ref: Joi.string().max(40).optional(),
      status: Joi.string().valid('arrived', 'absent').optional(),
    }),
    leaderEndorseZone: Joi.object({
      zone_id: Joi.string().min(4).max(80).required(),
    }),
    reportFalseZone: Joi.object({
      device_id: Joi.string().min(8).max(128).required(),
      reason: Joi.string().max(300).optional(),
    }),
    updateCircle: Joi.object({
      circle: Joi.array()
        .max(5)
        .items(
          Joi.object({
            name: Joi.string().max(50).required(),
            phone: nigerianPhone,
            relation: Joi.string().max(30).required(),
          })
        )
        .required(),
    }),
    updateLocation: Joi.object({
      lat: Joi.number().min(4.0).max(14.0).required(),
      lng: Joi.number().min(2.7).max(15.0).required(),
      accuracy: Joi.number().min(0).optional(),
      journey_active: Joi.boolean().optional(),
      panic_active: Joi.boolean().optional(),
    }),
    activatePanic: Joi.object({
      lat: Joi.number().min(4.0).max(14.0).required(),
      lng: Joi.number().min(2.7).max(15.0).required(),
      reason: Joi.string().valid('medical', 'road_accident', 'security', 'other').optional(),
      message: Joi.string().max(300).optional(),
    }),
    updateMedicalIce: Joi.object({
      blood_group: Joi.string().max(10).optional().allow(''),
      allergies: Joi.string().max(500).optional().allow(''),
      conditions: Joi.string().max(500).optional().allow(''),
      ice_name: Joi.string().max(80).optional().allow(''),
      ice_phone: Joi.string().max(20).optional().allow(''),
    }),
    ussd: Joi.object({
      sessionId: Joi.string().required(),
      serviceCode: Joi.string().required(),
      phoneNumber: Joi.string().required(),
      text: Joi.string().allow('').required(),
    }),
  };
}

const staticSchemas = buildSchemas(defaultIncidentTypes);

async function getSchemas() {
  if (!schemaCache) {
    let incidentTypes = defaultIncidentTypes;
    try {
      incidentTypes = await configService.getIncidentTypes();
    } catch {
      /* keep env/default incident types so auth routes never block on Firestore */
    }
    schemaCache = buildSchemas(incidentTypes);
  }
  return schemaCache;
}

function invalidateSchemaCache() {
  schemaCache = null;
}

function validate(schemaName) {
  return async (req, res, next) => {
    try {
      const schema = STATIC_SCHEMA_NAMES.has(schemaName)
        ? staticSchemas[schemaName]
        : (await getSchemas())[schemaName];
      if (!schema) {
        return res.status(500).json({ error: `Unknown validation schema: ${schemaName}` });
      }
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        const messages = error.details.map((d) => d.message);
        return res.status(400).json({ error: 'Validation failed', messages });
      }
      req.body = value;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { validate, invalidateSchemaCache, getSchemas };
