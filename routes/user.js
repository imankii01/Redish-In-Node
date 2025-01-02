const express = require('express');
const router = express.Router();
const User = require('../models/user');
const redis = require('redis');
const Joi = require('joi');

// Create a Redis client
const client = redis.createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});

// Connect Redis client
client.connect()
    .then(() => console.log('Connected to Redis'))
    .catch((err) => console.error('Redis connection error:', err));

// Schema validation for user input
const userSchema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
});

// Middleware to check Redis cache
async function checkCache(req, res, next) {
    const key = 'users';
    try {
        const data = await client.get(key);
        if (data) {
            console.log('Cache hit');
            return res.json(JSON.parse(data));
        }
        console.log('Cache miss');
        next();
    } catch (err) {
        console.error('Error checking Redis cache:', err);
        res.status(500).json({ error: 'Internal server error', details: 'Cache check failed' });
    }
}

// API to create a new user
router.post('/', async (req, res) => {
    try {
        // Validate user input
        const { error, value } = userSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: 'Invalid input', details: error.details.map(e => e.message) });
        }

        const { name, email } = value;

        // Save user to the database
        const user = new User({ name, email });
        await user.save();

        // Clear Redis cache after adding a new user
        try {
            await client.del('users');
            console.log('Redis cache cleared');
        } catch (err) {
            console.error('Error clearing Redis cache:', err);
        }

        res.status(201).json({ message: 'User created successfully', user });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

// API to fetch all users with caching
router.get('/', checkCache, async (req, res) => {
    try {
        // Fetch users from the database
        const users = await User.find();

        // Store result in Redis cache for 1 hour
        try {
            await client.setEx('users', 3600, JSON.stringify(users));
            console.log('Users cached in Redis');
        } catch (err) {
            console.error('Error saving to Redis cache:', err);
        }

        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

module.exports = router;
