const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

// POST /api/custom-request
// Body: { fullName, email, destination, dates, groupSize, notes? }
router.post('/', async (req, res) => {
  const { fullName, email, destination, dates, groupSize, notes } = req.body;

  if (!fullName || !email || !destination || !dates || groupSize == null) {
    return res.status(400).json({
      error: 'fullName, email, destination, dates and groupSize are required',
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const request = await prisma.customRequest.create({
      data: {
        fullName,
        email,
        destination,
        dates,
        groupSize: parseInt(groupSize, 10),
        notes: notes || null,
      },
    });
    res.status(201).json(request);
  } catch (err) {
    console.error('[POST /custom-request]', err.message);
    res.status(500).json({ error: 'Failed to save request' });
  }
});

module.exports = router;
