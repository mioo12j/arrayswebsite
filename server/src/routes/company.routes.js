import { Router } from 'express';
import { company } from '../config/company.js';

const router = Router();

// Public company profile (used by the login + About screens).
router.get('/', (_req, res) => res.json(company));

export default router;
