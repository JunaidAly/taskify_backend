const express = require('express');
const Task = require('../models/Task');
const auth = require('../middleware/auth');

const router = express.Router();

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