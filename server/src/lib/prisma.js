const { PrismaClient } = require('../generated/prisma');

// Single shared instance — prevents multiple connections in dev hot-reload
const prisma = global.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
