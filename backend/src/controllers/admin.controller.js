export const createAdminController = ({ indexing }) => ({
  reindex: async (_req, res) => {
    res.json(await indexing.reindexMissing());
  },
});
