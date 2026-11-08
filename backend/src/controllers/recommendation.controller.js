export const createRecommendationController = ({ recommendations, recommend }) => ({
  forMe: async (req, res) => {
    res.json(await recommendations.forClient({ clientId: req.clientId, limit: req.valid.query.limit }));
  },
  personalized: async (req, res) => {
    res.json(await recommend.recommend({ ...req.valid.body, ...(req.clientId ? { clientId: req.clientId } : {}) }));
  },
});
