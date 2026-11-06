export const createProductController = ({ products, recommendations }) => ({
  list: async (req, res) => {
    res.json(await products.list(req.valid.query));
  },
  get: async (req, res) => {
    res.json({ item: await products.get(req.valid.params.id) });
  },
  similar: async (req, res) => {
    const items = await recommendations.similarTo(req.valid.params.id, { limit: req.valid.query.limit });
    res.json({ items });
  },
  categories: async (_req, res) => {
    res.json({ items: await products.categories() });
  },
  create: async (req, res) => {
    res.status(201).json(await products.create(req.valid.body));
  },
  remove: async (req, res) => {
    await products.remove(req.valid.params.id);
    res.status(204).end();
  },
});
