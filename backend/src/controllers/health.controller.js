export const createHealthController = ({ health }) => ({
  check: async (_req, res) => {
    const result = await health.check();
    res.status(result.status === 'error' ? 503 : 200).json(result);
  },
});
