export const createHistoryController = ({ history }) => ({
  recent: async (req, res) => {
    res.json({ items: await history.recent(req.clientId, { limit: req.valid.query.limit }) });
  },
  clear: async (req, res) => {
    await history.clear(req.clientId);
    res.status(204).end();
  },
});
