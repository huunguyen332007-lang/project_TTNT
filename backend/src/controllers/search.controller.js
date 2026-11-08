import { HttpError, ErrorCodes } from '../utils/http-error.js';

export const createSearchController = ({ search }) => ({
  text: async (req, res) => {
    const { query, category, limit } = req.valid.body;
    res.json(await search.searchText({ query, category, limit, clientId: req.clientId }));
  },
  image: async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'Vui lòng chọn một ảnh để tìm kiếm', { code: ErrorCodes.INVALID_IMAGE });
    }
    const { category, limit } = req.valid.body;
    res.json(await search.searchImage({ file: req.file, category, limit, clientId: req.clientId }));
  },
});
