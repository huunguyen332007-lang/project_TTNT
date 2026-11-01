export const createRecommendationController = ({ recommendations }) => ({
  forMe: async (req, res) => {
    res.json(await recommendations.forClient({ clientId: req.clientId, limit: req.valid.query.limit }));
  },
});
