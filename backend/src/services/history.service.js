export class HistoryService {
  constructor({ history }) {
    this.history = history;
  }

  async recent(clientId, { limit = 10 } = {}) {
    if (!clientId) return [];
    return this.history.recent(clientId, { limit });
  }

  async clear(clientId) {
    if (clientId) await this.history.clear(clientId);
  }
}
