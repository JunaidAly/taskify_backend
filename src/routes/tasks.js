const express = require('express');
const multer = require('multer');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Task = require('../models/Task');
const auth = require('../middleware/auth');

const router = express.Router();

const ALLOWED_IMPORT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt'];
const MAX_IMPORT_TASKS = 200;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMPORT_EXTENSIONS.includes(ext)) {
      const err = new Error('Unsupported file type. Please upload a PDF, DOC/DOCX, or TXT file.');
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

// Splits document text into task titles, stripping common bullet/numbering markers
function extractTaskLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•‣▪]|\[\s?[xX]?\s?\]|\d+[.)]|[a-zA-Z][.)])\s+/, '').trim())
    .filter((line) => line.length > 0 && !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line))
    .slice(0, MAX_IMPORT_TASKS);
}

// All task routes require authentication
router.use(auth);

// List tasks with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, dueFrom, dueTo } = req.query;
    const query = { user: req.user.id };
    if (status) {
      query.status = status;
    }
    if (dueFrom || dueTo) {
      query.dueDate = {};
      if (dueFrom) query.dueDate.$gte = new Date(dueFrom);
      if (dueTo) query.dueDate.$lte = new Date(dueTo);
    }

    const tasks = await Task.find(query).sort({ status: 1, order: 1, dueDate: 1, createdAt: 1 });
    res.json({ tasks });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create task
router.post('/', async (req, res) => {
  try {
    const { title, description, dueDate, status } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });
    const normalizedStatus = status || 'pending';

    // Determine next order value within the status for the user
    const last = await Task.findOne({ user: req.user.id, status: normalizedStatus })
      .sort({ order: -1 })
      .select('order');
    const nextOrder = last ? last.order + 1 : 0;

    const task = await Task.create({
      user: req.user.id,
      title,
      description: description || '',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      status: normalizedStatus,
      order: nextOrder,
    });
    res.status(201).json({ task });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Import tasks from an uploaded PDF/DOC/DOCX/TXT document — each non-empty line becomes a task
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const { originalname, buffer } = req.file;
    const ext = path.extname(originalname).toLowerCase();
    let text = '';

    try {
      if (ext === '.pdf') {
        const data = await pdfParse(buffer);
        text = data.text;
      } else if (ext === '.docx' || ext === '.doc') {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else {
        text = buffer.toString('utf-8');
      }
    } catch (parseErr) {
      console.error('Document parse error:', parseErr);
      return res.status(400).json({
        message: 'Could not read this file. If it is a .doc file, try saving it as .docx and retry.',
      });
    }

    const lines = extractTaskLines(text);
    if (lines.length === 0) {
      return res.status(400).json({ message: 'No task lines were found in this document' });
    }

    const normalizedStatus = ['pending', 'in_progress', 'completed'].includes(req.body.status)
      ? req.body.status
      : 'pending';

    const last = await Task.findOne({ user: req.user.id, status: normalizedStatus })
      .sort({ order: -1 })
      .select('order');
    let nextOrder = last ? last.order + 1 : 0;

    const tasksToCreate = lines.map((title) => ({
      user: req.user.id,
      title: title.slice(0, 300),
      status: normalizedStatus,
      order: nextOrder++,
    }));

    const tasks = await Task.insertMany(tasksToCreate);
    res.status(201).json({ tasks, count: tasks.length });
  } catch (err) {
    console.error('Import tasks error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update task
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, dueDate, status } = req.body;
    const task = await Task.findOne({ _id: id, user: req.user.id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : undefined;
    if (status !== undefined) task.status = status;

    await task.save();
    res.json({ task });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark completed
router.patch('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findOne({ _id: id, user: req.user.id });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    task.status = 'completed';
    await task.save();
    res.json({ task });
  } catch (err) {
    console.error('Complete task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findOneAndDelete({ _id: id, user: req.user.id });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reorder tasks across columns
// Payload: { updates: [{ id, status, order }] }
router.patch('/reorder', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'Updates array is required' });
    }

    const userId = req.user.id;
    const ops = updates.map(({ id, status, order }) =>
      Task.updateOne({ _id: id, user: userId }, { $set: { status, order } })
    );
    await Promise.all(ops);

    const tasks = await Task.find({ user: userId }).sort({ status: 1, order: 1 });
    res.json({ tasks });
  } catch (err) {
    console.error('Reorder error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;