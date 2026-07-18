// =============================================================================
// AUTH ROUTES
// =============================================================================
//
// Handles user registration and login.
// 
// Mid-level focus:
// - Use Zod for validation
// - Thin routes — delegate to service
// - JWT for auth (common in startups)
// - Never return password hashes
// =============================================================================

import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../services/authService';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.registerUser(data);

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      token: result.token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    res.status(400).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.loginUser(data);

    res.json({
      message: 'Login successful',
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      token: result.token,
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

export default router;
